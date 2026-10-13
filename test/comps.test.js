import test from "node:test";
import assert from "node:assert/strict";
import { medianPrice, activeComps } from "../src/comps.js";

test("median trims top outliers when enough comps", () => {
  assert.equal(medianPrice([5, 6, 7, 8, 9, 500]), 7);
  assert.equal(medianPrice([10]), 10);
  assert.equal(medianPrice([]), null);
});
test("activeComps maps Browse results to a value", async () => {
  const r = await activeComps("pikachu vmax 044", { request: async () => ({ itemSummaries: [{ price: { value: "4.00" } }, { price: { value: "6.00" } }, { price: { value: "8.00" } }] }) });
  assert.equal(r.ok, true); assert.equal(r.value, 6); assert.equal(r.count, 3);
});
test("activeComps is honest on failure", async () => {
  assert.equal((await activeComps("ab")).ok, false);
  assert.equal((await activeComps("pikachu vmax", { request: async () => { throw new Error("not connected"); } })).ok, false);
  assert.equal((await activeComps("zzzz qqqq", { request: async () => ({ itemSummaries: [] }) })).ok, false);
});
