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

test("buildEbayTitle: TCG single ends 'NM Single', locked order, no #", () => {
  const title = buildEbayTitle({
    productName: "Charizard ex",
    collectorNumber: "223/197",
    setName: "Obsidian Flames",
    condition: "NM",
  });
  assert.equal(title, "Charizard ex 223/197 Obsidian Flames- NM Single");
  assert.doesNotMatch(title, /!/);
  assert.doesNotMatch(title, /#/);
  assert.ok(title.length <= 80);
});

test("buildEbayTitle: single with finish keeps it before the locked ending", () => {
  const title = buildEbayTitle({
    productName: "Moonbreon",
    collectorNumber: "215/167",
    setName: "Twilight Masquerade",
    finish: "Holo",
    game: "Pokemon",
  });
  assert.equal(title, "Moonbreon 215/167 Twilight Masquerade Holo- NM Single");
});

test("buildEbayTitle: sealed ends 'New/Factory Sealed', never bare 'Sealed'", () => {
  const title = buildEbayTitle({
    productName: "Dragon Ball Super TCG SD16 Darkness Reborn Starter Deck",
    sealed: true,
  });
  assert.equal(
    title,
    "Dragon Ball Super TCG SD16 Darkness Reborn Starter Deck- New/Factory Sealed",
  );
  assert.doesNotMatch(title, /- Sealed$/);
});

test("buildEbayTitle: truncation never cuts the locked ending", () => {
  const long = buildEbayTitle({
    productName: "A".repeat(100),
    collectorNumber: "001/100",
    setName: "Some Very Long Set Name Here",
    game: "Pokemon",
  });
  assert.ok(long.length <= 80, `within 80 chars: ${long.length}`);
  assert.match(long, /- NM Single$/);
  const longSealed = buildEbayTitle({ productName: "B".repeat(100), sealed: true });
  assert.ok(longSealed.length <= 80);
  assert.match(longSealed, /- New\/Factory Sealed$/);
});

test("buildEbayTitle: non-card, non-sealed items get no locked ending", () => {
  const title = buildEbayTitle({ productName: "Microwave Oven", condition: "Used" });
  assert.doesNotMatch(title, /NM Single/);
  assert.match(title, /^Microwave Oven/);
});

test("buildVariationTitle follows Sawyer's locked rule, not the old template", () => {
  const title = buildVariationTitle({
    setName: "Prismatic Evolutions",
    rarity: "Illustration Rare",
    game: "Pokemon",
  });
  assert.equal(title, "Prismatic Evolutions Pick Your Card Pokemon TCG Singles NM");
  assert.ok(title.length <= 80);
});

test("buildVariationTitle: set leads, game named, ≤80", () => {
  const title = buildVariationTitle({ setName: "151", game: "Pokemon" });
  assert.equal(title, "151 Pick Your Card Pokemon TCG Singles NM");
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
  assert.match(out.title, /- NM Single$/, "single title ends with the locked NM Single");
  assert.match(out.description, /Sign-off|CornDogSmuggler/i);
  assert.equal(out.specifics.Manufacturer, "The Pokémon Company");
  assert.ok(out.suggestedPrice > 10);
});
