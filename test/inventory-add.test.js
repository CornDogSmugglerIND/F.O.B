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

/* ---------- branch 7 fix: restored pages + Inventory "+ Add item" ---------- */

/* Blocker from Claude's d364a4d review: three phone-workflow pages were
 * swept up as dead code. They are live routes in vercel.json and must exist. */
test("restored pages exist, are routed, and are full pages", async () => {
  const vercel = await src("../vercel.json");
  for (const page of ["listing-copy.html", "trio-setup.html", "hud-status.html"]) {
    const html = await src(page);
    assert.ok(html.length > 1000, `${page}: not an empty shell`);
    assert.ok(/<\/html>/i.test(html), `${page}: complete document`);
    assert.ok(
      new RegExp(`"source":\\s*"/${page.replace(".", "\\.")}"`).test(vercel),
      `vercel.json still routes /${page}`
    );
  }
});

/* Claude's second message: Sawyer had no way to add an item from Inventory.
 * The fix is a button that reuses Scouter's intake — not a second form. */
test('Inventory renders a "+ Add item" button wired to Scouter intake', async () => {
  const js = await src("features/collection.js");
  assert.ok(/id="invAddBtn"/.test(js), "button markup is rendered");
  assert.ok(/\+ Add item/.test(js), "button reads '+ Add item'");
  assert.ok(/startInventoryIntake/.test(js), "button calls HUDcore.startInventoryIntake");
  // No second intake built here: no own file picker, no own item creation,
  // no own form or sheet. Item creation stays in addPhotos; naming stays in
  // the ONE item sheet.
  assert.ok(!/input type="file"/.test(js), "no second file picker is built");
  assert.ok(!/state\.items\.unshift/.test(js), "no second item-creation path");
  assert.ok(!/new FormData/.test(js), "no second form is built");
  assert.ok(!/itemSheet/.test(js), "no second sheet is built");
});

test("empty state points at the new button, not at the Scouter tab", async () => {
  const js = await src("features/collection.js");
  assert.ok(!/Add them from the Scouter tab/.test(js), "old dead-end copy is gone");
  assert.ok(/\+ Add item/.test(js), "empty state names the button");
});

/* coalition.js: one intake entry, two doors. startInventoryIntake opens the
 * SAME gallery picker Scouter uses; the change handler routes the save back. */
test("coalition.js exposes startInventoryIntake on the shared intake path", async () => {
  const js = await src("coalition.js");
  assert.ok(/function startInventoryIntake\(\)/.test(js), "startInventoryIntake defined");
  assert.ok(/startInventoryIntake,/.test(js), "exposed on window.HUDcore");
  assert.ok(
    /\$\("inputGallery"\)\?\.click\(\)/.test(js),
    "startInventoryIntake clicks the SAME gallery input Scouter uses"
  );
  assert.ok(
    /inputGallery[\s\S]{0,200}fromInventory: inventoryIntake/.test(js),
    "gallery change handler passes the inventory flag to addPhotos"
  );
});

test("addPhotos honors fromInventory: saved confirmation, sheet opens, no Scouter detour", async () => {
  const js = await src("coalition.js");
  const start = js.indexOf("async function addPhotos(");
  assert.ok(start >= 0, "addPhotos defined");
  const body = js.slice(start, js.indexOf("async function addBarcode("));
  // Photo-loss rule still first: a refused save returns before any success path.
  const refuseAt = body.indexOf("if (!saveItems()) return;");
  const invAt = body.indexOf("opts.fromInventory") >= 0 ? body.indexOf("opts.fromInventory") : body.indexOf("fromInventory");
  assert.ok(refuseAt >= 0 && invAt > refuseAt, "refused save returns before the inventory branch");
  assert.ok(/opts && opts\.fromInventory/.test(body), "inventory branch is guarded by opts.fromInventory");
  assert.ok(/toast\("Item added"\)/.test(body), "saved confirmation toast");
  // Extract just the inventory branch block and check it in isolation.
  const branchStart = body.indexOf("if (opts && opts.fromInventory) {");
  assert.ok(branchStart >= 0, "inventory branch block found");
  const branchEnd = body.indexOf("}", branchStart);
  const branch = body.slice(branchStart, branchEnd);
  assert.ok(/render\(\)/.test(branch) && /openSheet\(firstNewId\)/.test(branch),
    "inventory path repaints and opens the new item's sheet for name entry");
  assert.ok(!/on Scouter|navigate\("scouter"\)/.test(branch),
    "inventory path never toasts about Scouter or navigates away");
});

test("cache-busters bumped and index.html == hud.html", async () => {
  const index = await src("index.html");
  const hud = await src("hud.html");
  assert.equal(index, hud, "hud.html is byte-identical to index.html");
  for (const v of ["coalition.js?v=45", "features/collection.js?v=10", "features/collection.css?v=9"]) {
    assert.ok(index.includes(v), `${v} present in both pages`);
  }
});

test("no banned words or green styling in the touched frontend files", async () => {
  for (const f of ["coalition.js", "features/collection.js", "features/collection.css"]) {
    const body = await src(f);
    assert.ok(!/rail|spine/i.test(body.replace(/trail|grail/gi, "")), `${f}: no Rail/Spine`);
    assert.ok(
      !/#(00ff00|0f0|22c55e|16a34a|4caf50|008000|2e7d32|388e3c)/i.test(body),
      `${f}: no green hexes`
    );
  }
});
