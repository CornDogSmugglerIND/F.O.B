import { esc, money, nameOf, photoOf, laneOf, gameOf, peekItems, loadItems, saveItems, loadSpaces, assign } from "./shared.js?v=5";
import { photoManager } from "./photos.js?v=3";
import { openCard } from "./kit.js?v=2";
import { orderItems, trackUrl, whenLabel, dayText, trackerHtml, setOv, hideIds, track } from "./orders.js?v=4";

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
let _liveSrc = null, _liveOut = null, _liveGrp = null;
function live() {
  const src = peekItems(); if (src === _liveSrc && _liveOut) { GROUP = _liveGrp; return _liveOut; }
  const out = [], seen = new Map(); GROUP = new Map();
  for (const it of shown()) {
    if (it.ended || SOLD.includes(it.phase) || /^(demo-|mp-)/.test(String(it.id))) continue;
    const lid = it.phase === "listed" && it.channels?.ebay?.listingId;
    if (it.phase === "listed" && (!lid || /^demo/.test(lid))) continue; /* "Live on eBay" = has a real eBay listing id, nothing else */
    if (lid && !/^demo/.test(lid)) { const g = seen.get(lid); if (g) { g._kids.push(it); continue; } const rep = Object.assign({}, it, { _kids: [it] }); seen.set(lid, rep); out.push(rep); } else out.push(it);
  }
  for (const r of out) if (r._kids) { r._n = r._kids.length; if (r._n > 1) { const gi = r._kids.find((k) => k.groupImage), gt = r._kids.find((k) => k.groupTitle); if (gi) r.photos = [{ id: "grp-cover", dataUrl: gi.groupImage }]; if (gt) r.title = gt.groupTitle; } GROUP.set(String(r.id), r._kids.map((k) => String(k.id))); if (r._n > 1) { const ps = r._kids.map((k) => Number(k.price) || 0); r._lo = Math.min(...ps); r._hi = Math.max(...ps); r.quantity = r._kids.reduce((a, k) => a + (Number(k.quantity) || 1), 0); } }
  _liveSrc = src; _liveOut = out; _liveGrp = GROUP;
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
  return `<article class="co-card ch-tile k-tilt ${S.view}${on ? " sel" : ""}" data-id="${esc(it.id)}" tabindex="0"><div class="co-art"><div class="co-img">${src ? `<img src="${esc(src)}" alt="" loading="lazy" draggable="false">` : `<span class="co-ini">${esc(nameOf(it).charAt(0))}</span>`}<i class="co-sheen"></i></div>${badge(it) ? `<i class="ch-badge">${esc(badge(it))}</i>` : ""}<i class="co-pick${on ? " on" : ""}" data-pick="${esc(it.id)}">${on ? "✓" : ""}</i></div>${S.view === "cards" ? `<div class="co-cap"><span>${esc(nameOf(it))}</span><b>${ptxt(it)}</b></div>` : `<div class="ch-price">${ptxt(it)}</div>`}</article>`;
}
function routeHtml(counts) {
  return `<div class="ch-route" role="group" aria-label="Stage">${STAGES.map(([k, l, c]) => `<button class="ch-stop${S.stage === k ? " on" : ""}" data-stage="${k}" type="button" style="--c:${c}"><i class="ch-dot"></i><span>${l}</span><em>${counts[k]}</em></button>`).join("")}</div>`;
}
function drawerHtml() {
  if (!S.drawer) return "";
  return `<div class="ch-drawer">
    <div class="ch-drow"><span>View</span><div class="seg" role="group" aria-label="View">${[["cards", "Cards"], ["grid", "Grid"], ["list", "List"]].map(([k, l]) => `<button class="${S.view === k ? "on" : ""}" data-view="${k}" type="button">${l}</button>`).join("")}</div></div>
    <div class="ch-drow"><span>Group by</span><select id="chGroup" aria-label="Group by">${[["game", "Game"], ["stage", "Stage"], ["type", "Sealed / Singles"], ["bin", "Bin"], ["none", "Nothing"]].map(([k, l]) => `<option value="${k}"${S.group === k ? " selected" : ""}>${l}</option>`).join("")}</select></div>
    <div class="ch-drow"><span>Sort</span><select id="chSort" aria-label="Sort"><option value="value"${S.sort === "value" ? " selected" : ""}>Highest price</option><option value="low"${S.sort === "low" ? " selected" : ""}>Lowest price</option><option value="name"${S.sort === "name" ? " selected" : ""}>A to Z</option></select></div>
    <div class="ch-drow"><span>Select</span><button class="btn" id="chAll" type="button">Select everything shown</button></div>
  </div>`;
}
function paint() {
  const all = rows(), h = ctx.host; const groups = new Map();
  for (const it of all) { const k = keyOf(it); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
  const total = all.reduce((a, i) => a + (i._order ? Number(i.price) || 0 : valOf(i)), 0);
  const counts = Object.fromEntries(STAGES.map(([k]) => [k, pool(k).length]));
  const sections = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, list]) => {
    const shown = list.slice(0, S.more[k] || 120), closed = S.closed.has(k);
    return `<section class="ch-group"><header><button class="ch-fold" data-fold="${esc(k)}" type="button" aria-expanded="${!closed}">${closed ? "▸" : "▾"} ${esc(k)} <em>${list.length}</em></button><span>${money(list.reduce((a, i) => a + (i._order ? Number(i.price) || 0 : valOf(i)), 0))}</span><button class="chip" data-selgrp="${esc(k)}" type="button">Select this group (${list.length})</button></header>
      ${closed ? "" : `<div class="${S.view === "list" ? "sp-list" : "co-grid ch-grid " + S.view}">${shown.map(tile).join("")}</div>${list.length > shown.length ? `<button class="btn" data-more="${esc(k)}" type="button">Show ${Math.min(120, list.length - shown.length)} more of ${list.length - shown.length}</button>` : ""}`}</section>`;
  }).join("");
  const n = S.sel.size;
  h.innerHTML = `<div class="co-wrap ch-wrap">
    <div class="co-head"><div><h2>Channels</h2><p>${["sold", "shipped", "delivered"].includes(S.stage) ? `${all.length} order${all.length === 1 ? "" : "s"} from eBay, last 90 days · ${money(total)} sold` : `${all.length} listing${all.length === 1 ? "" : "s"} · ${money(total)} at list price`}</p></div></div>
    ${routeHtml(counts)}
    <div class="ch-bar2"><input id="chQ" type="search" placeholder="Search title or SKU" value="${esc(S.q)}" aria-label="Search title or SKU">
      <button class="btn ch-controls${S.drawer ? " on" : ""}" id="chCtl" type="button" aria-expanded="${S.drawer}">Controls</button></div>
    ${drawerHtml()}
    ${sections || `<div class="co-empty">${S.q ? "Nothing matches that search." : ["sold", "shipped", "delivered"].includes(S.stage) ? "No orders here. Tap Sync to pull your eBay orders." : "Nothing here yet."}</div>`}
    ${n ? bar(n) : ""}</div>`;
  wire(all);
}
function bar(n) {
  const spaces = loadSpaces();
  return `<div class="co-bar"><b>${n} selected</b>
    <select id="chBin" aria-label="Send to bin"><option value="">Send to bin…</option>${spaces.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}</select>
    <span class="co-pct"><input id="chPct" inputmode="numeric" placeholder="±%" aria-label="Percent"><button class="btn" data-bulk="pct" type="button">Change price</button></span>
    <button class="btn go" data-bulk="var" type="button">Make one variation listing</button><button class="btn" data-bulk="live" type="button">Publish on eBay…</button><button class="btn" data-bulk="end" type="button">End on eBay…</button>
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
  return `<div class="row"><span>Variations</span><span>${it._n} options</span></div><div class="bl-vars">${it._kids.slice(0, 40).map((k) => `<div><span>${esc(nameOf(k))}</span><b>${money(k.price)}</b></div>`).join("")}${it._n > 40 ? `<div><span>and ${it._n - 40} more</span></div>` : ""}</div>`;
}
function zoom(list, el) {
  const id = el.dataset.id, idx = list.findIndex((i) => String(i.id) === String(id)); if (idx < 0) return;
  openCard(list, {
    index: idx, from: el, photo: photoOf, name: nameOf,
    info: (it) => it._order ? orderInfo(it) : varInfo(it) + (() => { const sp = loadSpaces().find((s) => s.id === it.spaceId); const on = S.sel.has(String(it.id));
      return `<div class="sub">${esc(STAGE_LABEL[stageOf(it)] || "")}</div><div class="row"><span>Price</span><span>${money(it.price)}</span></div><div class="row"><span>Quantity</span><span>${Number(it.quantity) || 1}</span></div>${(it.photos || []).length > 1 ? `<div class="row"><span>Photos</span><span>${it.photos.length}, all kept together</span></div>` : ""}<div class="row"><span>Bin</span><span>${esc(sp ? sp.name : "Not filed yet")}</span></div>${stageOf(it) === "staged" ? `<button class="btn go" data-build type="button">Build the listing</button>` : ""}<button class="btn" data-sel type="button">${on ? "Deselect" : "Select for bulk actions"}</button><button class="btn warn" data-rm type="button">${String(it.id).startsWith("ebay-") ? "Hide from this app (stays on eBay)" : "Delete this item"}</button>`; })(),
    wire: (root, it, api) => { if (!it._order) { const d = document.createElement("div"); (root.querySelector(".k-zinfo") || root).appendChild(d); photoManager(d, it.id, { toast: ctx.toast, refresh: ctx.refresh }); } root.querySelector("[data-ov]")?.addEventListener("click", (e) => { setOv(it._order.orderId, e.currentTarget.dataset.ov); api.close(); ctx.toast(e.currentTarget.dataset.ov === "delivered" ? "Moved to Delivered" : "Moved back to Shipped"); paint(); }); root.querySelector("[data-build]")?.addEventListener("click", () => { api.close(); buildSheet(it); }); root.querySelector("[data-rm]")?.addEventListener("click", () => removeItem(it, api.close)); root.querySelector("[data-sel]")?.addEventListener("click", () => { toggle(String(it.id)); paint(); root.querySelector("[data-sel]").textContent = S.sel.has(String(it.id)) ? "Deselect" : "Select for bulk actions"; }); },
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
  h.querySelectorAll(".ch-tile").forEach((c) => { c.addEventListener("click", () => zoom(all, c)); c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); zoom(all, c); } }); });
  h.querySelectorAll(".ch-row").forEach((r) => r.addEventListener("click", (e) => { if (e.target.closest("input")) return; zoom(all, r); }));
  h.querySelectorAll(".ch-row input").forEach((c) => c.addEventListener("change", () => { toggle(c.dataset.id); paint(); }));
  $("#chBin")?.addEventListener("change", (e) => { const v = e.target.value; if (!v) return; const ids = [...S.sel], prev = snap(); if (assign(ids, v)) { S.sel.clear(); ctx.refresh(); paint(); ctx.toastUndo(`Filed ${ids.length} into ${loadSpaces().find((s) => s.id === v)?.name}`, () => { restore(prev); ctx.refresh(); paint(); }); } });
  h.querySelectorAll("[data-bulk]").forEach((b) => b.addEventListener("click", () => bulk(b.dataset.bulk)));
}
const snap = () => ({ items: localStorage.getItem("coalition-items-v4"), spaces: localStorage.getItem("coalition-spaces-v4") });
function restore(p) { try { if (p.items != null) localStorage.setItem("coalition-items-v4", p.items); if (p.spaces != null) localStorage.setItem("coalition-spaces-v4", p.spaces); } catch { /* ignore */ } }
function bulk(kind) {
  const ids = expand([...S.sel]); if (!ids.length && kind !== "clear") return; const set = new Set(ids.map(String)); if (kind === "del") hideIds([...set].filter((x) => x.startsWith("ebay-")));
  if (kind === "clear") { S.sel.clear(); paint(); return; }
  if (kind === "var") { varSheet(loadItems().filter((i) => set.has(String(i.id)))); return; }
  if (kind === "pct") {
    const p = parseFloat(String(ctx.host.querySelector("#chPct").value).replace(/[^0-9.\-+]/g, "")); if (!Number.isFinite(p) || !p) { ctx.toast("Type a percent, like -10 or 15."); return; }
    const prev = snap(); if (commit((l) => l.forEach((i) => { if (set.has(String(i.id))) i.price = Math.max(0, Math.round((Number(i.price) || 0) * (1 + p / 100) * 100) / 100); }))) { S.sel.clear(); paint(); ctx.toastUndo(`Changed ${ids.length} prices ${p > 0 ? "+" : ""}${p}% in this app`, () => { restore(prev); ctx.refresh(); paint(); }); }
  } else if (kind === "del") {
    const prev = snap(); if (commit((l) => { for (let k = l.length - 1; k >= 0; k--) if (set.has(String(l[k].id))) l.splice(k, 1); })) { S.sel.clear(); paint(); ctx.toastUndo(`Removed ${ids.length} from this app`, () => { restore(prev); ctx.refresh(); paint(); }); }
  } else if (kind === "live" || kind === "end") {
    const verb = kind === "live" ? "Publish" : "End";
    const s = ctx.openSheet(`<a class="back" href="#" data-close>‹ Back</a><h2>${verb} ${ids.length} on eBay?</h2><p class="sub">This changes real eBay listings. It is switched off until you approve it, so nothing happens yet.</p><p>${kind === "live" ? "Publishing needs each item to have its listing built first. Use Build the listing on the item, then publish." : "Ending takes the listing off eBay. You can relist it later."}</p><div class="co-znav"><button class="btn" data-close type="button">OK, got it</button></div>`);
    s.querySelector(".co-znav .btn").addEventListener("click", ctx.closeSheet);
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
      const r = await fetch("/api/channels/ebay/publish-variation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, dryRun }), signal: ctl.signal });
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
    <label class="sc-f"><span>Condition</span><select id="blCond">${[["NM", "Near Mint"], ["LP", "Lightly Played"], ["MP", "Moderately Played"], ["HP", "Heavily Played"]].map(([k, l]) => `<option value="${k}"${String(it.condition || "NM").toUpperCase() === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>
    <label class="sc-f"><span>Description</span><textarea id="blDesc" rows="8" style="width:100%;resize:vertical"></textarea></label>
    <div class="sc-f"><span>Item specifics</span><div id="blAsp" class="bl-vars" style="max-height:none"></div><button class="btn" id="blAddAsp" type="button" style="margin-top:6px">Add item specific</button></div>
    <div class="sc-f"><span>Shipping, returns and payment</span><div id="blPol" class="sub">Loading your eBay policies…</div></div>
    <label class="sc-f" style="flex-direction:row;gap:10px;align-items:center"><input type="checkbox" id="blDH" checked><span>Also download the Double Holo files (cards + photos) after listing</span></label>
    <div id="blMsg" class="sub bl-msg" role="status">Nothing goes live until you tap List on eBay twice.</div>
    <div class="co-znav bl-act"><button class="btn go" id="blGo" type="button">List on eBay</button></div>`);
  const aspRow = (k = "", v = "") => `<div style="gap:6px;align-items:center;display:flex"><input data-ak value="${esc(k)}" placeholder="Name" aria-label="Item specific name" style="flex:1;min-width:0"><input data-av value="${esc(v)}" placeholder="Value" aria-label="Item specific value" style="flex:1;min-width:0"><button class="btn" data-rm type="button" aria-label="Remove this item specific" style="flex:none;padding:6px 12px">×</button></div>`;
  const $ = (q) => s.querySelector(q), msg = (t, bad) => { const m = $("#blMsg"); m.textContent = t; m.style.color = bad ? "var(--org)" : ""; };
  let armed = null;
  const paintPh = () => { const cur = loadItems().find((x) => String(x.id) === String(it.id)) || it, list = cur.photos || []; $("#blPh").innerHTML = list.map((p, k) => `<button type="button" class="bl-pic${k === 0 ? " on" : ""}" data-k="${k}" aria-label="${k === 0 ? "Main photo" : "Make this the main photo"}"><img src="${esc(p.dataUrl || p.url || "")}" alt="" draggable="false">${k === 0 ? "<b>Main</b>" : ""}</button>`).join(""); };
  paintPh();
  $("#blPh").addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (!b || b.dataset.k === "0") return; const k = Number(b.dataset.k); patchItem(it.id, (i) => { const l = i.photos || []; const [m] = l.splice(k, 1); l.unshift(m); i.photos = l; }); paintPh(); });
  $("#blDesc").value = it.description || "";
  $("#blAddAsp").addEventListener("click", () => { $("#blAsp").insertAdjacentHTML("beforeend", aspRow()); });
  $("#blAsp").addEventListener("click", (e) => { const b = e.target.closest("[data-rm]"); if (b) b.parentElement.remove(); });
  fetch("/api/channels/ebay/listing-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item: it }) }).then((r) => r.json()).then((p) => {
    if (!p || !p.ok || !s.isConnected) return;
    if (!$("#blDesc").value) $("#blDesc").value = p.description || "";
    const ex = it.aspects || {}, all = Object.assign({}, p.aspects, ex);
    $("#blAsp").innerHTML = Object.entries(all).map(([k, v]) => aspRow(k, Array.isArray(v) ? v.join(", ") : v)).join("");
    const line = (l, o) => `<div class="row"><span>${l}</span><span>${o ? esc(o.name) : "Not set up in eBay yet"}</span></div>`;
    const opts = p.shippingOptions || [], cur = it.fulfillmentPolicyId || (p.shipping && p.shipping.id) || "";
    const shipRow = opts.length ? `<label class="sc-f"><span>Shipping</span><select id="blShip">${opts.map((o) => `<option value="${esc(o.id)}"${String(o.id) === String(cur) ? " selected" : ""}>${esc(o.name)}</option>`).join("")}</select></label>` : line("Shipping", p.shipping);
    $("#blPol").innerHTML = shipRow + line("Returns", p.returns) + line("Payment", p.payment);
  }).catch(() => { if (s.isConnected) $("#blPol").textContent = "Couldn't load your eBay policies. eBay will use your defaults."; });
  const read = () => {
    const title = $("#blTitle").value.trim().slice(0, 80), price = parseFloat(String($("#blPrice").value).replace(/[^0-9.]/g, "")), qty = Math.max(1, parseInt($("#blQty").value, 10) || 1), cond = $("#blCond").value;
    if (!title) { msg("Add a title first.", true); return null; }
    if (!(price > 0)) { msg("Add a price first.", true); return null; }
    const aspects = {}; s.querySelectorAll("#blAsp > div").forEach((r) => { const k = r.querySelector("[data-ak]").value.trim(), v = r.querySelector("[data-av]").value.trim(); if (k && v) aspects[k] = v; });
    const ship = s.querySelector("#blShip"); return { title, price, quantity: qty, condition: cond, ...(ship ? { fulfillmentPolicyId: ship.value } : {}), description: $("#blDesc").value.trim() || title, aspects };
  };
  const call = async (dryRun) => {
    const f = read(); if (!f) return null;
    const saved = patchItem(it.id, (i) => Object.assign(i, f)) || Object.assign({}, it, f);
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 90000);
    try {
      const res = await fetch("/api/channels/ebay/publish-item", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item: saved, dryRun }), signal: ctl.signal });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) { msg(out.error || "eBay said no. Check the details and try again.", true); return null; }
      return out;
    } catch (e) { msg(e.name === "AbortError" ? "eBay took too long. Nothing was listed. Try again." : "Couldn't reach eBay. Nothing was listed.", true); return null; }
    finally { clearTimeout(to); }
  };
  const busy = (on) => { $("#blGo").disabled = on; };
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
      const dl = async (source, items, name) => { try { const r = await fetch("/api/csv/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, items }) }); if (!r.ok) return false; const u = URL.createObjectURL(await r.blob()), a = document.createElement("a"); a.href = u; a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); return true; } catch { return false; } };
      const ok1 = await dl("double_holo", [dhItem], "double-holo-cards");
      await new Promise((r) => setTimeout(r, 700));
      const ok2 = (out.imageUrls || []).length ? await dl("double_holo_photos", [Object.assign({}, dhItem, { picUrls: out.imageUrls })], "double-holo-photos") : false;
      ctx.toast(ok1 && ok2 ? "Double Holo files downloaded: upload the cards file, then the photos file." : ok1 ? "Cards file downloaded. Photos file couldn't be made." : "Couldn't make the Double Holo files.");
    }
  });
}
export function renderChannels(host, api) { ctx = { host, ...api }; if (window.__chStage) { S.stage = /^(intake|staged)$/.test(window.__chStage) ? "listed" : window.__chStage; S.more = {}; window.__chStage = null; } if (/^(intake|staged)$/.test(S.stage)) S.stage = "listed"; if (!host.querySelector(".ch-wrap")) S.sel.clear(); paint(); }
/* Listing is built from Command, never from the Channels page (Channels = what is live on eBay). */
export function buildListing(id, api) { ctx = { host: document.createElement("div"), ...api }; const it = loadItems().find((x) => String(x.id) === String(id)); if (it) buildSheet(it); }
export function variationListing(api) { ctx = { host: document.createElement("div"), ...api }; varSheet(shown().filter((i) => i.phase === "staged" && !i.ended)); }
