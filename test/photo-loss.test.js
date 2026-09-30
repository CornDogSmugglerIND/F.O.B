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

/* ---------- blocker #2: never lose photos on the live intake path ---------- */

test("coalition.js saveItems() is quota-guarded and never strips photos", async () => {
  const js = await src("coalition.js");
  const m = js.match(/function saveItems\(\) \{[\s\S]*?\n\}/);
  assert.ok(m, "saveItems() defined");
  const body = m[0];
  assert.ok(/try\s*\{/.test(body), "saveItems wraps the write in try");
  assert.ok(/catch/.test(body), "saveItems catches write failures");
  assert.ok(/localStorage\.setItem\(LS_ITEMS/.test(body), "saveItems still writes the items key");
  assert.ok(/QuotaExceededError/.test(body), "saveItems names the quota failure");
  assert.ok(/return true/.test(body) && /return false/.test(body), "saveItems reports success/failure");
  assert.ok(/photos are safe/i.test(body), "failure toast says photos are safe");
  assert.ok(!/photos\s*=\s*\[\]/.test(body), "saveItems never empties the photo arrays to force a fit");
});

test("coalition.js addPhotos() compresses on intake and honors a refused save", async () => {
  const js = await src("coalition.js");
  const start = js.indexOf("async function addPhotos(");
  assert.ok(start >= 0, "addPhotos defined");
  const body = js.slice(start, js.indexOf("async function addBarcode("));
  assert.ok(/ScouterImage/.test(body), "addPhotos uses the shared compressor");
  assert.ok(/compressPhoto/.test(body), "addPhotos compresses each photo on intake");
  // Compression failure must fall back to the original file, never drop the photo.
  assert.ok(/\.catch\(\(\) => file\)/.test(body) || /catch[\s\S]{0,60}file/.test(body),
    "compressor failure falls back to the original file");
  assert.ok(/if\s*\(!saveItems\(\)\)/.test(body), "addPhotos checks the save result");
  assert.ok(!/toast\(`\$\{files\.length\} on Scouter`\)[\s\S]*if\s*\(!saveItems/.test(body),
    "success toast only fires when the save succeeded");
});

test("coalition.js shrinkDataUrl() returns the original on any failure", async () => {
  const js = await src("coalition.js");
  const start = js.indexOf("async function shrinkDataUrl(");
  assert.ok(start >= 0, "shrinkDataUrl defined");
  const end = js.indexOf("async function syncEbay(");
  const body = js.slice(start, end > start ? end : start + 1200);
  assert.ok(/startsWith\("data:image\/"\)/.test(body), "non-data URLs pass through untouched");
  assert.ok(/catch\s*\{[\s\S]*?return dataUrl;/.test(body), "any shrink failure returns the original");
});

test("syncEbay() downscales oversized server photos before local storage", async () => {
  const js = await src("coalition.js");
  const start = js.indexOf("async function syncEbay(");
  assert.ok(start >= 0, "syncEbay defined");
  const body = js.slice(start, start + 2500);
  assert.ok(/shrinkDataUrl\(p\.dataUrl\)/.test(body), "synced photos go through the shrinker");
});

/* ---------- blocker #7: fulfillment never reports false success ---------- */

test("fulfillment.js mutate() refuses the mutation when the save fails", async () => {
  const js = await src("features/fulfillment.js");
  const start = js.indexOf("function mutate(id, fn, toastMsg)");
  assert.ok(start >= 0, "mutate defined");
  const body = js.slice(start, start + 1800);
  assert.ok(/saved\s*=\s*core\.saveItems\(\)/.test(body), "mutate reads the save result");
  assert.ok(/if\s*\(!saved\)/.test(body), "mutate branches on save failure");
  assert.ok(/JSON\.parse\(JSON\.stringify\(it\)\)/.test(body), "mutate snapshots the item before changing it");
  assert.ok(/core\.state\.items\[idx\] = before/.test(body), "failed save restores the pre-mutation item");
  assert.ok(/Storage full — could not save/.test(body), "failed save shows the honest storage toast");
  assert.ok(/return false/.test(body), "failed save returns false, never success");
});

/* ---------- wiring: compressor loaded, cache-busters in sync ---------- */

test("index.html and hud.html stay byte-identical with the compressor wired", async () => {
  const index = await src("index.html");
  const hud = await src("hud.html");
  assert.equal(index, hud, "index.html and hud.html are byte-identical");
  for (const html of [index, hud]) {
    assert.ok(html.includes('<script src="/lib/image.js?v=1"></script>'), "compressor script tag present");
    assert.ok(html.includes('<script src="/features/fulfillment.js?v=4"></script>'), "fulfillment v4 present");
    assert.ok(html.includes('<script type="module" src="/coalition.js?v=20"></script>'), "coalition v20 present");
  }
  // Every ?v= asset resolves to a real file under public/.
  const versions = [...index.matchAll(/src="(\/[^"]+)\?v=\d+"/g)].map((m) => m[1]);
  assert.ok(versions.length > 0, "versioned assets found");
  for (const v of versions) {
    assert.ok(existsSync(join(pub, v)), `versioned asset resolves: ${v}`);
  }
});

test("no banned words or green accents in the touched frontend files", async () => {
  for (const rel of ["coalition.js", "features/fulfillment.js", "index.html", "hud.html", "lib/image.js"]) {
    const text = await src(rel);
    assert.ok(!/rail|spine/i.test(text.replace(/trail|grail/gi, "")), `${rel}: no Rail/Spine`);
    assert.ok(
      !/#(?:00ff00|0f0|22c55e|16a34a|4caf50|008000|2e7d32|388e3c|5dce8a)\b/i.test(text),
      `${rel}: no green hexes`
    );
  }
});
