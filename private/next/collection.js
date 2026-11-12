import { photoManager } from "./photos.js?v=202";
import { hideIds, unhideIds } from "./orders.js?v=202";
import { openCard, ringGauge, shelf, svCard } from "./kit.js?v=202";
import { openFocus } from "./focus.js?v=202";
import { setOf, rarityOf, numOf, cardName, kindOf as kindOf2 } from "./cardmeta.js?v=202";
import { esc, money, nameOf, photoOf, onHand, laneOf, gameOf, peekItems, loadItems, saveItems, loadSpaces, assign, catOf } from "./shared.js?v=202";

let ctx = null;
const S = { type: "all", game: "", set: "", rar: "", bset: "", bpg: 0, q: "", stage: "all", cat: "All", sort: "value", sel: new Set(), selecting: false, menu: false, more: 48 };
const phoneNow = () => matchMedia("(max-width:820px)").matches;

/* Collection is TCG only: card singles, graded slabs and sealed TCG product. Figures, Pez, binders, sleeves, golf clubs etc. stay in Channels. */
const NOT_TCG = /\b(dispenser|pez|figures?|figurine|statue|plush|toys?|funko|keychain|poster|t-?shirt|mug|lunch ?box|backpack|lego|puzzle|game boy|nintendo switch|cartridge|dvd|lamp|blanket|binder|album|portfolio|sleeves|playmat|deck box|toploaders?|card storage|golf|taylormade|callaway|ping g\d+|headphones?|controller|sneakers?)\b/i;
/* cards, slabs and sealed TCG product. Unnamed drafts (sku-…, IMG_…, barcodes) wait in Command until they're identified. */
const TCG_GAMES = /pok[eé]mon|magic|one piece|dragon ball|digimon|yu-?gi-?oh|lorcana|flesh and blood/i;
const CARD_SIGNAL = /\b\d{1,3}\/\d{1,3}\b|\b(holo|reverse holo|promo|tcg|ccg|booster|etb|elite trainer|blister|booster pack|starter deck|theme deck|rookie|upper deck|topps|panini|wwe)\b/i;
export function isTcg(it) {
  const t = nameOf(it).trim();
  if (/^(sku-\d+|img_\d+|\d{8,}|draft listing.*|untitled.*)$/i.test(t)) return false;
  if (NOT_TCG.test(t)) return false;
  /* membership needs a positive signal it IS a card or sealed TCG product —
     the old negative-only test let every bow, TV and gadget in (Oct 31 2026) */
  if (TCG_GAMES.test(String(it.game || "")) || TCG_GAMES.test(t)) return true;
  if (it.setName || it.collectorNumber || it.cardName) return true;
  if (it.kind === "card" || it.kind === "sealed") return true;
  return CARD_SIGNAL.test(t);
}
function rowsOld() {
  const q = S.q.trim().toLowerCase();
  return peekItems().filter(onHand).filter((it) => !it.notCollection).filter(isTcg).filter((it) => {
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
  return `<div class="vgw"><svg class="vg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Collection value over the last 12 months"><defs><linearGradient id="vgF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7DF2B4" stop-opacity=".35"/><stop offset="1" stop-color="#7DF2B4" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L${W},${H} L0,${H} Z" fill="url(#vgF)"/><path d="${line}" fill="none" stroke="#7DF2B4" stroke-width="2" vector-effect="non-scaling-stroke"/>
    </svg><div class="vg-m" aria-hidden="true">${series.map((_, j) => `<span>${j % 2 ? "" : mo[(start + j) % 12]}</span>`).join("")}</div></div>`;
}
function vaultTop(all, total, base) {
  const paid = all.reduce((a, i) => a + (Number(i.purchasePrice) || 0) * (Number(i.quantity) || 1), 0), d = total - paid;
  const n = (k) => base.filter((i) => kindOf(i) === k).length, kind = S.kind || "all";
  const grail = [...base].filter((i) => photoOf(i)).sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0))[0];
  const games = new Map(); for (const it of base) { const g = gameOf(it); games.set(g, (games.get(g) || 0) + (Number(it.price) || 0) * (Number(it.quantity) || 1)); }
  const gl = [...games.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), gt = gl.reduce((a, [, v]) => a + v, 0) || 1, hues = ["#7DF2B4", "#5FD3E8", "#B6A4FF", "#F2D27D"];
  return `<header class="vh">
      ${grail ? `<button type="button" class="vh-grail" data-vid="${esc(grail.id)}" aria-label="Your top card: ${esc(nameOf(grail))}"><span class="vh-case"><span class="vh-card k-tilt" data-tilt="1.2"><img src="${esc(photoOf(grail))}" alt="" draggable="false"></span></span><span class="vh-tag"><em>Crown jewel</em><b>${money(grail.price)}</b><span>${esc(nameOf(grail))}</span></span></button>` : ""}
      <div class="vh-v"><em>The vault is worth</em><b>${money(total)}</b>
        <span>${all.length} piece${all.length === 1 ? "" : "s"}${paid ? ` · <i class="${d >= 0 ? "up" : "down"}">${d >= 0 ? "+" : "−"}${money(Math.abs(d))} over cost</i>` : ""}</span>
        ${gl.length > 1 ? `<div class="vh-mix" aria-label="Value by game">${gl.map(([g, v], i) => `<i style="flex:${v};--h:${hues[i]}"></i>`).join("")}</div><div class="vh-keys">${gl.map(([g, v], i) => `<span style="--h:${hues[i]}"><u></u>${esc(g)} ${Math.round(v / gt * 100)}%</span>`).join("")}</div>` : ""}
        <nav class="vh-k" aria-label="Show">${VK.map(([k, l]) => `<button type="button" class="${kind === k ? "on" : ""}" aria-pressed="${kind === k}" data-kind="${k}">${k === "singles" ? "Binder" : l} <b>${k === "all" ? base.length : n(k)}</b></button>`).join("")}</nav>
      </div>
      <span class="cx-tools vh-tools"><button class="cx-btn cx-find${S.list ? " on" : ""}" id="coFind" type="button" aria-label="Search and list" aria-pressed="${!!S.list}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button><button class="cx-btn${S.selecting ? " on" : ""}" id="coSel" type="button">${S.selecting ? "Done" : "Select"}</button><button class="cx-btn" id="coMenuBtn" type="button" aria-expanded="${!!S.menu}" aria-label="Sort, filter, import">⋯</button></span></header>`;
}
function vaultBody(all) {
  const kind = S.kind || "all", pick = (k) => all.filter((i) => kindOf(i) === k), val = (l) => money(l.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0));
  const graded = pick("graded").sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0)), singles = pick("singles"), sealed = pick("sealed");
  const ph = (it) => { const s = photoOf(it); return s ? `<img src="${esc(s)}" alt="" loading="lazy" draggable="false">` : `<i>${esc(nameOf(it).charAt(0))}</i>`; };
  /* tapping a photo opens it full screen (zoom in); "Details" from there opens the item.
     The attribute carries at most 4 photos, URLs first — embedding every photo as a
     data URL made tiles megabytes of HTML and could break the viewer's parse. */
  const pv = (it) => { const all = (it.photos || []).map((p) => p.url || p.dataUrl).filter(Boolean).slice(0, 4); return all.length ? ` data-view-photo="${esc(JSON.stringify(all))}" data-view-id="${esc(it.id)}"` : ""; };
  const gradeOf = (it) => { const m = nameOf(it).match(SLAB); return m ? `${m[1].toUpperCase()} ${m[2]}` : "Graded"; };
  let out = "";
  if ((kind === "all" || kind === "singles") && singles.length) {
    const sets = new Map(); for (const it of singles) { if (!photoOf(it) && !(Number(it.price) > 0)) continue; const k = it.setName || gameOf(it); if (!sets.has(k)) sets.set(k, []); sets.get(k).push(it); }
    const order = [...sets.entries()].sort((a, b) => b[1].length - a[1].length);
    if (order.length) {
      if (!sets.has(S.bset)) { S.bset = order[0][0]; S.bpg = 0; }
      const l = [...sets.get(S.bset)].sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0)), per = innerWidth > 820 ? 18 : 9, spreads = Math.max(1, Math.ceil(l.length / per));
      S.bpg = Math.min(Math.max(0, S.bpg), spreads - 1);
      const pg = (from) => { const c = l.slice(from, from + 9); return `<div class="bn-pg">${c.map((it) => `<button type="button" class="bd-p" data-vid="${esc(it.id)}" aria-label="${esc(nameOf(it))} ${money(it.price)}">${ph(it)}<em>${money(it.price)}</em></button>`).join("")}</div>`; };
      const at = S.bpg * per;
      out += `<section class="vs bn-sec"><header class="vs-h"><b>Binder</b><span>${val(l)} in ${esc(S.bset)}</span></header>
      <div class="bn-tabs hscroll" role="tablist">${order.map(([k, x]) => `<button type="button" role="tab" class="bn-t${k === S.bset ? " on" : ""}" aria-selected="${k === S.bset}" data-bset="${esc(k)}">${esc(k)}<b>${x.length}</b></button>`).join("")}</div>
      <div class="bn"><div class="bn-spread${per === 9 ? " one" : ""}">${pg(at)}${per === 18 ? `<i class="bn-rings" aria-hidden="true"></i>${pg(at + 9)}` : ""}</div>
      <div class="bn-nav"><button type="button" class="bn-a" data-bflip="-1" aria-label="Previous page"${S.bpg ? "" : " disabled"}>‹</button><span>Page ${S.bpg + 1} of ${spreads}</span><button type="button" class="bn-a" data-bflip="1" aria-label="Next page"${S.bpg < spreads - 1 ? "" : " disabled"}>›</button></div></div></section>`;
    }
  }
  let side = "";
  if ((kind === "all" || kind === "graded") && graded.length) side += `<section class="vs"><header class="vs-h"><b>Graded case</b><span>${graded.length} · ${val(graded)}</span></header>
    <div class="slabs hscroll">${graded.slice(0, kind === "graded" ? 200 : 24).map((it) => `<button type="button" class="slab" data-vid="${esc(it.id)}" aria-label="${esc(nameOf(it))}"><span class="slab-l"><b>${esc(gradeOf(it))}</b><em>${money(it.price)}</em></span><span class="slab-w">${ph(it)}</span></button>`).join("")}</div></section>`;
  if ((kind === "all" || kind === "sealed") && sealed.length) side += `<section class="vs"><header class="vs-h"><b>Sealed shelf</b><span>${sealed.length} · ${val(sealed)}</span></header>
    <div class="shelf hscroll">${sealed.slice(0, kind === "sealed" ? 200 : 30).map((it) => `<button type="button" class="box" data-vid="${esc(it.id)}" aria-label="${esc(nameOf(it))}"><span class="box-a">${ph(it)}</span><em>${money(it.price)}</em><span class="box-n">${esc(nameOf(it))}</span></button>`).join("")}</div></section>`;
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
/* Top value shelf: the 14 priciest things in the vault, price-ranked, with
   paid-vs-value chips. (Replaces the old vaultShelves group shelves, which
   duplicated the category bar's filtering and were never painted.) */
function topShelf(all) {
  const card = (it) => { const paid = it.purchasePrice != null && it.purchasePrice !== "" ? Number(it.purchasePrice) : null, g = paid != null ? (Number(it.price) || 0) - paid : null; return svCard(it, { photo: photoOf(it), chip: g != null && Math.abs(g) >= .01 ? `${g >= 0 ? "+" : "−"}${money(Math.abs(g))}` : "", chipHot: g != null && g < 0 }); };
  const top = [...all].sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0)).slice(1, 15);
  if (!top.length) return "";
  const v = money(top.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0));
  return shelf("Showcase", `Your ${top.length} most valuable · ${v}`, top.map(card).join(""), "Top value");
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
/* ===== Collection (Build 173): one clean page. Filters up top, sealed shelf, graded case, then every card as a labeled grid. ===== */
const priceOf = (it) => (Number(it.price) || 0) * (Number(it.quantity) || 1);
function rows() { return filtered(base()).sort(sorter); }
function base() { return peekItems().filter(onHand).filter((it) => !it.notCollection).filter(isTcg); }
function filtered(list, skip = "") {
  const q = S.q.trim().toLowerCase();
  return list.filter((it) => (skip === "type" || S.type === "all" || kindOf2(it) === S.type)
    && (skip === "game" || !S.game || gameOf(it) === S.game)
    && (skip === "set" || !S.set || setOf(it) === S.set)
    && (skip === "rar" || !S.rar || rarityOf(it) === S.rar)
    && (!q || `${nameOf(it)} ${setOf(it)} ${numOf(it)}`.toLowerCase().includes(q)));
}
const sorter = (a, b) => S.sort === "low" ? (Number(a.price) || 0) - (Number(b.price) || 0) : S.sort === "new" ? String(b.createdAt || b.updatedAt || "").localeCompare(String(a.createdAt || a.updatedAt || "")) : S.sort === "name" ? cardName(a).localeCompare(cardName(b)) : (Number(b.price) || 0) - (Number(a.price) || 0);
const tally = (list, f) => { const m = new Map(); for (const it of list) { const k = f(it); if (k) m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]); };
function tile(it) {
  const src = photoOf(it), on = S.sel.has(String(it.id)), set = setOf(it), num = numOf(it), r = rarityOf(it);
  return `<article class="cx-card cv-c${on ? " sel" : ""}" data-id="${esc(it.id)}" tabindex="0" aria-label="${esc(cardName(it))} ${money(it.price)}">
    <div class="cv-art">${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" draggable="false">` : `<i>${esc(cardName(it).charAt(0))}</i>`}${S.selecting ? `<span class="cv-ck"></span>` : ""}${Number(it.quantity) > 1 ? `<span class="cv-q">×${Number(it.quantity)}</span>` : ""}</div>
    <div class="cv-cap"><b>${esc(cardName(it))}</b><span>${esc([set, num].filter(Boolean).join(" · ") || gameOf(it))}</span><div class="cv-row"><strong>${money(it.price)}</strong>${r ? `<em>${esc(r)}</em>` : ""}</div></div></article>`;
}
function shelfHtml(list, title, sub, cls) {
  if (!list.length) return "";
  return `<section class="cv-shelf ${cls}"><header><h2>${title}</h2><span>${sub}</span></header><div class="cv-rail">${list.map((it) => { const src = photoOf(it); return `<button type="button" class="cv-box" data-vid="${esc(it.id)}"><span class="cv-boxart">${src ? `<img src="${esc(src)}" alt="" loading="lazy" draggable="false">` : `<i>${esc(cardName(it).charAt(0))}</i>`}</span><b>${esc(cardName(it))}</b><strong>${money(it.price)}</strong></button>`; }).join("")}</div><i class="cv-plank" aria-hidden="true"></i></section>`;
}
/* the binder: two facing pages of nine pockets on rings, every pocket labeled; flip with the arrows, a swipe or the arrow keys */
function binderHtml(list, browsing) {
  if (!list.length) return `<section class="cv-cards"><p class="cv-empty">Nothing matches these filters.</p></section>`;
  const per = innerWidth > 820 ? 18 : 9, spreads = Math.max(1, Math.ceil(list.length / per)); S.bpg = Math.min(Math.max(0, S.bpg || 0), spreads - 1);
  const at = S.bpg * per, pg = (from) => `<div class="bn-pg">${list.slice(from, from + 9).map((it) => { const src = photoOf(it); return `<button type="button" class="bd-p cv-pk" data-vid="${esc(it.id)}" aria-label="${esc(cardName(it))} ${money(it.price)}"><span class="cv-pk-art">${src ? `<img src="${esc(src)}" alt="" loading="lazy" draggable="false">` : `<i>${esc(cardName(it).charAt(0))}</i>`}<span class="cv-pk-glare" aria-hidden="true"></span></span><span class="cv-pk-l"><b>${esc(cardName(it))}</b><em>${money(it.price)}</em></span></button>`; }).join("")}</div>`;
  return `<section class="cv-binder"><header><h2>${browsing ? "Binder" : `${list.length} result${list.length === 1 ? "" : "s"}`}</h2><span>${list.length} cards · ${money(list.reduce((a, i) => a + priceOf(i), 0))}</span></header>
    <div class="bn"><div class="bn-spread${per === 9 ? " one" : ""}">${pg(at)}${per === 18 ? `<i class="bn-rings" aria-hidden="true"></i>${pg(at + 9)}` : ""}</div>
    <div class="bn-nav"><button type="button" class="bn-a" data-bflip="-1" aria-label="Previous page"${S.bpg ? "" : " disabled"}>‹</button><span>Page ${S.bpg + 1} of ${spreads}</span><button type="button" class="bn-a" data-bflip="1" aria-label="Next page"${S.bpg < spreads - 1 ? "" : " disabled"}>›</button></div></div></section>`;
}
/* ===== Collection rebuild (Build 192): tabs (Binder / Sealed / Graded / All), board tools, real binder, shelf, slab case ===== */
const TABS = [["binder", "Binder"], ["sealed", "Sealed"], ["graded", "Graded"], ["all", "All cards"]];
const SORTS = [["value", "Value: high"], ["low", "Value: low"], ["new", "Newest"], ["name", "Name A–Z"]];
function gridTile(it, n) {
  const src = photoOf(it), on = S.sel.has(String(it.id)), q = Number(it.quantity) || 1;
  return `<article class="bd-t cx-card${on ? " sel" : ""}" data-id="${esc(it.id)}" tabindex="0" style="--i:${Math.min(n, 24)}" aria-label="${esc(cardName(it))} ${money(it.price)}">
    <div class="bd-art">${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" draggable="false">` : `<i class="bd-ini">${esc(cardName(it).charAt(0))}</i>`}<span class="bd-glare"></span><i class="bd-br tl"></i><i class="bd-br tr"></i><i class="bd-br bl"></i><i class="bd-br br"></i>${q > 1 ? `<span class="bd-var">×${q}</span>` : ""}${S.selecting ? `<span class="bd-pick" aria-hidden="true"></span>` : ""}</div>
    <div class="bd-cap"><b>${money(it.price)}</b><span>${esc(cardName(it))}</span></div></article>`;
}
function pocket(it) {
  const src = photoOf(it);
  return `<button type="button" class="vb-pk" data-vid="${esc(it.id)}" aria-label="${esc(cardName(it))} ${money(it.price)}"><span class="vb-card">${src ? `<img src="${esc(src)}" alt="" loading="lazy" draggable="false">` : `<i>${esc(cardName(it).charAt(0))}</i>`}<span class="bd-glare"></span></span><span class="vb-sleeve" aria-hidden="true"></span><span class="vb-tag"><b>${money(it.price)}</b><em>${esc(cardName(it))}</em></span></button>`;
}
function binderView(list) {
  if (!list.length) return `<div class="bd-empty"><b>No cards here.</b><span>Clear the filters, or scan cards in Scouter to fill the binder.</span></div>`;
  const wide = innerWidth > 820, per = wide ? 18 : 9, spreads = Math.max(1, Math.ceil(list.length / per)); S.bpg = Math.min(Math.max(0, S.bpg || 0), spreads - 1);
  const at = S.bpg * per, page = (from, side) => `<div class="vb-page ${side}"><div class="vb-grid">${list.slice(from, from + 9).map(pocket).join("")}${Array.from({ length: Math.max(0, 9 - list.slice(from, from + 9).length) }, () => `<span class="vb-pk empty" aria-hidden="true"><span class="vb-sleeve"></span></span>`).join("")}</div><span class="vb-pn">${(wide ? S.bpg * 2 + (side === "r" ? 2 : 1) : S.bpg + 1)}</span></div>`;
  const dots = spreads <= 14 ? `<div class="vb-dots">${Array.from({ length: spreads }, (_, k) => `<button type="button" class="${k === S.bpg ? "on" : ""}" data-bgo="${k}" aria-label="Page ${k + 1}"></button>`).join("")}</div>` : `<span class="vb-of">Spread ${S.bpg + 1} of ${spreads}</span>`;
  return `<section class="vb${wide ? "" : " one"}"><div class="vb-book"><div class="vb-spread">${page(at, "l")}${wide ? `<div class="vb-spine" aria-hidden="true"><i></i><i></i><i></i></div>${page(at + 9, "r")}` : ""}</div></div>
    <nav class="vb-nav"><button type="button" class="vb-a" data-bflip="-1" aria-label="Previous page"${S.bpg ? "" : " disabled"}><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>${dots}<button type="button" class="vb-a" data-bflip="1" aria-label="Next page"${S.bpg < spreads - 1 ? "" : " disabled"}><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button></nav></section>`;
}
function shelfView(list) {
  if (!list.length) return `<div class="bd-empty"><b>No sealed product.</b><span>Booster boxes, ETBs, tins and packs show up here.</span></div>`;
  const rows = []; for (let k = 0; k < list.length; k += 5) rows.push(list.slice(k, k + 5));
  return `<section class="vs">${rows.map((r) => `<div class="vs-row"><div class="vs-items">${r.map((it) => { const src = photoOf(it); return `<button type="button" class="vs-box" data-vid="${esc(it.id)}"><span class="vs-art">${src ? `<img src="${esc(src)}" alt="" loading="lazy" draggable="false">` : `<i>${esc(cardName(it).charAt(0))}</i>`}<span class="bd-glare"></span></span><span class="vs-ref" aria-hidden="true">${src ? `<img src="${esc(src)}" alt="">` : ""}</span><span class="vb-tag"><b>${money(it.price)}</b><em>${esc(cardName(it))}</em></span></button>`; }).join("")}</div><i class="vs-glass" aria-hidden="true"></i></div>`).join("")}</section>`;
}
function caseView(list) {
  if (!list.length) return `<div class="bd-empty"><b>No graded slabs yet.</b><span>PSA, CGC and BGS slabs show up here.</span></div>`;
  return `<section class="vc">${list.map((it) => { const src = photoOf(it), g = (nameOf(it).match(/\b(PSA|CGC|BGS|SGC|TAG)\s*([0-9.]+)/i) || []); return `<button type="button" class="vc-slab" data-vid="${esc(it.id)}"><span class="vc-label"><b>${esc(g[1] ? g[1].toUpperCase() : "Graded")}</b><em>${esc(g[2] || "")}</em></span><span class="vc-art">${src ? `<img src="${esc(src)}" alt="" loading="lazy" draggable="false">` : ""}<span class="bd-glare"></span></span><span class="vb-tag"><b>${money(it.price)}</b><em>${esc(cardName(it))}</em></span></button>`; }).join("")}</section>`;
}
function filterSheet() {
  const all = base(), sets = tally(filtered(all, "set"), setOf), rars = tally(filtered(all, "rar"), rarityOf);
  const grp = (title, key, opts) => `<section class="bf-g"><h3>${title}</h3><div>${opts.map(([v, l, c]) => `<button type="button" class="bd-chip${S[key] === v ? " on" : ""}" data-sf="${key}" data-v="${esc(v)}">${esc(l)}${c != null ? `<b>${c}</b>` : ""}</button>`).join("")}</div></section>`;
  const sh = ctx.openSheet(`<div class="bf"><header class="bf-h"><h2>Filters</h2></header>
    ${grp("Sort", "sort", SORTS.map(([k, l]) => [k, l]))}
    ${grp("Rarity", "rar", [["", "Any rarity"], ...rars.map(([r, c]) => [r, r, c])])}
    ${grp("Set", "set", [["", "All sets"], ...sets.slice(0, 60).map(([x, c]) => [x, x, c])])}
    <footer class="bf-f"><button type="button" class="bd-btn" data-bfclear>Clear filters</button><button type="button" class="bd-go" data-bfx>Show ${filtered(all).length} items</button></footer></div>`);
  const root = sh || document;
  root.querySelectorAll("[data-sf]").forEach((b) => b.addEventListener("click", () => { S[b.dataset.sf] = b.dataset.v; S.bpg = 0; S.more = 48; paint(); filterSheet(); }));
  root.querySelector("[data-bfclear]")?.addEventListener("click", () => { S.set = S.rar = ""; S.sort = "value"; paint(); ctx.closeSheet(); });
  root.querySelector("[data-bfx]")?.addEventListener("click", () => ctx.closeSheet());
}
function paint() {
  const host = ctx.host, typedFocus = document.activeElement && document.activeElement.id === "coQ";
  if (!S.tab) S.tab = "binder";
  const all = base(), total = all.reduce((a, i) => a + priceOf(i), 0);
  const paid = all.reduce((a, i) => a + (Number(i.purchasePrice) || 0) * (Number(i.quantity) || 1), 0), gain = total - paid;
  const kindTab = { binder: "singles", sealed: "sealed", graded: "graded", all: "all" }[S.tab]; S.type = kindTab;
  const pre = filtered(all, "type"), inTab = (t) => t === "all" ? pre : pre.filter((i) => kindOf2(i) === { binder: "singles", sealed: "sealed", graded: "graded" }[t]);
  const shown = (S.tab === "all" ? pre : pre.filter((i) => kindOf2(i) === kindTab)).sort(sorter), cut = shown.slice(0, S.more);
  const games = tally(filtered(all, "game"), gameOf), nf = [S.set, S.rar].filter(Boolean).length + (S.sort !== "value" ? 1 : 0);
  const tabVal = (t) => inTab(t).reduce((a, i) => a + priceOf(i), 0);
  let n = 0;
  host.innerHTML = `<div class="co-wrap cv bd vlt">
    <div class="vlt-head"><div class="vlt-val"><em>Collection value</em><b>${money(total)}</b><span>${all.length} items${paid ? ` · <i class="${gain >= 0 ? "up" : "down"}">${gain >= 0 ? "+" : "−"}${money(Math.abs(gain))} over cost</i>` : ""}</span></div></div>
    <div class="bd-hud"><nav class="bd-tabs" role="tablist" aria-label="Collection">${TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${S.tab === k}" class="bd-tab${S.tab === k ? " on" : ""}" data-tab="${k}"><b>${inTab(k).length}</b><span>${l}</span><em>${money(tabVal(k))}</em></button>`).join("")}<i class="bd-scan" aria-hidden="true"></i></nav></div>
    <div class="bd-tools">
      <label class="bd-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input id="coQ" type="search" placeholder="Search name, set or number" value="${esc(S.q)}" aria-label="Search the collection"></label>
      <button type="button" class="bd-btn${nf ? " on" : ""}" id="coFilt"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>Filters${nf ? `<b>${nf}</b>` : ""}</button>
      <button type="button" class="bd-btn${S.selecting ? " on" : ""}" id="coSel"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>${S.selecting ? "Done" : "Select"}</button>
      <button type="button" class="bd-btn" id="coMenuBtn" aria-label="Import or export"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg></button>
    </div>
    ${S.menu ? `<div class="cv-menu"><button type="button" class="bd-btn" id="coIO">Import or export a CSV</button></div>` : ""}
    <div class="bd-chips" role="tablist" aria-label="Game"><button type="button" class="bd-chip${!S.game ? " on" : ""}" data-game="">All<b>${filtered(all, "game").filter((i) => S.tab === "all" || kindOf2(i) === kindTab).length}</b></button>${games.map(([g, c]) => `<button type="button" class="bd-chip${S.game === g ? " on" : ""}" data-game="${esc(g)}">${esc(g)}<b>${c}</b></button>`).join("")}</div>
    <div class="bd-sum"><b>${shown.length}</b> ${S.tab === "sealed" ? "sealed" : S.tab === "graded" ? "slabs" : "cards"} · <b>${money(shown.reduce((a, i) => a + priceOf(i), 0))}</b>${S.q || S.game || nf ? ` <button type="button" class="bd-clear" id="vxClear">Clear all</button>` : ""}</div>
    ${S.selecting || S.tab === "all" ? `<div class="bd-grid vlt-grid">${cut.map((it) => gridTile(it, n++)).join("")}</div>${shown.length > cut.length ? `<button type="button" class="bd-btn vlt-more" id="coMore">Show ${Math.min(60, shown.length - cut.length)} more</button>` : ""}` : S.tab === "binder" ? binderView(shown) : S.tab === "sealed" ? shelfView(shown) : caseView(shown)}
    ${S.selecting ? bar() : ""}</div>`;
  wire();
  const h = host;
  h.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { S.tab = b.dataset.tab; S.bpg = 0; S.more = 48; paint(); }));
  h.querySelector("#coFilt")?.addEventListener("click", filterSheet);
  h.querySelectorAll("[data-vid]").forEach((c) => c.addEventListener("click", () => openZoom(c.dataset.vid, c)));
  const flip = (d) => { const sp = h.querySelector(".vb-spread"); S.bpg += d; paint(); const n2 = h.querySelector(".vb-spread"); if (n2 && !matchMedia("(prefers-reduced-motion: reduce)").matches) { n2.animate([{ transform: `perspective(1600px) rotateY(${d > 0 ? 22 : -22}deg) translateX(${d > 0 ? 40 : -40}px)`, opacity: 0.2, filter: "brightness(1.6)" }, { transform: "none", opacity: 1, filter: "none" }], { duration: 460, easing: "cubic-bezier(.2,.8,.2,1)" }); } };
  h.querySelectorAll("[data-bflip]").forEach((b) => b.addEventListener("click", () => flip(Number(b.dataset.bflip))));
  h.querySelectorAll("[data-bgo]").forEach((b) => b.addEventListener("click", () => { const d = Number(b.dataset.bgo) - S.bpg; if (d) flip(d); }));
  { const sp = h.querySelector(".vb-spread"); if (sp) { let x0 = null, y0 = 0; sp.addEventListener("pointerdown", (e) => { x0 = e.clientX; y0 = e.clientY; }); sp.addEventListener("pointerup", (e) => { if (x0 == null) return; const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) h.querySelector(`[data-bflip="${dx < 0 ? 1 : -1}"]:not([disabled])`)?.click(); }); } }
  const tilt = (c, art) => { c.addEventListener("pointermove", (e) => { if (e.pointerType !== "mouse") return; const r = art.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height; c.style.setProperty("--rx", `${(0.5 - y) * 16}deg`); c.style.setProperty("--ry", `${(x - 0.5) * 18}deg`); c.style.setProperty("--gx", `${x * 100}%`); c.style.setProperty("--gy", `${y * 100}%`); }); c.addEventListener("pointerleave", () => { c.style.removeProperty("--rx"); c.style.removeProperty("--ry"); c.classList.remove("press"); }); c.addEventListener("pointerdown", () => c.classList.add("press")); c.addEventListener("pointerup", () => setTimeout(() => c.classList.remove("press"), 140)); c.addEventListener("pointercancel", () => c.classList.remove("press")); };
  h.querySelectorAll(".vb-pk[data-vid]").forEach((c) => tilt(c, c.querySelector(".vb-card")));
  h.querySelectorAll(".vs-box,.vc-slab").forEach((c) => tilt(c, c));
  h.querySelectorAll(".bd-t").forEach((c) => tilt(c, c.querySelector(".bd-art")));
  h.querySelectorAll("[data-game]").forEach((b) => b.addEventListener("click", () => { S.game = b.dataset.game; S.set = ""; S.bpg = 0; S.more = 48; paint(); }));
  h.querySelector("#vxClear")?.addEventListener("click", () => { S.game = S.set = S.rar = S.q = ""; S.sort = "value"; paint(); });
  if (typedFocus) { const q = h.querySelector("#coQ"); if (q) { q.focus(); const len = q.value.length; try { q.setSelectionRange(len, len); } catch { /* ignore */ } } }
  { const hud = h.querySelector(".bd-hud"); if (hud) h.querySelector(".bd")?.style.setProperty("--hudh", `${hud.offsetHeight - 6}px`); }
}
function bar() {
  const n = S.sel.size, spaces = loadSpaces();
  return `<div class="cx-bar"><div class="cx-bh"><b>${n ? `${n} selected` : "Tap cards to select"}</b><button type="button" class="cx-link" id="coAll">Select all ${rows().length}</button></div>
    <div class="cx-bins">${spaces.map((s) => `<button class="cx-bin" data-bin="${esc(s.id)}" type="button" ${n ? "" : "disabled"}>${esc(s.name)}</button>`).join("")}</div>
    <div class="cx-row"><span class="co-pct"><input id="coPct" inputmode="numeric" placeholder="±%" aria-label="Percent change"><button class="cx-btn" data-bulk="pct" type="button" ${n ? "" : "disabled"}>Change price</button></span><button class="cx-btn" data-bulk="out" type="button" ${n ? "" : "disabled"}>Remove from Collection</button><button class="cx-btn warn" data-bulk="del" type="button" ${n ? "" : "disabled"}>Remove</button></div><small>Price and remove change this app only, not eBay.</small></div>`;
}
function commit(mut) { const list = loadItems(); mut(list); if (!saveItems(list)) { ctx.toast("Couldn't save. Storage is full."); return false; } ctx.refresh(); return true; }
function wire() {
  const h = ctx.host; const $ = (q) => h.querySelector(q);
  /* debounced: a full repaint per keystroke over ~1000 items froze typing (Oct 31 2026) */
  let coQT = 0;
  $("#coQ")?.addEventListener("input", (e) => { S.q = e.target.value; S.more = 90; const p = e.target.selectionStart; clearTimeout(coQT); coQT = setTimeout(() => { paint(); const q = h.querySelector("#coQ"); if (q) { q.focus(); try { q.setSelectionRange(p, p); } catch { /* ignore */ } } }, 150); });
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
    c.addEventListener("click", () => { if (S.selecting) { S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); c.classList.toggle("sel", S.sel.has(id)); const bh = h.querySelector(".cx-bh b"); if (bh) bh.textContent = S.sel.size ? `${S.sel.size} selected` : "Tap cards to select"; h.querySelectorAll(".cx-bar [data-bin],.cx-bar [data-bulk]").forEach((x) => { x.disabled = !S.sel.size; }); } else openZoom(id, c); });
    c.addEventListener("keydown", (e) => { if (e.key === "Enter") c.click(); });
  });
  h.querySelectorAll("[data-bulk]").forEach((b) => b.addEventListener("click", () => bulk(b.dataset.bulk)));
  h.querySelectorAll(".cx-bin").forEach((b) => b.addEventListener("click", () => { const v = b.dataset.bin, n = S.sel.size; if (n && assign([...S.sel], v)) { ctx.toast(`Put ${n} in ${loadSpaces().find((s) => s.id === v)?.name || "bin"}`); S.sel.clear(); ctx.refresh(); paint(); } }));
}
function setLane(ids, lane) { const set = new Set(ids.map(String)); if (commit((l) => l.forEach((i) => { if (set.has(String(i.id))) i.lane = lane; }))) { ctx.toast(`Moved ${ids.length} to ${lane === "sealed" ? "Sealed" : "Singles"}`); paint(); } }
function bulk(kind) {
  const ids = [...S.sel]; if (!ids.length) return; const set = new Set(ids);
  if (kind === "sealed" || kind === "singles") { setLane(ids, kind); S.sel.clear(); paint(); }
  else if (kind === "out") { moveOutOfCollection(ids); }
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
function openZoom(id, from) {
  let list = filtered(base()).filter((i) => S.tab === "all" || S.selecting || kindOf2(i) === { binder: "singles", sealed: "sealed", graded: "graded" }[S.tab || "binder"]).sort(sorter); let i = list.findIndex((x) => String(x.id) === String(id));
  if (i < 0) { const it = peekItems().find((x) => String(x.id) === String(id)); if (!it) return; list = [it]; i = 0; }
  openCard(list, {
    index: i, from: from || null, photo: photoOf, name: nameOf, backLabel: "Collection",
    info: (it) => `<div class="vx-act"><div class="row"><span>Where</span><span>${esc(where(it))}</span></div>
      <button class="btn" type="button" data-co="out">Remove from Collection (stays in the app)</button>
      <button class="btn" type="button" data-co="lane">${kindOf2(it) === "sealed" ? "Mark as a single card" : "Mark as sealed product"}</button>
      <button class="btn warn" type="button" data-co="del">Delete</button></div>`,
    wire: (root, it, api) => {
      const d = document.createElement("div"); (root.querySelector(".k-zinfo") || root).appendChild(d); photoManager(d, it.id, { toast: ctx.toast, refresh: ctx.refresh });
      root.querySelector('[data-co="out"]')?.addEventListener("click", () => { api.close(); moveOutOfCollection([it.id]); });
      root.querySelector('[data-co="lane"]')?.addEventListener("click", () => { api.close(); setLane([it.id], kindOf2(it) === "sealed" ? "singles" : "sealed"); });
      root.querySelector('[data-co="del"]')?.addEventListener("click", (e) => { const b = e.currentTarget; if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Tap again to delete"; return; } api.close(); removeItems([it.id]); });
    },
  });
}
/* Move out of Collection: the item stays in the app (Channels, Command, its bin) —
   only Collection stops showing it. Undo puts it back. (Fix list item 11.) */
function moveOutOfCollection(ids) {
  const set = new Set(ids.map(String));
  if (!commit((l) => l.forEach((i) => { if (set.has(String(i.id))) i.notCollection = true; }))) return;
  S.sel.clear(); paint();
  ctx.toastUndo(ids.length === 1 ? "Removed from Collection. Still in Channels." : `Removed ${ids.length} from Collection. Still in Channels.`, () => { commit((l) => l.forEach((i) => { if (set.has(String(i.id))) delete i.notCollection; })); paint(); });
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
/* arrow keys flip the binder */
document.addEventListener("keydown", (e) => { if (!ctx || !ctx.host.isConnected || !ctx.host.querySelector(".cv-binder") || document.querySelector(".fc,ion-modal.show-modal") || /input|select|textarea/i.test(document.activeElement?.tagName || "")) return; if (e.key === "ArrowRight") ctx.host.querySelector('[data-bflip="1"]:not([disabled])')?.click(); else if (e.key === "ArrowLeft") ctx.host.querySelector('[data-bflip="-1"]:not([disabled])')?.click(); });
