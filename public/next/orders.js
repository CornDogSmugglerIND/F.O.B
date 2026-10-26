/* Real eBay orders (last 90 days), kept apart from inventory so Sold and Shipped are always current. */
import { peekItems, esc, isArchived } from "./shared.js?v=7";
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
  const bySku = new Map(), byTitle = new Map(), norm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 60);
  for (const it of peekItems()) { if (!it.photos?.length) continue; const s = it.sku || it.channels?.ebay?.sku; if (s && !bySku.has(s)) bySku.set(s, it); const t = norm(it.title); if (t && !byTitle.has(t)) byTitle.set(t, it); }
  const cut = Date.now() - days * 864e5;
  return loadOrders().filter((o) => Date.parse(o.createdAt || 0) >= cut && !isArchived("ord-" + o.orderId)).map((o) => {
    const li = o.items || [], first = li[0] || {}, hit = bySku.get(first.sku) || byTitle.get(norm(first.title)), shipped = o.status !== "label_created";
    const when = shipped ? o.shippedAt || o.createdAt : o.createdAt, ph = !shipped ? "sold" : track(o).step === 4 ? "delivered" : "shipped";
    return { id: "ord-" + o.orderId, source: "order", _order: o, title: (first.title || "eBay order") + (li.length > 1 ? ` + ${li.length - 1} more` : ""), photos: first.image ? [{ url: first.image }] : hit ? hit.photos.slice(0, 1) : [], price: o.total || 0, quantity: li.reduce((a, x) => a + (x.qty || 1), 0) || 1, phase: ph, when };
  }).sort((a, b) => String(b.when).localeCompare(String(a.when)));
}

/* Tracker: eBay only says "fulfilled", so progress is estimated from the ship date until a carrier feed is connected. Overrides let Sawyer move one by hand. */
const OV = "coalition-order-state-v1", HID = "coalition-hidden-v1";
const rd = (k) => { try { return JSON.parse(localStorage.getItem(k) || "{}") || {}; } catch { return {}; } };
export const setOv = (id, v) => { const o = rd(OV); if (v) o[id] = v; else delete o[id]; try { localStorage.setItem(OV, JSON.stringify(o)); } catch { /* ignore */ } };
export const hiddenIds = () => new Set(Object.keys(rd(HID)));
export const hideIds = (ids) => { const o = rd(HID); ids.forEach((i) => { o[String(i)] = 1; }); try { localStorage.setItem(HID, JSON.stringify(o)); } catch { /* ignore */ } };
export const unhideIds = (ids) => { const o = rd(HID); ids.forEach((i) => { delete o[String(i)]; }); try { localStorage.setItem(HID, JSON.stringify(o)); } catch { /* ignore */ } };
export const STEPS = ["Label made", "Shipped", "In transit", "Out for delivery", "Delivered"];
export function track(o) {
  const ov = rd(OV)[o.orderId];
  if (o.status === "label_created") return { step: 0, pct: 0, est: false, days: 0 };
  const days = Math.max(0, (Date.now() - Date.parse(o.shippedAt || o.createdAt || 0)) / 864e5);
  /* Delivered ONLY from a real eBay delivery scan (server sets deliveryKnown) or when Sawyer marks it by hand. */
  const scanned = o.status === "delivered" && o.deliveryKnown === true && o.deliveredAt;
  if ((scanned && ov !== "transit") || ov === "delivered") return { step: 4, pct: 100, est: false, days: Math.floor(days), real: Boolean(scanned), at: scanned ? o.deliveredAt : null, ov };
  const step = days < 1 ? 1 : 2;
  const late = o.estDeliveryAt && Date.now() > Date.parse(o.estDeliveryAt) + 2 * 864e5;
  const pct = Math.max(8, Math.min(85, Math.round(days / 5 * 85)));
  return { step, pct, est: true, days: Math.floor(days), estAt: o.estDeliveryAt || null, late, ov };
}
export function trackerHtml(o) {
  const t = track(o), from = "Menomonie, WI", to = o.shipTo || "Buyer";
  return `<div class="trk"><div class="trk-ends"><span>${esc(from)}</span><span>${esc(to)}</span></div><div class="trk-bar"><i style="width:${t.pct}%"></i><b style="left:${t.pct}%"></b></div>
  <ol class="trk-steps">${STEPS.map((s, i) => `<li class="${i < t.step ? "done" : i === t.step ? "now" : ""}">${s}</li>`).join("")}</ol>
  <p class="sub">${t.step === 0 ? "Label made, not shipped yet." : t.real ? `Delivered${t.at ? " " + new Date(t.at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}. Confirmed by eBay's carrier scan.` : t.step === 4 ? "You marked this delivered." : `${t.days === 0 ? "Shipped today" : `Shipped ${t.days} day${t.days === 1 ? "" : "s"} ago`}. No delivery scan from eBay yet.${t.estAt ? ` eBay expects it by ${new Date(t.estAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.` : ""}${t.late ? " It's past that date, so check tracking." : ""}`}</p>
  ${t.real ? "" : t.step === 4 ? `<button class="btn" data-ov="transit" type="button">Not delivered yet</button>` : t.step > 0 ? `<button class="btn" data-ov="delivered" type="button">Mark delivered</button>` : ""}</div>`;
}
