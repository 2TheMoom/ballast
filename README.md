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

Also deployed on **Studionet**, the hosted Studio network (chain 61999), from the same `ballast.py`; see [Studionet](#studionet) below.

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

## Studionet

The same `contracts/ballast.py`, byte for byte, is deployed on Studionet (chain ID 61999), checked by `NETWORK=studionet node scripts/verify-deployed.mjs` (output in `scripts/verify-deployed-studionet.txt`; the Bradbury check is `scripts/verify-deployed.txt`).

| Contract | Address |
|---|---|
| Ballast | [`0x4477105a01b7ddbCc449837Ec8Ed9900EbFD2a08`](https://explorer-studio.genlayer.com/address/0x4477105a01b7ddbCc449837Ec8Ed9900EbFD2a08) |
| GateExample (Studionet variant), pinned to the `e2e-studio2-covered` monitor | [`0x3d08946DCFd168335eFFf530862B1998aDD8C0E6`](https://explorer-studio.genlayer.com/address/0x3d08946DCFd168335eFFf530862B1998aDD8C0E6) |

**One difference, and why.** Studio cannot answer a contract-to-contract read of finalized state (the call never returns), so the GateExample there is [`contracts/gate_example_studio.py`](contracts/gate_example_studio.py), which reads Ballast's latest state instead. A test (`tests/direct/test_gate_example_studio.py`) pins the two files to differ only in that read and in the words that said "finalized". GateExample holds no value, so nothing a consumer could lose depends on it, but a real consumer that must act only on final data should do that on a network where the finalized read works, as [`contracts/gate_example.py`](contracts/gate_example.py) does on Bradbury. Ballast itself reads only the web, never another contract, so it is unchanged.

### Live evidence (Studionet, run `studio2`, 2026-10-22)

Same script, same five scenarios, same wallets and real Ethereum and Base data; every row is read back from the chain and the script fails the run if it is not exactly as expected (`NETWORK=studionet BALLAST=0x4477... RUN=studio2 node scripts/e2e.mjs`).

| Scenario | Result |
|---|---|
| covered | 100.00% at Ethereum block 26,247,076; the gate acted (1 time) |
| strict | 100.00%, recorded short; the gate refused: "The latest attestation shows the reserves are short" |
| challenge | gate refused as disputed; attestation 2 read the probe (92,585,186.05 ETH, shown and not counted); challenge cleared by attestation 2 |
| two chains | 112.78%; Ethereum block 26,247,073, Base block 52,934,938 |
| ERC-20 reserve | 124.68% (stETH held by wstETH against the wstETH supply) |

Studio finalizes in under a minute, so every attestation and the challenge reached FINALIZED 0.4 to 0.8 minutes after the wait began, against about 30 minutes on Bradbury. The 10 minute cooldown between a challenge and the next attestation is a rule of the contract and is the same on both networks. On Studionet a refused call's reason is not in the simulation error (it says only "execution failed"); the script reads it from the refused transaction's receipt. The full event log, with every transaction hash, is in `scripts/e2e-log-studio2.json`.

The app can be built for either network (`NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999` for Studionet; the live app on Vercel is the Bradbury build).

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

## Live run in a real MetaMask

The deployed app (https://ballast-frontend.vercel.app) was driven with the real MetaMask extension and one account (`0x1a87...e5fb`), monitor `mm-weth-base-1`, against the contract above. The page was driven by a browser tool and every transaction was approved by hand in MetaMask's own window. This is the run a wallet-shim cannot replace: the connect dialog found MetaMask by wallet discovery, and every write showed the same progress notes under real approvals.

| # | Step | Transaction | What the page showed |
|---|---|---|---|
| 1 | Register the monitor | [`0xc0654babfc`](https://explorer-bradbury.genlayer.com/tx/0xc0654babfc42e586e373d82abb12d794c1a1c551fe3c41093bfe200bdee7c08d) | Registered `mm-weth-base-1`: WETH on Base, liability the same token's supply. The browser test read had shown exactly 100.00% first. |
| 2 | First attestation | [`0xa99f078ec3`](https://explorer-bradbury.genlayer.com/tx/0xa99f078ec38dd0d166208a4c524dd45fcb5cb7401a66469859bffb6de919a919) | Covered: reserves 286.02K against liabilities 286.02K, 100.00% at Base block 52,819,225. |
| 3 | Add a reserve address | [`0xb1fb6402f8`](https://explorer-bradbury.genlayer.com/tx/0xb1fb6402f8946a289bfcea4354fb801ffb9af845f82e0da8d172c775275f5ab8) | Added `OP message passer` (Base `0x4200...0016`). |
| 4 | Schedule its removal | [`0x413327abe7`](https://explorer-bradbury.genlayer.com/tx/0x413327abe7033a2ab0f07dc6d64244238a372331fb884d968f806b0bed6121cb) | The row showed "Removal in 23 h 44 min". |
| 5 | Cancel the removal | [`0xa87bc6f755`](https://explorer-bradbury.genlayer.com/tx/0xa87bc6f755bdc7ff919d8df2938b7509c17c2b959b19265a4bd7f31ec38c03b2) | The countdown cleared and both rows offered Schedule removal again. |
| 6 | Challenge the attestation | [`0x9da0b01639`](https://explorer-bradbury.genlayer.com/tx/0x9da0b01639f49a46577cb484339f990f4948c811e7be1e3a8b062b3b36dd155e) | "A reserve address is missing", probe `0x4200...0010` on Base. The monitor read Disputed. |
| 7 | Second attestation | [`0x4c1a931c67`](https://explorer-bradbury.genlayer.com/tx/0x4c1a931c679d634b10d15705efc478fb9a3ab4c3701bd7125ae56ff78b4d676a) | The dispute cleared, the monitor read Covered, and the probe was shown and not counted. |

Read straight from the chain afterwards, every one of the seven transactions is `FINALIZED` with `AGREE` and `FINISHED_WITH_RETURN`, and the contract's own answer is the page's answer:

- `get_latest`: covered, not disputed, sequence 2, ratio 24,132 bps (241.32%). The ratio rose from 100.00% because the added address holds ETH, which counts from the next attestation, as the form says.
- `get_monitor`: two reserve addresses, no pending removal (the cancelled one is gone), one challenge in total, none open, version 2.
- The full machine-readable result is `scripts/ui-mm/result.json`, written by `scripts/mm-finality.mjs`.

What it found: no bug in the app. What it did show is how slow validators can be. The schedule-removal transaction sat in `PROPOSING` and then `COMMITTING` for about twelve minutes before it was accepted, and the app kept saying "Accepted by validators" was still to come, which was true. The next write waited its turn behind it because this contract's transactions are processed in order.

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
