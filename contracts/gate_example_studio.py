# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from datetime import datetime, timezone
from genlayer import *


def _bad(c: bool, m: str) -> None:
    if c:
        raise gl.vm.UserError(m)


class GateExample(gl.Contract):
    """The smallest possible consumer of Ballast. perform() records a note, but only while the monitor it is pinned to has a covered,
    undisputed, fresh attestation in Ballast's latest state. STUDIONET VARIANT of gate_example.py: Studio cannot answer a contract-to-contract
    read of finalized state, so this one reads the latest state and an attestation it relies on may not be final yet. It holds no value: it exists to show that another contract can refuse
    to act on a Ballast monitor that is short, stale or disputed. The monitor and the age limit are fixed at deployment."""

    ballast: Address
    monitor_id: str
    max_age: u256
    performed: u256
    last_note: str
    last_by: str
    last_at: u256

    def __init__(self, ballast: str, monitor_id: str, max_age: int):
        self.ballast = ballast if isinstance(ballast, Address) else Address(ballast)
        self.monitor_id = monitor_id
        self.max_age = max_age

    def _now(self) -> int:
        return int(datetime.now(timezone.utc).timestamp())

    def _refusal(self) -> str:
        """Why this contract would refuse right now, or an empty string if it would act."""
        try:
            r = gl.get_contract_at(self.ballast).view().get_latest(self.monitor_id)
            exists, covered, disputed, at, limit = r["exists"], r["covered"], r["disputed"], r["at"], r["max_age"]
        except Exception:
            return "Ballast could not be read"
        if type(at) is not int or type(limit) is not int:
            return "Ballast answered in a shape this contract does not accept"
        if not exists:
            return "The monitor has no attestation yet"
        if disputed:
            return "The latest attestation is disputed"
        if not covered:
            return "The latest attestation shows the reserves are short"
        if self._now() - at > min(limit, int(self.max_age)):
            return "The latest attestation is too old"
        return ""

    @gl.public.write
    def perform(self, note: str) -> None:
        _bad(not isinstance(note, str) or not 0 < len(note) <= 200, "note must be 1 to 200 characters")
        why = self._refusal()
        _bad(why != "", why)
        self.performed = self.performed + 1
        self.last_note = note
        self.last_by = gl.message.sender_address.as_hex
        self.last_at = self._now()

    @gl.public.view
    def get_state(self) -> dict:
        return {
            "ballast": self.ballast.as_hex, "monitor_id": self.monitor_id, "max_age": self.max_age, "performed": self.performed,
            "last_note": self.last_note, "last_by": self.last_by, "last_at": self.last_at,
        }
