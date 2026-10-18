import { test } from "node:test";
import assert from "node:assert/strict";
import { ago, clock, compactUnits, formatUnits, ratioText, short, withZeroX } from "./units.ts";

const E18 = 10n ** 18n;

test("formatUnits groups whole units and trims decimals", () => {
  assert.equal(formatUnits(1042600n * E18, 18), "1,042,600");
  assert.equal(formatUnits(E18 + E18 / 4n, 18, 2), "1.25");
  assert.equal(formatUnits(E18 / 1000n, 18, 2), "0");
  assert.equal(formatUnits(5n * 10n ** 5n, 6, 2), "0.5");
  assert.equal(formatUnits("not a number", 18), "0");
});

test("formatUnits does not round up", () => {
  assert.equal(formatUnits(19999n * 10n ** 14n, 18, 2), "1.99");
});

test("compactUnits shortens big numbers", () => {
  assert.equal(compactUnits(1042600000n * E18, 18), "1.04B");
  assert.equal(compactUnits(2203409n * E18, 18), "2.20M");
  assert.equal(compactUnits(640n * E18, 18), "640");
  assert.equal(compactUnits("junk", 18), "0");
});

test("ratioText shows basis points as a percentage", () => {
  assert.equal(ratioText(10420), "104.20%");
  assert.equal(ratioText(9999), "99.99%");
  assert.equal(ratioText(10000), "100.00%");
});

test("short and withZeroX", () => {
  assert.equal(short("0x" + "a".repeat(40), 6, 4), "0xaaaa…aaaa");
  assert.equal(short("abc", 6, 4), "abc");
  assert.equal(withZeroX("ab"), "0xab");
  assert.equal(withZeroX("0xab"), "0xab");
});

test("ago and clock", () => {
  assert.equal(ago(1000, 1050), "just now");
  assert.equal(ago(1000, 1000 + 20 * 60), "20 min ago");
  assert.equal(ago(1000, 1000 + 5 * 3600), "5 h ago");
  assert.equal(ago(1000, 1000 + 3 * 86400), "3 d ago");
  assert.equal(clock(65), "1:05");
  assert.equal(clock(3 * 3600 + 5 * 60), "3 h 05 min");
  assert.equal(clock(-5), "0:00");
});
