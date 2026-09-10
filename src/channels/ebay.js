/**
 * eBay Sell Inventory API client.
 * Auth: OAuth 2.0 refresh-token grant (3-legged user token).
 * Docs: developer.ebay.com — Sell Inventory + Sell Fulfillment.
 */

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
 * Exchange refresh token for a user access token.
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function getEbayAccessToken(opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const clientId = env("EBAY_CLIENT_ID");
  const clientSecret = env("EBAY_CLIENT_SECRET");
  const refreshToken = env("EBAY_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    const err = new Error(
      "eBay not configured — set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_REFRESH_TOKEN",
    );
    err.code = "CHANNEL_NOT_CONFIGURED";
    throw err;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: [
      "https://api.ebay.com/oauth/api_scope",
      "https://api.ebay.com/oauth/api_scope/sell.inventory",
      "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
      "https://api.ebay.com/oauth/api_scope/sell.account",
    ].join(" "),
  });

  const res = await fetchImpl(`${ebayApiBase()}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const err = new Error(
      `eBay token refresh failed (${res.status}): ${data.error_description || data.error || res.statusText}`,
    );
    err.code = "EBAY_AUTH_FAILED";
    err.status = res.status;
    err.details = data;
    throw err;
  }

  cachedToken = data.access_token;
  cachedTokenExpiresAt = now + (Number(data.expires_in) || 7200) * 1000;
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
