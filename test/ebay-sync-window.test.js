import test from "node:test";
import assert from "node:assert/strict";
import { syncEbayWindow } from "../src/channels/ebay.js";

const inv = Array.from({ length: 5 }, (_, i) => ({ sku: `S${i}`, product: { title: `T${i}` } }));
const list = async ({ limit, offset }) => ({ items: inv.slice(offset, offset + limit), total: inv.length });

test("window pages inventory and reports next/total", async () => {
  const request = async (path) => { const sku = decodeURIComponent(path.split("sku=")[1]); return { data: { offers: [{ sku, offerId: `o${sku}`, status: sku === "S1" ? "UNPUBLISHED" : "PUBLISHED", pricingSummary: { price: { value: "5.00" } } }] } }; };
  const a = await syncEbayWindow({ offset: 0, limit: 3, list, request });
  assert.equal(a.pulled, 3); assert.equal(a.next, 3); assert.equal(a.total, 5); assert.equal(a.failed, 0);
  assert.equal(a.records[0].phase, "listed"); assert.equal(a.records[1].ended, true); assert.ok(a.records.every((x) => x.offerKnown));
  const b = await syncEbayWindow({ offset: 3, limit: 3, list, request });
  assert.equal(b.pulled, 2); assert.equal(b.next, null);
});

test("transient offer failures are retried; permanent ones are flagged, not guessed", async () => {
  const seen = {};
  const request = async (path) => {
    const sku = decodeURIComponent(path.split("sku=")[1]); seen[sku] = (seen[sku] || 0) + 1;
    if (sku === "S0" && seen[sku] < 3) throw Object.assign(new Error("429"), { status: 429 });
    if (sku === "S2") throw Object.assign(new Error("500"), { status: 500 });
    if (sku === "S3") throw Object.assign(new Error("none"), { status: 404 });
    return { data: { offers: [{ sku, offerId: "o", status: "PUBLISHED" }] } };
  };
  const r = await syncEbayWindow({ offset: 0, limit: 5, list, request });
  assert.equal(r.records[0].offerKnown, true); assert.equal(r.records[0].phase, "listed");
  assert.equal(r.records[2].offerKnown, false); assert.equal(r.failed, 1);
  assert.equal(r.records[3].offerKnown, true); assert.equal(r.records[3].phase, "staged");
});
