import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/* Behavioral tests for the stage (b) item model. normalizeItem, estProfit
 * and parseMoney are pure functions — we extract their exact source from
 * public/coalition.js and run them, so this tests the real code, not a copy. */

function grab(js, name) {
  const m = js.match(new RegExp(`function ${name}\\([^)]*\\)\\s*\\{`));
  assert.ok(m, `${name} exists in coalition.js`);
  let i = m.index + m[0].length;
  let depth = 1;
  while (depth > 0) {
    const c = js[i++];
    if (c === "{") depth++;
    if (c === "}") depth--;
  }
  return js.slice(m.index, i);
}

const js = await readFile(join(root, "public", "coalition.js"), "utf8");
const statuses = js.match(/const LISTING_STATUSES = \[[^\]]*\];/)[0];
const fns = [grab(js, "normalizeItem"), grab(js, "estProfit"), grab(js, "parseMoney")].join("\n");
const { normalizeItem, estProfit, parseMoney } = new Function(
  `${statuses}\n${fns}\nreturn { normalizeItem, estProfit, parseMoney };`
)();

test("old items (pre-parity) get sane model defaults", () => {
  const old = normalizeItem({ id: "x", title: "Old", price: 50 });
  assert.equal(old.purchasePrice, null);
  assert.equal(old.listingStatus, "draft");
  assert.deepEqual(old.collections, []);
  assert.equal(old.category, "");
  assert.equal(old.condition, "");
  assert.equal(old.sku, "");
  assert.equal(old.grade, "");
  assert.equal(old.gradingCompany, "");
  assert.equal(old.liveChannel, "");
  // Untouched fields survive normalization.
  assert.equal(old.title, "Old");
  assert.equal(old.price, 50);
});

test("unknown listing status words reset to draft; spec words survive", () => {
  assert.equal(normalizeItem({ listingStatus: "whatever" }).listingStatus, "draft");
  for (const s of ["draft", "sorted", "photographed", "ready to list", "listed", "sold", "error"]) {
    assert.equal(normalizeItem({ listingStatus: s }).listingStatus, s);
  }
});

test("est profit = market value minus purchase price", () => {
  assert.equal(estProfit({ price: 50, purchasePrice: 30 }), 20);
  assert.equal(estProfit({ price: 50, purchasePrice: null }), 50);
  assert.equal(estProfit({ price: null, purchasePrice: 10 }), -10);
  assert.equal(estProfit({}), 0);
});

test("parseMoney handles blanks, currency formatting, and garbage", () => {
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("   "), null);
  assert.equal(parseMoney(null), null);
  assert.equal(parseMoney("$1,234.56"), 1234.56);
  assert.equal(parseMoney("29.99"), 29.99);
  assert.equal(parseMoney("abc"), null);
});
