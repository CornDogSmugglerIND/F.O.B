import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const pub = join(root, "public");

async function src(rel) {
  return readFile(join(pub, rel), "utf8");
}

/* ---------- blocker #9: Spaces bins with swappable photo slots ---------- */

test("defaultSpaces() ships no fake bin photos — covers default to null", async () => {
  const js = await src("coalition.js");
  const start = js.indexOf("function defaultSpaces()");
  assert.ok(start >= 0, "defaultSpaces defined");
  const body = js.slice(start, js.indexOf("function loadSpaces()"));
  assert.ok(!/\/spaces\//.test(body), "no /spaces/ stock-art paths in the defaults");
  assert.ok(/cover: null/.test(body), "covers default to null (empty slot)");
});

test("loadSpaces() migrates old stock-art covers to the empty slot", async () => {
  const js = await src("coalition.js");
  const start = js.indexOf("function loadSpaces()");
  assert.ok(start >= 0, "loadSpaces defined");
  const body = js.slice(start, js.indexOf("function saveSpaces()"));
  assert.ok(/startsWith\("\/spaces\/"\)/.test(body), "stock-art covers are detected");
  assert.ok(/merged\.cover = null/.test(body), "stock-art covers become the empty slot");
});

test("saveSpaces() is quota-guarded and reports success/failure", async () => {
  const js = await src("coalition.js");
  const start = js.indexOf("function saveSpaces()");
  assert.ok(start >= 0, "saveSpaces defined");
  const body = js.slice(start, js.indexOf("function uid()"));
  assert.ok(/try\s*\{/.test(body), "saveSpaces wraps the write in try");
  assert.ok(/QuotaExceededError/.test(body), "saveSpaces names the quota failure");
  assert.ok(/return true/.test(body) && /return false/.test(body), "saveSpaces reports success/failure");
  assert.ok(/nothing changed/i.test(body), "failure toast is honest — nothing changed");
});

test("assignSpace() rolls back when the save is refused", async () => {
  const js = await src("coalition.js");
  const start = js.indexOf("function assignSpace(");
  assert.ok(start >= 0, "assignSpace defined");
  const body = js.slice(start, js.indexOf("async function probeEbay()"));
  assert.ok(/const before = it\.spaceId/.test(body), "assignSpace snapshots the old bin");
  assert.ok(/if\s*\(!saveItems\(\)\)/.test(body), "assignSpace checks the save result");
  assert.ok(/it\.spaceId = before/.test(body), "assignSpace restores the old bin on failure");
  assert.ok(!/toast\(`Filed in[\s\S]*?if\s*\(!saveItems/.test(body),
    "the Filed toast never fires before the save is confirmed");
});

test("renderSpaces() shows an obvious empty photo slot, never fake art", async () => {
  const js = await src("coalition.js");
  const start = js.indexOf("function renderSpaces()");
  assert.ok(start >= 0, "renderSpaces defined");
  const body = js.slice(start, js.indexOf("function listingStatusLabel("));
  assert.ok(/ph-bin-empty/.test(body), "empty slot class rendered");
  assert.ok(/Tap to add photo/.test(body), "empty slot says Tap to add photo");
  assert.ok(!/\/spaces\//.test(body), "renderSpaces references no stock-art path");
});

test("spaces.js moveItemToSpace() and unfileItem() roll back on failed saves", async () => {
  const js = await src("features/spaces.js");
  assert.ok(/function persistItems\(\)[\s\S]{0,400}return (h\.saveItems\(\) === true|true)/.test(js),
    "persistItems reports the save result");
  const mv = js.slice(js.indexOf("function moveItemToSpace("), js.indexOf("function unfileItem("));
  assert.ok(/var before = it\.spaceId/.test(mv), "moveItemToSpace snapshots the old bin");
  assert.ok(/if\s*\(!persistItems\(\)\)/.test(mv), "moveItemToSpace checks the save result");
  assert.ok(/it\.spaceId = before/.test(mv), "moveItemToSpace restores the old bin on failure");
  const uf = js.slice(js.indexOf("function unfileItem("), js.indexOf("/* ---------------- bin photo slot"));
  assert.ok(/it\.spaceId = null/.test(uf), "unfileItem returns the item to unsorted");
  assert.ok(/if\s*\(!persistItems\(\)\)/.test(uf) && /it\.spaceId = before/.test(uf),
    "unfileItem rolls back when the save is refused");
  assert.ok(/data-unfile/.test(js), "remove-from-bin button exists in the bin grid");
});

test("spaces.js bin photo slot: swappable, data-URLs only, rollback on failure", async () => {
  const js = await src("features/spaces.js");
  assert.ok(/binDetailCover/.test(js), "cover slot button exists in the bin overlay");
  assert.ok(/binCoverChooser/.test(js), "photo chooser exists");
  assert.ok(/function safeCover/.test(js), "cover sanitizer defined");
  assert.ok(/indexOf\("data:image\/"\) === 0/.test(js), "only data:image/ URLs render as covers");
  assert.ok(/Tap to add photo/.test(js), "empty slot is obviously a placeholder");
  assert.ok(/data-cover-pick/.test(js), "can pick a bin photo from the bin's item photos");
  assert.ok(/data-cover-act="camera"/.test(js) && /capture.*environment/.test(js),
    "fresh capture offered via the camera");
  assert.ok(/data-cover-act="remove"/.test(js), "cover can be removed back to the empty slot");
  assert.ok(/compressPhoto/.test(js), "fresh captures go through the shared compressor");
  const sc = js.slice(js.indexOf("function setSpaceCover("), js.indexOf("function coverInput("));
  assert.ok(/var before = sp\.cover/.test(sc), "setSpaceCover snapshots the old cover");
  assert.ok(/if\s*\(!persistSpaces\(\)\)/.test(sc) && /sp\.cover = before/.test(sc),
    "setSpaceCover rolls back when the save is refused");
  assert.ok(!/\/spaces\//.test(js), "spaces.js references no stock-art path");
});

test("inventory-tools search finds items by bin name", async () => {
  const js = await src("features/inventory-tools.js");
  const start = js.indexOf("function matches(");
  assert.ok(start >= 0, "matches defined");
  const body = js.slice(start, js.indexOf("function photoSrc("));
  assert.ok(/spaceName\(it\.spaceId\)/.test(body), "the bin name is a searchable field");
});

test("inventory-tools runBulk() rolls back a refused bulk file", async () => {
  const js = await src("features/inventory-tools.js");
  assert.ok(/function persist\(items\)[\s\S]{0,300}return b\.saveItems\(\) === true/.test(js),
    "persist reports the save result");
  const start = js.indexOf("function runBulk(");
  assert.ok(start >= 0, "runBulk defined");
  const body = js.slice(start, js.indexOf("/* ---------- search bar UI"));
  assert.ok(/before\[it\.id\]/.test(body), "runBulk snapshots the fields it touches");
  assert.ok(/if\s*\(!persist\(items\)\)/.test(body), "runBulk checks the save result");
  assert.ok(/it\.spaceId = b\.spaceId/.test(body), "runBulk restores the old bin on failure");
});

test("stock-art bin photos are gone from the repo", async () => {
  const dir = join(pub, "spaces");
  const entries = existsSync(dir) ? await readdir(dir) : [];
  assert.deepEqual(entries.filter((f) => /\.jpe?g$/i.test(f)), [], "no bin jpg files remain");
  for (const f of ["coalition.js", "features/spaces.js", "index.html", "hud.html"]) {
    assert.ok(!(await src(f)).includes("/spaces/bin"), `${f}: no stock-art bin path`);
  }
});

test("no Card-number placeholder text in the spaces or collection renders", async () => {
  for (const f of ["features/spaces.js", "features/collection.js"]) {
    const text = await src(f);
    assert.ok(!/Card #/.test(text), `${f}: no "Card #" placeholder text`);
  }
});

test("index.html and hud.html stay byte-identical with bumped versions", async () => {
  const a = await src("index.html");
  const b = await src("hud.html");
  assert.equal(a, b, "index.html and hud.html are byte-identical");
  for (const v of ["coalition.js?v=29", "coalition.css?v=24", "features/spaces.js?v=4", "features/spaces.css?v=3", "features/inventory-tools.js?v=3"]) {
    assert.ok(a.includes(v), `${v} referenced`);
    const file = v.split("?")[0].replace(/^\//, "");
    assert.ok(existsSync(join(pub, file)), `${file} exists on disk`);
  }
});

test("no banned words or green accents in the touched frontend files", async () => {
  for (const f of ["coalition.js", "coalition.css", "features/spaces.js", "features/spaces.css", "features/inventory-tools.js", "index.html", "hud.html"]) {
    const text = await src(f);
    assert.ok(!/rail|spine/i.test(text.replace(/trail|grail/gi, "")), `${f}: no Rail/Spine`);
    assert.ok(!/#(00ff00|22c55e|16a34a|4caf50|008000|2e7d32|388e3c|5dce8a)\b/i.test(text),
      `${f}: no green hexes`);
  }
});
