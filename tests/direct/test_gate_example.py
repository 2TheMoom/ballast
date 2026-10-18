"""Direct-mode tests for GateExample. A FakeBallast answers its one cross-contract call and records what state it was asked for."""

from datetime import datetime, timezone

import pytest

CONTRACT = "contracts/gate_example.py"
BALLAST = "0x" + "ba" * 20
LATEST_FINAL = 1
T0 = "2026-01-01T00:00:00Z"
T0_TS = int(datetime(2026, 1, 1, tzinfo=timezone.utc).timestamp())
MAX_AGE = 3600


class FakeBallast:
    def __init__(self):
        self.latest = {"exists": True, "covered": True, "disputed": False, "at": T0_TS, "ratio_bps": 10500, "seq": 1, "max_age": 86400}
        self.calls = []
        self.fail = False
        self.junk = None

    def install(self, vm):
        def hook(_vm, request):
            from genlayer.py import calldata

            if "CallContract" not in request:
                return None
            req = request["CallContract"]
            addr = req["address"]
            addr_hex = "0x" + (addr.as_bytes.hex() if hasattr(addr, "as_bytes") else bytes(addr).hex())
            cd = req["calldata"]
            self.calls.append({"address": addr_hex, "method": cd["method"], "args": list(cd["args"]), "state": req.get("state")})
            if self.fail:
                return bytes([1]) + b"simulated ballast error"
            if addr_hex != BALLAST or cd["method"] != "get_latest":
                return bytes([1]) + b"unexpected call"
            return bytes([0]) + calldata.encode(self.junk if self.junk is not None else dict(self.latest))

        vm._gl_call_hook = hook


@pytest.fixture
def G(direct_vm, direct_deploy, direct_alice):
    direct_vm.warp(T0)
    direct_vm.sender = direct_alice
    fake = FakeBallast()
    fake.install(direct_vm)
    c = direct_deploy(CONTRACT, BALLAST, "weth-eth", MAX_AGE)
    return direct_vm, c, fake


def test_it_acts_when_the_monitor_is_covered_fresh_and_undisputed(G, direct_alice):
    vm, c, fake = G
    c.perform("hello")
    s = c.get_state()
    assert s["performed"] == 1 and s["last_note"] == "hello" and s["last_at"] == T0_TS
    assert s["monitor_id"] == "weth-eth" and s["max_age"] == MAX_AGE


def test_it_asks_ballast_for_finalized_state_about_the_pinned_monitor_only(G):
    vm, c, fake = G
    c.perform("hello")
    assert len(fake.calls) == 1
    call = fake.calls[0]
    assert call["address"] == BALLAST and call["method"] == "get_latest" and call["args"] == ["weth-eth"] and call["state"] == LATEST_FINAL


@pytest.mark.parametrize(
    "patch,why",
    [
        ({"exists": False}, "no finalized attestation"),
        ({"disputed": True}, "disputed"),
        ({"covered": False}, "short"),
    ],
)
def test_it_refuses_when_the_attestation_is_missing_disputed_or_short(G, patch, why):
    vm, c, fake = G
    fake.latest.update(patch)
    with pytest.raises(Exception, match=why):
        c.perform("hello")
    assert c.get_state()["performed"] == 0


def test_it_refuses_when_the_attestation_is_too_old_by_its_own_limit(G):
    vm, c, fake = G
    vm.warp("2026-01-01T01:00:00Z")  # exactly MAX_AGE later
    c.perform("on the boundary")
    vm.warp("2026-01-01T01:00:01Z")
    with pytest.raises(Exception, match="too old"):
        c.perform("one second later")


def test_the_monitors_own_shorter_limit_also_applies(G):
    vm, c, fake = G
    fake.latest["max_age"] = 600
    vm.warp("2026-01-01T00:10:00Z")
    c.perform("on the boundary")
    vm.warp("2026-01-01T00:10:01Z")
    with pytest.raises(Exception, match="too old"):
        c.perform("late")


def test_it_refuses_when_ballast_cannot_be_read(G):
    vm, c, fake = G
    fake.fail = True
    with pytest.raises(Exception, match="could not be read"):
        c.perform("hello")


@pytest.mark.parametrize(
    "junk",
    [
        {"exists": True, "covered": True, "disputed": False, "at": "1", "max_age": 86400},
        {"exists": True, "covered": True, "disputed": False, "at": T0_TS, "max_age": "86400"},
        {"covered": True},
    ],
)
def test_it_refuses_a_wrong_shaped_answer(G, junk):
    vm, c, fake = G
    fake.junk = junk
    with pytest.raises(Exception):
        c.perform("hello")
    assert c.get_state()["performed"] == 0


@pytest.mark.parametrize("note", ["", "x" * 201])
def test_it_validates_the_note(G, note):
    vm, c, fake = G
    with pytest.raises(Exception, match="note must be"):
        c.perform(note)


def test_it_records_the_caller(G, direct_bob):
    vm, c, fake = G
    vm.sender = direct_bob
    c.perform("by bob")
    assert c.get_state()["last_by"].lower() == "0x" + bytes(direct_bob.as_bytes if hasattr(direct_bob, "as_bytes") else direct_bob).hex()
