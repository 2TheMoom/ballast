# Ballast

On-chain proof of reserves for GenLayer. A monitor lists the addresses that hold the reserves and the token whose on-chain supply is
what is owed. Validators read every balance and the supply at pinned blocks through independent RPC providers, must see exactly the
same thing, and record an attestation anyone can verify, challenge, or require before they send money.

Live on **GenLayer Bradbury Testnet** (chain 4221). Two contracts, neither holds any value, neither has an owner. How it works, what it
cannot prove and the threats considered are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

| Contract | Address |
|---|---|
| Ballast | [`0xd1590EBBA44Cd2d00e003053811E47b9d2209668`](https://explorer-bradbury.genlayer.com/address/0xd1590EBBA44Cd2d00e003053811E47b9d2209668) |
| GateExample, pinned to the `e2e-v2-covered` monitor | [`0x31e3dB2757aEF9A882bB0642674c03952BA492EB`](https://explorer-bradbury.genlayer.com/address/0x31e3dB2757aEF9A882bB0642674c03952BA492EB) |

Live app: **https://ballast-frontend.vercel.app**

## What a reading looks like

Real data, read by Bradbury validators through three independent providers per chain:

- **WETH on Ethereum**: WETH9's `totalSupply()` is its own ETH balance, so a correct monitor must read exactly 100.00%. It does,
  accepted by the validators on the first attempt, with the block number and hash stored.
- **Two chains**: reserves on Ethereum and Base against one liability, each chain read at its own pinned block (112.97%).
- **ERC-20 reserves**: stETH held by the wstETH contract against the wstETH supply (124.66%, matching its exchange rate).

## Live evidence (Bradbury, run `v2`, 2026-10-18)

Ballast `0xd1590EBBA44Cd2d00e003053811E47b9d2209668`. Separate wallets for the registrant, the attester and the challenger. Real Ethereum and Base data, read by validators through three independent providers per chain. Every row below is read back from the chain by the script, which fails the run if it is not exactly as expected.

| Scenario | What was checked | Result |
|---|---|---|
| covered | WETH9's supply is its own ETH balance, so the ratio must be exactly 100.00%. Then a GateExample acts on it. | 100.00% at Ethereum block 26,222,789; the gate acted (1 time) |
| strict | The same data against a 101% floor. | 100.00%, recorded short; the gate refused: "The latest attestation shows the reserves are short" |
| challenge | A covered monitor is challenged with a probe address (the Beacon deposit contract). The gate must refuse as disputed, a newer attestation must show the probe and clear the challenge, and the gate must act again. | gate refused as disputed; attestation 2 read the probe (92,274,264.82 ETH, shown and not counted); challenge cleared by attestation 2; the gate acted again |
| two chains | Reserves on Ethereum and Base against one liability, each chain at its own pinned block. | 112.97%; Ethereum block 26,222,784, Base block 52,788,736 |
| ERC-20 reserve | stETH held by the wstETH contract against the wstETH supply. | 124.66%, matching the real stETH-per-wstETH rate |

Every attestation and the challenge reached FINALIZED, about 30 minutes after they were sent. Each gate action ran only after the attestation it relies on had finalized, because a consumer reads finalized state:

- covered: the attestation finalized 30.4 min after
- strict: the attestation finalized 30.1 min after
- challenge: attestation 1 finalized 30.1 min after; the challenge finalized 30.0 min after; attestation 2 finalized 29.9 min after
- twochains: the attestation finalized 30.1 min after
- erc20: the attestation finalized 29.9 min after

The full event log, with every transaction hash, is in `scripts/e2e-log-v2.json`.

## Live UI run

The real app, driven in headless Chrome through a wallet shim that signs with a dedicated Bradbury test wallet (`scripts/ui-run.mjs`; the shim lives outside the repo). Every click goes through the real interface and every transaction is a real transaction on Bradbury, monitor `ui-r5`. All 19 steps passed:

- the connect dialog opens
- connecting through the dialog shows the wallet address
- the register button is enabled for a valid form
- the browser test read shows 100.00%
- registering lands on the new monitor page
- first attestation: the Attest button is enabled
- first attestation: the attestation is recorded
- first attestation: the page shows attestation #1 at exactly 100.00%
- the registrant panel shows for the registrant
- adding a reserve address is recorded
- the new address is listed
- scheduling a removal is recorded
- the pending removal shows its countdown
- cancelling the removal is recorded
- the challenge dialog opens
- the challenge is recorded
- the monitor now reads Disputed
- the second attestation is recorded
- the dispute is cleared and the probe is shown, not counted

Screenshots of the run are in `scripts/ui-r5/`. The run also found a real bug that unit tests could not: the register page's browser test read each balance at its own block, so a moving token like WETH showed 99.99%. It now pins every read of a chain to one block, the way the validators do.

## Using a monitor from another contract

```python
r = gl.get_contract_at(BALLAST).view(state=StorageType.LATEST_FINAL).get_latest("my-monitor")
# {exists, covered, disputed, at, ratio_bps, seq, max_age}
```

Read finalized state and judge freshness on your own clock. [`contracts/gate_example.py`](contracts/gate_example.py) is the smallest
complete example: it acts only while the monitor is covered, fresh and undisputed, and says why when it refuses.

## What it cannot do

It cannot know about a reserve address nobody listed, it has no price feed (a reserve counts as one unit of the liability times a
fixed multiplier, so it suits wrapped and bridged tokens), and whoever registers a monitor chooses its address list, so consumers pin
the monitor id they trust. Liabilities come from on-chain supply only in this version.

## Run it

```bash
pip install -r requirements.txt
pytest tests/direct/                 # contract tests, a fake RPC world, no network

cd frontend && npm install && npm test && npx next build
```

Live scripts (Bradbury test wallets are kept outside the repo, see `scripts/lib.mjs`):

```bash
node scripts/deploy.mjs contracts/ballast.py
BALLAST=0x... RUN=v2 node scripts/e2e.mjs        # covered, strict, challenge, two chains, ERC-20
python scripts/mutate.py                          # break the contract one small way at a time, check the tests notice
```

## Layout

- `contracts/ballast.py`, `contracts/gate_example.py`
- `tests/direct/`: direct-mode tests, including the exact JSON-RPC requests and the validator function
- `frontend/`: Next.js app (landing, monitor registry, monitor page, register, challenge, wallet dialogs)
- `scripts/`: deploy, live end to end run, mutation check
- `docs/ARCHITECTURE.md`
