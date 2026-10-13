/**
 * Market value for a title = median of the cheapest-to-mid ACTIVE eBay listings
 * (Browse API, read-only). Honest label: "active listings", not sold comps.
 * Returns { ok:false } when eBay isn't connected or nothing matches.
 */
import { ebayApiBase } from "./channels/ebay.js";
import { ebayConnectEnv } from "./channels/ebayConnect.js";

// Browse is public data: it needs an APPLICATION token (client credentials), not the seller token.
let appTok = null, appExp = 0;
async function appToken(fetchImpl = fetch) {
  if (appTok && Date.now() < appExp - 60_000) return appTok;
  const { clientId, clientSecret } = ebayConnectEnv();
  if (!clientId || !clientSecret) throw new Error("eBay keys not set");
  const res = await fetchImpl(`${ebayApiBase()}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`eBay app token failed (${res.status})`);
  appTok = data.access_token; appExp = Date.now() + (Number(data.expires_in) || 7200) * 1000;
  return appTok;
}
async function browseRequest(path, fetchImpl = fetch) {
  const res = await fetchImpl(`${ebayApiBase()}${path}`, { headers: { Authorization: `Bearer ${await appToken(fetchImpl)}`, Accept: "application/json", "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" } });
  if (!res.ok) throw new Error(`eBay Browse failed (${res.status})`);
  return res.json();
}

export function medianPrice(prices) {
  const p = prices.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!p.length) return null;
  // trim the top 20% (graded outliers / reprint hype) when there are enough comps
  const cut = p.length >= 6 ? p.slice(0, Math.ceil(p.length * 0.8)) : p;
  const m = Math.floor(cut.length / 2);
  const v = cut.length % 2 ? cut[m] : (cut[m - 1] + cut[m]) / 2;
  return Math.round(v * 100) / 100;
}

export async function activeComps(query, { request = browseRequest } = {}) {
  const q = String(query || "").trim().slice(0, 120);
  if (q.length < 3) return { ok: false, reason: "query too short" };
  try {
    const data = await request(`/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=40&filter=buyingOptions:%7BFIXED_PRICE%7D,conditions:%7BNEW%7CUSED%7D`);
    const prices = (data?.itemSummaries || []).map((i) => Number(i?.price?.value));
    const value = medianPrice(prices);
    if (value == null) return { ok: false, reason: "no matching listings" };
    return { ok: true, value, count: prices.filter((n) => n > 0).length, basis: "active eBay listings", query: q };
  } catch (err) {
    return { ok: false, reason: err?.message ? String(err.message).slice(0, 160) : "eBay lookup failed" };
  }
}
