import { test } from "node:test";
import assert from "node:assert/strict";
import {
  exportEbayFileExchange,
  exportDoubleHoloCsv,
  exportGenericTcgCsv,
} from "../src/listing/csv.js";

test("eBay FE CSV has BOM, Info line, QUOTE_ALL, no StartPrice on parents", () => {
  const csv = exportEbayFileExchange([
    { title: "Parent", variationParent: true, price: 9.99, quantity: 1, sku: "P1" },
    { title: "Child", price: 4.5, quantity: 2, sku: "C1" },
  ]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  const body = csv.replace(/^\uFEFF/, "");
  assert.match(body, /^Info,/m);
  assert.match(body, /"Parent"/);
  const lines = body.trim().split(/\r?\n/);
  const parent = lines.find((l) => l.includes('"Parent"'));
  assert.ok(parent);
  assert.match(parent, /"Parent","","","1"/);
});

test("Double Holo CSV embeds finish in brackets and always sets Language", () => {
  const csv = exportDoubleHoloCsv([
    {
      productName: "Jolteon",
      finish: "Reverse Holo",
      collectorNumber: "086/086",
      setName: "SV03",
      quantity: 1,
    },
  ]);
  assert.match(csv, /"Card Name"/);
  assert.match(csv, /Jolteon \[Reverse Holo\]/);
  assert.match(csv, /"86"/);
  assert.match(csv, /"English"/);
});

test("generic TCG CSV includes price and game", () => {
  const csv = exportGenericTcgCsv([
    { productName: "Mew", setName: "151", price: 12, game: "Pokemon", quantity: 1 },
  ]);
  assert.match(csv, /"Name"/);
  assert.match(csv, /"12.00"/);
  assert.match(csv, /"Pokemon"/);
});
