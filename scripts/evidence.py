"""Turns scripts/e2e-log-<RUN>.json into the README's live-evidence section.
    python scripts/evidence.py v2 > scripts/_evidence.md
"""

import json
import re
import sys

run = sys.argv[1] if len(sys.argv) > 1 else "v2"
log = json.load(open(f"scripts/e2e-log-{run}.json", encoding="utf-8"))
res, ev = log["results"], log["events"]


def pct(bps):
    return f"{bps / 100:.2f}%"


def finals(scn):
    out = []
    for e in ev:
        if e["scn"] == scn:
            m = re.match(r"(.*) FINALIZED ([\d.]+) min", e["msg"])
            if m:
                out.append(f"{m.group(1)} finalized {m.group(2)} min after")
    return out


def tx(scn, fn):
    return [e for e in ev if e["scn"] == scn and e.get("fn") == fn]


lines = []
lines.append(f"## Live evidence (Bradbury, run `{run}`, {log['started'][:10]})")
lines.append("")
lines.append(f"Ballast `{log['ballast']}`. Separate wallets for the registrant, the attester and the challenger. Real Ethereum and Base data, read by validators through three independent providers per chain. Every row below is read back from the chain by the script, which fails the run if it is not exactly as expected.")
lines.append("")
lines.append("| Scenario | What was checked | Result |")
lines.append("|---|---|---|")
if "covered" in res:
    r = res["covered"]
    lines.append(f"| covered | WETH9's supply is its own ETH balance, so the ratio must be exactly 100.00%. Then a GateExample acts on it. | {pct(r['ratio_bps'])} at Ethereum block {r['block']['number']:,}; the gate acted ({r['performed']} time) |")
if "strict" in res:
    r = res["strict"]
    lines.append(f"| strict | The same data against a 101% floor. | {pct(r['ratio_bps'])}, recorded short; the gate refused: \"{r['refusal']}\" |")
if "challenge" in res:
    r = res["challenge"]
    p = r["probe"]
    lines.append(f"| challenge | A covered monitor is challenged with a probe address (the Beacon deposit contract). The gate must refuse as disputed, a newer attestation must show the probe and clear the challenge, and the gate must act again. | gate refused as disputed; attestation 2 read the probe ({int(p['raw']) / 10**p['decimals']:,.2f} ETH, shown and not counted); challenge cleared by attestation {r['cleared_by']}; the gate acted again |")
if "twochains" in res:
    r = res["twochains"]
    lines.append(f"| two chains | Reserves on Ethereum and Base against one liability, each chain at its own pinned block. | {pct(r['ratio_bps'])}; Ethereum block {r['blocks']['ethereum']['number']:,}, Base block {r['blocks']['base']['number']:,} |")
if "erc20" in res:
    r = res["erc20"]
    lines.append(f"| ERC-20 reserve | stETH held by the wstETH contract against the wstETH supply. | {pct(r['ratio_bps'])}, matching the real stETH-per-wstETH rate |")
lines.append("")
lines.append("Every attestation and the challenge reached FINALIZED, about 30 minutes after they were sent. Each gate action ran only after the attestation it relies on had finalized, because a consumer reads finalized state:")
lines.append("")
for scn in ("covered", "strict", "challenge", "twochains", "erc20"):
    f = finals(scn)
    if f:
        lines.append(f"- {scn}: " + "; ".join(f))
lines.append("")
lines.append("The full event log, with every transaction hash, is in `scripts/e2e-log-" + run + ".json`.")
print("\n".join(lines))
