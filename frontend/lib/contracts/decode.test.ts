import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeAttestation, decodeChallenge, decodeHistory, decodeLatest, decodeMonitor, plain } from "./decode.ts";

test("plain flattens Maps, arrays and bigints", () => {
  const m = new Map<string, unknown>([["a", 5n], ["b", [new Map<string, unknown>([["c", 1]])]], ["big", 10n ** 30n]]);
  assert.deepEqual(plain(m), { a: 5, b: [{ c: 1 }], big: (10n ** 30n).toString() });
});

test("decodeMonitor reads a get_monitor answer", () => {
  const m = decodeMonitor(
    new Map<string, unknown>([
      ["id", "m1"], ["name", "Example"], ["registrant", "0xabc"], ["liab_chain", "ethereum"], ["liab_token", "ab".repeat(20)], ["unit_num", 1n], ["unit_den", 1n],
      ["min_ratio_bps", 10000n], ["max_age", 86400n], ["reserves", [new Map<string, unknown>([["chain", "base"], ["asset", "native"], ["holder", "11".repeat(20)], ["label", "Cold"]])]],
      ["pending", [new Map<string, unknown>([["chain", "base"], ["asset", "native"], ["holder", "11".repeat(20)], ["at", 123n]])]], ["version", 2n], ["created_at", 5n], ["last_ok_at", 6n],
      ["count", 3n], ["open_challenges", 1n], ["n_challenges", 4n],
    ])
  );
  assert.equal(m.name, "Example");
  assert.equal(m.reserves[0].chain, "base");
  assert.equal(m.pending[0].at, 123);
  assert.equal(m.nChallenges, 4);
  assert.equal(m.minRatioBps, 10000);
});

test("decodeAttestation keeps big numbers as strings and defaults decimals to 18", () => {
  const a = decodeAttestation({
    seq: 2, at: 99, ratio_bps: 10500, covered: true, reserves_total: "1050", liabilities: "1000", lines: [{ chain: "ethereum", asset: "native", holder: "aa", label: "x", raw: "600", decimals: 18, value: "600" }],
    blocks: { ethereum: { number: 24000000, hash: "0xh" } }, probe: null, disputed: false, version: 1,
  });
  assert.equal(a.liabDecimals, 18);
  assert.equal(a.reservesTotal, "1050");
  assert.equal(a.blocks.ethereum.number, 24000000);
  assert.equal(a.probe, null);
  assert.equal(decodeAttestation({ liab_decimals: 6 }).liabDecimals, 6);
});

test("decodeLatest, decodeHistory and decodeChallenge", () => {
  assert.deepEqual(decodeLatest({ exists: true, covered: false, disputed: true, at: 7, ratio_bps: 9000, seq: 3, max_age: 600 }), { exists: true, covered: false, disputed: true, at: 7, ratioBps: 9000, seq: 3, maxAge: 600 });
  assert.deepEqual(decodeHistory([{ seq: 1, at: 2, ratio_bps: 10100, covered: true, disputed: false }]), [{ seq: 1, at: 2, ratioBps: 10100, covered: true, disputed: false }]);
  const c = decodeChallenge({ challenger: "0xc", at: 1, seq: 2, reason: "stale", evidence: "e", statement: "s", probe: { chain: "base", asset: "native", holder: "bb", label: "p", raw: "5", decimals: 18, value: "5" }, open: true, cleared_by: 0 }, 7);
  assert.equal(c.n, 7);
  assert.equal(c.probe?.holder, "bb");
  assert.equal(c.open, true);
});
