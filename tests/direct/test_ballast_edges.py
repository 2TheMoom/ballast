"""Boundary tests found by the mutation check: the exact edges of the id and name limits, and removals that would together empty a monitor."""

import json

import pytest

from tests.direct.test_ballast import H1, H2, TOKEN, S, at, row  # noqa: F401  (S is a fixture)


def reg(S, **kw):
    args = dict(monitor_id="mx", name="n", liab_chain="ethereum", liab_token=TOKEN, unit_num=1, unit_den=1, min_ratio_bps=10000, max_age=86400, reserves=json.dumps([row()]))
    args.update(kw)
    S.c.register(**args)


def test_the_id_may_be_exactly_64_characters_and_one_character(S):
    reg(S, monitor_id="x" * 64)
    reg(S, monitor_id="y")
    assert set(S.c.get_monitor_ids()) >= {"x" * 64, "y"}


def test_the_name_may_be_exactly_60_characters_and_one_character(S):
    reg(S, monitor_id="a", name="n" * 60)
    reg(S, monitor_id="b", name="n")
    assert S.c.get_monitor("a")["name"] == "n" * 60


def test_two_scheduled_removals_cannot_together_empty_a_monitor(S):
    S.c.schedule_removal("m1", "ethereum", "native", H1)
    S.c.schedule_removal("m1", "ethereum", "native", H2)  # each alone leaves one, so both are accepted when scheduled
    S.vm.warp(at(86400))
    S.c.apply_removal("m1", "ethereum", "native", H1)
    with pytest.raises(Exception, match="keeps at least one"):
        S.c.apply_removal("m1", "ethereum", "native", H2)
    assert [r["holder"] for r in S.c.get_monitor("m1")["reserves"]] == [H2]


def test_cancelling_a_removal_that_was_never_scheduled_is_refused(S):
    with pytest.raises(Exception, match="No such scheduled removal"):
        S.c.cancel_removal("m1", "ethereum", "native", H1)


def test_an_attestation_records_the_liability_tokens_decimals(S):
    S.attest()
    assert S.c.get_attestation("m1", 1)["liab_decimals"] == 18
    S.chains["ethereum"].dec = {TOKEN: 6}
    S.chains["ethereum"].supply = {TOKEN: 1000 * 10**6}
    S.vm.warp(at(700))
    S.attest()
    assert S.c.get_attestation("m1", 2)["liab_decimals"] == 6


def test_a_monitor_counts_every_challenge_ever_made(S, direct_alice, direct_bob):
    S.attest()
    assert S.c.get_monitor("m1")["n_challenges"] == 0
    for who, n in ((direct_alice, 1), (direct_bob, 2)):
        S.vm.sender = who
        S.c.challenge("m1", "stale", "", "", "", "", "")
        assert S.c.get_monitor("m1")["n_challenges"] == n
    S.vm.warp(at(700))
    S.attest()
    assert S.c.get_monitor("m1")["n_challenges"] == 2 and S.c.get_monitor("m1")["open_challenges"] == 0
