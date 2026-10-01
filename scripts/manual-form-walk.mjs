/* MANUAL verification (not part of npm test): DOM-level walk of the stage (b)
 * item form — edit flow, add flow, live profit recalculation, inline collection
 * creation, and the storage picker — against the REAL public/index.html and
 * public/coalition.js via jsdom.
 *
 * Run:  cd /tmp && npm i jsdom   (kept out of repo deps on purpose)
 *       node scripts/manual-form-walk.mjs
 * Expect: "DOM WALK OK: edit flow + add flow + live profit + collections + storage picker"
 *
 * DOM-level walk of the stage (b) item form: add-flow and edit-flow.
 * Loads the REAL public/index.html + public/coalition.js in jsdom and
 * drives the sheet the way a tap would. */
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import assert from "node:assert/strict";

const ROOT = "/home/hatch/workspace/fob-constellation/public";

const html = await readFile(`${ROOT}/index.html`, "utf8");
let js = await readFile(`${ROOT}/coalition.js`, "utf8");
// jsdom has no module loader for the "/visor/phases.js?v=1" specifier — inline a
// minimal copy of the real phases module (it is dependency-free).
const phases = await readFile(`${ROOT}/visor/phases.js`, "utf8");
js = js.replace(/^import .*$/m, phases.replace(/export /g, ""));

const dom = new JSDOM(html, {
  url: "http://127.0.0.1:3000/",
  runScripts: "outside-only",
  beforeParse(window) {
    window.fetch = () => Promise.reject(new Error("offline in test"));
  },
});

// Provide the globals the module expects (jsdom's crypto already has randomUUID).
dom.window.ScouterImage = undefined;
dom.window.matchMedia = () => ({ matches: false, addEventListener() {} });

await dom.window.eval(js);
const { document } = dom.window;
const ls = dom.window.localStorage;
const $ = (id) => document.getElementById(id);
const core = dom.window.HUDcore;
assert.ok(core, "HUDcore is exposed");

// Seed one pre-parity item (no new fields) straight into storage, then boot state.
ls.setItem("coalition-items-v4", JSON.stringify([
  { id: "old1", title: "Old Card", quantity: 1, price: 40, phase: "intake", photos: [] },
]))
ls.setItem("coalition-spaces-v1", JSON.stringify([]));
core.state.items = JSON.parse(ls.getItem("coalition-items-v4")).map(core.normalizeItem);
core.state.spaces = [
  { id: "bin1", name: "Bin 1", kind: "ebay_listed", itemIds: [], cover: null },
  { id: "bin2", name: "Bin 2", kind: "ebay_listed", itemIds: [], cover: null },
];
core.state.collections = [];

/* ---- EDIT FLOW: open the old item, fill the form, save ---- */
core.openSheet("old1");
assert.equal($("fTitle").value, "Old Card", "title populated");
assert.equal($("fMarketValue").value, "40", "market value populated from it.price");
assert.equal($("fPurchasePrice").value, "", "purchase price blank on old item");
assert.equal($("fListingStatus").value, "draft", "status defaults to draft");
assert.ok($("fEstProfit").textContent.includes("40"), "profit readout shows market − 0");

// Type purchase price + market value → profit recalculates live.
$("fPurchasePrice").value = "25";
$("fPurchasePrice").dispatchEvent(new dom.window.Event("input", { bubbles: true }));
assert.ok($("fEstProfit").textContent.includes("15"), `profit recalculated live, saw: ${$("fEstProfit").textContent}`);

$("fMarketValue").value = "60";
$("fMarketValue").dispatchEvent(new dom.window.Event("input", { bubbles: true }));
assert.ok($("fEstProfit").textContent.includes("35"), `profit follows market edits, saw: ${$("fEstProfit").textContent}`);

// Fill the rest of the Base44 fields.
$("fCategory").value = "Trading cards";
$("fQuantity").value = "3";
$("fCondition").value = "Near mint";
$("fSku").value = "SKU-001";
$("fGrade").value = "10";
$("fGradingCompany").value = "PSA";
$("fLiveChannel").value = "eBay";
$("fListingStatus").value = "ready to list";
$("fNotes").value = "Pack fresh";
$("fSpace").value = "bin1";

// New collection via the inline row.
$("fNewCollection").value = "Evolving Skies";
$("fAddCollectionBtn").click();
assert.equal(core.state.collections.length, 1, "collection created");
const colId = core.state.collections[0].id;
assert.ok(document.querySelector(`#fCollections input[value="${colId}"]`), "new collection checkbox rendered");
document.querySelector(`#fCollections input[value="${colId}"]`).checked = true;

// Save.
$("btnSaveItem").click();
const saved = core.state.items.find((i) => i.id === "old1");
assert.equal(saved.purchasePrice, 25);
assert.equal(saved.price, 60);
assert.equal(saved.quantity, 3);
assert.equal(saved.category, "Trading cards");
assert.equal(saved.condition, "Near mint");
assert.equal(saved.sku, "SKU-001");
assert.equal(saved.grade, "10");
assert.equal(saved.gradingCompany, "PSA");
assert.equal(saved.liveChannel, "eBay");
assert.equal(saved.listingStatus, "ready to list");
assert.equal(saved.notes, "Pack fresh");
assert.equal(saved.spaceId, "bin1");
assert.equal(JSON.stringify(Array.from(saved.collections)), JSON.stringify([colId]));
assert.equal(core.estProfit(saved), 35);
// Persisted to localStorage honestly.
const persisted = JSON.parse(ls.getItem("coalition-items-v4")).find((i) => i.id === "old1");
assert.equal(persisted.purchasePrice, 25, "purchase price survived a storage round-trip");
assert.equal(persisted.gradingCompany, "PSA");

/* ---- ADD FLOW: intake item → sheet opens with blank form ---- */
core.state.items.unshift(core.normalizeItem({
  id: "new1", title: "Scan", quantity: 1, price: null, phase: "intake",
  staged: false, spaceId: null, barcode: null, channels: {}, photos: [],
}));
core.openSheet("new1");
assert.equal($("fTitle").value, "Scan");
assert.equal($("fPurchasePrice").value, "");
assert.equal($("fMarketValue").value, "");
assert.ok($("fEstProfit").textContent.includes("0"), "blank money → $0.00 profit");
assert.ok($("fCollections").querySelector("input"), "existing collection offered on new item");

console.log("DOM WALK OK: edit flow + add flow + live profit + collections + storage picker");
