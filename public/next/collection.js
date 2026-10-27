import { photoManager } from "./photos.js?v=5";
import { hideIds, unhideIds } from "./orders.js?v=9";
import { openCard, ringGauge, shelf, svCard } from "./kit.js?v=9";
import { esc, money, nameOf, photoOf, onHand, laneOf, gameOf, peekItems, loadItems, saveItems, loadSpaces, assign, catOf } from "./shared.js?v=7";

let ctx = null;
const S = { bset: "", bpg: 0, q: "", stage: "all", cat: "All", sort: "value", sel: new Set(), selecting: false, menu: false, more: 48 };
const phoneNow = () => matchMedia("(max-width:820px)").matches;

/* Collection is TCG only: card singles, graded slabs and sealed TCG product. Figures, Pez, binders, sleeves, golf clubs etc. stay in Channels. */
const NOT_TCG = /\b(dispenser|pez|figures?|figurine|statue|plush|toys?|funko|keychain|poster|t-?shirt|mug|lunch ?box|backpack|lego|puzzle|game boy|nintendo switch|cartridge|dvd|lamp|blanket|binder|album|portfolio|sleeves|playmat|deck box|toploaders?|card storage|golf|taylormade|callaway|ping g\d+|headphones?|controller|sneakers?)\b/i;
/* cards, slabs and sealed TCG product. Unnamed drafts (sku-…, IMG_…, barcodes) wait in Command until they're identified. */
export function isTcg(it) {
  const t = nameOf(it).trim();
  if (/^(sku-\d+|img_\d+|\d{8,}|draft listing.*|untitled.*)$/i.test(t)) return false;
  return !NOT_TCG.test(t);
}
function rows() {
  const q = S.q.trim().toLowerCase();
  return peekItems().filter(onHand).filter(isTcg).filter((it) => {
    if (S.stage === "ready" && it.phase !== "staged") return false;
    if (S.stage === "live" && it.phase !== "listed") return false;
    if (S.stage === "new" && it.phase !== "intake") return false;
    if (S.cat !== "All" && catOf(it) !== S.cat) return false;
    return !q || nameOf(it).toLowerCase().includes(q) || gameOf(it).toLowerCase().includes(q);
  }).sort((a, b) => S.sort === "name" ? nameOf(a).localeCompare(nameOf(b)) : S.sort === "new" ? String(b.createdAt || "").localeCompare(String(a.createdAt || "")) : (Number(b.price) || 0) - (Number(a.price) || 0));
}
const STAGE = { intake: "Intake", staged: "Ready to list", listed: "Live on eBay" };
/* Where it is for sale: eBay vs Double Holo vs not listed anywhere yet */
const where = (it) => String(it.id).startsWith("mp-") ? "On Double Holo" : it.phase === "listed" ? "Live on eBay" : String(it.id).startsWith("ebay-") && it.phase === "staged" ? "eBay draft" : it.phase === "staged" ? "Ready to list" : "Not listed";
function card(it) {
  const src = photoOf(it), fresh = it.source === "scouter" && Date.now() - Date.parse(it.createdAt || 0) < 864e5;
  return `<article class="co-card${S.sel.has(String(it.id)) ? " sel" : ""}" draggable="true" data-id="${esc(it.id)}" tabindex="0">
    <div class="co-art"><div class="co-img k-tilt" data-tilt="1.1">${src ? `<img src="${esc(src)}" alt="" loading="lazy" draggable="false">` : `<span class="co-ini">${esc(nameOf(it).charAt(0))}</span>`}<i class="co-sheen"></i><span class="co-price">${money(it.price)}</span>${fresh ? `<span class="co-new">Just added</span>` : `<span class="co-st">${where(it)}</span>`}</div>${S.selecting ? `<i class="co-pick">${S.sel.has(String(it.id)) ? "✓" : ""}</i>` : ""}</div>
    <div class="co-cap"><span>${esc(nameOf(it))}</span></div></article>`;
}
/* ===================== Collection = the vault (Oct 25 v2): what you own, how it's grown, where it lives ===================== */
const SLAB = /\b(PSA|BGS|CGC|SGC|TAG|BCCG|HGA|Beckett)\s?(10|[1-9](\.5)?|AUTH|Authentic)\b/i;
const SEALED_W = /\b(booster|pack|box|(?<!upper )deck|tin|bundle|blister|etb|elite trainer|display|case|starter|collection)\b/i;
const kindOf = (it) => SLAB.test(nameOf(it)) ? "graded" : laneOf(it) === "sealed" || (SEALED_W.test(nameOf(it)) && !/\bsingle\b/i.test(nameOf(it))) ? "sealed" : "singles";
const VK = [["all", "Everything"], ["graded", "Graded"], ["singles", "Binder"], ["sealed", "Sealed"]];
function growth(all) {
  /* value you added, month by month, from when each item came in */
  const pts = new Map(); for (const it of all) { const t = Date.parse(it.createdAt || 0); if (!t) continue; const d = new Date(t), k = d.getFullYear() * 12 + d.getMonth(); pts.set(k, (pts.get(k) || 0) + (Number(it.price) || 0) * (Number(it.quantity) || 1)); }
  const now = new Date(), end = now.getFullYear() * 12 + now.getMonth(), start = end - 11; let acc = 0; for (const [k, v] of pts) if (k < start) acc += v;
  const series = []; for (let k = start; k <= end; k++) { acc += pts.get(k) || 0; series.push(acc); }
  if (series[0] >= series[11] * .9) return "";
  const mx = Math.max(1, ...series), W = 300, H = 70, xs = (j) => (j / 11) * W, ys = (v) => H - 6 - (v / mx) * (H - 14);
  const line = series.map((v, j) => `${j ? "L" : "M"}${xs(j).toFixed(1)},${ys(v).toFixed(1)}`).join(" ");
  const mo = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  return `<svg class="vg" viewBox="0 0 ${W} ${H + 14}" preserveAspectRatio="none" aria-label="Collection value over the last 12 months"><defs><linearGradient id="vgF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7DF2B4" stop-opacity=".35"/><stop offset="1" stop-color="#7DF2B4" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L${W},${H} L0,${H} Z" fill="url(#vgF)"/><path d="${line}" fill="none" stroke="#7DF2B4" stroke-width="2" vector-effect="non-scaling-stroke"/>
    <circle cx="${xs(11)}" cy="${ys(series[11])}" r="3.5" fill="#D2FFE6"/>${series.map((_, j) => j % 2 === 1 ? "" : `<text x="${xs(j)}" y="${H + 12}" text-anchor="${j === 0 ? "start" : "middle"}">${mo[(start + j) % 12]}</text>`).join("")}</svg>`;
}
function vaultTop(all, total, base) {
  const paid = all.reduce((a, i) => a + (Number(i.purchasePrice) || 0) * (Number(i.quantity) || 1), 0), d = total - paid;
  const n = (k) => base.filter((i) => kindOf(i) === k).length, kind = S.kind || "all";
  return `<header class="vt"><div class="vt-v"><em>Collection value</em><b>${money(total)}</b><span>${all.length} item${all.length === 1 ? "" : "s"}${paid ? ` · <i class="${d >= 0 ? "up" : "down"}">${d >= 0 ? "+" : "−"}${money(Math.abs(d))} vs paid</i>` : ""}</span></div>
      <div class="vk" role="tablist" aria-label="Show">${VK.map(([k, l]) => `<button type="button" role="tab" aria-selected="${kind === k}" class="vk-b${kind === k ? " on" : ""}" data-kind="${k}">${l}<b>${k === "all" ? base.length : n(k)}</b></button>`).join("")}</div>
      <span class="cx-tools"><button class="cx-btn cx-find${S.list ? " on" : ""}" id="coFind" type="button" aria-label="Search and list" aria-pressed="${!!S.list}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button><button class="cx-btn${S.selecting ? " on" : ""}" id="coSel" type="button">${S.selecting ? "Done" : "Select"}</button><button class="cx-btn" id="coMenuBtn" type="button" aria-expanded="${!!S.menu}" aria-label="Sort, filter, import">⋯</button></span></header>
    ${growth(base)}`;
}
function vaultBody(all) {
  const kind = S.kind || "all", pick = (k) => all.filter((i) => kindOf(i) === k), val = (l) => money(l.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0));
  const graded = pick("graded").sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0)), singles = pick("singles"), sealed = pick("sealed");
  const ph = (it) => { const s = photoOf(it); return s ? `<img src="${esc(s)}" alt="" loading="lazy" draggable="false">` : `<i>${esc(nameOf(it).charAt(0))}</i>`; };
  /* tapping a photo opens it full screen (zoom in); "Details" from there opens the item */
  const pv = (it) => { const all = (it.photos || []).map((p) => p.dataUrl || p.url).filter(Boolean); return all.length ? ` data-view-photo="${esc(JSON.stringify(all))}" data-view-id="${esc(it.id)}"` : ""; };
  const gradeOf = (it) => { const m = nameOf(it).match(SLAB); return m ? `${m[1].toUpperCase()} ${m[2]}` : "Graded"; };
  let out = "";
  if ((kind === "all" || kind === "singles") && singles.length) {
    const sets = new Map(); for (const it of singles) { if (!photoOf(it) && !(Number(it.price) > 0)) continue; const k = it.setName || gameOf(it); if (!sets.has(k)) sets.set(k, []); sets.get(k).push(it); }
    const order = [...sets.entries()].sort((a, b) => b[1].length - a[1].length);
    if (order.length) {
      if (!sets.has(S.bset)) { S.bset = order[0][0]; S.bpg = 0; }
      const l = [...sets.get(S.bset)].sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0)), per = innerWidth > 820 ? 18 : 9, spreads = Math.max(1, Math.ceil(l.length / per));
      S.bpg = Math.min(Math.max(0, S.bpg), spreads - 1);
      const pg = (from) => { const c = l.slice(from, from + 9); return `<div class="bn-pg">${c.map((it) => `<button type="button" class="bd-p" data-vid="${esc(it.id)}"${pv(it)} aria-label="${esc(nameOf(it))} ${money(it.price)}">${ph(it)}<em>${money(it.price)}</em></button>`).join("")}${Array.from({ length: 9 - c.length }, () => `<span class="bd-p empty"></span>`).join("")}</div>`; };
      const at = S.bpg * per;
      out += `<section class="vs bn-sec"><header class="vs-h"><b>Binder</b><span>${val(l)} in ${esc(S.bset)}</span></header>
      <div class="bn-tabs hscroll" role="tablist">${order.map(([k, x]) => `<button type="button" role="tab" class="bn-t${k === S.bset ? " on" : ""}" aria-selected="${k === S.bset}" data-bset="${esc(k)}">${esc(k)}<b>${x.length}</b></button>`).join("")}</div>
      <div class="bn"><div class="bn-spread${per === 9 ? " one" : ""}">${pg(at)}${per === 18 ? `<i class="bn-rings" aria-hidden="true"></i>${pg(at + 9)}` : ""}</div>
      <div class="bn-nav"><button type="button" class="bn-a" data-bflip="-1" aria-label="Previous page"${S.bpg ? "" : " disabled"}>‹</button><span>Page ${S.bpg + 1} of ${spreads}</span><button type="button" class="bn-a" data-bflip="1" aria-label="Next page"${S.bpg < spreads - 1 ? "" : " disabled"}>›</button></div></div></section>`;
    }
  }
  let side = "";
  if ((kind === "all" || kind === "graded") && graded.length) side += `<section class="vs"><header class="vs-h"><b>Graded case</b><span>${graded.length} · ${val(graded)}</span></header>
    <div class="slabs hscroll">${graded.slice(0, kind === "graded" ? 200 : 24).map((it) => `<button type="button" class="slab" data-vid="${esc(it.id)}"${pv(it)} aria-label="${esc(nameOf(it))}"><span class="slab-l"><b>${esc(gradeOf(it))}</b><em>${money(it.price)}</em></span><span class="slab-w">${ph(it)}</span></button>`).join("")}</div></section>`;
  if ((kind === "all" || kind === "sealed") && sealed.length) side += `<section class="vs"><header class="vs-h"><b>Sealed shelf</b><span>${sealed.length} · ${val(sealed)}</span></header>
    <div class="shelf hscroll">${sealed.slice(0, kind === "sealed" ? 200 : 30).map((it) => `<button type="button" class="box" data-vid="${esc(it.id)}"${pv(it)} aria-label="${esc(nameOf(it))}"><span class="box-a">${ph(it)}</span><em>${money(it.price)}</em><span class="box-n">${esc(nameOf(it))}</span></button>`).join("")}</div></section>`;
  if (side) out += `<div class="vrow">${side}</div>`;
  return out || `<div class="co-empty">Nothing here yet.</div>`;
}
/* category share: one segmented bar, each segment is a filter */
function catBar(base, cats) {
  const tot = base.length || 1, list = [["All", base.length], ...[...cats.entries()].sort((a, b) => b[1] - a[1])];
  const hues = ["#7DF2B4", "#5FD3E8", "#E8924A", "#B6A4FF", "#F2D27D", "#8FB5A5", "#FF8FA3"];
  return `<div class="cb"><div class="cb-bar" aria-hidden="true">${list.slice(1).map(([c, n], i) => `<i style="flex:${n};--h:${hues[i % hues.length]}"${S.cat === c ? ' class="on"' : ""}></i>`).join("")}</div>
    <div class="cb-keys hscroll" role="tablist" aria-label="Categories">${list.map(([c, n], i) => `<button type="button" role="tab" aria-selected="${S.cat === c}" class="cb-k${S.cat === c ? " on" : ""}" data-cat="${esc(c)}" style="--h:${i ? hues[(i - 1) % hues.length] : "#D3F2E4"}"><i></i>${esc(c === "Pokémon singles" ? "Pokémon" : c)} <b>${n}</b></button>`).join("")}</div></div>`;
}
function vaultShelves(all) {
  const card = (it) => { const paid = it.purchasePrice != null && it.purchasePrice !== "" ? Number(it.purchasePrice) : null, g = paid != null ? (Number(it.price) || 0) - paid : null; return svCard(it, { photo: photoOf(it), chip: g != null && Math.abs(g) >= .01 ? `${g >= 0 ? "+" : "−"}${money(Math.abs(g))}` : "", chipHot: g != null && g < 0 }); };
  const top = [...all].sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0)).slice(0, 14);
  const groups = new Map(); if (S.cat === "All") all.forEach((i) => { const c = catOf(i); if (!groups.has(c)) groups.set(c, []); groups.get(c).push(i); }); else all.forEach((i) => { const w = where(i); if (!groups.has(w)) groups.set(w, []); groups.get(w).push(i); });
  const v = (l) => money(l.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0));
  return shelf("Top value", `${top.length} · ${v(top)}`, top.map(card).join(""), "Top value") + [...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, l]) => shelf(k, `${l.length} · ${v(l)}${l.length > 14 ? ` · <button type="button" class="sv-all" data-allgrp="${esc(k)}">See all</button>` : ""}`, l.slice(0, 14).map(card).join(""), k)).join("");
}
function vaultInfo(it) {
  const paid = it.purchasePrice != null && it.purchasePrice !== "" ? Number(it.purchasePrice) : null, g = paid != null ? (Number(it.price) || 0) - paid : null;
  return `${money(it.price)}${paid != null ? ` · paid ${money(paid)} · <i class="${g >= 0 ? "up" : "down"}">${g >= 0 ? "+" : "−"}${money(Math.abs(g))}</i>` : ""} · ${esc(where(it))}`;
}
function vaultRead(it) {
  const R = (k, v, cls = "") => v === "" || v == null ? "" : `<div class="lk-r ${cls}"><em>${esc(k)}</em><b>${v}</b></div>`;
  const paid = it.purchasePrice != null && it.purchasePrice !== "" ? Number(it.purchasePrice) : null, g = paid != null ? (Number(it.price) || 0) - paid : null;
  return { l: `${R("Market", money(it.price), "money")}${R("Paid", paid != null ? money(paid) : "—")}`, r: `${R("Gain", g == null ? "—" : (g >= 0 ? "+" : "−") + money(Math.abs(g)), g == null ? "" : g >= 0 ? "up" : "down")}${R("Where", esc(where(it).replace("Live on eBay", "eBay").replace("On Double Holo", "Double Holo")))}` };
}
const val = (l) => l.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
function paint() {
  const host = ctx.host, keep = host.querySelector(".cx-grid")?.parentElement?.scrollTop;
  const typed = host.querySelector("#coPct")?.value || "", typedFocus = document.activeElement && document.activeElement.id === "coPct";
  const base = peekItems().filter(onHand), cats = new Map(); base.forEach((i) => { const c = catOf(i); cats.set(c, (cats.get(c) || 0) + 1); });
  const all = rows(), shown = all.slice(0, S.more), total = val(all), SP = new Map(loadSpaces().map((x) => [x.id, x.name])), binName = (id) => (id && SP.get(id)) || "";
  host.innerHTML = `<div class="co-wrap cx">
    ${vaultTop(all, total, base)}
    ${S.menu ? `<div class="cx-menu"><label><span>Sort</span><select id="coSort"><option value="value"${S.sort === "value" ? " selected" : ""}>Highest value</option><option value="new"${S.sort === "new" ? " selected" : ""}>Newest</option><option value="name"${S.sort === "name" ? " selected" : ""}>Name</option></select></label>
      <label><span>Show</span><select id="coStage">${[["all", "All"], ["new", "Intake"], ["ready", "Ready to list"], ["live", "Live on eBay"]].map(([k, l]) => `<option value="${k}"${S.stage === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      <button class="cx-btn" id="coIO" type="button">Import / Export</button></div>` : ""}
    ${S.list || S.q || S.selecting ? `<div class="cx-lbar"><input id="coQ" class="cx-q" type="search" placeholder="Search your collection" value="${esc(S.q)}"><button type="button" class="cx-btn${S.list ? " on" : ""}" id="coList" aria-pressed="${!!S.list}">${S.list ? "Close" : "Show list"}</button></div>` : ""}
    ${!(S.list || S.q || S.selecting) ? vaultBody(all) : ""}
    ${S.list || S.q || S.selecting ? `<div class="cx-scroll"><div class="cx-grid">${shown.map((it) => { const src = photoOf(it), on = S.sel.has(String(it.id)), bn = binName(it.spaceId); return `<article class="cx-card${on ? " sel" : ""}" data-id="${esc(it.id)}" tabindex="0">
      <div class="cx-img">${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" draggable="false">` : `<span class="co-ini">${esc(nameOf(it).charAt(0))}</span>`}<span class="cx-price">${money(it.price)}</span>${Number(it.quantity) > 1 ? `<span class="cx-qty">x${Number(it.quantity)}</span>` : ""}${S.selecting ? `<i class="cx-ck"></i>` : ""}</div>
      <div class="cx-cap"><span>${esc(nameOf(it))}</span><em>${esc(where(it))}${bn ? " · " + esc(bn) : ""}</em></div></article>`; }).join("") || `<div class="co-empty">Nothing matches.</div>`}${all.length > S.more ? `<button type="button" class="cx-more" id="coMore">Show more (${all.length - S.more})</button>` : ""}</div></div>` : ""}
    ${S.selecting ? bar() : ""}</div>`;
  wire();
  host.querySelectorAll("[data-vid]").forEach((c) => { c.addEventListener("click", () => openZoom(c.dataset.vid, c)); c.addEventListener("pv:details", () => openZoom(c.dataset.vid, c)); });
  host.querySelectorAll("[data-kind]").forEach((b) => b.addEventListener("click", () => { S.kind = b.dataset.kind; paint(); }));
  host.querySelectorAll("[data-bset]").forEach((b) => b.addEventListener("click", () => { S.bset = b.dataset.bset; S.bpg = 0; paint(); }));
  host.querySelectorAll("[data-bflip]").forEach((b) => b.addEventListener("click", () => { S.bpg += Number(b.dataset.bflip); const sp = host.querySelector(".bn-spread"); paint(); const n = host.querySelector(".bn-spread"); n && n.classList.add(Number(b.dataset.bflip) > 0 ? "fl-n" : "fl-p"); }));
  { const sp = host.querySelector(".bn-spread"); if (sp) { let x0 = null; sp.addEventListener("pointerdown", (e) => { x0 = e.clientX; }); sp.addEventListener("pointerup", (e) => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 60) host.querySelector(`[data-bflip="${dx < 0 ? 1 : -1}"]:not([disabled])`)?.click(); }); } }
  host.querySelectorAll("[data-allgrp]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); if (S.cat === "All" && b.dataset.allgrp !== "Top value") S.cat = b.dataset.allgrp; S.list = true; paint(); }));
  host.querySelector("#coList")?.addEventListener("click", () => { S.list = !S.list; if (!S.list) S.q = ""; paint(); });
  host.querySelector("#coFind")?.addEventListener("click", () => { S.list = !S.list; if (!S.list) S.q = ""; paint(); if (S.list) host.querySelector("#coQ")?.focus(); });
  { const pc = host.querySelector("#coPct"); if (pc && typed) { pc.value = typed; if (typedFocus) pc.focus(); } }
}
function bar() {
  const n = S.sel.size, spaces = loadSpaces();
  return `<div class="cx-bar"><div class="cx-bh"><b>${n ? `${n} selected` : "Tap cards to select"}</b><button type="button" class="cx-link" id="coAll">Select all ${rows().length}</button></div>
    <div class="cx-bins">${spaces.map((s) => `<button class="cx-bin" data-bin="${esc(s.id)}" type="button" ${n ? "" : "disabled"}>${esc(s.name)}</button>`).join("")}</div>
    <div class="cx-row"><span class="co-pct"><input id="coPct" inputmode="numeric" placeholder="±%" aria-label="Percent change"><button class="cx-btn" data-bulk="pct" type="button" ${n ? "" : "disabled"}>Change price</button></span><button class="cx-btn warn" data-bulk="del" type="button" ${n ? "" : "disabled"}>Remove</button></div><small>Price and remove change this app only, not eBay.</small></div>`;
}
function commit(mut) { const list = loadItems(); mut(list); if (!saveItems(list)) { ctx.toast("Couldn't save. Storage is full."); return false; } ctx.refresh(); return true; }
function wire() {
  const h = ctx.host; const $ = (q) => h.querySelector(q);
  $("#coQ")?.addEventListener("input", (e) => { S.q = e.target.value; S.more = 90; const p = e.target.selectionStart; paint(); const q = h.querySelector("#coQ"); q.focus(); q.setSelectionRange(p, p); });
  $("#coMenuBtn").addEventListener("click", () => { S.menu = !S.menu; paint(); });
  $("#coSort")?.addEventListener("change", (e) => { S.sort = e.target.value; paint(); });
  $("#coStage")?.addEventListener("change", (e) => { S.stage = e.target.value; S.more = 90; paint(); });
  $("#coIO")?.addEventListener("click", ioSheet);
  $("#coMore")?.addEventListener("click", () => { S.more += 60; paint(); });
  { const mb = $("#coMore"); if (mb && "IntersectionObserver" in window) { const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); mb.click(); } }, { rootMargin: "600px" }); io.observe(mb); } }
  $("#coSel").addEventListener("click", () => { S.selecting = !S.selecting; if (!S.selecting) S.sel.clear(); paint(); });
  $("#coAll")?.addEventListener("click", () => { rows().forEach((i) => S.sel.add(String(i.id))); paint(); });
  h.querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => { S.cat = b.dataset.cat; S.more = 90; paint(); }));
  h.querySelectorAll(".cx-card").forEach((c) => {
    const id = c.dataset.id;
    c.addEventListener("click", () => { if (S.selecting) { S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); c.classList.toggle("sel", S.sel.has(id)); const bh = h.querySelector(".cx-bh b"); if (bh) bh.textContent = S.sel.size ? `${S.sel.size} selected` : "Tap cards to select"; h.querySelectorAll(".cx-bar [data-bin],.cx-bar [data-bulk]").forEach((x) => { x.disabled = !S.sel.size; }); } else openZoom(id, c.querySelector(".cx-img")); });
    c.addEventListener("keydown", (e) => { if (e.key === "Enter") c.click(); });
  });
  h.querySelectorAll("[data-bulk]").forEach((b) => b.addEventListener("click", () => bulk(b.dataset.bulk)));
  h.querySelectorAll(".cx-bin").forEach((b) => b.addEventListener("click", () => { const v = b.dataset.bin, n = S.sel.size; if (n && assign([...S.sel], v)) { ctx.toast(`Put ${n} in ${loadSpaces().find((s) => s.id === v)?.name || "bin"}`); S.sel.clear(); ctx.refresh(); paint(); } }));
}
function setLane(ids, lane) { const set = new Set(ids.map(String)); if (commit((l) => l.forEach((i) => { if (set.has(String(i.id))) i.lane = lane; }))) { ctx.toast(`Moved ${ids.length} to ${lane === "sealed" ? "Sealed" : "Singles"}`); paint(); } }
function bulk(kind) {
  const ids = [...S.sel]; if (!ids.length) return; const set = new Set(ids);
  if (kind === "sealed" || kind === "singles") { setLane(ids, kind); S.sel.clear(); paint(); }
  else if (kind === "pct") { const p = parseFloat(String(ctx.host.querySelector("#coPct").value).replace(/[^0-9.\-+]/g, "")); if (!Number.isFinite(p) || !p) { ctx.toast("Type a percent, like -10 or 15."); return; } const prevRaw = localStorage.getItem("coalition-items-v4"); if (commit((l) => l.forEach((i) => { if (set.has(String(i.id))) i.price = Math.max(0, Math.round((Number(i.price) || 0) * (1 + p / 100) * 100) / 100); }))) { (ctx.toastUndo || ctx.toast)(`Changed ${ids.length} prices by ${p > 0 ? "+" : ""}${p}% (this app only)`, () => { try { localStorage.setItem("coalition-items-v4", prevRaw); } catch { /* ignore */ } ctx.refresh(); paint(); }); S.sel.clear(); paint(); } }
  else if (kind === "del") removeItems([...set], () => { S.sel.clear(); });
}
function undo(prev, msg) { ctx.toastUndo(msg, () => { saveItems(prev); ctx.refresh(); paint(); ctx.toast("Restored"); }); }
/* delete from this app (eBay listings stay live; they're hidden so a sync doesn't bring them back) */
function removeItems(ids, after) {
  const set = new Set(ids.map(String)), before = loadItems(), removed = before.filter((i) => set.has(String(i.id))); if (!removed.length) return;
  const ebay = removed.flatMap((i) => { const sk = i.channels?.ebay?.sku || i.sku; return [String(i.id).startsWith("ebay-") ? String(i.id) : null, sk ? `ebay-${sk}` : null]; }).filter(Boolean); hideIds(ebay);
  if (!commit((l) => { for (let k = l.length - 1; k >= 0; k--) if (set.has(String(l[k].id))) l.splice(k, 1); })) return;
  after && after(); paint();
  ctx.toastUndo(removed.length === 1 ? `Deleted ${nameOf(removed[0])}` : `Deleted ${removed.length} items`, () => { unhideIds(ebay); saveItems(before); ctx.refresh(); paint(); ctx.toast("Restored"); });
}
function openZoom(id, fromEl) {
  const list = rows(), i = list.findIndex((x) => String(x.id) === String(id)); if (i < 0) return;
  openCard(list, { index: i, from: fromEl || null, photo: photoOf, name: nameOf, backLabel: "Collection",
    info: (it) => { const profit = it.purchasePrice != null && it.purchasePrice !== "" ? (Number(it.price) || 0) - Number(it.purchasePrice) : null, sp = loadSpaces().find((s) => s.id === it.spaceId);
      return `<div class="sub">${esc(where(it))} · ${esc(laneOf(it) === "sealed" ? "Sealed" : "Single")} · ${esc(gameOf(it))}</div><div class="row"><span>Market value</span><span>${money(it.price)}</span></div><div class="row"><span>Quantity</span><span>${Number(it.quantity) || 1}</span></div>${profit != null ? `<div class="row"><span>You paid</span><span>${money(it.purchasePrice)}</span></div><div class="row"><span>Profit</span><span>${profit < 0 ? "-" : ""}${money(Math.abs(profit))}</span></div>` : ""}<div class="row"><span>Bin</span><span>${esc(sp ? sp.name : "Not filed yet")}</span></div><button class="btn" id="zLane" type="button">Move to ${laneOf(it) === "sealed" ? "Singles" : "Sealed"}</button>${it.phase === "listed" && (it.channels?.ebay?.sku || it.sku) ? `<button class="btn go" id="zEdit" type="button">Edit listing</button>` : ""}<button class="btn warn" id="zDel" type="button">Delete from this app</button>${it.phase === "listed" && !it.ended ? `<small class="z-note">Still live on eBay. To take it down, end it in Channels.</small>` : ""}`; },
    wire: (root, it, api) => { { const d = document.createElement("div"); (root.querySelector(".k-zinfo") || root).appendChild(d); photoManager(d, it.id, { toast: ctx.toast, refresh: ctx.refresh }); } root.querySelector("#zDel")?.addEventListener("click", (e) => { const b = e.currentTarget; if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Tap again to delete"; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = "Delete from this app"; } }, 4000); return; } api.close(); removeItems([it.id]); });
      root.querySelector("#zEdit")?.addEventListener("click", () => { api.close(); setTimeout(() => dispatchEvent(new CustomEvent("fob:edit-live", { detail: it.id })), 280); });
      return root.querySelector("#zLane")?.addEventListener("click", () => { api.close(); setLane([it.id], laneOf(it) === "sealed" ? "singles" : "sealed"); }); } });
}
export function renderCollection(host, api) { ctx = { host, ...api }; if (!host.querySelector(".co-wrap")) S.sel.clear(); paint(); }
/* Import / Export from anywhere (Scouter has an Import button too) */
export function openImport(api) { if (!ctx || !ctx.host || !ctx.host.isConnected || !ctx.host.querySelector(".co-wrap")) ctx = { host: document.createElement("div"), ...api }; ioSheet(); }
export function repaintCollection() { if (ctx && ctx.host.querySelector(".co-wrap")) paint(); }

/* Import / Export CSV (uses the server's /api/csv converters) */
function ioSheet() {
  const s = ctx.openSheet(`<a class="back" href="#" data-close>‹ Back</a><h2>Import / Export</h2>
    <h3 style="margin:14px 0 6px">Export</h3><p class="sub">Downloads what Collection shows right now.</p>
    <label class="sc-f"><span>Format</span><select id="ioXs"><option value="tcgplayer">Generic CSV</option><option value="ebay">eBay</option><option value="double_holo">Double Holo</option></select></label>
    <button class="btn go" id="ioX" type="button">Download CSV</button>
    <h3 style="margin:22px 0 6px">Import</h3><p class="sub">Adds the rows in your file to Collection. Nothing is overwritten.</p>
    <label class="sc-f"><span>Where is the file from</span><select id="ioIs"><option value="double_holo">Double Holo / Shiny Pro</option><option value="ebay">eBay</option><option value="misprint">Misprint</option><option value="seller_fb">Facebook</option></select></label>
    <input id="ioF" type="file" accept=".csv,text/csv" style="margin:8px 0"><div class="sub" id="ioMsg" role="status"></div><button class="btn go" id="ioI" type="button">Import file</button>`);
  const $ = (q) => s.querySelector(q), msg = (t, bad) => { const m = $("#ioMsg"); m.textContent = t; m.style.color = bad ? "var(--org)" : ""; };
  s.querySelector("[data-close]").addEventListener("click", (e) => { e.preventDefault(); ctx.closeSheet(); });
  $("#ioX").addEventListener("click", async () => {
    const items = rows(); if (!items.length) { msg("Nothing to export.", true); return; }
    try {
      const r = await fetch("/api/csv/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: $("#ioXs").value, items: items.map((x) => Object.assign({}, x, { photos: (x.photos || []).map((p) => ({ url: p.url || p.dataUrl || "" })).filter((p) => /^https?:/.test(p.url)) })) }) });
      if (!r.ok) { const b = await r.json().catch(() => ({})); msg(b.error || "Export failed.", true); return; }
      const url = URL.createObjectURL(await r.blob()), a = document.createElement("a"); a.href = url; a.download = `collection-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); msg(`Exported ${items.length} items.`);
    } catch { msg("Couldn't reach the server.", true); }
  });
  $("#ioI").addEventListener("click", async () => {
    const f = $("#ioF").files && $("#ioF").files[0]; if (!f) { msg("Choose a CSV file first.", true); return; }
    const src = $("#ioIs").value; msg("Reading…");
    try {
      const r = await fetch("/api/csv/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: src, csv: await f.text() }) });
      const b = await r.json().catch(() => ({})); if (!r.ok || !b.ok) { msg(b.error || "Couldn't read that file.", true); return; }
      const have = new Set(loadItems().map((i) => String(i.sku || "")).filter(Boolean)); let n = 0, skip = 0; const stamp = Date.now().toString(36), add = [];
      (b.items || []).forEach((it, k) => { if (it.sku && have.has(String(it.sku))) { skip++; return; } n++; add.push(Object.assign({}, it, { id: src === "double_holo" ? `mp-imp-${stamp}-${k}` : `imp-${stamp}-${k}`, source: "app", phase: src === "ebay" ? "listed" : src === "double_holo" ? "listed" : "intake", quantity: Number(it.quantity) || 1, photos: it.photos || [], createdAt: new Date().toISOString() })); });
      const l = loadItems(); l.unshift(...add); if (!saveItems(l)) { msg("Storage is full. Nothing was added.", true); return; }
      ctx.refresh(); paint(); msg(`Added ${n} items${skip ? `, skipped ${skip} you already have` : ""}${(b.errors || []).length ? `, ${(b.errors || []).length} rows had problems` : ""}.`);
    } catch { msg("Import failed. Nothing was added.", true); }
  });
}
