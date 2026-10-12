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
  return env("MISPRINT_API_BASE").replace(/\/$/, "");
}

export function misprintReady() {
  return misprintKeysPresent() && Boolean(misprintBaseUrl());
}

function authHeaders() {
  const key = env("MISPRINT_API_KEY");
  const secret = env("MISPRINT_API_SECRET");
  /** @type {Record<string, string>} */
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    "X-API-Key": key,
    "X-Seller-Id": env("MISPRINT_SELLER_ID"),
  };
  if (secret) headers["X-API-Secret"] = secret;
  return headers;
}

/**
 * Soft connectivity check — never returns secret values.
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function probeMisprint(opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  if (!misprintKeysPresent()) {
    const err = new Error(
      "Misprint keys missing — need MISPRINT_API_KEY and MISPRINT_SELLER_ID",
    );
    err.code = "CHANNEL_NOT_CONFIGURED";
    throw err;
  }

  const base = misprintBaseUrl();
  const sellerId = env("MISPRINT_SELLER_ID");
  const key = env("MISPRINT_API_KEY");

  if (!base) {
    return {
      ok: false,
      keysPresent: true,
      baseConfigured: false,
      sellerIdPreview: `${sellerId.slice(0, 8)}…`,
      keyPreview: `${key.slice(0, 10)}…`,
      code: "MISPRINT_BASE_REQUIRED",
      error:
        "Keys are saved. Still need MISPRINT_API_BASE (the API host from Misprint’s key screen / docs). Paste just that URL in Cursor chat.",
    };
  }

  const candidates = [
    `${base}/health`,
    `${base}/v1/health`,
    `${base}/v1/me`,
    `${base}/v1/sellers/me`,
    `${base}/v1/sellers/${encodeURIComponent(sellerId)}`,
    `${base}/sellers/me`,
    `${base}/me`,
  ];

  const attempts = [];
  for (const url of candidates) {
    try {
      const res = await fetchImpl(url, {
        method: "GET",
        headers: authHeaders(),
      });
      const text = await res.text();
      attempts.push({
        url: url.replace(base, "{base}"),
        status: res.status,
        ok: res.ok,
        bodyPreview: text.slice(0, 120).replace(/\s+/g, " "),
      });
      if (res.ok) {
        return {
          ok: true,
          keysPresent: true,
          baseConfigured: true,
          baseHost: new URL(base).host,
          sellerIdPreview: `${sellerId.slice(0, 8)}…`,
          probedPath: url.replace(base, ""),
          status: res.status,
        };
      }
    } catch (err) {
      attempts.push({
        url: url.replace(base, "{base}"),
        status: "ERR",
        ok: false,
        bodyPreview: String(err.message || err).slice(0, 120),
      });
    }
  }

  return {
    ok: false,
    keysPresent: true,
    baseConfigured: true,
    baseHost: new URL(base).host,
    sellerIdPreview: `${sellerId.slice(0, 8)}…`,
    code: "MISPRINT_PROBE_FAILED",
    error: "Base URL set but no health/me endpoint accepted the key yet",
    attempts,
  };
}

async function misprintRequest(path, opts = {}) {
  if (!misprintReady()) {
    const err = new Error(
      misprintKeysPresent()
        ? "Misprint base URL missing — set MISPRINT_API_BASE"
        : "Misprint not configured — set MISPRINT_API_KEY and MISPRINT_SELLER_ID",
    );
    err.code = misprintKeysPresent() ? "MISPRINT_BASE_REQUIRED" : "CHANNEL_NOT_CONFIGURED";
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
export async function publishMisprintListing(item, opts = {}) {
  if (!item?.title) {
    const err = new Error("Misprint publish requires item.title");
    err.code = "VALIDATION";
    throw err;
  }
  const price = Number(item.price);
  if (!Number.isFinite(price) || price <= 0) {
    const err = new Error("Misprint publish requires item.price > 0");
    err.code = "VALIDATION";
    throw err;
  }

  const body = {
    sellerId: env("MISPRINT_SELLER_ID"),
    externalId: item.id,
    title: item.title,
    description: item.description || item.title,
    price,
    quantity: Math.max(1, Number(item.quantity) || 1),
    sku: `hud-${item.id}`.slice(0, 50),
  };

  const { data } = await misprintRequest("/v1/asks", {
    method: "POST",
    body,
    fetchImpl: opts.fetchImpl,
  });

  const listingId = data?.id || data?.askId || data?.listingId || null;
  return {
    channelId: "misprint",
    listingId,
    price,
    status: "active",
    raw: data,
  };
}

/**
 * @param {{ listingId: string, price?: number, quantity?: number }} payload
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function updateMisprintAsk(payload, opts = {}) {
  const body = {};
  if (payload.price != null) body.price = Number(payload.price);
  if (payload.quantity != null) body.quantity = Math.max(0, Number(payload.quantity));
  const { data } = await misprintRequest(`/v1/asks/${encodeURIComponent(payload.listingId)}`, {
    method: "PATCH",
    body,
    fetchImpl: opts.fetchImpl,
  });
  return { channelId: "misprint", listingId: payload.listingId, ok: true, raw: data };
}

/**
 * @param {{ listingId: string }} payload
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function endMisprintAsk(payload, opts = {}) {
  const { data } = await misprintRequest(`/v1/asks/${encodeURIComponent(payload.listingId)}`, {
    method: "DELETE",
    fetchImpl: opts.fetchImpl,
  });
  return { channelId: "misprint", listingId: payload.listingId, status: "ended", raw: data };
}
