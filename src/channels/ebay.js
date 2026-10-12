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
 * Sawyer's shipping rule (Oct 12, verbatim logic):
 * cards priced at or under the threshold ship on the envelope policy
 * (eBay Standard Envelope — the envelope policies cannot take cards
 * over the threshold); cards over it, and every non-card item, ship
 * on the general (FedEx) policy. Policy IDs + threshold come from env
 * so the in-app settings surface can override them without a redeploy
 * of code. Returns "" when nothing is configured.
 *
 * @param {{ price?: number|string, game?: string|null, category?: string|null, categoryId?: string|null }} item
 * @returns {string}
 */
export function resolveFulfillmentPolicyId(item = {}) {
  const general = env("EBAY_FULFILLMENT_POLICY_ID");
  const envelope = env("EBAY_CARD_ENVELOPE_POLICY_ID");
  if (!envelope) return general;
  const parsed = Number(env("EBAY_CARD_THRESHOLD_USD"));
  const threshold = Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
  const price = Number(item.price);
  const isCard =
    item.game != null ||
    item.categoryId === "183454" ||
    /card|tcg|trading/i.test(String(item.category || ""));
  if (isCard && Number.isFinite(price) && price <= threshold) return envelope;
  return general;
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
  const fulfillmentPolicyId = resolveFulfillmentPolicyId(item);
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
 * Publish a Pick-Your-Card variation listing (one multi-variation listing).
 * Flow: inventory_item per child -> inventory_item_group -> offer per child
 *       -> publish_by_inventory_item_group.
 * @param {{ groupId: string, title: string, description?: string, children: Array<Record<string, any>> }} batch
 *   shape of combineVariationBatch() output
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function publishEbayVariationListing(batch, opts = {}) {
  const children = Array.isArray(batch?.children) ? batch.children : [];
  if (children.length < 2 || !batch?.title || !batch?.groupId) {
    const err = new Error("Variation publish needs a title, groupId and at least 2 cards");
    err.code = "VALIDATION";
    throw err;
  }
  for (const c of children) {
    const p = Number(c.price);
    if (!Number.isFinite(p) || p <= 0) {
      const err = new Error(`Variation card ${c.sku || c.title} needs a price > 0`);
      err.code = "VALIDATION";
      throw err;
    }
  }
  const marketplaceId = ebayMarketplaceId();
  const groupKey = String(batch.groupId).slice(0, 50);
  const policies = {};
  if (env("EBAY_FULFILLMENT_POLICY_ID")) policies.fulfillmentPolicyId = env("EBAY_FULFILLMENT_POLICY_ID");
  if (env("EBAY_PAYMENT_POLICY_ID")) policies.paymentPolicyId = env("EBAY_PAYMENT_POLICY_ID");
  if (env("EBAY_RETURN_POLICY_ID")) policies.returnPolicyId = env("EBAY_RETURN_POLICY_ID");
  const locationKey = env("EBAY_MERCHANT_LOCATION_KEY");

  // Each card is one value of the "Card" variation axis; eBay needs unique values.
  const seen = new Set();
  const named = children.map((c) => {
    let label = String(c.title || c.productName || c.sku).slice(0, 65);
    let n = 2;
    while (seen.has(label)) label = `${String(c.title || c.productName).slice(0, 60)} #${n++}`;
    seen.add(label);
    return { c, label };
  });

  for (const { c, label } of named) {
    await ebayRequest(`/sell/inventory/v1/inventory_item/${encodeURIComponent(c.sku)}`, {
      method: "PUT",
      fetchImpl: opts.fetchImpl,
      body: {
        availability: { shipToLocationAvailability: { quantity: Math.max(1, Number(c.quantity) || 1) } },
        condition: "USED_EXCELLENT",
        product: {
          title: String(label).slice(0, 80),
          description: batch.description || batch.title,
          aspects: { Card: [label] },
        },
      },
    });
  }

  await ebayRequest(`/sell/inventory/v1/inventory_item_group/${encodeURIComponent(groupKey)}`, {
    method: "PUT",
    fetchImpl: opts.fetchImpl,
    body: {
      inventoryItemGroupKey: groupKey,
      title: String(batch.title).slice(0, 80),
      description: batch.description || batch.title,
      variantSKUs: named.map(({ c }) => c.sku),
      variesBy: {
        aspectsImageVariesBy: [],
        specifications: [{ name: "Card", values: named.map(({ label }) => label) }],
      },
    },
  });

  const offerIds = [];
  for (const { c } of named) {
    const body = {
      sku: c.sku,
      marketplaceId,
      format: "FIXED_PRICE",
      availableQuantity: Math.max(1, Number(c.quantity) || 1),
      categoryId: "183454",
      listingDescription: batch.description || batch.title,
      pricingSummary: { price: { currency: "USD", value: Number(c.price).toFixed(2) } },
    };
    // Per-child routing: a Pick-Your-Card batch can straddle the threshold,
    // so each card's offer gets its own fulfillment policy.
    const childPolicies = { ...policies };
    const childFulfillment = resolveFulfillmentPolicyId({
      price: c.price,
      categoryId: "183454",
    });
    if (childFulfillment) childPolicies.fulfillmentPolicyId = childFulfillment;
    if (Object.keys(childPolicies).length) body.listingPolicies = childPolicies;
    if (locationKey) body.merchantLocationKey = locationKey;
    const r = await ebayRequest("/sell/inventory/v1/offer", { method: "POST", fetchImpl: opts.fetchImpl, body });
    if (!r.data?.offerId) {
      const err = new Error(`eBay createOffer returned no offerId for ${c.sku}`);
      err.code = "EBAY_API_ERROR";
      err.details = r.data;
      throw err;
    }
    offerIds.push(r.data.offerId);
  }

  const pub = await ebayRequest("/sell/inventory/v1/offer/publish_by_inventory_item_group", {
    method: "POST",
    fetchImpl: opts.fetchImpl,
    body: { inventoryItemGroupKey: groupKey, marketplaceId },
  });

  return {
    channelId: "ebay",
    groupKey,
    offerIds,
    listingId: pub.data?.listingId || null,
    status: "active",
    childCount: children.length,
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
 * Sync the seller's eBay inventory into HUD-shaped records.
 *
 * The /offer LIST endpoint 400s on this account (errorId 25707: legacy offer
 * SKUs contain hyphens, which the list call's SKU validation rejects).
 * Verified live Oct 12: GET /inventory_item pages fine (563 items) and
 * GET /offer?sku=<sku> works per SKU. So: page ALL inventory items, then
 * look up each item's offer individually (chunked, failure-tolerant).
 *
 * @param {{ maxItems?: number, limit?: number, fetchImpl?: typeof fetch }} [opts]
 *   maxItems caps how many inventory items are processed (default 1000);
 *   `limit` is accepted as a legacy alias for maxItems.
 */
export async function syncEbayInventory(opts = {}) {
  const fetchImpl = opts.fetchImpl;
  const maxItems = Math.max(
    1,
    Math.min(2000, Number(opts.maxItems || opts.limit) || 1000),
  );
  const pageSize = 200;

  const items = [];
  let inventoryTotal = 0;
  for (let offset = 0; items.length < maxItems; offset += pageSize) {
    const page = await listEbayInventoryItems({
      limit: pageSize,
      offset,
      fetchImpl,
    });
    inventoryTotal = page.total ?? inventoryTotal;
    const batch = page.items || [];
    if (!batch.length) break;
    items.push(...batch);
    if (items.length >= (page.total ?? items.length)) break;
  }
  const slice = items.slice(0, maxItems);

  /** @type {Map<string, Record<string, any>>} */
  const offersBySku = new Map();
  const CHUNK = 40;
  const deadline = Date.now() + (Number(opts.budgetMs) || 20000); // Vercel kills at 30s
  let partial = false;
  for (let i = 0; i < slice.length; i += CHUNK) {
    if (Date.now() > deadline) { partial = true; break; }
    const part = slice.slice(i, i + CHUNK);
    await Promise.all(
      part.map(async (it) => {
        try {
          const { data } = await ebayRequest(
            `/sell/inventory/v1/offer?sku=${encodeURIComponent(it.sku)}`,
            { fetchImpl },
          );
          const offers = data?.offers || [];
          const offer = offers.find((o) => o.sku === it.sku) || offers[0];
          if (offer) offersBySku.set(it.sku, offer);
        } catch {
          // No readable offer for this SKU — the record still syncs
          // from the inventory item itself.
        }
      }),
    );
  }

  const records = slice.map((inv) => {
    const offer = offersBySku.get(inv.sku) || {};
    const product = inv.product || {};
    const price = offer.pricingSummary?.price?.value ?? offer.price?.value ?? null;
    const qty =
      offer.availableQuantity ??
      inv.availability?.shipToLocationAvailability?.quantity ??
      1;
    return {
      sku: inv.sku,
      title: product.title || inv.sku,
      price: price != null ? Number(price) : null,
      quantity: Math.max(0, Number(qty) || 0),
      offerId: offer.offerId || null,
      listingId: offer.listing?.listingId || offer.listingId || null,
      status: offer.status || offer.listing?.listingStatus || "active",
      imageUrl: product.imageUrls?.[0] || null,
      phase: "listed",
      staged: false,
      channels: {
        ebay: {
          listingId: offer.listing?.listingId || offer.offerId || null,
          offerId: offer.offerId || null,
          sku: inv.sku,
          price: price != null ? Number(price) : null,
          status: offer.status || "active",
        },
      },
    };
  });

  return {
    ok: true,
    pulled: records.length,
    offerTotal: offersBySku.size,
    inventoryTotal,
    truncated: inventoryTotal > slice.length,
    partial,
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
  // eBay has no bulk shipment lookup: tracking lives on each order's shipping_fulfillment.
  const queue = [...orderIds];
  async function worker() {
    while (queue.length) {
      const oid = queue.shift();
      try {
        const { data } = await ebayRequest(
          `/sell/fulfillment/v1/order/${encodeURIComponent(oid)}/shipping_fulfillment`,
          { fetchImpl },
        );
        const f = (data?.fulfillments || [])[0];
        if (f && !byOrder.has(oid)) byOrder.set(oid, f);
      } catch {
        /* order without fulfillment yet (or transient) — leave unshipped */
      }
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker));
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
