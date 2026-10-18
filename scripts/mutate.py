"""Mutation check: break the contract one small way at a time and confirm the direct-mode tests notice.
    python scripts/mutate.py            (all)      MUT=cooldown,timelock python scripts/mutate.py   (some)
The contract file is restored afterwards, even on Ctrl+C."""

import os
import subprocess
import sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
py = os.environ.get("PY", sys.executable)
p = os.path.join(root, "contracts", "ballast.py")
orig = open(p, encoding="utf-8", newline="").read()
NL = "\r\n" if "\r\n" in orig else "\n"


def L(text):
    return "        " + text + "\n"


M = [
    # register
    ("id may be empty", "not isinstance(monitor_id, str) or not 0 < len(monitor_id) <= 64", "not isinstance(monitor_id, str) or len(monitor_id) > 64"),
    ("id limit off by one", "0 < len(monitor_id) <= 64", "0 < len(monitor_id) < 64"),
    ("id may be taken", L('_bad(monitor_id in self.monitors, "That monitor id is taken")'), ""),
    ("name may be empty", "not 0 < len(name) <= 60", "len(name) > 60"),
    ("name limit off by one", "0 < len(name) <= 60", "0 < len(name) < 60"),
    ("liability chain unchecked", L('_bad(liab_chain not in CHAINS, "Unsupported chain")'), ""),
    ("unit numerator unchecked", "not 1 <= unit_num <= 10**6 or not 1 <= unit_den <= 10**6", "not 1 <= unit_den <= 10**6"),
    ("unit denominator unchecked", "not 1 <= unit_num <= 10**6 or not 1 <= unit_den <= 10**6", "not 1 <= unit_num <= 10**6"),
    ("min ratio floor unchecked", "not 5000 <= min_ratio_bps <= 30000", "min_ratio_bps > 30000"),
    ("min ratio ceiling unchecked", "not 5000 <= min_ratio_bps <= 30000", "min_ratio_bps < 5000"),
    ("max age floor unchecked", "not 3600 <= max_age <= 30 * DAY", "max_age > 30 * DAY"),
    ("max age ceiling unchecked", "not 3600 <= max_age <= 30 * DAY", "max_age < 3600"),
    ("reserve count floor unchecked", "not 1 <= len(rows) <= MAX_RESERVES", "len(rows) > MAX_RESERVES"),
    ("reserve count ceiling unchecked", "not 1 <= len(rows) <= MAX_RESERVES", "len(rows) < 1"),
    ("duplicate reserves allowed", L('_bad(len({(r["chain"], r["asset"], r["holder"]) for r in rows}) != len(rows), "A reserve address is listed twice")'), ""),
    ("registrant not recorded", "name=name, registrant=gl.message.sender_address,", 'name=name, registrant=Address("0x" + "00" * 20),'),
    ("holder not normalized", '"holder": _h40(holder), "label": label}', '"holder": str(holder), "label": label}'),
    ("asset not normalized", 'a = asset if asset == "native" else _h40(asset)', "a = asset"),
    ("label unchecked", L('_bad(not isinstance(label, str) or len(label) > 40, "A label can be at most 40 characters")'), ""),
    ("address length unchecked", '_bad(len(s) != 40 or any(c not in "0123456789abcdef" for c in s)', '_bad(any(c not in "0123456789abcdef" for c in s)'),
    ("address hex unchecked", '_bad(len(s) != 40 or any(c not in "0123456789abcdef" for c in s)', "_bad(len(s) != 40"),
    ("reserve chain unchecked", L('_bad(chain not in CHAINS, "Unsupported chain")\n        a = asset').replace("        a = asset\n", ""), ""),
    ("liability token not normalized", "liab_token=_h40(liab_token)", "liab_token=str(liab_token)"),
    ("version starts at zero", "version=1, created_at=now", "version=0, created_at=now"),
    ("id not listed", L("self.ids.append(monitor_id)"), ""),
    # registrant changes
    ("anyone may change a monitor", '_bad(gl.message.sender_address != m.registrant, "Only the registrant can change this monitor")', '_bad(False, "Only the registrant can change this monitor")'),
    ("add accepts a ninth row", "len(rows) >= MAX_RESERVES", "len(rows) > MAX_RESERVES"),
    ("add accepts duplicates", L('_bad(any((r["chain"], r["asset"], r["holder"]) == (row["chain"], row["asset"], row["holder"]) for r in rows), "That address is already listed")'), ""),
    ("add forgets the row", L("rows.append(row)"), ""),
    ("add does not bump the version", "rows.append(row)\n        m.reserves = json.dumps(rows)\n        m.version = m.version + 1", "rows.append(row)\n        m.reserves = json.dumps(rows)"),
    ("removal of an unlisted address", L('_bad(not any((r["chain"], r["asset"], r["holder"]) == key for r in rows), "That address is not listed")'), ""),
    ("last reserve removable", L('_bad(len(rows) <= 1, "A monitor keeps at least one reserve address")'), ""),
    ("last reserve removable on apply", L('_bad(len(rows) < 1, "A monitor keeps at least one reserve address")'), ""),
    ("removal scheduled twice", L('_bad(any((p["chain"], p["asset"], p["holder"]) == key for p in pend), "That removal is already scheduled")'), ""),
    ("timelock too short", "TIMELOCK = 86400", "TIMELOCK = 60"),
    ("timelock not applied", '"at": self._now() + TIMELOCK}', '"at": self._now()}'),
    ("removal before the timelock", L('_bad(self._now() < hit[0]["at"], "The timelock has not passed yet")'), ""),
    ("timelock off by one", 'self._now() < hit[0]["at"]', 'self._now() <= hit[0]["at"]'),
    ("removal not cleared from pending", L('m.pending = json.dumps([p for p in pend if (p["chain"], p["asset"], p["holder"]) != key])'), ""),
    ("removal does not bump the version", '!= key])\n        m.version = m.version + 1', "!= key])"),
    ("removal removes nothing", 'rows = [r for r in json.loads(m.reserves) if (r["chain"], r["asset"], r["holder"]) != key]', "rows = json.loads(m.reserves)"),
    ("cancel cancels nothing", "m.pending = json.dumps(keep)", "m.pending = json.dumps(pend)"),
    ("cancel of nothing accepted", L('_bad(len(keep) == len(pend), "No such scheduled removal")'), ""),
    # attest
    ("cooldown absent", L('_bad(m.count > 0 and now < int(m.last_ok_at) + COOLDOWN, "An attestation was recorded a moment ago, wait for the cooldown")'), ""),
    ("cooldown off by one", "now < int(m.last_ok_at) + COOLDOWN", "now <= int(m.last_ok_at) + COOLDOWN"),
    ("cooldown too short", "COOLDOWN = 600", "COOLDOWN = 1"),
    ("probe never read", 'if c.probe != "":', "if False:"),
    ("a leader that failed is accepted", L('_bad(not res["ok"], "The reserves could not be read the same way by enough independent RPC endpoints, so nothing was recorded")'), ""),
    ("validator takes any leader", 'return mine is not None and mine == theirs["chains"]', "return True"),
    ("validator never checks a failed leader", 'return _read_all(spec, None) is None', "return True"),
    ("validator ignores the values", 'return mine is not None and mine == theirs["chains"]', "return mine is not None"),
    ("validator accepts a leader error", "if not isinstance(lr, gl.vm.Return):\n                return False", "if False:\n                return False"),
    ("pin not behind the head", "pin = top - depth", "pin = top"),
    ("pin from the highest head", "top = min(heads)", "top = max(heads)"),
    ("one head is enough", "if len(heads) < 2:", "if len(heads) < 1:"),
    ("one data answer is enough", "if len(seen) < 2 or any(s != seen[0] for s in seen):", "if len(seen) < 1 or any(s != seen[0] for s in seen):"),
    ("disagreeing providers tolerated", "if len(seen) < 2 or any(s != seen[0] for s in seen):", "if len(seen) < 2:"),
    ("chain id unchecked", "if a is not None and int(a[1], 16) == cid:", "if a is not None:"),
    ("block number unchecked", 'if int(a[0]["number"], 16) != pin:\n                continue', "if False:\n                continue"),
    ("future pin accepted", "elif pin > top - 1 or pin < top - BACKLOG:", "elif pin < top - BACKLOG:"),
    ("old pin accepted", "elif pin > top - 1 or pin < top - BACKLOG:", "elif pin > top - 1:"),
    ("backlog too small", "BACKLOG = 900", "BACKLOG = 100"),
    ("backlog boundary off by one", "pin < top - BACKLOG", "pin <= top - BACKLOG"),
    ("hash not part of the agreement", 'seen.append({"hash": str(a[0]["hash"]), "vals"', 'seen.append({"hash": "x", "vals"'),
    ("supply zero allowed", L('_bad(supply <= 0, "The liability token has no supply")'), ""),
    ("unit numerator ignored", "int(m.unit_num) // (10**dec", "1 // (10**dec"),
    ("unit denominator ignored", "(10**dec * int(m.unit_den))", "(10**dec * 1)"),
    ("liability decimals ignored", "raw * 10**ldec *", "raw * 10**18 *"),
    ("ratio scale wrong", "ratio = total * 10000 // supply", "ratio = total * 1000 // supply"),
    ("covered compare is strict", "covered=ratio >= int(m.min_ratio_bps)", "covered=ratio > int(m.min_ratio_bps)"),
    ("sequence does not advance", "seq = int(m.count) + 1", "seq = int(m.count)"),
    ("history never pruned", "if old in self.attestations:\n            del self.attestations[old]", "if False:\n            del self.attestations[old]"),
    ("history too long", "HISTORY = 20", "HISTORY = 25"),
    ("clears nothing", L("c.open = False"), ""),
    ("cleared_by not recorded", L("c.cleared_by = seq"), ""),
    ("open list not reset", L('m.open_ids = "[]"\n        m.count = seq').replace("        m.count = seq\n", ""), ""),
    ("last_ok_at not updated", L("m.last_ok_at = now"), ""),
    ("count not updated", L("m.count = seq"), ""),
    ("time not recorded", "seq=seq, at=now,", "seq=seq, at=0,"),
    ("probe counted in the ratio", "lines = [norm(r) for r in rows]", "lines = [norm(r) for r in rows + ([probe] if probe else [])]"),
    ("version not recorded", "disputed=False, version=m.version,", "disputed=False, version=1,"),
    ("new attestation starts disputed", "disputed=False, version=m.version,", "disputed=True, version=m.version,"),
    # challenge
    ("challenge before any attestation", L('_bad(m.count == 0, "Nothing has been attested yet")'), ""),
    ("reason unchecked", L('_bad(reason not in REASONS, "Unknown reason")'), ""),
    ("evidence unbounded", "len(evidence) > 300", "len(evidence) > 3000"),
    ("statement unbounded", "len(statement) > 500", "len(statement) > 5000"),
    ("no rate limit", L('_bad(now < int(self.last_challenge.get(k, 0)) + DAY, "One challenge per address per day")'), ""),
    ("rate limit off by one", "now < int(self.last_challenge.get(k, 0)) + DAY", "now <= int(self.last_challenge.get(k, 0)) + DAY"),
    ("rate limit not recorded", L("self.last_challenge[k] = now"), ""),
    ("open challenges uncapped", "len(open_ids) >= MAX_OPEN_CHALLENGES", "len(open_ids) > MAX_OPEN_CHALLENGES"),
    ("probe not stored", 'if probe_holder != "":', "if False:"),
    ("challenge does not dispute", L('self.attestations[f"{monitor_id}|{int(m.count)}"].disputed = True'), ""),
    ("challenge not listed as open", L("open_ids.append(n)"), ""),
    ("challenge number not advanced", L("m.n_challenges = n"), ""),
    ("challenger not recorded", "challenger=who.as_hex,", 'challenger="",'),
    ("challenged sequence not recorded", "seq=m.count, reason=reason", "seq=0, reason=reason"),
    # gate
    ("gate ignores a dispute", "and not a.disputed and", "and"),
    ("gate ignores the verdict", "return bool(a.covered) and", "return True and"),
    ("gate age boundary strict", "self._now() - int(a.at) <= limit", "self._now() - int(a.at) < limit"),
    ("gate ignores the monitor limit", "min(int(m.max_age), max_age)", "max_age"),
    ("gate zero means never", "if max_age <= 0 else", "if max_age < 0 else"),
    ("gate says yes with no attestation", "        if m.count == 0:\n            return False\n        a = self.attestations[f\"{monitor_id}|{int(m.count)}\"]\n        limit", "        if False:\n            return False\n        a = self.attestations[f\"{monitor_id}|{int(m.count)}\"]\n        limit"),
    ("liability decimals not recorded", "liabilities=supply, ldec=ldec,", "liabilities=supply, ldec=0,"),
    ("challenge count not shown", '"n_challenges": m.n_challenges,', '"n_challenges": 0,'),
    ("history window too wide", "max(1, int(m.count) - HISTORY + 1)", "max(1, int(m.count) - HISTORY)"),
]

results = []
try:
    only = os.environ.get("MUT")
    for name, a, b in M:
        a = a.replace("\n", NL)
        b = b.replace("\n", NL)
        if orig.count(a) != 1:
            print("BAD MUTATION (anchor count %d): %s" % (orig.count(a), name), flush=True)
            continue
        if only and not any(k in name for k in only.split(",")):
            continue
        open(p, "w", encoding="utf-8", newline="").write(orig.replace(a, b))
        r = subprocess.run([py, "-m", "pytest", "tests/direct", "-q", "-x", "-p", "no:cacheprovider"], cwd=root, capture_output=True, text=True)
        tag = "CAUGHT  " if r.returncode else "SURVIVED"
        results.append((tag, name))
        print(tag + "  " + name, flush=True)
finally:
    open(p, "w", encoding="utf-8", newline="").write(orig)
print("\n%d caught, %d survived" % (sum(1 for t, _ in results if t.strip() == "CAUGHT"), sum(1 for t, _ in results if t == "SURVIVED")))
