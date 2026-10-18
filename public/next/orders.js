/* Real eBay orders (last 90 days), kept apart from inventory so Sold and Shipped are always current. */
import { loadItems, esc } from "./shared.js?v=4";
const LS = "coalition-orders-v1";
export const saveOrders = (list) => { try { localStorage.setItem(LS, JSON.stringify(list)); return true; } catch { return false; } };
export const loadOrders = () => { try { const v = JSON.parse(localStorage.getItem(LS) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
export const trackUrl = (o) => {
  const n = encodeURIComponent(o.trackingNumber || ""); if (!n) return ""; const c = String(o.carrier || "").toLowerCase();
  return /fedex/.test(c) ? `https://www.fedex.com/fedextrack/?trknbr=${n}` : /ups/.test(c) ? `https://www.ups.com/track?tracknum=${n}` : `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
};
export const whenLabel = (iso) => { const d = Date.now() - Date.parse(iso || 0); return d < 2 * 864e5 ? "Today and yesterday" : d < 7 * 864e5 ? "This week" : d < 14 * 864e5 ? "Last week" : "Earlier";};
export const dayText = (iso) => { const t = Date.parse(iso || ""); return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""; };
export function orderItems(days = 90) {
  const bySku = new Map(); for (const it of loadItems()) { const s = it.sku || it.channels?.ebay?.sku; if (s && !bySku.has(s) && it.photos?.length) bySku.set(s, it); }
  const cut = Date.now() - days * 864e5;
  return loadOrders().filter((o) => Date.parse(o.createdAt || 0) >= cut).map((o) => {
    const li = o.items || [], first = li[0] || {}, hit = bySku.get(first.sku), shipped = o.status !== "label_created";
    const when = shipped ? o.shippedAt || o.createdAt : o.createdAt, ph = !shipped ? "sold" : track(o).step === 4 ? "delivered" : "shipped";
    return { id: "ord-" + o.orderId, source: "order", _order: o, title: (first.title || "eBay order") + (li.length > 1 ? ` + ${li.length - 1} more` : ""), photos: hit ? hit.photos.slice(0, 1) : [], price: o.total || 0, quantity: li.reduce((a, x) => a + (x.qty || 1), 0) || 1, phase: ph, when };
  }).sort((a, b) => String(b.when).localeCompare(String(a.when)));
}

/* Tracker: eBay only says "fulfilled", so progress is estimated from the ship date until a carrier feed is connected. Overrides let Sawyer move one by hand. */
const OV = "coalition-order-state-v1", HID = "coalition-hidden-v1";
const rd = (k) => { try { return JSON.parse(localStorage.getItem(k) || "{}") || {}; } catch { return {}; } };
export const setOv = (id, v) => { const o = rd(OV); if (v) o[id] = v; else delete o[id]; try { localStorage.setItem(OV, JSON.stringify(o)); } catch { /* ignore */ } };
export const hiddenIds = () => new Set(Object.keys(rd(HID)));
export const hideIds = (ids) => { const o = rd(HID); ids.forEach((i) => { o[String(i)] = 1; }); try { localStorage.setItem(HID, JSON.stringify(o)); } catch { /* ignore */ } };
export const STEPS = ["Label made", "Shipped", "In transit", "Out for delivery", "Delivered"];
export function track(o) {
  const ov = rd(OV)[o.orderId];
  if (o.status === "label_created") return { step: 0, pct: 0, est: false, days: 0 };
  const days = Math.max(0, (Date.now() - Date.parse(o.shippedAt || o.createdAt || 0)) / 864e5), exp = 3.5, f = days / exp;
  let step = f < 0.12 ? 1 : f < 0.8 ? 2 : f < 1.3 ? 3 : 4;
  if (ov === "delivered") step = 4; else if (ov === "transit" && step === 4) step = 2;
  const pct = step === 4 ? 100 : Math.max(6, Math.min(94, Math.round(f * 100)));
  return { step, pct, est: !ov, days: Math.floor(days), ov };
}
export function trackerHtml(o) {
  const t = track(o), from = "Menomonie, WI", to = o.shipTo || "Buyer";
  return `<div class="trk"><div class="trk-ends"><span>${esc(from)}</span><span>${esc(to)}</span></div><div class="trk-bar"><i style="width:${t.pct}%"></i><b style="left:${t.pct}%"></b></div>
  <ol class="trk-steps">${STEPS.map((s, i) => `<li class="${i < t.step ? "done" : i === t.step ? "now" : ""}">${s}</li>`).join("")}</ol>
  <p class="sub">${t.step === 0 ? "Label made, not shipped yet." : t.est ? `Day ${t.days} since it shipped. Position is estimated from the ship date until a carrier tracking feed is connected.` : "Moved by hand."}</p>
  ${t.step === 4 ? `<button class="btn" data-ov="transit" type="button">Not delivered yet</button>` : t.step > 0 ? `<button class="btn" data-ov="delivered" type="button">Mark delivered</button>` : ""}</div>`;
}
