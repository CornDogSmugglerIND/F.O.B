import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  clearEbayTokenCache,
  listEbayOrders,
  getEbayShipments,
  getEbayTracking,
  mapFulfillmentStatus,
} from "../src/channels/ebay.js";

beforeEach(() => {
  clearEbayTokenCache();
  delete process.env.EBAY_TOKEN_FILE;
  process.env.EBAY_CLIENT_ID = "cid";
  process.env.EBAY_CLIENT_SECRET = "csec";
  process.env.EBAY_REFRESH_TOKEN = "r0";
  process.env.EBAY_ENV = "sandbox";
  process.env.EBAY_MARKETPLACE_ID = "EBAY_US";
});

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

const ORDER_1 = {
  orderId: "12-34567-89012",
  creationDate: "2026-10-01T10:00:00.000Z",
  lastModifiedDate: "2026-10-03T12:00:00.000Z",
  orderFulfillmentStatus: "IN_PROGRESS",
  lineItems: [{ sku: "PKM-JTG-NORMAL-1-001", title: "Dudunsparce 121/159", quantity: 1 }],
  buyer: { username: "buyer1" },
};

const ORDER_2 = {
  orderId: "12-34567-89013",
  creationDate: "2026-09-20T10:00:00.000Z",
  lastModifiedDate: "2026-09-25T12:00:00.000Z",
  orderFulfillmentStatus: "FULFILLED",
  lineItems: [{ sku: "PKM-BASE-HOLO-1-001", title: "Pikachu", quantity: 2 }],
  buyer: { username: "buyer2" },
};

const SHIP_1 = {
  shipmentId: "s1",
  orderIds: ["12-34567-89012"],
  shipmentTrackingNumber: "9400111899223855421456",
  shippingCarrierCode: "USPS",
  shippingServiceCode: "USPSGroundAdvantage",
};

function mockFetch() {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/identity/v1/oauth2/token")) {
      return jsonResponse(200, { access_token: "tok", expires_in: 7200 });
    }
    if (u.includes("/sell/fulfillment/v1/shipment")) {
      return jsonResponse(200, { shipments: [SHIP_1], total: 1 });
    }
    if (u.includes("/sell/fulfillment/v1/order")) {
      const offset = Number(new URL(u).searchParams.get("offset") || 0);
      const orders = offset === 0 ? [ORDER_1, ORDER_2] : [];
      return jsonResponse(200, { orders, total: 2 });
    }
    throw new Error(`unexpected fetch: ${u}`);
  };
  return { fetchImpl, calls };
}

test("listEbayOrders paginates", async () => {
  const { fetchImpl, calls } = mockFetch();
  const orders = await listEbayOrders({ days: 30, fetchImpl });
  assert.equal(orders.length, 2);
  assert.equal(orders[0].orderId, "12-34567-89012");
  assert.ok(calls.some((c) => c.includes("/sell/fulfillment/v1/order?")));
  assert.ok(calls.some((c) => c.includes("creationdate")));
});

test("getEbayShipments maps orderId -> shipment", async () => {
  const { fetchImpl } = mockFetch();
  const byOrder = await getEbayShipments(["12-34567-89012", "12-34567-89013"], { fetchImpl });
  assert.equal(byOrder.get("12-34567-89012").shipmentTrackingNumber, "9400111899223855421456");
  assert.equal(byOrder.has("12-34567-89013"), false);
});

test("getEbayTracking normalizes tracking cards", async () => {
  const { fetchImpl } = mockFetch();
  const cards = await getEbayTracking({ days: 30, fetchImpl });
  assert.equal(cards.length, 2);

  const c1 = cards[0];
  assert.equal(c1.orderId, "12-34567-89012");
  assert.equal(c1.trackingNumber, "9400111899223855421456");
  assert.equal(c1.carrier, "USPS");
  assert.equal(c1.status, "in_transit");
  assert.equal(c1.items[0].sku, "PKM-JTG-NORMAL-1-001");
  assert.equal(c1.items[0].qty, 1);
  assert.equal(c1.createdAt, "2026-10-01T10:00:00.000Z");
  assert.equal(c1.deliveredAt, null);

  const c2 = cards[1];
  assert.equal(c2.status, "delivered");
  assert.equal(c2.trackingNumber, "");
  assert.equal(c2.deliveredAt, "2026-09-25T12:00:00.000Z");
});

test("mapFulfillmentStatus: tracking without IN_PROGRESS still in_transit", () => {
  const s = mapFulfillmentStatus({ orderFulfillmentStatus: "NOT_STARTED" }, { shipmentTrackingNumber: "1Z999" });
  assert.equal(s, "in_transit");
});

test("mapFulfillmentStatus: no tracking, not started -> label_created", () => {
  const s = mapFulfillmentStatus({ orderFulfillmentStatus: "NOT_STARTED" }, null);
  assert.equal(s, "label_created");
});
