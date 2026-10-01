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

/* ---------- branch 6: the Collection/Inventory tab is the honest inventory surface ---------- */

test("collection.js reads the working store, not a parallel keeper store", async () => {
  const js = await src("features/collection.js");
  assert.ok(
    /HUDcore\.state\.items|coalition-items-v4/.test(js),
    "inventory surface reads the live/working item store"
  );
  assert.ok(!/coalition-collection-v1/.test(js), "no parallel keeper store remains");
});

test("tapping an item opens the ONE existing item sheet — no second sheet is built", async () => {
  const js = await src("features/collection.js");
  assert.ok(
    /HUDcore\.openSheet|window\.HUD_openSheet/.test(js),
    "item tap routes to the existing sheet opener"
  );
  assert.ok(!/colFormSheet|colDetailSheet/.test(js), "no second sheet markup is built");
  assert.ok(!/openDetail|saveForm/.test(js), "keeper form/detail code is gone");
});

test("each inventory card shows photo, name, stage, and bin", async () => {
  const js = await src("features/collection.js");
  assert.ok(/photos\[0\]\.dataUrl|photos\?\.\[0\]/.test(js), "card renders the item photo");
  assert.ok(/item\.title \|\| item\.productName/.test(js), "card renders the item name");
  assert.ok(/PHASE_LABELS\[phaseOf\(item\)\]/.test(js), "card renders the stage label");
  assert.ok(/binName\(item\)/.test(js), "card renders the bin name");
});

test("stage labels mirror /visor/phases.js and cover all seven stages", async () => {
  const js = await src("features/collection.js");
  for (const id of ["intake", "staged", "listed", "sold", "packed", "shipped", "delivered"]) {
    assert.ok(js.includes(`${id}: "`), `phase label present for ${id}`);
  }
  assert.ok(/keep in sync with \/visor\/phases\.js/i.test(js), "sync comment names the source of truth");
  const phases = await src("visor/phases.js");
  for (const id of ["intake", "staged", "listed", "sold", "packed", "shipped", "delivered"]) {
    assert.ok(phases.includes(`id: "${id}"`), `phases.js still defines ${id}`);
  }
});

test("source of truth is explicit in the UI copy", async () => {
  const js = await src("features/collection.js");
  assert.ok(/On this device/.test(js), '"On this device" source line is rendered');
});

test("empty state is honest and points at the add button", async () => {
  const js = await src("features/collection.js");
  assert.ok(/No items yet/.test(js), "empty state says there are no items");
  assert.ok(/\+ Add item/.test(js), "empty state points at the + Add item button");
});

test("demo items are marked honestly", async () => {
  const js = await src("features/collection.js");
  assert.ok(/item\.demo/.test(js), "demo flag is read from the item");
  assert.ok(/inv-demo/.test(js), "demo badge markup exists");
});

test("no placeholder-text item rendering", async () => {
  const js = await src("features/collection.js");
  assert.ok(!/Card #/.test(js), 'no "Card #id" placeholder text');
});

test("module contract preserved for the host app", async () => {
  const js = await src("features/collection.js");
  assert.ok(/window\.HUD_collection = \{/.test(js), "HUD_collection contract exposed");
  assert.ok(/init:\s*init/.test(js) || /{ init, render, refresh/.test(js), "init/render/refresh present");
  assert.ok(/constellationCollection/.test(js), "still renders into #constellationCollection");
});

test("cache busters bumped in both HTML files; files stay byte-identical", async () => {
  const index = await src("index.html");
  const hud = await src("hud.html");
  assert.equal(index, hud, "index.html and hud.html are byte-identical");
  for (const asset of ["features/collection.js?v=4", "features/collection.css?v=5"]) {
    assert.ok(index.includes(asset), `${asset} referenced in HTML`);
    const file = asset.split("?")[0];
    const body = await src(file);
    assert.ok(body.length > 100, `${file} resolves to a real file`);
  }
});

test("Inventory toggle label replaced the Collection label in both HTML files", async () => {
  const index = await src("index.html");
  assert.ok(/data-cmode="collection"[^>]*>Inventory</.test(index), "toggle reads Inventory");
  assert.ok(!/>Collection</.test(index), "no visible Collection label remains");
});

test("no banned words and no green styling in the touched frontend files", async () => {
  for (const f of ["features/collection.js", "features/collection.css"]) {
    const body = await src(f);
    assert.ok(!/rail|spine/i.test(body.replace(/trail|grail/gi, "")), `${f}: no Rail/Spine`);
    assert.ok(
      !/#(00ff00|0f0|22c55e|16a34a|4caf50|008000|2e7d32|388e3c)/i.test(body),
      `${f}: no green hexes`
    );
  }
});
