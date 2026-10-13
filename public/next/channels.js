import { esc, money, nameOf, photoOf, laneOf, gameOf, loadItems, saveItems, loadSpaces, assign } from "./shared.js?v=2";

let ctx = null;
const S = { stage: "listed", view: "cards", group: "game", q: "", sort: "value", sel: new Set(), more: {}, closed: new Set() };
const STAGES = [["listed", "Live on eBay"], ["staged", "Ready to list"], ["intake", "Photos in"], ["sold", "Sold"], ["ended", "Ended on eBay"], ["all", "Everything"]];
const SOLD = ["sold", "packed", "shipped", "delivered"];
const stageOf = (it) => it.ended && !SOLD.includes(it.phase) ? "ended" : SOLD.includes(it.phase) ? "sold" : (it.phase || "intake");
const STAGE_LABEL = { listed: "Live on eBay", staged: "Ready to list", intake: "Photos in", sold: "Sold", ended: "Ended on eBay" };
const keyOf = (it) => S.group === "stage" ? STAGE_LABEL[stageOf(it)] || "Other" : S.group === "game" ? gameOf(it) : S.group === "bin" ? (loadSpaces().find((s) => s.id === it.spaceId)?.name || "Not filed yet") : S.group === "type" ? (laneOf(it) === "sealed" ? "Sealed" : "Singles") : "All items";

function rows() {
  const q = S.q.trim().toLowerCase();
  return loadItems().filter((it) => (S.stage === "all" || stageOf(it) === S.stage) && (!q || nameOf(it).toLowerCase().includes(q) || String(it.sku || "").toLowerCase().includes(q)))
    .sort((a, b) => S.sort === "name" ? nameOf(a).localeCompare(nameOf(b)) : S.sort === "low" ? (Number(a.price) || 0) - (Number(b.price) || 0) : (Number(b.price) || 0) - (Number(a.price) || 0));
}
function tile(it) {
  const src = photoOf(it), on = S.sel.has(String(it.id));
  if (S.view === "list") return `<label class="sp-row ch-row${on ? " on" : ""}" data-id="${esc(it.id)}"><input type="checkbox" data-id="${esc(it.id)}" ${on ? "checked" : ""}>${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : "<i></i>"}<span>${esc(nameOf(it))}</span><em>${esc(STAGE_LABEL[stageOf(it)] || "")}</em><b>${money(it.price)}</b><small>x${Number(it.quantity) || 1}</small></label>`;
  return `<article class="co-card ch-tile ${S.view}${on ? " sel" : ""}" data-id="${esc(it.id)}" tabindex="0"><div class="co-art"><div class="co-img">${src ? `<img src="${esc(src)}" alt="" loading="lazy" draggable="false">` : `<span class="co-ini">${esc(nameOf(it).charAt(0))}</span>`}<i class="co-sheen"></i></div><i class="co-pick${on ? " on" : ""}">${on ? "✓" : ""}</i></div>${S.view === "cards" ? `<div class="co-cap"><span>${esc(nameOf(it))}</span><b>${money(it.price)}</b></div>` : `<div class="ch-price">${money(it.price)}</div>`}</article>`;
}
function paint() {
  const all = rows(), h = ctx.host; const groups = new Map();
  for (const it of all) { const k = keyOf(it); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
  const total = all.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
  const counts = Object.fromEntries(STAGES.map(([k]) => [k, loadItems().filter((i) => k === "all" || stageOf(i) === k).length]));
  const sections = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, list]) => {
    const shown = list.slice(0, S.more[k] || 120), closed = S.closed.has(k);
    return `<section class="ch-group"><header><button class="ch-fold" data-fold="${esc(k)}" type="button" aria-expanded="${!closed}">${closed ? "▸" : "▾"} ${esc(k)} <em>${list.length}</em></button><span>${money(list.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0))}</span><button class="chip" data-selgrp="${esc(k)}" type="button">Select this group (${list.length})</button></header>
      ${closed ? "" : `<div class="${S.view === "list" ? "sp-list" : "co-grid ch-grid " + S.view}">${shown.map(tile).join("")}</div>${list.length > shown.length ? `<button class="btn" data-more="${esc(k)}" type="button">Show ${Math.min(120, list.length - shown.length)} more of ${list.length - shown.length}</button>` : ""}`}</section>`;
  }).join("");
  const n = S.sel.size;
  h.innerHTML = `<div class="co-wrap ch-wrap">
    <div class="co-head"><div><h2>Channels</h2><p>${all.length} listings shown · ${money(total)} at list price · eBay is your main channel</p></div>
      <div class="co-tools"><input id="chQ" type="search" placeholder="Search title or SKU" value="${esc(S.q)}"><select id="chSort" aria-label="Sort"><option value="value"${S.sort === "value" ? " selected" : ""}>Highest price</option><option value="low"${S.sort === "low" ? " selected" : ""}>Lowest price</option><option value="name"${S.sort === "name" ? " selected" : ""}>A to Z</option></select></div></div>
    <div class="co-chips" role="group" aria-label="Stage">${STAGES.map(([k, l]) => `<button class="chip${S.stage === k ? " on" : ""}" data-stage="${k}" type="button">${l} <em>${counts[k]}</em></button>`).join("")}</div>
    <div class="ch-bar"><div class="seg" role="group" aria-label="View">${[["cards", "Cards"], ["grid", "Grid"], ["list", "List"]].map(([k, l]) => `<button class="${S.view === k ? "on" : ""}" data-view="${k}" type="button">${l}</button>`).join("")}</div>
      <label class="ch-g">Group by <select id="chGroup">${[["game", "Game"], ["stage", "Stage"], ["type", "Sealed / Singles"], ["bin", "Bin"], ["none", "Nothing"]].map(([k, l]) => `<option value="${k}"${S.group === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      <button class="btn" id="chAll" type="button">Select everything (${all.length})</button></div>
    ${sections || `<div class="co-empty">${counts.all ? "Nothing matches. Try another stage or clear the search." : "Nothing here yet. Tap Sync to pull your eBay listings."}</div>`}
    ${n ? bar(n) : ""}</div>`;
  wire(all);
}
function bar(n) {
  const spaces = loadSpaces();
  return `<div class="co-bar"><b>${n} selected</b>
    <select id="chBin" aria-label="Send to bin"><option value="">Send to bin…</option>${spaces.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}</select>
    <span class="co-pct"><input id="chPct" inputmode="numeric" placeholder="±%" aria-label="Percent"><button class="btn" data-bulk="pct" type="button">Change price</button></span>
    <button class="btn" data-bulk="live" type="button">Publish on eBay…</button><button class="btn" data-bulk="end" type="button">End on eBay…</button>
    <button class="btn warn" data-bulk="del" type="button">Remove from app</button><button class="btn" data-bulk="clear" type="button">Clear</button>
    <small>Price and remove change this app only. Publish and end touch real eBay listings, so they ask first.</small></div>`;
}
function commit(mut) { const l = loadItems(); mut(l); if (!saveItems(l)) { ctx.toast("Couldn't save. Storage is full."); return false; } ctx.refresh(); return true; }
function toggle(id) { S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); }
function wire(all) {
  const h = ctx.host, $ = (s) => h.querySelector(s);
  $("#chQ").addEventListener("input", (e) => { S.q = e.target.value; const p = e.target.selectionStart; paint(); const q = h.querySelector("#chQ"); q.focus(); q.setSelectionRange(p, p); });
  $("#chSort").addEventListener("change", (e) => { S.sort = e.target.value; paint(); });
  $("#chGroup").addEventListener("change", (e) => { S.group = e.target.value; S.more = {}; paint(); });
  h.querySelectorAll("[data-stage]").forEach((b) => b.addEventListener("click", () => { S.stage = b.dataset.stage; S.more = {}; paint(); }));
  h.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => { S.view = b.dataset.view; paint(); }));
  h.querySelectorAll("[data-fold]").forEach((b) => b.addEventListener("click", () => { const k = b.dataset.fold; S.closed.has(k) ? S.closed.delete(k) : S.closed.add(k); paint(); }));
  h.querySelectorAll("[data-more]").forEach((b) => b.addEventListener("click", () => { S.more[b.dataset.more] = (S.more[b.dataset.more] || 120) + 120; paint(); }));
  h.querySelectorAll("[data-selgrp]").forEach((b) => b.addEventListener("click", () => { all.filter((i) => keyOf(i) === b.dataset.selgrp).forEach((i) => S.sel.add(String(i.id))); paint(); }));
  $("#chAll").addEventListener("click", () => { all.forEach((i) => S.sel.add(String(i.id))); paint(); });
  h.querySelectorAll(".ch-tile").forEach((c) => { c.addEventListener("click", () => { toggle(c.dataset.id); paint(); }); c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); c.click(); } }); });
  h.querySelectorAll(".ch-row input").forEach((c) => c.addEventListener("change", () => { toggle(c.dataset.id); paint(); }));
  $("#chBin")?.addEventListener("change", (e) => { const v = e.target.value; if (!v) return; const ids = [...S.sel], prev = snap(); if (assign(ids, v)) { S.sel.clear(); ctx.refresh(); paint(); ctx.toastUndo(`Filed ${ids.length} into ${loadSpaces().find((s) => s.id === v)?.name}`, () => { restore(prev); ctx.refresh(); paint(); }); } });
  h.querySelectorAll("[data-bulk]").forEach((b) => b.addEventListener("click", () => bulk(b.dataset.bulk)));
}
const snap = () => ({ items: localStorage.getItem("coalition-items-v4"), spaces: localStorage.getItem("coalition-spaces-v4") });
function restore(p) { try { if (p.items != null) localStorage.setItem("coalition-items-v4", p.items); if (p.spaces != null) localStorage.setItem("coalition-spaces-v4", p.spaces); } catch { /* ignore */ } }
function bulk(kind) {
  const ids = [...S.sel]; if (!ids.length && kind !== "clear") return; const set = new Set(ids);
  if (kind === "clear") { S.sel.clear(); paint(); return; }
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
export function renderChannels(host, api) { ctx = { host, ...api }; if (window.__chStage) { S.stage = window.__chStage; S.more = {}; window.__chStage = null; } if (!host.querySelector(".ch-wrap")) S.sel.clear(); paint(); }
