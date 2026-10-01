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

function fnBody(js, startMarker, endMarker) {
  const start = js.indexOf(startMarker);
  assert.ok(start >= 0, `${startMarker} defined`);
  const end = js.indexOf(endMarker, start);
  return js.slice(start, end > start ? end : start + 3000);
}

/* ---------- blocker #4a: demo seed is explicit opt-in, never automatic ---------- */

test("boot() never auto-seeds demo items; the old force-seeder is gone", async () => {
  const js = await src("coalition.js");
  assert.ok(!/seedDemoIfEmpty/.test(js), "seedDemoIfEmpty() fully removed");
  assert.ok(!/DEMO_SEED_FLAG/.test(js), "demo seed flag fully removed");
  const boot = fnBody(js, "async function boot()", "boot();");
  assert.ok(!/seedDemo/i.test(boot), "boot() makes no seed call — fresh installs start empty");
});

test("seedDemoItems() is opt-in, append-only, and rolls back on save failure", async () => {
  const js = await src("coalition.js");
  const body = fnBody(js, "function seedDemoItems()", "async function fileToDataUrl(");
  assert.ok(/notes === "demo-seed"/.test(body), "skips when demo items already exist");
  assert.ok(/return 0/.test(body), "reports zero when nothing was added");
  assert.ok(/state\.items\.push\(\.\.\.demo(\.map\(normalizeItem\))?\)/.test(body), "appends demo items — never wipes real items");
  assert.ok(!/state\.items = \[/.test(body), "never replaces the whole item array");
  assert.ok(/if\s*\(!saveItems\(\)\)/.test(body), "checks the save result");
  assert.ok(/state\.items\.length = itemsBefore/.test(body), "rolls back the push when storage refuses");
  assert.ok(/saveSpaces\(\)/.test(body), "persists space assignments on success");
  assert.ok(/"demo-seed"/.test(body), "demo rows keep the demo-seed marker for Clear demo data");
  assert.ok(/seedDemoItems,/.test(js.match(/window\.HUDcore = \{[\s\S]*?\};/)[0]),
    "seedDemoItems exposed on HUDcore for Settings");
});

test("Settings offers Load demo data next to Clear demo data; flag removed", async () => {
  const js = await src("features/settings.js");
  assert.ok(/data-action="load-demo"/.test(js), "Load demo data button exists");
  assert.ok(/Load demo data/.test(js), "button uses full words");
  assert.ok(/function loadDemoData\(\)/.test(js), "loadDemoData() defined");
  assert.ok(/action === "load-demo"/.test(js), "delegated click handler routes load-demo");
  assert.ok(/core\.seedDemoItems\(\)/.test(js), "loads through the HUD core seeder");
  assert.ok(/Demo data already loaded/.test(js), "double-load is an honest no-op, not a duplicate");
  assert.ok(!/LS_DEMO_FLAG/.test(js), "demo flag removed from settings");
  assert.ok(!/demo flag/.test(js), "no stale demo-flag copy in Settings");
  assert.ok(/function clearDemoData\(\)/.test(js), "Clear demo data still exists and works");
});

/* ---------- blocker #4b: real delete-item path in the item sheet ---------- */

test("item sheet has a Delete button with a two-tap confirm", async () => {
  for (const f of ["index.html", "hud.html"]) {
    const html = await src(f);
    assert.ok(html.includes('id="btnDeleteItem"'), `${f} has the Delete button`);
    assert.ok(/btnDeleteItem">Delete</.test(html), `${f} button uses the full word Delete`);
  }
  const js = await src("coalition.js");
  const body = fnBody(js, "function deleteItem(id)", "async function addPhotos(");
  assert.ok(/deleteArmedId !== id/.test(body), "first tap arms instead of deleting");
  assert.ok(/Tap again to delete/.test(body), "armed state says what the second tap does");
  assert.ok(/setTimeout\(disarmDelete, 3000\)/.test(body), "arm auto-expires after 3s");
  assert.ok(/state\.items\.splice\(idx, 1\)/.test(body), "second tap removes the item from state");
  assert.ok(/sp\.itemIds\.filter/.test(body) || /itemIds = sp\.itemIds\.filter/.test(body),
    "deleted item is pruned from every space's itemIds");
  assert.ok(/if\s*\(!saveItems\(\)\)/.test(body), "honors a refused save");
  assert.ok(/state\.items\.splice\(idx, 0, it\)/.test(body), "restores the item when storage refuses");
  assert.ok(/closeSheet\(\)/.test(body), "sheet closes after a successful delete");
  assert.ok(/render\(\)/.test(body), "view re-renders after a successful delete");
  assert.ok(/toast\("Deleted"\)/.test(body), "honest one-word confirmation toast");
  assert.ok(!/photos\s*=\s*\[\]/.test(body), "delete never touches other items' photos");
  assert.ok(/\$\("btnDeleteItem"\)\?\.addEventListener\("click"/.test(js), "Delete button is bound");
  assert.ok(/disarmDelete\(\)/.test(fnBody(js, "function openSheet(id)", "window.HUD_openSheet")),
    "opening a sheet resets a stale delete arm");
});

test("delete works for demo-seeded items too", async () => {
  const js = await src("coalition.js");
  // deleteItem matches by id only — no notes/demo filter, so demo rows delete
  // through the same path as real rows.
  const body = fnBody(js, "function deleteItem(id)", "async function addPhotos(");
  assert.ok(/findIndex\(\(x\) => x\.id === id\)/.test(body), "delete targets by id, no demo exclusion");
  assert.ok(!/demo-seed/.test(body), "no special-casing that would spare demo items");
});

/* ---------- wiring: cache-busters in sync, pages identical ---------- */

test("index.html and hud.html stay byte-identical with bumped versions", async () => {
  const a = await src("index.html");
  const b = await src("hud.html");
  assert.equal(a, b, "index.html and hud.html are byte-identical");
  for (const v of ["coalition.js?v=25", "coalition.css?v=19", "features/settings.js?v=5"]) {
    assert.ok(a.includes(v), `${v} referenced`);
    const file = v.split("?")[0].replace(/^\//, "");
    assert.ok(existsSync(join(pub, file)), `${file} exists on disk`);
  }
});

test("no banned words or green accents in the touched frontend files", async () => {
  for (const f of ["coalition.js", "coalition.css", "features/settings.js", "index.html", "hud.html"]) {
    const text = await src(f);
    assert.ok(!/rail|spine/i.test(text.replace(/trail|grail/gi, "")), `${f}: no Rail/Spine`);
    assert.ok(!/#(00ff00|22c55e|16a34a|4caf50|008000|2e7d32|388e3c|5dce8a)\b/i.test(text),
      `${f}: no green hexes`);
  }
});
