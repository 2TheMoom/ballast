"""More Ballast direct-mode tests: provider edge cases, the exact requests sent, and what validators accept and reject."""

import json

import pytest

from tests.direct.conftest import to_hex
from tests.direct.test_ballast import (  # noqa: F401  (S is a fixture)
    E18,
    H1,
    H2,
    HEAD0,
    HOSTS,
    TOKEN,
    USDC,
    Chain,
    S,
    at,
    block_hash,
    challenge,
    mock_world,
    row,
    wants_for,
)

# ------------------------------------------------------------- more provider behaviour


def test_the_pin_is_taken_from_the_lowest_head_the_providers_report(S):
    ahead = Chain("ethereum")
    ahead.head = HEAD0["ethereum"] + 5000
    ahead.native, ahead.dec, ahead.supply = dict(S.chains["ethereum"].native), {TOKEN: 18}, {TOKEN: 1000 * E18}
    S.attest(variants={("ethereum", 0): ahead})  # the data mock is pinned off the shared head, so a higher pin would not match
    assert S.c.get_attestation("m1", 1)["blocks"]["ethereum"]["number"] == HEAD0["ethereum"] - 32


def test_two_providers_that_answer_the_head_but_not_the_data_refuse(S):
    with pytest.raises(Exception, match="could not be read"):
        S.attest(down_data={("ethereum", 1), ("ethereum", 2)})


def test_a_provider_that_answers_about_another_block_does_not_count(S):
    shifted = Chain("ethereum")
    shifted.native, shifted.dec, shifted.supply, shifted.shift = dict(S.chains["ethereum"].native), {TOKEN: 18}, {TOKEN: 1000 * E18}, 1
    S.attest(variants={("ethereum", 0): shifted})  # the other two still agree
    assert S.c.get_attestation("m1", 1)["ratio_bps"] == 10500
    S.vm.warp(at(700))
    with pytest.raises(Exception, match="could not be read"):
        S.attest(variants={("ethereum", 0): shifted, ("ethereum", 1): shifted})


def test_a_non_hex_address_of_the_right_length_is_refused(S):
    with pytest.raises(Exception, match="20 bytes"):
        S.c.register("m9", "n", "ethereum", TOKEN, 1, 1, 10000, 86400, json.dumps([row(holder="zz" * 20)]))
    with pytest.raises(Exception, match="20 bytes"):
        S.c.register("m9", "n", "ethereum", "yy" * 20, 1, 1, 10000, 86400, json.dumps([row()]))


def test_a_liability_token_with_six_decimals_scales_correctly(S):
    eth = S.chains["ethereum"]
    eth.dec = {TOKEN: 6}
    eth.supply = {TOKEN: 1000 * 10**6}
    S.attest()
    a = S.c.get_attestation("m1", 1)
    assert a["liabilities"] == str(1000 * 10**6) and a["reserves_total"] == str(1050 * 10**6) and a["ratio_bps"] == 10500


def test_a_challenge_records_who_made_it(S, direct_bob):
    S.attest()
    challenge(S, direct_bob)
    assert S.c.get_challenge("m1", 1)["challenger"].lower() == to_hex(direct_bob).lower()


def test_a_challenge_is_allowed_again_exactly_one_day_later(S, direct_bob):
    S.attest()
    challenge(S, direct_bob)
    S.vm.warp(at(700))
    S.attest()
    S.vm.warp(at(86400))
    challenge(S, direct_bob)
    assert S.c.get_monitor("m1")["open_challenges"] == 1


# ---------------------------------------------------------------- what is asked of the providers


def _module():
    import sys

    return next(m for m in sys.modules.values() if hasattr(m, "_read_chain") and hasattr(m, "CHAINS") and hasattr(m, "Ballast"))


def test_the_requests_ask_for_exactly_the_right_things(S, monkeypatch):
    rows = [row(holder=H1), row(asset=USDC, holder=H2)]
    S.chains["ethereum"].dec = {TOKEN: 18, USDC: 6}
    wants = wants_for(rows, "ethereum", TOKEN)
    mock_world(S.vm, S.chains, wants)
    mod = _module()
    seen = []
    real = mod._rpc

    def spy(url, tag, calls):
        seen.append((url.split("//")[1], tag, calls))
        return real(url, tag, calls)

    monkeypatch.setattr(mod, "_rpc", spy)
    got = mod._read_chain("ethereum", wants["ethereum"], None)
    assert got is not None
    pin = hex(HEAD0["ethereum"] - 32)
    heads = [x for x in seen if x[1] == "head"]
    datas = [x for x in seen if x[1] == "data"]
    assert [h[0] for h in heads] == list(HOSTS["ethereum"]) and [d[0] for d in datas] == list(HOSTS["ethereum"])
    assert heads[0][2] == [("eth_blockNumber", []), ("eth_chainId", [])]
    lo, hi = sorted([USDC, TOKEN])
    assert datas[0][2] == [
        ("eth_getBlockByNumber", [pin, False]),
        ("eth_call", [{"to": "0x" + USDC, "data": "0x70a08231" + "0" * 24 + H2}, pin]),  # sorted by asset: "cc..." comes before "native"
        ("eth_getBalance", ["0x" + H1, pin]),
        ("eth_call", [{"to": "0x" + lo, "data": "0x313ce567"}, pin]),
        ("eth_call", [{"to": "0x" + hi, "data": "0x313ce567"}, pin]),
        ("eth_call", [{"to": "0x" + TOKEN, "data": "0x18160ddd"}, pin]),
    ]
    assert all(d[2] == datas[0][2] for d in datas)


# ---------------------------------------------------------------------------- validators


def test_a_validator_that_sees_the_same_accepts(S):
    S.attest()
    assert S.vm.run_validator() is True


def test_a_validator_that_sees_different_balances_rejects(S):
    S.attest()
    other = Chain("ethereum")
    other.native, other.dec, other.supply = {H1: 600 * E18, H2: 1 * E18}, {TOKEN: 18}, {TOKEN: 1000 * E18}
    S.world(variants={("ethereum", 0): other, ("ethereum", 1): other, ("ethereum", 2): other})
    assert S.vm.run_validator() is False


def test_a_validator_rejects_a_leader_result_that_was_altered(S):
    S.attest()
    stored = S.vm._captured_validators[-1][0]
    forged = json.loads(json.dumps(stored))
    key = next(k for k in forged["chains"]["ethereum"]["vals"] if k.startswith("bal:"))
    forged["chains"]["ethereum"]["vals"][key] = str(10**30)
    assert S.vm.run_validator(leader_result=forged) is False
    forged = json.loads(json.dumps(stored))
    forged["chains"]["ethereum"]["hash"] = "0x" + "9" * 64
    assert S.vm.run_validator(leader_result=forged) is False


def test_a_validator_rejects_a_leader_that_failed_when_it_can_read(S):
    S.attest()
    assert S.vm.run_validator(leader_result={"ok": False, "chains": {}}) is False


def test_a_validator_agrees_a_failure_when_it_cannot_read_either(S):
    with pytest.raises(Exception, match="could not be read"):
        S.attest(down={("ethereum", 0), ("ethereum", 1), ("ethereum", 2)})
    assert S.vm.run_validator() is True


def test_a_validator_rejects_a_leader_error(S):
    S.attest()
    assert S.vm.run_validator(leader_error=Exception("boom")) is False


def test_a_validator_rejects_a_pin_in_the_future_or_too_far_back(S):
    S.attest()
    stored = S.vm._captured_validators[-1][0]
    head = HEAD0["ethereum"]
    for pin, accepted in ((head, False), (head - 1, True), (head - 900, True), (head - 901, False)):
        forged = json.loads(json.dumps(stored))
        forged["chains"]["ethereum"]["pin"] = pin
        forged["chains"]["ethereum"]["hash"] = block_hash("ethereum", pin)
        S.world(pins={"ethereum": pin})
        assert S.vm.run_validator(leader_result=forged) is accepted, pin
