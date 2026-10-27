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

const CARD_COND = { NM: "400010", "NEAR MINT": "400010", LP: "400011", "LIGHTLY PLAYED": "400011", MP: "400012", "MODERATELY PLAYED": "400012", HP: "400013", "HEAVILY PLAYED": "400013", DMG: "400014", DAMAGED: "400014" };

const GAME_NAMES = { pokemon: "Pokémon TCG", "pokémon": "Pokémon TCG", onepiece: "One Piece Card Game", "one piece": "One Piece Card Game", dbs: "Dragon Ball Super Card Game", dragonball: "Dragon Ball Super Card Game", magic: "Magic: The Gathering", mtg: "Magic: The Gathering", digimon: "Digimon Card Game" };
/** Item specifics eBay requires for Trading Cards; item.aspects wins when given. */
export function cardAspects(item = {}) {
  const a = {};
  const g = String(item.game || "").toLowerCase();
  const game = GAME_NAMES[g] || item.game;
  if (game) a.Game = [String(game)];
  const name = item.cardName || item.name || item.title;
  if (name) a["Card Name"] = [String(name).slice(0, 65)];
  if (item.set || item.setName) a.Set = [String(item.set || item.setName)];
  if (item.number || item.cardNumber) a["Card Number"] = [String(item.number || item.cardNumber)];
  if (item.language) a.Language = [String(item.language)];
  if (item.brand) a.Brand = [String(item.brand)];
  for (const [k, v] of Object.entries(item.aspects || {})) a[k] = Array.isArray(v) ? v.map(String) : [String(v)];
  return Object.keys(a).length ? a : undefined;
}

function imgsOf(item = {}) {
  return (item.photos || item.imageUrls || []).map((x) => (typeof x === "string" ? x : x?.url)).filter((u) => /^https:\/\//.test(u || "")).slice(0, 12);
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
  if (item.fulfillmentPolicyId) return String(item.fulfillmentPolicyId);
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
/** Best Offer on by default; offers under the floor (80% unless set) are declined automatically. */
export function bestOfferTerms(item = {}, price) {
  if (item.bestOffer === false) return null;
  const pct = Math.min(99, Math.max(1, Number(item.offerFloorPct) || 80)), p = Number(price);
  const t = { bestOfferEnabled: true };
  if (p > 0) { const floor = Math.round(p * pct) / 100; if (floor > 0 && floor < p) t.autoDeclinePrice = { currency: "USD", value: floor.toFixed(2) }; }
  return t;
}
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

  const imageUrls = await resolveEbayImages(item, opts);
  /* card singles stay in Individual Cards; everything else goes in the category eBay picks for it (or the one chosen in the builder) */
  let category = null;
  try { const { resolveCategory } = await import("../comps.js"); const c = await resolveCategory(item, { fetchImpl: opts.fetchImpl }); if (c && c.id !== "183454") category = c; } catch { category = null; }
  /* the builder's item specifics are the source of truth; only top up what eBay requires */
  let aspects = item.aspects && Object.keys(item.aspects).length ? Object.fromEntries(Object.entries(item.aspects).map(([k, v]) => [k, Array.isArray(v) ? v.map(String) : [String(v)]])) : (category ? {} : cardAspects(item) || {});
  try { const { fillRequiredAspects } = await import("../comps.js"); aspects = await fillRequiredAspects(category ? category.id : "183454", item.title, aspects, { fetchImpl: opts.fetchImpl }); } catch { /* keep what we have */ }
  await ebayRequest(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
    method: "PUT",
    fetchImpl: opts.fetchImpl,
    body: {
      availability: {
        shipToLocationAvailability: { quantity: qty },
      },
      ...(category ? { condition: /^(used|pre-?owned|USED)/i.test(String(item.condition || "")) ? "USED_EXCELLENT" : "NEW" } : {
        condition: "USED_VERY_GOOD", // 4000 = Ungraded in Trading Cards (183454)
        conditionDescriptors: [{ name: "40001", values: [CARD_COND[String(item.condition || "NM").toUpperCase()] || "400010"] }],
      }),
      product: {
        title: String(item.title).slice(0, 80),
        description: (await import("../listing/engine.js")).descriptionHtml(item.description || item.title),
        aspects: Object.keys(aspects).length ? aspects : undefined,
        imageUrls,
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
  if (item.returnPolicyId || returnPolicyId) listingPolicies.returnPolicyId = String(item.returnPolicyId || returnPolicyId);
  const bo = bestOfferTerms(item, price); if (bo) listingPolicies.bestOfferTerms = bo;

  /** @type {Record<string, unknown>} */
  const offerBody = {
    sku,
    marketplaceId,
    format: "FIXED_PRICE",
    availableQuantity: qty,
    categoryId: category ? category.id : "183454", // Trading Cards unless it's not a card
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

  /* a retry after a failed publish: the offer already exists for this SKU, so update it instead of making a new one */
  let offerRes;
  try {
    offerRes = await ebayRequest("/sell/inventory/v1/offer", { method: "POST", fetchImpl: opts.fetchImpl, body: offerBody });
  } catch (e) {
    const dup = /already exists/i.test(String(e.message)) || (e.details?.errors || []).some((x) => x.errorId === 25002);
    if (!dup) throw e;
    let existing = (e.details?.errors || []).flatMap((x) => x.parameters || []).find((p) => p.name === "offerId")?.value;
    if (!existing) { const got = await ebayRequest(`/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&marketplace_id=${encodeURIComponent(marketplaceId)}`, { fetchImpl: opts.fetchImpl }); existing = got.data?.offers?.[0]?.offerId; }
    if (!existing) throw e;
    await ebayRequest(`/sell/inventory/v1/offer/${encodeURIComponent(existing)}`, { method: "PUT", fetchImpl: opts.fetchImpl, body: offerBody });
    offerRes = { data: { offerId: existing } };
  }

  const offerId = offerRes.data?.offerId;
  if (!offerId) {
    const err = new Error("eBay createOffer returned no offerId");
    err.code = "EBAY_API_ERROR";
    err.details = offerRes.data;
    throw err;
  }

  if (opts.dryRun) {
    // Offer created OK (SKU, category, policies, location accepted). Clean up; never go live.
    await ebayRequest(`/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`, { method: "DELETE", fetchImpl: opts.fetchImpl }).catch(() => {});
    await ebayRequest(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, { method: "DELETE", fetchImpl: opts.fetchImpl }).catch(() => {});
    return { channelId: "ebay", dryRun: true, sku, offerCreated: true, price, status: "not_published" };
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
    fulfillmentPolicyId,
    imageUrls,
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
  if (batch.returnPolicyId || env("EBAY_RETURN_POLICY_ID")) policies.returnPolicyId = String(batch.returnPolicyId || env("EBAY_RETURN_POLICY_ID"));
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
        condition: "USED_VERY_GOOD",
        conditionDescriptors: [{ name: "40001", values: [CARD_COND[String(c.condition || "NM").toUpperCase()] || "400010"] }],
        product: {
          title: String(label).slice(0, 80),
          description: (await import("../listing/engine.js")).descriptionHtml(batch.description || batch.title),
          aspects: { ...(cardAspects({ ...c, game: c.game || batch.game, set: c.set || batch.setName }) || {}), Card: [label] },
          imageUrls: imgsOf(c),
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
      description: (await import("../listing/engine.js")).descriptionHtml(batch.description || batch.title),
      imageUrls: imgsOf(named[0].c),
      aspects: cardAspects({ game: batch.game, set: batch.setName }) || undefined,
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
      listingDescription: (await import("../listing/engine.js")).descriptionHtml(batch.description || batch.title),
      pricingSummary: { price: { currency: "USD", value: Number(c.price).toFixed(2) } },
    };
    // Per-child routing: a Pick-Your-Card batch can straddle the threshold,
    // so each card's offer gets its own fulfillment policy.
    const childPolicies = { ...policies };
    const childFulfillment = resolveFulfillmentPolicyId({
      price: c.price,
      categoryId: "183454",
    });
    if (childFulfillment) childPolicies.fulfillmentPolicyId = String(batch.fulfillmentPolicyId || childFulfillment);
    { const bo = bestOfferTerms(batch, c.price); if (bo) childPolicies.bestOfferTerms = bo; }
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
const grpCache = new Map();
/** Variation listings: the cover photo + title belong to the inventory item group, not to any one child card. */
async function attachGroupInfo(records, fetchImpl) {
  const ids = [...new Set(records.map((r) => r.groupId).filter(Boolean))].filter((g) => !grpCache.has(g));
  const q = [...ids];
  await Promise.all(Array.from({ length: Math.min(5, q.length) }, async () => { while (q.length) { const g = q.shift(); try { const { data } = await ebayRequest(`/sell/inventory/v1/inventory_item_group/${encodeURIComponent(g)}`, { fetchImpl }); grpCache.set(g, { image: (data?.imageUrls || [])[0] || "", title: data?.title || "" }); } catch { grpCache.set(g, { image: "", title: "" }); } } }));
  for (const r of records) { const g = r.groupId && grpCache.get(r.groupId); if (g) { r.groupImage = g.image || null; r.groupTitle = g.title || null; } }
  return records;
}
function toRecord(inv, offer, offerKnown) {
  const product = inv.product || {};
  const price = offer.pricingSummary?.price?.value ?? offer.price?.value ?? null;
  const qty =
    offer.availableQuantity ??
    inv.availability?.shipToLocationAvailability?.quantity ??
    1;
  return {
    sku: inv.sku,
    groupId: (inv.groupIds || [])[0] || null,
    title: product.title || inv.sku,
    price: price != null ? Number(price) : null,
    quantity: Math.max(0, Number(qty) || 0),
    offerId: offer.offerId || null,
    listingId: offer.listing?.listingId || offer.listingId || null,
    status: offer.status || offer.listing?.listingStatus || "active",
    imageUrl: product.imageUrls?.[0] || null,
    imageUrls: (product.imageUrls || []).slice(0, 12),
    // false = eBay never answered for this SKU's offer; callers must NOT change its state.
    offerKnown,
    // Truth from eBay: only a PUBLISHED offer is live. UNPUBLISHED = never listed or already ended/sold.
    phase: offer.status === "PUBLISHED" ? "listed" : offer.offerId ? "ended" : "staged",
    ended: Boolean(offer.offerId) && offer.status !== "PUBLISHED",
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
}

/**
 * One window of the inventory (default 150 SKUs) with a retried offer lookup per SKU,
 * so a full sync is a loop of small, deterministic calls instead of one call that
 * races the 30s serverless limit. Records whose offer never answered carry
 * offerKnown:false and are counted in `failed`.
 */
export async function syncEbayWindow(opts = {}) {
  const fetchImpl = opts.fetchImpl;
  const request = opts.request || ebayRequest;
  const limit = Math.min(200, Math.max(1, Number(opts.limit) || 150));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const page = await (opts.list || listEbayInventoryItems)({ limit, offset, fetchImpl });
  const inv = page.items || [];
  const records = new Array(inv.length);
  let failed = 0;
  const LANES = 12;
  let cursor = 0;
  async function worker() {
    while (cursor < inv.length) {
      const i = cursor++;
      const it = inv[i];
      let offer = null, known = false;
      for (let attempt = 0; attempt < 3 && !known; attempt++) {
        try {
          const { data } = await request(`/sell/inventory/v1/offer?sku=${encodeURIComponent(it.sku)}`, { fetchImpl });
          const offers = data?.offers || [];
          offer = offers.find((o) => o.sku === it.sku) || offers[0] || null;
          known = true;
        } catch (err) {
          // 404 "no offer for this SKU" is a real answer; anything else is retried.
          if (err?.status === 404) { known = true; break; }
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        }
      }
      if (!known) failed += 1;
      records[i] = toRecord(it, offer || {}, known);
    }
  }
  await Promise.all(Array.from({ length: Math.min(LANES, inv.length) }, worker));
  const total = page.total ?? offset + inv.length;
  const end = offset + inv.length;
  await attachGroupInfo(records, opts.fetchImpl);
  return { ok: true, offset, total, pulled: inv.length, failed, next: inv.length && end < total ? end : null, records };
}

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

  const records = slice.map((inv) => toRecord(inv, offersBySku.get(inv.sku) || {}, true));
  await attachGroupInfo(records, opts.fetchImpl);

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
export function mapFulfillmentStatus(order, shipment, delivery) {
  // FULFILLED only means tracking was uploaded (shipped). Delivered needs a real carrier delivery scan from eBay.
  if (delivery && delivery.deliveredAt) return "delivered";
  const tracking = pickShipmentField(shipment, "shipmentTrackingNumber", "trackingNumber");
  const fs = (order?.orderFulfillmentStatus || "").toUpperCase();
  if (fs === "FULFILLED" || fs === "IN_PROGRESS" || tracking) return "in_transit";
  return "label_created";
}

/** Real delivery scans: Trading GetOrders -> ShippingPackageInfo.ActualDeliveryTime (what Seller Hub shows as Delivered). */
export async function getEbayDeliveries(orderIds, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const out = new Map(); const ids = [...new Set(orderIds.filter(Boolean))];
  if (!ids.length) return out;
  let token; try { token = await getEbayAccessToken({ fetchImpl }); } catch { return out; }
  const host = ebayApiBase();
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    try {
      const r = await fetchImpl(`${host}/ws/api.dll`, { method: "POST", signal: AbortSignal.timeout(12000), headers: { "X-EBAY-API-SITEID": "0", "X-EBAY-API-COMPATIBILITY-LEVEL": "1193", "X-EBAY-API-CALL-NAME": "GetOrders", "X-EBAY-API-IAF-TOKEN": token, "Content-Type": "text/xml" },
        body: `<?xml version="1.0" encoding="utf-8"?><GetOrdersRequest xmlns="urn:ebay:apis:eBLBaseComponents"><OrderIDArray>${chunk.map((x) => `<OrderID>${String(x).replace(/[^0-9A-Za-z-]/g, "")}</OrderID>`).join("")}</OrderIDArray><OrderRole>Seller</OrderRole><DetailLevel>ReturnAll</DetailLevel></GetOrdersRequest>` });
      const x = await r.text();
      for (const block of x.split("<Order>").slice(1)) {
        const id = (/<OrderID>([^<]+)<\/OrderID>/.exec(block) || [])[1]; if (!id) continue;
        const del = (/<ActualDeliveryTime>([^<]+)<\/ActualDeliveryTime>/.exec(block) || [])[1] || null;
        const shipped = (/<ShippedTime>([^<]+)<\/ShippedTime>/.exec(block) || [])[1] || null;
        const est = (/<EstimatedDeliveryTimeMax>([^<]+)<\/EstimatedDeliveryTimeMax>/.exec(block) || /<ScheduledDeliveryTimeMax>([^<]+)<\/ScheduledDeliveryTimeMax>/.exec(block) || [])[1] || null;
        out.set(id, { deliveredAt: del, shippedAt: shipped, estDeliveryAt: est });
        const ext = (/<ExtendedOrderID>([^<]+)<\/ExtendedOrderID>/.exec(block) || [])[1]; if (ext) out.set(ext, out.get(id));
      }
    } catch { /* leave unknown: never guess delivered */ }
  }
  return out;
}

/**
 * Tracking cards for recent orders: line items + carrier/tracking + status.
 * @param {{ days?: number, fetchImpl?: typeof fetch }} [opts]
 */
const imgCache = new Map();
/** Best-effort cover photo for an order line: inventory item by SKU, else Trading GetItem by legacy item id. */
async function lineImage(li, fetchImpl) {
  const key = li.sku || li.legacyItemId; if (!key) return "";
  if (imgCache.has(key)) return imgCache.get(key);
  let url = "";
  try {
    if (li.sku) { const { data } = await ebayRequest(`/sell/inventory/v1/inventory_item/${encodeURIComponent(li.sku)}`, { fetchImpl }); url = (data?.product?.imageUrls || [])[0] || ""; }
  } catch { /* fall through */ }
  if (!url && li.legacyItemId) {
    try {
      const token = await getEbayAccessToken({ fetchImpl });
      const host = ebayApiBase().replace("api.", "api.");
      const r = await fetchImpl(`${host}/ws/api.dll`, { method: "POST", signal: AbortSignal.timeout(5000), headers: { "X-EBAY-API-SITEID": "0", "X-EBAY-API-COMPATIBILITY-LEVEL": "1193", "X-EBAY-API-CALL-NAME": "GetItem", "X-EBAY-API-IAF-TOKEN": token, "Content-Type": "text/xml" },
        body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${String(li.legacyItemId).replace(/[^0-9]/g, "")}</ItemID><DetailLevel>ReturnAll</DetailLevel><OutputSelector>PictureURL</OutputSelector><OutputSelector>GalleryURL</OutputSelector></GetItemRequest>` });
      const x = await r.text(); const m = /<PictureURL>([^<]+)<\/PictureURL>/.exec(x) || /<GalleryURL>([^<]+)<\/GalleryURL>/.exec(x); if (m) url = m[1].replace(/&amp;/g, "&").replace(/^http:/, "https:");
    } catch { /* no photo */ }
  }
  imgCache.set(key, url); return url;
}
export async function getEbayTracking(opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const orders = await listEbayOrders({ ...opts, fetchImpl });
  { const q = []; for (const o of orders) for (const li of o.lineItems || []) q.push(li);
    await Promise.all(Array.from({ length: 6 }, async () => { while (q.length) { const li = q.shift(); li._img = await lineImage({ sku: li.sku || "", legacyItemId: li.legacyItemId || "" }, fetchImpl); } })); }
  const shipments = await getEbayShipments(
    orders.map((o) => o.orderId).filter(Boolean),
    { fetchImpl },
  );
  const deliveries = await getEbayDeliveries(orders.map((o) => o.orderId), { fetchImpl });
  return orders.map((o) => {
    const shipment = shipments.get(o.orderId) || null;
    const dv = deliveries.get(o.orderId) || deliveries.get(o.legacyOrderId) || null;
    const status = mapFulfillmentStatus(o, shipment, dv);
    return {
      orderId: o.orderId,
      items: (o.lineItems || []).map((li) => ({
        sku: li.sku || "",
        title: li.title || "",
        qty: Number(li.quantity) || 1,
        image: li._img || "",
      })),
      carrier: pickShipmentField(shipment, "shippingCarrierCode", "carrierCode"),
      trackingNumber: pickShipmentField(shipment, "shipmentTrackingNumber", "trackingNumber"),
      shippingService: pickShipmentField(shipment, "shippingServiceCode", "serviceCode"),
      status,
      total: Number(o.pricingSummary?.total?.value) || 0,
      shipTo: (() => { const ad = o.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.contactAddress; return ad ? [ad.city, ad.stateOrProvince].filter(Boolean).join(", ") : ""; })(),
      createdAt: o.creationDate || null,
      shippedAt: status === "label_created" ? null : pickShipmentField(shipment, "shippedDate") || (dv && dv.shippedAt) || o.lastModifiedDate || null,
      deliveredAt: status === "delivered" ? dv.deliveredAt : null,
      estDeliveryAt: (dv && dv.estDeliveryAt) || null,
      deliveryKnown: Boolean(dv),
      buyer: o.buyer?.username || "",
    };
  });
}

/** End a whole variation listing by group key. */
export async function endEbayVariationListing(groupKey, opts = {}) {
  await ebayRequest("/sell/inventory/v1/offer/withdraw_by_inventory_item_group", {
    method: "POST",
    fetchImpl: opts.fetchImpl,
    body: { inventoryItemGroupKey: groupKey, marketplaceId: ebayMarketplaceId() },
  });
  return { groupKey, status: "ended" };
}

/** Host a photo on eBay (EPS) so a listing can use it. Accepts a data: URL; returns an https URL. */
export async function uploadEbayImage(dataUrl, opts = {}) {
  const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!m) {
    const err = new Error("Photo must be a base64 image");
    err.code = "VALIDATION";
    throw err;
  }
  const fetchImpl = opts.fetchImpl || fetch;
  const token = await getEbayAccessToken({ fetchImpl });
  const ext = m[1].includes("png") ? "png" : "jpg";
  const form = new FormData();
  form.append("image", new Blob([Buffer.from(m[2], "base64")], { type: m[1] }), `card.${ext}`);
  const host = ebayApiBase().replace("api.", "apim.");
  const res = await fetchImpl(`${host}/commerce/media/v1_beta/image/create_image_from_file`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch { /* empty body on 201 */ }
  let url = data.imageUrl;
  if (!url && res.ok) {
    const loc = res.headers.get("location");
    if (loc) {
      const g = await fetchImpl(loc, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      url = (await g.json().catch(() => ({}))).imageUrl;
    }
  }
  if (!res.ok || !url) {
    const err = new Error(`eBay photo upload failed (${res.status}): ${data?.errors?.[0]?.message || text.slice(0, 160)}`);
    err.code = "EBAY_API_ERROR";
    err.status = res.status;
    throw err;
  }
  return url;
}

/** https URLs pass through; data: photos are uploaded to eBay. */
/** Replace the photos on a live eBay inventory item (keeps everything else as-is). */
export async function updateEbayPhotos(sku, photos, opts = {}) {
  const imageUrls = await resolveEbayImages({ photos }, opts);
  if (!imageUrls.length) { const e = new Error("eBay needs at least one photo."); e.code = "VALIDATION"; throw e; }
  const path = `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`;
  const { data: cur } = await ebayRequest(path, { method: "GET", fetchImpl: opts.fetchImpl });
  const body = { ...(cur || {}), product: { ...((cur || {}).product || {}), imageUrls } };
  delete body.sku; delete body.locale;
  await ebayRequest(path, { method: "PUT", fetchImpl: opts.fetchImpl, body });
  return { sku, imageUrls };
}
export async function resolveEbayImages(item, opts = {}) {
  const raw = (item.photos || item.imageUrls || []).map((x) => (typeof x === "string" ? x : x?.dataUrl || x?.url)).filter(Boolean).slice(0, 6);
  const out = [];
  for (const u of raw) out.push(/^https:\/\//.test(u) ? u : await uploadEbayImage(u, opts));
  return out;
}

/**
 * Change live listings: price, quantity and/or title, one entry per SKU (each variation is its own SKU).
 * @param {{ sku: string, offerId?: string, price?: number, quantity?: number, title?: string }[]} updates
 */
export async function reviseEbayItems(updates, opts = {}) {
  const fetchImpl = opts.fetchImpl;
  const results = [];
  const pq = [];
  for (const u of updates || []) {
    const sku = String(u.sku || "").trim();
    if (!sku) { results.push({ sku, ok: false, error: "No eBay SKU on this item." }); continue; }
    try {
      if (u.title != null && String(u.title).trim()) {
        const path = `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`;
        const { data: cur } = await ebayRequest(path, { method: "GET", fetchImpl });
        const body = { ...(cur || {}), product: { ...((cur || {}).product || {}), title: String(u.title).trim().slice(0, 80) } };
        if (u.quantity != null) body.availability = { ...(body.availability || {}), shipToLocationAvailability: { ...((body.availability || {}).shipToLocationAvailability || {}), quantity: Math.max(0, Math.round(Number(u.quantity))) } };
        delete body.sku; delete body.locale; delete body.groupIds; delete body.inventoryItemGroupKeys;
        await ebayRequest(path, { method: "PUT", fetchImpl, body });
      }
      if (u.price != null || u.quantity != null) {
        let offerId = u.offerId ? String(u.offerId) : "";
        if (!offerId) {
          const { data } = await ebayRequest(`/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`, { method: "GET", fetchImpl });
          offerId = data?.offers?.[0]?.offerId || "";
        }
        if (!offerId) { results.push({ sku, ok: false, error: "eBay has no offer for this SKU." }); continue; }
        const q = u.quantity != null ? Math.max(0, Math.round(Number(u.quantity))) : undefined;
        const offer = { offerId, ...(q != null ? { availableQuantity: q } : {}), ...(u.price != null ? { price: { currency: "USD", value: Number(u.price).toFixed(2) } } : {}) };
        pq.push({ sku, ...(q != null ? { shipToLocationAvailability: { quantity: q } } : {}), offers: [offer] });
      } else results.push({ sku, ok: true });
    } catch (e) { results.push({ sku, ok: false, error: e.message }); }
  }
  for (let i = 0; i < pq.length; i += 25) {
    const chunk = pq.slice(i, i + 25);
    try {
      const { data } = await ebayRequest("/sell/inventory/v1/bulk_update_price_quantity", { method: "POST", fetchImpl, body: { requests: chunk } });
      const rs = data?.responses || [];
      for (const r of chunk) {
        const hit = rs.find((x) => x.sku === r.sku);
        const bad = hit && Number(hit.statusCode) >= 300;
        results.push(bad ? { sku: r.sku, ok: false, error: hit.errors?.[0]?.message || `eBay said ${hit.statusCode}` } : { sku: r.sku, ok: true });
      }
    } catch (e) { for (const r of chunk) results.push({ sku: r.sku, ok: false, error: e.message }); }
  }
  return results;
}

/** Turn Best Offer on for live listings (by SKU): reads each offer and writes it back with offers on. */
export async function enableBestOffer(skus, opts = {}) {
  const KEEP = ["availableQuantity", "categoryId", "charity", "hideBuyerDetails", "includeCatalogProductDetails", "listingDescription", "listingDuration", "listingPolicies", "listingStartDate", "lotSize", "merchantLocationKey", "pricingSummary", "quantityLimitPerBuyer", "regulatory", "secondaryCategoryId", "storeCategoryNames", "tax"];
  const out = [];
  for (const sku of skus) {
    try {
      const got = await ebayRequest(`/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&marketplace_id=${encodeURIComponent(ebayMarketplaceId())}`, { fetchImpl: opts.fetchImpl });
      const offers = got.data?.offers || []; if (!offers.length) { out.push({ sku, ok: false, error: "No eBay offer for this SKU" }); continue; }
      for (const o of offers) {
        const body = {}; for (const k of KEEP) if (o[k] !== undefined) body[k] = o[k];
        const bo = bestOfferTerms({ offerFloorPct: opts.pct }, Number(o.pricingSummary?.price?.value));
        body.listingPolicies = { ...(o.listingPolicies || {}), bestOfferTerms: bo };
        await ebayRequest(`/sell/inventory/v1/offer/${encodeURIComponent(o.offerId)}`, { method: "PUT", fetchImpl: opts.fetchImpl, body });
      }
      out.push({ sku, ok: true });
    } catch (e) { out.push({ sku, ok: false, error: e.message }); }
  }
  return out;
}

/** Everything about one live listing, straight from eBay, for the full editor. */
export async function getEbayListingDetail(sku, opts = {}) {
  const fetchImpl = opts.fetchImpl;
  const { data: inv } = await ebayRequest(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, { fetchImpl });
  const { data: of } = await ebayRequest(`/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&marketplace_id=${encodeURIComponent(ebayMarketplaceId())}`, { fetchImpl });
  const o = (of?.offers || [])[0] || {};
  const lp = o.listingPolicies || {}, bo = lp.bestOfferTerms || null, price = Number(o.pricingSummary?.price?.value) || null;
  return {
    sku, offerId: o.offerId || null, listingId: o.listing?.listingId || null, status: o.status || null,
    title: inv?.product?.title || "", description: o.listingDescription || inv?.product?.description || "",
    aspects: inv?.product?.aspects || {}, imageUrls: inv?.product?.imageUrls || [],
    condition: inv?.condition || null, conditionDescriptors: inv?.conditionDescriptors || null,
    quantity: o.availableQuantity ?? inv?.availability?.shipToLocationAvailability?.quantity ?? 1, price,
    categoryId: o.categoryId || null, fulfillmentPolicyId: lp.fulfillmentPolicyId || null, returnPolicyId: lp.returnPolicyId || null, paymentPolicyId: lp.paymentPolicyId || null,
    bestOffer: !!bo?.bestOfferEnabled, offerFloorPct: bo?.autoDeclinePrice && price ? Math.round((Number(bo.autoDeclinePrice.value) / price) * 100) : null,
    groupIds: inv?.groupIds || [],
  };
}

/** Change anything on a live listing: the item (title, description, specifics, condition, photos) and the offer (price, qty, category, policies, offers). eBay updates the live listing. */
export async function reviseEbayListingFull(u, opts = {}) {
  const fetchImpl = opts.fetchImpl, sku = String(u.sku || "").trim();
  if (!sku) { const e = new Error("No eBay SKU on this item."); e.code = "VALIDATION"; throw e; }
  const { descriptionHtml } = await import("../listing/engine.js");
  const ipath = `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`;
  const { data: cur } = await ebayRequest(ipath, { fetchImpl });
  const item = { ...(cur || {}) }; delete item.sku; delete item.locale; delete item.groupIds; delete item.inventoryItemGroupKeys;
  item.product = { ...(item.product || {}) };
  if (u.title != null && String(u.title).trim()) item.product.title = String(u.title).trim().slice(0, 80);
  if (u.description != null) item.product.description = descriptionHtml(u.description);
  if (u.aspects && typeof u.aspects === "object") item.product.aspects = Object.fromEntries(Object.entries(u.aspects).filter(([k, v]) => k && v != null && String(v).trim()).map(([k, v]) => [k, Array.isArray(v) ? v.map(String) : String(v).split(/\s*,\s*/).filter(Boolean)]));
  if (Array.isArray(u.imageUrls) && u.imageUrls.length) item.product.imageUrls = u.imageUrls.filter((x) => /^https:\/\//.test(x)).slice(0, 24);
  if (u.condition) {
    const c = String(u.condition).toUpperCase();
    if (/^(NM|LP|MP|HP|DMG)$/.test(c)) { item.condition = "USED_VERY_GOOD"; item.conditionDescriptors = [{ name: "40001", values: [CARD_COND[c] || "400010"] }]; }
    else if (c === "NEW") { item.condition = "NEW"; delete item.conditionDescriptors; }
    else if (/^USED/.test(c)) { item.condition = "USED_EXCELLENT"; delete item.conditionDescriptors; }
  }
  if (u.quantity != null) item.availability = { ...(item.availability || {}), shipToLocationAvailability: { ...((item.availability || {}).shipToLocationAvailability || {}), quantity: Math.max(0, Math.round(Number(u.quantity))) } };
  await ebayRequest(ipath, { method: "PUT", fetchImpl, body: item });

  const { data: of } = await ebayRequest(`/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&marketplace_id=${encodeURIComponent(ebayMarketplaceId())}`, { fetchImpl });
  const o = (of?.offers || [])[0]; if (!o) { const e = new Error("eBay has no offer for this SKU."); e.code = "EBAY_API_ERROR"; throw e; }
  const KEEP = ["availableQuantity", "categoryId", "charity", "hideBuyerDetails", "includeCatalogProductDetails", "listingDescription", "listingDuration", "listingPolicies", "listingStartDate", "lotSize", "merchantLocationKey", "pricingSummary", "quantityLimitPerBuyer", "regulatory", "secondaryCategoryId", "storeCategoryNames", "tax"];
  const body = {}; for (const k of KEEP) if (o[k] !== undefined) body[k] = o[k];
  if (u.description != null) body.listingDescription = descriptionHtml(u.description);
  if (u.price != null && Number(u.price) > 0) body.pricingSummary = { ...(body.pricingSummary || {}), price: { currency: "USD", value: Number(u.price).toFixed(2) } };
  if (u.quantity != null) body.availableQuantity = Math.max(0, Math.round(Number(u.quantity)));
  if (u.categoryId) body.categoryId = String(u.categoryId);
  const lp = { ...(body.listingPolicies || {}) };
  if (u.fulfillmentPolicyId) lp.fulfillmentPolicyId = String(u.fulfillmentPolicyId);
  if (u.returnPolicyId) lp.returnPolicyId = String(u.returnPolicyId);
  if (u.bestOffer != null) { const p = Number(body.pricingSummary?.price?.value); const bo = bestOfferTerms({ bestOffer: !!u.bestOffer, offerFloorPct: u.offerFloorPct }, p); lp.bestOfferTerms = bo || { bestOfferEnabled: false }; }
  body.listingPolicies = lp;
  await ebayRequest(`/sell/inventory/v1/offer/${encodeURIComponent(o.offerId)}`, { method: "PUT", fetchImpl, body });
  return { ok: true, sku, offerId: o.offerId };
}

/** A whole variation listing (inventory item group): shared title/description/specifics/photos + every variation's price and qty. */
export async function getEbayGroupDetail(groupKey, opts = {}) {
  const fetchImpl = opts.fetchImpl;
  const { data: g } = await ebayRequest(`/sell/inventory/v1/inventory_item_group/${encodeURIComponent(groupKey)}`, { fetchImpl });
  const skus = g?.variantSKUs || [], axis = g?.variesBy?.specifications?.[0]?.name || "Card";
  const variants = [];
  let pol = {}, bo = null, cat = null;
  for (const sku of skus) {
    try {
      const [{ data: inv }, { data: of }] = await Promise.all([
        ebayRequest(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, { fetchImpl }),
        ebayRequest(`/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&marketplace_id=${encodeURIComponent(ebayMarketplaceId())}`, { fetchImpl }),
      ]);
      const o = (of?.offers || [])[0] || {};
      if (!pol.fulfillmentPolicyId && o.listingPolicies) { pol = o.listingPolicies; bo = o.listingPolicies.bestOfferTerms || null; cat = o.categoryId || null; }
      variants.push({ sku, name: (inv?.product?.aspects?.[axis] || [])[0] || inv?.product?.title || sku, price: Number(o.pricingSummary?.price?.value) || null, quantity: o.availableQuantity ?? inv?.availability?.shipToLocationAvailability?.quantity ?? 0, image: (inv?.product?.imageUrls || [])[0] || null });
    } catch (e) { variants.push({ sku, name: sku, error: e.message }); }
  }
  const p0 = variants.find((v) => v.price)?.price;
  return { groupKey, title: g?.title || "", description: g?.description || "", aspects: g?.aspects || {}, imageUrls: g?.imageUrls || [], axis, variants, categoryId: cat,
    fulfillmentPolicyId: pol.fulfillmentPolicyId || null, returnPolicyId: pol.returnPolicyId || null, bestOffer: !!bo?.bestOfferEnabled, offerFloorPct: bo?.autoDeclinePrice && p0 ? Math.round((Number(bo.autoDeclinePrice.value) / p0) * 100) : null };
}

/** Change a whole variation listing: group title/description/specifics, then each variation's price/qty and the shared policies/offers. */
export async function reviseEbayGroupFull(u, opts = {}) {
  const fetchImpl = opts.fetchImpl, key = String(u.groupKey || "").trim();
  if (!key) { const e = new Error("No variation group on this listing."); e.code = "VALIDATION"; throw e; }
  const { descriptionHtml } = await import("../listing/engine.js");
  const gpath = `/sell/inventory/v1/inventory_item_group/${encodeURIComponent(key)}`;
  const { data: g } = await ebayRequest(gpath, { fetchImpl });
  const body = { ...(g || {}) }; delete body.inventoryItemGroupKey;
  if (u.title != null && String(u.title).trim()) body.title = String(u.title).trim().slice(0, 80);
  if (u.description != null) body.description = descriptionHtml(u.description);
  if (u.aspects && typeof u.aspects === "object") body.aspects = Object.fromEntries(Object.entries(u.aspects).filter(([k, v]) => k && v != null && String(v).trim()).map(([k, v]) => [k, Array.isArray(v) ? v.map(String) : String(v).split(/\s*,\s*/).filter(Boolean)]));
  await ebayRequest(gpath, { method: "PUT", fetchImpl, body: { inventoryItemGroupKey: key, ...body } });
  const results = [];
  for (const v of u.variants || []) {
    try {
      await reviseEbayListingFull({ sku: v.sku, price: v.price, quantity: v.quantity, description: u.description, fulfillmentPolicyId: u.fulfillmentPolicyId, returnPolicyId: u.returnPolicyId, bestOffer: u.bestOffer, offerFloorPct: u.offerFloorPct }, { fetchImpl });
      results.push({ sku: v.sku, ok: true });
    } catch (e) { results.push({ sku: v.sku, ok: false, error: e.message }); }
  }
  const bad = results.filter((r) => !r.ok);
  return { ok: bad.length === 0, results, error: bad[0]?.error };
}
