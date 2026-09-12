import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gateCheck, emptyIdentity, normalizeIdentity, identityToItemPatch } from "../src/identify/gate.js";
import { runIdentify } from "../src/identify/router.js";
import { visionKeyStatus } from "../src/identify/vision.js";

const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("identify gate", () => {
  it("rejects incomplete identity", () => {
    const gate = gateCheck(emptyIdentity(1));
    assert.equal(gate.complete, false);
    assert.ok(gate.missing.includes("product_name"));
  });

  it("accepts complete identity", () => {
    const identity = normalizeIdentity(
      {
        product_name: "Erika's Gloom",
        collector_number: "002/217",
        set_name: "Ascending Heroes",
        set_code: "ASC",
        game: "Pokemon",
        rarity: "Rare",
        finish: "Holo",
        language: "English",
        condition: "NM",
        confidence: "high",
      },
      1,
    );
    const gate = gateCheck(identity);
    assert.equal(gate.complete, true);
    assert.deepEqual(gate.missing, []);
  });

  it("maps identity to item patch", () => {
    const identity = normalizeIdentity({
      product_name: "Charizard",
      collector_number: "4",
      set_name: "Base",
      set_code: "base1",
      game: "Pokemon",
      rarity: "Holo Rare",
      finish: "Holo",
      confidence: "high",
      source: "pokemontcg.io",
    });
    const patch = identityToItemPatch(identity, "catalog");
    assert.match(patch.title, /Charizard/);
    assert.equal(patch.productName, "Charizard");
    assert.equal(patch.collectorNumber, "4");
    assert.equal(patch.identifyPath, "catalog");
  });
});

describe("identify router", () => {
  it("returns honest empty result without hanging", async () => {
    const result = await runIdentify({});
    assert.equal(result.ok, false);
    assert.equal(result.path, "none");
    assert.match(result.message, /photos first/i);
    assert.equal(result.setupTask, null);
  });

  it("accepts complete manual identity", async () => {
    const result = await runIdentify({
      forcePath: "manual",
      manual: {
        product_name: "Erika's Gloom",
        collector_number: "002/217",
        set_name: "Ascending Heroes",
        set_code: "ASC",
        game: "Pokemon",
        rarity: "Rare",
        finish: "Holo",
        language: "English",
        condition: "NM",
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.path, "manual");
    assert.equal(result.identity.product_name, "Erika's Gloom");
  });

  it("says identify is not built yet for photos — never a barcode fallback", async () => {
    const keys = visionKeyStatus();
    assert.equal(keys.ready, false);
    assert.deepEqual(keys.missingKeys, []);

    const result = await runIdentify({
      photos: [tinyPng],
      barcode: "012345678905",
    });
    assert.equal(result.ok, false);
    assert.equal(result.path, "photo_search");
    assert.match(result.message, /not built yet/i);
    assert.doesNotMatch(result.message, /UPC|barcode|ANTHROPIC|API key/i);
    assert.equal(result.setupTask, null);
    assert.deepEqual(result.missingKeys, []);
  });

  it("refuses barcode as an identify path", async () => {
    const result = await runIdentify({ forcePath: "barcode", barcode: "012345678905" });
    assert.equal(result.ok, false);
    assert.equal(result.path, "none");
    assert.match(result.message, /Scan for UPC/i);
  });
});
