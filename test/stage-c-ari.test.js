import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const pub = join(root, "public");

async function src(rel) {
  return readFile(join(pub, rel), "utf8");
}

/* ---------- Stage C (ari lane): Command / Channels / Scouter-Intake ---------- */

test("Command tiles use Base44's full words and are tappable", async () => {
  const html = await src("index.html");
  for (const [word, goto] of [
    ["To list", "channels"],
    ["Needs bin", "spaces"],
    ["Listed", "channels"],
    ["Inventory", "constellation"],
  ]) {
    const re = new RegExp(
      `<button[^>]*class="stat"[^>]*data-goto="${goto}"[^>]*>.*?${word}`,
      "s"
    );
    assert.ok(re.test(html), `tappable .stat tile "${word}" -> ${goto}`);
  }
  // No cryptic abbreviations on the tiles.
  assert.ok(!/>TO LIST</.test(html), "no shouted TO LIST");
  assert.ok(!/>NEEDS BIN</.test(html), "no shouted NEEDS BIN");
});

test("coalition.js wires Command tiles to navigate()", async () => {
  const js = await src("coalition.js");
  assert.ok(/\.stat\[data-goto\]/.test(js), "tile selector wired");
  assert.ok(/navigate\(btn\.dataset\.goto\)/.test(js), "tiles call navigate()");
});

test("Scouter: SKU prefix control exists and persists", async () => {
  const html = await src("index.html");
  assert.ok(/id="skuPrefix"/.test(html), "#skuPrefix input on Scouter view");
  assert.ok(/SKU prefix/.test(html), "SKU prefix label uses full words");
  const js = await src("coalition.js");
  assert.ok(/coalition-sku-prefix/.test(js), "prefix persisted to localStorage");
  assert.ok(/function nextSku\(prefix\)/.test(js), "nextSku(prefix) exists");
  assert.ok(/function readSkuPrefix\(\)/.test(js), "readSkuPrefix exists");
});

test("Intake: one batch id per photo drop, SKUs auto-number from prefix", async () => {
  const js = await src("coalition.js");
  assert.ok(/const batchId = uid\(\);/.test(js), "batch id minted per addPhotos drop");
  assert.ok(/batchId,/.test(js) || /batchId:/.test(js), "batchId stored on the item");
  assert.ok(/sku: skuPrefix \? nextSku\(skuPrefix\) : ""/.test(js), "auto-SKU only when prefix set");
  assert.ok(/it\.batchId === undefined.*it\.batchId = null/s.test(js), "normalizeItem defaults batchId");
});

test("Scouter renders intake grouped by scan batch with counts and values", async () => {
  const js = await src("coalition.js");
  assert.ok(/function paintBatches\(rootId, items\)/.test(js), "paintBatches exists");
  assert.ok(/function batchLabel\(batchId, items\)/.test(js), "batchLabel exists");
  assert.ok(/function batchValue\(items\)/.test(js), "batchValue exists");
  assert.ok(/paintBatches\("pkgIntake", intake\)/.test(js), "intake uses batch rendering");
  assert.ok(/Earlier scans/.test(js), "legacy scans without batchId get an honest group");
});

test("Channels: fulfilment strip carries Base44's five shipping stages", async () => {
  const html = await src("index.html");
  assert.ok(/id="ffStageRow"/.test(html), "#ffStageRow strip on Channels view");
  const js = await src("coalition.js");
  for (const label of [
    "Ready to ship",
    "Dropped at carrier",
    "Carrier scanned",
    "Out for delivery",
    "Delivered",
  ]) {
    assert.ok(js.includes(`"${label}"`), `FF_STAGES has "${label}"`);
  }
  assert.ok(/function fulfilStage\(it\)/.test(js), "fulfilStage(it) exists");
  // Honest mapping: sold->ready, packed->dropped, shipped->scanned/out, delivered->delivered.
  assert.ok(/if \(ph === "sold"\) return "ready"/.test(js), "sold maps to Ready to ship");
  assert.ok(/if \(ph === "packed"\) return "dropped"/.test(js), "packed maps to Dropped at carrier");
  assert.ok(/it\.outForDeliveryAt \? "out" : "scanned"/.test(js), "shipped splits on the recorded tap");
  assert.ok(/if \(ph === "delivered"\) return "delivered"/.test(js), "delivered maps to Delivered");
  // Tapping a stage filters; tapping again clears.
  assert.ok(/state\.channelStageFilter/.test(js), "stage filter state exists");
});

test("Channels: Active and Ended listings are separate sections with counts", async () => {
  const html = await src("index.html");
  assert.ok(/id="channelGridEnded"/.test(html), "#channelGridEnded exists");
  assert.ok(/Active listings/.test(html), "Active listings header uses full words");
  assert.ok(/Ended listings/.test(html), "Ended listings header uses full words");
  assert.ok(/id="activeCount"/.test(html), "#activeCount exists");
  assert.ok(/id="endedCount"/.test(html), "#endedCount exists");
  const js = await src("coalition.js");
  assert.ok(/paintChannelGrid\(\s*\$\("channelGrid"\),\s*active,/.test(js), "active grid painted");
  assert.ok(/paintChannelGrid\(\s*\$\("channelGridEnded"\),\s*ended,/.test(js), "ended grid painted");
});

test("Fulfilment: Out for delivery is a recorded sub-stage of shipped", async () => {
  const js = await src("features/fulfillment.js");
  assert.ok(/function outForDeliveryItem\(id\)/.test(js), "outForDeliveryItem exists");
  assert.ok(/x\.outForDeliveryAt = nowIso\(\);/.test(js), "records outForDeliveryAt");
  assert.ok(/OUT FOR DELIVERY/.test(js), "status line shows the sub-stage");
  assert.ok(/it\.outForDeliveryAt\)\s*\n?\s*\? \{ label: "Mark delivered"/.test(js) ||
    /outForDeliveryAt\)/.test(js), "shipped next-action branches on the sub-stage");
  assert.ok(/"OUT FOR DELIVERY", run: "out"/.test(js), "queue offers the out-for-delivery tap");
  const core = await src("coalition.js");
  assert.ok(/it\.outForDeliveryAt === undefined.*it\.outForDeliveryAt = null/s.test(core),
    "normalizeItem defaults outForDeliveryAt");
});

test("cache versions bumped for changed bundles", async () => {
  for (const page of ["index.html", "hud.html"]) {
    const html = await src(page);
    assert.ok(html.includes("/coalition.js?v=30"), `${page}: coalition.js?v=30`);
    assert.ok(html.includes("/coalition.css?v=29"), `${page}: coalition.css?v=29`);
  }
});

test("index.html and hud.html stay identical", async () => {
  const a = await src("index.html");
  const b = await src("hud.html");
  assert.equal(a, b, "entry points identical");
});

test("no banned words in the new Stage C surface copy", async () => {
  const html = await src("index.html");
  const js = await src("coalition.js");
  const ff = await src("features/fulfillment.js");
  for (const [name, text] of [["index.html", html], ["coalition.js", js], ["fulfillment.js", ff]]) {
    for (const w of ["Rail", "Spine", "Deploy", "Archive", "Purge", "Supply"]) {
      const re = new RegExp(`\\b${w}\\b`);
      assert.ok(!re.test(text), `${name}: banned word "${w}"`);
    }
  }
});

test("stage filter pool includes non-channel items in that fulfilment stage", async () => {
  const js = await src("coalition.js");
  // Regression: strip counted a locally-sold item (no channel listing) but the
  // filtered grids came up empty. With a filter active the pool must widen.
  assert.ok(/state\.channelStageFilter\s*\n?\s*\?\s*state\.items\.filter\(\(i\) => inPool\(i\) \|\| stageOk\(i\)\)/.test(js),
    "filtered pool = channel items + items in the stage");
});

test("SKU prefix saves on input, not only on blur/change", async () => {
  const js = await src("coalition.js");
  assert.ok(/skuInput\.addEventListener\("input"/.test(js),
    "prefix persists on every keystroke (reload before blur keeps it)");
});
