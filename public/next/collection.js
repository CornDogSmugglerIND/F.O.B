import { photoManager } from "./photos.js?v=4";
import { openCard } from "./kit.js?v=2";
import { esc, money, nameOf, photoOf, onHand, laneOf, gameOf, peekItems, loadItems, saveItems, loadSpaces, assign, catOf } from "./shared.js?v=6";

let ctx = null;
const S = { q: "", stage: "all", cat: "All", sort: "value", sel: new Set(), selecting: false, menu: false, more: 48 };
const phoneNow = () => matchMedia("(max-width:820px)").matches;

function rows() {
  const q = S.q.trim().toLowerCase();
  return peekItems().filter(onHand).filter((it) => {
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
const val = (l) => l.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
function paint() {
  const host = ctx.host, keep = host.querySelector(".cx-grid")?.parentElement?.scrollTop;
  const typed = host.querySelector("#coPct")?.value || "", typedFocus = document.activeElement && document.activeElement.id === "coPct";
  const base = peekItems().filter(onHand), cats = new Map(); base.forEach((i) => { const c = catOf(i); cats.set(c, (cats.get(c) || 0) + 1); });
  const all = rows(), shown = all.slice(0, S.more), total = val(all), SP = new Map(loadSpaces().map((x) => [x.id, x.name])), binName = (id) => (id && SP.get(id)) || "";
  host.innerHTML = `<div class="co-wrap cx">
    <header class="cx-top"><div class="cx-val"><em>${S.cat === "All" ? "Everything on hand" : esc(S.cat)}</em><b>${money(total)}</b><span>${all.length} item${all.length === 1 ? "" : "s"} at market value</span></div>
      <div class="cx-tools"><button class="cx-btn${S.selecting ? " on" : ""}" id="coSel" type="button">${S.selecting ? "Done" : "Select"}</button><button class="cx-btn" id="coMenuBtn" type="button" aria-expanded="${!!S.menu}">⋯</button></div></header>
    ${S.menu ? `<div class="cx-menu"><label><span>Sort</span><select id="coSort"><option value="value"${S.sort === "value" ? " selected" : ""}>Highest value</option><option value="new"${S.sort === "new" ? " selected" : ""}>Newest</option><option value="name"${S.sort === "name" ? " selected" : ""}>Name</option></select></label>
      <label><span>Show</span><select id="coStage">${[["all", "All"], ["new", "Intake"], ["ready", "Ready to list"], ["live", "Live on eBay"]].map(([k, l]) => `<option value="${k}"${S.stage === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      <button class="cx-btn" id="coIO" type="button">Import / Export</button></div>` : ""}
    <div class="cx-chips" role="group" aria-label="Categories"><button type="button" class="${S.cat === "All" ? "on" : ""}" data-cat="All">All <em>${base.length}</em></button>${[...cats.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `<button type="button" class="${S.cat === c ? "on" : ""}" data-cat="${esc(c)}">${esc(c)} <em>${n}</em></button>`).join("")}</div>
    <input id="coQ" class="cx-q" type="search" placeholder="Search your collection" value="${esc(S.q)}">
    <div class="cx-scroll"><div class="cx-grid">${shown.map((it) => { const src = photoOf(it), on = S.sel.has(String(it.id)), bn = binName(it.spaceId); return `<article class="cx-card${on ? " sel" : ""}" data-id="${esc(it.id)}" tabindex="0">
      <div class="cx-img">${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" draggable="false">` : `<span class="co-ini">${esc(nameOf(it).charAt(0))}</span>`}<span class="cx-price">${money(it.price)}</span>${Number(it.quantity) > 1 ? `<span class="cx-qty">x${Number(it.quantity)}</span>` : ""}${S.selecting ? `<i class="cx-ck"></i>` : ""}</div>
      <div class="cx-cap"><span>${esc(nameOf(it))}</span><em>${esc(where(it))}${bn ? " · " + esc(bn) : ""}</em></div></article>`; }).join("") || `<div class="co-empty">Nothing matches.</div>`}${all.length > S.more ? `<button type="button" class="cx-more" id="coMore">Show more (${all.length - S.more})</button>` : ""}</div></div>
    ${S.selecting ? bar() : ""}</div>`;
  wire();
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
  $("#coQ").addEventListener("input", (e) => { S.q = e.target.value; S.more = 90; const p = e.target.selectionStart; paint(); const q = h.querySelector("#coQ"); q.focus(); q.setSelectionRange(p, p); });
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
  else if (kind === "del") { const before = loadItems(); const removed = before.filter((i) => set.has(String(i.id))); if (commit((l) => { for (let k = l.length - 1; k >= 0; k--) if (set.has(String(l[k].id))) l.splice(k, 1); })) { S.sel.clear(); undo(before, `Removed ${removed.length} from this app`); paint(); } }
}
function undo(prev, msg) { ctx.toastUndo(msg, () => { saveItems(prev); ctx.refresh(); paint(); ctx.toast("Restored"); }); }
function openZoom(id, fromEl) {
  const list = rows(), i = list.findIndex((x) => String(x.id) === String(id)); if (i < 0) return;
  openCard(list, { index: i, from: fromEl || null, photo: photoOf, name: nameOf,
    info: (it) => { const profit = it.purchasePrice != null && it.purchasePrice !== "" ? (Number(it.price) || 0) - Number(it.purchasePrice) : null, sp = loadSpaces().find((s) => s.id === it.spaceId);
      return `<div class="sub">${esc(where(it))} · ${esc(laneOf(it) === "sealed" ? "Sealed" : "Single")} · ${esc(gameOf(it))}</div><div class="row"><span>Market value</span><span>${money(it.price)}</span></div><div class="row"><span>Quantity</span><span>${Number(it.quantity) || 1}</span></div>${profit != null ? `<div class="row"><span>You paid</span><span>${money(it.purchasePrice)}</span></div><div class="row"><span>Profit</span><span>${profit < 0 ? "-" : ""}${money(Math.abs(profit))}</span></div>` : ""}<div class="row"><span>Bin</span><span>${esc(sp ? sp.name : "Not filed yet")}</span></div><button class="btn" id="zLane" type="button">Move to ${laneOf(it) === "sealed" ? "Singles" : "Sealed"}</button>`; },
    wire: (root, it, api) => { { const d = document.createElement("div"); (root.querySelector(".k-zinfo") || root).appendChild(d); photoManager(d, it.id, { toast: ctx.toast, refresh: ctx.refresh }); } return root.querySelector("#zLane")?.addEventListener("click", () => { api.close(); setLane([it.id], laneOf(it) === "sealed" ? "singles" : "sealed"); }); } });
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
