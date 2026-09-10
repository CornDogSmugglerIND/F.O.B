import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  clearEbayTokenCache,
  getEbayAccessToken,
  publishEbayListing,
  updateEbayPriceQuantity,
  endEbayListing,
} from "../src/channels/ebay.js";

beforeEach(() => {
  clearEbayTokenCache();
  process.env.EBAY_CLIENT_ID = "cid";
  process.env.EBAY_CLIENT_SECRET = "csec";
  process.env.EBAY_REFRESH_TOKEN = "rtok";
  process.env.EBAY_ENV = "sandbox";
  process.env.EBAY_MARKETPLACE_ID = "EBAY_US";
});

function mockFetchSequence(handlers) {
  let i = 0;
  return async (url, init = {}) => {
    const handler = handlers[i++];
    assert.ok(handler, `unexpected fetch #${i}: ${url}`);
    return handler(String(url), init);
  };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

test("getEbayAccessToken refreshes via OAuth and caches", async () => {
  let calls = 0;
  const fetchImpl = async (url, init) => {
    calls += 1;
    assert.match(String(url), /\/identity\/v1\/oauth2\/token$/);
    assert.equal(init.method, "POST");
    assert.match(init.headers.Authorization, /^Basic /);
    return jsonResponse(200, { access_token: "atok-1", expires_in: 7200 });
  };

  const a = await getEbayAccessToken({ fetchImpl });
  const b = await getEbayAccessToken({ fetchImpl });
  assert.equal(a, "atok-1");
  assert.equal(b, "atok-1");
  assert.equal(calls, 1);
});

test("publishEbayListing runs inventory → offer → publish", async () => {
  const fetchImpl = mockFetchSequence([
    async (url) => {
      assert.match(url, /oauth2\/token$/);
      return jsonResponse(200, { access_token: "atok", expires_in: 7200 });
    },
    async (url, init) => {
      assert.match(url, /\/sell\/inventory\/v1\/inventory_item\/hud-/);
      assert.equal(init.method, "PUT");
      return jsonResponse(204, {});
    },
    async (url, init) => {
      assert.match(url, /\/sell\/inventory\/v1\/offer$/);
      assert.equal(init.method, "POST");
      const body = JSON.parse(init.body);
      assert.equal(body.format, "FIXED_PRICE");
      assert.equal(body.pricingSummary.price.value, "12.50");
      return jsonResponse(201, { offerId: "offer-9" });
    },
    async (url, init) => {
      assert.match(url, /\/offer\/offer-9\/publish$/);
      assert.equal(init.method, "POST");
      return jsonResponse(200, { listingId: "listing-42" });
    },
  ]);

  const result = await publishEbayListing(
    {
      id: "abc-123",
      title: "Charizard EX",
      description: "NM",
      price: 12.5,
      quantity: 1,
      brand: "Pokemon",
    },
    { fetchImpl },
  );

  assert.equal(result.listingId, "listing-42");
  assert.equal(result.offerId, "offer-9");
  assert.equal(result.status, "active");
  assert.match(result.sku, /^hud-abc-123/);
});

test("updateEbayPriceQuantity and endEbayListing hit Inventory API", async () => {
  const fetchImpl = mockFetchSequence([
    async () => jsonResponse(200, { access_token: "atok", expires_in: 7200 }),
    async (url, init) => {
      assert.match(url, /bulk_update_price_quantity$/);
      assert.equal(init.method, "POST");
      return jsonResponse(200, { responses: [{ statusCode: 200 }] });
    },
    async (url, init) => {
      assert.match(url, /\/offer\/offer-1\/withdraw$/);
      assert.equal(init.method, "POST");
      return jsonResponse(200, {});
    },
  ]);

  await updateEbayPriceQuantity(
    { listingId: "offer-1", price: 9.99, quantity: 2, sku: "hud-x" },
    { fetchImpl },
  );
  const ended = await endEbayListing({ listingId: "offer-1" }, { fetchImpl });
  assert.equal(ended.status, "ended");
});

test("GET /api/channels/ebay/probe returns 503 without secrets", async () => {
  delete process.env.EBAY_CLIENT_ID;
  delete process.env.EBAY_CLIENT_SECRET;
  delete process.env.EBAY_REFRESH_TOKEN;
  clearEbayTokenCache();

  const { createApp } = await import("../src/app.js");
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/channels/ebay/probe`);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.code, "CHANNEL_NOT_CONFIGURED");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
