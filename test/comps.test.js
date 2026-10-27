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

import { cleanComps, numberForms, pickTcgPrice, marketValue } from "../src/comps.js";
test("numberForms handles padded and plain numbers", () => {
  assert.deepEqual(numberForms("046/128").sort(), ["046", "46"].sort());
  assert.ok(numberForms("6").includes("006"));
});
test("pickTcgPrice follows the finish", () => {
  const p = { normal: { marketPrice: 0.2 }, "reverse-holofoil": { marketPrice: 0.58 } };
  assert.equal(pickTcgPrice(p, "Reverse Holo").value, 0.58);
  assert.equal(pickTcgPrice(p, "Normal").value, 0.2);
  assert.equal(pickTcgPrice({ holofoil: { marketPrice: 7.83 } }, "Normal").value, 7.83);
});
test("cleanComps drops slabs, lots, proxies and other cards", () => {
  const items = [
    { title: "Pikachu 046/128 30th Celebration NM", price: { value: "2.00" } },
    { title: "Pikachu 046/128 PSA 10 30th Celebration", price: { value: "80.00" } },
    { title: "Pikachu lot x10 30th Celebration", price: { value: "15.00" } },
    { title: "Pikachu 034/128 30th Celebration", price: { value: "2.50" } },
    { title: "PIKACHU #46 30th celebration mint", price: { value: "1.80" } },
  ];
  assert.deepEqual(cleanComps(items, { name: "Pikachu", number: "046/128" }), [2, 1.8]);
});
test("marketValue: eBay median sold x 1.30, never TCGplayer", async () => {
  const fetchImpl = async () => { throw new Error("TCGplayer must not be called"); };
  const request = async (path) => path.includes("marketplace_insights") ? { itemSales: [2, 3, 4, 50].map((v) => ({ title: "Pikachu ex 238/191 Surging Sparks", lastSoldPrice: { value: String(v) } })) } : { itemSummaries: [] };
  const r = await marketValue({ name: "Pikachu ex", number: "238/191", set: "Surging Sparks", game: "Pokemon" }, { fetchImpl, request });
  assert.equal(r.ok, true); assert.equal(r.sold, 3.5); assert.equal(r.value, 4.55); assert.match(r.basis, /eBay sold median/);
});
test("marketValue: never under the $1.77 floor", async () => {
  const request = async (path) => path.includes("marketplace_insights") ? { itemSales: [0.2, 0.25, 0.3].map((v) => ({ title: "Iris's Fighting Spirit 149/159 Journey Together", lastSoldPrice: { value: String(v) } })) } : { itemSummaries: [] };
  const r = await marketValue({ name: "Iris's Fighting Spirit", number: "149/159", set: "Journey Together" }, { request });
  assert.equal(r.value, 1.77);
});
test("marketValue falls back to cleaned eBay when no TCGplayer price", async () => {
  const fetchImpl = async () => ({ ok: false, json: async () => ({}) });
  const request = async () => ({ itemSummaries: [1.5, 1.8, 2, 2.2, 9].map((v) => ({ title: `Pikachu 046/128 30th Celebration`, price: { value: String(v) } })) });
  const r = await marketValue({ name: "Pikachu", number: "046/128", set: "30th Celebration", game: "Pokemon" }, { fetchImpl, request });
  assert.equal(r.ok, true); assert.ok(r.value >= 1.5 && r.value <= 2.2, String(r.value)); assert.match(r.basis, /eBay/);
});
