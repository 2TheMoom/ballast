"""The Studionet variant of GateExample. Studio cannot answer a contract-to-contract read of finalized state, so the variant reads the latest
state. Everything else must be the same contract: one test pins the two files to differ only in that read, the rest repeat the behaviour."""

import re

import pytest

from tests.direct.test_gate_example import BALLAST, LATEST_FINAL, MAX_AGE, T0, T0_TS, FakeBallast

CONTRACT = "contracts/gate_example_studio.py"


def _code(path):
    return open(path, encoding="utf-8").read().replace("\r\n", "\n")


def test_it_differs_from_gate_example_only_in_how_it_reads_ballast():
    a = _code("contracts/gate_example.py")
    b = _code("contracts/gate_example_studio.py")
    # remove the one import, the docstring note, the state argument and the two texts that said "finalized"
    a = a.replace("from genlayer.py.public_abi import StorageType\n", "")
    a = a.replace("view(state=StorageType.LATEST_FINAL)", "view()")
    a = a.replace("Ballast could not be read in finalized state", "Ballast could not be read")
    a = a.replace("The monitor has no finalized attestation yet", "The monitor has no attestation yet")
    strip = lambda s: re.sub(r'    """.*?"""\n', "", s, count=1, flags=re.S)
    assert strip(a) == strip(b)


@pytest.fixture
def G(direct_vm, direct_deploy, direct_alice):
    direct_vm.warp(T0)
    direct_vm.sender = direct_alice
    fake = FakeBallast()
    fake.install(direct_vm)
    c = direct_deploy(CONTRACT, BALLAST, "weth-eth", MAX_AGE)
    return direct_vm, c, fake


def test_it_acts_when_the_monitor_is_covered_fresh_and_undisputed(G):
    vm, c, fake = G
    c.perform("hello")
    assert c.get_state()["performed"] == 1


def test_it_reads_the_latest_state_not_finalized_state(G):
    vm, c, fake = G
    c.perform("hello")
    assert fake.calls and all(x["state"] != LATEST_FINAL for x in fake.calls)


@pytest.mark.parametrize(
    "change, text",
    [
        ({"covered": False}, "short"),
        ({"disputed": True}, "disputed"),
        ({"exists": False}, "no attestation"),
        ({"at": T0_TS - 90000, "max_age": 86400}, "too old"),
    ],
)
def test_it_refuses_a_short_disputed_missing_or_stale_attestation(G, change, text):
    vm, c, fake = G
    fake.latest.update(change)
    with pytest.raises(Exception, match=text):
        c.perform("nope")
    assert c.get_state()["performed"] == 0


def test_it_refuses_when_ballast_cannot_be_read(G):
    vm, c, fake = G
    fake.fail = True
    with pytest.raises(Exception, match="could not be read"):
        c.perform("nope")
