/**
 * Market value for a title = median of the cheapest-to-mid ACTIVE eBay listings
 * (Browse API, read-only). Honest label: "active listings", not sold comps.
 * Returns { ok:false } when eBay isn't connected or nothing matches.
 */
import { ebayRequest } from "./channels/ebay.js";

export function medianPrice(prices) {
  const p = prices.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!p.length) return null;
  // trim the top 20% (graded outliers / reprint hype) when there are enough comps
  const cut = p.length >= 6 ? p.slice(0, Math.ceil(p.length * 0.8)) : p;
  const m = Math.floor(cut.length / 2);
  const v = cut.length % 2 ? cut[m] : (cut[m - 1] + cut[m]) / 2;
  return Math.round(v * 100) / 100;
}

export async function activeComps(query, { request = ebayRequest } = {}) {
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
