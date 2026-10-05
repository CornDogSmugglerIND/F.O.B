/**
 * eBay Sell Inventory API client.
 * Auth: OAuth 2.0 refresh-token grant (3-legged user token).
 * Docs: developer.ebay.com — Sell Inventory + Sell Fulfillment.
 */

import { refreshEbayAccessToken } from "./ebayConnect.js";

function env(key, fallback = "") {
  const v = process.env[key];
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

export function ebayApiBase() {
  const mode = env("EBAY_ENV", "production").toLowerCase();
  return mode === "sandbox"
    ? "https://api.sandbox.ebay.com"
    : "https://api.ebay.com";
}

export function ebayMarketplaceId() {
  return env("EBAY_MARKETPLACE_ID", "EBAY_US");
}

let cachedToken = null;
/** @type {number} */
let cachedTokenExpiresAt = 0;

/** Clear in-memory token (tests / forced refresh). */
export function clearEbayTokenCache() {
  cachedToken = null;
  cachedTokenExpiresAt = 0;
}

/**
 * Exchange refresh token for a user access token (2h cache).
 * Refresh token source: server-side connect store first, EBAY_REFRESH_TOKEN
 * env fallback. Rotated refresh tokens are persisted by the connect module.
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function getEbayAccessToken(opts = {}) {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAt - 60_000) {
    return cachedToken;
  }
  const { accessToken, expiresIn } = await refreshEbayAccessToken(opts);
  cachedToken = accessToken;
  cachedTokenExpiresAt = now + expiresIn * 1000;
  return cachedToken;
}

/**
 * @param {string} path
 * @param {{ method?: string, body?: unknown, fetchImpl?: typeof fetch, contentLanguage?: string }} [opts]
 */
export async function ebayRequest(path, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const token = await getEbayAccessToken({ fetchImpl });
  const method = opts.method || "GET";
  /** @type {Record<string, string>} */
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Language": opts.contentLanguage || "en-US",
    "Accept-Language": "en-US",
  };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetchImpl(`${ebayApiBase()}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!res.ok) {
    const err = new Error(
      `eBay API ${method} ${path} failed (${res.status}): ${data?.errors?.[0]?.message || data?.error || res.statusText}`,
    );
    err.code = "EBAY_API_ERROR";
    err.status = res.status;
    err.details = data;
    throw err;
  }

  return { status: res.status, data };
}

function skuForItem(item) {
  return `hud-${item.id}`.slice(0, 50);
}

/**
 * Probe auth — used by /api/channels/ebay/probe.
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function probeEbay(opts = {}) {
  const token = await getEbayAccessToken(opts);
  return {
    ok: true,
    marketplaceId: ebayMarketplaceId(),
    env: env("EBAY_ENV", "production"),
    tokenPreview: `${token.slice(0, 8)}…`,
    sellerIdConfigured: Boolean(env("EBAY_SELLER_ID")),
  };
}

/**
 * Publish a staged HUD item to eBay via Inventory API:
 * createOrReplaceInventoryItem → createOffer → publishOffer
 *
 * @param {import('../store.js').ScoutItem} item
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function publishEbayListing(item, opts = {}) {
  if (!item?.title) {
    const err = new Error("eBay publish requires item.title");
    err.code = "VALIDATION";
    throw err;
  }
  const price = Number(item.price);
  if (!Number.isFinite(price) || price <= 0) {
    const err = new Error("eBay publish requires item.price > 0");
    err.code = "VALIDATION";
    throw err;
  }

  const sku = skuForItem(item);
  const qty = Math.max(1, Number(item.quantity) || 1);
  const marketplaceId = ebayMarketplaceId();

  await ebayRequest(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
    method: "PUT",
    fetchImpl: opts.fetchImpl,
    body: {
      availability: {
        shipToLocationAvailability: { quantity: qty },
      },
      condition: "USED_EXCELLENT",
      product: {
        title: String(item.title).slice(0, 80),
        description: item.description || item.title,
        aspects: item.brand ? { Brand: [item.brand] } : undefined,
      },
    },
  });

  /** @type {Record<string, string>} */
  const listingPolicies = {};
  const fulfillmentPolicyId = env("EBAY_FULFILLMENT_POLICY_ID");
  const paymentPolicyId = env("EBAY_PAYMENT_POLICY_ID");
  const returnPolicyId = env("EBAY_RETURN_POLICY_ID");
  if (fulfillmentPolicyId) listingPolicies.fulfillmentPolicyId = fulfillmentPolicyId;
  if (paymentPolicyId) listingPolicies.paymentPolicyId = paymentPolicyId;
  if (returnPolicyId) listingPolicies.returnPolicyId = returnPolicyId;

  /** @type {Record<string, unknown>} */
  const offerBody = {
    sku,
    marketplaceId,
    format: "FIXED_PRICE",
    availableQuantity: qty,
    categoryId: "183454", // Trading Cards default; map categories later
    listingDescription: item.description || item.title,
    pricingSummary: {
      price: {
        currency: "USD",
        value: price.toFixed(2),
      },
    },
  };
  if (Object.keys(listingPolicies).length) offerBody.listingPolicies = listingPolicies;
  const merchantLocationKey = env("EBAY_MERCHANT_LOCATION_KEY");
  if (merchantLocationKey) offerBody.merchantLocationKey = merchantLocationKey;

  const offerRes = await ebayRequest("/sell/inventory/v1/offer", {
    method: "POST",
    fetchImpl: opts.fetchImpl,
    body: offerBody,
  });

  const offerId = offerRes.data?.offerId;
  if (!offerId) {
    const err = new Error("eBay createOffer returned no offerId");
    err.code = "EBAY_API_ERROR";
    err.details = offerRes.data;
    throw err;
  }

  const pub = await ebayRequest(`/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`, {
    method: "POST",
    fetchImpl: opts.fetchImpl,
  });

  const listingId = pub.data?.listingId || offerId;
  return {
    channelId: "ebay",
    sku,
    offerId,
    listingId,
    price,
    status: "active",
  };
}

/**
 * Update price + qty on an existing offer via bulkUpdatePriceQuantity.
 * @param {{ listingId: string, price?: number, quantity?: number, sku?: string }} payload
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function updateEbayPriceQuantity(payload, opts = {}) {
  const sku = payload.sku || `hud-${payload.listingId}`.slice(0, 50);
  const offers = [
    {
      offerId: payload.listingId,
      availableQuantity: payload.quantity != null ? Math.max(0, Number(payload.quantity)) : undefined,
      price:
        payload.price != null
          ? { currency: "USD", value: Number(payload.price).toFixed(2) }
          : undefined,
    },
  ];

  // Prefer bulk price/qty by SKU when we only have listing identity as offerId.
  await ebayRequest("/sell/inventory/v1/bulk_update_price_quantity", {
    method: "POST",
    fetchImpl: opts.fetchImpl,
    body: {
      requests: [
        {
          sku,
          offers,
        },
      ],
    },
  });

  return { channelId: "ebay", listingId: payload.listingId, sku, ok: true };
}

/**
 * Withdraw (end) an offer.
 * @param {{ listingId: string }} payload — listingId stored as eBay offerId
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function endEbayListing(payload, opts = {}) {
  await ebayRequest(`/sell/inventory/v1/offer/${encodeURIComponent(payload.listingId)}/withdraw`, {
    method: "POST",
    fetchImpl: opts.fetchImpl,
  });
  return { channelId: "ebay", listingId: payload.listingId, status: "ended" };
}

/**
 * Pull inventory items (paginated).
 * @param {{ limit?: number, offset?: number, fetchImpl?: typeof fetch }} [opts]
 */
export async function listEbayInventoryItems(opts = {}) {
  const limit = Math.min(200, Math.max(1, Number(opts.limit) || 50));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const { data } = await ebayRequest(
    `/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`,
    { fetchImpl: opts.fetchImpl },
  );
  return {
    items: data?.inventoryItems || [],
    total: data?.total ?? (data?.inventoryItems || []).length,
    limit,
    offset,
  };
}

/**
 * Pull offers (listings) — includes price, qty, listingId.
 * @param {{ limit?: number, offset?: number, fetchImpl?: typeof fetch }} [opts]
 */
export async function listEbayOffers(opts = {}) {
  const limit = Math.min(200, Math.max(1, Number(opts.limit) || 50));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const marketplaceId = ebayMarketplaceId();
  const { data } = await ebayRequest(
    `/sell/inventory/v1/offer?limit=${limit}&offset=${offset}&marketplace_id=${encodeURIComponent(marketplaceId)}`,
    { fetchImpl: opts.fetchImpl },
  );
  return {
    offers: data?.offers || [],
    total: data?.total ?? (data?.offers || []).length,
    limit,
    offset,
  };
}

/**
 * Sync first page of eBay offers into HUD-shaped records (no secrets returned).
 * @param {{ limit?: number, fetchImpl?: typeof fetch }} [opts]
 */
export async function syncEbayInventory(opts = {}) {
  const [offersPage, itemsPage] = await Promise.all([
    listEbayOffers({ limit: opts.limit || 50, fetchImpl: opts.fetchImpl }),
    listEbayInventoryItems({ limit: opts.limit || 50, fetchImpl: opts.fetchImpl }),
  ]);

  const bySku = Object.fromEntries(
    (itemsPage.items || []).map((it) => [it.sku, it]),
  );

  const records = (offersPage.offers || []).map((offer) => {
    const inv = bySku[offer.sku] || {};
    const product = inv.product || {};
    const price = offer.pricingSummary?.price?.value ?? offer.price?.value ?? null;
    const qty =
      offer.availableQuantity ??
      inv.availability?.shipToLocationAvailability?.quantity ??
      1;
    return {
      sku: offer.sku,
      title: product.title || offer.sku,
      price: price != null ? Number(price) : null,
      quantity: Math.max(0, Number(qty) || 0),
      offerId: offer.offerId,
      listingId: offer.listing?.listingId || offer.listingId || null,
      status: offer.status || offer.listing?.listingStatus || "active",
      imageUrl: product.imageUrls?.[0] || null,
      phase: "listed",
      staged: false,
      channels: {
        ebay: {
          listingId: offer.listing?.listingId || offer.offerId,
          offerId: offer.offerId,
          sku: offer.sku,
          price: price != null ? Number(price) : null,
          status: offer.status || "active",
        },
      },
    };
  });

  return {
    ok: true,
    pulled: records.length,
    offerTotal: offersPage.total,
    inventoryTotal: itemsPage.total,
    records,
  };
}

/* ------------------------------------------------------------------ */
/* Per-item tracking — Sell Fulfillment API: orders + shipments.       */
/* Normalized tracking card shape:                                     */
/* { orderId, items: [{sku,title,qty}], carrier, trackingNumber,       */
/*   status, createdAt, shippedAt, deliveredAt }                        */
/* status: label_created | picked_up | in_transit | out_for_delivery |  */
/*         delivered — best-effort mapping from fulfillment state.      */
/* ------------------------------------------------------------------ */

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * List recent eBay orders (paginated).
 * @param {{ days?: number, limit?: number, fetchImpl?: typeof fetch }} [opts]
 */
export async function listEbayOrders(opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const days = Math.max(1, Math.min(90, Number(opts.days) || 30));
  const perPage = Math.max(1, Math.min(200, Number(opts.limit) || 100));
  const filter = `creationdate:[${isoDaysAgo(days)}..]`;
  const orders = [];
  let offset = 0;
  for (;;) {
    const q = new URLSearchParams({ filter, limit: String(perPage), offset: String(offset) });
    const { data } = await ebayRequest(`/sell/fulfillment/v1/order?${q.toString()}`, { fetchImpl });
    const batch = data?.orders || [];
    orders.push(...batch);
    const total = Number(data?.total) || 0;
    offset += batch.length;
    if (!batch.length || offset >= total) break;
  }
  return orders;
}

/**
 * Shipments for a set of order IDs.
 * @param {string[]} orderIds
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<Map<string, object>>} orderId -> shipment
 */
export async function getEbayShipments(orderIds, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const byOrder = new Map();
  if (!orderIds.length) return byOrder;
  // API accepts a pipe-joined orderids filter; chunk to stay under URL limits.
  for (let i = 0; i < orderIds.length; i += 25) {
    const chunk = orderIds.slice(i, i + 25);
    const q = new URLSearchParams({ filter: `orderids:{${chunk.join("|")}}`, limit: "200" });
    const { data } = await ebayRequest(`/sell/fulfillment/v1/shipment?${q.toString()}`, { fetchImpl });
    for (const s of data?.shipments || []) {
      for (const oid of s.orderIds || []) {
        if (!byOrder.has(oid)) byOrder.set(oid, s);
      }
    }
  }
  return byOrder;
}

function pickShipmentField(shipment, ...names) {
  for (const n of names) {
    const v = shipment?.[n];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/** eBay fulfillment status -> tracking card status. */
export function mapFulfillmentStatus(order, shipment) {
  const tracking = pickShipmentField(shipment, "shipmentTrackingNumber", "trackingNumber");
  const fs = (order?.orderFulfillmentStatus || "").toUpperCase();
  if (fs === "FULFILLED") return "delivered";
  if (fs === "IN_PROGRESS" || tracking) return "in_transit";
  return "label_created";
}

/**
 * Tracking cards for recent orders: line items + carrier/tracking + status.
 * @param {{ days?: number, fetchImpl?: typeof fetch }} [opts]
 */
export async function getEbayTracking(opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const orders = await listEbayOrders({ ...opts, fetchImpl });
  const shipments = await getEbayShipments(
    orders.map((o) => o.orderId).filter(Boolean),
    { fetchImpl },
  );
  return orders.map((o) => {
    const shipment = shipments.get(o.orderId) || null;
    const status = mapFulfillmentStatus(o, shipment);
    return {
      orderId: o.orderId,
      items: (o.lineItems || []).map((li) => ({
        sku: li.sku || "",
        title: li.title || "",
        qty: Number(li.quantity) || 1,
      })),
      carrier: pickShipmentField(shipment, "shippingCarrierCode", "carrierCode"),
      trackingNumber: pickShipmentField(shipment, "shipmentTrackingNumber", "trackingNumber"),
      shippingService: pickShipmentField(shipment, "shippingServiceCode", "serviceCode"),
      status,
      createdAt: o.creationDate || null,
      shippedAt: status === "label_created" ? null : o.lastModifiedDate || null,
      deliveredAt: status === "delivered" ? o.lastModifiedDate || null : null,
      buyer: o.buyer?.username || "",
    };
  });
}
