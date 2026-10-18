# Ballast: how it works

Ballast is an on-chain proof-of-reserves monitor for GenLayer. Two contracts, neither holds any value, neither has an owner.

- `contracts/ballast.py` records monitors and attestations.
- `contracts/gate_example.py` is the smallest possible consumer: it acts only while a Ballast monitor is covered, fresh and undisputed.

## A monitor

Registered by anyone. It stores:

- a name and the registrant's address
- up to 8 reserve rows: chain (Ethereum or Base), asset (native, or an ERC-20 address), holder address, label
- the liability: the chain and token whose on-chain `totalSupply()` is what is owed, and a fixed unit multiplier (default 1 to 1)
- a minimum ratio (between 50% and 300%) and how long an attestation stays valid (1 hour to 30 days)

The thresholds are immutable after registration. A registrant can add a reserve address at any time (it only strengthens the
monitor) and can schedule the removal of one, which only takes effect 24 hours later and is visible meanwhile. Anyone can apply a removal
once its timelock has passed.

## One attestation

`attest(monitor_id)` is permissionless, with a 10 minute cooldown after a success (a failure does not start one).

1. For each chain involved, the leader asks every configured provider for its head block and chain id. At least two must answer, with
   the right chain id. The pinned block is the lowest head minus a confirmation depth (32 on Ethereum, 120 on Base).
2. The leader reads, at that block and in one batched call per provider: the block hash, every reserve balance (`eth_getBalance`, or
   `balanceOf`), each token's `decimals()`, and the liability token's `totalSupply()`.
3. At least two providers must answer and **every** answering provider must return exactly the same block number, hash and values.
   One lying, stale or forked provider can therefore only make an attestation fail. It cannot make a false one.
4. Every validator repeats the read at the leader's pinned blocks and must see exactly the same thing. A validator also refuses a pinned
   block that is in the future or more than 900 blocks behind its own view of the head. A leader that reports "could not read" is only
   agreed with if the validator cannot read either.
5. After consensus the ratio is computed with integers: each reserve is scaled to the liability token's decimals and the unit
   multiplier, summed, and divided by the supply, in basis points, rounded down. `covered` means the ratio is at or above the floor.
6. The attestation stores the ratio, the totals, what each address held, the liability token's decimals, and the block number and hash per
   chain. The last 20 are kept.

Because the block is pinned, validators compare exactly and there is no tolerance to tune.

## The gate

`get_latest(monitor_id)` returns the small record another contract needs: whether it exists, covered, disputed, when it was attested,
the ratio, the sequence number and the monitor's own age limit. A consumer reads it from FINALIZED state
(`gl.get_contract_at(...).view(state=StorageType.LATEST_FINAL)`) and judges freshness with its own clock, as `GateExample` does.
A monitor deployment is not readable that way until it has itself finalized, about 30 minutes.

`is_covered(monitor_id, max_age)` is a convenience view for callers that do not need to judge freshness themselves.

## Challenges

Anyone can challenge the latest attestation. No bond. It stores a reason (one of four), an evidence link and a statement, and
optionally a probe address. The challenged attestation is marked disputed, so the gate says no. The next attestation reads the probe
address and shows its balance next to the result; the probe is never counted unless the registrant adds it as a reserve. **Any**
newer attestation clears every open challenge.

Bounds: one challenge per address per day, three open per monitor. The worst a griefer can do is force one re-attestation.

## What it cannot do

- It cannot know about a reserve address nobody listed, or a liability the token supply does not count. That is the point of the
  challenge and of showing every source.
- It has no price feed. A reserve counts as one unit of the liability, times a fixed multiplier. It suits wrapped and bridged tokens,
  not collateral that moves in price.
- Whoever registers a monitor chooses its address list. Registrants are not verified as the issuer, so consumers pin the monitor id
  they trust, and the app shows who registered each monitor.
- Liabilities come from on-chain supply only in this version. A published statement page as a liability source is planned.

## Threats considered

| Threat | What stops it |
|---|---|
| A flattering monitor registered by a third party | Consumers pin ids; the app shows the registrant and says it is not verified |
| Hiding a drained address by deleting it | 24 hour public timelock; old addresses stay in each attestation |
| One RPC provider lying or serving a fork | Two or more providers, exact agreement on block hash and values, chain id checked on every answer |
| A pinned block that nodes no longer serve | The attestation fails safely and records nothing |
| A leader that gives up, or invents a result | Validators re-read at the leader's pins and compare exactly; a give-up is only agreed with if they cannot read either |
| Spamming attestations | 10 minute cooldown after a success |
| Griefing with challenges | One per address per day, three open, any fresh attestation clears them, no money at stake |
| A consumer reading before finality | Consumers read finalized state; the gate example does |
| Rounding and zero supply | Integer math rounding down; a zero supply is refused |
| Reentrancy or value theft | The contracts hold no value |
| Unbounded storage | 8 reserves, 20 attestations, short text fields |

## Verification

- `tests/direct`: direct-mode tests with a fake RPC world in which each provider can answer correctly, lie, be down, sit on another
  chain or answer about another block. They also check the exact JSON-RPC requests and drive the validator function directly.
- `scripts/mutate.py`: breaks the contract one small way at a time and checks the tests notice.
- `scripts/e2e.mjs`: a live run on Bradbury against real Ethereum and Base data, with separate wallets (see the README for results).
