import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildEbayTitle,
  buildVariationTitle,
  buildEbayDescription,
  applyPricingBaseline,
  runListingEngine,
  LISTING_CONFIG,
} from "../src/listing/engine.js";

test("buildEbayTitle leads with product name, no bangs, ≤80", () => {
  const title = buildEbayTitle({
    productName: "Charizard ex",
    collectorNumber: "223",
    setName: "Obsidian Flames",
    condition: "NM",
  });
  assert.match(title, /^Charizard ex/);
  assert.doesNotMatch(title, /!/);
  assert.ok(title.length <= 80);
});

test("buildVariationTitle matches Pick Your Card template", () => {
  const title = buildVariationTitle({ setName: "Prismatic Evolutions", rarity: "Illustration Rare" });
  assert.match(title, /Pick Your Card/);
  assert.match(title, /Prismatic Evolutions/);
});

test("buildEbayDescription includes facts + locked sign-off", () => {
  const d = buildEbayDescription({
    productName: "Pikachu",
    setName: "Base",
    collectorNumber: "58",
    game: "Pokemon",
  });
  assert.match(d, /Product: Pikachu/);
  assert.match(d, /CornDogSmuggler Coalition - Operating To Marine Corps Standards\./);
  assert.doesNotMatch(d, /premium|authentic|genuine/i);
});

test("applyPricingBaseline uses config floors", () => {
  LISTING_CONFIG.activeBaseline = "sold_comps";
  const low = applyPricingBaseline(0.5, { qty: 1 });
  assert.ok(low >= 1.77 + 0.99);
  LISTING_CONFIG.activeBaseline = "tcgplayer_market";
  const floored = applyPricingBaseline(0.1, { qty: 1 });
  assert.ok(floored >= 2.0);
  LISTING_CONFIG.activeBaseline = "sold_comps";
});

test("runListingEngine returns title description specifics", () => {
  const out = runListingEngine(
    {
      productName: "Mew ex",
      setName: "151",
      collectorNumber: "151",
      game: "Pokemon",
      condition: "NM",
      quantity: 1,
    },
    { soldAvg: 10 },
  );
  assert.match(out.title, /Mew ex/);
  assert.match(out.description, /Sign-off|CornDogSmuggler/i);
  assert.equal(out.specifics.Manufacturer, "The Pokémon Company");
  assert.ok(out.suggestedPrice > 10);
});
