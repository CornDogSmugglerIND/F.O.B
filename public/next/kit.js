/* Interaction kit: one set of moves used on every tab.
   - hover/touch lift + tilt + glint on any .k-tilt
   - openCard(): half-zoom item card that flies out of the thing you tapped
   - fly(): shared-element move between two rects (the camera moves in Spaces)
   Nothing here knows about eBay or storage. Pages just add classes. */

import { setOf, numOf, cardName, rarityOf, gameOf } from "./cardmeta.js?v=185";
import { loadSpaces } from "./shared.js?v=185";
const reduce = () => false; // Reduce Motion is on for the owner, and the app animations are the point
const EASE = "cubic-bezier(.2,.8,.2,1)";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- hover / touch tilt (delegated, survives every re-render) ---------- */
let hot = null;
function cool(el) { if (!el) return; el.classList.remove("is-hot"); el.style.removeProperty("--rx"); el.style.removeProperty("--ry"); }
export function initKit() {
  if (initKit.done) return; initKit.done = true;
  const move = (e) => {
    const t = e.target.closest && e.target.closest(".k-tilt");
    if (hot && hot !== t) cool(hot);
    if (!t) { hot = null; return; }
    hot = t;
    const r = t.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    const amt = Number(t.dataset.tilt) || 1;
    t.style.setProperty("--rx", ((0.5 - py) * 14 * amt).toFixed(2) + "deg");
    t.style.setProperty("--ry", ((px - 0.5) * 16 * amt).toFixed(2) + "deg");
    t.style.setProperty("--mx", (px * 100).toFixed(1) + "%"); t.style.setProperty("--my", (py * 100).toFixed(1) + "%");
    t.classList.add("is-hot");
  };
  document.addEventListener("pointermove", move, { passive: true });
  document.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") move(e); }, { passive: true });
  const out = () => { cool(hot); hot = null; };
  document.addEventListener("pointerup", (e) => { if (e.pointerType === "touch") setTimeout(out, 160); }, { passive: true });
  document.addEventListener("pointerout", (e) => { if (hot && !hot.contains(e.relatedTarget)) out(); }, { passive: true });
  document.addEventListener("pointercancel", out, { passive: true });
}

/* ---------- shared-element move ---------- */
/** Animate `el` from the rect `from` to where it sits now. */
export function fly(el, from, { dur = 520, fade = true, delay = 0 } = {}) {
  if (!el || !from || reduce()) return Promise.resolve();
  const to = el.getBoundingClientRect(); if (!to.width || !to.height) return Promise.resolve();
  const dx = from.left + from.width / 2 - (to.left + to.width / 2), dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const sx = from.width / to.width, sy = from.height / to.height, s = Math.min(Math.max(Math.min(sx, sy), 0.05), 4);
  const a = el.animate([
    { transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: fade ? 0.2 : 1 },
    { transform: "translate(0,0) scale(1)", opacity: 1 },
  ], { duration: dur, delay, easing: EASE, fill: "backwards" });
  return a.finished.catch(() => {});
}
export const rectOf = (el) => (el ? el.getBoundingClientRect() : null);
export const sleep = (ms) => new Promise((r) => setTimeout(r, reduce() ? 0 : ms));

/* ---------- half-zoom card ---------- */
let zoomEl = null;
export function closeCard(instant) {
  if (!zoomEl) return; const z = zoomEl; zoomEl = null; document.removeEventListener("keydown", z._key);
  if (instant || reduce()) { z.remove(); return; }
  z.classList.add("out"); setTimeout(() => z.remove(), 220);
}
/** items: array of item objects. opts: {index, from:Element|Rect, info:(it)=>html, wire:(root,it,api)=>void, photo:(it)=>src, name:(it)=>str, price:(it)=>str} */

/* ---------- the item page: chips + tabs (Pricing / Financials / Channels / Activity) ---------- */
const $m = (n) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso) => { const t = Date.parse(iso || ""); return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""; };
export function itemTabs(it, pricingHtml) {
  const o = it._order || null, eb = (it.channels && it.channels.ebay) || {}, q = Number(it.quantity) || 1;
  const price = Number(o ? o.total ?? it.price : it.price) || 0, paid = it.purchasePrice != null && it.purchasePrice !== "" ? Number(it.purchasePrice) : null;
  const fee = price ? Math.round((price * 0.1325 + 0.3) * 100) / 100 : 0, ship = price ? 0.78 : 0, net = Math.max(0, Math.round((price - fee - ship) * 100) / 100);
  const where = o ? (it.phase === "sold" ? "Sold, needs shipping" : it.phase === "delivered" ? "Delivered" : "Shipped") : String(it.id).startsWith("mp-") ? "On Double Holo" : it.phase === "listed" ? "Live on eBay" : it.phase === "staged" ? (it.draft ? "Draft saved" : "Ready to list") : it.phase === "intake" ? "Intake" : "";
  const chips = [where, it.setName, it.collectorNumber, it.finish, it.condition, q > 1 ? `${q} in stock` : ""].filter(Boolean).map((c, k) => `<i class="ip-chip${k === 0 ? " st" : ""}">${esc(c)}</i>`).join("");
  const row = (k, v, cls = "") => v === "" || v == null ? "" : `<div class="ip-row ${cls}"><span>${esc(k)}</span><b>${v}</b></div>`;
  const fin = `${row(o ? "Sold for" : "List price", $m(price))}${row("You paid", paid != null ? $m(paid) : "Not entered")}${row("eBay fees (est. 13.25% + $0.30)", price ? "−" + $m(fee) : "")}${row("Shipping (Standard Envelope)", price ? "−" + $m(ship) : "")}${row("You keep", price ? $m(net) : "", "tot")}${paid != null && price ? row("Profit", `${net - paid >= 0 ? "+" : "−"}${$m(Math.abs(net - paid))}`, net - paid >= 0 ? "pos" : "neg") : ""}`;
  const lid = eb.listingId && !/^demo/.test(String(eb.listingId)) ? String(eb.listingId) : "";
  const chan = `${row("eBay", lid ? (it.phase === "listed" || o ? "Live" : "Ended") : eb.offerId ? "Draft" : "Not listed")}${lid ? `<a class="btn" href="https://www.ebay.com/itm/${esc(lid)}" target="_blank" rel="noopener">Open on eBay</a>` : ""}${row("Double Holo", String(it.id).startsWith("mp-") ? "Listed" : "Not listed")}${row("SKU", it.sku || eb.sku ? esc(it.sku || eb.sku) : "")}${o && o.orderId ? row("eBay order", esc(o.orderId)) : ""}${o && o.buyer ? row("Buyer", esc(o.buyer)) : ""}`;
  const ev = [[o ? o.createdAt : "", "Sold"], [o ? o.shippedAt : "", "Shipped"], [o ? o.deliveredAt : "", "Delivered"], [eb.listedAt || (it.phase === "listed" ? it.updatedAt : ""), "Listed on eBay"], [it.createdAt, "Added to the app"]].filter(([d]) => day(d));
  const act = ev.length ? `<ol class="ip-time">${ev.sort((a, b) => Date.parse(b[0]) - Date.parse(a[0])).map(([d, t]) => `<li><b>${esc(t)}</b><span>${esc(day(d))}</span></li>`).join("")}</ol>` : `<p class="sub">No history yet.</p>`;
  return `${chips ? `<div class="ip-chips">${chips}</div>` : ""}<div class="ip-tabs" role="tablist"><button type="button" role="tab" class="on" data-ipt="p">Pricing</button><button type="button" role="tab" data-ipt="f">Financials</button><button type="button" role="tab" data-ipt="c">Channels</button><button type="button" role="tab" data-ipt="a">Activity</button></div>
    <div class="ip-pane on" data-ipp="p">${pricingHtml || ""}</div><div class="ip-pane" data-ipp="f">${fin}<small class="ip-note">Fees and shipping are estimates.</small></div><div class="ip-pane" data-ipp="c">${chan}</div><div class="ip-pane" data-ipp="a">${act}</div>`;
}
export function wireTabs(root) {
  root.querySelectorAll("[data-ipt]").forEach((b) => b.addEventListener("click", () => {
    root.querySelectorAll("[data-ipt]").forEach((x) => x.classList.toggle("on", x === b));
    root.querySelectorAll("[data-ipp]").forEach((x) => x.classList.toggle("on", x.dataset.ipp === b.dataset.ipt));
  }));
}
/* Same item viewer as Command: an iOS sheet with ‹ Back, "n of N", ‹ › arrows and swipe. */
function openCardSheet(items, opts, f) {
  let i = Math.max(0, Math.min(items.length - 1, opts.index || 0));
  const photo = opts.photo || ((it) => (it.photos && it.photos[0] && (it.photos[0].dataUrl || it.photos[0].url)) || "");
  const name = opts.name || ((it) => it.title || it.productName || "Untitled");
  let s = null;
  const go = (k) => { if (k < 0 || k >= items.length || k === i) return; i = k; paint(); };
  const key = (e) => { if (!s || !s.isConnected) { document.removeEventListener("keydown", key); return; } if (e.key === "ArrowRight") go(i + 1); else if (e.key === "ArrowLeft") go(i - 1); };
  const paint = () => {
    const it = items[i], p = photo(it), n = items.length;
    s = f.openSheet(`<div class="iv-bar"><button type="button" class="iv-back" data-close>‹ ${esc(opts.backLabel || "Back")}</button>${n > 1 ? `<span class="iv-n">${i + 1} of ${n}</span><button type="button" class="iv-btn" data-prev aria-label="Previous"${i === 0 ? " disabled" : ""}>‹</button><button type="button" class="iv-btn" data-next aria-label="Next"${i === n - 1 ? " disabled" : ""}>›</button>` : ""}</div>
      ${lockFrame(it, p)}<div class="k-zinfo it-info"><h2>${esc(name(it))}</h2>${itemTabs(it, opts.info ? opts.info(it) : "")}</div>`);
    wireTabs(s);
    s.querySelector("[data-prev]")?.addEventListener("click", () => go(i - 1));
    s.querySelector("[data-next]")?.addEventListener("click", () => go(i + 1));
    let sx = null, sy = 0;
    s.addEventListener("touchstart", (e) => { if (e.touches.length !== 1 || e.target.closest(".ph-row,input,textarea,select,.bl-vars,.vx-list")) { sx = null; return; } sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    s.addEventListener("touchend", (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null; if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) go(dx < 0 ? i + 1 : i - 1); }, { passive: true });
    opts.wire && opts.wire(s, it, { close: () => f.closeSheet(), next: () => { if (i < n - 1) go(i + 1); else f.closeSheet(); } });
  };
  document.addEventListener("keydown", key);
  paint();
  return s;
}
export function openCard(items, opts = {}) {
  return openItem(items, opts);
  const f = window.__fob; if (f && window.customElements && customElements.get("ion-modal")) { closeCard(true); return openCardSheet(items, opts, f); }
  closeCard(true);
  let i = Math.max(0, Math.min(items.length - 1, opts.index || 0));
  const photo = opts.photo || ((it) => (it.photos && it.photos[0] && (it.photos[0].dataUrl || it.photos[0].url)) || "");
  const name = opts.name || ((it) => it.title || it.productName || "Untitled");
  const z = document.createElement("div"); z.className = "k-zoom"; z.setAttribute("role", "dialog"); z.setAttribute("aria-modal", "true"); document.body.appendChild(z); zoomEl = z;
  const from = opts.from && opts.from.getBoundingClientRect ? opts.from.getBoundingClientRect() : opts.from || null;
  const paint = (first) => {
    const it = items[i];
    z.innerHTML = `<div class="k-zback" data-x></div>
      <div class="k-zcard">
        <button class="k-zx" data-x aria-label="Close">×</button>
        <div class="k-zart"><div class="k-big k-tilt" data-tilt="1.4">${photo(it) ? `<img src="${esc(photo(it))}" alt="" draggable="false">` : `<div class="k-ini">${esc(name(it).charAt(0).toUpperCase())}</div>`}<i class="k-br tl"></i><i class="k-br tr"></i><i class="k-br bl"></i><i class="k-br br"></i></div></div>
        <div class="k-zinfo"><h2>${esc(name(it))}</h2>${opts.info ? opts.info(it) : ""}</div>
        ${items.length > 1 ? `<div class="k-znav"><button data-prev aria-label="Previous">‹</button><span>${i + 1} / ${items.length}</span><button data-next aria-label="Next">›</button></div>` : ""}
      </div>`;
    z.querySelectorAll("[data-x]").forEach((b) => b.addEventListener("click", () => { closeCard(); opts.onClose && opts.onClose(); }));
    z.querySelector("[data-prev]")?.addEventListener("click", () => { i = (i - 1 + items.length) % items.length; paint(false); });
    z.querySelector("[data-next]")?.addEventListener("click", () => { i = (i + 1) % items.length; paint(false); });
    opts.wire && opts.wire(z, items[i], { close: () => closeCard(), next: () => z.querySelector("[data-next]")?.click() });
    if (first && from) fly(z.querySelector(".k-big"), from, { dur: 480 }); else if (!first) z.querySelector(".k-big").animate([{ opacity: 0.2, transform: "translateX(18px)" }, { opacity: 1, transform: "none" }], { duration: 240, easing: EASE });
  };
  z._key = (e) => { if (e.key === "Escape") { closeCard(); opts.onClose && opts.onClose(); } else if (e.key === "ArrowRight") z.querySelector("[data-next]")?.click(); else if (e.key === "ArrowLeft") z.querySelector("[data-prev]")?.click(); };
  document.addEventListener("keydown", z._key);
  // swipe on phones
  let sx = null; z.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
  z.addEventListener("touchend", (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 60) z.querySelector(dx < 0 ? "[data-next]" : "[data-prev]")?.click(); }, { passive: true });
  paint(true);
  return z;
}

/* Target lock (Ghost Recon Future Soldier): the card in a reticle, its real numbers floating beside it on leader lines. */
export function lockFrame(it, src, { id = "" } = {}) {
  const o = it._order || null, price = Number(o ? o.total ?? it.price : it.price) || 0;
  const paid = it.purchasePrice != null && it.purchasePrice !== "" ? Number(it.purchasePrice) : null;
  const net = price ? Math.max(0, price - (price * 0.1325 + 0.3) - 0.78) : 0, prof = paid != null && price ? net - paid : null;
  const where = o ? (it.phase === "sold" ? "To ship" : it.phase === "delivered" ? "Delivered" : "Shipped") : it.phase === "listed" ? "Live" : it.phase === "staged" ? "Ready" : it.phase === "stored" ? "In a bin" : "Intake";
  const R = (k, v, cls = "") => v === "" || v == null ? "" : `<div class="lk-r ${cls}"><em>${esc(k)}</em><b>${v}</b></div>`;
  const L = `${R(o ? "Sold for" : "Market", $m(price), "money")}${R("Paid", paid != null ? $m(paid) : "—")}${prof != null ? R("Profit", (prof >= 0 ? "+" : "−") + $m(Math.abs(prof)), prof >= 0 ? "up" : "down") : R("You keep", $m(net))}`;
  const Rt = `${R("Status", esc(where), o ? "hot" : "")}${R("Set", esc(it.setName || ""))}${R("No.", esc(it.collectorNumber || ""))}${R("Cond", esc(it.condition || ""))}`;
  return `<div class="lk${o ? " hot" : ""}">
    <svg class="lk-ring" viewBox="0 0 300 300" aria-hidden="true"><path class="a1" d="M38 196 A118 118 0 0 1 150 32"/><path class="a2" d="M262 104 A118 118 0 0 1 150 268"/>
      <path class="hatch" d="M52 108 A106 106 0 0 1 96 58"/><circle class="seg" cx="150" cy="150" r="134"/>
      <g class="lens"><circle cx="246" cy="228" r="13"/><circle cx="246" cy="228" r="4"/><path d="M246 210 V218 M246 238 V246 M228 228 H236 M256 228 H264"/></g>
      <path class="rule" d="M20 92 V208"/><path class="rule" d="M280 92 V208"/></svg>
    <div class="lk-side l">${L}</div>
    <div class="lk-core">${src ? `<img${id ? ` id="${id}"` : ""} src="${esc(src)}" alt="" draggable="false">` : `<span class="lk-none">No photo</span>`}<i class="lk-c tl"></i><i class="lk-c tr"></i><i class="lk-c bl"></i><i class="lk-c br"></i></div>
    <div class="lk-side r">${Rt}</div></div>`;
}

/* Hologram deck: a 3D carousel with the centered item target-locked; readouts(it) -> {l, r} HTML. */
export function holoDeck(list, { readouts, ring = true } = {}) {
  const flow = list.slice(0, 16), ld = flow[0] ? readouts(flow[0]) : { l: "", r: "" };
  const nm = (it) => it.title || it.productName || "Untitled", ph = (it) => (it.photos && it.photos[0] && (it.photos[0].dataUrl || it.photos[0].url)) || "";
  if (!flow.length) return "";
  return `<div class="cd-stage">
    ${ring ? `<svg class="cd-ring" viewBox="0 0 300 300" aria-hidden="true"><path class="a1" d="M38 196 A118 118 0 0 1 150 32"/><path class="a2" d="M262 104 A118 118 0 0 1 150 268"/><path class="hatch" d="M52 108 A106 106 0 0 1 96 58"/><circle class="seg" cx="150" cy="150" r="134"/><path class="rule" d="M20 92 V208"/><path class="rule" d="M280 92 V208"/></svg>` : ""}
    <div class="cd-side l lk-side" data-cdl>${ld.l}</div><div class="cd-side r lk-side" data-cdr>${ld.r}</div>
    <div class="cd-flow hscroll" data-cdflow>${flow.map((it, i) => { const s = ph(it); return `<button type="button" class="cd-c" data-cd="${i}" data-id="${esc(it.id)}" aria-label="${esc(nm(it))}">${s ? `<img src="${esc(s)}" alt="" loading="lazy" draggable="false">` : `<span>${esc(nm(it).charAt(0))}</span>`}</button>`; }).join("")}</div>
    <div class="cd-name" data-cdname>${esc(nm(flow[0]))}</div>
    <div class="cd-nav"><button type="button" class="cd-arr" data-cdprev aria-label="Previous">‹</button><span data-cdn>1 / ${flow.length}</span><button type="button" class="cd-arr" data-cdnext aria-label="Next">›</button></div></div>`;
}
export function wireHoloDeck(root, list, { readouts, onOpen }) {
  const fl = root.querySelector("[data-cdflow]"); if (!fl) return;
  const flow = list.slice(0, 16), cards = [...fl.querySelectorAll(".cd-c")], nm = (it) => it.title || it.productName || "Untitled"; let cur = 0, raf = 0;
  const center = () => { const r = fl.getBoundingClientRect(), mid = r.left + r.width / 2; let best = 0, bd = 1e9;
    cards.forEach((c, i) => { const b = c.getBoundingClientRect(), d = (b.left + b.width / 2 - mid) / (b.width || 1), a = Math.min(2, Math.abs(d)); c.style.setProperty("--d", Math.max(-2, Math.min(2, d)).toFixed(3)); c.style.setProperty("--a", a.toFixed(3)); c.classList.toggle("on", a < .5); if (a < bd) { bd = a; best = i; } });
    if (best !== cur) { cur = best; const ld = readouts(flow[cur]); root.querySelector("[data-cdl]").innerHTML = ld.l; root.querySelector("[data-cdr]").innerHTML = ld.r; root.querySelector("[data-cdname]").textContent = nm(flow[cur]); root.querySelector("[data-cdn]").textContent = `${cur + 1} / ${flow.length}`; } };
  fl.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(center); }, { passive: true });
  const goTo = (i) => { const c = cards[Math.max(0, Math.min(cards.length - 1, i))]; if (c) fl.scrollTo({ left: c.offsetLeft - (fl.clientWidth - c.offsetWidth) / 2, behavior: "smooth" }); };
  cards.forEach((c, i) => c.addEventListener("click", () => { if (i !== cur) return goTo(i); onOpen(flow[i], c); }));
  root.querySelector("[data-cdprev]").addEventListener("click", () => goTo(cur - 1)); root.querySelector("[data-cdnext]").addEventListener("click", () => goTo(cur + 1));
  (window.requestIdleCallback || ((f) => setTimeout(f, 60)))(center);
}

/* Hologram wall: columns of cards on a curve; the card in the middle column lights up. info(it) -> html line under the wall. */
export function holoWall(list, { info, rows } = {}) {
  if (!list.length) return "";
  const R = rows || 2, nm = (it) => it.title || it.productName || "Untitled", ph = (it) => (it.photos && it.photos[0] && (it.photos[0].dataUrl || it.photos[0].url)) || "";
  const money = (n) => "$" + (Number(n) || 0).toFixed(2);
  let cols = "";
  for (let c = 0; c * R < list.length; c++) {
    cols += `<div class="hwl-col">${list.slice(c * R, c * R + R).map((it, r) => { const s = ph(it), i = c * R + r; return `<button type="button" class="hwl-c" data-hw="${i}" data-id="${esc(it.id)}" aria-label="${esc(nm(it))}">${s ? `<img src="${esc(s)}" alt="" loading="lazy" draggable="false">` : `<span>${esc(nm(it).charAt(0))}</span>`}<em>${it._order ? money(it._order.total ?? it.price) : money(it.price)}</em></button>`; }).join("")}</div>`;
  }
  return `<div class="hwl" data-rows="${R}"><div class="hwl-scroll hscroll" data-hwscroll>${cols}</div>
    <div class="hwl-focus"><b data-hwname>${esc(nm(list[0]))}</b><span data-hwinfo>${info ? info(list[0]) : ""}</span></div></div>`;
}
export function wireHoloWall(root, list, { info, onOpen }) {
  const sc = root.querySelector("[data-hwscroll]"); if (!sc) return;
  const cols = [...sc.querySelectorAll(".hwl-col")], cards = [...sc.querySelectorAll(".hwl-c")], nm = (it) => it.title || it.productName || "Untitled";
  let cur = -1, raf = 0;
  const focusCard = (i) => { if (i === cur || !list[i] || !sc.isConnected) return; const nmEl = root.querySelector("[data-hwname]"), inEl = root.querySelector("[data-hwinfo]"); if (!nmEl || !inEl) return; cur = i; cards.forEach((c) => c.classList.toggle("on", Number(c.dataset.hw) === i)); nmEl.textContent = nm(list[i]); inEl.innerHTML = info ? info(list[i]) : ""; };
  let midCol = 0;
  const lay = () => { if (!sc.isConnected) return; const r = sc.getBoundingClientRect(), mid = r.left + r.width / 2; let best = 0, bd = 1e9;
    cols.forEach((c, k) => { const b = c.getBoundingClientRect(); if (b.right < r.left - 400 || b.left > r.right + 400) return; const d = (b.left + b.width / 2 - mid) / (b.width || 1), a = Math.min(3, Math.abs(d)); c.style.setProperty("--d", Math.max(-3, Math.min(3, d)).toFixed(3)); c.style.setProperty("--a", a.toFixed(3)); if (a < bd) { bd = a; best = k; } });
    if (best !== midCol || cur < 0) { const row = cur >= 0 ? cur % cols[0].children.length : 0; midCol = best; const el = cols[best].children[Math.min(row, cols[best].children.length - 1)]; if (el) focusCard(Number(el.dataset.hw)); } };
  sc.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(lay); }, { passive: true });
  const toCol = (k) => { const c = cols[k]; if (c) sc.scrollTo({ left: c.offsetLeft - (sc.clientWidth - c.offsetWidth) / 2, behavior: "smooth" }); };
  cards.forEach((c) => c.addEventListener("click", () => { const i = Number(c.dataset.hw), k = cols.indexOf(c.parentElement); if (k !== midCol) { toCol(k); focusCard(i); return; } if (i !== cur) { focusCard(i); return; } onOpen(list[i], c); }));
  /* mouse: drag to spin */
  let dn = null; sc.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") return; dn = { x: e.clientX, l: sc.scrollLeft, moved: false }; });
  sc.addEventListener("pointermove", (e) => { if (!dn) return; const dx = e.clientX - dn.x; if (Math.abs(dx) > 4) { if (!dn.moved) { try { sc.setPointerCapture(e.pointerId); } catch { /* ignore */ } } dn.moved = true; } if (dn.moved) sc.scrollLeft = dn.l - dx; });
  sc.addEventListener("pointerup", () => { if (dn && dn.moved) { const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); }; sc.addEventListener("click", stop, { capture: true, once: true }); setTimeout(() => sc.removeEventListener("click", stop, true), 50); } dn = null; });
  if (matchMedia("(min-width:821px)").matches && cols.length > 4) { const c = cols[Math.min(4, cols.length - 1)]; sc.scrollLeft = c.offsetLeft - (sc.clientWidth - c.offsetWidth) / 2; }
  (window.requestIdleCallback || ((f) => setTimeout(f, 60)))(lay);
}

/* ===== shared pieces for Channels + Collection (Oct 25 rebuild) ===== */
const $$m = (n) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/* segmented ring gauge, same language as the Command mission gauges */
export function ringGauge(value, frac, label, hot) {
  const f = Math.max(0, Math.min(1, frac || 0)), C = 2 * Math.PI * 42, on = (C * f).toFixed(1);
  return `<div class="rg${hot ? " hot" : ""}" aria-hidden="true"><svg viewBox="0 0 100 100"><circle class="rg-t" cx="50" cy="50" r="47"/><circle class="rg-b" cx="50" cy="50" r="42"/><circle class="rg-f" cx="50" cy="50" r="42" stroke-dasharray="${on} ${C.toFixed(1)}"/></svg><b>${esc(String(value))}</b><small>${esc(label)}</small></div>`;
}
/* tiny bar sparkline from numbers (e.g. sales per week) */
export function sparkBars(vals, label) {
  const mx = Math.max(1, ...vals);
  return `<div class="spk" aria-label="${esc(label)}"><div class="spk-b">${vals.map((v, i) => `<i style="height:${Math.max(6, v / mx * 100).toFixed(0)}%"${i === vals.length - 1 ? ' class="now"' : ""}></i>`).join("")}</div><small>${esc(label)}</small></div>`;
}
/* one row of cards you swipe through, with a header that says what it is */
export function shelf(title, meta, cards, key) {
  return `<section class="sv" data-shelf="${esc(key || title)}"><header class="sv-h"><b>${esc(title)}</b><span>${meta}</span></header><div class="sv-row hscroll">${cards}</div></section>`;
}
export function svCard(it, { price, chip, chipHot, sub, photo } = {}) {
  const nm = it.title || it.productName || "Untitled", ph = photo || (it.photos && it.photos[0] && (it.photos[0].dataUrl || it.photos[0].url)) || "";
  return `<button type="button" class="sv-c" data-id="${esc(it.id)}" aria-label="${esc(nm)}"><span class="sv-art">${ph ? `<img src="${esc(ph)}" alt="" loading="lazy" draggable="false">` : `<i>${esc(nm.charAt(0))}</i>`}<em class="sv-p">${price != null ? price : $$m(it.price)}</em>${chip ? `<em class="sv-chip${chipHot ? " hot" : ""}">${esc(chip)}</em>` : ""}<span class="sv-k tl"></span><span class="sv-k br"></span></span><span class="sv-n">${esc(nm)}</span>${sub ? `<span class="sv-s">${sub}</span>` : ""}</button>`;
}

/* ===== Item screen (Build 175): the photo opens big and zoomable, the numbers are readable, the next step is one button.
   Same frame as the Collection card focus. Callers' info(it) HTML renders below, restyled. ===== */
const STEP = { intake: ["Intake", "Identify it in Scouter"], staged: ["Ready to list", "Build the eBay listing"], listed: ["Live on eBay", ""], stored: ["In a bin", ""], sold: ["Sold", "Pack and ship it"], shipped: ["Shipped", ""], delivered: ["Delivered", ""] };
let itemEl = null;
function closeItem() { if (!itemEl) return; const v = itemEl; itemEl = null; document.removeEventListener("keydown", v._key, true); v.classList.remove("on"); setTimeout(() => v.remove(), 180); }
function openItem(items, opts) {
  closeItem(); closeCard(true);
  let i = Math.max(0, Math.min(items.length - 1, opts.index || 0)), ph = 0;
  const v = document.createElement("div"); v.className = "fc it"; v.setAttribute("role", "dialog"); v.setAttribute("aria-modal", "true"); document.body.appendChild(v); itemEl = v;
  const bigU = (u) => /ebayimg\.com/.test(u) ? u.replace(/s-l\d+(\.\w+)/, "s-l1600$1").replace(/\$_\d+\.(jpe?g|png|webp)/i, "$_57.$1") : u;
  const photosOf = (it) => { const l = (it.photos || []).map((p) => p.url || p.dataUrl).filter(Boolean); const first = opts.photo ? opts.photo(it) : ""; return [...new Set([first, ...l].filter(Boolean))].map(bigU); };
  const api = { close: () => { closeItem(); opts.onClose && opts.onClose(); }, next: () => { if (i < items.length - 1) { i++; ph = 0; paint(); } else closeItem(); } };
  const paint = () => {
    const it = items[i], o = it._order || null, photos = photosOf(it), src = photos[ph] || "";
    const price = Number(o ? o.total ?? it.price : it.price) || 0, paid = it.purchasePrice != null && it.purchasePrice !== "" && it.purchasePrice !== "None" ? Number(it.purchasePrice) : null;
    const keep = price ? Math.max(0, price - (price * 0.1325 + 0.3)) : 0, prof = paid != null && price ? keep - paid : null;
    const phase = o ? it.phase : (it.phase || "intake"), st = STEP[phase] || [phase, ""], bin = loadSpaces().find((x) => x.id === it.spaceId)?.name || "";
    const nm = opts.name ? cardName({ ...it, title: opts.name(it) }) : cardName(it);
    const nextBtn = phase === "staged" ? `<button type="button" class="go" data-do="build">Build the eBay listing</button>` : phase === "listed" && (it.channels?.ebay?.sku || it.sku) ? `<button type="button" class="go" data-do="edit">Edit the live listing</button>` : phase === "intake" ? `<button type="button" class="go" data-do="scouter">Identify in Scouter</button>` : "";
    v.innerHTML = `<div class="fc-bg" data-x></div>
      <div class="fc-box">
        <div class="fc-stage it-stage"><div class="it-lock"><svg class="it-arcs" viewBox="0 0 400 400" aria-hidden="true"><circle class="a0" cx="200" cy="200" r="188"/><path class="a1" d="M60 300 A170 170 0 0 1 200 30"/><path class="a2" d="M340 100 A170 170 0 0 1 200 370"/><path class="a3" d="M70 140 A150 150 0 0 1 120 75"/></svg><i class="it-br tl"></i><i class="it-br tr"></i><i class="it-br bl"></i><i class="it-br br"></i>
            <div class="fc-zoom it-card">${src ? `<img src="${esc(src)}" alt="" draggable="false"><span class="it-glare" aria-hidden="true"></span>` : `<i class="fc-none">No photo yet</i>`}</div></div>
          ${photos.length > 1 ? `<div class="fc-thumbs">${photos.map((p, j) => `<button type="button" class="${j === ph ? "on" : ""}" data-ph="${j}" aria-label="Photo ${j + 1}"><img src="${esc(p)}" alt=""></button>`).join("")}</div>` : ""}
          ${src ? `<span class="fc-hint">Click the card to zoom · move to tilt</span>` : ""}</div>
        <aside class="fc-info">
          <div class="fc-nav"><span>${esc(opts.backLabel || "")}${items.length > 1 ? ` · ${i + 1} of ${items.length}` : ""}</span>${items.length > 1 ? `<button type="button" data-go="-1" aria-label="Previous">‹</button><button type="button" data-go="1" aria-label="Next">›</button>` : ""}<button type="button" class="fc-x" data-x aria-label="Close">✕</button></div>
          <div class="fc-stat-line"><span class="fc-phase p-${esc(phase)}">${esc(st[0])}</span>${st[1] ? `<span class="fc-next">Next: ${esc(st[1])}</span>` : ""}</div>
          <h2>${esc(nm)}</h2>
          <div class="it-price"><b>${$m(price)}</b><span>${o ? "sold for" : "price"}${paid != null ? ` · <i class="${prof >= 0 ? "up" : "down"}">${prof >= 0 ? "+" : "−"}${$m(Math.abs(prof))} profit</i>` : ""}</span></div>
          ${nextBtn ? `<div class="fc-acts">${nextBtn}</div>` : ""}
          <div class="it-tabs" role="tablist"><button type="button" role="tab" class="on" aria-selected="true" data-tab="ov">Overview</button><button type="button" role="tab" aria-selected="false" data-tab="more">Details &amp; actions</button></div>
          <div class="it-pane" data-pane="ov">
            <div class="fc-facts">${[["Game", gameOf(it)], ["Set", setOf(it)], ["Number", numOf(it)], ["Rarity", rarityOf(it)], ["Condition", it.condition && it.condition !== "None" ? String(it.condition) : ""]].filter(([, x]) => x).map(([l, x]) => `<span><em>${esc(l)}</em>${esc(x)}</span>`).join("")}</div>
            <div class="fc-stats"><div><em>You keep after eBay fees</em><b>${$m(keep)}</b></div><div class="${prof == null ? "" : prof >= 0 ? "up" : "down"}"><em>${paid != null ? "Profit" : "You paid"}</em><b>${paid != null ? `${prof >= 0 ? "+" : "−"}${$m(Math.abs(prof))}` : "Not entered"}</b></div><div><em>Quantity</em><b>${Number(it.quantity) || 1}</b></div><div class="${bin ? "" : "warn"}"><em>Bin</em><b>${esc(bin || "Not put away")}</b></div></div>
          </div>
          <div class="it-pane k-zinfo" data-pane="more" hidden><div class="fc-old">${opts.info ? opts.info(it) : ""}</div><p class="fc-listing">Listing title: ${esc(opts.name ? opts.name(it) : it.title || "")}</p></div>
        </aside></div>`;
    const z = v.querySelector(".fc-zoom"), img = z.querySelector("img");
    if (img) { const move = (e) => { if (!z.classList.contains("zoomed")) return; const r = z.getBoundingClientRect(); img.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`; };
      z.addEventListener("click", (e) => { if (z.classList.toggle("zoomed")) move(e); else img.style.transformOrigin = "50% 50%"; }); z.addEventListener("pointermove", move); }
    v.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { v.querySelectorAll("[data-tab]").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-selected", String(x === b)); }); v.querySelectorAll("[data-pane]").forEach((pn) => { pn.hidden = pn.dataset.pane !== b.dataset.tab; }); }));
    { const lock = v.querySelector(".it-lock"), card = v.querySelector(".it-card"); if (lock && card) { lock.addEventListener("pointermove", (e) => { if (e.pointerType !== "mouse" || card.classList.contains("zoomed")) return; const r = lock.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height; card.style.setProperty("--rx", `${(0.5 - y) * 14}deg`); card.style.setProperty("--ry", `${(x - 0.5) * 16}deg`); card.style.setProperty("--gx", `${x * 100}%`); card.style.setProperty("--gy", `${y * 100}%`); }); lock.addEventListener("pointerleave", () => { card.style.removeProperty("--rx"); card.style.removeProperty("--ry"); }); } }
    v.querySelectorAll("[data-x]").forEach((b) => b.addEventListener("click", api.close));
    v.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => { i = (i + Number(b.dataset.go) + items.length) % items.length; ph = 0; paint(); }));
    v.querySelectorAll("[data-ph]").forEach((b) => b.addEventListener("click", () => { ph = Number(b.dataset.ph); paint(); }));
    v.querySelector('[data-do="build"]')?.addEventListener("click", () => { closeItem(); setTimeout(() => dispatchEvent(new CustomEvent("fob:build", { detail: it.id })), 200); });
    v.querySelector('[data-do="edit"]')?.addEventListener("click", () => { closeItem(); setTimeout(() => dispatchEvent(new CustomEvent("fob:edit-live", { detail: it.id })), 200); });
    v.querySelector('[data-do="scouter"]')?.addEventListener("click", () => { closeItem(); location.hash = "scouter"; dispatchEvent(new CustomEvent("fob:go", { detail: "scouter" })); });
    /* callers' old buttons: tidy labels that duplicate the new header */
    v.querySelectorAll(".fc-old .sub").forEach((x) => x.remove());
    opts.wire && opts.wire(v, it, api);
  };
  v._key = (e) => { if (e.key === "Escape") { e.stopPropagation(); api.close(); } else if (e.key === "ArrowRight" && items.length > 1) { i = (i + 1) % items.length; ph = 0; paint(); } else if (e.key === "ArrowLeft" && items.length > 1) { i = (i - 1 + items.length) % items.length; ph = 0; paint(); } };
  document.addEventListener("keydown", v._key, true);
  paint(); requestAnimationFrame(() => v.classList.add("on"));
  return v;
}
