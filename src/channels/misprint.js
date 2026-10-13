/**
 * Misprint channel client.
 *
 * Auth: MISPRINT_API_KEY (+ optional MISPRINT_API_SECRET) as Bearer / X-API-Key.
 * Seller: MISPRINT_SELLER_ID.
 * Host: MISPRINT_API_BASE (required for live calls — Misprint has no public docs;
 *       base URL must come from their seller/partner API screen).
 *
 * Coalition H.U.D remains canonical inventory (see sync.js).
 */

function env(key, fallback = "") {
  const v = process.env[key];
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

const MP_BLOB_PATH = "coalition/misprint-keys.json";
let mpHydratedAt = 0;
function mpBlobToken() {
  const k = Object.keys(process.env).find((n) => /READ_WRITE_TOKEN$/.test(n) && process.env[n]);
  return k ? process.env[k] : "";
}

/** Keys entered in the app live in a private Blob; copy them into process.env (env wins if set). */
export async function hydrateMisprintKeys(force = false) {
  if (!force && Date.now() - mpHydratedAt < 30000) return;
  mpHydratedAt = Date.now();
  const token = mpBlobToken();
  if (!token) return;
  try {
    const { get } = await import("@vercel/blob");
    const r = await get(MP_BLOB_PATH, { access: "private", useCache: false, token });
    if (!r || r.statusCode !== 200) return;
    const d = JSON.parse(await new Response(r.stream).text());
    if (d.apiKey && !process.env.MISPRINT_API_KEY) process.env.MISPRINT_API_KEY = d.apiKey;
    if (d.sellerId && !process.env.MISPRINT_SELLER_ID) process.env.MISPRINT_SELLER_ID = d.sellerId;
    if (d.apiBase && !process.env.MISPRINT_API_BASE) process.env.MISPRINT_API_BASE = d.apiBase;
  } catch { /* not stored yet */ }
}

/** Save keys from the app. First save is open; replacing needs the current key. */
export async function saveMisprintKeys({ apiKey, sellerId, apiBase, currentKey }) {
  await hydrateMisprintKeys(true);
  const existing = env("MISPRINT_API_KEY");
  if (existing && currentKey !== existing) {
    const err = new Error("A Misprint key is already saved. Send currentKey to replace it.");
    err.code = "CONFLICT";
    throw err;
  }
  const token = mpBlobToken();
  if (!token) {
    const err = new Error("Durable storage isn't attached, so a key can't be saved from the app.");
    err.code = "NO_STORAGE";
    throw err;
  }
  const rec = { apiKey: String(apiKey || "").trim(), sellerId: String(sellerId || env("MISPRINT_SELLER_ID")).trim(), apiBase: String(apiBase || env("MISPRINT_API_BASE")).trim() };
  if (!rec.apiKey) {
    const err = new Error("apiKey required");
    err.code = "VALIDATION";
    throw err;
  }
  const { put } = await import("@vercel/blob");
  await put(MP_BLOB_PATH, JSON.stringify(rec), { access: "private", token, allowOverwrite: true, addRandomSuffix: false, contentType: "application/json" });
  process.env.MISPRINT_API_KEY = rec.apiKey;
  if (rec.sellerId) process.env.MISPRINT_SELLER_ID = rec.sellerId;
  if (rec.apiBase) process.env.MISPRINT_API_BASE = rec.apiBase;
  return { saved: true, hasBase: Boolean(rec.apiBase), hasSeller: Boolean(rec.sellerId) };
}

export function misprintKeysPresent() {
  return Boolean(env("MISPRINT_API_KEY") && env("MISPRINT_SELLER_ID"));
}

export function misprintBaseUrl() {
  const raw = env("MISPRINT_API_BASE", "https://www.misprint.com").replace(/\/$/, "");
  const origin = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  return origin.replace(/\/api\/v1$/, "") + "/api/v1";
}

export function misprintReady() {
  return misprintKeysPresent();
}

function authHeaders() {
  const key = env("MISPRINT_API_KEY");
  const secret = env("MISPRINT_API_SECRET");
  /** @type {Record<string, string>} */
  // Confirmed live (Oct 12): Bearer key + X-User-Id (seller id). Nothing else.
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    "X-User-Id": env("MISPRINT_SELLER_ID"),
  };
  void secret;
  return headers;
}

/**
 * Soft connectivity check — never returns secret values.
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function probeMisprint(opts = {}) {
  if (!misprintKeysPresent()) {
    const err = new Error("Misprint keys missing — need MISPRINT_API_KEY and MISPRINT_SELLER_ID");
    err.code = "CHANNEL_NOT_CONFIGURED";
    throw err;
  }
  const sellerId = env("MISPRINT_SELLER_ID");
  try {
    const { status } = await misprintRequest("/seller/inventory?page=1&limit=1", opts);
    return { ok: true, keysPresent: true, baseHost: new URL(misprintBaseUrl()).host, sellerIdPreview: `${sellerId.slice(0, 8)}…`, status };
  } catch (err) {
    return { ok: false, keysPresent: true, baseHost: new URL(misprintBaseUrl()).host, code: err.code || "MISPRINT_PROBE_FAILED", status: err.status || null, error: String(err.message || err).slice(0, 200) };
  }
}

/** Page through /seller/<what> (inventory | orders). Results live in the "data" array. */
async function misprintPaged(what, opts = {}) {
  const limit = 100;
  const max = Math.min(Number(opts.maxPages) || 20, 50);
  const rows = [];
  for (let page = 1; page <= max; page++) {
    const { data } = await misprintRequest(`/seller/${what}?page=${page}&limit=${limit}`, opts);
    const batch = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (batch.length < limit) break;
  }
  return rows;
}

export async function listMisprintInventory(opts = {}) {
  return misprintPaged("inventory", opts);
}
export async function listMisprintOrders(opts = {}) {
  return misprintPaged("orders", opts);
}

async function misprintRequest(path, opts = {}) {
  if (!misprintKeysPresent()) {
    const err = new Error("Misprint not configured — set MISPRINT_API_KEY and MISPRINT_SELLER_ID");
    err.code = "CHANNEL_NOT_CONFIGURED";
    throw err;
  }

  const fetchImpl = opts.fetchImpl || fetch;
  const method = opts.method || "GET";
  const res = await fetchImpl(`${misprintBaseUrl()}${path}`, {
    method,
    headers: authHeaders(),
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
      `Misprint API ${method} ${path} failed (${res.status}): ${data?.error || data?.message || res.statusText}`,
    );
    err.code = "MISPRINT_API_ERROR";
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return { status: res.status, data };
}

/**
 * Create / update an ask (listing). Path is a best-effort default until contract confirmed.
 * @param {import('../store.js').ScoutItem} item
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
function writeUnconfirmed() {
  const err = new Error("Misprint listing writes aren't enabled yet: real writes need the go-ahead (MISPRINT_WRITES_CONFIRMED).");
  err.code = "MISPRINT_WRITE_UNCONFIRMED";
  err.status = 501;
  return err;
}

function vErr(msg){const e=new Error(msg);e.code="VALIDATION";e.status=400;return e;}

const COND = { "near mint":"NM", nm:"NM", "lightly played":"LP", lp:"LP", "moderately played":"MP", mp:"MP", "heavily played":"HP", hp:"HP", damaged:"DMG", dmg:"DMG" };

/** Build the confirmed POST /seller/inventory body (docs/misprint-api.md). */
export function buildMisprintCreateBody(item) {
  const productId = Number(item?.tcgplayerId || item?.tcgProductId || item?.productId || item?.channels?.misprint?.productId);
  if (!Number.isInteger(productId) || productId <= 0) throw vErr("Misprint needs the TCGplayer product ID for this card");
  const price = Number(item.price);
  if (!Number.isFinite(price) || price <= 0) throw vErr("Misprint publish requires item.price > 0");
  const grader = String(item.grader || item.gradingAuthority || "Ungraded").trim() || "Ungraded";
  const raw = String(item.grade || item.condition || "NM").trim();
  const grade = grader === "Ungraded" ? (COND[raw.toLowerCase()] || raw.toUpperCase()) : raw;
  const body = { product_id: productId, grading_authority: grader, grading_scale_value: grade, price, quantity: Math.max(1, Number(item.quantity) || 1) };
  if (item.variant || item.tcgpVariant) body.tcgp_variant = String(item.variant || item.tcgpVariant);
  if (item.misprintVariantId) body.misprint_variant_id = Number(item.misprintVariantId);
  const imgs = (item.photos || []).map((p) => (typeof p === "string" ? p : p?.url)).filter((u) => /^https:\/\//.test(u || ""));
  if (imgs.length) body.image_urls = imgs;
  return body;
}

/** Create a listing. Real write: gated by MISPRINT_WRITES_CONFIRMED; opts.dryRun returns the body only. */
export async function publishMisprintListing(item, opts = {}) {
  const body = buildMisprintCreateBody(item);
  if (opts.dryRun) return { channelId: "misprint", dryRun: true, body };
  if (!process.env.MISPRINT_WRITES_CONFIRMED && !opts.confirmed) throw writeUnconfirmed();
  const { data } = await misprintRequest("/seller/inventory", { method: "POST", body, fetchImpl: opts.fetchImpl });
  const row = data?.data || data || {};
  return { channelId: "misprint", listingId: row.listing_id || row.id || null, price: body.price, status: "active", raw: data };
}

/** Price/qty update: no confirmed endpoint yet (PATCH/PUT are 404/405). */
export async function updateMisprintAsk() {
  const err = new Error("Misprint has no confirmed price/quantity update endpoint yet; delist and relist instead.");
  err.code = "MISPRINT_UPDATE_UNSUPPORTED";
  err.status = 501;
  throw err;
}

/** Delist: DELETE /seller/inventory {listing_id}. Gated like other real writes. */
export async function endMisprintAsk(payload, opts = {}) {
  if (!payload?.listingId) throw vErr("listingId required");
  if (opts.dryRun) return { channelId: "misprint", dryRun: true, body: { listing_id: payload.listingId } };
  if (!process.env.MISPRINT_WRITES_CONFIRMED && !opts.confirmed) throw writeUnconfirmed();
  const { data } = await misprintRequest("/seller/inventory", { method: "DELETE", body: { listing_id: payload.listingId }, fetchImpl: opts.fetchImpl });
  return { channelId: "misprint", listingId: payload.listingId, status: "ended", raw: data };
}
