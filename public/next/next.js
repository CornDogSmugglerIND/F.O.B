import { orderItems, saveOrders, trackUrl, dayText, trackerHtml, setOv, hiddenIds } from "./orders.js?v=4";
import { phaseFromItem } from "/visor/phases.js?v=3";
import { renderScouter } from "./scouter.js?v=13";
import { renderCollection } from "./collection.js?v=12";
import { photoManager } from "./photos.js?v=3";
import { renderSpaces } from "./spaces.js?v=11";
import { renderChannels, buildListing, variationListing } from "./channels.js?v=23";
import { renderSettings } from "./settings.js?v=6";
import { initSync } from "./sync.js?v=4";
import { initKit } from "./kit.js?v=2";

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
function saveItems(items) { try { localStorage.setItem(LS_ITEMS, JSON.stringify(items)); } catch { toast("Couldn't save. Storage is full."); } }
const isDemo = (i) => i.demo || /^demo/.test(String(i.channels?.ebay?.listingId || "")) || (i.photos || []).some((p) => String(p.dataUrl || "").startsWith("/demo/"));
function purgeDemo() { const l = loadItems(), k = l.filter((i) => !isDemo(i)); if (k.length !== l.length) saveItems(k); }
purgeDemo();
let items = loadItems();

const STOPS = [
  { id: "intake", label: "Intake", note: "not identified yet", phases: ["intake"], c: "#B3FBD5", pos: [6, 76], movable: true },
  { id: "staged", label: "Ready to list", note: "listing not built yet", phases: ["staged"], c: "#B3FBD5", pos: [20, 48], movable: true },
  { id: "listed", label: "Live on eBay", note: "selling now", phases: ["listed"], c: "#90FFEE", pos: [34, 72], movable: false },
  { id: "stored", label: "Put away", note: "in its bin", phases: [], c: "#90FFEE", pos: [48, 44], movable: false },
  { id: "sold", label: "Sold", note: "needs shipping", phases: ["sold", "packed"], c: "#E8924A", pos: [62, 70], movable: true },
  { id: "shipped", label: "Shipped", note: "on the way, tap to track", phases: ["shipped"], c: "#E8924A", pos: [77, 44], movable: true },
  { id: "delivered", label: "Delivered", note: "at the door", phases: ["delivered"], c: "#E8924A", pos: [92, 70], movable: true },
];
const stopFor = (it) => { const ph = phaseFromItem(it); return ph === "listed" && it.spaceId ? STOPS.find((x) => x.id === "stored") : STOPS.find((x) => x.phases.includes(ph)); };
const MOVE_TO = { intake: "intake", staged: "staged", sold: "sold", shipped: "shipped", delivered: "delivered" };

/* The roadmap tracks what you bring in through the app (Scouter). Your eBay inventory lives in Collection, Channels and Spaces. */
const app = (i) => i.source === "scouter" || i.source === "app";
const realLive = (i) => i.phase === "listed" && !i.ended && !/^(demo-|mp-)/.test(String(i.id)) && !!i.channels?.ebay?.listingId && !/^demo/.test(String(i.channels.ebay.listingId));
/* Command shows what you scout, plus every real live eBay listing (one card per listing), so nothing is in limbo. */
function mine(list) {
  const seen = new Set(), out = [];
  for (const i of list) {
    if (realLive(i)) { const k = i.channels.ebay.listingId; if (seen.has(k)) continue; seen.add(k); out.push(i); }
    else if (app(i)) out.push(i);
  }
  return out;
}
function groups() {
  const g = Object.fromEntries(STOPS.map((s) => [s.id, []]));
  for (const it of mine(items)) {
    const s = stopFor(it);
    if (s) g[s.id].push(it);
  }
  for (const o of orderItems(30)) g[o.phase].push(o);
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
const sheetIsOpen = () => !!modal || !$("#sheet").hidden;
function closeSheet() { const m = modal; modal = null; if (m) { try { Promise.resolve(m.dismiss()).finally(() => m.remove()); } catch { m.remove(); } } $("#sheet").hidden = true; $("#sheetBack").hidden = true; }
function openSheet(html) {
  if (window.customElements && customElements.get("ion-modal")) {
    if (modal) { const old = modal; modal = null; old.remove(); }
    const m = document.createElement("ion-modal"); const ph = phone();
    if (ph) { m.breakpoints = [0, 0.55, 0.94]; m.initialBreakpoint = 0.94; m.handle = true; m.handleBehavior = "cycle"; }
    m.className = "fob-sheet" + (ph ? " is-phone" : "");
    m.innerHTML = `<ion-content class="shx-c"><div class="shx"><button class="x" aria-label="Close" data-close type="button">×</button>${html}</div></ion-content>`;
    document.body.appendChild(m); modal = m;
    const gone = () => { if (modal === m) modal = null; m.remove(); };
    m.addEventListener("ionModalDidDismiss", gone); m.addEventListener("didDismiss", gone);
    const s = m.querySelector(".shx");
    s.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeSheet));
    m.present();
    return s;
  }
  const s = $("#sheet"); s.innerHTML = `<button class="x" aria-label="Close" data-close>×</button>${html}`; s.hidden = false; $("#sheetBack").hidden = false;
  s.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeSheet));
  s.scrollTop = 0;
  return s;
}
$("#sheetBack").addEventListener("click", closeSheet);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

function nextAction(ph, it) {
  if (ph === "listed" && it && it.spaceId) return `<p class="sub" style="margin-top:12px">Live on eBay and put away in its bin.</p><button class="btn" data-act="spaces" type="button">Open Spaces</button>`;
  if (ph === "listed") return `<p class="sub" style="margin-top:12px">Live on eBay. Next: put it away in its bin.</p><button class="btn go" data-act="spaces" type="button">Put it in a bin</button>`;
  if (ph === "intake") return `<p class="sub" style="margin-top:12px">Next: identify it from its photos.</p><button class="btn go" data-act="scouter" type="button">Identify it in Scouter</button>`;
  if (ph === "staged") return `<p class="sub" style="margin-top:12px">Next: build the eBay listing.</p><button class="btn go" data-act="channels" data-st="staged" type="button">Build the listing</button>`;
  if (ph === "listed") return `<p class="sub" style="margin-top:12px">Selling on eBay now.</p><button class="btn" data-act="channels" type="button">See all live listings</button>`;
  if (["sold", "packed"].includes(ph)) return `<p class="sub" style="margin-top:12px">Next: pack it and print the label in eBay.</p><a class="btn go" href="https://www.ebay.com/sh/ord" target="_blank" rel="noopener">Open eBay orders</a>`;
  return "";
}
function orderSheet(it) {
  const o = it._order, u = trackUrl(o), src = photoOf(it);
  const s = openSheet(`<a class="back" href="#" data-close>‹ Back</a>${src ? `<img src="${esc(src)}" alt="" style="width:100%;max-height:220px;object-fit:contain;border-radius:14px;background:#0f1211;margin-bottom:12px">` : ""}<h2>${esc(nameOf(it))}</h2><div class="sub">${it.phase === "sold" ? "Sold, needs shipping" : it.phase === "delivered" ? "Delivered" : "Shipped"}</div>
    ${it.phase === "sold" ? "" : trackerHtml(o)}
    <div class="row"><span>Total</span><span>${money(o.total)}</span></div><div class="row"><span>Buyer</span><span>${esc(o.buyer || "—")}</span></div><div class="row"><span>Sold</span><span>${dayText(o.createdAt) || "—"}</span></div><div class="row"><span>Carrier</span><span>${esc(o.carrier || "—")}</span></div><div class="row"><span>Tracking</span><span>${o.trackingNumber ? esc(o.trackingNumber) : "No label yet"}</span></div>
    ${u ? `<a class="btn go" href="${esc(u)}" target="_blank" rel="noopener" style="margin-top:12px">Open carrier tracking</a>` : `<a class="btn go" href="https://www.ebay.com/sh/ord" target="_blank" rel="noopener" style="margin-top:12px">Open eBay orders</a>`}`);
  s.querySelector(".back").addEventListener("click", (e) => { e.preventDefault(); closeSheet(); });
  s.querySelector("[data-ov]")?.addEventListener("click", (e) => { setOv(o.orderId, e.currentTarget.dataset.ov); closeSheet(); render(); toast(e.currentTarget.dataset.ov === "delivered" ? "Moved to Delivered" : "Moved back to Shipped"); });
}
function itemSheet(id) {
  if (String(id).startsWith("ord-")) { const o = orderItems(30).find((x) => x.id === String(id)); if (o) orderSheet(o); return; }
  const it = items.find((i) => String(i.id) === String(id)); if (!it) return;
  const src = photoOf(it); const ph = phaseFromItem(it); const st = stopFor(it);
  const s = openSheet(`
    <a class="back" href="#" data-close>‹ Back</a>
    ${src ? `<img id="sheetMain" src="${esc(src)}" alt="" style="width:100%;height:300px;object-fit:contain;border-radius:20px;background:#0f1211;margin-bottom:14px;box-shadow:0 14px 34px rgba(0,0,0,.5)">` : ""}
<div class="it-info">
    <h2>${esc(nameOf(it))}</h2>
    <div class="sub">${st ? esc(st.label) : ph === "ended" ? "Ended on eBay" : ""}</div>
    <div class="row"><span>Price</span><span>${money(it.price)}</span></div>
    <div class="row"><span>Quantity</span><span>${Number(it.quantity) || 1}</span></div>
    ${it.purchasePrice ? `<div class="row"><span>You paid</span><span>${money(it.purchasePrice)}</span></div>` : ""}
    ${nextAction(ph, it)}
</div>
    <div id="phMgr" style="margin-top:18px"></div>${(() => { const g = groups()[st && st.id] || []; const others = g.filter((x) => String(x.id) !== String(it.id)).slice(0, 24); return others.length ? `<div class="ph-head" style="margin-top:6px"><b>Also in ${esc(st.label)}</b><span>${g.length} total</span></div><div class="ph-row">${others.map((x) => { const p = photoOf(x); return `<button type="button" class="sib" data-sib="${esc(x.id)}">${p ? `<img src="${esc(p)}" alt="" loading="lazy">` : `<i>${esc(nameOf(x).charAt(0))}</i>`}<span>${esc(nameOf(x))}</span></button>`; }).join("")}</div>` : ""; })()}

    ${String(it.id).startsWith("ebay-") ? "" : `<button class="btn warn" data-del type="button" style="margin-top:14px">Delete this item</button>`}`);
  s.querySelector(".back").addEventListener("click", (e) => { e.preventDefault(); closeSheet(); });
  photoManager(s.querySelector("#phMgr"), it.id, { toast, refresh: () => { items = loadItems(); renderStats(); const m = s.querySelector("#sheetMain"); const c = items.find((i) => String(i.id) === String(id)); if (m && c) m.src = photoOf(c); } });
  s.querySelectorAll("[data-sib]").forEach((b) => b.addEventListener("click", () => itemSheet(b.dataset.sib)));
  s.querySelector("[data-del]")?.addEventListener("click", () => { const prev = items.slice(); items = items.filter((i) => String(i.id) !== String(id)); saveItems(items); closeSheet(); render(); toastUndo(`Deleted ${nameOf(it)}`, () => { items = prev; saveItems(prev); render(); }); });
  s.querySelector("[data-act]")?.addEventListener("click", (e) => { const a = e.currentTarget.dataset.act; if (a === "scouter") go("scouter"); else if (a === "spaces") { closeSheet(); go("spaces"); } else if (a === "channels") { window.__chStage = e.currentTarget.dataset.st || "listed"; if (e.currentTarget.dataset.st === "staged") { closeSheet(); buildListing(id, chApi()); } else go("channels"); } });
}
function chApi() { return { toast, toastUndo, openSheet, closeSheet, refresh: () => { items = loadItems(); renderStats(); }, rerender: () => render() }; }
function stageSheet(sid) {
  const stop = STOPS.find((x) => x.id === sid); const list = groups()[sid];
  const cap = 60;
  const s = openSheet(`
    <a class="back" href="#" data-close>‹ Back</a>
    <h2>${esc(stop.label)}</h2><div class="sub">${list.length} ${list.length === 1 ? "item" : "items"} · ${esc(stop.note)}</div>
    ${list.length ? `<div class="grid">${list.slice(0, cap).map((it) => { const src = photoOf(it); return `<button class="tile" data-item="${esc(it.id)}">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : `<div class="tini">${esc(nameOf(it).replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "?")}</div>`}<span class="cap">${esc(nameOf(it))}</span></button>`; }).join("")}</div>${list.length > cap ? `<p class="sub" style="margin-top:12px">Showing ${cap} of ${list.length}.</p>` : ""}${sid === "staged" ? `<button class="btn go" id="varAll" type="button" style="margin-top:12px">List several as one variation listing</button>` : sid === "intake" ? "" : `<button class="btn go" id="seeAll" type="button" style="margin-top:12px">Open ${esc(stop.label)} in Channels</button>`}` : `<p class="sub">Nothing here yet.</p>`}`);
  s.querySelector(".back").addEventListener("click", (e) => { e.preventDefault(); closeSheet(); });
  s.querySelectorAll("[data-item]").forEach((b) => b.addEventListener("click", () => itemSheet(b.dataset.item)));
  s.querySelector("#varAll")?.addEventListener("click", () => { closeSheet(); variationListing(chApi()); });
  s.querySelector("#seeAll")?.addEventListener("click", () => { window.__chStage = ({ intake: "intake", staged: "staged", listed: "listed", sold: "sold", shipped: "shipped", delivered: "delivered" })[sid] || "all"; go("channels"); });
}

/* ---------- header ---------- */
function renderStats() {
  const g = groups();
  const open = mine(items).filter((i) => !["ended", "sold", "packed", "shipped", "delivered"].includes(phaseFromItem(i)));
  const value = open.reduce((a, i) => a + worth(i), 0);
  $("#stats").innerHTML = [[money(value), "Total value in progress"], [g.intake.length + g.staged.length, "Items need action"], [g.listed.length + g.stored.length, "Live on eBay"]]
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
function pileHtml(list, cls, emptyMsg) {
  if (!list.length) return emptyMsg ? `<button type="button" class="empty ${cls}" data-goto="scouter" style="font:inherit;color:inherit;cursor:pointer">${esc(emptyMsg)}</button>` : `<div class="empty ${cls}">Nothing here yet</div>`;
  const top = list[0]; const src = photoOf(top);
  const face = (it, k) => { const p = photoOf(it); return `<div class="pc ${k === "" ? "k-tilt" : k}" ${k === "" ? `data-item="${esc(it.id)}"` : ""}>${p ? `<img src="${esc(p)}" alt="" draggable="false">` : `<div class="ini">${esc(nameOf(it).charAt(0).toUpperCase())}</div>`}${k === "" ? `<span class="cap"><span>${esc(nameOf(it))}</span><em>${money(worth(it))}</em></span>` : ""}</div>`; };
  return `<div class="pile ${cls}">${list[2] ? face(list[2], "b2") : ""}${list[1] ? face(list[1], "b1") : ""}${face(top, "")}${list.length > 1 ? `<span class="more" data-stage="${""}">+${list.length - 1} more</span>` : ""}</div>`;
}
function renderCommand() {
  const g = groups(); const main = $("#main");
  const pills = [
    [g.intake.length, "Identify new photos", "scouter"],
    [g.staged.length, "Build and publish", "channels", "staged"],
    [g.sold.length, "Pack and ship", "channels", "sold"],
  ].map(([n, t, v, st]) => `<button class="pill" data-goto="${v}" ${st ? `data-pst="${st}"` : ""}><b>${n}</b>${t}</button>`).join("");
  if (phone()) {
    main.style.overflowY = "auto"; main.style.overflowX = "hidden";
    const open = mine(items).filter((i) => !["ended", "sold", "packed", "shipped", "delivered"].includes(phaseFromItem(i)));
    const value = open.reduce((a, i) => a + worth(i), 0);
    const need = g.intake.length + g.staged.length, live = g.listed.length + g.stored.length;
    const acts = [[g.intake.length, "Identify", "new photos", "scouter"], [g.staged.length, "Build", "and publish", "channels", "staged"], [g.sold.length, "Pack", "and ship", "channels", "sold"]]
      .map(([n, t, u, v, st]) => `<button type="button" class="cm-act${n ? " hot" : ""}" data-goto="${v}" ${st ? `data-pst="${st}"` : ""}><b>${n}</b><span>${t}</span><small>${u}</small></button>`).join("");
    const rows = STOPS.map((s, i) => { const l = g[s.id]; const th = l.slice(0, 4).map((it) => { const p = photoOf(it); return `<i class="cm-th">${p ? `<img src="${esc(p)}" alt="" loading="lazy" draggable="false">` : esc(nameOf(it).charAt(0).toUpperCase())}</i>`; }).join("");
      return `<button type="button" class="cm-row${l.length ? " has" : ""}" data-stage="${s.id}" style="--c:${s.c}" aria-label="${esc(s.label)}, ${l.length} items"><i class="cm-dot"></i><span class="cm-t"><em>Step ${i + 1} of ${STOPS.length}</em><b>${esc(s.label)}</b><small>${esc(s.note)}</small></span><span class="cm-stack">${th}${l.length > 4 ? `<i class="cm-th cm-more">+${l.length - 4}</i>` : ""}</span><span class="cm-n">${l.length}</span></button>`; }).join("");
    main.innerHTML = `<div class="cm"><section class="cm-hero"><span class="cm-k">Total value in progress</span><b class="cm-big">${money(value)}</b><div class="cm-two"><div><b>${need}</b><span>Need action</span></div><div><b>${live}</b><span>Live on eBay</span></div></div></section>
      <div class="cm-acts">${acts}</div><h3 class="cm-h">Your line</h3><div class="cm-rail">${rows}</div></div>`;
  } else {
    main.style.overflowY = "hidden"; main.style.overflowX = "";
    const W = Math.max(600, main.clientWidth || 1000), H = Math.max(420, main.clientHeight || 600);
    const pts = STOPS.map((s) => [s.pos[0] / 100 * W, s.pos[1] / 100 * H]);
    let path = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], m = (x0 + x1) / 2; path += ` C${m},${y0} ${m},${y1} ${x1},${y1}`; }
    main.innerHTML = `<div class="road"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="rg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="0"><stop offset="0" stop-color="#50B97E"/><stop offset=".55" stop-color="#B3FBD5"/><stop offset="1" stop-color="#E8924A"/></linearGradient></defs>
      <path d="${path}" fill="none" stroke="#90FFCC" stroke-opacity=".45" stroke-width="16" stroke-linecap="round" style="filter:blur(9px)"/>
      <path d="${path}" fill="none" stroke="url(#rg)" stroke-width="4" stroke-linecap="round"/>
      <path class="flow" d="${path}" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 34"/>
      ${[0, 1, 2, 3].map((k) => `<circle r="7" fill="#B3FBD5" style="filter:drop-shadow(0 0 9px #90FFCC)"><animateMotion dur="14s" begin="${k * 3.5}s" repeatCount="indefinite" path="${path}"/></circle>`).join("")}</svg>
      ${STOPS.map((s) => `<div class="stop" data-drop="${s.id}" style="left:${s.pos[0]}%;top:${s.pos[1]}%;--c:${s.c}">
        ${pileHtml(g[s.id], "up", s.id === "intake" ? "Start here: tap to add photos" : "")}<div class="dot" data-stage="${s.id}" role="button" tabindex="0" aria-label="${s.label}, ${g[s.id].length} items"></div>
        <div class="tag" data-stage="${s.id}"><em class="stepn">Step ${STOPS.indexOf(s) + 1} of ${STOPS.length}</em><span>${s.label}</span><small><b>${g[s.id].length}</b> item${g[s.id].length === 1 ? "" : "s"} · ${s.note}</small></div></div>`).join("")}
      <div class="flag start" style="left:${STOPS[0].pos[0] - 6}%;top:${STOPS[0].pos[1] - 1}%"><i></i>Start</div><div class="flag end" style="left:${STOPS[STOPS.length - 1].pos[0] - 2}%;top:${STOPS[STOPS.length - 1].pos[1] + 12}%"><i></i>Done</div>
      <div class="dock">${pills}</div><div class="hint">Tap a stop to open it · hold a card and drop it on a stop to move it</div></div>`;
  }
  // wire up
  main.querySelectorAll(".pc.b1,.pc.b2").forEach((m) => { m.dataset.stage = m.closest(".stop").dataset.drop; m.style.cursor = "pointer"; });
  main.querySelectorAll(".more").forEach((m) => { const st = m.closest(".stop"); m.dataset.stage = st.dataset.drop; });
  main.querySelectorAll("[data-stage]").forEach((el) => el.addEventListener("click", () => stageSheet(el.dataset.stage)));
  main.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => { if (b.dataset.pst) window.__chStage = b.dataset.pst; go(b.dataset.goto); }));
  main.querySelectorAll(".stop .dot").forEach((d) => d.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); stageSheet(d.dataset.stage); } }));
  main.querySelectorAll(".pc[data-item]").forEach(bindDrag);
}
function bindDrag(el) {
  let ghost = null, sx = 0, sy = 0, moved = false, over = null, down = false;
  el.addEventListener("pointerdown", (e) => { down = true; moved = false; sx = e.clientX; sy = e.clientY; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointermove", (e) => {
    if (!down) return;
    if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) < 8) return;
    if (!moved) { moved = true; ghost = el.cloneNode(true); ghost.className = "pc ghost"; document.body.appendChild(ghost); el.style.opacity = ".3"; }
    ghost.style.left = e.clientX + "px"; ghost.style.top = e.clientY + "px";
    const hit = document.elementsFromPoint(e.clientX, e.clientY).map((n) => n.closest && n.closest(".stop")).find(Boolean);
    if (over && over !== hit) over.classList.remove("drop"); over = hit || null; if (over) over.classList.add("drop");
  });
  const end = (e) => {
    if (!down) return; down = false;
    try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!moved) { itemSheet(el.dataset.item); return; }
    const target = over && over.dataset.drop; if (over) over.classList.remove("drop"); if (ghost) ghost.remove(); el.style.opacity = "";
    if (!target) return;
    const it = items.find((i) => String(i.id) === String(el.dataset.item)); if (!it) return;
    if (String(el.dataset.item).startsWith("ord-")) { toast("Orders come from eBay. Open it to see tracking."); return; }
    if (target === "listed" && it.phase === "staged") { if (it.channels?.ebay?.listingId) { it.phase = "listed"; saveItems(items); toast("Moved to Live on eBay"); render(); } else buildListing(it.id, chApi()); return; }
    if (!MOVE_TO[target]) { toast(target === "stored" ? "Open Spaces to put it in a bin." : "Use Build and publish to put an item live on eBay."); return; }
    it.phase = MOVE_TO[target]; saveItems(items); toast(`Moved to ${STOPS.find((s) => s.id === target).label}`); render();
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", () => { down = false; moved = false; if (ghost) ghost.remove(); ghost = null; if (over) over.classList.remove("drop"); over = null; el.style.opacity = ""; });
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
function go_(v) {
  view = v; closeSheet();
  document.querySelectorAll("#nav button").forEach((b) => { b.classList.toggle("on", b.dataset.view === v); if (b.dataset.view === v) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  try { history.replaceState(null, "", v === "command" ? "./" : `#${v}`); } catch { /* ignore */ }
  render();
}
/* Background updates (sync, other tab) must never move you: no re-render while you're in a sheet, card, bin or the Scouter, and scroll is kept. */
let sig = "";
const sigOf = (l) => (localStorage.getItem("coalition-orders-v1") || "").length + "|" + (localStorage.getItem("coalition-order-state-v1") || "") + "|" + l.length + ":" + l.reduce((m, i) => (i.updatedAt > m ? i.updatedAt : m), "");
function softRender() {
  purgeDemo();
  const l = loadItems(), n = sigOf(l); items = l; renderStats();
  if (n === sig) return; sig = n;
  if (sheetIsOpen() || document.querySelector(".k-zoom") || document.querySelector(".ghost")) return;
  if (view === "scouter" || view === "settings" || view === "spaces") return;
  const m = $("#main"), y = m.scrollTop; render(); m.scrollTop = y;
}
function render() {
  purgeDemo(); items = loadItems(); renderStats(); sig = sigOf(items);
  if (view === "command") renderCommand(); else if (view === "settings") renderSettings($("#main")); else if (view === "scouter") { $("#main").style.overflowY = "auto"; if (!$("#main .sc-wrap")) renderScouter($("#main"), { build: (id) => buildListing(id, chApi()), getItems: loadItems, setItems: (l) => { saveItems(l); items = l; renderStats(); }, toast, toastUndo, go }); } else if (view === "collection" || view === "spaces" || view === "channels") { $("#main").style.overflowY = "auto"; const sel = view === "collection" ? ".co-wrap" : ".sp-wrap"; $("#main").innerHTML = ""; (view === "collection" ? renderCollection : view === "channels" ? renderChannels : renderSpaces)($("#main"), { toast, toastUndo, openSheet, closeSheet, refresh: () => { items = loadItems(); renderStats(); } }); } else renderCommand();
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
      if (ords.length || ob.ok) saveOrders(ords);
      for (const ord of ords) for (const li of ord.items || []) { if (li.sku) bySku.set(li.sku, ord.status === "label_created" ? "sold" : "shipped"); }
    }
  } catch { /* orders optional */ }
  return bySku;
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
    const list = loadItems(); const all = pulled.rows; const rows = all.filter((r) => r.offerKnown !== false);
    for (const r of rows) {
      const sku = r.channels?.ebay?.sku || r.sku; if (!sku) continue; if (HIDDEN.has(r.id || `ebay-${sku}`)) continue;
      const idx = list.findIndex((i) => i.channels?.ebay?.sku === sku || (r.id && i.id === r.id));
      const live = r.channels.ebay.listingId ? "listed" : "draft";
      const photos = (r.photos || []).filter((p) => p.dataUrl || p.url).map((p) => ({ id: p.id, dataUrl: p.dataUrl || p.url }));
      if (!photos.length && r.imageUrl) photos.push({ id: `img-${sku}`, dataUrl: r.imageUrl });
      const mapped = { id: r.id || `ebay-${sku}`, title: r.title || r.productName, productName: r.productName || r.title, sku, quantity: r.quantity || 1, price: r.price,
        phase: r.phase || (live === "listed" ? "listed" : "staged"), ended: Boolean(r.ended), listingStatus: r.ended ? "draft" : live, staged: false, spaceId: r.spaceId || null, channels: r.channels, photos, groupImage: r.groupImage || null, groupTitle: r.groupTitle || null };
      if (idx >= 0) { const keep = list[idx]; list[idx] = { ...keep, ...mapped, spaceId: keep.spaceId || mapped.spaceId, photos: (keep.photos?.length ? keep.photos : mapped.photos) };
        { const u = list[idx]; const eb = (r.imageUrls || []).filter((x) => /^https:/.test(x)); if (!u.photosDirty && live === "listed" && eb.length && eb.length === (u.photos || []).length && (u.photos || []).some((p) => String(p.dataUrl || "").startsWith("data:"))) u.photos = eb.map((x, k) => ({ id: `eb-${k}`, dataUrl: x })); } }
      else list.unshift(mapped);
    }
    if (!body.partial && !body.truncated && rows.length) {
      const seen = new Set(rows.map((r) => r.channels?.ebay?.sku || r.sku).filter(Boolean));
      for (const it of list) { const sku = it.channels?.ebay?.sku; if (sku && !seen.has(sku) && !it.ended && !DONE.includes(it.phase)) it.ended = true; }
    }
    const bySku = await ordersP;
    for (const it of list) { if (!(it.source === "scouter" || it.source === "app")) continue; const hit = bySku.get(it.sku || it.channels?.ebay?.sku); if (hit && it.phase !== hit && ["listed", "staged", "intake", "sold", "packed"].includes(it.phase)) { it.phase = hit; it.ended = false; } }
    saveItems(list); items = list; softRender();
    const nLive = list.filter((i) => phaseFromItem(i) === "listed").length, nSold = list.filter((i) => DONE.includes(i.phase)).length, nEnd = list.filter((i) => i.ended && !DONE.includes(i.phase)).length;
    setLink(true); toast(pulled.complete ? `Synced: ${nLive} live, ${nSold} sold, ${orderItems().length} orders` : `Synced ${rows.length} of ${pulled.total}. ${pulled.total - rows.length} couldn't be checked. Tap Sync again.`);
  } catch { toast(auto ? "Showing saved data." : "eBay sync failed. Try again."); }
  finally { btn.classList.remove("busy"); btn.textContent = "Sync"; }
}
$("#syncBtn").addEventListener("click", () => syncAll(false));
initKit(); initAvatar();
const h = (location.hash || "").slice(1);
go(["scouter", "collection", "channels", "spaces", "settings"].includes(h) ? h : "command");
initSync(() => softRender());
syncAll(true);
