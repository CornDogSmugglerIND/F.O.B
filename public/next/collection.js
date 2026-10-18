import { openCard } from "./kit.js?v=2";
import { esc, money, nameOf, photoOf, onHand, laneOf, gameOf, loadItems, saveItems, loadSpaces, assign } from "./shared.js?v=4";

let ctx = null;
const S = { q: "", stage: "all", sort: "value", sel: new Set(), selecting: false, tab: "sealed", zoom: null, trash: null, menu: false };
const phoneNow = () => matchMedia("(max-width:820px)").matches;

function rows() {
  const q = S.q.trim().toLowerCase();
  return loadItems().filter(onHand).filter((it) => {
    if (S.stage === "ready" && it.phase !== "staged") return false;
    if (S.stage === "live" && it.phase !== "listed") return false;
    if (S.stage === "new" && it.phase !== "intake") return false;
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
const val = (l) => l.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
function portfolio(all, sealed, singles) {
  const total = val(all), by = new Map(); for (const i of all) { const g = gameOf(i) || "Other"; by.set(g, (by.get(g) || 0) + (Number(i.price) || 0) * (Number(i.quantity) || 1)); }
  const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5), hue = ["#B3FBD5", "#90FFEE", "#7fb7a3", "#9195A0", "#6c7079"];
  return `<div class="co-port"><div class="co-big"><em>Collection value at market</em><b id="coTotal" data-v="${total.toFixed(2)}">${money(total)}</b><span>${all.length} items · ${sealed.length} sealed · ${singles.length} singles</span><span>${["Live on eBay", "eBay draft", "On Double Holo", "Not listed"].map((w) => `${w} ${money(val(all.filter((i) => where(i) === w)))}`).join(" · ")}</span></div>
    <div class="co-split" aria-label="Value by game">${top.map(([g, v], i) => `<i style="flex:${Math.max(v, 1)};background:${hue[i]}" title="${esc(g)}"></i>`).join("")}</div>
    <div class="co-legend">${top.map(([g, v], i) => `<span><u style="background:${hue[i]}"></u>${esc(g)} <b>${money(v)}</b></span>`).join("")}</div></div>`;
}
function paint() {
  const host = ctx.host, all = rows(); const sealed = all.filter((i) => laneOf(i) === "sealed"), singles = all.filter((i) => laneOf(i) === "singles");
  const total = all.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
  const lane = (id, label, hint, list) => `<section class="co-lane${phoneNow() && S.tab !== id ? " hide" : ""}" data-lane="${id}"><h3>${label} <em>${list.length}</em></h3><p class="co-hint">${hint}</p><div class="co-grid">${list.length ? list.map(card).join("") : `<div class="co-empty">Nothing here. ${all.length ? "Drag a card in, or change the filter." : "Add items in Scouter."}</div>`}</div></section>`;
  host.innerHTML = `<div class="co-wrap">
    ${portfolio(all, sealed, singles)}
    <div class="co-bar2"><input id="coQ" type="search" placeholder="Search your collection" value="${esc(S.q)}">
      <button class="btn${S.selecting ? " go" : ""}" id="coSel" type="button">${S.selecting ? "Done selecting" : "Select"}</button>
      <button class="btn" id="coIO" type="button">Import / Export</button>
      <button class="btn co-view${S.menu ? " go" : ""}" id="coMenuBtn" type="button" aria-expanded="${!!S.menu}">View ▾</button>
      ${S.menu ? `<div class="co-menu" id="coMenu"><div class="co-mrow"><span>Show</span><div class="co-chips" role="group" aria-label="Stage filter">${[["all", "All"], ["new", "Intake"], ["ready", "Ready to list"], ["live", "Live on eBay"]].map(([k, l]) => `<button class="chip${S.stage === k ? " on" : ""}" data-stage="${k}" type="button">${l}</button>`).join("")}</div></div>
      <div class="co-mrow"><span>Sort</span><select id="coSort" aria-label="Sort"><option value="value"${S.sort === "value" ? " selected" : ""}>Highest value</option><option value="new"${S.sort === "new" ? " selected" : ""}>Newest</option><option value="name"${S.sort === "name" ? " selected" : ""}>A to Z</option></select></div></div>` : ""}</div>
    ${phoneNow() ? `<div class="co-tabs"><button class="chip${S.tab === "sealed" ? " on" : ""}" data-tab="sealed" type="button">Sealed ${sealed.length}</button><button class="chip${S.tab === "singles" ? " on" : ""}" data-tab="singles" type="button">Singles ${singles.length}</button></div>` : ""}
    <div class="co-lanes">${lane("sealed", "Sealed", "Boxes, packs, decks, tins. " + (phoneNow() ? "Tap a card, then Move to Singles." : "Drag a card to Singles to move it."), sealed)}${lane("singles", "Singles", "Individual cards and slabs. " + (phoneNow() ? "Tap a card, then Move to Sealed." : "Drag a card to Sealed to move it."), singles)}</div>
    ${S.selecting ? bar() : ""}</div>`;
  wire();
}
function bar() {
  const n = S.sel.size, spaces = loadSpaces();
  return `<div class="co-bar"><b>${n} selected</b>
    <button class="btn" data-bulk="sealed" type="button" ${n ? "" : "disabled"}>To Sealed</button><button class="btn" data-bulk="singles" type="button" ${n ? "" : "disabled"}>To Singles</button>
    <select id="coBin" ${n ? "" : "disabled"} aria-label="Send to bin"><option value="">Send to bin…</option>${spaces.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}</select>
    <span class="co-pct"><input id="coPct" inputmode="numeric" placeholder="±%" aria-label="Percent change"><button class="btn" data-bulk="pct" type="button" ${n ? "" : "disabled"}>Change price</button></span>
    <button class="btn warn" data-bulk="del" type="button" ${n ? "" : "disabled"}>Remove from app</button><small>Price and remove change this app only, not eBay.</small></div>`;
}
function commit(mut) { const list = loadItems(); mut(list); if (!saveItems(list)) { ctx.toast("Couldn't save. Storage is full."); return false; } ctx.refresh(); return true; }
function wire() {
  const h = ctx.host; const $ = (s) => h.querySelector(s);
  $("#coQ").addEventListener("input", (e) => { S.q = e.target.value; const p = e.target.selectionStart; paint(); const q = h.querySelector("#coQ"); q.focus(); q.setSelectionRange(p, p); });
  $("#coMenuBtn").addEventListener("click", () => { S.menu = !S.menu; paint(); });
  $("#coSort")?.addEventListener("change", (e) => { S.sort = e.target.value; paint(); });
  $("#coIO").addEventListener("click", ioSheet);
  $("#coSel").addEventListener("click", () => { S.selecting = !S.selecting; if (!S.selecting) S.sel.clear(); paint(); });
  h.querySelectorAll("[data-stage]").forEach((b) => b.addEventListener("click", () => { S.stage = b.dataset.stage; paint(); }));
  h.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { S.tab = b.dataset.tab; paint(); }));
  h.querySelectorAll(".co-card").forEach((c) => {
    const id = c.dataset.id;
    c.addEventListener("click", () => { if (S.selecting) { S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); paint(); } else openZoom(id, c.querySelector(".co-img")); });
    c.addEventListener("keydown", (e) => { if (e.key === "Enter") c.click(); });
    c.addEventListener("dragstart", (e) => { const ids = S.selecting && S.sel.has(id) ? [...S.sel] : [id]; e.dataTransfer.setData("text/plain", JSON.stringify(ids)); e.dataTransfer.effectAllowed = "move"; c.classList.add("drag"); });
    c.addEventListener("dragend", () => c.classList.remove("drag"));
  });
  h.querySelectorAll(".co-lane").forEach((l) => {
    l.addEventListener("dragover", (e) => { e.preventDefault(); l.classList.add("over"); }); l.addEventListener("dragleave", (e) => { if (!l.contains(e.relatedTarget)) l.classList.remove("over"); });
    l.addEventListener("drop", (e) => { e.preventDefault(); l.classList.remove("over"); let ids = []; try { ids = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { /* ignore */ } if (!ids.length) return; setLane(ids, l.dataset.lane); });
  });
  h.querySelectorAll("[data-bulk]").forEach((b) => b.addEventListener("click", () => bulk(b.dataset.bulk)));
  $("#coBin")?.addEventListener("change", (e) => { const v = e.target.value; if (!v) return; if (assign([...S.sel], v)) { ctx.toast(`Sent ${S.sel.size} to ${loadSpaces().find((s) => s.id === v)?.name || "bin"}`); S.sel.clear(); ctx.refresh(); } });
}
function setLane(ids, lane) { const set = new Set(ids.map(String)); if (commit((l) => l.forEach((i) => { if (set.has(String(i.id))) i.lane = lane; }))) { ctx.toast(`Moved ${ids.length} to ${lane === "sealed" ? "Sealed" : "Singles"}`); paint(); } }
function bulk(kind) {
  const ids = [...S.sel]; if (!ids.length) return; const set = new Set(ids);
  if (kind === "sealed" || kind === "singles") { setLane(ids, kind); S.sel.clear(); paint(); }
  else if (kind === "pct") { const p = parseFloat(String(ctx.host.querySelector("#coPct").value).replace(/[^0-9.\-+]/g, "")); if (!Number.isFinite(p) || !p) { ctx.toast("Type a percent, like -10 or 15."); return; } if (commit((l) => l.forEach((i) => { if (set.has(String(i.id))) i.price = Math.max(0, Math.round((Number(i.price) || 0) * (1 + p / 100) * 100) / 100); }))) { ctx.toast(`Changed ${ids.length} prices by ${p > 0 ? "+" : ""}${p}% (this app only)`); S.sel.clear(); paint(); } }
  else if (kind === "del") { const before = loadItems(); const removed = before.filter((i) => set.has(String(i.id))); if (commit((l) => { for (let k = l.length - 1; k >= 0; k--) if (set.has(String(l[k].id))) l.splice(k, 1); })) { S.sel.clear(); undo(before, `Removed ${removed.length} from this app`); paint(); } }
}
function undo(prev, msg) { ctx.toastUndo(msg, () => { saveItems(prev); ctx.refresh(); paint(); ctx.toast("Restored"); }); }
function openZoom(id, fromEl) {
  const list = rows(), i = list.findIndex((x) => String(x.id) === String(id)); if (i < 0) return;
  openCard(list, { index: i, from: fromEl || null, photo: photoOf, name: nameOf,
    info: (it) => { const profit = it.purchasePrice != null && it.purchasePrice !== "" ? (Number(it.price) || 0) - Number(it.purchasePrice) : null, sp = loadSpaces().find((s) => s.id === it.spaceId);
      return `<div class="sub">${esc(where(it))} · ${esc(laneOf(it) === "sealed" ? "Sealed" : "Single")} · ${esc(gameOf(it))}</div><div class="row"><span>Market value</span><span>${money(it.price)}</span></div><div class="row"><span>Quantity</span><span>${Number(it.quantity) || 1}</span></div>${profit != null ? `<div class="row"><span>You paid</span><span>${money(it.purchasePrice)}</span></div><div class="row"><span>Profit</span><span>${profit < 0 ? "-" : ""}${money(Math.abs(profit))}</span></div>` : ""}<div class="row"><span>Bin</span><span>${esc(sp ? sp.name : "Not filed yet")}</span></div><button class="btn" id="zLane" type="button">Move to ${laneOf(it) === "sealed" ? "Singles" : "Sealed"}</button>`; },
    wire: (root, it, api) => root.querySelector("#zLane")?.addEventListener("click", () => { api.close(); setLane([it.id], laneOf(it) === "sealed" ? "singles" : "sealed"); }) });
}
export function renderCollection(host, api) { ctx = { host, ...api }; if (!host.querySelector(".co-wrap")) S.sel.clear(); paint(); }
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
      const r = await fetch("/api/csv/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: $("#ioXs").value, items }) });
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
