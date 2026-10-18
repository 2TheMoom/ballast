# Ballast

On-chain proof of reserves for GenLayer. A monitor lists the addresses that hold the reserves and the token whose on-chain supply is
what is owed. Validators read every balance and the supply at pinned blocks through independent RPC providers, must see exactly the
same thing, and record an attestation anyone can verify, challenge, or require before they send money.

Live on **GenLayer Bradbury Testnet** (chain 4221). Two contracts, neither holds any value, neither has an owner. How it works, what it
cannot prove and the threats considered are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

| Contract | Address |
|---|---|
| Ballast | [`0xd1590EBBA44Cd2d00e003053811E47b9d2209668`](https://explorer-bradbury.genlayer.com/address/0xd1590EBBA44Cd2d00e003053811E47b9d2209668) |
| GateExample (a consumer pinned to one monitor) | see the live run log in `scripts/` |

## What a reading looks like

Real data, read by Bradbury validators through three independent providers per chain:

- **WETH on Ethereum**: WETH9's `totalSupply()` is its own ETH balance, so a correct monitor must read exactly 100.00%. It does,
  accepted by the validators on the first attempt, with the block number and hash stored.
- **Two chains**: reserves on Ethereum and Base against one liability, each chain read at its own pinned block (112.97%).
- **ERC-20 reserves**: stETH held by the wstETH contract against the wstETH supply (124.66%, matching its exchange rate).

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
