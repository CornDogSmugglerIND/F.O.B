import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const pub = join(root, "public");

async function src(rel) {
  return readFile(join(pub, rel), "utf8");
}
async function repo(rel) {
  return readFile(join(root, rel), "utf8");
}

/* ---------- blocker #6: listing engine titles follow the locked rules ---------- */

test("engine twins stay byte-identical (server + client run the same locked rules)", async () => {
  const server = await repo("src/listing/engine.js");
  const client = await src("visor/listing-engine.js");
  assert.equal(client, server, "public/visor/listing-engine.js === src/listing/engine.js");
});

test("coalition.js runEngine is client-only: no dead server POST, no silent 404 fallback", async () => {
  const js = await src("coalition.js");
  assert.ok(
    !js.includes("/api/scouter/items/${encodeURIComponent(id)}/listing-engine"),
    "no server listing-engine POST with client-generated ids",
  );
  assert.ok(
    !/fall through to client engine/.test(js),
    "no silent-fallback comment path remains",
  );
  const m = js.match(/async function runEngine\(id\) \{[\s\S]*?\n\}/);
  assert.ok(m, "runEngine defined");
  assert.ok(
    m[0].includes('await import("/visor/listing-engine.js?v=2")'),
    "runEngine imports the versioned client engine",
  );
  assert.ok(m[0].includes("it.title = listing.title"), "engine title is persisted back");
});

test("versioned visor imports resolve to real files", async () => {
  const js = await src("coalition.js");
  const variation = await src("visor/variation.js");
  assert.ok(js.includes('"/visor/variation.js?v=2"'), "coalition.js imports variation.js?v=2");
  assert.ok(
    variation.includes('"/visor/listing-engine.js?v=2"'),
    "variation.js imports listing-engine.js?v=2",
  );
  assert.ok(existsSync(join(pub, "visor/listing-engine.js")), "visor/listing-engine.js on disk");
  assert.ok(existsSync(join(pub, "visor/variation.js")), "visor/variation.js on disk");
});

test("both HTML files load coalition.js?v=23 and stay byte-identical", async () => {
  const index = await src("index.html");
  const hud = await src("hud.html");
  assert.equal(index, hud, "index.html and hud.html are byte-identical");
  assert.ok(
    index.includes('<script type="module" src="/coalition.js?v=36"></script>'),
    "coalition v20 present in both",
  );
});

test("no banned words or green accents in the title-path files", async () => {
  for (const rel of ["coalition.js", "visor/listing-engine.js", "visor/variation.js"]) {
    const text = await src(rel);
    assert.ok(!/rail|spine/i.test(text.replace(/trail|grail/gi, "")), `${rel}: no Rail/Spine`);
    assert.ok(
      !/#(?:00ff00|0f0|22c55e|16a34a|4caf50|008000|2e7d32|388e3c|5dce8a)\b/i.test(text),
      `${rel}: no green hexes`,
    );
  }
});

test("server engine keeps the locked endings (via src/listing/engine.js)", async () => {
  const { buildEbayTitle, buildVariationTitle } = await import("../src/listing/engine.js");
  assert.equal(
    buildEbayTitle({ productName: "Charizard ex", collectorNumber: "223/197", setName: "Obsidian Flames" }),
    "Charizard ex 223/197 Obsidian Flames- NM Single",
  );
  assert.equal(
    buildEbayTitle({ productName: "Elite Trainer Box", sealed: true }),
    "Elite Trainer Box- New/Factory Sealed",
  );
  assert.equal(
    buildVariationTitle({ setName: "151", game: "Pokemon" }),
    "151 Pick Your Card Pokemon TCG Singles NM",
  );
});
