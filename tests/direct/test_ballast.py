"""Direct-mode tests for Ballast.

The RPC world is faked per provider, so every provider can be made to answer correctly, lie, be down, or sit on another chain, and the
tests pin down exactly what the contract asks and what it records. The real path (validators, real providers) is covered by the live
Bradbury run described in the README.
"""

import json
import re
from datetime import datetime, timezone

import pytest

CONTRACT = "contracts/ballast.py"
T0 = "2026-01-01T00:00:00Z"
T0_TS = int(datetime(2026, 1, 1, tzinfo=timezone.utc).timestamp())

HOSTS = {
    "ethereum": ("mainnet.gateway.tenderly.co", "rpc.mevblocker.io", "eth-mainnet.public.blastapi.io"),
    "base": ("mainnet.base.org", "base.gateway.tenderly.co", "base-mainnet.public.blastapi.io"),
}
CHAIN_ID = {"ethereum": 1, "base": 8453}
DEPTH = {"ethereum": 32, "base": 120}
HEAD0 = {"ethereum": 24_000_000, "base": 50_000_000}

E18 = 10**18
TOKEN = "ab" * 20  # the liability token
USDC = "cc" * 20  # a 6-decimal reserve asset
H1, H2, H3, PROBE = "11" * 20, "22" * 20, "33" * 20, "44" * 20


def at(seconds: int) -> str:
    return datetime.fromtimestamp(T0_TS + seconds, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Chain:
    def __init__(self, name):
        self.name = name
        self.head = HEAD0[name]
        self.cid = CHAIN_ID[name]
        self.native, self.erc20, self.dec, self.supply = {}, {}, {}, {}
        self.salt = ""
        self.shift = 0  # a provider that answers about a different block than the one asked for


def block_hash(name, number, salt=""):
    return "0x" + (f"{name}{number}{salt}".encode().hex() + "0" * 64)[:64]


def word(n: int) -> str:
    return "0x" + format(n, "064x")


def head_body(ch):
    return json.dumps([{"jsonrpc": "2.0", "id": 0, "result": hex(ch.head)}, {"jsonrpc": "2.0", "id": 1, "result": hex(ch.cid)}])


def data_body(ch, wants, pin):
    res = [{"number": hex(pin + ch.shift), "hash": block_hash(ch.name, pin, ch.salt)}]
    for asset, holder in wants["bal"]:
        raw = ch.native.get(holder, 0) if asset == "native" else ch.erc20.get((asset, holder), 0)
        res.append(word(raw))
    for t in wants["dec"]:
        res.append(word(ch.dec[t]) if t in ch.dec else "0x")
    if wants["supply"]:
        res.append(word(ch.supply.get(wants["supply"], 0)) if wants["supply"] in ch.supply else "0x")
    return json.dumps([{"jsonrpc": "2.0", "id": i, "result": r} for i, r in enumerate(res)])


def row(chain="ethereum", asset="native", holder=H1, label=""):
    return {"chain": chain, "asset": asset, "holder": holder, "label": label}


def wants_for(rows, liab_chain, liab_token, probe=None):
    spec = {}

    def want(c):
        return spec.setdefault(c, {"bal": [], "dec": [], "supply": ""})

    for r in rows + ([probe] if probe else []):
        w = want(r["chain"])
        if [r["asset"], r["holder"]] not in w["bal"]:
            w["bal"].append([r["asset"], r["holder"]])
        if r["asset"] != "native" and r["asset"] not in w["dec"]:
            w["dec"].append(r["asset"])
    lw = want(liab_chain)
    lw["supply"] = liab_token
    if liab_token not in lw["dec"]:
        lw["dec"].append(liab_token)
    for w in spec.values():
        w["bal"].sort()
        w["dec"].sort()
    return spec


def mock_world(vm, chains, wants, variants=None, down=(), down_data=(), pins=None):
    """Answer every provider for every chain in `wants`. variants[(chain, i)] swaps the world one provider sees; down is a set of
    (chain, i) providers that answer with an HTTP error."""
    vm.clear_mocks()
    variants = variants or {}
    for name, w in wants.items():
        for i, host in enumerate(HOSTS[name]):
            if (name, i) in down:
                vm.mock_web(rf"{re.escape(host)}.*p=head", {"method": "POST", "status": 500, "body": "down"})
                vm.mock_web(rf"{re.escape(host)}.*p=data", {"method": "POST", "status": 500, "body": "down"})
                continue
            ch = variants.get((name, i), chains[name])
            pin = (pins or {}).get(name, chains[name].head - DEPTH[name])
            vm.mock_web(rf"{re.escape(host)}.*p=head", {"method": "POST", "status": 200, "body": head_body(ch)})
            if (name, i) in down_data:
                vm.mock_web(rf"{re.escape(host)}.*p=data", {"method": "POST", "status": 500, "body": "down"})
            else:
                vm.mock_web(rf"{re.escape(host)}.*p=data", {"method": "POST", "status": 200, "body": data_body(ch, w, pin)})


class Setup:
    def __init__(self, vm, c, chains, rows, liab_chain, liab_token):
        self.vm, self.c, self.chains = vm, c, chains
        self.rows, self.liab_chain, self.liab_token = rows, liab_chain, liab_token

    def wants(self, probe=None):
        return wants_for(self.rows, self.liab_chain, self.liab_token, probe)

    def world(self, probe=None, **kw):
        mock_world(self.vm, self.chains, self.wants(probe), **kw)

    def attest(self, monitor_id="m1", probe=None, **kw):
        self.world(probe, **kw)
        self.c.attest(monitor_id)


@pytest.fixture
def S(direct_vm, direct_deploy, direct_alice):
    direct_vm.warp(T0)
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    eth = Chain("ethereum")
    eth.native = {H1: 600 * E18, H2: 450 * E18}
    eth.dec = {TOKEN: 18}
    eth.supply = {TOKEN: 1000 * E18}
    rows = [row(holder=H1, label="Cold A"), row(holder=H2, label="Cold B")]
    c.register("m1", "Example Dollar", "ethereum", TOKEN, 1, 1, 10000, 86400, json.dumps(rows))
    return Setup(direct_vm, c, {"ethereum": eth, "base": Chain("base")}, rows, "ethereum", TOKEN)


# ------------------------------------------------------------------------ register


def test_register_stores_the_monitor(S, direct_alice):
    m = S.c.get_monitor("m1")
    assert m["name"] == "Example Dollar" and m["liab_chain"] == "ethereum" and m["liab_token"] == TOKEN
    assert m["min_ratio_bps"] == 10000 and m["max_age"] == 86400 and m["version"] == 1 and m["count"] == 0
    assert [r["holder"] for r in m["reserves"]] == [H1, H2]
    assert m["registrant"].lower() == ("0x" + bytes(direct_alice).hex())
    assert S.c.get_monitor_ids() == ["m1"]


@pytest.mark.parametrize(
    "kw,why",
    [
        (dict(monitor_id=""), "monitor_id"),
        (dict(monitor_id="x" * 65), "monitor_id"),
        (dict(monitor_id="m1"), "taken"),
        (dict(name=""), "name"),
        (dict(name="n" * 61), "name"),
        (dict(liab_chain="solana"), "Unsupported chain"),
        (dict(unit_num=0), "multiplier"),
        (dict(unit_den=0), "multiplier"),
        (dict(unit_num=10**6 + 1), "multiplier"),
        (dict(min_ratio_bps=4999), "min_ratio_bps"),
        (dict(min_ratio_bps=30001), "min_ratio_bps"),
        (dict(max_age=3599), "max_age"),
        (dict(max_age=30 * 86400 + 1), "max_age"),
        (dict(reserves="not json"), "JSON list"),
        (dict(reserves="[]"), "1 to 8"),
        (dict(reserves=json.dumps([row(chain="solana")])), "Unsupported chain"),
        (dict(reserves=json.dumps([row(holder="12")])), "20 bytes"),
        (dict(reserves=json.dumps([row(asset="nothex")])), "20 bytes"),
        (dict(reserves=json.dumps([row(label="l" * 41)])), "40 characters"),
        (dict(reserves=json.dumps([row(), row()])), "twice"),
        (dict(reserves=json.dumps([row(holder=format(i + 1, "040x")) for i in range(9)])), "1 to 8"),
        (dict(liab_token="12"), "20 bytes"),
    ],
)
def test_register_refuses_bad_input(S, kw, why):
    args = dict(monitor_id="m2", name="n", liab_chain="ethereum", liab_token=TOKEN, unit_num=1, unit_den=1, min_ratio_bps=10000, max_age=86400, reserves=json.dumps([row()]))
    args.update(kw)
    with pytest.raises(Exception, match=why):
        S.c.register(**args)


def test_register_normalizes_addresses_to_lowercase(S):
    S.c.register("m5", "n", "ethereum", "0x" + TOKEN.upper(), 1, 1, 10000, 86400, json.dumps([row(holder="0x" + H1.upper())]))
    m = S.c.get_monitor("m5")
    assert m["liab_token"] == TOKEN and m["reserves"][0]["holder"] == H1


# ----------------------------------------------------------------------- attestation


def test_attest_records_a_covered_attestation(S):
    S.attest()
    a = S.c.get_attestation("m1", 1)
    assert a["ratio_bps"] == 10500 and a["covered"] is True and a["disputed"] is False
    assert a["reserves_total"] == str(1050 * E18) and a["liabilities"] == str(1000 * E18)
    assert a["blocks"]["ethereum"]["number"] == HEAD0["ethereum"] - DEPTH["ethereum"]
    assert a["blocks"]["ethereum"]["hash"] == block_hash("ethereum", HEAD0["ethereum"] - 32)
    assert [x["raw"] for x in a["lines"]] == [str(600 * E18), str(450 * E18)] and a["at"] == T0_TS
    assert S.c.get_monitor("m1")["count"] == 1 and S.c.is_covered("m1", 0) is True


def test_attest_short_is_not_covered(S):
    S.chains["ethereum"].native[H2] = 300 * E18
    S.attest()
    a = S.c.get_attestation("m1", 1)
    assert a["ratio_bps"] == 9000 and a["covered"] is False and S.c.is_covered("m1", 0) is False


def test_exactly_at_the_minimum_is_covered_and_one_wei_below_is_not(S):
    S.chains["ethereum"].native = {H1: 600 * E18, H2: 400 * E18}
    S.attest()
    assert S.c.get_attestation("m1", 1)["ratio_bps"] == 10000 and S.c.get_attestation("m1", 1)["covered"] is True
    S.vm.warp(at(700))
    S.chains["ethereum"].native[H2] = 400 * E18 - 1
    S.attest()
    assert S.c.get_attestation("m1", 2)["ratio_bps"] == 9999 and S.c.get_attestation("m1", 2)["covered"] is False


def test_ratio_rounds_down(S):
    S.chains["ethereum"].native = {H1: 1, H2: 0}
    S.chains["ethereum"].supply = {TOKEN: 3}
    S.attest()
    assert S.c.get_attestation("m1", 1)["ratio_bps"] == 3333


def test_erc20_reserve_is_scaled_by_its_decimals_and_the_unit_multiplier(S):
    rows = [row(asset=USDC, holder=H1, label="USDC vault")]
    S.c.register("m2", "USD backed", "ethereum", TOKEN, 3, 2, 10000, 86400, json.dumps(rows))
    S.rows = rows
    eth = S.chains["ethereum"]
    eth.dec[USDC] = 6
    eth.erc20 = {(USDC, H1): 1_000_000_000}  # 1000 USDC
    eth.supply = {TOKEN: 1500 * E18}
    S.attest("m2")
    a = S.c.get_attestation("m2", 1)
    assert a["reserves_total"] == str(1500 * E18) and a["ratio_bps"] == 10000  # 1000 * 3/2 = 1500


def test_reserves_on_one_chain_and_liability_on_another(S):
    rows = [row("base", holder=H3, label="Bridge escrow")]
    S.c.register("m2", "Bridged", "ethereum", TOKEN, 1, 1, 10000, 86400, json.dumps(rows))
    S.rows = rows
    S.chains["base"].native = {H3: 2000 * E18}
    S.chains["ethereum"].supply = {TOKEN: 1000 * E18}
    S.attest("m2")
    a = S.c.get_attestation("m2", 1)
    assert a["ratio_bps"] == 20000
    assert a["blocks"]["base"]["number"] == HEAD0["base"] - DEPTH["base"] and a["blocks"]["ethereum"]["number"] == HEAD0["ethereum"] - DEPTH["ethereum"]


# ------------------------------------------------------------------ providers misbehave


def test_one_provider_down_still_attests_when_two_agree(S):
    S.attest(down={("ethereum", 2)})
    assert S.c.get_attestation("m1", 1)["ratio_bps"] == 10500


def test_two_providers_down_refuses(S):
    with pytest.raises(Exception, match="could not be read"):
        S.attest(down={("ethereum", 1), ("ethereum", 2)})
    assert S.c.get_monitor("m1")["count"] == 0


def test_one_provider_lying_about_a_balance_refuses(S):
    liar = Chain("ethereum")
    liar.native = {H1: 600 * E18, H2: 999 * E18}
    liar.dec, liar.supply = {TOKEN: 18}, {TOKEN: 1000 * E18}
    with pytest.raises(Exception, match="could not be read"):
        S.attest(variants={("ethereum", 0): liar})
    assert S.c.get_monitor("m1")["count"] == 0


def test_one_provider_with_a_different_block_hash_refuses(S):
    other = Chain("ethereum")
    other.native, other.dec, other.supply, other.salt = dict(S.chains["ethereum"].native), {TOKEN: 18}, {TOKEN: 1000 * E18}, "fork"
    with pytest.raises(Exception, match="could not be read"):
        S.attest(variants={("ethereum", 1): other})


def test_a_provider_on_another_chain_does_not_count(S):
    wrong = Chain("ethereum")
    wrong.cid = 8453
    wrong.native, wrong.dec, wrong.supply = dict(S.chains["ethereum"].native), {TOKEN: 18}, {TOKEN: 1000 * E18}
    S.attest(variants={("ethereum", 0): wrong})  # the other two still agree
    assert S.c.get_attestation("m1", 1)["ratio_bps"] == 10500
    S.vm.warp(at(700))
    with pytest.raises(Exception, match="could not be read"):
        S.attest(variants={("ethereum", 0): wrong, ("ethereum", 1): wrong})


def test_a_missing_token_contract_refuses(S):
    S.chains["ethereum"].dec = {}
    with pytest.raises(Exception, match="could not be read"):
        S.attest()


def test_zero_supply_refuses(S):
    S.chains["ethereum"].supply = {TOKEN: 0}
    with pytest.raises(Exception, match="no supply"):
        S.attest()
    assert S.c.get_monitor("m1")["count"] == 0


def test_a_chain_that_cannot_be_read_blocks_the_whole_attestation(S):
    rows = [row("ethereum", holder=H1), row("base", holder=H3)]
    S.c.register("m2", "Two chains", "ethereum", TOKEN, 1, 1, 10000, 86400, json.dumps(rows))
    S.rows = rows
    S.chains["base"].native = {H3: 5}
    with pytest.raises(Exception, match="could not be read"):
        S.attest("m2", down={("base", 0), ("base", 1)})


# --------------------------------------------------------------------------- cooldown


def test_cooldown_applies_after_a_success_but_not_after_a_failure(S):
    S.chains["ethereum"].supply = {TOKEN: 0}
    with pytest.raises(Exception, match="no supply"):
        S.attest()
    S.chains["ethereum"].supply = {TOKEN: 1000 * E18}
    S.attest()  # a failure did not start a cooldown
    with pytest.raises(Exception, match="cooldown"):
        S.attest()
    S.vm.warp(at(599))
    with pytest.raises(Exception, match="cooldown"):
        S.attest()
    S.vm.warp(at(600))
    S.attest()
    assert S.c.get_monitor("m1")["count"] == 2


def test_history_keeps_only_the_last_twenty(S):
    for i in range(22):
        S.vm.warp(at(i * 700))
        S.attest()
    h = S.c.get_history("m1")
    assert [x["seq"] for x in h] == list(range(3, 23))
    with pytest.raises(Exception, match="not found"):
        S.c.get_attestation("m1", 2)
    assert S.c.get_attestation("m1", 22)["seq"] == 22


# ------------------------------------------------------------------------------- gate


def test_is_covered_needs_an_attestation_that_is_covered_fresh_and_undisputed(S):
    assert S.c.is_covered("m1", 0) is False and S.c.get_latest("m1")["exists"] is False
    S.attest()
    assert S.c.is_covered("m1", 0) is True
    S.vm.warp(at(3600))
    assert S.c.is_covered("m1", 0) is True and S.c.is_covered("m1", 3599) is False and S.c.is_covered("m1", 3600) is True
    S.vm.warp(at(86400))
    assert S.c.is_covered("m1", 0) is True
    S.vm.warp(at(86401))
    assert S.c.is_covered("m1", 0) is False and S.c.is_covered("m1", 10**9) is False  # the monitor's own limit always applies


def test_get_latest_is_the_small_record_a_consumer_needs(S):
    S.attest()
    g = S.c.get_latest("m1")
    assert g == {"exists": True, "covered": True, "disputed": False, "at": T0_TS, "ratio_bps": 10500, "seq": 1, "max_age": 86400}


# --------------------------------------------------------------------------- challenge


def challenge(S, who=None, reason="missing_reserve", ev="https://example.com/e", st="it is missing", probe=("", "", "")):
    if who is not None:
        S.vm.sender = who
    S.c.challenge("m1", reason, ev, st, *probe)


def test_challenge_needs_an_attestation(S):
    with pytest.raises(Exception, match="Nothing has been attested"):
        challenge(S)


def test_challenge_disputes_the_attestation_and_closes_the_gate(S, direct_bob):
    S.attest()
    challenge(S, direct_bob)
    assert S.c.get_attestation("m1", 1)["disputed"] is True
    assert S.c.is_covered("m1", 0) is False and S.c.get_latest("m1")["disputed"] is True
    assert S.c.get_monitor("m1")["open_challenges"] == 1
    c = S.c.get_challenge("m1", 1)
    assert c["open"] is True and c["seq"] == 1 and c["reason"] == "missing_reserve" and c["cleared_by"] == 0


@pytest.mark.parametrize(
    "kw,why",
    [
        (dict(reason="because"), "Unknown reason"),
        (dict(ev="e" * 301), "300"),
        (dict(st="s" * 501), "500"),
        (dict(probe=("solana", "native", PROBE)), "Unsupported chain"),
        (dict(probe=("ethereum", "native", "zz")), "20 bytes"),
    ],
)
def test_challenge_refuses_bad_input(S, direct_bob, kw, why):
    S.attest()
    with pytest.raises(Exception, match=why):
        challenge(S, direct_bob, **kw)


def test_one_challenge_per_address_per_day(S, direct_bob):
    S.attest()
    challenge(S, direct_bob)
    with pytest.raises(Exception, match="One challenge per address per day"):
        challenge(S, direct_bob)
    S.vm.warp(at(86399))
    with pytest.raises(Exception, match="One challenge per address per day"):
        challenge(S, direct_bob)


def test_three_open_challenges_at_most(S, direct_alice, direct_bob, direct_charlie, direct_owner):
    S.attest()
    for w in (direct_alice, direct_bob, direct_charlie):
        challenge(S, w)
    with pytest.raises(Exception, match="most open challenges"):
        challenge(S, direct_owner)


def test_any_newer_attestation_clears_every_open_challenge(S, direct_alice, direct_bob):
    S.attest()
    challenge(S, direct_bob)
    challenge(S, direct_alice)
    S.vm.warp(at(700))
    S.attest()
    assert S.c.get_attestation("m1", 2)["disputed"] is False and S.c.is_covered("m1", 0) is True
    assert S.c.get_monitor("m1")["open_challenges"] == 0
    for n in (1, 2):
        c = S.c.get_challenge("m1", n)
        assert c["open"] is False and c["cleared_by"] == 2
    assert S.c.get_attestation("m1", 1)["disputed"] is True  # the old record keeps its mark


def test_a_probe_address_is_read_shown_and_never_counted(S, direct_bob):
    S.attest()
    p = row("ethereum", "native", PROBE, "challenger's probe")
    S.chains["ethereum"].native[PROBE] = 500 * E18
    challenge(S, direct_bob, probe=("ethereum", "native", PROBE))
    S.vm.warp(at(700))
    S.attest(probe=p)
    a = S.c.get_attestation("m1", 2)
    assert a["probe"]["holder"] == PROBE and a["probe"]["raw"] == str(500 * E18) and a["probe"]["value"] == str(500 * E18)
    assert a["ratio_bps"] == 10500 and a["reserves_total"] == str(1050 * E18)  # the probe is not in the ratio


def test_a_challenge_can_come_again_after_the_day(S, direct_bob):
    S.attest()
    challenge(S, direct_bob)
    S.vm.warp(at(700))
    S.attest()
    S.vm.warp(at(86400 + 1))
    challenge(S, direct_bob)
    assert S.c.get_monitor("m1")["open_challenges"] == 1


# -------------------------------------------------------------------------- reserves


def test_only_the_registrant_changes_a_monitor(S, direct_bob):
    S.vm.sender = direct_bob
    with pytest.raises(Exception, match="Only the registrant"):
        S.c.add_reserve("m1", "ethereum", "native", H3, "x")
    with pytest.raises(Exception, match="Only the registrant"):
        S.c.schedule_removal("m1", "ethereum", "native", H1)
    with pytest.raises(Exception, match="Only the registrant"):
        S.c.cancel_removal("m1", "ethereum", "native", H1)


def test_add_reserve_counts_from_the_next_attestation(S):
    S.attest()
    S.c.add_reserve("m1", "ethereum", "native", H3, "Ops")
    assert S.c.get_monitor("m1")["version"] == 2 and len(S.c.get_monitor("m1")["reserves"]) == 3
    S.rows = S.c.get_monitor("m1")["reserves"]
    S.chains["ethereum"].native[H3] = 50 * E18
    S.vm.warp(at(700))
    S.attest()
    a = S.c.get_attestation("m1", 2)
    assert a["ratio_bps"] == 11000 and a["version"] == 2 and S.c.get_attestation("m1", 1)["version"] == 1


def test_add_reserve_refuses_duplicates_and_a_ninth_row(S):
    with pytest.raises(Exception, match="already listed"):
        S.c.add_reserve("m1", "ethereum", "native", H1, "dup")
    for i in range(6):
        S.c.add_reserve("m1", "ethereum", "native", format(100 + i, "040x"), "r")
    with pytest.raises(Exception, match="At most 8"):
        S.c.add_reserve("m1", "ethereum", "native", format(999, "040x"), "r")


def test_removal_waits_for_the_timelock_and_stays_visible_meanwhile(S):
    S.c.schedule_removal("m1", "ethereum", "native", H2)
    m = S.c.get_monitor("m1")
    assert len(m["reserves"]) == 2 and m["pending"][0]["holder"] == H2 and m["pending"][0]["at"] == T0_TS + 86400
    with pytest.raises(Exception, match="already scheduled"):
        S.c.schedule_removal("m1", "ethereum", "native", H2)
    S.vm.warp(at(86399))
    with pytest.raises(Exception, match="timelock has not passed"):
        S.c.apply_removal("m1", "ethereum", "native", H2)
    S.attest()  # still counted while pending
    assert S.c.get_attestation("m1", 1)["ratio_bps"] == 10500
    S.vm.warp(at(86400))
    S.c.apply_removal("m1", "ethereum", "native", H2)
    m = S.c.get_monitor("m1")
    assert [r["holder"] for r in m["reserves"]] == [H1] and m["pending"] == [] and m["version"] == 2


def test_anyone_can_apply_a_removal_once_the_timelock_passed(S, direct_bob):
    S.c.schedule_removal("m1", "ethereum", "native", H2)
    S.vm.warp(at(86400))
    S.vm.sender = direct_bob
    S.c.apply_removal("m1", "ethereum", "native", H2)
    assert len(S.c.get_monitor("m1")["reserves"]) == 1


def test_a_scheduled_removal_can_be_cancelled(S):
    S.c.schedule_removal("m1", "ethereum", "native", H2)
    S.c.cancel_removal("m1", "ethereum", "native", H2)
    assert S.c.get_monitor("m1")["pending"] == []
    S.vm.warp(at(86400))
    with pytest.raises(Exception, match="No such scheduled removal"):
        S.c.apply_removal("m1", "ethereum", "native", H2)


def test_removal_refuses_unknown_and_last_addresses(S):
    with pytest.raises(Exception, match="not listed"):
        S.c.schedule_removal("m1", "ethereum", "native", H3)
    S.c.schedule_removal("m1", "ethereum", "native", H2)
    S.vm.warp(at(86400))
    S.c.apply_removal("m1", "ethereum", "native", H2)
    with pytest.raises(Exception, match="keeps at least one"):
        S.c.schedule_removal("m1", "ethereum", "native", H1)


def test_unknown_monitor_everywhere(S):
    for call in (lambda: S.c.attest("nope"), lambda: S.c.get_monitor("nope"), lambda: S.c.is_covered("nope", 0), lambda: S.c.get_latest("nope"), lambda: S.c.get_history("nope")):
        with pytest.raises(Exception, match="Monitor not found"):
            call()
