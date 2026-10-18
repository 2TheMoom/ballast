import { test } from "node:test";
import assert from "node:assert/strict";
import { addressProblem, normAddress } from "./validate.ts";

test("an address is 20 bytes of hex, with or without 0x, in any case", () => {
  assert.equal(addressProblem("0x" + "a".repeat(40)), "");
  assert.equal(addressProblem("A".repeat(40)), "");
  assert.equal(addressProblem("  0x" + "1b".repeat(20) + "  "), "");
});

test("anything else is refused with a sentence", () => {
  for (const bad of ["", "0x", "0x12", "z".repeat(40), "0x" + "a".repeat(41), "0x" + "a".repeat(39)]) {
    assert.match(addressProblem(bad, "The probe address"), /^The probe address must be 20 bytes of hex/);
  }
});

test("normAddress lowercases and drops 0x, as the contract does", () => {
  assert.equal(normAddress(" 0xABCDEF "), "abcdef");
});
