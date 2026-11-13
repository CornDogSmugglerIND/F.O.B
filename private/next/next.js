import "./viewer.js?v=210";
import { startScanLink } from "./scanlink.js?v=210";
import { isArchived, archive, unarchive, archMap, loadSpaces, assign, srcOf} from "./shared.js?v=210";
import { orderItems, saveOrders, trackUrl, dayText, trackerHtml, setOv, hiddenIds, hideIds, unhideIds } from "./orders.js?v=210";
import { phaseFromItem } from "/visor/phases.js?v=210";
import { renderScouter } from "./scouter.js?v=210";
import { renderCollection, openImport } from "./collection.js?v=210";
import { photoManager } from "./photos.js?v=210";
import { renderSpaces, openPutAway, unbinnedCount } from "./spaces.js?v=210";
import { renderChannels, buildListing, variationListing, editListing } from "./channels.js?v=210";
import { renderSettings } from "./settings.js?v=210";
import { initSync } from "./sync.js?v=210";
import { initKit, itemTabs, wireTabs, lockFrame } from "./kit.js?v=210";
import * as PS from "./photostore.js?v=210";

const LS_ITEMS = "coalition-items-v4";
const LS_AVATAR = "cdsc-avatar";
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nameOf = (it) => { const t = it.title || it.productName || ""; return !t ? "Untitled" : /^sku-\d+$/i.test(t.trim()) ? `Draft listing …${t.trim().slice(-4)}` : t; };
const photoOf = (it) => srcOf(it && it.photos && it.photos[0]);
const worth = (it) => it._order ? (Number(it.price) || 0) : (Number(it.price) || 0) * (Number(it.quantity) || 1);

/* ---------- data ---------- */
function loadItems() { try { const v = JSON.parse(localStorage.getItem(LS_ITEMS) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
/* never write an older copy over a newer one: if another screen changed an item since we loaded it, its newer version wins */
function mergeNewer(list) { try { const cur = JSON.parse(localStorage.getItem(LS_ITEMS) || "[]"); if (!Array.isArray(cur)) return list; const cm = new Map(cur.map((i) => [String(i.id), i]));
  for (const i of list) { const c = cm.get(String(i.id)); if (c && c.spaceId !== i.spaceId && Date.parse(c.updatedAt || 0) > Date.parse(i.updatedAt || 0)) i.spaceId = c.spaceId; } return list; } catch { return list; } }
function saveItems(items) {
  try { localStorage.setItem(LS_ITEMS, JSON.stringify(mergeNewer(items))); return true; }
  catch {
    /* Only photos are big enough to fill storage. Move them to device storage
       and try once more before telling Sawyer anything is lost. */
    PS.migrate(items).then((n) => {
      if (!n) { toast("Couldn't save. Phone storage is full."); return; }
      try { localStorage.setItem(LS_ITEMS, JSON.stringify(mergeNewer(items))); toast(`Moved ${n} photo${n === 1 ? "" : "s"} to device storage. Saved.`); softRender(); }
      catch { toast("Couldn't save. Phone storage is full."); }
    });
    return false;
  }
}
const saveItems2 = (l) => { try { localStorage.setItem(LS_ITEMS, JSON.stringify(l)); return true; } catch { return false; } };
const isDemo = (i) => i.demo || /^demo/.test(String(i.channels?.ebay?.listingId || "")) || (i.photos || []).some((p) => String(p.dataUrl || "").startsWith("/demo/"));
function purgeDemo() { const l = loadItems(), k = l.filter((i) => !isDemo(i)), dup = dedupeListings(k); if (dup || k.length !== l.length) saveItems2(k); }
purgeDemo();
let items = loadItems(); let lastRaw = null; document.body.dataset.view = "command";

const STOPS = [
  { id: "intake", label: "Intake", note: "not identified yet", go: "Identify", phases: ["intake"], c: "#B3FBD5", pos: [6, 72], movable: true },
  { id: "staged", label: "Ready to list", note: "listing not built yet", go: "Build", phases: ["staged"], c: "#B3FBD5", pos: [18.5, 44], movable: true },
  { id: "stored", label: "Put away", note: "listed, needs its bin", go: "Put away", phases: ["listed"], c: "#90FFEE", pos: [31, 72], movable: false },
  { id: "sold", label: "Pull", note: "sold, pull it from its bin", go: "Pull and pack", phases: ["sold"], c: "#E8924A", pos: [43.5, 44], movable: true },
  { id: "packed", label: "Packed", note: "label on, drop it off", go: "Drop off", phases: ["packed"], c: "#E8924A", pos: [56, 72], movable: true },
  { id: "shipped", label: "Shipped", note: "on its way", go: "Track", phases: ["shipped"], c: "#E8924A", pos: [68.5, 44], movable: true },
  { id: "arriving", label: "Arriving", note: "due at the door today", go: "Track", phases: ["arriving"], c: "#E8924A", pos: [81, 72], movable: true },
  { id: "delivered", label: "Delivered", note: "at the door", go: "", phases: ["delivered"], c: "#E8924A", pos: [93.5, 44], movable: true },
];
/* a fresh map: things you bring in through the app until they're listed and in a bin, then your eBay orders. Old eBay listings live in Channels. */
const stopFor = (it) => { const ph = phaseFromItem(it); if (ph === "listed") return it.spaceId ? null : STOPS.find((x) => x.id === "stored"); return STOPS.find((x) => x.phases.includes(ph)); };
const MOVE_TO = { intake: "intake", staged: "staged", sold: "sold", packed: "packed", shipped: "shipped", delivered: "delivered" };

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
  for (const o of orderItems(90)) { if (o.phase === "delivered" && Date.parse(o._order?.deliveredAt || o._order?.shippedAt || o.when || 0) < wk) continue; (g[o.phase] || g.shipped).push(o); }
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
    /* the sheet stops catching taps the moment it starts closing: the first tap after closing used to land on the dying sheet */
    m.style.pointerEvents = "none"; m.querySelectorAll("ion-backdrop").forEach((b) => { b.style.pointerEvents = "none"; });
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
startScanLink({ toast: (t) => toast(t) });
addEventListener("fob:edit-live", (e) => editListing(e.detail, chApi()));
addEventListener("fob:build", (e) => buildListing(e.detail, chApi()));
addEventListener("fob:go", (e) => { try { go(e.detail); } catch { /* ignore */ } });
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
  const s = openSheet(`${navBar(it.id)}${lockFrame(it, src)}<h2>${esc(nameOf(it))}</h2><div class="sub">${({ sold: "Sold. Pull it and pack it", packed: "Packed, drop it off", arriving: "Arriving today", delivered: "Delivered" })[it.phase] || "In transit"}</div>
    ${it.phase === "sold" ? `<button class="btn go" data-ov="packed" type="button" style="margin-top:12px">Mark packed</button>` : it.phase === "packed" ? `<p class="sub" style="margin-top:12px">Moves to Shipped by itself once the tracking is on eBay.</p><button class="btn" data-ov="" type="button">Not packed yet</button>` : trackerHtml(o)}
    <div class="row"><span>Total</span><span>${money(o.total)}</span></div><div class="row"><span>Buyer</span><span>${esc(o.buyer || "—")}</span></div><div class="row"><span>Sold</span><span>${dayText(o.createdAt) || "—"}</span></div><div class="row"><span>Carrier</span><span>${esc(o.carrier || "—")}</span></div><div class="row"><span>Tracking</span><span>${o.trackingNumber ? esc(o.trackingNumber) : "No label yet"}</span></div>
    ${u ? `<a class="btn go" href="${esc(u)}" target="_blank" rel="noopener" style="margin-top:12px">Open carrier tracking</a>` : `<a class="btn go" href="https://www.ebay.com/sh/ord" target="_blank" rel="noopener" style="margin-top:12px">Open eBay orders</a>`}
    <button class="btn iv-arch" data-arch type="button">Archive this order</button>`);
  wireNav(s, it.id); s.querySelector("[data-arch]").addEventListener("click", () => archiveOne(it));
  s.querySelector("[data-ov]")?.addEventListener("click", (e) => { setOv(o.orderId, e.currentTarget.dataset.ov); closeSheet(); render(); toast(({ delivered: "Moved to Delivered", transit: "Moved back to Shipped", packed: "Moved to Packed" })[e.currentTarget.dataset.ov] || "Moved back to Sold"); });
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
const EMPTY_HINT = { intake: "No cards waiting. Snap or drop photos in Scouter to start.", staged: "Nothing ready to list. Identify cards in Scouter first.", listed: "Nothing live on eBay right now.", stored: "Nothing waiting. Items you list show up here until you pick their bin.", sold: "No sales waiting to be packed.", packed: "Nothing packed and waiting to drop off.", shipped: "Nothing in transit.", arriving: "Nothing due at a door today.", delivered: "Nothing delivered this week. Channels has the full history." };
function stageSheet(sid) {
  if (!STOPS.some((x) => x.id === sid)) return;
  if (sid === "intake" && !groups().intake.length) { go("scouter"); return; }
  const stop = STOPS.find((x) => x.id === sid); const list = groups()[sid]; navFor(sid);
  const cap = 60, canArch = ["sold", "packed", "shipped", "arriving", "delivered"].includes(sid) && list.length;
  const s = openSheet(`
    <div class="iv-bar"><button type="button" class="iv-back" data-close>‹ Back to Command</button></div>
    <h2>${esc(stop.label)}</h2><div class="sub">${list.length} ${list.length === 1 ? "item" : "items"} · ${esc(stop.note)}</div>
    ${list.length ? `<div class="grid">${list.slice(0, cap).map((it) => { const src = photoOf(it); return `<button class="tile" data-item="${esc(it.id)}">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : `<div class="tini">${esc(nameOf(it).replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "?")}</div>`}<span class="cap">${esc(nameOf(it))}</span></button>`; }).join("")}</div>${list.length > cap ? `<p class="sub" style="margin-top:12px">Showing ${cap} of ${list.length}.</p>` : ""}${sid === "staged" ? `<button class="btn go" id="varAll" type="button" style="margin-top:12px">Make a variation listing variation listing</button>` : sid === "intake" ? `<button class="btn go" id="toSc" type="button" style="margin-top:12px">Identify these in Scouter</button>` : `<button class="btn go" id="seeAll" type="button" style="margin-top:12px">Open ${esc(stop.label)} in Channels</button>`}${canArch ? `<button class="btn iv-arch" id="archAll" type="button">Archive all ${list.length}</button>` : ""}` : `<div class="st-empty"><p>${esc(EMPTY_HINT[sid] || "Nothing here yet.")}</p>${sid === "intake" || sid === "staged" ? `<button class="btn go" id="toSc" type="button">Open Scouter</button>` : `<button class="btn go" id="seeAll" type="button">Open Channels</button>`}</div>`}`);
  s.querySelector("#archAll")?.addEventListener("click", (e) => { const b = e.currentTarget; if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = `Yes, archive all ${list.length}`; return; } archive(list); render(); stageSheet(sid); toastUndo(`Archived ${list.length} from ${stop.label}`, () => { unarchive(list.map((x) => x.id)); render(); }); });
  s.querySelectorAll("[data-item]").forEach((b) => b.addEventListener("click", () => itemSheet(b.dataset.item)));
  s.querySelector("#varAll")?.addEventListener("click", () => { closeSheet(); variationListing(chApi()); });
  s.querySelector("#toSc")?.addEventListener("click", () => { closeSheet(); go("scouter"); });
  s.querySelector("#seeAll")?.addEventListener("click", () => { window.__chStage = ({ intake: "intake", staged: "staged", listed: "listed", sold: "sold", packed: "sold", shipped: "shipped", arriving: "shipped", delivered: "delivered" })[sid] || "all"; go("channels"); });
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
  if (!list.length) return emptyMsg ? `<button type="button" class="empty go ${cls}" data-goto="scouter"><i>+</i><span>${esc(emptyMsg)}</span></button>` : "";
  const top = list[0]; const src = photoOf(top);
  const face = (it, k) => { const p = photoOf(it); return `<div class="pc ${k === "" ? "k-tilt" : k}" ${k === "" ? `data-item="${esc(it.id)}"` : ""}>${p ? `<img src="${esc(p)}" alt="" draggable="false">` : `<div class="ini">${esc(nameOf(it).charAt(0).toUpperCase())}</div>`}${k === "" ? `<span class="cap"><span>${esc(nameOf(it))}</span><em>${money(worth(it))}</em></span>` : ""}</div>`; };
  return `<div class="pile ${cls}">${list[2] ? face(list[2], "b2") : ""}${list[1] ? face(list[1], "b1") : ""}${face(top, "")}${list.length > 1 ? `<span class="more" data-stage="${sid}">+${list.length - 1} more</span>` : ""}</div>`;
}
/* HUD widgets: the numbers you check first, tap to jump there */
function widgets(g) {
  /* Sales desk lives here now (Nov 3): Command is the heads-up display */
  const ord = orderItems(90), day = 864e5, now = Date.now(), wk8 = new Array(8).fill(0);
  for (const o of ord) { const t = Date.parse(o._order?.createdAt || o.when || 0); if (!t) continue; const k = 7 - Math.floor((now - t) / (7 * day)); if (k >= 0 && k < 8) wk8[k] += Number(o._order?.total ?? o.price) || 0; }
  const wk = wk8[7], sum8 = wk8.reduce((a, b) => a + b, 0), mx = Math.max(1, ...wk8);
  const live = items.filter((i) => i.phase === "listed" && !i.ended && i.channels?.ebay?.listingId), liveV = live.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
  /* count listings, not the cards inside variation listings, so this matches the header and Channels */
  const lst = new Map(); for (const i of live) { const k = i.channels.ebay.listingId; (lst.get(k) || lst.set(k, []).get(k)).push(i); }
  const nobin = [...lst.values()].filter((g) => g.every((i) => !i.spaceId)).length;
  const acts = [
    ["Identify", g.intake.length + (window.__fobInboxN || 0), `data-goto="scouter"`],
    ["Build", g.staged.length, `data-stage="staged"`],
    ["Put away", g.stored.length + nobin, `data-putaway type="button"`],
    ["Ship", g.sold.length + g.packed.length, `data-stage="${g.sold.length ? "sold" : "packed"}"`],
  ];
  return `<section class="hudc" role="group" aria-label="Heads-up display">
    <div class="hudc-read">
      <button type="button" class="hc" data-goto="channels" data-pst="sold"><em>Sold this week</em><b>${money(wk)}</b></button>
      <div class="hc hc-ch" aria-label="Sales per week, last 8 weeks"><em>8 weeks</em><b>${money(sum8)}</b><span class="sd-bars">${wk8.map((v, i) => `<i style="height:${Math.max(10, Math.round(v / mx * 100))}%"${i === 7 ? ' class="now"' : ""} title="${money(v)}"></i>`).join("")}</span></div>
      <button type="button" class="hc" data-goto="channels"><em>Live</em><b>${lst.size}</b><small>${money(liveV)}</small></button>
      <button type="button" class="hc" data-stage="shipped"><em>Shipped</em><b>${g.shipped.length + g.arriving.length}</b></button>
    </div>
    <div class="hudc-act" role="list" aria-label="Next actions">${acts.map(([l, n, attr]) => `<button class="ha${n ? " hot" : ""}" ${attr} role="listitem"><b>${n}</b><span>${l}</span><i aria-hidden="true"></i></button>`).join("")}</div>
    <i class="hudc-br tl"></i><i class="hudc-br tr"></i><i class="hudc-br bl"></i><i class="hudc-br br"></i></section>`;
}
/* ---------- your route, your way: stops can be dragged anywhere, the line always runs in order ---------- */
const ROUTE_KEY = "coalition-route-v4"; /* 8 stops (Nov 11): arranging is back, with its own button on the map */
try { localStorage.removeItem("coalition-route-v2"); } catch { /* ignore */ }
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
  btn?.addEventListener("click", () => { arranging = !arranging; renderCommand(); if (arranging) toast("Drag a stop anywhere. It will not cover another one."); });
  rst?.addEventListener("click", () => { routeSave(kind, {}); renderCommand(); toast("Route reset"); });
  if (!arranging) return;
  road.classList.add("arranging");
  road.addEventListener("click", (e) => { if (e.target.closest(".stop")) { e.stopPropagation(); e.preventDefault(); } }, true);
  const stops = [...road.querySelectorAll(".stop")];
  const points = () => stops.map((st) => { const x = parseFloat(st.style.left) / 100 * W; const y = kind === "phone" ? parseFloat(st.style.top) : parseFloat(st.style.top) / 100 * H; return [x, y]; });
  const redraw = () => { const d = routePath(points(), kind === "phone"); road.querySelectorAll("svg > path").forEach((p) => p.setAttribute("d", d)); road.querySelectorAll("svg animateMotion").forEach((a) => a.setAttribute("path", d)); };
  /* Nov 13: two things Sawyer called out. A moved stop used to land on top of
     another one and cover its info, and moving one took forever because it was
     pinned between its neighbours and the page crawled 10px at a time.
     Now it moves freely, it turns red the moment it would cover another stop,
     and on release it slides to the nearest spot that covers nothing. */
  /* a .stop is a zero-size anchor: its pile and tag are positioned off it, so
     the footprint is the union of what is actually drawn */
  const RECT = (el) => {
    let box = null;
    for (const k of el.querySelectorAll(".pile,.tag")) {
      const r = k.getBoundingClientRect(); if (!r.width && !r.height) continue;
      box = box ? { left: Math.min(box.left, r.left), right: Math.max(box.right, r.right), top: Math.min(box.top, r.top), bottom: Math.max(box.bottom, r.bottom) } : { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }
    return box || el.getBoundingClientRect();
  };
  const hit = (a, b) => a.left < b.right - 6 && b.left < a.right - 6 && a.top < b.bottom - 6 && b.top < a.bottom - 6;
  const blocked = (st) => { const r = RECT(st); return stops.some((o) => o !== st && hit(r, RECT(o))); };
  stops.forEach((st, i) => {
    st.addEventListener("pointerdown", (e) => {
      if (e.button > 0) return; e.preventDefault(); e.stopPropagation(); st.setPointerCapture(e.pointerId); st.classList.add("moving");
      const r = road.getBoundingClientRect(), s0 = main.scrollTop, sx = e.clientX, sy = e.clientY, ox = parseFloat(st.style.left), oy = parseFloat(st.style.top);
      let raf = 0, speed = 0;
      const glide = () => { raf = 0; if (!speed) return; main.scrollTop += speed; raf = requestAnimationFrame(glide); };
      const mv = (ev) => {
        const lo = kind === "phone" ? 18 : 5; let xp = ox + (ev.clientX - sx) / r.width * 100;
        if (kind === "phone") {
          /* free movement: the only limit is the map itself */
          let y = oy + (ev.clientY - sy) + (main.scrollTop - s0);
          y = Math.max(300, Math.min(H - 110, y));
          st.style.top = y + "px"; xp = Math.max(lo, Math.min(100 - lo, xp));
          /* the page keeps up with your finger instead of crawling */
          const mr = main.getBoundingClientRect(), edge = 90;
          const over = ev.clientY > mr.bottom - edge ? ev.clientY - (mr.bottom - edge) : ev.clientY < mr.top + edge ? ev.clientY - (mr.top + edge) : 0;
          speed = over ? Math.max(-46, Math.min(46, over * 0.7)) : 0;
          if (speed && !raf) raf = requestAnimationFrame(glide);
        } else {
          let y = oy + (ev.clientY - sy) / r.height * 100; y = Math.max(10, Math.min(88, y)); st.style.top = y + "%";
          xp = Math.max(lo, Math.min(100 - lo, xp));
        }
        st.style.left = xp + "%"; redraw();
        st.classList.toggle("blocked", blocked(st));
      };
      const up = () => {
        st.removeEventListener("pointermove", mv); st.removeEventListener("pointerup", up); st.removeEventListener("pointercancel", up);
        st.classList.remove("moving"); speed = 0; if (raf) cancelAnimationFrame(raf);
        /* Snap to the nearest free slot. The map is a two-lane grid, so there
           are always more slots than stops - a drop can never fail and a stop
           can never cover another one. */
        if (kind === "phone") {
          /* Geometry, measured: a stop holding cards is 388px tall and ~150 wide,
             and the two lanes (25% / 75%) clear each other. So one slot per row
             with the lane alternating puts same-lane stops 480px apart - wider
             than the tallest stop - and nothing can ever overlap. */
          const ROW = 240, Y0 = 300, N = STOPS.length;  /* 300, not 170: the pile hangs ~250px above the dot and would sit behind the stats panel */
          const slots = [];
          for (let r = 0; r < N; r++) slots.push([r % 2 ? 75 : 25, Y0 + r * ROW]);
          /* every other stop claims the slot it is sitting closest to */
          const taken = new Set();
          for (const o of stops) {
            if (o === st) continue;
            const ox2 = parseFloat(o.style.left), oy2 = parseFloat(o.style.top);
            let bi = 0, bd = Infinity;
            slots.forEach((c, k) => { if (taken.has(k)) return; const d = ((c[0] - ox2) * 3) ** 2 + (c[1] - oy2) ** 2; if (d < bd) { bd = d; bi = k; } });
            taken.add(bi);
            o.style.left = slots[bi][0] + "%"; o.style.top = slots[bi][1] + "px";
          }
          const cx = parseFloat(st.style.left), cy = parseFloat(st.style.top);
          let bi = -1, bd = Infinity;
          slots.forEach((c, k) => { if (taken.has(k)) return; const d = ((c[0] - cx) * 3) ** 2 + (c[1] - cy) ** 2; if (d < bd) { bd = d; bi = k; } });
          if (bi >= 0) { st.style.left = slots[bi][0] + "%"; st.style.top = slots[bi][1] + "px"; }
          st.classList.remove("blocked"); redraw();
          /* persist where every stop ended up, not just the one that moved */
          const all = routeSaved(kind);
          for (const o of stops) all[o.dataset.drop] = [parseFloat(o.style.left), parseFloat(o.style.top)];
          routeSave(kind, all);
          return;
        }
        if (blocked(st)) {
          const unit = 2.2, base = parseFloat(st.style.top), bx = parseFloat(st.style.left);
          let placed = false;
          for (let k = 0; k <= 34 && !placed; k++) for (const d of (k ? [-1, 1] : [1])) {
            const v = base + d * k * unit; if (v < 10 || v > 88) continue;
            st.style.top = v + "%";
            for (const lx of [bx, 100 - bx, 20, 50, 80]) { st.style.left = lx + "%"; if (!blocked(st)) { placed = true; break; } }
            if (placed) break;
          }
          if (!placed) { st.style.left = ox + "%"; st.style.top = oy + "%"; }
          st.classList.remove("blocked"); redraw();
        }
        const map = routeSaved(kind); map[st.dataset.drop] = [parseFloat(st.style.left), parseFloat(st.style.top)]; routeSave(kind, map);
      };
      st.addEventListener("pointermove", mv); st.addEventListener("pointerup", up); st.addEventListener("pointercancel", up);
    });
  });
}
addEventListener("fob:inbox", () => { if (view === "command" && !arranging && !document.querySelector("ion-modal")) renderCommand(); });
/* ---------- Phone constellation map (Nov 12) ----------
   Nine cells in a 3x3. One stop per cell, so two stops can never overlap.
   Dragging a stop onto another swaps them: rearranging always does something. */
const MAP_KEY = "coalition-map-v4";
const MAP_DEF = { intake: 0, staged: 1, stored: 2, sold: 5, packed: 4, shipped: 3, arriving: 6, delivered: 7 };
let mapSel = "";
function mapCells() {
  const out = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push({ x: (c * 2 + 1) / 6 * 100, y: (r * 2 + 1) / 6 * 100 });
  return out;
}
function mapOrder() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(MAP_KEY) || "{}") || {}; } catch { saved = {}; }
  const out = {}, used = new Set();
  for (const s of STOPS) {
    const v = saved[s.id];
    if (Number.isInteger(v) && v >= 0 && v < 9 && !used.has(v)) { out[s.id] = v; used.add(v); }
  }
  for (const s of STOPS) {
    if (out[s.id] != null) continue;
    let v = MAP_DEF[s.id];
    while (used.has(v)) v = (v + 1) % 9;
    out[s.id] = v; used.add(v);
  }
  return out;
}
function mapSave(o) { try { localStorage.setItem(MAP_KEY, JSON.stringify(o)); } catch { /* ignore */ } }
function mapWire(main, g) {
  const box = main.querySelector("#cmap"); if (!box) return;
  main.querySelectorAll(".cm-n").forEach((el) => {
    let sx = 0, sy = 0, moved = false, hold = 0, live = false, id = el.dataset.node;
    const start = (e) => {
      if (e.pointerType === "mouse" && e.button) return;
      sx = e.clientX; sy = e.clientY; moved = false; live = false;
      hold = setTimeout(() => { live = true; el.classList.add("lift"); navigator.vibrate?.(12); }, e.pointerType === "mouse" ? 0 : 260);
      el.setPointerCapture?.(e.pointerId);
    };
    const move = (e) => {
      if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 6) moved = true;
      if (!live) { if (moved) { clearTimeout(hold); } return; }
      e.preventDefault();
      const r = box.getBoundingClientRect();
      el.style.left = `${Math.max(4, Math.min(96, (e.clientX - r.left) / r.width * 100))}%`;
      el.style.top = `${Math.max(4, Math.min(96, (e.clientY - r.top) / r.height * 100))}%`;
    };
    const end = (e) => {
      clearTimeout(hold); el.classList.remove("lift");
      if (!live) { if (!moved) { mapSel = id; render(); } return; }
      live = false;
      const r = box.getBoundingClientRect(), cells = mapCells();
      const px = (e.clientX - r.left) / r.width * 100, py = (e.clientY - r.top) / r.height * 100;
      let best = 0, bd = Infinity;
      cells.forEach((c, i) => { const d = (c.x - px) ** 2 + (c.y - py) ** 2; if (d < bd) { bd = d; best = i; } });
      const order = mapOrder(), was = order[id];
      const other = STOPS.find((s) => s.id !== id && order[s.id] === best);
      if (other) order[other.id] = was;
      order[id] = best; mapSave(order); mapSel = id; render();
    };
    el.addEventListener("pointerdown", start);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", () => { clearTimeout(hold); live = false; el.classList.remove("lift"); render(); });
  });
}
const PH_H = 300 + 240 * 7 + 260;  /* Nov 13: smaller rings, so the stops sit closer and the map is shorter */
/* the one thing to do at each stop, right on it: no legend needed */
const goChip = (s, g) => (s.go && g[s.id].length ? `<i class="tag-go">${s.go} ${g[s.id].length} ›</i>` : "");
let keyOpen = false;
const KEY_ROWS = [
  ["dot mint", "Mint stop", "your own stuff, on its way to being listed"],
  ["dot amber", "Orange stop", "an eBay order, on its way out the door"],
  ["num", "Big number", "how many items sit at that stop"],
  ["cash", "Dollar amount", "what those items are worth"],
  ["chip", "Orange chip", "the next thing to do there — tap it"],
  ["drag", "Drag a card", "hold a card, drop it on another stop to move it"],
];
const keyUi = () => `<div class="mkey${keyOpen ? " on" : ""}" id="mKey"${keyOpen ? "" : " hidden"}>
  <div class="mk-h">Map key<button type="button" class="mk-x" id="mKeyX" aria-label="Close the map key">×</button></div>
  ${KEY_ROWS.map(([k, t, d]) => `<div class="mk-r"><i class="mk-i ${k}">${k === "num" ? "8" : k === "cash" ? "$" : k === "chip" ? "›" : ""}</i><b>${t}</b><span>${d}</span></div>`).join("")}
  <p class="mk-f">Left to right is the order things happen: Intake → Ready to list → Put away → Pull → Packed → Shipped → Arriving → Delivered.</p></div>`;
const arrUi = () => `<div class="arr">${arranging ? `<button type="button" class="arr-b on" id="arrBtn">Done arranging</button><button type="button" class="arr-b" id="arrReset">Reset map</button>` : `<button type="button" class="arr-b" id="arrBtn" aria-label="Arrange the map"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/></svg>Arrange map</button>`}</div>`;
function renderCommand() {
  const g = groups(); const main = $("#main");
  const pills = [
    [g.intake.length + (window.__fobInboxN || 0), "Identify new photos", "scouter"],
    [g.staged.length, "Build and publish", "@staged"],
    [g.stored.length, "Put away", "!putaway"],
    [g.sold.length + g.packed.length, "Pack and ship", "@sold"],
  ].map(([n, t, v, st]) => `<button class="pill${n ? " hot" : ""}" ${v[0] === "!" ? `data-putaway type="button"` : v[0] === "@" ? `data-stage="${v.slice(1)}"` : `data-goto="${v}"`} ${st ? `data-pst="${st}"` : ""}><b>${n}</b>${t}</button>`).join("");
  if (phone()) {
    main.style.overflowY = "auto"; main.style.overflowX = "hidden";
    const H = PH_H, W = 390, sv = routeSaved("phone"), PX = STOPS.map((_, i) => (sv[STOPS[i].id] || [])[0] ?? (i % 2 ? 75 : 25)), PY = STOPS.map((_, i) => (sv[STOPS[i].id] || [])[1] ?? 300 + i * 240);
    const pts = PX.map((x, i) => [x / 100 * W, PY[i]]);
    const path = routePath(pts, true);
    main.innerHTML = `${widgets(g)}<div class="arr-ph">${arrUi()}</div><div class="road pv" style="position:relative;height:${H}px"><div class="dock">${pills}</div><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" style="position:absolute;left:0;top:0;width:100%;height:${H}px">
      <defs><linearGradient id="rgp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#50B97E"/><stop offset=".55" stop-color="#B3FBD5"/><stop offset="1" stop-color="#E8924A"/></linearGradient></defs>
      <path d="${path}" fill="none" stroke="#90FFCC" stroke-opacity=".12" stroke-width="14" stroke-linecap="round"/><path d="${path}" fill="none" stroke="#90FFCC" stroke-opacity=".18" stroke-width="7" stroke-linecap="round"/>
      <path d="${path}" fill="none" stroke="url(#rgp)" stroke-width="3" stroke-linecap="round"/></svg>
      ${STOPS.map((s, i) => `<div class="stop${g[s.id].length ? " has" : ""}" data-drop="${s.id}" style="left:${PX[i]}%;top:${PY[i]}px;--c:${s.c}">
        ${pileHtml(g[s.id], "up", s.id === "intake" ? "Start here: tap to add photos" : "", s.id)}<div class="dot" data-stage="${s.id}" aria-hidden="true"></div>
        <div class="tag${g[s.id].length ? " has" : ""}" data-stage="${s.id}" role="button" tabindex="0" aria-label="${esc(s.label)}, ${g[s.id].length} items"><b class="tc">${g[s.id].length}</b><em class="stepn">Step ${i + 1} of ${STOPS.length}</em><span>${s.label}</span><small>${s.note}</small><strong class="tv">${money(g[s.id].reduce((a, x) => a + worth(x), 0))}</strong>${goChip(s, g)}</div></div>`).join("")}
      <div class="flag start" style="left:${PX[0] - 17}%;top:${PY[0] + 8}px"><i></i>Start</div><div class="flag end" style="left:${PX[7] - 17}%;top:${PY[7] + 8}px"><i></i>Done</div></div>`;
  } else {
    main.classList.remove("cmd-ph");
    main.style.overflowY = "hidden"; main.style.overflowX = "";
    const TOP = 150 /* the sales desk sits above the route; nothing overlaps it */, W = Math.max(600, main.clientWidth || 1000), H = Math.max(400, (main.clientHeight || 600) - TOP - 96);
    const sv = routeSaved("desk"), POS = STOPS.map((s) => sv[s.id] || s.pos);
    const pts = POS.map((p) => [p[0] / 100 * W, p[1] / 100 * H]);
    const path = routePath(pts, false);
    main.innerHTML = `${widgets(g)}<div class="road" style="top:${TOP}px !important;bottom:auto !important;height:${H}px !important"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="rg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="0"><stop offset="0" stop-color="#50B97E"/><stop offset=".55" stop-color="#B3FBD5"/><stop offset="1" stop-color="#E8924A"/></linearGradient></defs>
      <path d="${path}" fill="none" stroke="#90FFCC" stroke-opacity=".45" stroke-width="16" stroke-linecap="round" style="filter:blur(9px)"/>
      <path d="${path}" fill="none" stroke="url(#rg)" stroke-width="4" stroke-linecap="round"/>
      <path class="flow" d="${path}" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 34"/>
      ${[0, 1, 2, 3].map((k) => `<circle r="7" opacity="0" fill="#B3FBD5" style="filter:drop-shadow(0 0 9px #90FFCC)"><set attributeName="opacity" to="1" begin="${k * 3.5}s"/><animateMotion dur="14s" begin="${k * 3.5}s" repeatCount="indefinite" path="${path}"/></circle>`).join("")}</svg>
      ${STOPS.map((s, i) => `<div class="stop${g[s.id].length ? " has" : ""}" data-drop="${s.id}" style="left:${POS[i][0]}%;top:${POS[i][1]}%;--c:${s.c}">
        ${pileHtml(g[s.id], "up", s.id === "intake" ? "Start here: tap to add photos" : "", s.id)}<div class="dot" data-stage="${s.id}" aria-hidden="true"></div>
        <div class="tag${g[s.id].length ? " has" : ""}" data-stage="${s.id}" role="button" tabindex="0" aria-label="${esc(s.label)}, ${g[s.id].length} items"><b class="tc">${g[s.id].length}</b><em class="stepn">Step ${STOPS.indexOf(s) + 1} of ${STOPS.length}</em><span>${s.label}</span><small>${s.note}</small><strong class="tv">${money(g[s.id].reduce((a, x) => a + worth(x), 0))}</strong>${goChip(s, g)}</div></div>`).join("")}
      <div class="flag start" style="left:${POS[0][0] - 5}%;top:${POS[0][1] - 1}%"><i></i>Start</div>${arrUi()}
      <div class="dock">${pills}</div><div class="hint">Tap a stop to open it · drag a card onto a stop to move it</div></div>`;
  }
  // wire up
  main.querySelectorAll(".pc.b1,.pc.b2").forEach((m) => { m.dataset.stage = m.closest(".stop").dataset.drop; m.style.cursor = "pointer"; });
  main.querySelectorAll(".more").forEach((m) => { const st = m.closest(".stop"); m.dataset.stage = st.dataset.drop; });
  main.querySelectorAll("[data-stage]").forEach((el) => el.addEventListener("click", () => stageSheet(el.dataset.stage)));
  main.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => { if (b.dataset.pst) window.__chStage = b.dataset.pst; go(b.dataset.goto); }));
  main.querySelectorAll(".stop .tag").forEach((d) => d.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); stageSheet(d.dataset.stage); } }));
  main.querySelector("#mKeyB")?.addEventListener("click", () => { keyOpen = !keyOpen; const k = main.querySelector("#mKey"); if (k) { k.hidden = !keyOpen; k.classList.toggle("on", keyOpen); } main.querySelector("#mKeyB")?.setAttribute("aria-expanded", String(keyOpen)); });
  main.querySelector("#mKeyX")?.addEventListener("click", () => { keyOpen = false; const k = main.querySelector("#mKey"); if (k) { k.hidden = true; k.classList.remove("on"); } main.querySelector("#mKeyB")?.setAttribute("aria-expanded", "false"); });
  main.querySelectorAll(".pc[data-item]").forEach(bindDrag);
  main.querySelectorAll("[data-putaway]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); if (!unbinnedCount()) { toast("Everything is already in a bin."); return; } openPutAway({ toast, toastUndo, openSheet, closeSheet, refresh: () => { items = loadItems(); renderStats(); if (view === "command") renderCommand(); } }); }));
  if (phone()) wireArrange(main, "phone", 390, PH_H); else wireArrange(main, "desk", Math.max(600, main.clientWidth || 1000), Math.max(420, main.clientHeight || 600));
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
  if (document.startViewTransition && !reduce && v !== view) {
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
/* Photos used to sit inline in the item list and blow the 5MB localStorage cap
   at about 20 cards. Move any that are still inline, then warm the object URLs
   the render paths read synchronously. */
PS.setOnReady(() => softRender());
(async () => {
  try {
    const list = loadItems();
    const moved = await PS.migrate(list);
    if (moved) { saveItems2(list); items = list; lastRaw = null; }
    await PS.load(PS.idsIn(list));
    softRender();
  } catch { /* photos just stay inline */ }
})();

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
        phase: r.phase || (live === "listed" ? "listed" : "staged"), ended: Boolean(r.ended), listingStatus: r.ended ? "draft" : live, staged: false, spaceId: r.spaceId || null, channels: r.channels, photos, groupId: r.groupId || null, groupImage: r.groupImage || null, groupTitle: r.groupTitle || null, ...(r.variant ? { variant: r.variant } : {}) };
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
    { const fresh = loadItems(), fm = new Map(fresh.map((i) => [String(i.id), i])), KEEP = ["spaceId", "purchasePrice", "notes", "draft", "description", "aspects", "condition", "collections", "notCollection", "fulfillmentPolicyId"];
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
  const I = { scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M4 12h16"/>', type: '<path d="M5 6h14M5 12h10M5 18h7"/>', build: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>', var: '<rect x="3" y="6" width="10" height="14" rx="1.5"/><path d="M8 4h10a1.5 1.5 0 0 1 1.5 1.5V17"/>', ship: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>', ebay: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', csv: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/>', sync: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M4 4v4h4M20 20v-4h-4"/>' };
  const tile = ([k, label, sub, hot]) => `<button type="button" class="tt${hot ? " hot" : ""}" data-tool="${k}"><svg viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg><b>${label}</b><small>${sub}</small></button>`;
  const el = document.createElement("div"); el.id = "tools"; el.className = "tools tv"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Tools");
  el.innerHTML = `<div class="tv-in"><header><h3>Tools</h3><button type="button" class="tools-x" data-tool="close" aria-label="Close">✕</button></header>
    <h4>Get items in</h4><div class="tv-g">${[["scan", "Scan cards", "Camera or scanner"], ["type", "Type it in", "Name, number, set"], ["csv", "Import a CSV", "Double Holo, Shiny Pro, eBay"]].map(tile).join("")}</div>
    <h4>Sell</h4><div class="tv-g">${[["build", "Build a listing", `${g.staged.length} ready to list`, g.staged.length > 0], ["var", "Variation listing", "Many cards in one pick-your-card listing"], ["ship", "Pack and ship", `${g.sold.length} to ship`, g.sold.length > 0], ["ebay", "eBay orders", "Print labels on eBay"]].map(tile).join("")}</div>
    <h4>Keep it current</h4><div class="tv-g">${[["sync", "Sync with eBay", "Pull listings and orders now"]].map(tile).join("")}</div></div>`;
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
