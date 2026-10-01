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

/* ---------- stage (b): Base44 parity — full item model + Add/Edit form ---------- */

const FORM_IDS = [
  "fTitle", "fCategory", "fQuantity", "fPurchasePrice", "fMarketValue",
  "fEstProfit", "fListingStatus", "fSpace", "fCollections", "fNewCollection",
  "fAddCollectionBtn", "fCondition", "fSku", "fGrade", "fGradingCompany",
  "fLiveChannel", "fNotes", "btnSaveItem",
];

test("sheet carries every Base44 field in both HTML entry points", async () => {
  for (const page of ["index.html", "hud.html"]) {
    const html = await src(page);
    for (const id of FORM_IDS) {
      assert.ok(new RegExp(`id="${id}"`).test(html), `${page}: missing #${id}`);
    }
  }
});

test("labels use full words — purchase price and profit are unambiguous", async () => {
  const html = await src("index.html");
  for (const label of [
    "Purchase price", "Market value", "Est. profit (auto)", "Listing status",
    "Storage location", "Collections", "Condition", "SKU", "Grade",
    "Grading company", "Live channel", "Notes", "Save details",
  ]) {
    assert.ok(html.includes(label), `missing label "${label}"`);
  }
  // Sawyer's complaint: the old "estimated value" vagueness must not survive.
  assert.ok(!/estimated value/i.test(html), "no 'estimated value' copy anywhere");
});

test("no second form or second sheet — the ONE item sheet is the editor", async () => {
  const js = await src("coalition.js");
  assert.ok(/function saveItemForm\(id\)/.test(js), "saveItemForm exists");
  assert.ok(/function paintSheetForm\(it\)/.test(js), "paintSheetForm exists");
  // One sheet only: the form renders inside #itemSheet.
  const html = await src("index.html");
  const sheets = (html.match(/class="sheet"/g) || []).length;
  assert.equal(sheets, 2, "only the item sheet and the barcode sheet exist");
});

test("item model: normalizeItem defaults are backward-compatible", async () => {
  const js = await src("coalition.js");
  assert.ok(/function normalizeItem\(it\)/.test(js), "normalizeItem exists");
  assert.ok(/it\.purchasePrice === undefined.*it\.purchasePrice = null/s.test(js), "purchasePrice defaults to null");
  assert.ok(/it\.listingStatus = "draft"/.test(js), "listingStatus defaults to draft");
  assert.ok(/if \(!Array\.isArray\(it\.collections\)\) it\.collections = \[\];/.test(js), "collections defaults to []");
  for (const f of ["category", "condition", "sku", "grade", "gradingCompany", "liveChannel"]) {
    assert.ok(new RegExp(`it\\.${f} === undefined.*it\\.${f} = ""`, "s").test(js), `${f} defaults to ""`);
  }
  assert.ok(/loadItems\(\)[\s\S]{0,400}\.map\(normalizeItem\)/.test(js), "loadItems normalizes old rows");
});

test("est profit is market value minus purchase price", async () => {
  const js = await src("coalition.js");
  assert.ok(
    /function estProfit\(it\) \{\s*return \(Number\(it && it\.price\) \|\| 0\) - \(Number\(it && it\.purchasePrice\) \|\| 0\);/.test(js),
    "estProfit = price − purchasePrice"
  );
  // Live recalc: both money inputs repaint the profit readout on every keystroke.
  assert.ok(/\$?\("fPurchasePrice"\)\?\.addEventListener\("input", repaintProfit\)/.test(js), "purchase input recalculates");
  assert.ok(/\$?\("fMarketValue"\)\?\.addEventListener\("input", repaintProfit\)/.test(js), "market input recalculates");
  assert.ok(/function repaintProfit\(\)/.test(js), "repaintProfit exists");
  assert.ok(/\$?\("fEstProfit"\)/.test(js), "profit readout is painted");
});

test("listing status uses Base44's words; grade + grading company are present", async () => {
  const js = await src("coalition.js");
  for (const s of ["draft", "sorted", "photographed", "ready to list", "listed", "sold", "error"]) {
    assert.ok(js.includes(`"${s}"`), `listing status word missing: ${s}`);
  }
  for (const g of ["PSA", "BGS", "CGC", "SGC"]) {
    assert.ok(js.includes(`"${g}"`), `grading company missing: ${g}`);
  }
  for (const c of ["eBay", "Double Holo", "Misprint", "Shopify", "Courtyard", "Facebook Marketplace"]) {
    assert.ok(js.includes(`"${c}"`), `live channel missing: ${c}`);
  }
});

test("storage picker lists the Spaces bins; collections are multi-select", async () => {
  const js = await src("coalition.js");
  assert.ok(/function renderSpaceOptions\(selectedId\)/.test(js), "bin picker renders from state.spaces");
  assert.ok(/No bin assigned/.test(js), "picker has a no-bin option");
  assert.ok(/LS_COLLECTIONS = "coalition-collections-v1"/.test(js), "collections have their own store");
  assert.ok(/function addCollection\(name\)/.test(js), "inline collection creation exists");
  assert.ok(/type="checkbox"/.test(js), "collections render as checkboxes (multi-select)");
  assert.ok(/it\.collections = checkedCollectionIds\(\)/.test(js), "save persists the checked collections");
});

test("saveItemForm keeps the honest-save contract (rollback, no photo stripping)", async () => {
  const js = await src("coalition.js");
  const start = js.indexOf("function saveItemForm(id)");
  assert.ok(start >= 0, "saveItemForm found");
  const body = js.slice(start, js.indexOf("function repaintProfit") >= 0 ? js.length : start + 4000).slice(0, 4000);
  assert.ok(/JSON\.stringify\(it\)/.test(body), "item is snapshotted before mutation");
  assert.ok(/if \(!saveItems\(\)\)/.test(body), "save failure is detected");
  assert.ok(/toast\("Item updated"\)/.test(body), "success says Item updated");
  assert.ok(!/stripPhoto|photo = null/.test(body), "no photo stripping in the save path");
  // Space change keeps bin membership consistent (mirrors assignSpace semantics).
  assert.ok(/it\.spaceId = newSpace/.test(body), "storage picker writes spaceId");
});

test("sheet meta line shows purchase-model money, not the old vague price", async () => {
  const js = await src("coalition.js");
  assert.ok(/Market \$\{money\(it\.price \|\| 0\)\} · Profit \$\{money\(estProfitTotal\(it\)\)\}/.test(js),
    "sheet meta reads: phase · status · qty · Market · Profit");
});

test("inventory cards show est profit", async () => {
  const js = await src("features/collection.js");
  assert.ok(/Profit " \+ money\(profit\)/.test(js), "card meta shows est profit");
  assert.ok(/HUDcore\.estProfit/.test(js), "card uses the shared estProfit helper");
});

test("cache-busters bumped and entry points stay byte-identical", async () => {
  const index = await src("index.html");
  const hud = await src("hud.html");
  assert.equal(index, hud, "index.html and hud.html are byte-identical");
  for (const v of ["coalition.js?v=25", "coalition.css?v=19", "features/collection.js?v=6"]) {
    assert.ok(index.includes(v), `${v} is referenced`);
    assert.ok(index.includes(v) && hud.includes(v), `${v} resolves in both files`);
  }
});

test("hygiene: no banned words, no green in the touched surface", async () => {
  for (const f of ["coalition.js", "coalition.css", "index.html", "features/collection.js"]) {
    const body = await src(f);
    assert.ok(!/\brail\b|\bspine\b/i.test(body.replace(/trail|grail/gi, "")), `${f}: no Rail/Spine`);
    assert.ok(!/\bdeploy\b|\barchive\b|\bpurge\b|\bsupply\b/i.test(body), `${f}: no deploy/archive/purge/supply`);
    assert.ok(
      !/#(?:00ff00|0f0|22c55e|16a34a|4caf50|008000|2e7d32|388e3c|5dce8a)\b/i.test(body),
      `${f}: no green hexes`
    );
  }
});
