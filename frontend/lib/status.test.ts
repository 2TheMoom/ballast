import { test } from "node:test";
import assert from "node:assert/strict";
import { cooldownLeft, monitorState, STATE_RISK } from "./status.ts";

const base = { exists: true, covered: true, disputed: false, at: 1000, ratioBps: 10500, seq: 1, maxAge: 86400 };

test("no attestation reads as none", () => {
  assert.equal(monitorState(undefined, 5000), "none");
  assert.equal(monitorState({ ...base, exists: false }, 5000), "none");
});

test("a dispute outranks everything else", () => {
  assert.equal(monitorState({ ...base, disputed: true, covered: false }, 1000 + 999999), "disputed");
});

test("age outranks the verdict, with the boundary still fresh", () => {
  assert.equal(monitorState(base, 1000 + 86400), "covered");
  assert.equal(monitorState(base, 1000 + 86401), "stale");
  assert.equal(monitorState({ ...base, covered: false }, 1000 + 86401), "stale");
});

test("fresh attestations read as covered or short", () => {
  assert.equal(monitorState(base, 2000), "covered");
  assert.equal(monitorState({ ...base, covered: false }, 2000), "short");
});

test("risk order puts short first and covered last", () => {
  const order = Object.entries(STATE_RISK).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  assert.deepEqual(order, ["short", "disputed", "stale", "none", "covered"]);
});

test("cooldownLeft counts down from the last success and is zero before any", () => {
  assert.equal(cooldownLeft({ lastOkAt: 1000, count: 1 }, 600, 1100), 500);
  assert.equal(cooldownLeft({ lastOkAt: 1000, count: 1 }, 600, 1600), 0);
  assert.equal(cooldownLeft({ lastOkAt: 0, count: 0 }, 600, 5), 0);
});
