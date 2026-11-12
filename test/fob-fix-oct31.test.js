import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildEbayDescription,
  runListingEngine,
  LISTING_CONFIG,
} from "../src/listing/engine.js";
import { normalizeIdentity, resolveSetName } from "../src/identify/gate.js";
import { autoAspects, listingSpecifics } from "../src/comps.js";
import { packageWeightAndSize } from "../src/channels/ebay.js";

/* Oct 31 2026 fix list, Phase 1: locked templates, set name, specifics, shipping. */

test("sign-off is Sawyer's exact line, em dash", () => {
  assert.equal(LISTING_CONFIG.signOff, "CornDogSmuggler Coalition — Operating To Marine Corps Standards.");
  const d = buildEbayDescription({ productName: "Charizard ex", setName: "Obsidian Flames", collectorNumber: "223/197", game: "Pokemon", condition: "NM" });
  assert.ok(d.endsWith(LISTING_CONFIG.signOff));
});

test("description template carries no stock filler and no shipping text", () => {
  const card = buildEbayDescription({ productName: "Charizard ex", setName: "Obsidian Flames", collectorNumber: "223/197", game: "Pokemon", rarity: "Double Rare", finish: "Holo", condition: "NM" });
  assert.doesNotMatch(card, /You get the exact/i);
  assert.doesNotMatch(card, /shipping/i);
  assert.match(card, /- Set: Obsidian Flames/);
  const sealed = buildEbayDescription({ productName: "Destined Rivals Booster Pack", game: "Pokemon", sealed: true, specifics: { Set: "Destined Rivals" } });
  assert.doesNotMatch(sealed, /You get the exact/i);
  assert.doesNotMatch(sealed, /shipping/i);
  assert.match(sealed, /- Set: Destined Rivals/);
});

test("sealed product title ends New/Factory Sealed, never NM Single", () => {
  const byKind = runListingEngine({ productName: "Destined Rivals Booster Pack", title: "Destined Rivals Booster Pack", kind: "sealed", game: "pokemon", setName: "Destined Rivals" });
  assert.equal(byKind.title, "Destined Rivals Booster Pack- New/Factory Sealed");
  const byName = runListingEngine({ productName: "Surging Sparks Booster Bundle", title: "Surging Sparks Booster Bundle", game: "pokemon" });
  assert.ok(byName.title.endsWith("- New/Factory Sealed"), byName.title);
  const card = runListingEngine({ productName: "Pikachu", title: "Pikachu", collectorNumber: "58/102", setName: "Base Set", game: "pokemon", condition: "NM" });
  assert.ok(card.title.endsWith("- NM Single"), card.title);
});

test("set resolution: specific set in the product name beats the era name", () => {
  const out = normalizeIdentity({ product_name: "Destined Rivals Booster Pack", set_name: "Scarlet and Violet", game: "Pokemon", confidence: "high" });
  assert.equal(out.set_name, "Destined Rivals");
  assert.equal(out.confidence, "high");
});

test("set resolution: an era name alone is never kept silently", () => {
  const out = normalizeIdentity({ product_name: "Booster Pack", set_name: "Scarlet and Violet", game: "Pokemon", confidence: "high" });
  assert.equal(out.confidence, "low");
  const direct = resolveSetName({ product_name: "Surging Sparks Booster Box", set_name: "Sword and Shield", game: "Pokemon" });
  assert.equal(direct.set_name, "Surging Sparks");
});

test("specifics: the item's own set name wins over a text-matched category value", () => {
  const list = [
    { name: "Set", values: ["Rivals", "Destined Rivals"] },
    { name: "Game", required: true, values: ["Pokémon TCG"] },
    { name: "Configuration", values: ["Pack", "Box"] },
  ];
  const out = listingSpecifics({ title: "Destined Rivals Booster Pack", productName: "Destined Rivals Booster Pack", setName: "Destined Rivals" }, list, null);
  assert.deepEqual(out.Set, ["Destined Rivals"]);
});

test("specifics: auto-fill never picks the tail of a longer value", () => {
  const list = [{ name: "Set", values: ["Rivals", "Destined Rivals"] }];
  const out = autoAspects(list, "Destined Rivals Booster Pack", {});
  assert.deepEqual(out.Set, ["Destined Rivals"]);
});

test("specifics: operator edits win, identified Set stands unless edited", () => {
  const list = [{ name: "Set", values: ["Destined Rivals"] }, { name: "Language", values: ["English", "Japanese"] }];
  const out = listingSpecifics({ title: "Destined Rivals Booster Pack Japanese", productName: "Destined Rivals Booster Pack", setName: "Destined Rivals", aspects: { Language: "Japanese" } }, list, null);
  assert.deepEqual(out.Set, ["Destined Rivals"]);
  assert.deepEqual(out.Language, ["Japanese"]);
});

test("packageWeightAndSize: weight required, dims optional", () => {
  assert.equal(packageWeightAndSize({}), null);
  assert.equal(packageWeightAndSize({ weightOz: 0 }), null);
  assert.deepEqual(packageWeightAndSize({ weightOz: 4 }), { weight: { value: 4, unit: "OUNCE" } });
  assert.deepEqual(packageWeightAndSize({ weightOz: "4.5", dimL: 9, dimW: 6, dimH: 1 }), { weight: { value: 4.5, unit: "OUNCE" }, dimensions: { length: 9, width: 6, height: 1, unit: "INCH" } });
});

/* Phase 2 guards (client modules load with ?v= URLs, so these pin the source) */
import { readFile } from "node:fs/promises";
const srcOf = (p) => readFile(new URL(`../private/next/${p}`, import.meta.url), "utf8");

test("inbox bulk select is not the per-item photo cap; Select all exists", async () => {
  const s = await srcOf("scouter.js");
  assert.doesNotMatch(s, /ibSel\.size >= MAX_PICK/);
  assert.match(s, /id="ibAll"/);
  assert.match(s, /pick\.length > MAX_PICK/); /* the cap lives on the Identify action only */
});

test("collection membership: positive TCG signal + a real way out", async () => {
  const s = await srcOf("collection.js");
  assert.match(s, /TCG_GAMES\.test/);
  assert.match(s, /!it\.notCollection/);
  assert.match(s, /Remove from Collection/);
  assert.match(s, /moveOutOfCollection/);
  const v = await srcOf("viewer.js");
  assert.match(v, /try \{ const p = JSON\.parse\(own\.dataset\.viewPhoto\)/); /* a bad attribute never eats the tap */
});

test("freeze guards: sync hash truncates photo bodies; observer scans coalesce", async () => {
  const sync = await srcOf("sync.js");
  assert.match(sync, /v\.length > 200/);
  assert.match(sync, /docSig/);
  const nat = await srcOf("native.js");
  assert.match(nat, /scanQueued/);
  const ch = await srcOf("channels.js");
  assert.match(ch, /chQT = setTimeout/);
});
