import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { clearEbayTokenCache, reviseEbayItems } from "../src/channels/ebay.js";

beforeEach(() => {
  clearEbayTokenCache();
  Object.assign(process.env, { EBAY_CLIENT_ID: "cid", EBAY_CLIENT_SECRET: "csec", EBAY_REFRESH_TOKEN: "rtok", EBAY_ENV: "sandbox", EBAY_MARKETPLACE_ID: "EBAY_US" });
});
const res = (status, body) => ({ ok: status < 300, status, statusText: String(status), async json() { return body; }, async text() { return JSON.stringify(body); } });

test("revise: price + qty for two variation SKUs go out in one bulk call", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push([String(url), init.method || "GET", (() => { try { return init.body ? JSON.parse(init.body) : null; } catch { return null; } })()]);
    if (String(url).includes("/oauth2/token")) return res(200, { access_token: "t", expires_in: 7200 });
    if (String(url).includes("bulk_update_price_quantity")) return res(200, { responses: [{ sku: "A", statusCode: 200 }, { sku: "B", statusCode: 200 }] });
    return res(404, {});
  };
  const out = await reviseEbayItems([{ sku: "A", offerId: "1", price: 2.5, quantity: 3 }, { sku: "B", offerId: "2", quantity: 0 }], { fetchImpl });
  assert.deepEqual(out.map((r) => r.ok), [true, true], JSON.stringify(out));
  const bulk = calls.find((c) => c[0].includes("bulk_update_price_quantity"));
  assert.equal(bulk[2].requests.length, 2);
  assert.equal(bulk[2].requests[0].offers[0].price.value, "2.50");
  assert.equal(bulk[2].requests[1].shipToLocationAvailability.quantity, 0);
});

test("revise: title change reads the item and writes it back with the new title", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push([String(url), init.method || "GET", (() => { try { return init.body ? JSON.parse(init.body) : null; } catch { return null; } })()]);
    if (String(url).includes("/oauth2/token")) return res(200, { access_token: "t", expires_in: 7200 });
    if (String(url).includes("/inventory_item/") && (init.method || "GET") === "GET") return res(200, { sku: "A", locale: "en_US", product: { title: "Old", imageUrls: ["x"] }, condition: "USED_EXCELLENT" });
    if (String(url).includes("/inventory_item/") && init.method === "PUT") return res(204, {});
    return res(404, {});
  };
  const out = await reviseEbayItems([{ sku: "A", title: "New title" }], { fetchImpl });
  assert.equal(out[0].ok, true);
  const put = calls.find((c) => c[1] === "PUT");
  assert.equal(put[2].product.title, "New title");
  assert.deepEqual(put[2].product.imageUrls, ["x"]);
  assert.equal(put[2].sku, undefined);
});

test("publish: sealed product asks eBay for its category and lists as New", async () => {
  const { publishEbayListing } = await import("../src/channels/ebay.js");
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url); calls.push([u, init.method || "GET", (() => { try { return init.body ? JSON.parse(init.body) : null; } catch { return null; } })()]);
    if (u.includes("/oauth2/token")) return res(200, { access_token: "t", expires_in: 7200 });
    if (u.includes("get_category_suggestions")) return res(200, { categorySuggestions: [{ category: { categoryId: "183457", categoryName: "CCG Card Albums, Binders & Pages" } }] });
    if (u.includes("/inventory_item/")) return res(204, {});
    if (u.endsWith("/offer") && init.method === "POST") return res(201, { offerId: "of1" });
    if (u.includes("/publish")) return res(200, { listingId: "L1" });
    return res(200, {});
  };
  await publishEbayListing({ id: "x1", title: "Pokemon TCG Mini Card Binder Album Greninja", price: 9.5, quantity: 1, photos: [] }, { fetchImpl }).catch(() => null);
  const put = calls.find((c) => c[0].includes("/inventory_item/") && c[1] === "PUT");
  assert.equal(put[2].condition, "NEW");
  assert.equal(put[2].conditionDescriptors, undefined);
  const offer = calls.find((c) => c[0].endsWith("/offer") && c[1] === "POST");
  assert.equal(offer[2].categoryId, "183457");
});

test("publish: a single card stays in Individual Cards with its card condition", async () => {
  const { publishEbayListing } = await import("../src/channels/ebay.js");
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url); calls.push([u, init.method || "GET", (() => { try { return init.body ? JSON.parse(init.body) : null; } catch { return null; } })()]);
    if (u.includes("/oauth2/token")) return res(200, { access_token: "t", expires_in: 7200 });
    if (u.includes("/inventory_item/")) return res(204, {});
    if (u.endsWith("/offer") && init.method === "POST") return res(201, { offerId: "of1" });
    if (u.includes("/publish")) return res(200, { listingId: "L1" });
    return res(200, {});
  };
  await publishEbayListing({ id: "x2", title: "Pikachu 005/025 Celebrations", collectorNumber: "005/025", price: 3, quantity: 1, photos: [] }, { fetchImpl }).catch(() => null);
  assert.ok(!calls.some((c) => c[0].includes("get_category_suggestions")));
  const offer = calls.find((c) => c[0].endsWith("/offer") && c[1] === "POST");
  assert.equal(offer[2].categoryId, "183454");
});

test("publish: missing required item specific (Type) is filled from the title, and a leftover offer is reused", async () => {
  const { publishEbayListing } = await import("../src/channels/ebay.js");
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url); calls.push([u, init.method || "GET", (() => { try { return init.body ? JSON.parse(init.body) : null; } catch { return null; } })()]);
    if (u.includes("/oauth2/token")) return res(200, { access_token: "t", expires_in: 7200 });
    if (u.includes("get_category_suggestions")) return res(200, { categorySuggestions: [{ category: { categoryId: "183457", categoryName: "Albums" } }] });
    if (u.includes("get_item_aspects_for_category")) return res(200, { aspects: [
      { localizedAspectName: "Type", aspectConstraint: { aspectRequired: true }, aspectValues: [{ localizedValue: "Album" }, { localizedValue: "Binder" }, { localizedValue: "Page" }] },
      { localizedAspectName: "Brand", aspectConstraint: { aspectRequired: true }, aspectValues: [] },
      { localizedAspectName: "Color", aspectConstraint: { aspectRequired: false }, aspectValues: [{ localizedValue: "Blue" }] } ] });
    if (u.includes("/inventory_item/")) return res(204, {});
    if (u.endsWith("/offer") && init.method === "POST") return res(400, { errors: [{ errorId: 25002, message: "Offer entity already exists.", parameters: [{ name: "offerId", value: "old1" }] }] });
    if (u.includes("/offer/old1") && init.method === "PUT") return res(204, {});
    if (u.includes("/offer/old1/publish")) return res(200, { listingId: "L9" });
    return res(200, {});
  };
  const out = await publishEbayListing({ id: "x3", title: "Pokemon TCG Mini Card Binder - Greninja & Lapras", price: 9.5, quantity: 1, photos: [] }, { fetchImpl });
  const put = calls.find((c) => c[0].includes("/inventory_item/") && c[1] === "PUT");
  assert.deepEqual(put[2].product.aspects.Type, ["Binder"]);
  assert.deepEqual(put[2].product.aspects.Brand, ["The Pokémon Company"]);
  assert.equal(put[2].product.aspects.Color, undefined);
  assert.equal(out.listingId, "L9");
});

test("best offer: on by default, auto-declines under 80%", async () => {
  const { bestOfferTerms } = await import("../src/channels/ebay.js");
  assert.deepEqual(bestOfferTerms({}, 10), { bestOfferEnabled: true, autoDeclinePrice: { currency: "USD", value: "8.00" } });
  assert.equal(bestOfferTerms({ bestOffer: false }, 10), null);
  assert.equal(bestOfferTerms({ offerFloorPct: 70 }, 20).autoDeclinePrice.value, "14.00");
});
test("enable offers on a live listing keeps its policies and adds best offer", async () => {
  const { enableBestOffer } = await import("../src/channels/ebay.js");
  const calls = [];
  const fetchImpl = async (url, init = {}) => { const u = String(url); calls.push([u, init.method || "GET", (() => { try { return JSON.parse(init.body); } catch { return null; } })()]);
    if (u.includes("/oauth2/token")) return res(200, { access_token: "t", expires_in: 7200 });
    if (u.includes("/offer?sku=")) return res(200, { offers: [{ offerId: "o1", sku: "A", status: "PUBLISHED", listing: { listingId: "L" }, marketplaceId: "EBAY_US", format: "FIXED_PRICE", categoryId: "183454", availableQuantity: 1, pricingSummary: { price: { value: "5.00", currency: "USD" } }, listingPolicies: { fulfillmentPolicyId: "F", returnPolicyId: "R" } }] });
    if (u.includes("/offer/o1") && init.method === "PUT") return res(204, {});
    return res(404, {}); };
  const out = await enableBestOffer(["A"], { fetchImpl });
  if (!out[0].ok) console.log("ERR", out[0].error);
  assert.equal(out[0].ok, true);
  const put = calls.find((c) => c[1] === "PUT");
  assert.equal(put[2].listingPolicies.fulfillmentPolicyId, "F");
  assert.equal(put[2].listingPolicies.bestOfferTerms.autoDeclinePrice.value, "4.00");
  assert.equal(put[2].status, undefined); assert.equal(put[2].listing, undefined);
});
