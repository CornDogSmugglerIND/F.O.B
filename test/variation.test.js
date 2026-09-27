import { test } from "node:test";
import assert from "node:assert/strict";
import {
  combineVariationBatch,
  dropVariationParents,
  inferVariationMeta,
} from "../src/listing/variation.js";

test("combineVariationBatch builds Pick Your Card title and per-card lines", () => {
  const batch = combineVariationBatch([
    {
      id: "a",
      productName: "Erika's Gloom",
      collectorNumber: "002/217",
      setName: "Ascended Heroes",
      rarity: "Common",
      price: 1.5,
      quantity: 1,
    },
    {
      id: "b",
      productName: "Oddish",
      collectorNumber: "001/217",
      setName: "Ascended Heroes",
      rarity: "Common",
      price: 1.25,
      quantity: 2,
    },
  ]);
  assert.match(batch.title, /Pick Your Card/);
  assert.match(batch.title, /Ascended Heroes/);
  assert.match(batch.title, /Common/);
  assert.equal(batch.childCount, 2);
  assert.equal(batch.totalQty, 3);
  assert.equal(batch.parent.variationParent, true);
  assert.equal(batch.parent.price, null);
  assert.equal(batch.parent.quantity, 3);
  assert.ok(batch.variations.some((v) => /Erika's Gloom/.test(v.line)));
  assert.match(batch.description, /Erika's Gloom 002\/217/);
  assert.equal(batch.csv.charCodeAt(0), 0xfeff);
  assert.match(batch.csv, /Pick Your Card Common NM/);
  // Parent StartPrice column is empty (FE rule) — verified via parent.price + FE exporter unit test
  assert.match(batch.csv, /"hud-var-/);
});

test("inferVariationMeta flags mixed sets", () => {
  const meta = inferVariationMeta([
    { setName: "151", rarity: "Rare" },
    { setName: "Obsidian Flames", rarity: "Rare" },
  ]);
  assert.equal(meta.mixedSets, true);
  assert.equal(meta.setName, "Mixed Sets");
  assert.equal(meta.rarity, "Rare");
});

test("dropVariationParents keeps children only", () => {
  const kept = dropVariationParents([
    { title: "Parent", variationParent: true },
    { title: "Child", variationParent: false },
  ]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].title, "Child");
});

test("combineVariationBatch rejects single card", () => {
  assert.throws(
    () => combineVariationBatch([{ productName: "Solo" }]),
    (err) => err.code === "VALIDATION",
  );
});
