# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from genlayer import *

HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}

CHAINS = {
    "ethereum": (1, 32, ("https://mainnet.gateway.tenderly.co", "https://rpc.mevblocker.io", "https://eth-mainnet.public.blastapi.io")),
    "base": (8453, 120, ("https://mainnet.base.org", "https://base.gateway.tenderly.co", "https://base-mainnet.public.blastapi.io")),
}
BACKLOG = 900  # a validator accepts a pinned block at most this many blocks behind its own view of the head
COOLDOWN = 600  # seconds after a successful attestation before the next one
TIMELOCK = 86400  # a reserve address can only leave a monitor this long after it was scheduled
DAY = 86400
MAX_RESERVES = 8
HISTORY = 20
MAX_OPEN_CHALLENGES = 3
REASONS = ("missing_reserve", "liabilities", "wrong_read", "stale")

def _bad(c: bool, m: str) -> None:
    if c:
        raise gl.vm.UserError(m)

def _h40(x) -> str:
    s = str(x).lower().removeprefix("0x")
    _bad(len(s) != 40 or any(c not in "0123456789abcdef" for c in s), "An address must be 20 bytes of hex")
    return s

def _rpc(url: str, tag: str, calls: list):
    body = json.dumps([{"jsonrpc": "2.0", "id": i, "method": m, "params": p} for i, (m, p) in enumerate(calls)])
    try:
        r = gl.nondet.web.post(url + "?p=" + tag, body=body, headers=HEADERS)
        arr = json.loads((r.body or b"").decode("utf-8"))
        if not isinstance(arr, list):
            return None
        out = {}
        for x in arr:
            if "error" in x or x.get("result") is None:
                return None
            out[x["id"]] = x["result"]
        return out if len(out) == len(calls) else None
    except Exception:
        return None

def _read_chain(chain: str, w: dict, pin):
    cid, depth, urls = CHAINS[chain]
    heads = []
    for u in urls:
        a = _rpc(u, "head", [("eth_blockNumber", []), ("eth_chainId", [])])
        try:
            if a is not None and int(a[1], 16) == cid:
                heads.append(int(a[0], 16))
        except Exception:
            pass
    if len(heads) < 2:
        return None
    top = min(heads)
    if pin is None:
        pin = top - depth
    elif pin > top - 1 or pin < top - BACKLOG:
        return None
    pn = hex(pin)
    calls = [("eth_getBlockByNumber", [pn, False])]
    keys = []
    for asset, holder in w["bal"]:
        if asset == "native":
            calls.append(("eth_getBalance", ["0x" + holder, pn]))
        else:
            calls.append(("eth_call", [{"to": "0x" + asset, "data": "0x70a08231" + "0" * 24 + holder}, pn]))
        keys.append(f"bal:{asset}:{holder}")
    for t in w["dec"]:
        calls.append(("eth_call", [{"to": "0x" + t, "data": "0x313ce567"}, pn]))
        keys.append(f"dec:{t}")
    if w["supply"]:
        calls.append(("eth_call", [{"to": "0x" + w["supply"], "data": "0x18160ddd"}, pn]))
        keys.append("supply")
    seen = []
    for u in urls:
        a = _rpc(u, "data", calls)
        if a is None:
            continue
        try:
            if int(a[0]["number"], 16) != pin:
                continue
            seen.append({"hash": str(a[0]["hash"]), "vals": {k: str(int(a[i + 1], 16)) for i, k in enumerate(keys)}})
        except Exception:
            continue
    if len(seen) < 2 or any(s != seen[0] for s in seen):
        return None
    return {"pin": pin, "hash": seen[0]["hash"], "vals": seen[0]["vals"]}

def _read_all(spec: dict, pins):
    out = {}
    for chain in sorted(spec):
        r = _read_chain(chain, spec[chain], None if pins is None else pins.get(chain))
        if r is None:
            return None
        out[chain] = r
    return out

@allow_storage
@dataclass
class Monitor:
    name: str
    registrant: Address
    liab_chain: str
    liab_token: str
    unit_num: u256
    unit_den: u256
    min_ratio_bps: u256
    max_age: u256
    reserves: str  # JSON list of {chain, asset, holder, label}
    pending: str  # JSON list of {chain, asset, holder, at}: removals waiting out the timelock
    version: u256
    created_at: u256
    last_ok_at: u256
    count: u256
    open_ids: str  # JSON list of open challenge numbers
    n_challenges: u256

@allow_storage
@dataclass
class Attestation:
    seq: u256
    at: u256
    ratio_bps: u256
    covered: bool
    reserves_total: u256
    liabilities: u256
    ldec: u256
    lines: str  # JSON: what each reserve address held, in its own units and in liability units
    blocks: str  # JSON: the pinned block number and hash per chain
    probe: str  # JSON: what a challenger's probe address held (shown, never counted), or ""
    disputed: bool
    version: u256

@allow_storage
@dataclass
class Challenge:
    challenger: str
    at: u256
    seq: u256
    reason: str
    evidence: str
    statement: str
    probe: str
    open: bool
    cleared_by: u256

class Ballast(gl.Contract):

    monitors: TreeMap[str, Monitor]
    attestations: TreeMap[str, Attestation]
    challenges: TreeMap[str, Challenge]
    last_challenge: TreeMap[str, u256]
    ids: DynArray[str]

    def __init__(self):
        pass

    def _now(self) -> int:
        return int(datetime.now(timezone.utc).timestamp())

    def _mon(self, monitor_id: str) -> Monitor:
        _bad(monitor_id not in self.monitors, "Monitor not found")
        return self.monitors[monitor_id]

    def _only_registrant(self, m: Monitor) -> None:
        _bad(gl.message.sender_address != m.registrant, "Only the registrant can change this monitor")

    def _row(self, chain, asset, holder, label="") -> dict:
        _bad(chain not in CHAINS, "Unsupported chain")
        a = asset if asset == "native" else _h40(asset)
        _bad(not isinstance(label, str) or len(label) > 40, "A label can be at most 40 characters")
        return {"chain": chain, "asset": a, "holder": _h40(holder), "label": label}

    @gl.public.write
    def register(self, monitor_id: str, name: str, liab_chain: str, liab_token: str, unit_num: int, unit_den: int, min_ratio_bps: int, max_age: int, reserves: str) -> None:
        _bad(not isinstance(monitor_id, str) or not 0 < len(monitor_id) <= 64, "monitor_id must be 1 to 64 characters")
        _bad(monitor_id in self.monitors, "That monitor id is taken")
        _bad(not isinstance(name, str) or not 0 < len(name) <= 60, "name must be 1 to 60 characters")
        _bad(liab_chain not in CHAINS, "Unsupported chain")
        _bad(not 1 <= unit_num <= 10**6 or not 1 <= unit_den <= 10**6, "The unit multiplier must be between 1 and 1000000")
        _bad(not 5000 <= min_ratio_bps <= 30000, "min_ratio_bps must be between 5000 and 30000")
        _bad(not 3600 <= max_age <= 30 * DAY, "max_age must be between 1 hour and 30 days")
        try:
            rows = [self._row(r["chain"], r["asset"], r["holder"], r.get("label", "")) for r in json.loads(reserves)]
        except gl.vm.UserError:
            raise
        except Exception:
            raise gl.vm.UserError("reserves must be a JSON list of {chain, asset, holder, label}")
        _bad(not 1 <= len(rows) <= MAX_RESERVES, f"A monitor needs 1 to {MAX_RESERVES} reserve addresses")
        _bad(len({(r["chain"], r["asset"], r["holder"]) for r in rows}) != len(rows), "A reserve address is listed twice")
        now = self._now()
        self.monitors[monitor_id] = Monitor(
            name=name, registrant=gl.message.sender_address, liab_chain=liab_chain, liab_token=_h40(liab_token), unit_num=unit_num, unit_den=unit_den,
            min_ratio_bps=min_ratio_bps, max_age=max_age, reserves=json.dumps(rows), pending="[]", version=1, created_at=now, last_ok_at=0,
            count=0, open_ids="[]", n_challenges=0,
        )
        self.ids.append(monitor_id)

    @gl.public.write
    def add_reserve(self, monitor_id: str, chain: str, asset: str, holder: str, label: str) -> None:
        m = self._mon(monitor_id)
        self._only_registrant(m)
        rows = json.loads(m.reserves)
        _bad(len(rows) >= MAX_RESERVES, f"At most {MAX_RESERVES} reserve addresses")
        row = self._row(chain, asset, holder, label)
        _bad(any((r["chain"], r["asset"], r["holder"]) == (row["chain"], row["asset"], row["holder"]) for r in rows), "That address is already listed")
        rows.append(row)
        m.reserves = json.dumps(rows)
        m.version = m.version + 1

    @gl.public.write
    def schedule_removal(self, monitor_id: str, chain: str, asset: str, holder: str) -> None:
        m = self._mon(monitor_id)
        self._only_registrant(m)
        row = self._row(chain, asset, holder)
        key = (row["chain"], row["asset"], row["holder"])
        rows = json.loads(m.reserves)
        _bad(not any((r["chain"], r["asset"], r["holder"]) == key for r in rows), "That address is not listed")
        _bad(len(rows) <= 1, "A monitor keeps at least one reserve address")
        pend = json.loads(m.pending)
        _bad(any((p["chain"], p["asset"], p["holder"]) == key for p in pend), "That removal is already scheduled")
        pend.append({"chain": key[0], "asset": key[1], "holder": key[2], "at": self._now() + TIMELOCK})
        m.pending = json.dumps(pend)

    @gl.public.write
    def cancel_removal(self, monitor_id: str, chain: str, asset: str, holder: str) -> None:
        m = self._mon(monitor_id)
        self._only_registrant(m)
        row = self._row(chain, asset, holder)
        key = (row["chain"], row["asset"], row["holder"])
        pend = json.loads(m.pending)
        keep = [p for p in pend if (p["chain"], p["asset"], p["holder"]) != key]
        _bad(len(keep) == len(pend), "No such scheduled removal")
        m.pending = json.dumps(keep)

    @gl.public.write
    def apply_removal(self, monitor_id: str, chain: str, asset: str, holder: str) -> None:
        m = self._mon(monitor_id)
        row = self._row(chain, asset, holder)
        key = (row["chain"], row["asset"], row["holder"])
        pend = json.loads(m.pending)
        hit = [p for p in pend if (p["chain"], p["asset"], p["holder"]) == key]
        _bad(not hit, "No such scheduled removal")
        _bad(self._now() < hit[0]["at"], "The timelock has not passed yet")
        rows = [r for r in json.loads(m.reserves) if (r["chain"], r["asset"], r["holder"]) != key]
        _bad(len(rows) < 1, "A monitor keeps at least one reserve address")
        m.reserves = json.dumps(rows)
        m.pending = json.dumps([p for p in pend if (p["chain"], p["asset"], p["holder"]) != key])
        m.version = m.version + 1

    def _spec(self, m: Monitor, rows: list, probe) -> dict:
        spec = {}

        def want(chain):
            return spec.setdefault(chain, {"bal": [], "dec": [], "supply": ""})

        for r in rows + ([probe] if probe else []):
            w = want(r["chain"])
            if [r["asset"], r["holder"]] not in w["bal"]:
                w["bal"].append([r["asset"], r["holder"]])
            if r["asset"] != "native" and r["asset"] not in w["dec"]:
                w["dec"].append(r["asset"])
        lw = want(m.liab_chain)
        lw["supply"] = m.liab_token
        if m.liab_token not in lw["dec"]:
            lw["dec"].append(m.liab_token)
        for w in spec.values():
            w["bal"].sort()
            w["dec"].sort()
        return spec

    @gl.public.write
    def attest(self, monitor_id: str) -> None:
        m = self._mon(monitor_id)
        now = self._now()
        _bad(m.count > 0 and now < int(m.last_ok_at) + COOLDOWN, "An attestation was recorded a moment ago, wait for the cooldown")
        rows = json.loads(m.reserves)
        open_ids = json.loads(m.open_ids)
        probe = None
        for n in open_ids:
            c = self.challenges[f"{monitor_id}|{n}"]
            if c.probe != "":
                probe = json.loads(c.probe)
                break
        spec = self._spec(m, rows, probe)

        def leader_fn() -> dict:
            got = _read_all(spec, None)
            return {"ok": got is not None, "chains": got or {}}

        def validator_fn(lr) -> bool:
            if not isinstance(lr, gl.vm.Return):
                return False
            theirs = lr.calldata
            if not theirs["ok"]:  # a leader that gave up is only agreed with if this validator cannot read it either
                return _read_all(spec, None) is None
            mine = _read_all(spec, {c: v["pin"] for c, v in theirs["chains"].items()})
            return mine is not None and mine == theirs["chains"]

        res = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        _bad(not res["ok"], "The reserves could not be read the same way by enough independent RPC endpoints, so nothing was recorded")
        chains = res["chains"]

        def val(chain, key):
            return int(chains[chain]["vals"][key])

        ldec = val(m.liab_chain, f"dec:{m.liab_token}")
        supply = val(m.liab_chain, "supply")
        _bad(supply <= 0, "The liability token has no supply")

        def norm(r) -> dict:
            if r["asset"] == "native":
                raw, dec = val(r["chain"], f"bal:native:{r['holder']}"), 18
            else:
                raw, dec = val(r["chain"], f"bal:{r['asset']}:{r['holder']}"), val(r["chain"], f"dec:{r['asset']}")
            return {**r, "raw": str(raw), "decimals": dec, "value": raw * 10**ldec * int(m.unit_num) // (10**dec * int(m.unit_den))}

        lines = [norm(r) for r in rows]
        total = sum(x["value"] for x in lines)
        ratio = total * 10000 // supply
        probe_json = ""
        if probe:
            p = norm(probe)
            probe_json = json.dumps({**p, "value": str(p["value"])})
        for x in lines:
            x["value"] = str(x["value"])
        seq = int(m.count) + 1
        self.attestations[f"{monitor_id}|{seq}"] = Attestation(
            seq=seq, at=now, ratio_bps=ratio, covered=ratio >= int(m.min_ratio_bps), reserves_total=total, liabilities=supply, ldec=ldec,
            lines=json.dumps(lines), blocks=json.dumps({c: {"number": v["pin"], "hash": v["hash"]} for c, v in chains.items()}),
            probe=probe_json, disputed=False, version=m.version,
        )
        old = f"{monitor_id}|{seq - HISTORY}"
        if old in self.attestations:
            del self.attestations[old]
        for n in open_ids:  # any newer finalized attestation answers every open challenge
            c = self.challenges[f"{monitor_id}|{n}"]
            c.open = False
            c.cleared_by = seq
        m.open_ids = "[]"
        m.count = seq
        m.last_ok_at = now

    @gl.public.write
    def challenge(self, monitor_id: str, reason: str, evidence: str, statement: str, probe_chain: str, probe_asset: str, probe_holder: str) -> None:
        m = self._mon(monitor_id)
        _bad(m.count == 0, "Nothing has been attested yet")
        _bad(reason not in REASONS, "Unknown reason")
        _bad(not isinstance(evidence, str) or len(evidence) > 300, "Evidence can be at most 300 characters")
        _bad(not isinstance(statement, str) or len(statement) > 500, "The statement can be at most 500 characters")
        who = gl.message.sender_address
        k = f"{monitor_id}|{who.as_hex.lower()}"
        now = self._now()
        _bad(now < int(self.last_challenge.get(k, 0)) + DAY, "One challenge per address per day")
        open_ids = json.loads(m.open_ids)
        _bad(len(open_ids) >= MAX_OPEN_CHALLENGES, "This monitor already has the most open challenges allowed")
        probe = ""
        if probe_holder != "":
            probe = json.dumps(self._row(probe_chain, probe_asset, probe_holder, "challenger's probe"))
        n = int(m.n_challenges) + 1
        self.challenges[f"{monitor_id}|{n}"] = Challenge(
            challenger=who.as_hex, at=now, seq=m.count, reason=reason, evidence=evidence, statement=statement, probe=probe, open=True, cleared_by=0,
        )
        self.attestations[f"{monitor_id}|{int(m.count)}"].disputed = True
        open_ids.append(n)
        m.open_ids = json.dumps(open_ids)
        m.n_challenges = n
        self.last_challenge[k] = now

    def _att_dict(self, a: Attestation) -> dict:
        return {
            "seq": a.seq, "at": a.at, "ratio_bps": a.ratio_bps, "covered": a.covered, "reserves_total": str(a.reserves_total),
            "liabilities": str(a.liabilities), "liab_decimals": a.ldec, "lines": json.loads(a.lines), "blocks": json.loads(a.blocks),
            "probe": json.loads(a.probe) if a.probe else None, "disputed": a.disputed, "version": a.version,
        }

    @gl.public.view
    def get_monitor_ids(self) -> list:
        return [i for i in self.ids]

    @gl.public.view
    def get_monitor(self, monitor_id: str) -> dict:
        m = self._mon(monitor_id)
        return {
            "id": monitor_id, "name": m.name, "registrant": m.registrant.as_hex, "liab_chain": m.liab_chain, "liab_token": m.liab_token,
            "unit_num": m.unit_num, "unit_den": m.unit_den, "min_ratio_bps": m.min_ratio_bps, "max_age": m.max_age,
            "reserves": json.loads(m.reserves), "pending": json.loads(m.pending), "version": m.version, "created_at": m.created_at,
            "last_ok_at": m.last_ok_at, "count": m.count, "open_challenges": len(json.loads(m.open_ids)), "n_challenges": m.n_challenges,
        }

    @gl.public.view
    def get_attestation(self, monitor_id: str, seq: int) -> dict:
        self._mon(monitor_id)
        k = f"{monitor_id}|{seq}"
        _bad(k not in self.attestations, "Attestation not found")
        return self._att_dict(self.attestations[k])

    @gl.public.view
    def get_history(self, monitor_id: str) -> list:
        m = self._mon(monitor_id)
        out = []
        for s in range(max(1, int(m.count) - HISTORY + 1), int(m.count) + 1):
            k = f"{monitor_id}|{s}"
            if k in self.attestations:
                a = self.attestations[k]
                out.append({"seq": a.seq, "at": a.at, "ratio_bps": a.ratio_bps, "covered": a.covered, "disputed": a.disputed})
        return out

    @gl.public.view
    def get_latest(self, monitor_id: str) -> dict:
        m = self._mon(monitor_id)
        if m.count == 0:
            return {"exists": False, "covered": False, "disputed": False, "at": 0, "ratio_bps": 0, "seq": 0, "max_age": m.max_age}
        a = self.attestations[f"{monitor_id}|{int(m.count)}"]
        return {"exists": True, "covered": a.covered, "disputed": a.disputed, "at": a.at, "ratio_bps": a.ratio_bps, "seq": a.seq, "max_age": m.max_age}

    @gl.public.view
    def is_covered(self, monitor_id: str, max_age: int) -> bool:
        m = self._mon(monitor_id)
        if m.count == 0:
            return False
        a = self.attestations[f"{monitor_id}|{int(m.count)}"]
        limit = int(m.max_age) if max_age <= 0 else min(int(m.max_age), max_age)
        return bool(a.covered) and not a.disputed and self._now() - int(a.at) <= limit

    @gl.public.view
    def get_challenge(self, monitor_id: str, n: int) -> dict:
        self._mon(monitor_id)
        k = f"{monitor_id}|{n}"
        _bad(k not in self.challenges, "Challenge not found")
        c = self.challenges[k]
        return {"challenger": c.challenger, "at": c.at, "seq": c.seq, "reason": c.reason, "evidence": c.evidence, "statement": c.statement,
                "probe": json.loads(c.probe) if c.probe else None, "open": c.open, "cleared_by": c.cleared_by}
