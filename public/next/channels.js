import { esc, money, nameOf, photoOf, laneOf, gameOf, peekItems, loadItems, saveItems, loadSpaces, assign, archMap, isArchived, archive, unarchive } from "./shared.js?v=7";
import { photoManager } from "./photos.js?v=5";
import { openCard, ringGauge, sparkBars, shelf, svCard } from "./kit.js?v=9";
import { orderItems, trackUrl, whenLabel, dayText, trackerHtml, setOv, hideIds, track } from "./orders.js?v=9";

let ctx = null;
const S = { stage: "listed", view: "cards", group: "game", q: "", sort: "value", sel: new Set(), more: {}, closed: new Set(), drawer: false };
/* Stage selector follows the Command roadmap: same stops, same order, same colors. */
const STAGES = [
  ["listed", "Live on eBay", "#90FFEE"],
  ["sold", "Sold", "#E8924A"],
  ["shipped", "Shipped", "#E8924A"],
  ["delivered", "Delivered", "#E8924A"],
];
const SOLD = ["sold", "packed", "shipped", "delivered"];
const SHOWN = (it) => !(["intake", "staged"].includes(it.phase || "intake") && !(it.source === "scouter" || it.source === "app"));
const shown = () => peekItems().filter(SHOWN);
/* One row per eBay listing: variation children share a listing id, so they collapse into one card. */
let GROUP = new Map();
let _liveSrc = null, _liveOut = null, _liveGrp = null, _liveAk = null;
function live() {
  const src = peekItems(), ak = archMap(); if (src === _liveSrc && ak === _liveAk && _liveOut) { GROUP = _liveGrp; return _liveOut; }
  const out = [], seen = new Map(); GROUP = new Map();
  for (const it of shown()) {
    if (it.ended || SOLD.includes(it.phase) || /^(demo-|mp-)/.test(String(it.id)) || isArchived(it.id)) continue;
    const lid = it.phase === "listed" && it.channels?.ebay?.listingId;
    if (it.phase === "listed" && (!lid || /^demo/.test(lid))) continue; /* "Live on eBay" = has a real eBay listing id, nothing else */
    if (lid && !/^demo/.test(lid)) { const g = seen.get(lid); if (g) { g._kids.push(it); continue; } const rep = Object.assign({}, it, { _kids: [it] }); seen.set(lid, rep); out.push(rep); } else out.push(it);
  }
  for (const r of out) if (r._kids) { r._n = r._kids.length; if (r._n > 1) { const gi = r._kids.find((k) => k.groupImage), gt = r._kids.find((k) => k.groupTitle); if (gi) r.photos = [{ id: "grp-cover", dataUrl: gi.groupImage }]; if (gt) r.title = gt.groupTitle; } GROUP.set(String(r.id), r._kids.map((k) => String(k.id))); if (r._n > 1) { const ps = r._kids.map((k) => Number(k.price) || 0); r._lo = Math.min(...ps); r._hi = Math.max(...ps); r.quantity = r._kids.reduce((a, k) => a + (Number(k.quantity) || 1), 0); } }
  _liveSrc = src; _liveAk = ak; _liveOut = out; _liveGrp = GROUP;
  return out;
}
const pool = (stage) => ["sold", "shipped", "delivered"].includes(stage) ? orderItems().filter((o) => o.phase === stage) : live().filter((i) => stageOf(i) === stage);
const valOf = (it) => it._kids ? it._kids.reduce((a, k) => a + (Number(k.price) || 0) * (Number(k.quantity) || 1), 0) : (Number(it.price) || 0) * (Number(it.quantity) || 1);
const ptxt = (it) => it._n > 1 ? `${money(it._lo)}${it._hi > it._lo ? "–" + money(it._hi) : ""}` : money(it.price);
const badge = (it) => it._order ? (it.phase === "sold" ? "Needs shipping" : ["Label made", "Shipped", "In transit", "Out for delivery", "Delivered"][track(it._order).step]) : it._n > 1 ? `${it._n} variations` : "";
const expand = (ids) => ids.flatMap((i) => GROUP.get(String(i)) || [i]);
const stageOf = (it) => it._order ? it.phase : (it.phase || "intake");
const STAGE_LABEL = { listed: "Live on eBay", staged: "Ready to list", intake: "Intake", sold: "Sold", shipped: "Shipped", delivered: "Delivered" };
const keyOf = (it) => it._order ? whenLabel(it.when) : S.group === "stage" ? STAGE_LABEL[stageOf(it)] || "Other" : S.group === "game" ? gameOf(it) : S.group === "bin" ? (loadSpaces().find((s) => s.id === it.spaceId)?.name || "Not filed yet") : S.group === "type" ? (laneOf(it) === "sealed" ? "Sealed" : "Singles") : "All items";

function rows() {
  const q = S.q.trim().toLowerCase();
  const list = pool(S.stage).filter((it) => !q || nameOf(it).toLowerCase().includes(q) || String(it.sku || "").toLowerCase().includes(q) || String(it._order?.trackingNumber || "").includes(q) || String(it._order?.buyer || "").toLowerCase().includes(q));
  if (["sold", "shipped", "delivered"].includes(S.stage)) return list;
  return list.sort((a, b) => S.sort === "name" ? nameOf(a).localeCompare(nameOf(b)) : S.sort === "low" ? (Number(a.price) || 0) - (Number(b.price) || 0) : (Number(b.price) || 0) - (Number(a.price) || 0));
}
function tile(it) {
  const src = photoOf(it), on = S.sel.has(String(it.id));
  if (S.view === "list") return `<label class="sp-row ch-row${on ? " on" : ""}" data-id="${esc(it.id)}"><input type="checkbox" data-id="${esc(it.id)}" ${on ? "checked" : ""}>${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : "<i></i>"}<span>${esc(nameOf(it))}</span><em>${esc(STAGE_LABEL[stageOf(it)] || "")}</em><b>${ptxt(it)}</b><small>x${Number(it.quantity) || 1}</small></label>`;
  if (S.view === "rows") {
    const sub = it._order ? [it._order.buyer ? `Buyer ${it._order.buyer}` : "", dt(it.when)].filter(Boolean).join(" · ") : it._n > 1 ? `${it._n} cards in one listing` : [it.setName, it.sku].filter(Boolean).join(" · ") || "Live on eBay";
    return `<article class="co-card ch-tile rows${on ? " sel" : ""}" data-id="${esc(it.id)}" tabindex="0"><i class="co-pick${on ? " on" : ""}" data-pick="${esc(it.id)}" role="checkbox" aria-checked="${on}" aria-label="Select">${on ? "✓" : ""}</i><div class="co-img">${src ? `<img src="${esc(src)}" alt="" loading="lazy" draggable="false">` : `<span class="co-ini">${esc(nameOf(it).charAt(0))}</span>`}</div>
      <div class="chr-mid"><b>${esc(nameOf(it))}</b><span>${esc(sub)}</span>${badge(it) ? `<i class="chr-chip">${esc(badge(it))}</i>` : ""}</div>
      <div class="chr-end"><b>${ptxt(it)}</b>${!it._order && (Number(it.quantity) || 1) > 1 ? `<span>${Number(it.quantity)} in stock</span>` : ""}</div></article>`;
  }
  return `<article class="co-card ch-tile k-tilt ${S.view}${on ? " sel" : ""}" data-id="${esc(it.id)}" tabindex="0"><div class="co-art"><div class="co-img">${src ? `<img src="${esc(src)}" alt="" loading="lazy" draggable="false">` : `<span class="co-ini">${esc(nameOf(it).charAt(0))}</span>`}<i class="co-sheen"></i></div>${badge(it) ? `<i class="ch-badge">${esc(badge(it))}</i>` : ""}<i class="co-pick${on ? " on" : ""}" data-pick="${esc(it.id)}">${on ? "✓" : ""}</i></div>${S.view === "cards" ? `<div class="co-cap"><span>${esc(nameOf(it))}</span><b>${ptxt(it)}</b></div>` : `<div class="ch-price">${ptxt(it)}</div>`}</article>`;
}
function routeHtml(counts) {
  /* Pipeline reticle: one ring, each arc = how much of your stock sits in that stage. The lit arc is the stage you're viewing. */
  const tot = STAGES.reduce((a, [k]) => a + (counts[k] || 0), 0) || 1, C = 2 * Math.PI * 46, gap = 5;
  let at = 0;
  const share = STAGES.map(([k]) => Math.max(.07, (counts[k] || 0) / tot)), sum = share.reduce((a, b) => a + b, 0);
  const arcs = STAGES.map(([k, l, c], i) => { const len = share[i] / sum * C - gap, off = -at; at += share[i] / sum * C;
    return `<circle class="chs-arc${S.stage === k ? " on" : ""}" cx="60" cy="60" r="46" style="--c:${c}" stroke-dasharray="${len.toFixed(1)} ${(C - len).toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>`; }).join("");
  const cur = STAGES.find(([k]) => k === S.stage) || STAGES[0];
  return `<div class="ch-route chs-tiles chs-ret" role="group" aria-label="Stage">
    <div class="chs-dial" aria-hidden="true"><svg viewBox="0 0 120 120"><circle class="chs-tick" cx="60" cy="60" r="56"/><g transform="rotate(-90 60 60)">${arcs}</g><circle class="chs-spin" cx="60" cy="60" r="36"/></svg>
      <div class="chs-core" style="--c:${cur[2]}"><b>${counts[cur[0]] || 0}</b><span>${cur[1]}</span></div></div>
    <div class="chs-list">${STAGES.map(([k, l, c]) => `<button class="ch-stop${S.stage === k ? " on" : ""}" data-stage="${k}" type="button" style="--c:${c}"><em>${counts[k]}</em><span>${l}</span></button>`).join("")}</div></div>`;
}
function drawerHtml() {
  if (!S.drawer) return "";
  if (!S.list) return `<div class="ch-drawer"><div class="ch-drow"><span>Bulk edit</span><button class="btn" id="chAll" type="button">Select everything shown</button></div><p class="ch-dhint">Or tap the circle on each listing you want. Then change the price or end them together.</p></div>`;
  return `<div class="ch-drawer">
    <div class="ch-drow"><span>View</span><div class="seg" role="group" aria-label="View">${[["rows", "List"], ["cards", "Cards"], ["grid", "Grid"]].map(([k, l]) => `<button class="${S.view === k ? "on" : ""}" data-view="${k}" type="button">${l}</button>`).join("")}</div></div>
    <div class="ch-drow"><span>Group by</span><select id="chGroup" aria-label="Group by">${[["game", "Game"], ["stage", "Stage"], ["type", "Sealed / Singles"], ["bin", "Bin"], ["none", "Nothing"]].map(([k, l]) => `<option value="${k}"${S.group === k ? " selected" : ""}>${l}</option>`).join("")}</select></div>
    <div class="ch-drow"><span>Sort</span><select id="chSort" aria-label="Sort"><option value="value"${S.sort === "value" ? " selected" : ""}>Highest price</option><option value="low"${S.sort === "low" ? " selected" : ""}>Lowest price</option><option value="name"${S.sort === "name" ? " selected" : ""}>A to Z</option></select></div>
    <div class="ch-drow"><span>Select</span><button class="btn" id="chAll" type="button">Select everything shown</button></div>
  </div>`;
}
/* ---------- the deck: stage tabs, then a hologram carousel of this stage's listings with the centered one target-locked ---------- */
const daysSince = (d) => { const t = Date.parse(d || ""); return t ? Math.max(0, Math.floor((Date.now() - t) / 864e5)) : null; };
function lockData(it) {
  if (!it) return { l: "", r: "" };
  const R = (k, v, cls = "") => v === "" || v == null ? "" : `<div class="lk-r ${cls}"><em>${esc(k)}</em><b>${v}</b></div>`;
  if (it._order) { const o = it._order, d = daysSince(o.createdAt);
    return { l: `${R("Sold for", money(o.total ?? it.price), "money")}${R("Buyer", esc(o.buyer || "—"))}`, r: `${R("Status", esc(badge(it)), "hot")}${R("Sold", d == null ? "—" : d === 0 ? "Today" : d + "d ago")}` }; }
  const d = daysSince(it.channels?.ebay?.listedAt || it.createdAt), sp = loadSpaces().find((x) => x.id === it.spaceId);
  return { l: `${R("Price", ptxt(it), "money")}${R("Qty", String(it._n > 1 ? it._n + " var." : Number(it.quantity) || 1))}`, r: `${R("Live", d == null ? "—" : d + "d")}${R("Bin", esc(sp ? sp.name : "None"))}` };
}
function deckHtml(all, total, counts) {
  const cur = STAGES.find(([k]) => k === S.stage) || STAGES[0], flow = all.slice(0, 16);
  const tabs = STAGES.map(([k, l, c]) => `<button class="cd-tab ch-stop${S.stage === k ? " on" : ""}" data-stage="${k}" type="button" role="tab" aria-selected="${S.stage === k}" style="--c:${c}"><b>${counts[k] || 0}</b><span>${({ listed: "Live" })[k] || l}</span></button>`).join("");
  const cards = flow.map((it, i) => { const src = photoOf(it); return `<button type="button" class="cd-c" data-cd="${i}" data-id="${esc(it.id)}" aria-label="${esc(nameOf(it))}">${src ? `<img src="${esc(src)}" alt="" loading="lazy" draggable="false">` : `<span>${esc(nameOf(it).charAt(0))}</span>`}</button>`; }).join("");
  const ld = lockData(flow[0]);
  return `<div class="cd${["sold", "shipped", "delivered"].includes(S.stage) ? " hot" : ""}">
    <div class="cd-tabs hscroll" role="tablist" aria-label="Stage">${tabs}</div>
    <div class="cd-sum"><b>${money(total)}</b><span>${all.length} ${["sold", "shipped", "delivered"].includes(S.stage) ? "order" : "listing"}${all.length === 1 ? "" : "s"}</span>${["sold", "shipped", "delivered"].includes(S.stage) && all.length ? `<button class="btn" id="chArchAll" type="button">Archive all</button>` : ""}</div>
    ${holoWall(all, { info: wallInfo })}</div>`;
}
/* ---------- Oct 25 rebuild: instrument header, stage route, shelves ---------- */
function weekSales() { const now = Date.now(), wk = new Array(8).fill(0); for (const o of orderItems(60)) { const t = Date.parse(o._order?.createdAt || o.when || 0); if (!t) continue; const k = 7 - Math.floor((now - t) / (7 * 864e5)); if (k >= 0 && k < 8) wk[k] += Number(o._order?.total ?? o.price) || 0; } return wk; }
function instrumentHtml(all, total, counts) {
  const orders = ["sold", "shipped", "delivered"].includes(S.stage), wk = weekSales(), live = counts.listed || 0;
  const stale = orders ? 0 : all.filter((it) => (daysSince(it.channels?.ebay?.listedAt || it.createdAt) || 0) > 45).length;
  const g = orders ? ringGauge(all.length, all.length ? 1 : 0, S.stage === "sold" ? "to ship" : S.stage === "shipped" ? "moving" : "done", true) : ringGauge(live, live ? Math.min(1, (live - stale) / live) : 0, "live");
  return `<div class="ix${orders ? " hot" : ""}">${g}<div class="ix-v"><em>${orders ? ({ sold: "Sold, needs shipping", shipped: "On the way", delivered: "Delivered" })[S.stage] : "Listed on eBay"}</em><b>${money(total)}</b><span>${orders ? `${all.length} order${all.length === 1 ? "" : "s"}` : stale ? `<i class="hot">${stale} sitting 45+ days</i>` : "all fresh"}</span></div>${orders && all.length ? `<button class="btn ix-arch" id="chArchAll" type="button">Archive all</button>` : wk.some((x) => x > 0) ? sparkBars(wk, "sales, 8 wks") : ""}</div>`;
}
function stageRouteHtml(counts) {
  const pos = [8, 36, 64, 92];
  return `<div class="sr" role="tablist" aria-label="Stage"><svg class="sr-l" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><path d="M8 5 H92"/><path class="lit" d="M8 5 H${pos[Math.max(0, STAGES.findIndex(([k]) => k === S.stage))]}"/></svg>
    ${STAGES.map(([k, l, c], i) => `<button type="button" role="tab" aria-selected="${S.stage === k}" class="sr-n ch-stop${S.stage === k ? " on" : ""}" data-stage="${k}" style="left:${pos[i]}%;--c:${c}"><b>${counts[k] || 0}</b><i></i><span>${({ listed: "Live" })[k] || l}</span></button>`).join("")}</div>`;
}
function orderSub(it) { const st = track(it._order).step, n = it.phase === "sold" ? 0 : Math.max(1, st + 1); return `<span class="sv-trk">${[0, 1, 2, 3].map((k) => `<i${k < n ? ' class="on"' : ""}></i>`).join("")}</span>${esc(badge(it))}`; }
function shelvesHtml(groups) {
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, list]) => {
    const val = list.reduce((a, i) => a + (i._order ? Number(i.price) || 0 : valOf(i)), 0);
    const cards = list.slice(0, 16).map((it) => { if (it._order) return svCard(it, { price: money(it._order.total ?? it.price), sub: orderSub(it), photo: photoOf(it) });
      const d = daysSince(it.channels?.ebay?.listedAt || it.createdAt); return svCard(it, { price: ptxt(it), photo: photoOf(it), chip: d != null && d > 45 ? `${d}d` : it._n > 1 ? `${it._n} var.` : "", chipHot: d != null && d > 45 }); }).join("");
    return shelf(k, `${list.length} · ${money(val)}${list.length > 16 ? ` · <button type="button" class="sv-all" data-allgrp="${esc(k)}">See all</button>` : ""}`, cards, k);
  }).join("");
}
/* ===================== Channels = the selling desk (Oct 25) ===================== */
const DESK_TABS = [["listed", "Live"], ["sold", "To ship"], ["shipped", "Shipped"], ["delivered", "Delivered"]];
function deskTop(all, total, counts) {
  const orders = ["sold", "shipped", "delivered"].includes(S.stage);
  const stale = orders ? [] : pool("listed").filter((it) => (daysSince(it.channels?.ebay?.listedAt || it.createdAt) || 0) > 45);
  const wk = weekSales(), wkNow = wk[7], wkSum = wk.reduce((a, b) => a + b, 0);
  return `<header class="dk-top"><div class="dk-id"><img src="img/icon.jpg" alt=""><div><b>eBay</b><span>CornDogSmuggler Coalition · ${counts.listed || 0} live</span></div></div>
      <div class="dk-kpi"><div><em>Live value</em><b>${money(pool("listed").reduce((a, i) => a + valOf(i), 0))}</b></div><div><em>Sold, 8 weeks</em><b>${money(wkSum)}</b></div><div><em>This week</em><b>${money(wkNow)}</b></div></div></header>
    <div class="dk-tabs" role="tablist" aria-label="Stage">${DESK_TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${S.stage === k}" class="dk-tab ch-stop${S.stage === k ? " on" : ""}${k === "sold" && counts.sold ? " hot" : ""}" data-stage="${k}"><b>${counts[k] || 0}</b><span>${l}</span></button>`).join("")}</div>
    ${!orders && stale.length ? `<button type="button" class="dk-alert${S.stale ? " on" : ""}" id="dkStale"><b>${stale.length} listing${stale.length === 1 ? "" : "s"} sitting 45+ days</b><span>${S.stale ? "Showing them. Tap to show everything." : "Tap to see them and fix the price."}</span></button>` : ""}
    <div class="dk-find"><input id="chQ" type="search" placeholder="Search title or SKU" value="${esc(S.q)}" aria-label="Search title or SKU">
      ${orders ? "" : `<select id="dkSort" aria-label="Sort"><option value="value"${S.sort === "value" ? " selected" : ""}>Price: high</option><option value="low"${S.sort === "low" ? " selected" : ""}>Price: low</option><option value="old"${S.sort === "old" ? " selected" : ""}>Oldest first</option><option value="name"${S.sort === "name" ? " selected" : ""}>Name</option></select>`}
      <button class="btn ch-controls${S.drawer ? " on" : ""}" id="chCtl" type="button" aria-expanded="${S.drawer}" aria-label="Bulk tools">Bulk</button></div>`;
}
function deskList(all) {
  let list = all;
  if (S.stale && S.stage === "listed") list = list.filter((it) => (daysSince(it.channels?.ebay?.listedAt || it.createdAt) || 0) > 45);
  if (S.sort === "old" && S.stage === "listed") list = [...list].sort((a, b) => (Date.parse(a.channels?.ebay?.listedAt || a.createdAt || 0) || 0) - (Date.parse(b.channels?.ebay?.listedAt || b.createdAt || 0) || 0));
  if (!list.length) return `<div class="co-empty">${S.q ? "Nothing matches that search." : ["sold", "shipped", "delivered"].includes(S.stage) ? "No orders here. Tap Sync to pull your eBay orders." : "Nothing live yet."}</div>`;
  const sp = new Map(loadSpaces().map((x) => [x.id, x.name]));
  const vp = (it, withId) => { const all = (it._n > 1 ? it._kids : [it]).flatMap((k) => (k.photos || []).map((p) => p.dataUrl || p.url)).filter(Boolean).slice(0, 24); return all.length ? ` data-view-photo="${esc(JSON.stringify(all))}"${withId ? ` data-view-id="${esc(it.id)}"` : ""}` : ""; };
  const row = (it) => {
    const src = photoOf(it), on = S.sel.has(String(it.id));
    if (it._order) { const o = it._order, d = daysSince(o.createdAt), st = track(o).step, n = it.phase === "sold" ? 0 : Math.max(1, st + 1);
      return `<article class="dk-row ch-tile${on ? " sel" : ""}" data-id="${esc(it.id)}" tabindex="0"><button type="button" class="co-pick" data-pick="${esc(it.id)}" aria-label="Select" aria-pressed="${on}"></button>
        <span class="co-img dk-img"${vp(it, false)}>${src ? `<img src="${esc(src)}" alt="" loading="lazy" draggable="false">` : `<i>${esc(nameOf(it).charAt(0))}</i>`}</span>
        <div class="dk-mid"><b>${esc(nameOf(it))}</b><span>${esc(o.buyer || "Buyer")} · ${d == null ? "" : d === 0 ? "today" : d + "d ago"}</span><span class="dk-trk">${[0, 1, 2, 3].map((k) => `<i${k < n ? ' class="on"' : ""}></i>`).join("")}<em>${esc(badge(it))}</em></span></div>
        <div class="dk-end"><b>${money(o.total ?? it.price)}</b>${it.phase === "sold" ? `<a class="dk-act hot" href="https://www.ebay.com/sh/ord" target="_blank" rel="noopener" data-noopen>Print label</a>` : ""}</div></article>`; }
    const d = daysSince(it.channels?.ebay?.listedAt || it.createdAt), q = it._n > 1 ? it._kids.reduce((a, k) => a + (Number(k.quantity) || 1), 0) : Number(it.quantity) || 1;
    return `<article class="dk-row ch-tile${on ? " sel" : ""}" data-id="${esc(it.id)}" data-edit="1" tabindex="0"><button type="button" class="co-pick" data-pick="${esc(it.id)}" aria-label="Select" aria-pressed="${on}"></button>
      <span class="co-img dk-img"${vp(it, true)}>${src ? `<img src="${esc(src)}" alt="" loading="lazy" draggable="false">` : `<i>${esc(nameOf(it).charAt(0))}</i>`}</span>
      <div class="dk-mid"><b>${esc(nameOf(it))}</b><span>${it._n > 1 ? `${it._n} variations · ` : ""}${d == null ? "" : `<i class="${d > 45 ? "old" : ""}">${d}d live</i> · `}${esc(sp.get(it.spaceId) || "No bin")}</span></div>
      <div class="dk-end"><b>${ptxt(it)}</b><span>qty ${q}</span><em class="dk-act">Edit</em></div></article>`;
  };
  return `<div class="dk-list">${list.slice(0, S.more.dk || 80).map(row).join("")}</div>${list.length > (S.more.dk || 80) ? `<button class="btn dk-more" type="button" id="dkMore">Show ${Math.min(80, list.length - (S.more.dk || 80))} more</button>` : ""}`;
}
function wireDesk(all) {
  const h = ctx.host;
  h.querySelector("#dkStale")?.addEventListener("click", () => { S.stale = !S.stale; paint(); });
  h.querySelector("#dkSort")?.addEventListener("change", (e) => { S.sort = e.target.value; paint(); });
  h.querySelector("#dkMore")?.addEventListener("click", () => { S.more.dk = (S.more.dk || 80) + 80; paint(); });
  h.querySelectorAll("[data-noopen]").forEach((a) => a.addEventListener("click", (e) => e.stopPropagation()));
}
/* edit a live listing: price, quantity, title; one row per variation */
/* Full editor for a live listing: everything you'd change in the eBay app, changed here (API listings can't be edited in eBay's app). */
function fullEdit(it) {
  const sku = it.channels?.ebay?.sku || it.sku, src = photoOf(it);
  const s = ctx.openSheet(`<div class="ed fe"><div class="ed-head">${src ? `<img src="${esc(src)}" alt="" data-view-photo="${esc(JSON.stringify((it.photos || []).map((p) => p.dataUrl || p.url).filter(Boolean)))}">` : ""}<div><em>Live on eBay</em><b>${esc(nameOf(it))}</b></div></div><p class="sub" id="feMsg">Loading the listing from eBay…</p><div id="feBody"></div></div>`);
  const $ = (q) => s.querySelector(q), msg = (t, bad) => { const m = $("#feMsg"); m.textContent = t; m.classList.toggle("bad", !!bad); };
  let dlN = 0;
  const row = (k = "", v = "", vals = [], req = false) => { const dl = vals.length ? `fe-dl-${++dlN}` : ""; return `<div class="bl-ar${req ? " req" : ""}${v ? "" : " blank"}" style="gap:6px;align-items:center;display:flex"><input data-ak value="${esc(k)}" placeholder="Name" style="flex:1;min-width:0"><input data-av value="${esc(v)}" placeholder="${req ? "Required" : "Optional"}" aria-label="${esc(k || "Item specific")} value" style="flex:1;min-width:0"${dl ? ` list="${dl}"` : ""}>${dl ? `<datalist id="${dl}">${vals.map((x) => `<option value="${esc(x)}">`).join("")}</datalist>` : ""}<button class="btn" data-rm type="button" aria-label="Remove" style="flex:none;padding:6px 12px">×</button></div>`; };
  fetch(`/api/channels/ebay/listing-detail?sku=${encodeURIComponent(sku)}`).then((r) => r.json()).then((d) => {
    if (!s.isConnected) return;
    if (!d.ok) { msg(`Couldn't load it from eBay: ${d.error || "try again"}`, true); return; }
    const card = !d.categoryId || d.categoryId === "183454", cd = (d.conditionDescriptors || [])[0]?.values?.[0], CC = { 400010: "NM", 400011: "LP", 400012: "MP", 400013: "HP" };
    const cond = card ? (CC[cd] || "NM") : (/^NEW/.test(d.condition || "") ? "NEW" : "USED");
    const condOpts = card ? [["NM", "Near Mint"], ["LP", "Lightly Played"], ["MP", "Moderately Played"], ["HP", "Heavily Played"]] : [["NEW", "New"], ["USED", "Used (pre-owned)"]];
    const pct = d.offerFloorPct || (() => { try { return Number(localStorage.getItem("fob-offer-pct")) || 80; } catch { return 80; } })();
    const sel = (id, opts, cur) => opts.length ? `<select id="${id}">${opts.map((o) => `<option value="${esc(o.id)}"${String(o.id) === String(cur) ? " selected" : ""}>${esc(o.name)}</option>`).join("")}</select>` : `<span class="sub">Your eBay default</span>`;
    msg(`Changes go straight to your live eBay listing.`);
    $("#feBody").innerHTML = `
      <div id="fePh"></div>
      <label class="ed-f"><span>Title</span><input id="feTitle" maxlength="80" value="${esc(d.title)}"><small id="feTn">${d.title.length}/80</small></label>
      <div class="fe-row"><label class="ed-f"><span>Price</span><input id="fePrice" inputmode="decimal" value="${d.price != null ? Number(d.price).toFixed(2) : ""}"></label><label class="ed-f"><span>Quantity</span><input id="feQty" inputmode="numeric" value="${esc(d.quantity ?? 1)}"></label></div>
      <label class="ed-f"><span>Condition</span><select id="feCond">${condOpts.map(([k, l]) => `<option value="${k}"${k === cond ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      <div class="ed-f"><span class="bl-lh">Description <button type="button" class="bl-mini" id="feRedo">Rewrite clean (no filler)</button></span><textarea id="feDesc" rows="9" style="width:100%;resize:vertical">${esc(d.descriptionText || "")}</textarea></div>
      <div class="ed-f"><span class="bl-lh">Item specifics <em id="feAspN"></em></span><div id="feAsp" class="bl-vars bl-asp" style="max-height:none">${Object.entries(d.aspects || {}).map(([k, v]) => row(k, (Array.isArray(v) ? v : [v]).join(", "))).join("")}${(d.more || []).map((m) => row(m.name, "", m.values || [], m.required)).join("")}</div><button class="btn" id="feAdd" type="button" style="margin-top:6px">Add item specific</button></div>
      <div class="ed-f"><span>Offers</span><div class="bl-off"><label><input type="checkbox" id="feOffer"${d.bestOffer || !d.offerId ? " checked" : ""}> Accept offers</label><label class="bl-offp">Auto-decline under <input id="feOfferPct" inputmode="numeric" value="${pct}">% of price</label></div></div>
      <label class="ed-f"><span>Shipping</span>${sel("feShip", d.shippingOptions || [], d.fulfillmentPolicyId)}</label>
      <label class="ed-f"><span>Returns</span>${sel("feRet", d.returnOptions || [], d.returnPolicyId)}</label>
      <div class="ed-go"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn go" id="feSave">Save to eBay</button></div>`;
    photoManager($("#fePh"), it.id, { toast: ctx.toast, refresh: ctx.refresh });
    const cnt = () => { const rows = [...s.querySelectorAll("#feAsp > div")]; $("#feAspN").textContent = `${rows.filter((r) => r.querySelector("[data-av]").value.trim()).length} of ${rows.length} filled`; rows.forEach((r) => r.classList.toggle("blank", !r.querySelector("[data-av]").value.trim())); };
    cnt(); $("#feAsp").addEventListener("input", cnt);
    $("#feAsp").addEventListener("click", (e) => { const b = e.target.closest("[data-rm]"); if (b) { b.parentElement.remove(); cnt(); } });
    $("#feAdd").addEventListener("click", () => { $("#feAsp").insertAdjacentHTML("beforeend", row()); cnt(); });
    $("#feRedo").addEventListener("click", (e) => { const b = e.currentTarget; b.textContent = "Rewriting…";
      const aspects = {}; s.querySelectorAll("#feAsp > div").forEach((r) => { const k = r.querySelector("[data-ak]").value.trim(), v = r.querySelector("[data-av]").value.trim(); if (k && v) aspects[k] = v; });
      fetch("/api/channels/ebay/listing-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item: { ...it, title: $("#feTitle").value, categoryId: d.categoryId, condition: $("#feCond").value, quantity: Number($("#feQty").value) || 1, description: "" } }) }).then((r) => r.json()).then((p) => { b.textContent = "Rewrite clean (no filler)"; if (p.ok && p.description) $("#feDesc").value = p.description; }).catch(() => { b.textContent = "Rewrite clean (no filler)"; });
    });
    $("#feTitle").addEventListener("input", (e) => { $("#feTn").textContent = `${e.target.value.length}/80`; });
    s.querySelector("[data-close]").addEventListener("click", () => ctx.closeSheet());
    $("#feSave").addEventListener("click", async () => {
      const price = parseFloat(String($("#fePrice").value).replace(/[^0-9.]/g, "")), qty = parseInt($("#feQty").value, 10);
      if (!(price > 0)) { msg("Price needs to be more than $0.", true); $("#fePrice").focus(); return; }
      const miss = [...s.querySelectorAll("#feAsp > div.req")].find((r) => !r.querySelector("[data-av]").value.trim()); if (miss) { msg(`eBay requires ${miss.querySelector("[data-ak]").value}.`, true); miss.querySelector("[data-av]").focus(); return; }
      const aspects = {}; s.querySelectorAll("#feAsp > div").forEach((r) => { const k = r.querySelector("[data-ak]").value.trim(), v = r.querySelector("[data-av]").value.trim(); if (k && v) aspects[k] = v; });
      const pc = Math.min(99, Math.max(1, parseInt($("#feOfferPct").value, 10) || 80)); try { localStorage.setItem("fob-offer-pct", String(pc)); } catch { /* ignore */ }
      const body = { sku, title: $("#feTitle").value.trim(), price, quantity: Number.isFinite(qty) ? Math.max(0, qty) : undefined, condition: $("#feCond").value, description: $("#feDesc").value, aspects, bestOffer: $("#feOffer").checked, offerFloorPct: pc, ...(s.querySelector("#feShip") ? { fulfillmentPolicyId: $("#feShip").value } : {}), ...(s.querySelector("#feRet") ? { returnPolicyId: $("#feRet").value } : {}) };
      const b = $("#feSave"); b.disabled = true; b.textContent = "Saving to eBay…"; msg("");
      try {
        const r = await fetch("/api/channels/ebay/revise-full", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), out = await r.json().catch(() => ({}));
        if (!r.ok || !out.ok) { const e = String(out.error || "eBay said no.").replace(/^eBay API \S+ \S+ failed \(\d+\): /, ""); msg(`eBay said no: ${e}`, true); b.disabled = false; b.textContent = "Save to eBay"; return; }
        patchItem(it.id, (i) => { i.title = body.title; i.price = price; if (body.quantity != null) i.quantity = body.quantity; i.description = body.description; i.descEdited = true; i.aspects = aspects; i.condition = body.condition; if (body.returnPolicyId) i.returnPolicyId = body.returnPolicyId; if (body.fulfillmentPolicyId) i.fulfillmentPolicyId = body.fulfillmentPolicyId; });
        ctx.closeSheet(); paint(); ctx.refresh?.(); ctx.toast("Saved. Your eBay listing is updated.");
      } catch { msg("Couldn't reach eBay. Nothing changed.", true); b.disabled = false; b.textContent = "Save to eBay"; }
    });
  }).catch(() => { if (s.isConnected) msg("Couldn't reach eBay. Try again.", true); });
}
/* Full editor for a variation listing: the shared parts once, then every variation's price and qty. */
function groupEdit(it, key) {
  const src = photoOf(it);
  const s = ctx.openSheet(`<div class="ed fe"><div class="ed-head">${src ? `<img src="${esc(src)}" alt="">` : ""}<div><em>Live on eBay · ${it._n} variations</em><b>${esc(it.groupTitle || nameOf(it))}</b></div></div><p class="sub" id="feMsg">Loading the listing from eBay…</p><div id="feBody"></div></div>`);
  const $ = (q) => s.querySelector(q), msg = (t, bad) => { const m = $("#feMsg"); m.textContent = t; m.classList.toggle("bad", !!bad); };
  let dlN = 0;
  const row = (k = "", v = "", vals = [], req = false) => { const dl = vals.length ? `ge-dl-${++dlN}` : ""; return `<div class="bl-ar${req ? " req" : ""}${v ? "" : " blank"}" style="gap:6px;align-items:center;display:flex"><input data-ak value="${esc(k)}" placeholder="Name" style="flex:1;min-width:0"><input data-av value="${esc(v)}" placeholder="${req ? "Required" : "Optional"}" style="flex:1;min-width:0"${dl ? ` list="${dl}"` : ""}>${dl ? `<datalist id="${dl}">${vals.map((x) => `<option value="${esc(x)}">`).join("")}</datalist>` : ""}<button class="btn" data-rm type="button" aria-label="Remove" style="flex:none;padding:6px 12px">×</button></div>`; };
  fetch(`/api/channels/ebay/group-detail?key=${encodeURIComponent(key)}`).then((r) => r.json()).then((d) => {
    if (!s.isConnected) return;
    if (!d.ok) { msg(`Couldn't load it from eBay: ${d.error || "try again"}`, true); return; }
    const pct = d.offerFloorPct || (() => { try { return Number(localStorage.getItem("fob-offer-pct")) || 80; } catch { return 80; } })();
    const sel = (id, opts, cur) => opts.length ? `<select id="${id}">${opts.map((o) => `<option value="${esc(o.id)}"${String(o.id) === String(cur) ? " selected" : ""}>${esc(o.name)}</option>`).join("")}</select>` : `<span class="sub">Your eBay default</span>`;
    msg("Changes go straight to your live eBay listing.");
    $("#feBody").innerHTML = `
      <label class="ed-f"><span>Title</span><input id="feTitle" maxlength="80" value="${esc(d.title)}"><small id="feTn">${d.title.length}/80</small></label>
      <div class="ed-f"><span class="bl-lh">Variations <em>${d.variants.length}</em></span>
        <div class="ge-bulk"><input id="geAll" inputmode="decimal" placeholder="Set every price" aria-label="Set every price"><button type="button" class="btn" id="geAllGo">Apply</button><button type="button" class="btn" data-gp="-10">−10%</button><button type="button" class="btn" data-gp="10">+10%</button></div>
        <div class="ge-vars">${d.variants.map((v, j) => `<div class="ge-v" data-j="${j}">${v.image ? `<img src="${esc(v.image)}" alt="" data-view-photo="${esc(JSON.stringify([v.image]))}">` : "<i></i>"}<span class="ge-n">${esc(v.name)}</span><label><i>$</i><input data-price inputmode="decimal" value="${v.price != null ? Number(v.price).toFixed(2) : ""}" aria-label="Price"></label><label class="ge-q"><input data-qty inputmode="numeric" value="${esc(v.quantity ?? 0)}" aria-label="Quantity"></label></div>`).join("")}</div></div>
      <div class="ed-f"><span class="bl-lh">Description <button type="button" class="bl-mini" id="feRedo">Rewrite clean (no filler)</button></span><textarea id="feDesc" rows="9" style="width:100%;resize:vertical">${esc(d.descriptionText || "")}</textarea></div>
      <div class="ed-f"><span class="bl-lh">Item specifics (whole listing) <em id="feAspN"></em></span><div id="feAsp" class="bl-vars bl-asp" style="max-height:none">${Object.entries(d.aspects || {}).map(([k, v]) => row(k, (Array.isArray(v) ? v : [v]).join(", "))).join("")}${(d.more || []).map((m) => row(m.name, "", m.values || [], m.required)).join("")}</div><button class="btn" id="feAdd" type="button" style="margin-top:6px">Add item specific</button></div>
      <div class="ed-f"><span>Offers</span><div class="bl-off"><label><input type="checkbox" id="feOffer"${d.bestOffer ? " checked" : ""}> Accept offers</label><label class="bl-offp">Auto-decline under <input id="feOfferPct" inputmode="numeric" value="${pct}">% of price</label></div></div>
      <label class="ed-f"><span>Shipping</span>${sel("feShip", d.shippingOptions || [], d.fulfillmentPolicyId)}</label>
      <label class="ed-f"><span>Returns</span>${sel("feRet", d.returnOptions || [], d.returnPolicyId)}</label>
      <div class="ed-go"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn go" id="feSave">Save to eBay</button></div>`;
    const cnt = () => { const rows = [...s.querySelectorAll("#feAsp > div")]; $("#feAspN").textContent = `${rows.filter((r) => r.querySelector("[data-av]").value.trim()).length} of ${rows.length} filled`; rows.forEach((r) => r.classList.toggle("blank", !r.querySelector("[data-av]").value.trim())); };
    cnt(); $("#feAsp").addEventListener("input", cnt);
    $("#feAsp").addEventListener("click", (e) => { const b = e.target.closest("[data-rm]"); if (b) { b.parentElement.remove(); cnt(); } });
    $("#feAdd").addEventListener("click", () => { $("#feAsp").insertAdjacentHTML("beforeend", row()); cnt(); });
    $("#feTitle").addEventListener("input", (e) => { $("#feTn").textContent = `${e.target.value.length}/80`; });
    $("#geAllGo").addEventListener("click", () => { const p = parseFloat(String($("#geAll").value).replace(/[^0-9.]/g, "")); if (p > 0) s.querySelectorAll("[data-price]").forEach((x) => { x.value = p.toFixed(2); }); });
    s.querySelectorAll("[data-gp]").forEach((b) => b.addEventListener("click", () => { const k = 1 + Number(b.dataset.gp) / 100; s.querySelectorAll("[data-price]").forEach((x) => { const v = parseFloat(x.value); if (v > 0) x.value = Math.max(0.99, Math.round(v * k * 100) / 100).toFixed(2); }); }));
    $("#feRedo").addEventListener("click", (e) => { const b = e.currentTarget; b.textContent = "Rewriting…";
      fetch("/api/channels/ebay/listing-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item: { ...it, title: $("#feTitle").value, description: "", quantity: 1 } }) }).then((r) => r.json()).then((p) => {
        b.textContent = "Rewrite clean (no filler)"; if (!p.ok) return;
        const head = p.description.split("\n")[0].replace(/^[^|]*\|/, $("#feTitle").value + " |"), list = d.variants.map((v, j) => `- ${v.name}${Number(s.querySelector(`.ge-v[data-j="${j}"] [data-qty]`).value) > 1 ? ` (${s.querySelector(`.ge-v[data-j="${j}"] [data-qty]`).value} available)` : ""}`).join("\n");
        $("#feDesc").value = `${$("#feTitle").value}.\n\nPick your card from the drop-down. You get the exact card shown in its photo.\n\n${list}\n\nCornDogSmuggler Coalition - Operating To Marine Corps Standards.`;
      }).catch(() => { b.textContent = "Rewrite clean (no filler)"; });
    });
    s.querySelector("[data-close]").addEventListener("click", () => ctx.closeSheet());
    $("#feSave").addEventListener("click", async () => {
      const variants = d.variants.map((v, j) => { const r = s.querySelector(`.ge-v[data-j="${j}"]`); return { sku: v.sku, price: parseFloat(String(r.querySelector("[data-price]").value).replace(/[^0-9.]/g, "")), quantity: Math.max(0, parseInt(r.querySelector("[data-qty]").value, 10) || 0) }; });
      const badP = variants.findIndex((v) => !(v.price > 0)); if (badP >= 0) { msg(`${d.variants[badP].name} needs a price.`, true); s.querySelector(`.ge-v[data-j="${badP}"] [data-price]`).focus(); return; }
      const miss = [...s.querySelectorAll("#feAsp > div.req")].find((r) => !r.querySelector("[data-av]").value.trim()); if (miss) { msg(`eBay requires ${miss.querySelector("[data-ak]").value}.`, true); miss.querySelector("[data-av]").focus(); return; }
      const aspects = {}; s.querySelectorAll("#feAsp > div").forEach((r) => { const k = r.querySelector("[data-ak]").value.trim(), v = r.querySelector("[data-av]").value.trim(); if (k && v) aspects[k] = v; });
      const pc = Math.min(99, Math.max(1, parseInt($("#feOfferPct").value, 10) || 80)); try { localStorage.setItem("fob-offer-pct", String(pc)); } catch { /* ignore */ }
      const body = { groupKey: key, title: $("#feTitle").value.trim(), description: $("#feDesc").value, aspects, variants, bestOffer: $("#feOffer").checked, offerFloorPct: pc, ...(s.querySelector("#feShip") ? { fulfillmentPolicyId: $("#feShip").value } : {}), ...(s.querySelector("#feRet") ? { returnPolicyId: $("#feRet").value } : {}) };
      const b = $("#feSave"); b.disabled = true; b.textContent = `Saving ${variants.length} variations…`; msg("");
      try {
        const r = await fetch("/api/channels/ebay/revise-group", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), out = await r.json().catch(() => ({}));
        const okSkus = new Set((out.results || []).filter((x) => x.ok).map((x) => x.sku));
        const l = loadItems(); for (const v of variants) { if (!okSkus.has(v.sku)) continue; const k = l.find((i) => (i.channels?.ebay?.sku || i.sku) === v.sku); if (k) { k.price = v.price; k.quantity = v.quantity; k.groupTitle = body.title; } } saveItems(l);
        if (!r.ok || !out.ok) { const e = String(out.error || "eBay said no.").replace(/^eBay API \S+ \S+ failed \(\d+\): /, ""); msg(okSkus.size ? `Saved ${okSkus.size} of ${variants.length}. eBay said no to the rest: ${e}` : `eBay said no: ${e}`, true); b.disabled = false; b.textContent = "Save to eBay"; return; }
        ctx.closeSheet(); paint(); ctx.refresh?.(); ctx.toast(`Saved. All ${variants.length} variations updated on eBay.`);
      } catch { msg("Couldn't reach eBay. Nothing confirmed. Reopen to check.", true); b.disabled = false; b.textContent = "Save to eBay"; }
    });
  }).catch(() => { if (s.isConnected) msg("Couldn't reach eBay. Try again.", true); });
}
function editSheet(all, id) {
  const it = all.find((x) => String(x.id) === String(id)); if (!it) return;
  if (!(it._n > 1) && (it.channels?.ebay?.sku || it.sku)) return fullEdit(it);
  { const gk = (it._kids || []).find((k) => k.groupId)?.groupId || it.groupId; if (it._n > 1 && gk) return groupEdit(it, gk); }
  const kids = it._n > 1 ? it._kids.slice() : [it], multi = kids.length > 1, src = photoOf(it);
  const skuOf = (k) => k.channels?.ebay?.sku || k.sku || "", offerOf = (k) => k.channels?.ebay?.offerId || "";
  const names = kids.map((k) => nameOf(k)), words = names.map((t) => t.split(/\s+/)); let cut = 0;
  if (multi) while (cut < 12 && words.every((w) => w[cut] && w[cut].toLowerCase() === words[0][cut].toLowerCase())) cut++;
  const short = (j) => { const r = words[j].slice(cut).join(" "); return r.length > 2 ? r : names[j]; };
  const s = ctx.openSheet(`<div class="ed">
    <div class="ed-head">${src ? `<img src="${esc(src)}" alt="">` : ""}<div><em>Live on eBay${multi ? ` · ${kids.length} variations` : ""}</em><b>${esc(nameOf(it))}</b></div></div>
    ${multi ? "" : `<label class="ed-f"><span>Title</span><input id="edTitle" maxlength="80" value="${esc(nameOf(it))}"><small id="edTn">${nameOf(it).length}/80</small></label>`}
    <div class="ed-vars">${kids.map((k, j) => `<div class="ed-v" data-j="${j}">${multi ? `<span class="ed-vn">${esc(short(j))}</span>` : ""}
      <label class="ed-p"><span>Price</span><i>$</i><input inputmode="decimal" data-price value="${(Number(k.price) || 0).toFixed(2)}" aria-label="Price"></label>
      <div class="ed-q"><span>Qty</span><button type="button" data-qd aria-label="Less">−</button><input inputmode="numeric" data-qty value="${Number(k.quantity) || 1}" aria-label="Quantity"><button type="button" data-qu aria-label="More">+</button></div></div>`).join("")}</div>
    ${multi ? `<div class="ed-all"><span>Change every price by</span><button type="button" data-pct="-10">−10%</button><button type="button" data-pct="-5">−5%</button><button type="button" data-pct="5">+5%</button></div>` : `<div class="ed-all"><span>Quick price</span><button type="button" data-pct="-10">−10%</button><button type="button" data-pct="-5">−5%</button><button type="button" data-pct="5">+5%</button></div>`}
    <p class="ed-msg" id="edMsg"></p>
    <div class="ed-go"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn go" id="edSave">Save to eBay</button></div></div>`);
  const $ = (q) => s.querySelector(q), msg = (t, bad) => { const m = $("#edMsg"); m.textContent = t; m.classList.toggle("bad", !!bad); };
  $("#edTitle")?.addEventListener("input", (e) => { $("#edTn").textContent = `${e.target.value.length}/80`; });
  s.querySelectorAll(".ed-v").forEach((r) => { const q = r.querySelector("[data-qty]"); r.querySelector("[data-qd]").addEventListener("click", () => { q.value = Math.max(0, (parseInt(q.value, 10) || 0) - 1); }); r.querySelector("[data-qu]").addEventListener("click", () => { q.value = (parseInt(q.value, 10) || 0) + 1; }); });
  s.querySelectorAll("[data-pct]").forEach((b) => b.addEventListener("click", () => { const k = 1 + Number(b.dataset.pct) / 100; s.querySelectorAll("[data-price]").forEach((p) => { const v = parseFloat(p.value) || 0; p.value = Math.max(.99, Math.round(v * k * 100) / 100).toFixed(2); }); }));
  $("#edSave").addEventListener("click", async () => {
    const updates = [], local = [];
    s.querySelectorAll(".ed-v").forEach((r) => { const k = kids[Number(r.dataset.j)], price = parseFloat(r.querySelector("[data-price]").value), qty = parseInt(r.querySelector("[data-qty]").value, 10);
      const u = { sku: skuOf(k), offerId: offerOf(k) }, ch = {};
      if (price > 0 && Math.abs(price - (Number(k.price) || 0)) >= .005) { u.price = price; ch.price = price; }
      if (qty >= 0 && qty !== (Number(k.quantity) || 1)) { u.quantity = qty; ch.quantity = qty; }
      if (!multi) { const t = ($("#edTitle")?.value || "").trim(); if (t && t !== nameOf(k)) { u.title = t; ch.title = t; } }
      if (Object.keys(ch).length) { updates.push(u); local.push([k.id, ch]); } });
    if (!updates.length) { msg("Nothing changed."); return; }
    if (updates.some((u) => !u.sku)) { msg("This listing has no eBay SKU in the app yet. Tap Sync, then try again.", true); return; }
    const b = $("#edSave"); b.disabled = true; b.textContent = "Saving to eBay…"; msg("");
    try {
      const r = await fetch("/api/channels/ebay/revise", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updates }) });
      const out = await r.json().catch(() => ({}));
      const okSkus = new Set((out.results || []).filter((x) => x.ok).map((x) => x.sku));
      if (okSkus.size) { const l = loadItems(), m = new Map(local); for (const x of l) { const ch = m.get(x.id); const sku = x.channels?.ebay?.sku || x.sku; if (ch && okSkus.has(sku)) { Object.assign(x, ch); x.updatedAt = new Date().toISOString(); } } saveItems(l); ctx.refresh(); }
      if (out.ok) { ctx.closeSheet(); ctx.toast(`Updated on eBay: ${updates.length} change${updates.length === 1 ? "" : "s"}.`); paint(); return; }
      msg(okSkus.size ? `${okSkus.size} saved, ${updates.length - okSkus.size} didn't: ${out.error || "eBay said no."}` : (out.error || "eBay said no. Nothing changed."), true);
    } catch { msg("Couldn't reach eBay. Nothing changed.", true); }
    b.disabled = false; b.textContent = "Save to eBay";
  });
}
function wallInfo(it) {
  if (it._order) { const o = it._order, d = daysSince(o.createdAt); return `${esc(o.buyer || "Buyer")} · ${esc(badge(it))}${d == null ? "" : " · " + (d === 0 ? "today" : d + "d ago")}`; }
  const d = daysSince(it.channels?.ebay?.listedAt || it.createdAt), sp = loadSpaces().find((x) => x.id === it.spaceId);
  return `${ptxt(it)}${d == null ? "" : ` · live ${d} day${d === 1 ? "" : "s"}`} · ${sp ? esc(sp.name) : "No bin"}`;
}
function wireDeck(all) { wireHoloWall(ctx.host, all, { info: wallInfo, onOpen: (it, el) => zoom(all, el) }); }

function paint() {
  const all = rows(), h = ctx.host; const groups = new Map();
  const typedPct = h.querySelector("#chPct")?.value || "", typedQ = document.activeElement && document.activeElement.id === "chQ";
  for (const it of all) { const k = keyOf(it); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
  const total = all.reduce((a, i) => a + (i._order ? Number(i.price) || 0 : valOf(i)), 0);
  const counts = Object.fromEntries(STAGES.map(([k]) => [k, pool(k).length]));
  const sections = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, list]) => {
    const shown = list.slice(0, S.more[k] || 120), closed = S.closed.has(k);
    return `<section class="ch-group"><header><button class="ch-fold" data-fold="${esc(k)}" type="button" aria-expanded="${!closed}">${closed ? "▸" : "▾"} ${esc(k)} <em>${list.length}</em></button><span>${money(list.reduce((a, i) => a + (i._order ? Number(i.price) || 0 : valOf(i)), 0))}</span><button class="chip" data-selgrp="${esc(k)}" type="button">Select this group (${list.length})</button></header>
      ${closed ? "" : `<div class="${S.view === "list" ? "sp-list" : S.view === "rows" ? "chr-list" : "co-grid ch-grid " + S.view}">${shown.map(tile).join("")}</div>${list.length > shown.length ? `<button class="btn" data-more="${esc(k)}" type="button">Show ${Math.min(120, list.length - shown.length)} more of ${list.length - shown.length}</button>` : ""}`}</section>`;
  }).join("");
  const n = S.sel.size;
  h.innerHTML = `<div class="co-wrap ch-wrap dk">
    ${deskTop(all, total, counts)}
    ${drawerHtml()}
    ${S.list ? (sections || "") : deskList(all)}
    ${n ? bar(n) : ""}</div>`;
  wire(all); wireDesk(all); h.querySelectorAll(".sv-c").forEach((c) => c.addEventListener("click", () => zoom(all, c))); h.querySelectorAll("[data-allgrp]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); S.list = true; paint(); })); ctx.host.querySelector("#chList")?.addEventListener("click", () => { S.list = !S.list; paint(); });
  { const pc = h.querySelector("#chPct"); if (pc && typedPct) pc.value = typedPct; if (typedQ) { const q = h.querySelector("#chQ"); if (q) { q.focus(); const n = q.value.length; try { q.setSelectionRange(n, n); } catch { /* ignore */ } } } }
}
function bar(n) {
  const spaces = loadSpaces();
  return `<div class="co-bar"><b>${n} selected</b>
    <select id="chBin" aria-label="Send to bin"><option value="">Send to bin…</option>${spaces.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}</select>
    <span class="co-pct"><input id="chPct" inputmode="numeric" placeholder="±%" aria-label="Percent"><button class="btn" data-bulk="pct" type="button">Change price</button></span>
    <button class="btn go" data-bulk="offers" type="button">Turn on offers</button>
    <button class="btn" data-bulk="end" type="button">End on eBay…</button>
    <button class="btn warn" data-bulk="del" type="button">Remove from app</button><button class="btn" data-bulk="clear" type="button">Clear</button>
    <small>Price and remove change this app only. Publish and end touch real eBay listings, so they ask first.</small></div>`;
}
function commit(mut) { const l = loadItems(); mut(l); if (!saveItems(l)) { ctx.toast("Couldn't save. Storage is full."); return false; } ctx.refresh(); return true; }
function toggle(id) { S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); }
const dt = (iso) => dayText(iso) || "—";
function orderInfo(it) {
  const o = it._order, u = trackUrl(o);
  return `<div class="sub">${esc(STAGE_LABEL[it.phase])}</div>${it.phase === "sold" ? "" : trackerHtml(o)}<div class="row"><span>Total</span><span>${money(o.total)}</span></div><div class="row"><span>Buyer</span><span>${esc(o.buyer || "—")}</span></div><div class="row"><span>Sold</span><span>${dt(o.createdAt)}</span></div>${it.phase === "sold" ? "" : `<div class="row"><span>Shipped</span><span>${dt(o.shippedAt)}</span></div>`}<div class="row"><span>Carrier</span><span>${esc(o.carrier || "—")}</span></div><div class="row"><span>Tracking</span><span>${o.trackingNumber ? esc(o.trackingNumber) : "No label yet"}</span></div>${u ? `<a class="btn go" href="${esc(u)}" target="_blank" rel="noopener">Open carrier tracking</a>` : `<a class="btn go" href="https://www.ebay.com/sh/ord" target="_blank" rel="noopener">Open eBay orders</a>`}`;
}
function varInfo(it) {
  if (!(it._n > 1)) return "";
  const kids = it._kids.slice().sort((x, y) => (Number(y.price) || 0) - (Number(x.price) || 0));
  const names = kids.map((k) => nameOf(k));
  /* drop the words every card shares (set name etc.) so each row says what's different */
  const words = names.map((t) => t.split(/\s+/)); let cut = 0;
  while (cut < 12 && words.every((w) => w[cut] && w[cut].toLowerCase() === words[0][cut].toLowerCase())) cut++;
  const short = (k, j) => { const w = words[j]; const r = w.slice(cut).join(" "); return r.length > 2 ? r : names[j]; };
  const qty = kids.reduce((a, k) => a + (Number(k.quantity) || 1), 0), val = kids.reduce((a, k) => a + (Number(k.price) || 0) * (Number(k.quantity) || 1), 0);
  const row = (k, j) => { const p = photoOf(k); return `<div class="vx-row">${p ? `<img src="${esc(p)}" alt="" loading="lazy">` : `<i>${esc(names[j].charAt(0))}</i>`}<span>${esc(short(k, j))}</span><b>${money(k.price)}</b><em>×${Number(k.quantity) || 1}</em></div>`; };
  return `<div class="vx-chips"><span class="vx-live">● Live on eBay</span><span>One listing · ${it._n} cards</span></div>
    <div class="vx-stats"><div><b>${ptxt(it)}</b><span>Price range</span></div><div><b>${qty}</b><span>In stock</span></div><div><b>${money(val)}</b><span>Total value</span></div></div>
    <h3 class="vx-h">Cards in this listing</h3><div class="vx-list">${kids.slice(0, 12).map(row).join("")}${kids.length > 12 ? `<div class="vx-more" data-vxall>${kids.slice(12).map((k, j) => row(k, j + 12)).join("")}</div><button class="btn" type="button" data-vxshow>Show all ${kids.length}</button>` : ""}</div>`;
}
function zoom(list, el) {
  const id = el.dataset.id, idx = list.findIndex((i) => String(i.id) === String(id)); if (idx < 0) return;
  openCard(list, {
    index: idx, from: el, photo: photoOf, name: nameOf,
    backLabel: STAGE_LABEL[S.stage] || "Channels",
    info: (it) => it._order ? orderInfo(it) : it._n > 1 ? varInfo(it) + `<div class="vx-act"><button class="btn" data-sel type="button">${S.sel.has(String(it.id)) ? "Deselect" : "Select for bulk actions"}</button><button class="btn warn" data-rm type="button">Hide from this app (stays on eBay)</button></div>` : (() => { const sp = loadSpaces().find((s) => s.id === it.spaceId); const on = S.sel.has(String(it.id));
      return `<div class="sub">${esc(STAGE_LABEL[stageOf(it)] || "")}</div><div class="row"><span>Price</span><span>${money(it.price)}</span></div><div class="row"><span>Quantity</span><span>${Number(it.quantity) || 1}</span></div>${(it.photos || []).length > 1 ? `<div class="row"><span>Photos</span><span>${it.photos.length}, all kept together</span></div>` : ""}<div class="row"><span>Bin</span><span>${esc(sp ? sp.name : "Not filed yet")}</span></div>${stageOf(it) === "staged" ? `<button class="btn go" data-build type="button">Build the listing</button>` : ""}<button class="btn" data-sel type="button">${on ? "Deselect" : "Select for bulk actions"}</button><button class="btn warn" data-rm type="button">${String(it.id).startsWith("ebay-") ? "Hide from this app (stays on eBay)" : "Delete this item"}</button>`; })(),
    wire: (root, it, api) => { root.querySelector("[data-vxshow]")?.addEventListener("click", (e) => { root.querySelector("[data-vxall]").classList.add("on"); e.currentTarget.remove(); }); if (!it._order && !(it._n > 1)) { const d = document.createElement("div"); (root.querySelector(".k-zinfo") || root).appendChild(d); photoManager(d, it.id, { toast: ctx.toast, refresh: ctx.refresh }); } root.querySelector("[data-ov]")?.addEventListener("click", (e) => { setOv(it._order.orderId, e.currentTarget.dataset.ov); api.close(); ctx.toast(e.currentTarget.dataset.ov === "delivered" ? "Moved to Delivered" : "Moved back to Shipped"); paint(); }); root.querySelector("[data-build]")?.addEventListener("click", () => { api.close(); buildSheet(it); }); root.querySelector("[data-rm]")?.addEventListener("click", () => removeItem(it, api.close)); root.querySelector("[data-sel]")?.addEventListener("click", () => { toggle(String(it.id)); paint(); root.querySelector("[data-sel]").textContent = S.sel.has(String(it.id)) ? "Deselect" : "Select for bulk actions"; }); },
  });
}
function wire(all) {
  const h = ctx.host, $ = (s) => h.querySelector(s);
  $("#chQ").addEventListener("input", (e) => { S.q = e.target.value; const p = e.target.selectionStart; paint(); const q = h.querySelector("#chQ"); q.focus(); q.setSelectionRange(p, p); });
  $("#chCtl").addEventListener("click", () => { S.drawer = !S.drawer; paint(); });
  $("#chSort")?.addEventListener("change", (e) => { S.sort = e.target.value; paint(); });
  $("#chGroup")?.addEventListener("change", (e) => { S.group = e.target.value; S.more = {}; paint(); });
  h.querySelectorAll("[data-stage]").forEach((b) => b.addEventListener("click", () => { S.stage = b.dataset.stage; S.more = {}; paint(); }));
  h.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => { S.view = b.dataset.view; paint(); }));
  h.querySelectorAll("[data-fold]").forEach((b) => b.addEventListener("click", () => { const k = b.dataset.fold; S.closed.has(k) ? S.closed.delete(k) : S.closed.add(k); paint(); }));
  h.querySelectorAll("[data-more]").forEach((b) => b.addEventListener("click", () => { S.more[b.dataset.more] = (S.more[b.dataset.more] || 120) + 120; paint(); }));
  h.querySelectorAll("[data-selgrp]").forEach((b) => b.addEventListener("click", () => { all.filter((i) => keyOf(i) === b.dataset.selgrp).forEach((i) => S.sel.add(String(i.id))); paint(); }));
  $("#chAll")?.addEventListener("click", () => { all.forEach((i) => S.sel.add(String(i.id))); paint(); });
  h.querySelectorAll("[data-pick]").forEach((p) => p.addEventListener("click", (e) => { e.stopPropagation(); toggle(p.dataset.pick); paint(); }));
  h.querySelectorAll(".ch-tile").forEach((c) => { c.addEventListener("pv:details", () => zoom(all, c)); c.addEventListener("click", (e) => { if (e.target.closest("[data-pick]")) return; if (c.dataset.edit && !e.target.closest(".co-img")) editSheet(all, c.dataset.id); else zoom(all, c); }); c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); zoom(all, c); } }); });
  h.querySelectorAll(".ch-row").forEach((r) => r.addEventListener("click", (e) => { if (e.target.closest("input")) return; zoom(all, r); }));
  h.querySelectorAll(".ch-row input").forEach((c) => c.addEventListener("change", () => { toggle(c.dataset.id); paint(); }));
  $("#chBin")?.addEventListener("change", (e) => { const v = e.target.value; if (!v) return; const ids = [...S.sel], prev = snap(); if (assign(ids, v)) { S.sel.clear(); ctx.refresh(); paint(); ctx.toastUndo(`Filed ${ids.length} into ${loadSpaces().find((s) => s.id === v)?.name}`, () => { restore(prev); ctx.refresh(); paint(); }); } });
  h.querySelectorAll("[data-bulk]").forEach((b) => b.addEventListener("click", () => bulk(b.dataset.bulk)));
  $("#chArchAll")?.addEventListener("click", (e) => { const b = e.currentTarget, list = rows(); if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = `Yes, archive all ${list.length}`; return; } archive(list); S.sel.clear(); paint(); ctx.rerender?.(); ctx.toastUndo(`Archived ${list.length}`, () => { unarchive(list.map((x) => x.id)); paint(); ctx.rerender?.(); }); });
}
const snap = () => ({ items: localStorage.getItem("coalition-items-v4"), spaces: localStorage.getItem("coalition-spaces-v4") });
function restore(p) { try { if (p.items != null) localStorage.setItem("coalition-items-v4", p.items); if (p.spaces != null) localStorage.setItem("coalition-spaces-v4", p.spaces); } catch { /* ignore */ } }
function bulk(kind) {
  const ids = expand([...S.sel]); if (!ids.length && kind !== "clear") return; const set = new Set(ids.map(String)); if (kind === "del") hideIds([...set].filter((x) => x.startsWith("ebay-")));
  if (kind === "clear") { S.sel.clear(); paint(); return; }
  if (kind === "var") { varSheet(loadItems().filter((i) => set.has(String(i.id)))); return; }
  if (kind === "offers") {
    const skus = [...new Set(loadItems().filter((i) => set.has(String(i.id)) && !i.ended).map((i) => i.channels?.ebay?.sku || i.sku).filter(Boolean))];
    if (!skus.length) { ctx.toast("None of those are live on eBay."); return; }
    const pct = (() => { try { return Number(localStorage.getItem("fob-offer-pct")) || 80; } catch { return 80; } })();
    ctx.toast(`Turning on offers for ${skus.length} listing${skus.length === 1 ? "" : "s"}…`);
    fetch("/api/channels/ebay/offers-on", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skus, pct }) }).then((r) => r.json()).then((o) => {
      if (o.ok) { S.sel.clear(); paint(); ctx.toast(`Offers on for ${o.done} listing${o.done === 1 ? "" : "s"}. Offers under ${pct}% are declined for you.`); }
      else ctx.toast(o.done ? `Offers on for ${o.done}. ${o.failed} didn't take: ${o.error || "eBay said no"}` : `eBay said no: ${o.error || "try again"}`);
    }).catch(() => ctx.toast("Couldn't reach eBay. Nothing changed."));
    return;
  }
  if (kind === "pct") {
    const p = parseFloat(String(ctx.host.querySelector("#chPct").value).replace(/[^0-9.\-+]/g, "")); if (!Number.isFinite(p) || !p) { ctx.toast("Type a percent, like -10 or 15."); return; }
    const prev = snap(); if (commit((l) => l.forEach((i) => { if (set.has(String(i.id))) i.price = Math.max(0, Math.round((Number(i.price) || 0) * (1 + p / 100) * 100) / 100); }))) { S.sel.clear(); paint(); ctx.toastUndo(`Changed ${ids.length} prices ${p > 0 ? "+" : ""}${p}% in this app`, () => { restore(prev); ctx.refresh(); paint(); }); }
  } else if (kind === "del" && ids.some((x) => String(x).startsWith("ord-"))) {
    const ords = orderItems().filter((o) => set.has(String(o.id))); archive(ords); S.sel.clear(); paint(); ctx.rerender?.();
    ctx.toastUndo(`Archived ${ords.length} order${ords.length === 1 ? "" : "s"}`, () => { unarchive(ords.map((o) => o.id)); paint(); ctx.rerender?.(); });
  } else if (kind === "del") {
    const prev = snap(); if (commit((l) => { for (let k = l.length - 1; k >= 0; k--) if (set.has(String(l[k].id))) l.splice(k, 1); })) { S.sel.clear(); paint(); ctx.toastUndo(`Removed ${ids.length} from this app`, () => { restore(prev); ctx.refresh(); paint(); }); }
  } else if (kind === "end") {
    const pick = loadItems().filter((i) => set.has(String(i.id)) && i.channels?.ebay && !i.ended && i.phase === "listed");
    if (!pick.length) { ctx.toast("None of those are live on eBay."); return; }
    const groups = new Set(pick.filter((i) => i.groupId).map((i) => i.groupId)).size, singles = pick.filter((i) => !i.groupId).length, n = groups + singles;
    const s = ctx.openSheet(`<h2>End ${n} listing${n === 1 ? "" : "s"} on eBay?</h2><p class="sub">They come off eBay right away. Items stay in this app, marked ended, so you can relist later.</p>
      <div class="bl-vars">${pick.slice(0, 30).map((k) => `<div><span>${esc(nameOf(k))}</span><b>${money(k.price)}</b></div>`).join("")}${pick.length > 30 ? `<div><span>and ${pick.length - 30} more</span></div>` : ""}</div>
      <p class="sub" id="enMsg" role="status"></p><div class="co-znav"><button class="btn warn" id="enGo" type="button">End ${n} on eBay</button><button class="btn" data-close type="button">Cancel</button></div>`);
    let armed = false;
    s.querySelector("#enGo").addEventListener("click", async (e) => {
      const b = e.currentTarget, m = s.querySelector("#enMsg");
      if (!armed) { armed = true; b.textContent = `Yes, end ${n} now`; m.textContent = "Tap again to confirm. This changes real eBay listings."; return; }
      b.disabled = true; m.textContent = "Ending on eBay…";
      try {
        const r = await fetch("/api/channels/ebay/end-listings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: pick.map((i) => ({ id: i.id, offerId: i.channels.ebay.offerId, listingId: i.channels.ebay.listingId, groupId: i.groupId || null })) }) });
        const out = await r.json().catch(() => ({ ended: [], failed: [] })); const done = new Set((out.ended || []).map(String));
        commit((l) => l.forEach((i) => { if (done.has(String(i.id))) { i.ended = true; i.phase = "ended"; i.listingStatus = "draft"; } }));
        S.sel.clear(); ctx.refresh(); paint(); ctx.rerender?.();
        if ((out.failed || []).length) { b.disabled = false; armed = false; b.textContent = "Try the rest again"; m.textContent = `Ended ${done.size}. ${out.failed.length} didn't end: ${out.failed[0].error}`; }
        else { ctx.closeSheet(); ctx.toast(`Ended ${done.size} on eBay`); }
      } catch { b.disabled = false; armed = false; b.textContent = `End ${n} on eBay`; m.textContent = "Couldn't reach eBay. Nothing was ended."; }
    });
  } else if (kind === "live") {
    const pick = loadItems().filter((i) => set.has(String(i.id)) && (i.phase === "staged" || i.ended));
    if (!pick.length) { ctx.toast("Pick items that are ready to list or ended."); return; }
    if (pick.length === 1) { buildSheet(pick[0]); return; }
    const s = ctx.openSheet(`<h2>List ${pick.length} on eBay?</h2><p class="sub">Each one goes live as its own listing with its saved title, price and photos. Want them as one listing instead? Use Make one variation listing.</p>
      <div class="bl-vars">${pick.slice(0, 30).map((k) => `<div><span>${esc(nameOf(k))}</span><b>${money(k.price)}</b></div>`).join("")}</div>
      <p class="sub" id="lvMsg" role="status"></p><div class="co-znav"><button class="btn go" id="lvGo" type="button">List ${pick.length} on eBay</button><button class="btn" data-close type="button">Cancel</button></div>`);
    let armed = false;
    s.querySelector("#lvGo").addEventListener("click", async (e) => {
      const b = e.currentTarget, m = s.querySelector("#lvMsg");
      if (!armed) { armed = true; b.textContent = `Yes, list ${pick.length} now`; m.textContent = "Tap again to confirm. They go live right away."; return; }
      b.disabled = true; let ok = 0; const bad = [];
      for (const [k, it] of pick.entries()) {
        m.textContent = `Listing ${k + 1} of ${pick.length}…`;
        try {
          const r = await fetch("/api/channels/ebay/publish-item", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item: it }) });
          const out = await r.json().catch(() => ({}));
          if (!r.ok || !out.ok) { bad.push(`${nameOf(it)}: ${out.error || "eBay said no"}`); continue; }
          ok++; commit((l) => { const x = l.find((i) => String(i.id) === String(it.id)); if (x) { x.phase = "listed"; x.ended = false; x.listingStatus = "active"; x.staged = false; x.channels = Object.assign({}, x.channels, { ebay: { listingId: out.listingId, offerId: out.offerId, sku: out.sku, at: new Date().toISOString() } }); } });
        } catch { bad.push(`${nameOf(it)}: couldn't reach eBay`); }
      }
      S.sel.clear(); ctx.refresh(); paint(); ctx.rerender?.();
      if (bad.length) { b.disabled = false; armed = false; b.textContent = "Close"; b.onclick = () => ctx.closeSheet(); m.textContent = `Listed ${ok}. ${bad.length} didn't: ${bad.slice(0, 3).join(" · ")}`; }
      else { ctx.closeSheet(); ctx.toast(`Listed ${ok} on eBay`); }
    });
  }
}

/* ---------- Variation listing: several cards become ONE eBay listing ---------- */
function varSheet(list) {
  const ok = list.filter((i) => i.phase === "staged" && (i.photos || []).length);
  if (ok.length < 2) { ctx.toast("You need 2 or more ready-to-list items with photos."); return; }
  const s = ctx.openSheet(`<a class="back" href="#" data-close>‹ Back</a><h2>One variation listing</h2><p class="sub">${ok.length} cards become one eBay listing. Buyers pick their card.</p>
    <div class="bl-vars" style="max-height:320px">${ok.map((i, k) => `<div style="gap:8px;align-items:center"><input type="checkbox" data-vk="${k}" checked aria-label="Include"><span>${esc(nameOf(i))}</span><input data-vp="${k}" inputmode="decimal" value="${esc(Number(i.price) || "")}" aria-label="Price" style="width:72px;text-align:right"></div>`).join("")}</div>
    <div id="vlMsg" class="sub bl-msg" role="status">Nothing goes live until you tap List on eBay twice.</div>
    <div class="co-znav bl-act"><button class="btn go" id="vlGo" type="button">List on eBay</button></div>`);
  const $ = (q) => s.querySelector(q), msg = (t, bad) => { const m = $("#vlMsg"); m.textContent = t; m.style.color = bad ? "var(--org)" : ""; };
  s.querySelector("[data-close]").addEventListener("click", (e) => { e.preventDefault(); ctx.closeSheet(); });
  const read = () => { const on = ok.map((i, k) => [i, k]).filter(([, k]) => s.querySelector(`[data-vk="${k}"]`).checked); if (on.length < 2) { msg("Tick at least 2 cards.", true); return null; } const ps = on.map(([, k]) => parseFloat(String(s.querySelector(`[data-vp="${k}"]`).value).replace(/[^0-9.]/g, ""))); if (ps.some((p) => !(p > 0))) { msg("Every ticked card needs a price.", true); return null; } return on.map(([i], j) => Object.assign({}, i, { price: ps[j] })); };
  const call = async (dryRun) => {
    const items = read(); if (!items) return null;
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 120000);
    try {
      const r = await fetch("/api/channels/ebay/publish-variation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, dryRun, bestOffer: true, offerFloorPct: (() => { try { return Number(localStorage.getItem("fob-offer-pct")) || 80; } catch { return 80; } })() }), signal: ctl.signal });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || !out.ok) { msg(out.error || "eBay said no. Nothing was listed.", true); return null; }
      return { out, items };
    } catch (e) { msg(e.name === "AbortError" ? "That took too long. Nothing was confirmed. Check eBay before trying again." : "Couldn't reach the server. Nothing was listed.", true); return null; } finally { clearTimeout(to); }
  };
  const busy = (on) => { $("#vlGo").disabled = on; };
  let armed = null;
  $("#vlGo").addEventListener("click", async () => {
    const pick = read(); if (!pick) return;
    if (!armed) { armed = setTimeout(() => { armed = null; $("#vlGo").textContent = "List on eBay"; }, 10000); $("#vlGo").textContent = `Yes, list all ${pick.length} now`; msg("This goes live on eBay right away. Tap again to confirm.", false); return; }
    clearTimeout(armed); armed = null; busy(true); msg("Listing on eBay…");
    const r = await call(false); busy(false); $("#vlGo").textContent = "List on eBay"; if (!r) return;
    const lid = r.out.published?.listingId || r.out.groupId, ids = new Set(r.items.map((i) => String(i.id))), price = new Map(r.items.map((i) => [String(i.id), i.price]));
    commit((l) => l.forEach((i) => { if (ids.has(String(i.id))) { i.phase = "listed"; i.listingStatus = "active"; i.staged = false; i.price = price.get(String(i.id)); i.channels = Object.assign({}, i.channels, { ebay: { listingId: lid, sku: `hud-${i.id}`, at: new Date().toISOString() } }); i.updatedAt = new Date().toISOString(); } }));
    S.sel.clear(); ctx.closeSheet(); S.stage = "listed"; paint(); ctx.rerender?.(); ctx.toast("Listed as one variation listing on eBay.");
  });
}

/* ---------- Build the listing: review, check with eBay, list ---------- */
function patchItem(id, mut) { const l = loadItems(); const it = l.find((x) => String(x.id) === String(id)); if (!it) return null; mut(it); it.updatedAt = new Date().toISOString(); saveItems(l); ctx.refresh(); return it; }
function removeItem(it, close) {
  const prev = snap(), gone = new Set(expand([String(it.id)]).map(String)); hideIds([...gone].filter((x) => x.startsWith("ebay-")));
  if (commit((l) => { for (let k = l.length - 1; k >= 0; k--) if (gone.has(String(l[k].id))) l.splice(k, 1); })) { close && close(); S.sel.delete(String(it.id)); paint(); ctx.toastUndo(`Deleted ${nameOf(it)}`, () => { restore(prev); ctx.refresh(); paint(); }); }
}
function buildSheet(it) {
  if (!it) return;
  const ph = it.photos || [];
  const s = ctx.openSheet(`<a class="back" href="#" data-close>‹ Back</a><h2>Build the listing</h2>
    <div class="bl-ph" id="blPh"></div>
    <p class="sub">${ph.length} photo${ph.length === 1 ? "" : "s"} on one listing. ${ph.length > 1 ? "Tap a photo to make it the main one." : ""}</p>
    <label class="sc-f"><span>Title</span><input id="blTitle" maxlength="80" value="${esc(nameOf(it))}"></label>
    <label class="sc-f"><span>Price</span><input id="blPrice" inputmode="decimal" value="${esc(Number(it.price) || "")}"></label>
    <label class="sc-f"><span>Quantity</span><input id="blQty" inputmode="numeric" value="${esc(Number(it.quantity) || 1)}"></label>
    <div class="bl-cat sub" id="blCat">Checking eBay category…</div>
    <label class="sc-f"><span>Condition</span><select id="blCond">${[["NM", "Near Mint"], ["LP", "Lightly Played"], ["MP", "Moderately Played"], ["HP", "Heavily Played"]].map(([k, l]) => `<option value="${k}"${String(it.condition || "NM").toUpperCase() === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>
    <div class="sc-f"><span class="bl-lh">Description <button type="button" class="bl-mini" id="blRedo">Rewrite from the item</button></span><textarea id="blDesc" rows="9" style="width:100%;resize:vertical">${esc(it.description || "")}</textarea></div>
    <div class="sc-f"><span class="bl-lh">Item specifics <em id="blAspN"></em></span><p class="sub bl-hint">Filled from the item where we're sure. Fill any empty ones you know: every one you add helps buyers find it.</p><div id="blAsp" class="bl-vars bl-asp" style="max-height:none"></div><button class="btn" id="blAddAsp" type="button" style="margin-top:6px">Add item specific</button></div>
    <div class="sc-f"><span>Offers</span><div class="bl-off"><label><input type="checkbox" id="blOffer" checked> Accept offers</label><label class="bl-offp">Auto-decline under <input id="blOfferPct" inputmode="numeric" value="${(() => { try { return localStorage.getItem("fob-offer-pct") || "80"; } catch { return "80"; } })()}">% of price</label></div></div>
    <div class="sc-f"><span>Shipping, returns and payment</span><div id="blPol" class="sub">Loading your eBay policies…</div></div>
    <div class="bl-var sub">Several cards from one set? <button type="button" class="bl-mini" id="blVar">List them as one listing, buyers pick</button></div>
    <label class="sc-f" style="flex-direction:row;gap:10px;align-items:center"><input type="checkbox" id="blDH" checked><span>Also download the Double Holo files (cards + photos) after listing</span></label>
    <div id="blMsg" class="sub bl-msg" role="status">Nothing goes live until you tap List on eBay twice.</div>
    <div class="co-znav bl-act"><button class="btn" id="blSave" type="button">Save draft</button><button class="btn go" id="blGo" type="button">List on eBay</button></div>`);
  let dlN = 0; const aspRow = (k = "", v = "", vals = [], req = false) => { const dl = vals.length ? `bl-dl-${++dlN}` : ""; return `<div class="bl-ar${req ? " req" : ""}${v ? "" : " blank"}" style="gap:6px;align-items:center;display:flex"><input data-ak value="${esc(k)}" placeholder="Name" aria-label="Item specific name" style="flex:1;min-width:0"><input data-av value="${esc(v)}" placeholder="${req ? "Required" : "Optional"}" aria-label="${esc(k || "Item specific")} value" style="flex:1;min-width:0"${dl ? ` list="${dl}"` : ""}>${dl ? `<datalist id="${dl}">${vals.map((x) => `<option value="${esc(x)}">`).join("")}</datalist>` : ""}<button class="btn" data-rm type="button" aria-label="Remove this item specific" style="flex:none;padding:6px 12px">×</button></div>`; };
  const $ = (q) => s.querySelector(q), msg = (t, bad) => { const m = $("#blMsg"); m.textContent = t; m.style.color = bad ? "var(--org)" : ""; };
  let armed = null;
  const paintPh = () => { const cur = loadItems().find((x) => String(x.id) === String(it.id)) || it, list = cur.photos || []; $("#blPh").innerHTML = list.map((p, k) => `<button type="button" class="bl-pic${k === 0 ? " on" : ""}" data-k="${k}" aria-label="${k === 0 ? "Main photo" : "Make this the main photo"}"><img src="${esc(p.dataUrl || p.url || "")}" alt="" draggable="false">${k === 0 ? "<b>Main</b>" : ""}</button>`).join(""); };
  paintPh();
  $("#blPh").addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (!b || b.dataset.k === "0") return; const k = Number(b.dataset.k); patchItem(it.id, (i) => { const l = i.photos || []; const [m] = l.splice(k, 1); l.unshift(m); i.photos = l; }); paintPh(); });
  $("#blDesc").value = it.description || "";
  $("#blAddAsp").addEventListener("click", () => { $("#blAsp").insertAdjacentHTML("beforeend", aspRow()); });
  $("#blAsp").addEventListener("click", (e) => { const b = e.target.closest("[data-rm]"); if (b) b.parentElement.remove(); });
  if (!(Number(it.price) > 0)) { /* no price yet: look one up so the item can be listed */
    const pe = $("#blPrice"); pe.placeholder = "Looking up a price…";
    const qs = new URLSearchParams({ q: nameOf(it), name: it.productName || nameOf(it), number: it.collectorNumber || it.number || "", set: it.setName || "", game: it.game || "" });
    fetch(`/api/scouter/comps?${qs}`).then((r) => r.json()).then((r) => { if (!s.isConnected || pe.value) return; if (r.ok && r.value > 0) { pe.value = Number(r.value).toFixed(2); pe.dispatchEvent(new Event("input", { bubbles: true })); msg(`Price filled from ${r.basis || "eBay"}${r.count ? ` (${r.count} listings)` : ""}. Change it if you want.`); } else { pe.placeholder = "Type a price"; msg("Couldn't find a price. Type one.", true); } }).catch(() => { if (s.isConnected) pe.placeholder = "Type a price"; });
  }
  let pv = null;
  const countAsp = () => { const rows = [...s.querySelectorAll("#blAsp > div")], n = rows.filter((r) => r.querySelector("[data-av]").value.trim()).length; $("#blAspN").textContent = `${n} of ${rows.length} filled`; rows.forEach((r) => r.classList.toggle("blank", !r.querySelector("[data-av]").value.trim())); };
  $("#blAsp").addEventListener("input", countAsp);
  $("#blDesc").addEventListener("input", (e) => { if (e.isTrusted) patchItem(it.id, (i) => { i.descEdited = true; }); });
  $("#blRedo").addEventListener("click", () => { if (pv && pv.description) { $("#blDesc").value = pv.description; $("#blDesc").dispatchEvent(new Event("input", { bubbles: true })); } });
  $("#blVar").addEventListener("click", () => { const others = loadItems().filter((i) => i.phase === "staged" && !i.ended && (i.photos || []).length); if (others.length < 2) { ctx.toast("Save this as a draft, scan the other cards, then tap this again. Every Ready-to-list card shows up to pick from."); return; } ctx.closeSheet(); setTimeout(() => varSheet(others), 280); });
  fetch("/api/channels/ebay/listing-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item: it }) }).then((r) => r.json()).then((p) => {
    if (!p || !p.ok || !s.isConnected) return;
    pv = p;
    $("#blCat").innerHTML = `eBay category: <b>${esc(p.category?.name || "CCG Individual Cards")}</b>`;
    if (p.kind === "product") { const c = /^(used|pre)/i.test(String(it.condition || "")) ? "USED" : "NEW"; $("#blCond").innerHTML = `<option value="NEW"${c === "NEW" ? " selected" : ""}>New</option><option value="USED"${c === "USED" ? " selected" : ""}>Used (pre-owned)</option>`; }
    /* old auto descriptions carried card filler and the shipping line: replace those, keep anything you wrote yourself */
    const d0 = $("#blDesc").value, auto = !d0.trim() || !it.descEdited || /Combined shipping|^Game: |: —$/m.test(d0);
    if (auto) $("#blDesc").value = p.description || "";
    const names = new Set((p.allNames || []).map((n) => n.toLowerCase())), ex = Object.fromEntries(Object.entries(it.aspects || {}).filter(([k]) => !names.size || names.has(k.toLowerCase())));
    const all = Object.assign({}, p.aspects, ex);
    $("#blAsp").innerHTML = Object.entries(all).map(([k, v]) => aspRow(k, Array.isArray(v) ? v.join(", ") : v)).join("") + (p.more || []).filter((m) => !(m.name in all)).map((m) => aspRow(m.name, "", m.values || [], m.required)).join("");
    countAsp();
    const line = (l, o) => `<div class="row"><span>${l}</span><span>${o ? esc(o.name) : "Not set up in eBay yet"}</span></div>`;
    const opts = p.shippingOptions || [], cur = it.fulfillmentPolicyId || (p.shipping && p.shipping.id) || "";
    const shipRow = opts.length ? `<label class="sc-f"><span>Shipping</span><select id="blShip">${opts.map((o) => `<option value="${esc(o.id)}"${String(o.id) === String(cur) ? " selected" : ""}>${esc(o.name)}</option>`).join("")}</select></label>` : line("Shipping", p.shipping);
    const ropts = p.returnOptions || [], rcur = it.returnPolicyId || (p.returns && p.returns.id) || "";
    const retRow = ropts.length ? `<label class="sc-f"><span>Returns</span><select id="blRet">${ropts.map((o) => `<option value="${esc(o.id)}"${String(o.id) === String(rcur) ? " selected" : ""}>${esc(o.name)}</option>`).join("")}</select></label>` : line("Returns", p.returns);
    $("#blPol").innerHTML = shipRow + retRow + line("Payment", p.payment);
  }).catch(() => { if (s.isConnected) $("#blPol").textContent = "Couldn't load your eBay policies. eBay will use your defaults."; });
  const read = () => {
    const title = $("#blTitle").value.trim().slice(0, 80), price = parseFloat(String($("#blPrice").value).replace(/[^0-9.]/g, "")), qty = Math.max(1, parseInt($("#blQty").value, 10) || 1), cond = $("#blCond").value;
    const need = (id, t, elx) => { msg(t, true); ctx.toast(t); const el = elx || $(id); el.classList.add("bl-need"); el.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => el.focus(), 250); el.addEventListener("input", () => el.classList.remove("bl-need"), { once: true }); return null; };
    if (!title) return need("#blTitle", "Add a title first. It's at the top.");
    if (!(price > 0)) return need("#blPrice", "Add a price first. The price box is highlighted.");
    const aspects = {}; s.querySelectorAll("#blAsp > div").forEach((r) => { const k = r.querySelector("[data-ak]").value.trim(), v = r.querySelector("[data-av]").value.trim(); if (k && v) aspects[k] = v; });
    const ship = s.querySelector("#blShip"), ret = s.querySelector("#blRet"), pct = Math.min(99, Math.max(1, parseInt($("#blOfferPct").value, 10) || 80)); try { localStorage.setItem("fob-offer-pct", String(pct)); } catch { /* ignore */ }
    const missing = [...s.querySelectorAll("#blAsp > div.req")].find((r) => !r.querySelector("[data-av]").value.trim()); if (missing) return need(null, `eBay requires ${missing.querySelector("[data-ak]").value}. Fill the highlighted box.`, missing.querySelector("[data-av]"));
    return { title, price, quantity: qty, condition: cond, ...(ship ? { fulfillmentPolicyId: ship.value } : {}), ...(ret ? { returnPolicyId: ret.value } : {}), ...(pv?.category?.id ? { categoryId: pv.category.id, categoryName: pv.category.name } : {}), bestOffer: $("#blOffer").checked, offerFloorPct: pct, description: $("#blDesc").value.trim() || title, aspects };
  };
  const call = async (dryRun) => {
    const f = read(); if (!f) return null;
    const saved = patchItem(it.id, (i) => Object.assign(i, f)) || Object.assign({}, it, f);
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 90000);
    try {
      const res = await fetch("/api/channels/ebay/publish-item", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item: saved, dryRun }), signal: ctl.signal });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) {
        const e = String(out.error || ""), miss = e.match(/item specific (.+?) is missing/i);
        if (miss) { /* eBay wants one more detail: add the box for it and point at it */
          const name = miss[1].trim(); let row = [...s.querySelectorAll("#blAsp > div")].find((r) => r.querySelector("[data-ak]").value.trim().toLowerCase() === name.toLowerCase());
          if (!row) { $("#blAsp").insertAdjacentHTML("beforeend", aspRow(name, "")); row = $("#blAsp").lastElementChild; }
          const v = row.querySelector("[data-av]"); v.classList.add("bl-need"); v.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => v.focus(), 250); v.addEventListener("input", () => v.classList.remove("bl-need"), { once: true });
          msg(`eBay needs one more detail: ${name}. Type it in the highlighted box, then tap List on eBay again.`, true); ctx.toast(`eBay needs "${name}". Fill the highlighted box.`);
        } else msg(e ? `eBay said no: ${e.replace(/^eBay API \S+ \S+ failed \(\d+\): /, "")}` : "eBay said no. Check the details and try again.", true);
        return null;
      }
      return out;
    } catch (e) { msg(e.name === "AbortError" ? "eBay took too long. Nothing was listed. Try again." : "Couldn't reach eBay. Nothing was listed.", true); return null; }
    finally { clearTimeout(to); }
  };
  /* drafts: everything you type is kept on the item, so closing the builder never loses work */
  const draftRead = () => { const g = (q) => s.querySelector(q); const price = parseFloat(String(g("#blPrice")?.value || "").replace(/[^0-9.]/g, "")), aspects = {};
    s.querySelectorAll("#blAsp > div").forEach((r) => { const k = r.querySelector("[data-ak]").value.trim(), v = r.querySelector("[data-av]").value.trim(); if (k && v) aspects[k] = v; });
    const ship = g("#blShip"), ret = g("#blRet"); return Object.assign({ ...(ret ? { returnPolicyId: ret.value } : {}), title: (g("#blTitle")?.value || "").trim().slice(0, 80), quantity: Math.max(1, parseInt(g("#blQty")?.value, 10) || 1), condition: g("#blCond")?.value, description: (g("#blDesc")?.value || "").trim(), aspects, draft: { savedAt: new Date().toISOString() } }, price > 0 ? { price } : {}, ship ? { fulfillmentPolicyId: ship.value } : {}); };
  const saveDraft = () => { const d = draftRead(); patchItem(it.id, (i) => { Object.assign(i, d); if (!i.title) delete i.title; }); };
  let dT = 0; s.addEventListener("input", () => { clearTimeout(dT); dT = setTimeout(saveDraft, 600); }); s.addEventListener("change", () => { clearTimeout(dT); dT = setTimeout(saveDraft, 300); });
  $("#blSave").addEventListener("click", () => { clearTimeout(dT); saveDraft(); ctx.closeSheet(); ctx.rerender?.(); window.__fobScRepaint?.(); ctx.toast("Draft saved. It's waiting in Ready to list."); });
  const busy = (on) => { $("#blGo").disabled = on; $("#blSave").disabled = on; };
  $("#blGo").addEventListener("click", async () => {
    const f = read(); if (!f) return;
    if (!armed) { armed = setTimeout(() => { armed = null; $("#blGo").textContent = "List on eBay"; }, 10000); $("#blGo").textContent = `Yes, list it now for ${money(f.price)}`; msg("This goes live on eBay right away. Tap again to confirm.", false); return; }
    clearTimeout(armed); armed = null; busy(true); msg("Listing on eBay…");
    const out = await call(false); busy(false); $("#blGo").textContent = "List on eBay";
    if (!out) return;
    patchItem(it.id, (i) => { i.phase = "listed"; i.listingStatus = "active"; i.staged = false; i.channels = Object.assign({}, i.channels, { ebay: { listingId: out.listingId, offerId: out.offerId, sku: out.sku, at: new Date().toISOString() } }); if ((out.imageUrls || []).length >= (i.photos || []).length) i.photos = out.imageUrls.map((u, k) => ({ id: `eb-${k}`, dataUrl: u })); });
    const wantDH = $("#blDH").checked, dhItem = Object.assign({}, it, f, { id: it.id });
    ctx.closeSheet(); S.stage = "listed"; paint(); ctx.rerender?.(); ctx.toast("Listed on eBay. Next: put it away in its bin.");
    if (wantDH) {
      const dl = async (source, items, name) => { try { const r = await fetch("/api/csv/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, items: items.map((x) => Object.assign({}, x, { photos: (x.photos || []).map((p) => ({ url: p.url || p.dataUrl || "" })).filter((p) => /^https?:/.test(p.url)) })) }) }); if (!r.ok) return false; const u = URL.createObjectURL(await r.blob()), a = document.createElement("a"); a.href = u; a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); return true; } catch { return false; } };
      const ok1 = await dl("double_holo", [dhItem], "double-holo-cards");
      await new Promise((r) => setTimeout(r, 700));
      const ok2 = (out.imageUrls || []).length ? await dl("double_holo_photos", [Object.assign({}, dhItem, { picUrls: out.imageUrls })], "double-holo-photos") : false;
      ctx.toast(ok1 && ok2 ? "Double Holo files downloaded: upload the cards file, then the photos file." : ok1 ? "Cards file downloaded. Photos file couldn't be made." : "Couldn't make the Double Holo files.");
    }
  });
}
export function renderChannels(host, api) { ctx = { host, ...api }; if (window.__chStage) { S.stage = /^(intake|staged)$/.test(window.__chStage) ? "listed" : window.__chStage; S.more = {}; window.__chStage = null; } if (/^(intake|staged)$/.test(S.stage)) S.stage = "listed"; if (!host.querySelector(".ch-wrap")) S.sel.clear(); paint(); }
/* Listing is built from Command, never from the Channels page (Channels = what is live on eBay). */
export function editListing(id, api) { ctx = { host: document.createElement("div"), ...api }; const it = loadItems().find((x) => String(x.id) === String(id)); if (it) editSheet([it], id); }
export function buildListing(id, api) { ctx = { host: document.createElement("div"), ...api }; const it = loadItems().find((x) => String(x.id) === String(id)); if (it) buildSheet(it); }
export function variationListing(api) { ctx = { host: document.createElement("div"), ...api }; varSheet(shown().filter((i) => i.phase === "staged" && !i.ended)); }
