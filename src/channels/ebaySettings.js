/** eBay policy settings chosen in the app. Stored in private Blob; override env so no redeploy is needed. */
import { ebayRequest, ebayMarketplaceId } from "./ebay.js";

const PATH = "coalition/ebay-settings.json";
const MAP = {
  fulfillmentPolicyId: "EBAY_FULFILLMENT_POLICY_ID",
  envelopePolicyId: "EBAY_CARD_ENVELOPE_POLICY_ID",
  paymentPolicyId: "EBAY_PAYMENT_POLICY_ID",
  returnPolicyId: "EBAY_RETURN_POLICY_ID",
  merchantLocationKey: "EBAY_MERCHANT_LOCATION_KEY",
  cardThresholdUsd: "EBAY_CARD_THRESHOLD_USD",
};
let at = 0;
function token() {
  const k = Object.keys(process.env).find((n) => /READ_WRITE_TOKEN$/.test(n) && process.env[n]);
  return k ? process.env[k] : "";
}
export async function hydrateEbaySettings(force = false) {
  if (!force && Date.now() - at < 30000) return;
  at = Date.now();
  const t = token();
  if (!t) return;
  try {
    const { get } = await import("@vercel/blob");
    const r = await get(PATH, { access: "private", useCache: false, token: t });
    if (!r || r.statusCode !== 200) return;
    const d = JSON.parse(await new Response(r.stream).text());
    for (const [k, envName] of Object.entries(MAP)) if (d[k]) process.env[envName] = String(d[k]);
  } catch { /* none stored */ }
}
export function currentEbaySettings() {
  const o = {};
  for (const [k, envName] of Object.entries(MAP)) o[k] = (process.env[envName] || "").trim();
  return o;
}
export async function saveEbaySettings(body) {
  const t = token();
  if (!t) { const e = new Error("Durable storage isn't attached."); e.code = "NO_STORAGE"; e.status = 503; throw e; }
  const next = { ...currentEbaySettings() };
  for (const k of Object.keys(MAP)) if (body[k] !== undefined) next[k] = String(body[k]).trim();
  if (next.cardThresholdUsd && !(Number(next.cardThresholdUsd) > 0)) { const e = new Error("Threshold must be a number above 0"); e.code = "VALIDATION"; e.status = 400; throw e; }
  const { put } = await import("@vercel/blob");
  await put(PATH, JSON.stringify(next), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", token: t });
  for (const [k, envName] of Object.entries(MAP)) if (next[k]) process.env[envName] = next[k];
  at = Date.now();
  return next;
}
export async function listEbayPolicies(opts = {}) {
  const mk = ebayMarketplaceId();
  const q = `?marketplace_id=${encodeURIComponent(mk)}`;
  const pick = async (kind, key, idKey) => {
    try {
      const r = await ebayRequest(`/sell/account/v1/${kind}${q}`, opts);
      const d = r?.data ?? r;
      return (d?.[key] || []).map((p) => ({ id: p[idKey], name: p.name }));
    } catch { return []; }
  };
  const [fulfillment, payment, returns] = await Promise.all([
    pick("fulfillment_policy", "fulfillmentPolicies", "fulfillmentPolicyId"),
    pick("payment_policy", "paymentPolicies", "paymentPolicyId"),
    pick("return_policy", "returnPolicies", "returnPolicyId"),
  ]);
  return { fulfillment, payment, returns };
}
