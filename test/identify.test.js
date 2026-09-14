import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gateCheck, emptyIdentity, normalizeIdentity, identityToItemPatch } from "../src/identify/gate.js";
import { runIdentify } from "../src/identify/router.js";
import { runBarcodeScan } from "../src/identify/barcode.js";
import { identifyFromPhotos, visionKeyStatus } from "../src/identify/vision.js";
import { searchLiveWeb } from "../src/identify/webSearch.js";
import {
  DEFAULT_VISION_MODEL,
  anthropicErrorMessage,
  parseImageDataUrl,
  toAnthropicImage,
  visionModel,
} from "../src/identify/anthropicPayload.js";

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
    const patch = identityToItemPatch(identity, "photo_search");
    assert.match(patch.title, /Charizard/);
    assert.equal(patch.productName, "Charizard");
    assert.equal(patch.collectorNumber, "4");
    assert.equal(patch.identifyPath, "photo_search");
  });
});

describe("identify router — photo-first", () => {
  it("returns honest empty result without hanging", async () => {
    const result = await runIdentify({});
    assert.equal(result.ok, false);
    assert.equal(result.path, "none");
    assert.match(result.message, /photos/i);
    assert.match(result.message, /separate/i);
    assert.equal(result.setupTask, null);
  });

  it("does not treat a barcode as Identify", async () => {
    const result = await runIdentify({
      forcePath: "barcode",
      barcode: "012345678905",
    });
    assert.equal(result.ok, false);
    assert.equal(result.path, "none");
    assert.match(result.message, /separate/i);
    assert.notEqual(result.path, "barcode");
  });

  it("photos + barcode still take the photo path, never UPC first", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await runIdentify({
      photos: [tinyPng],
      barcode: "012345678905",
    });
    assert.equal(result.ok, false);
    assert.equal(result.path, "photo_search");
    assert.notEqual(result.path, "barcode");
    assert.ok(result.setupTask || result.message);
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

  it("surfaces missing vision key for photos without spinning forever", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const keys = visionKeyStatus();
    assert.equal(keys.ready, false);

    const result = await runIdentify({ photos: [tinyPng], forcePath: "photo_search" });
    assert.equal(result.ok, false);
    assert.equal(result.path, "photo_search");
    assert.equal(result.setupTask, null);
    assert.deepEqual(result.missingKeys, []);
    assert.match(result.message, /isn't set up yet/i);
    assert.doesNotMatch(result.message || "", /ANTHROPIC|API key|API KEY|barcode/i);
  });
});

describe("non-card web verify — placeholder only", () => {
  it("marks DuckDuckGo Instant Answer as a placeholder", async () => {
    const result = await searchLiveWeb("");
    assert.equal(result.placeholder, true);
    assert.deepEqual(result.candidates, []);
  });
});

describe("barcode feature — separate from Identify", () => {
  it("empty code fails honestly", async () => {
    const result = await runBarcodeScan("");
    assert.equal(result.ok, false);
    assert.equal(result.path, "barcode");
    assert.ok(result.message);
  });
});

describe("Anthropic request payload", () => {
  it("strips the data-URL prefix and keeps only base64", () => {
    const parsed = parseImageDataUrl(tinyPng);
    assert.equal(parsed.mediaType, "image/png");
    assert.equal(parsed.data.startsWith("data:"), false);
    assert.ok(parsed.data.startsWith("iVBOR"));
  });

  it("maps image/jpg to image/jpeg", () => {
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const url = `data:image/jpg;base64,${jpegHeader.toString("base64")}`;
    const image = toAnthropicImage(url);
    assert.equal(image.source.media_type, "image/jpeg");
    assert.equal(image.source.data.includes(","), false);
  });

  it("sniffs JPEG bytes even when the data URL claims PNG", () => {
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const url = `data:image/png;base64,${jpegHeader.toString("base64")}`;
    assert.equal(toAnthropicImage(url).source.media_type, "image/jpeg");
  });

  it("rejects HEIC instead of forwarding a media_type Anthropic will 400 on", () => {
    const url = "data:image/heic;base64,AAAA";
    assert.equal(toAnthropicImage(url), null);
  });

  it("defaults to a current Claude API model id, not a dated Sonnet 4 snapshot", () => {
    const prev = process.env.IDENTIFY_VISION_MODEL;
    delete process.env.IDENTIFY_VISION_MODEL;
    assert.equal(DEFAULT_VISION_MODEL, "claude-sonnet-5");
    assert.equal(visionModel(), "claude-sonnet-5");
    if (prev !== undefined) process.env.IDENTIFY_VISION_MODEL = prev;
  });

  it("surfaces Anthropic error.message instead of a bare HTTP 400", () => {
    const body = JSON.stringify({
      type: "error",
      error: { type: "invalid_request_error", message: "model: claude-sonnet-4-20250514" },
    });
    assert.match(anthropicErrorMessage(400, body), /HTTP 400: model: claude-sonnet-4-20250514/);
  });

  it("Identify includes the provider error body when Anthropic returns 400", async () => {
    const prevKey = process.env.ANTHROPIC_API_KEY;
    const prevFetch = globalThis.fetch;
    process.env.ANTHROPIC_API_KEY = "test-key";
    let sent;
    globalThis.fetch = async (_url, opts) => {
      sent = JSON.parse(opts.body);
      return {
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            type: "error",
            error: { type: "invalid_request_error", message: "messages.0.content.0.source.media_type: Input should be 'image/jpeg'" },
          }),
      };
    };
    try {
      const result = await identifyFromPhotos({ photos: [tinyPng] });
      assert.equal(result.ok, false);
      assert.equal(sent.model, "claude-sonnet-5");
      assert.equal(typeof sent.max_tokens, "number");
      assert.ok(sent.max_tokens > 0);
      const image = sent.messages[0].content[0];
      assert.equal(image.type, "image");
      assert.equal(image.source.type, "base64");
      assert.equal(image.source.media_type, "image/png");
      assert.equal(image.source.data.startsWith("data:"), false);
      assert.match(result.message, /HTTP 400/);
      assert.match(result.message, /media_type/);
      assert.match(result.message, /Photos kept/);
    } finally {
      globalThis.fetch = prevFetch;
      if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevKey;
    }
  });
});
