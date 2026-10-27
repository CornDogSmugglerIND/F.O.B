import "./viewer.js?v=4";
import { isArchived, archive, unarchive, archMap, loadSpaces, assign } from "./shared.js?v=7";
import { orderItems, saveOrders, trackUrl, dayText, trackerHtml, setOv, hiddenIds, hideIds, unhideIds } from "./orders.js?v=9";
import { phaseFromItem } from "/visor/phases.js?v=3";
import { renderScouter } from "./scouter.js?v=33";
import { renderCollection, openImport } from "./collection.js?v=37";
import { photoManager } from "./photos.js?v=5";
import { renderSpaces, openPutAway, unbinnedCount } from "./spaces.js?v=24";
import { renderChannels, buildListing, variationListing, editListing } from "./channels.js?v=53";
import { renderSettings } from "./settings.js?v=11";
import { initSync } from "./sync.js?v=4";
import { initKit, itemTabs, wireTabs, lockFrame } from "./kit.js?v=9";

const LS_ITEMS = "coalition-items-v4";
const LS_AVATAR = "cdsc-avatar";
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nameOf = (it) => { const t = it.title || it.productName || ""; return !t ? "Untitled" : /^sku-\d+$/i.test(t.trim()) ? `Draft listing …${t.trim().slice(-4)}` : t; };
const photoOf = (it) => (it.photos && it.photos[0] && (it.photos[0].dataUrl || it.photos[0].url)) || "";
const worth = (it) => it._order ? (Number(it.price) || 0) : (Number(it.price) || 0) * (Number(it.quantity) || 1);

/* ---------- data ---------- */
function loadItems() { try { const v = JSON.parse(localStorage.getItem(LS_ITEMS) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
/* never write an older copy over a newer one: if another screen changed an item since we loaded it, its newer version wins */
function mergeNewer(list) { try { const cur = JSON.parse(localStorage.getItem(LS_ITEMS) || "[]"); if (!Array.isArray(cur)) return list; const cm = new Map(cur.map((i) => [String(i.id), i]));
  for (const i of list) { const c = cm.get(String(i.id)); if (c && c.spaceId !== i.spaceId && Date.parse(c.updatedAt || 0) > Date.parse(i.updatedAt || 0)) i.spaceId = c.spaceId; } return list; } catch { return list; } }
function saveItems(items) { try { localStorage.setItem(LS_ITEMS, JSON.stringify(mergeNewer(items))); return true; } catch { toast("Couldn't save. Phone storage is full."); return false; } }
const saveItems2 = (l) => { try { localStorage.setItem(LS_ITEMS, JSON.stringify(l)); return true; } catch { return false; } };
const isDemo = (i) => i.demo || /^demo/.test(String(i.channels?.ebay?.listingId || "")) || (i.photos || []).some((p) => String(p.dataUrl || "").startsWith("/demo/"));
function purgeDemo() { const l = loadItems(), k = l.filter((i) => !isDemo(i)), dup = dedupeListings(k); if (dup || k.length !== l.length) saveItems2(k); }
purgeDemo();
let items = loadItems(); let lastRaw = null; document.body.dataset.view = "command";

const STOPS = [
  { id: "intake", label: "Intake", note: "not identified yet", phases: ["intake"], c: "#B3FBD5", pos: [6, 80], movable: true },
  { id: "staged", label: "Ready to list", note: "listing not built yet", phases: ["staged"], c: "#B3FBD5", pos: [23, 54], movable: true },
  { id: "stored", label: "Put away", note: "listed, needs its bin", phases: ["listed"], c: "#90FFEE", pos: [40, 80], movable: false },
  { id: "sold", label: "Sold", note: "needs shipping", phases: ["sold", "packed"], c: "#E8924A", pos: [57, 54], movable: true },
  { id: "shipped", label: "Shipped", note: "on the way, tap to track", phases: ["shipped"], c: "#E8924A", pos: [74, 80], movable: true },
  { id: "delivered", label: "Delivered", note: "at the door", phases: ["delivered"], c: "#E8924A", pos: [91, 54], movable: true },
];
/* a fresh map: things you bring in through the app until they're listed and in a bin, then your eBay orders. Old eBay listings live in Channels. */
const stopFor = (it) => { const ph = phaseFromItem(it); if (ph === "listed") return it.spaceId ? null : STOPS.find((x) => x.id === "stored"); return STOPS.find((x) => x.phases.includes(ph)); };
const MOVE_TO = { intake: "intake", staged: "staged", sold: "sold", shipped: "shipped", delivered: "delivered" };

/* The roadmap tracks what you bring in through the app (Scouter). Your eBay inventory lives in Collection, Channels and Spaces. */
const app = (i) => i.source === "scouter" || i.source === "app";
const realLive = (i) => i.phase === "listed" && !i.ended && !/^(demo-|mp-)/.test(String(i.id)) && !!i.channels?.ebay?.listingId && !/^demo/.test(String(i.channels.ebay.listingId));
/* Command shows only what you bring in through the app. Listings imported from eBay don't clutter the map. */
function mine(list) { return list.filter((i) => !isArchived(i.id) && app(i)); }

function groups() {
  const g = Object.fromEntries(STOPS.map((s) => [s.id, []]));
  for (const it of mine(items)) {
    const s = stopFor(it);
    if (s) g[s.id].push(it);
  }
  /* delivered drops off the map after a week so it stays a fresh to-do map; Channels keeps the full history */
  const wk = Date.now() - 7 * 864e5;
  for (const o of orderItems(90)) { if (o.phase === "delivered" && Date.parse(o._order?.deliveredAt || o._order?.shippedAt || o.when || 0) < wk) continue; g[o.phase].push(o); }
  return g;
}

/* ---------- toast / sheet ---------- */
let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.remove("act"); t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600); }
function toastUndo(msg, fn) {
  const t = $("#toast"); t.innerHTML = ""; t.append(document.createTextNode(msg + " "));
  const b = document.createElement("button"); b.type = "button"; b.className = "undo"; b.textContent = "Undo";
  const x = document.createElement("button"); x.type = "button"; x.className = "undo-x"; x.setAttribute("aria-label", "Dismiss"); x.textContent = "×";
  t.append(b, x); t.classList.add("show", "act");
  const hide = () => { clearTimeout(toastT); t.classList.remove("show", "act"); };
  clearTimeout(toastT); toastT = setTimeout(hide, 30000); // long window: tappable until you move on
  b.addEventListener("click", () => { hide(); fn(); }); x.addEventListener("click", hide);
}
/* Sheets: real iOS sheets (Ionic ion-modal with detents + swipe) when Ionic is loaded; plain panel otherwise. */
let modal = null;
const sheetIsOpen = () => !!(modal && modal.isConnected) || !$("#sheet").hidden;
function closeSheet() { const m = modal; modal = null; if (m) {
    /* Back always works at once: if the sheet engine stalls, the sheet is pulled anyway */
    const kill = () => { if (m.isConnected) { m.remove(); if (!document.querySelector("ion-modal.show-modal")) document.body.classList.remove("backdrop-no-scroll"); } };
    try { Promise.resolve(m.__p).catch(() => {}).then(() => m.dismiss()).finally(kill); } catch { kill(); }
    setTimeout(() => { if (m.isConnected) { m.classList.add("closing"); setTimeout(kill, 180); } }, 650);
  } $("#sheet").hidden = true; $("#sheetBack").hidden = true; }
function openSheet(html) {
  if (window.customElements && customElements.get("ion-modal")) {
    if (modal && modal.isConnected && modal.classList.contains("show-modal")) {
      /* a fresh element each time, so old swipe/tap handlers never pile up */
      const old = modal.querySelector(".shx"), s = document.createElement("div"); s.className = "shx swap";
      s.innerHTML = `<button class="x" aria-label="Close" data-close type="button">×</button>${html}`; old.replaceWith(s);
      try { modal.querySelector("ion-content").scrollToTop(0); } catch { /* ignore */ }
      s.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); closeSheet(); }));
      return s;
    }
    if (modal) { const old = modal; modal = null; old.remove(); }
    const m = document.createElement("ion-modal"); const ph = phone();
    if (ph) { m.breakpoints = [0, 0.55, 0.94]; m.initialBreakpoint = 0.94; m.handle = true; m.handleBehavior = "cycle"; m.expandToScroll = false; }
    m.className = "fob-sheet" + (ph ? " is-phone" : "");
    /* Reduce Motion: no slide, the sheet is there and tappable instantly */
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) m.animated = false;
    m.innerHTML = `<ion-content class="shx-c"><div class="shx"><button class="x" aria-label="Close" data-close type="button">×</button>${html}</div></ion-content>`;
    document.body.appendChild(m); modal = m;
    const gone = () => { if (modal === m) modal = null; m.remove(); };
    m.addEventListener("ionModalDidDismiss", gone); m.addEventListener("didDismiss", gone);
    const s = m.querySelector(".shx");
    s.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeSheet));
    m.__p = m.present();
    return s;
  }
  const s = $("#sheet"); s.innerHTML = `<button class="x" aria-label="Close" data-close>×</button>${html}`; s.hidden = false; $("#sheetBack").hidden = false;
  s.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeSheet));
  s.scrollTop = 0;
  return s;
}
$("#sheetBack").addEventListener("click", closeSheet);
addEventListener("fob:edit-live", (e) => editListing(e.detail, chApi()));
window.__fob = { openSheet: (h) => openSheet(h), closeSheet: () => closeSheet(), toast: (t) => toast(t), render: () => render() };
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

function nextAction(ph, it) {
  const ed = it && (it.channels?.ebay?.sku || it.sku) ? `<button class="btn go" data-edit-live type="button">Edit listing</button>` : "";
  if (ph === "listed" && it && it.spaceId) return `<p class="sub" style="margin-top:12px">Live on eBay and put away in its bin.</p><div class="it-acts">${ed}<button class="btn" data-act="spaces" type="button">Open Spaces</button></div>`;
  if (ph === "listed") return `<p class="sub" style="margin-top:12px">Live on eBay. Next: pick its bin below.</p>${ed}`;
  if (ph === "intake") return `<p class="sub" style="margin-top:12px">Next: identify it from its photos.</p><button class="btn go" data-act="scouter" type="button">Identify it in Scouter</button>`;
  if (ph === "staged") return `<p class="sub" style="margin-top:12px">Next: build the eBay listing.</p><button class="btn go" data-act="channels" data-st="staged" type="button">Build the listing</button>`;
  if (ph === "listed") return `<p class="sub" style="margin-top:12px">Selling on eBay now.</p><button class="btn" data-act="channels" type="button">See all live listings</button>`;
  if (["sold", "packed"].includes(ph)) return `<p class="sub" style="margin-top:12px">Next: pack it and print the label in eBay.</p><a class="btn go" href="https://www.ebay.com/sh/ord" target="_blank" rel="noopener">Open eBay orders</a>`;
  return "";
}
/* the other things you can do with an item, right here */
function moreActions(ph, it) {
  if (["sold", "packed", "shipped", "delivered", "ended"].includes(ph)) return "";
  const bins = loadSpaces().filter((b) => b.phys);
  const fix = ph === "intake" || ph === "staged" ? `<button class="btn" data-reid type="button">${ph === "intake" ? "Identify it in Scouter" : "Fix the name or price in Scouter"}</button>` : "";
  const binRow = bins.length ? `<div class="it-binh">Put it in a bin</div><div class="it-bins">${bins.map((b) => `<button type="button" class="it-bin${it.spaceId === b.id ? " on" : ""}" data-bin-to="${esc(b.id)}">${esc(b.name)}${b.sub ? `<small>${esc(b.sub)}</small>` : ""}</button>`).join("")}</div>` : "";
  return `<div class="it-more">${fix}${binRow}</div>`;
}
/* ---------- item viewer: Back, "3 of 28", previous / next, swipe ---------- */
let NAV = null; // { sid, ids }
const navFor = (sid) => { NAV = { sid, ids: (groups()[sid] || []).map((x) => String(x.id)) }; };
function navBar(id) {
  const i = NAV ? NAV.ids.indexOf(String(id)) : -1;
  if (i < 0) return `<div class="iv-bar"><button type="button" class="iv-back" data-close>‹ Back</button></div>`;
  const st = STOPS.find((s) => s.id === NAV.sid);
  return `<div class="iv-bar"><button type="button" class="iv-back" data-ivback>‹ ${esc(NAV.sid === "scouter" ? "Scouter" : st ? st.label : "Back")}</button><span class="iv-n">${i + 1} of ${NAV.ids.length}</span><button type="button" class="iv-btn" data-ivprev aria-label="Previous item"${i === 0 ? " disabled" : ""}>‹</button><button type="button" class="iv-btn" data-ivnext aria-label="Next item"${i === NAV.ids.length - 1 ? " disabled" : ""}>›</button></div>`;
}
function wireNav(s, id) {
  if (!NAV) return; const i = NAV.ids.indexOf(String(id)); if (i < 0) return;
  const to = (k) => { const nid = NAV.ids[k]; if (nid) itemSheet(nid); };
  s.querySelector("[data-ivback]")?.addEventListener("click", () => { if (NAV.sid === "scouter" || !STOPS.some((x) => x.id === NAV.sid)) closeSheet(); else stageSheet(NAV.sid); });
  s.querySelector("[data-ivprev]")?.addEventListener("click", () => to(i - 1));
  s.querySelector("[data-ivnext]")?.addEventListener("click", () => to(i + 1));
  let sx = null, sy = 0;
  s.addEventListener("touchstart", (e) => { if (e.touches.length !== 1 || e.target.closest(".ph-row,.sib,input,textarea,.trk")) { sx = null; return; } sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  s.addEventListener("touchend", (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null; if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) to(dx < 0 ? i + 1 : i - 1); }, { passive: true });
}
/* archive one thing (item or order) and move on like a person would: next item, else back to the list */
function archiveOne(it) {
  const i = NAV ? NAV.ids.indexOf(String(it.id)) : -1, nextId = i >= 0 ? (NAV.ids[i + 1] || NAV.ids[i - 1]) : null, sid = NAV && NAV.sid;
  archive([it]); render();
  toastUndo(`Archived ${nameOf(it)}`, () => { unarchive([it.id]); render(); });
  if (sid) { navFor(sid); if (nextId && NAV.ids.includes(String(nextId))) itemSheet(nextId); else stageSheet(sid); } else closeSheet();
}

function orderSheet(it) {
  const o = it._order, u = trackUrl(o), src = photoOf(it);
  const s = openSheet(`${navBar(it.id)}${lockFrame(it, src)}<h2>${esc(nameOf(it))}</h2><div class="sub">${it.phase === "sold" ? "Sold, needs shipping" : it.phase === "delivered" ? "Delivered" : "Shipped"}</div>
    ${it.phase === "sold" ? "" : trackerHtml(o)}
    <div class="row"><span>Total</span><span>${money(o.total)}</span></div><div class="row"><span>Buyer</span><span>${esc(o.buyer || "—")}</span></div><div class="row"><span>Sold</span><span>${dayText(o.createdAt) || "—"}</span></div><div class="row"><span>Carrier</span><span>${esc(o.carrier || "—")}</span></div><div class="row"><span>Tracking</span><span>${o.trackingNumber ? esc(o.trackingNumber) : "No label yet"}</span></div>
    ${u ? `<a class="btn go" href="${esc(u)}" target="_blank" rel="noopener" style="margin-top:12px">Open carrier tracking</a>` : `<a class="btn go" href="https://www.ebay.com/sh/ord" target="_blank" rel="noopener" style="margin-top:12px">Open eBay orders</a>`}
    <button class="btn iv-arch" data-arch type="button">Archive this order</button>`);
  wireNav(s, it.id); s.querySelector("[data-arch]").addEventListener("click", () => archiveOne(it));
  s.querySelector("[data-ov]")?.addEventListener("click", (e) => { setOv(o.orderId, e.currentTarget.dataset.ov); closeSheet(); render(); toast(e.currentTarget.dataset.ov === "delivered" ? "Moved to Delivered" : "Moved back to Shipped"); });
}
function itemSheet(id) {
  if (String(id).startsWith("ord-")) { const o = orderItems(90).find((x) => x.id === String(id)); if (o) orderSheet(o); return; }
  const it = items.find((i) => String(i.id) === String(id)); if (!it) return;
  const src = photoOf(it); const ph = phaseFromItem(it); const st = stopFor(it);
  const s = openSheet(`
    ${navBar(it.id)}
    ${lockFrame(it, src, { id: "sheetMain" })}
<div class="it-info">
    <h2>${esc(nameOf(it))}</h2>
    ${itemTabs(it, `<div class="ip-big">${money(it.price)}</div><div class="row"><span>Quantity</span><span>${Number(it.quantity) || 1}</span></div>${it.purchasePrice ? `<div class="row"><span>You paid</span><span>${money(it.purchasePrice)}</span></div>` : ""}${nextAction(ph, it)}${moreActions(ph, it)}`)}
</div>
    <div id="phMgr" style="margin-top:18px"></div>${(() => { const g = groups()[st && st.id] || []; const others = g.filter((x) => String(x.id) !== String(it.id)).slice(0, 24); return others.length ? `<div class="ph-head" style="margin-top:6px"><b>Also in ${esc(st.label)}</b><span>${g.length} total</span></div><div class="ph-row">${others.map((x) => { const p = photoOf(x); return `<button type="button" class="sib" data-sib="${esc(x.id)}">${p ? `<img src="${esc(p)}" alt="" loading="lazy">` : `<i>${esc(nameOf(x).charAt(0))}</i>`}<span>${esc(nameOf(x))}</span></button>`; }).join("")}</div>` : ""; })()}

    <button class="btn iv-arch" data-arch type="button">Archive this item</button>
    ${String(it.id).startsWith("ord-") ? "" : `<button class="btn warn" data-del type="button" style="margin-top:10px">Delete from this app</button>`}`);
  wireNav(s, it.id); wireTabs(s); s.querySelector("[data-arch]").addEventListener("click", () => archiveOne(it));
  s.querySelector("[data-reid]")?.addEventListener("click", () => { closeSheet(); window.__scReid = String(it.id); if (view === "scouter") { const m = $("#main"); m.innerHTML = ""; render(); } else go("scouter"); });
  s.querySelectorAll("[data-bin-to]").forEach((b) => b.addEventListener("click", () => { const to = b.dataset.binTo === it.spaceId ? null : b.dataset.binTo; assign([it.id], to); items = loadItems(); const nm = loadSpaces().find((x) => x.id === to)?.name; toast(to ? `Put in ${nm}` : "Taken out of the bin"); itemSheet(it.id); if (view !== "scouter") softRender(); else window.__fobScRepaint?.(); }));
  photoManager(s.querySelector("#phMgr"), it.id, { toast, refresh: () => { items = loadItems(); renderStats(); const m = s.querySelector("#sheetMain"); const c = items.find((i) => String(i.id) === String(id)); if (m && c) m.src = photoOf(c); } });
  s.querySelectorAll("[data-sib]").forEach((b) => b.addEventListener("click", () => itemSheet(b.dataset.sib)));
  s.querySelector("[data-del]")?.addEventListener("click", (e) => { const b = e.currentTarget; if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Tap again to delete"; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = "Delete from this app"; } }, 4000); return; }
    const prev = items.slice(), sk = it.channels?.ebay?.sku || it.sku, hid = [String(it.id).startsWith("ebay-") ? String(it.id) : null, sk ? `ebay-${sk}` : null].filter(Boolean), eb = hid.length; hideIds(hid); items = items.filter((i) => String(i.id) !== String(id)); saveItems2(items); closeSheet(); render(); toastUndo(`Deleted ${nameOf(it)}`, () => { if (eb) unhideIds(hid); items = prev; saveItems2(prev); render(); }); });
  s.querySelector("[data-edit-live]")?.addEventListener("click", () => { closeSheet(); setTimeout(() => editListing(id, chApi()), 280); });
  s.querySelector("[data-act]")?.addEventListener("click", (e) => { const a = e.currentTarget.dataset.act; if (a === "scouter") go("scouter"); else if (a === "spaces") { closeSheet(); go("spaces"); } else if (a === "channels") { window.__chStage = e.currentTarget.dataset.st || "listed"; if (e.currentTarget.dataset.st === "staged") { closeSheet(); buildListing(id, chApi()); } else go("channels"); } });
}
function chApi() { return { toast, toastUndo, openSheet, closeSheet, refresh: () => { items = loadItems(); renderStats(); window.__fobScRepaint?.(); }, rerender: () => render() }; }
const EMPTY_HINT = { intake: "No cards waiting. Snap or drop photos in Scouter to start.", staged: "Nothing ready to list. Identify cards in Scouter first.", listed: "Nothing live on eBay right now.", stored: "Nothing waiting. Items you list show up here until you pick their bin.", sold: "No sales waiting to ship.", shipped: "Nothing in transit.", delivered: "Nothing delivered this week. Channels has the full history." };
function stageSheet(sid) {
  if (!STOPS.some((x) => x.id === sid)) return;
  if (sid === "intake" && !groups().intake.length) { go("scouter"); return; }
  const stop = STOPS.find((x) => x.id === sid); const list = groups()[sid]; navFor(sid);
  const cap = 60, canArch = ["sold", "shipped", "delivered"].includes(sid) && list.length;
  const s = openSheet(`
    <div class="iv-bar"><button type="button" class="iv-back" data-close>‹ Back to Command</button></div>
    <h2>${esc(stop.label)}</h2><div class="sub">${list.length} ${list.length === 1 ? "item" : "items"} · ${esc(stop.note)}</div>
    ${list.length ? `<div class="grid">${list.slice(0, cap).map((it) => { const src = photoOf(it); return `<button class="tile" data-item="${esc(it.id)}">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : `<div class="tini">${esc(nameOf(it).replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "?")}</div>`}<span class="cap">${esc(nameOf(it))}</span></button>`; }).join("")}</div>${list.length > cap ? `<p class="sub" style="margin-top:12px">Showing ${cap} of ${list.length}.</p>` : ""}${sid === "staged" ? `<button class="btn go" id="varAll" type="button" style="margin-top:12px">List several as one variation listing</button>` : sid === "intake" ? `<button class="btn go" id="toSc" type="button" style="margin-top:12px">Identify these in Scouter</button>` : `<button class="btn go" id="seeAll" type="button" style="margin-top:12px">Open ${esc(stop.label)} in Channels</button>`}${canArch ? `<button class="btn iv-arch" id="archAll" type="button">Archive all ${list.length}</button>` : ""}` : `<div class="st-empty"><p>${esc(EMPTY_HINT[sid] || "Nothing here yet.")}</p>${sid === "intake" || sid === "staged" ? `<button class="btn go" id="toSc" type="button">Open Scouter</button>` : `<button class="btn go" id="seeAll" type="button">Open Channels</button>`}</div>`}`);
  s.querySelector("#archAll")?.addEventListener("click", (e) => { const b = e.currentTarget; if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = `Yes, archive all ${list.length}`; return; } archive(list); render(); stageSheet(sid); toastUndo(`Archived ${list.length} from ${stop.label}`, () => { unarchive(list.map((x) => x.id)); render(); }); });
  s.querySelectorAll("[data-item]").forEach((b) => b.addEventListener("click", () => itemSheet(b.dataset.item)));
  s.querySelector("#varAll")?.addEventListener("click", () => { closeSheet(); variationListing(chApi()); });
  s.querySelector("#toSc")?.addEventListener("click", () => { closeSheet(); go("scouter"); });
  s.querySelector("#seeAll")?.addEventListener("click", () => { window.__chStage = ({ intake: "intake", staged: "staged", listed: "listed", sold: "sold", shipped: "shipped", delivered: "delivered" })[sid] || "all"; go("channels"); });
}

/* ---------- header ---------- */
function renderStats() {
  const g = groups();
  const open = mine(items).filter((i) => !["ended", "sold", "packed", "shipped", "delivered"].includes(phaseFromItem(i)));
  const value = open.reduce((a, i) => a + worth(i), 0);
  $("#stats").innerHTML = [[money(value), "Total value in progress"], [g.intake.length + g.staged.length, "Items need action"], [(() => { const k = new Set(); items.forEach((i) => { if (realLive(i)) k.add(i.channels.ebay.listingId); }); return k.size; })(), "Live on eBay"]]
    .map(([b, l]) => `<div class="stat"><b>${b}</b><span>${l}</span></div>`).join("");
}
function initAvatar() {
  try { const a = localStorage.getItem(LS_AVATAR); if (a) $("#avatarImg").src = a; } catch { /* default husky */ }
  const f = $("#avatarFile");
  $("#avatarBtn").addEventListener("click", () => f.click());
  f.addEventListener("change", () => {
    const file = f.files && f.files[0]; if (!file) return;
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d");
      const m = Math.min(img.width, img.height); x.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, 256, 256);
      const data = c.toDataURL("image/jpeg", 0.88);
      try { localStorage.setItem(LS_AVATAR, data); } catch { /* ignore */ }
      $("#avatarImg").src = data; URL.revokeObjectURL(url); toast("Profile picture saved");
    };
    img.onerror = () => toast("That file isn't an image"); img.src = url; f.value = "";
  });
}

/* ---------- Command ---------- */
const phone = () => matchMedia("(max-width:820px)").matches;
function pileHtml(list, cls, emptyMsg, sid = "") {
  if (!list.length) return emptyMsg ? `<button type="button" class="empty go ${cls}" data-goto="scouter"><i>+</i><span>${esc(emptyMsg)}</span></button>` : (sid ? `<button type="button" class="empty ${cls}" data-stage="${sid}"><i>○</i><span>Empty</span></button>` : `<div class="empty ${cls}"><i>○</i><span>Empty</span></div>`);
  const top = list[0]; const src = photoOf(top);
  const face = (it, k) => { const p = photoOf(it); return `<div class="pc ${k === "" ? "k-tilt" : k}" ${k === "" ? `data-item="${esc(it.id)}"` : ""}>${p ? `<img src="${esc(p)}" alt="" draggable="false">` : `<div class="ini">${esc(nameOf(it).charAt(0).toUpperCase())}</div>`}${k === "" ? `<span class="cap"><span>${esc(nameOf(it))}</span><em>${money(worth(it))}</em></span>` : ""}</div>`; };
  return `<div class="pile ${cls}">${list[2] ? face(list[2], "b2") : ""}${list[1] ? face(list[1], "b1") : ""}${face(top, "")}${list.length > 1 ? `<span class="more" data-stage="${sid}">+${list.length - 1} more</span>` : ""}</div>`;
}
/* HUD widgets: the numbers you check first, tap to jump there */
function widgets(g) {
  const ord = orderItems(90), day = 864e5, now = Date.now();
  const wk = ord.filter((o) => now - Date.parse(o._order?.createdAt || o.when || 0) < 7 * day).reduce((x, o) => x + (Number(o.price) || 0), 0);
  return `<div class="hudw holo" role="group" aria-label="At a glance">
    <div class="holo-read">
      <button type="button" class="hr" data-goto="channels" data-pst="sold"><em>Sold this week</em><b>${money(wk)}</b></button>
      <button type="button" class="hr hot" data-stage="sold"><em>To ship</em><b>${g.sold.length}</b></button>
      <button type="button" class="hr" data-stage="shipped"><em>On the way</em><b>${g.shipped.length}</b></button>
    </div></div>`;
}
/* ---------- your route, your way: stops can be dragged anywhere, the line always runs in order ---------- */
const ROUTE_KEY = "coalition-route-v2";
let arranging = false;
function routeSaved(kind) { try { return (JSON.parse(localStorage.getItem(ROUTE_KEY) || "{}") || {})[kind] || {}; } catch { return {}; } }
function routeSave(kind, map) { try { const all = JSON.parse(localStorage.getItem(ROUTE_KEY) || "{}") || {}; all[kind] = map; localStorage.setItem(ROUTE_KEY, JSON.stringify(all)); } catch { /* ignore */ } }
/* dark city map under the route (like the original roadmap photo) — fixed seed so it never jumps */
function mapStreets(W, H) {
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const cx = (v) => Math.max(0, Math.min(W, v)).toFixed(0), cy = (v) => Math.max(0, Math.min(H, v)).toFixed(0);
  let d = "";
  for (let y = 40; y < H; y += 60 + rnd() * 70) { const a = (rnd() - .5) * 40; d += `M0,${cy(y)} L${W},${cy(y + a)} `; }
  for (let x = 30; x < W; x += 50 + rnd() * 80) { const a = (rnd() - .5) * 60; d += `M${cx(x)},0 L${cx(x + a)},${H} `; }
  for (let k = 0; k < 6; k++) { const x0 = rnd() * W, y0 = rnd() * H; d += `M${cx(x0)},${cy(y0)} L${cx(x0 + (rnd() - .5) * W * .8)},${cy(y0 + (rnd() - .5) * H * .5)} `; }
  let m = ""; for (let k = 0; k < 9; k++) { const r = 8 + rnd() * 16; m += `<circle cx="${cx(Math.max(r + 2, Math.min(W - r - 2, rnd() * W)))}" cy="${cy(rnd() * H)}" r="${r.toFixed(0)}"/>`; }
  return `<g class="streets" aria-hidden="true"><path d="${d}"/>${m}</g>`;
}
function routePath(pts, vertical) { let d = `M${pts[0][0]},${pts[0][1]}`; for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; if (vertical) { const m = (y0 + y1) / 2; d += ` C${x0},${m} ${x1},${m} ${x1},${y1}`; } else { const m = (x0 + x1) / 2; d += ` C${m},${y0} ${m},${y1} ${x1},${y1}`; } } return d; }
function wireArrange(main, kind, W, H) {
  const road = main.querySelector(".road"); if (!road) return;
  const btn = main.querySelector("#arrBtn"), rst = main.querySelector("#arrReset");
  btn?.addEventListener("click", () => { arranging = !arranging; renderCommand(); if (arranging) toast("Drag any stop. The route stays in order."); });
  rst?.addEventListener("click", () => { routeSave(kind, {}); renderCommand(); toast("Route reset"); });
  if (!arranging) return;
  road.classList.add("arranging");
  road.addEventListener("click", (e) => { if (e.target.closest(".stop")) { e.stopPropagation(); e.preventDefault(); } }, true);
  const stops = [...road.querySelectorAll(".stop")];
  const points = () => stops.map((st) => { const x = parseFloat(st.style.left) / 100 * W; const y = kind === "phone" ? parseFloat(st.style.top) : parseFloat(st.style.top) / 100 * H; return [x, y]; });
  const redraw = () => { const d = routePath(points(), kind === "phone"); road.querySelectorAll("svg > path").forEach((p) => p.setAttribute("d", d)); road.querySelectorAll("svg animateMotion").forEach((a) => a.setAttribute("path", d)); };
  /* whole stop is the handle; it keeps the spot you grabbed it by, and can't pass its neighbours, so the line never tangles */
  stops.forEach((st, i) => {
    st.addEventListener("pointerdown", (e) => {
      if (e.button > 0) return; e.preventDefault(); e.stopPropagation(); st.setPointerCapture(e.pointerId); st.classList.add("moving");
      const r = road.getBoundingClientRect(), s0 = main.scrollTop, sx = e.clientX, sy = e.clientY, ox = parseFloat(st.style.left), oy = parseFloat(st.style.top);
      const prev = stops[i - 1], next = stops[i + 1], pv = (el) => parseFloat(el.style[kind === "phone" ? "top" : "left"]);
      const mv = (ev) => {
        const lo = kind === "phone" ? 18 : 5; let xp = ox + (ev.clientX - sx) / r.width * 100;
        if (kind === "phone") {
          let y = oy + (ev.clientY - sy) + (main.scrollTop - s0); const yMin = prev ? pv(prev) + 150 : 160, yMax = next ? pv(next) - 150 : H - 90; y = Math.max(yMin, Math.min(yMax, y));
          st.style.top = y + "px"; xp = Math.max(lo, Math.min(100 - lo, xp));
          const mr = main.getBoundingClientRect(); if (ev.clientY > mr.bottom - 70) main.scrollTop += 10; else if (ev.clientY < mr.top + 70) main.scrollTop -= 10;
        } else {
          let y = oy + (ev.clientY - sy) / r.height * 100; y = Math.max(14, Math.min(84, y)); st.style.top = y + "%";
          const xMin = prev ? pv(prev) + 7 : lo, xMax = next ? pv(next) - 7 : 100 - lo; xp = Math.max(xMin, Math.min(xMax, xp));
        }
        st.style.left = xp + "%"; redraw();
      };
      const up = () => { st.removeEventListener("pointermove", mv); st.removeEventListener("pointerup", up); st.removeEventListener("pointercancel", up); st.classList.remove("moving");
        const map = routeSaved(kind); map[st.dataset.drop] = [parseFloat(st.style.left), parseFloat(st.style.top)]; routeSave(kind, map); };
      st.addEventListener("pointermove", mv); st.addEventListener("pointerup", up); st.addEventListener("pointercancel", up);
    });
  });
}
addEventListener("fob:inbox", () => { if (view === "command" && !arranging && !document.querySelector("ion-modal")) renderCommand(); });
function renderCommand() {
  const g = groups(); const main = $("#main");
  const pills = [
    [g.intake.length + (window.__fobInboxN || 0), "Identify new photos", "scouter"],
    [g.staged.length, "Build and publish", "@staged"],
    [g.stored.length, "Put away", "!putaway"],
    [g.sold.length, "Pack and ship", "channels", "sold"],
  ].map(([n, t, v, st]) => `<button class="pill${n ? " hot" : ""}" ${v[0] === "!" ? `data-putaway type="button"` : v[0] === "@" ? `data-stage="${v.slice(1)}"` : `data-goto="${v}"`} ${st ? `data-pst="${st}"` : ""}><b>${n}</b>${t}</button>`).join("");
  if (phone()) {
    main.style.overflowY = "auto"; main.style.overflowX = "hidden";
    const H = 1980, W = 390, sv = routeSaved("phone"), PX = [27, 73, 27, 73, 27, 73].map((x, i) => (sv[STOPS[i].id] || [])[0] ?? x), PY = [300, 590, 880, 1170, 1460, 1750].map((y, i) => (sv[STOPS[i].id] || [])[1] ?? y);
    const pts = PX.map((x, i) => [x / 100 * W, PY[i]]);
    const path = routePath(pts, true);
    main.innerHTML = `${widgets(g)}<div class="arr-bar"><button type="button" class="arr-btn${arranging ? " on" : ""}" id="arrBtn">${arranging ? "Done arranging" : "Arrange route"}</button>${arranging ? `<button type="button" class="arr-btn" id="arrReset">Reset</button>` : ""}</div><div class="road pv" style="position:relative;height:${H}px"><div class="dock">${pills}</div><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" style="position:absolute;left:0;top:0;width:100%;height:${H}px">
      <defs><linearGradient id="rgp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#50B97E"/><stop offset=".55" stop-color="#B3FBD5"/><stop offset="1" stop-color="#E8924A"/></linearGradient></defs>
      <path d="${path}" fill="none" stroke="#90FFCC" stroke-opacity=".12" stroke-width="14" stroke-linecap="round"/><path d="${path}" fill="none" stroke="#90FFCC" stroke-opacity=".18" stroke-width="7" stroke-linecap="round"/>
      <path d="${path}" fill="none" stroke="url(#rgp)" stroke-width="3" stroke-linecap="round"/></svg>
      ${STOPS.map((s, i) => `<div class="stop${g[s.id].length ? " has" : ""}" data-drop="${s.id}" style="left:${PX[i]}%;top:${PY[i]}px;--c:${s.c}">
        ${pileHtml(g[s.id], "up", s.id === "intake" ? "Start here: tap to add photos" : "", s.id)}<div class="dot" data-stage="${s.id}" aria-hidden="true"></div>
        <div class="tag${g[s.id].length ? " has" : ""}" data-stage="${s.id}" role="button" tabindex="0" aria-label="${esc(s.label)}, ${g[s.id].length} items"><b class="tc">${g[s.id].length}</b><em class="stepn">Step ${i + 1} of ${STOPS.length}</em><span>${s.label}</span><small>${s.note}</small><strong class="tv">${money(g[s.id].reduce((a, x) => a + worth(x), 0))}</strong></div></div>`).join("")}
      <div class="flag start" style="left:${PX[0] - 17}%;top:${PY[0] + 8}px"><i></i>Start</div><div class="flag end" style="left:${PX[5] - 17}%;top:${PY[5] + 8}px"><i></i>Done</div></div>`;
  } else {
    main.style.overflowY = "hidden"; main.style.overflowX = "";
    const W = Math.max(600, main.clientWidth || 1000), H = Math.max(420, main.clientHeight || 600);
    const sv = routeSaved("desk"), POS = STOPS.map((s) => sv[s.id] || s.pos);
    const pts = POS.map((p) => [p[0] / 100 * W, p[1] / 100 * H]);
    const path = routePath(pts, false);
    main.innerHTML = `${widgets(g)}<div class="road"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="rg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="0"><stop offset="0" stop-color="#50B97E"/><stop offset=".55" stop-color="#B3FBD5"/><stop offset="1" stop-color="#E8924A"/></linearGradient></defs>
      <path d="${path}" fill="none" stroke="#90FFCC" stroke-opacity=".45" stroke-width="16" stroke-linecap="round" style="filter:blur(9px)"/>
      <path d="${path}" fill="none" stroke="url(#rg)" stroke-width="4" stroke-linecap="round"/>
      <path class="flow" d="${path}" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 34"/>
      ${[0, 1, 2, 3].map((k) => `<circle r="7" opacity="0" fill="#B3FBD5" style="filter:drop-shadow(0 0 9px #90FFCC)"><set attributeName="opacity" to="1" begin="${k * 3.5}s"/><animateMotion dur="14s" begin="${k * 3.5}s" repeatCount="indefinite" path="${path}"/></circle>`).join("")}</svg>
      ${STOPS.map((s, i) => `<div class="stop${g[s.id].length ? " has" : ""}" data-drop="${s.id}" style="left:${POS[i][0]}%;top:${POS[i][1]}%;--c:${s.c}">
        ${pileHtml(g[s.id], "up", s.id === "intake" ? "Start here: tap to add photos" : "", s.id)}<div class="dot" data-stage="${s.id}" aria-hidden="true"></div>
        <div class="tag${g[s.id].length ? " has" : ""}" data-stage="${s.id}" role="button" tabindex="0" aria-label="${esc(s.label)}, ${g[s.id].length} items"><b class="tc">${g[s.id].length}</b><em class="stepn">Step ${STOPS.indexOf(s) + 1} of ${STOPS.length}</em><span>${s.label}</span><small>${s.note}</small><strong class="tv">${money(g[s.id].reduce((a, x) => a + worth(x), 0))}</strong></div></div>`).join("")}
      <div class="flag start" style="left:${POS[0][0] - 6}%;top:${POS[0][1] - 1}%"><i></i>Start</div><div class="flag end" style="left:${POS[5][0] - 2}%;top:${POS[5][1] + 12}%"><i></i>Done</div>
      <div class="dock">${pills}</div><div class="hint">Tap a stop to open it · hold a card and drop it on a stop to move it</div><div class="arr-bar desk"><button type="button" class="arr-btn${arranging ? " on" : ""}" id="arrBtn">${arranging ? "Done arranging" : "Arrange route"}</button>${arranging ? `<button type="button" class="arr-btn" id="arrReset">Reset</button>` : ""}</div></div>`;
  }
  // wire up
  main.querySelectorAll(".pc.b1,.pc.b2").forEach((m) => { m.dataset.stage = m.closest(".stop").dataset.drop; m.style.cursor = "pointer"; });
  main.querySelectorAll(".more").forEach((m) => { const st = m.closest(".stop"); m.dataset.stage = st.dataset.drop; });
  main.querySelectorAll("[data-stage]").forEach((el) => el.addEventListener("click", () => stageSheet(el.dataset.stage)));
  main.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => { if (b.dataset.pst) window.__chStage = b.dataset.pst; go(b.dataset.goto); }));
  main.querySelectorAll(".stop .tag").forEach((d) => d.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); stageSheet(d.dataset.stage); } }));
  main.querySelectorAll(".pc[data-item]").forEach(bindDrag);
  main.querySelectorAll("[data-putaway]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); if (!unbinnedCount()) { toast("Everything is already in a bin."); return; } openPutAway({ toast, toastUndo, openSheet, closeSheet, refresh: () => { items = loadItems(); renderStats(); if (view === "command") renderCommand(); } }); }));
  if (phone()) wireArrange(main, "phone", 390, 1980); else wireArrange(main, "desk", Math.max(600, main.clientWidth || 1000), Math.max(420, main.clientHeight || 600));
}
function bindDrag(el) {
  let ghost = null, sx = 0, sy = 0, moved = false, over = null, down = false;
  /* touch: a swipe scrolls the map; hold a card ~0.3s to pick it up and drag it. mouse: drag right away. */
  let armed = false, holdT = 0;
  el.addEventListener("touchmove", (e) => { if (armed) e.preventDefault(); }, { passive: false });
  el.addEventListener("pointerdown", (e) => { down = true; moved = false; sx = e.clientX; sy = e.clientY;
    if (e.pointerType === "touch") { armed = false; clearTimeout(holdT); holdT = setTimeout(() => { if (!down) return; armed = true; window.__fobHold = true; try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ } el.classList.add("lift"); navigator.vibrate?.(12); }, 300); }
    else { armed = true; window.__fobHold = true; el.setPointerCapture(e.pointerId); } });
  el.addEventListener("pointermove", (e) => {
    if (!down) return;
    if (!armed) { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) { clearTimeout(holdT); down = false; } return; }
    if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) < 8) return;
    if (!moved) { moved = true; ghost = el.cloneNode(true); ghost.className = "pc ghost"; document.body.appendChild(ghost); el.style.opacity = ".3"; }
    ghost.style.left = e.clientX + "px"; ghost.style.top = e.clientY + "px"; lx = e.clientX; ly = e.clientY; hitTest();
    if (!raf) raf = requestAnimationFrame(edge);
  });
  /* drag near the top/bottom edge and the route scrolls, so you can reach any stop */
  let lx = 0, ly = 0, raf = 0;
  const scroller = () => { const m = $("#main"); return m && m.scrollHeight > m.clientHeight + 4 ? m : document.scrollingElement; };
  const hitTest = () => { const hit = document.elementsFromPoint(lx, ly).map((n) => n.closest && n.closest(".stop")).find(Boolean); if (over && over !== hit) over.classList.remove("drop"); over = hit || null; if (over) over.classList.add("drop"); };
  const edge = () => {
    raf = 0; if (!down || !moved) return;
    const sc = scroller(), r = sc === document.scrollingElement ? { top: 0, bottom: innerHeight } : sc.getBoundingClientRect(), nav = $("#nav")?.getBoundingClientRect(), bot = Math.min(r.bottom, nav && nav.top > 0 ? nav.top : r.bottom), zone = 90;
    let dy = 0; if (ly > bot - zone) dy = Math.min(22, (ly - (bot - zone)) / 3); else if (ly < r.top + zone) dy = -Math.min(22, (r.top + zone - ly) / 3);
    if (dy) { sc.scrollTop += dy; hitTest(); }
    raf = requestAnimationFrame(edge);
  };
  const release = () => { window.__fobHold = false; if (window.__fobPend) { window.__fobPend = false; setTimeout(render, 0); } };
  const end = (e) => {
    clearTimeout(holdT); el.classList.remove("lift");
    if (!down) return; down = false; armed = false; setTimeout(release, 0); if (raf) { cancelAnimationFrame(raf); raf = 0; }
    try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!moved) { const st = el.closest(".stop"); if (st) navFor(st.dataset.drop); itemSheet(el.dataset.item); return; }
    const target = over && over.dataset.drop; if (over) over.classList.remove("drop"); if (ghost) ghost.remove(); el.style.opacity = "";
    if (!target) return;
    const it = items.find((i) => String(i.id) === String(el.dataset.item)); if (!it) return;
    if (String(el.dataset.item).startsWith("ord-")) { toast("Orders come from eBay. Open it to see tracking."); return; }
    if (target === "stored" && it.phase === "staged" && it.channels?.ebay?.listingId) { it.phase = "listed"; saveItems(items); toast("Listed. Now pick its bin."); render(); itemSheet(it.id); return; }
    if (target === "listed" && it.phase === "staged") { if (it.channels?.ebay?.listingId) { it.phase = "listed"; saveItems(items); toast("Moved to Live on eBay"); render(); } else buildListing(it.id, chApi()); return; }
    if (target === "stored") { if (it.phase === "staged") buildListing(it.id, chApi()); else itemSheet(it.id); return; }
    if (!MOVE_TO[target]) { toast("Use Build and publish to put an item live on eBay."); return; }
    it.phase = MOVE_TO[target]; saveItems(items); toast(`Moved to ${STOPS.find((s) => s.id === target).label}`); render();
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", () => { clearTimeout(holdT); el.classList.remove("lift"); armed = false; down = false; release(); moved = false; if (ghost) ghost.remove(); ghost = null; if (over) over.classList.remove("drop"); over = null; el.style.opacity = ""; });
}

/* ---------- other views ---------- */

/* ---------- router ---------- */
let view = "command";
const ORDER = ["command", "scouter", "spaces", "channels", "collection", "settings"];
function go(v) {
  const run = () => go_(v);
  const reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
  if (document.startViewTransition && !reduce && !window.__fobFX && v !== view) {
    document.documentElement.dataset.vt = ORDER.indexOf(v) >= ORDER.indexOf(view) ? "fwd" : "back";
    const t = document.startViewTransition(run); t.finished.finally(() => { delete document.documentElement.dataset.vt; });
  } else run();
}
let introT = 0;
function intro() { if (matchMedia("(prefers-reduced-motion: reduce)").matches) return; const h = document.documentElement; h.classList.add("intro"); clearTimeout(introT); introT = setTimeout(() => h.classList.remove("intro"), 1100); }
function go_(v) {
  if (v !== view || !document.querySelector("#main > *")) intro();
  if (v !== view) arranging = false; /* never leave the route stuck in arrange mode */
  view = v; closeSheet(); document.body.dataset.view = v; try { dispatchEvent(new CustomEvent("fob:view", { detail: v })); } catch { /* ignore */ }
  document.querySelectorAll("#nav button").forEach((b) => { b.classList.toggle("on", b.dataset.view === v); if (b.dataset.view === v) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  try { history.replaceState(null, "", v === "command" ? "./" : `#${v}`); } catch { /* ignore */ }
  render();
}
/* Background updates (sync, other tab) must never move you: no re-render while you're in a sheet, card, bin or the Scouter, and scroll is kept. */
let sig = "";
const sigOf = (l) => (localStorage.getItem("coalition-orders-v1") || "").length + "|" + (localStorage.getItem("coalition-order-state-v1") || "") + "|" + l.length + ":" + l.reduce((m, i) => (i.updatedAt > m ? i.updatedAt : m), "");
/* never redraw under a finger: a background refresh waits until the tap is finished */
let pressing = false, pressT = 0;
document.addEventListener("pointerdown", () => { pressing = true; clearTimeout(pressT); }, true);
const release = () => { clearTimeout(pressT); pressT = setTimeout(() => { pressing = false; }, 350); };
document.addEventListener("pointerup", release, true); document.addEventListener("pointercancel", release, true);
let softT = 0;
function softRender() {
  if (pressing) { setTimeout(softRender, 400); return; }
  purgeDemo();
  const l = loadItems(), n = sigOf(l); items = l; renderStats();
  if (n === sig) return;
  /* busy (sheet open, dragging): keep the change and redraw once you're back */
  if (sheetIsOpen() || document.querySelector(".k-zoom") || document.querySelector(".ghost")) { clearTimeout(softT); softT = setTimeout(softRender, 1200); return; }
  sig = n;
  if (view === "scouter") { window.__fobScRepaint?.(); return; }
  if (view === "settings" || view === "spaces") return;
  const m = $("#main"), y = m.scrollTop; render(); m.scrollTop = y;
}
function render() {
  if (window.__fobHold) { window.__fobPend = true; return; }
  { let raw = ""; try { raw = localStorage.getItem(LS_ITEMS) || "[]"; } catch { /* ignore */ }
    if (raw !== lastRaw || !items) { const l = loadItems(), k = l.filter((i) => !isDemo(i)); if (k.length !== l.length) saveItems(k); items = k; try { lastRaw = localStorage.getItem(LS_ITEMS) || "[]"; } catch { lastRaw = raw; } } }
  renderStats(); sig = sigOf(items);
  if (view === "command") renderCommand(); else if (view === "settings") renderSettings($("#main")); else if (view === "scouter") { $("#main").style.overflowY = "auto"; if (!$("#main .sc-wrap")) renderScouter($("#main"), { build: (id) => buildListing(id, chApi()), open: (id, ids) => { items = loadItems(); NAV = { sid: "scouter", ids: (ids || [id]).map(String) }; itemSheet(id); }, variation: () => variationListing(chApi()), importCsv: () => openImport({ toast, openSheet, closeSheet, refresh: () => { items = loadItems(); renderStats(); window.__fobScRepaint?.(); } }), getItems: loadItems, setItems: (l) => { saveItems(l); items = l; renderStats(); }, toast, toastUndo, go });  else window.__fobScRepaint?.();} else if (view === "collection" || view === "spaces" || view === "channels") { $("#main").style.overflowY = "auto"; const sel = view === "collection" ? ".co-wrap" : ".sp-wrap"; $("#main").innerHTML = ""; (view === "collection" ? renderCollection : view === "channels" ? renderChannels : renderSpaces)($("#main"), { toast, toastUndo, openSheet, closeSheet, refresh: () => { items = loadItems(); renderStats(); } }); } else renderCommand();
}
document.querySelectorAll("#nav button").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));
addEventListener("resize", (() => { let t; let last = phone(); return () => { clearTimeout(t); t = setTimeout(() => { if (phone() !== last) { last = phone(); render(); } else if (!phone() && document.querySelector(".road")) render(); }, 150); }; })());
addEventListener("storage", () => softRender());

/* ---------- sync (writes the shared store) ---------- */
const DONE = ["sold", "packed", "shipped", "delivered"];
async function pullEbay(onProgress) {
  const rows = []; let offset = 0, failed = 0, total = 0, guard = 0;
  while (offset !== null && guard++ < 30) {
    let page = null, err = "";
    for (let t = 0; t < 3 && !page; t++) {
      try {
        const res = await fetch("/api/channels/ebay/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offset, limit: 150 }) });
        const b = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(b.records)) page = b; else { err = b.error || "eBay isn't connected yet."; if (res.status === 503) break; }
      } catch { err = "Couldn't reach eBay."; }
      if (!page) await new Promise((r) => setTimeout(r, 400 * (t + 1)));
    }
    if (!page) { if (!rows.length) return { error: err || "eBay sync failed. Try again.", rows, complete: false, total }; return { rows, complete: false, failed, total: total || rows.length }; }
    rows.push(...page.records); failed += page.failed || 0; total = page.total || total; onProgress(rows.length, total);
    offset = page.next ?? null;
  }
  return { rows, complete: offset === null && failed === 0, failed, total };
}
function setLink(on) { const l = $("#link"); if (!l) return; l.classList.toggle("on", !!on); l.firstChild.textContent = on ? "EBAY ONLINE" : "EBAY OFFLINE"; }
fetch("/api/channels/status").then((r) => r.json()).then((d) => setLink((d.channels || []).some((c) => c.id === "ebay" && c.configured))).catch(() => {});
async function pullOrders() {
  const bySku = new Map();
  try {
    const o = await fetch("/api/channels/ebay/orders?days=90");
    if (o.ok) {
      const ob = await o.json().catch(() => ({})); const ords = (ob.orders || []).filter((x) => x.orderId);
      if (Array.isArray(ob.orders)) saveOrders(ords);
      for (const ord of ords) for (const li of ord.items || []) { if (li.sku) bySku.set(li.sku, ord.status === "label_created" ? "sold" : "shipped"); }
    }
  } catch { /* orders optional */ }
  return bySku;
}
/* one eBay SKU = one item. Keep the copy you made in the app (it has your bin, photos, paid price) and drop eBay's echo of it. */
function dedupeListings(list) {
  const by = new Map(); let n = 0;
  for (let k = 0; k < list.length; k++) { const id = list[k].channels?.ebay?.sku || list[k].sku; if (!id) continue; /* same SKU = same listing; variation cards share a listing but each has its own SKU */ if (!by.has(id)) by.set(id, []); by.get(id).push(k); }
  const drop = new Set();
  for (const ks of by.values()) {
    if (ks.length < 2) continue;
    const score = (i) => (String(i.id).startsWith("ebay-") ? 0 : 2) + (i.source === "scouter" || i.source === "app" ? 1 : 0) - (i.ended ? 5 : 0);
    const best = ks.slice().sort((a, b) => score(list[b]) - score(list[a]))[0], keep = list[best];
    for (const k of ks) { if (k === best) continue; const o = list[k]; keep.spaceId = keep.spaceId || o.spaceId; if (!keep.photos?.length && o.photos?.length) keep.photos = o.photos; keep.channels = { ...o.channels, ...keep.channels, ebay: { ...o.channels?.ebay, ...keep.channels?.ebay } }; drop.add(k); n++; }
  }
  for (const k of [...drop].sort((a, b) => b - a)) list.splice(k, 1);
  return n;
}
async function syncAll(auto) {
  const HIDDEN = hiddenIds();
  const btn = $("#syncBtn"); if (btn.classList.contains("busy")) return;
  btn.classList.add("busy"); btn.textContent = (phone() ? "…" : "Syncing…");
  if (!auto) toast("Pulling eBay…");
  const ordersP = pullOrders();
  try {
    const pulled = await pullEbay((n, t) => { btn.textContent = (phone() ? `${n}/${t}` : `Syncing ${n}/${t}`); });
    if (pulled.error) { await ordersP; softRender(); toast(auto ? "Showing saved data. eBay didn't answer." : pulled.error); return; }
    const body = { partial: !pulled.complete };
    const list = loadItems(), syncStartIds = new Set(list.map((i) => String(i.id))); const all = pulled.rows; const rows = all.filter((r) => r.offerKnown !== false);
    for (const r of rows) {
      const sku = r.channels?.ebay?.sku || r.sku; if (!sku) continue; if ((r.id && HIDDEN.has(String(r.id))) || HIDDEN.has(`ebay-${sku}`)) continue;
      const appId = /^hud-/.test(sku) ? sku.slice(4) : null; /* listings made by this app carry the item's id in the SKU */
      let idx = appId ? list.findIndex((i) => String(i.id) === appId) : -1;
      if (idx < 0) idx = list.findIndex((i) => i.channels?.ebay?.sku === sku || (r.id && i.id === r.id));
      const live = r.channels.ebay.listingId ? "listed" : "draft";
      const photos = (r.photos || []).filter((p) => p.dataUrl || p.url).map((p) => ({ id: p.id, dataUrl: p.dataUrl || p.url }));
      if (!photos.length && r.imageUrl) photos.push({ id: `img-${sku}`, dataUrl: r.imageUrl });
      const mapped = { id: r.id || `ebay-${sku}`, title: r.title || r.productName, productName: r.productName || r.title, sku, quantity: r.quantity || 1, price: r.price,
        phase: r.phase || (live === "listed" ? "listed" : "staged"), ended: Boolean(r.ended), listingStatus: r.ended ? "draft" : live, staged: false, spaceId: r.spaceId || null, channels: r.channels, photos, groupId: r.groupId || null, groupImage: r.groupImage || null, groupTitle: r.groupTitle || null };
      if (idx >= 0) { const keep = list[idx]; list[idx] = { ...keep, ...mapped, id: keep.id, source: keep.source || mapped.source, spaceId: keep.spaceId || mapped.spaceId, photos: (keep.photos?.length ? keep.photos : mapped.photos) };
        { const u = list[idx]; const eb = (r.imageUrls || []).filter((x) => /^https:/.test(x)); if (!u.photosDirty && live === "listed" && eb.length && eb.length === (u.photos || []).length && (u.photos || []).some((p) => String(p.dataUrl || "").startsWith("data:"))) u.photos = eb.map((x, k) => ({ id: `eb-${k}`, dataUrl: x })); } }
      else list.unshift(mapped);
    }
    if (!body.partial && !body.truncated && rows.length) {
      const seen = new Set(rows.map((r) => r.channels?.ebay?.sku || r.sku).filter(Boolean));
      for (const it of list) { const sku = it.channels?.ebay?.sku; if (sku && !seen.has(sku) && !it.ended && !DONE.includes(it.phase)) it.ended = true; }
    }
    const bySku = await ordersP;
    for (const it of list) { if (!(it.source === "scouter" || it.source === "app")) continue; const hit = bySku.get(it.sku || it.channels?.ebay?.sku); if (hit && it.phase !== hit && ["listed", "staged", "intake", "sold", "packed"].includes(it.phase)) { it.phase = hit; it.ended = false; } }
    /* anything you did while eBay was syncing wins: bins, prices you paid, notes, drafts, new items, deletes */
    { const fresh = loadItems(), fm = new Map(fresh.map((i) => [String(i.id), i])), KEEP = ["spaceId", "purchasePrice", "notes", "draft", "description", "aspects", "condition", "collections", "fulfillmentPolicyId"];
      for (let k = list.length - 1; k >= 0; k--) { const it = list[k], f = fm.get(String(it.id)); if (f) { for (const key of KEEP) if (key in f) it[key] = f[key]; } else if (syncStartIds.has(String(it.id))) list.splice(k, 1); }
      const have = new Set(list.map((i) => String(i.id))); for (const f of fresh) if (!have.has(String(f.id))) list.unshift(f); }
    dedupeListings(list);
    if (!saveItems2(list)) { toast("Couldn't save the sync: phone storage is full. Clear space in Settings."); return; }
    items = list; softRender();
    const nLive = list.filter((i) => phaseFromItem(i) === "listed").length, nSold = list.filter((i) => DONE.includes(i.phase)).length, nEnd = list.filter((i) => i.ended && !DONE.includes(i.phase)).length;
    setLink(true); toast(pulled.complete ? `Synced: ${nLive} live, ${nSold} sold, ${orderItems().length} orders` : `Synced ${rows.length} of ${pulled.total}. ${pulled.total - rows.length} couldn't be checked. Tap Sync again.`);
  } catch { toast(auto ? "Showing saved data." : "eBay sync failed. Try again."); }
  finally { btn.classList.remove("busy"); btn.textContent = "Sync"; }
}
$("#syncBtn").addEventListener("click", () => syncAll(false));
initKit(); initAvatar();
/* ---------- Tools: everything you can do, one tap away (blurred overlay) ---------- */
function openTools() {
  if (document.getElementById("tools")) return;
  const g = groups();
  const sec = (t, rows) => `<section><h4>${t}</h4>${rows.map(([k, label, sub]) => `<button type="button" class="tl" data-tool="${k}"><span><b>${label}</b>${sub ? `<small>${sub}</small>` : ""}</span><i>›</i></button>`).join("")}</section>`;
  const el = document.createElement("div"); el.id = "tools"; el.className = "tools"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Tools");
  el.innerHTML = `<div class="tools-in"><header><h3>Tools</h3><button type="button" class="tools-x" data-tool="close" aria-label="Close">×</button></header>
    ${sec("Scan", [["scan", "Scan cards", "Open the camera"], ["type", "Type it in", "Name, number, set"]])}
    ${sec("Sell", [["build", "Build a listing", `${g.staged.length} ready to list`], ["var", "List several as one", "One eBay listing, many cards"], ["ship", "Pack and ship", `${g.sold.length} waiting`], ["ebay", "Open eBay orders", "Print labels in eBay"]])}
    ${sec("Inventory", [["csv", "Import or export a CSV", "Double Holo, Shiny Pro, eBay"], ["bins", "Put things in bins", "Spaces"], ["coll", "Collection", "Everything you own"]])}
    ${sec("App", [["sync", "Sync with eBay", "Pull listings and orders now"], ["settings", "Settings", "Archive, storage, account"]])}</div>`;
  document.body.appendChild(el); document.body.classList.add("tools-open");
  requestAnimationFrame(() => el.classList.add("on"));
  const close = () => { el.classList.remove("on"); document.body.classList.remove("tools-open"); setTimeout(() => el.remove(), 220); document.removeEventListener("keydown", esc_); };
  const esc_ = (e) => { if (e.key === "Escape") close(); }; document.addEventListener("keydown", esc_);
  el.addEventListener("click", (e) => {
    if (e.target === el) { close(); return; }
    const b = e.target.closest("[data-tool]"); if (!b) return; const k = b.dataset.tool; close();
    if (k === "scan") go("scouter"); else if (k === "type") { go("scouter"); setTimeout(() => document.getElementById("scMan")?.click() || document.getElementById("scType")?.click(), 400); }
    else if (k === "build") stageSheet("staged"); else if (k === "var") variationListing(chApi());
    else if (k === "ship") { window.__chStage = "sold"; go("channels"); } else if (k === "ebay") window.open("https://www.ebay.com/sh/ord", "_blank", "noopener");
    else if (k === "csv") openImport({ toast, openSheet, closeSheet, refresh: () => { items = loadItems(); renderStats(); window.__fobScRepaint?.(); } });
    else if (k === "bins") go("spaces"); else if (k === "coll") go("collection"); else if (k === "sync") syncAll(false); else if (k === "settings") go("settings");
  });
}
$("#toolsBtn")?.addEventListener("click", openTools);
/* warm up the sheet engine so the first sheet opens instantly (and Back works right away) */
customElements.whenDefined("ion-modal").then(() => { const w = document.createElement("div"); w.hidden = true; w.setAttribute("aria-hidden", "true"); w.innerHTML = "<ion-modal class=\"fob-warm\"><ion-content></ion-content></ion-modal>"; document.body.appendChild(w); const m = w.firstChild; Promise.resolve(m.componentOnReady?.()).then(() => m.querySelector("ion-content")?.componentOnReady?.()).finally(() => setTimeout(() => w.remove(), 50)); }).catch(() => {});
const h = (location.hash || "").slice(1);
go(["scouter", "collection", "channels", "spaces", "settings"].includes(h) ? h : "command");
initSync(() => softRender());
syncAll(true);
/* always run the newest build: if the server has a newer one than this page, reload into it */
(() => { const mine = (import.meta.url.match(/[?&]v=(\d+)/) || [])[1]; if (!mine) return;
  const check = async () => { try { const t = await (await fetch(`/next/index.html?ts=${Date.now()}`, { cache: "no-store" })).text(); const live = (t.match(/next\.js\?v=(\d+)/) || [])[1];
    if (live && live !== mine && !document.querySelector("ion-modal")) { let tried = ""; try { tried = sessionStorage.getItem("fob-upd") || ""; sessionStorage.setItem("fob-upd", live); } catch { /* ignore */ } if (tried !== live) location.replace(`/next/?b=${live}&r=${Date.now().toString(36)}`); } } catch { /* offline: keep going */ } };
  setTimeout(check, 1500); document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); }); setInterval(check, 5 * 60 * 1000); })();
/* storage diet: oversized photo copies (some are 300-600 KB each) are re-saved at a sane size so the phone never runs out of room */
setTimeout(async () => {
  try {
    const list = loadItems(); let changed = 0;
    const shrinkUrl = (u) => new Promise((res) => { const im = new Image(); im.onload = () => { const k = Math.min(1, 900 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas"); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", .76)); }; im.onerror = () => res(null); im.src = u; });
    for (const it of list) for (const ph of it.photos || []) { const u = ph.dataUrl || ""; if (u.startsWith("data:image") && u.length > 160000) { const n = await shrinkUrl(u); if (n && n.length < u.length * .8) { ph.dataUrl = n; changed++; } } }
    if (changed) { const cur = loadItems(), m = new Map(list.map((i) => [String(i.id), i])); for (const c of cur) { const l = m.get(String(c.id)); if (l) c.photos = l.photos; } if (saveItems2(cur)) items = cur; }
  } catch { /* ignore */ }
}, 5000);
