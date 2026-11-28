import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanProductName, normalizeIdentity } from "../src/identify/gate.js";
import { buildEbayTitle } from "../src/listing/engine.js";

/* Nov 27: Sawyer's Iono's Bellibolt ex box came back as "... Premium
   Collection Scarlet and Violet promos". The era is never part of a
   product's name once the name is already complete. */
test("cleanProductName cuts packaging copy after the product kind", () => {
  assert.equal(
    cleanProductName("Iono's Bellibolt ex Premium Collection Scarlet and Violet promos"),
    "Iono's Bellibolt ex Premium Collection",
  );
  assert.equal(
    cleanProductName("Charizard ex Super Premium Collection Scarlet & Violet promo cards"),
    "Charizard ex Super Premium Collection",
  );
  assert.equal(cleanProductName("Surging Sparks Booster Bundle, promos"), "Surging Sparks Booster Bundle");
});

test("cleanProductName keeps an era that is the product's real name", () => {
  assert.equal(cleanProductName("Scarlet & Violet 151 Booster Box"), "Scarlet & Violet 151 Booster Box");
  assert.equal(
    cleanProductName("Scarlet and Violet Base Set Elite Trainer Box"),
    "Scarlet and Violet Base Set Elite Trainer Box",
  );
  assert.equal(cleanProductName("Pikachu ex"), "Pikachu ex");
});

test("the junk never reaches the eBay title", () => {
  const id = normalizeIdentity(
    { product_name: "Iono's Bellibolt ex Premium Collection Scarlet and Violet promos", game: "Pokemon" },
    1,
  );
  assert.equal(buildEbayTitle({ productName: id.product_name, sealed: true }),
    "Iono's Bellibolt ex Premium Collection- New/Factory Sealed");
});
