import { esc, money, nameOf, photoOf, onHand, laneOf, gameOf, loadItems, saveItems, loadSpaces, assign } from "./shared.js?v=2";

let ctx = null;
const S = { q: "", stage: "all", sort: "value", sel: new Set(), selecting: false, tab: "sealed", zoom: null, trash: null };
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
const STAGE_NAME = { intake: "Photos in", staged: "Ready to list", listed: "Live on eBay" };
function card(it) {
  const src = photoOf(it);
  return `<article class="co-card${S.sel.has(String(it.id)) ? " sel" : ""}" draggable="true" data-id="${esc(it.id)}" tabindex="0">
    <div class="co-art"><div class="co-img">${src ? `<img src="${esc(src)}" alt="" loading="lazy" draggable="false">` : `<span class="co-ini">${esc(nameOf(it).charAt(0))}</span>`}<i class="co-sheen"></i></div>${S.selecting ? `<i class="co-pick">${S.sel.has(String(it.id)) ? "✓" : ""}</i>` : ""}</div>
    <div class="co-cap"><span>${esc(nameOf(it))}</span><b>${money(it.price)}</b></div></article>`;
}
function paint() {
  const host = ctx.host, all = rows(); const sealed = all.filter((i) => laneOf(i) === "sealed"), singles = all.filter((i) => laneOf(i) === "singles");
  const total = all.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
  const lane = (id, label, hint, list) => `<section class="co-lane${phoneNow() && S.tab !== id ? " hide" : ""}" data-lane="${id}"><h3>${label} <em>${list.length}</em></h3><p class="co-hint">${hint}</p><div class="co-grid">${list.length ? list.map(card).join("") : `<div class="co-empty">Nothing here. ${all.length ? "Drag a card in, or change the filter." : "Add items in Scouter."}</div>`}</div></section>`;
  host.innerHTML = `<div class="co-wrap">
    <div class="co-head"><div><h2>Collection</h2><p>${all.length} items on hand · ${money(total)} at market</p></div>
      <div class="co-tools"><input id="coQ" type="search" placeholder="Search your collection" value="${esc(S.q)}">
      <select id="coSort" aria-label="Sort"><option value="value"${S.sort === "value" ? " selected" : ""}>Highest value</option><option value="new"${S.sort === "new" ? " selected" : ""}>Newest</option><option value="name"${S.sort === "name" ? " selected" : ""}>A to Z</option></select>
      <button class="btn${S.selecting ? " go" : ""}" id="coSel" type="button">${S.selecting ? "Done selecting" : "Select"}</button></div></div>
    <div class="co-chips" role="group" aria-label="Stage filter">${[["all", "All"], ["new", "Photos in"], ["ready", "Ready to list"], ["live", "Live on eBay"]].map(([k, l]) => `<button class="chip${S.stage === k ? " on" : ""}" data-stage="${k}" type="button">${l}</button>`).join("")}</div>
    ${phoneNow() ? `<div class="co-tabs"><button class="chip${S.tab === "sealed" ? " on" : ""}" data-tab="sealed" type="button">Sealed ${sealed.length}</button><button class="chip${S.tab === "singles" ? " on" : ""}" data-tab="singles" type="button">Singles ${singles.length}</button></div>` : ""}
    <div class="co-lanes">${lane("sealed", "Sealed", "Boxes, packs, decks, tins. Drag a card to Singles to move it.", sealed)}${lane("singles", "Singles", "Individual cards and slabs. Drag a card to Sealed to move it.", singles)}</div>
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
  $("#coSort").addEventListener("change", (e) => { S.sort = e.target.value; paint(); });
  $("#coSel").addEventListener("click", () => { S.selecting = !S.selecting; if (!S.selecting) S.sel.clear(); paint(); });
  h.querySelectorAll("[data-stage]").forEach((b) => b.addEventListener("click", () => { S.stage = b.dataset.stage; paint(); }));
  h.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { S.tab = b.dataset.tab; paint(); }));
  h.querySelectorAll(".co-card").forEach((c) => {
    const id = c.dataset.id;
    c.addEventListener("click", () => { if (S.selecting) { S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); paint(); } else openZoom(id); });
    c.addEventListener("keydown", (e) => { if (e.key === "Enter") c.click(); });
    const img = c.querySelector(".co-img");
    c.addEventListener("pointermove", (e) => { if (e.pointerType === "touch") return; const r = img.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; img.style.transform = `perspective(700px) rotateY(${x * 18}deg) rotateX(${-y * 18}deg) scale(1.04)`; img.style.setProperty("--mx", `${(x + .5) * 100}%`); img.style.setProperty("--my", `${(y + .5) * 100}%`); img.classList.add("tilt"); });
    c.addEventListener("pointerleave", () => { img.style.transform = ""; img.classList.remove("tilt"); });
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
function openZoom(id) {
  const list = rows(), i = list.findIndex((x) => String(x.id) === String(id)); if (i < 0) return; S.zoom = i;
  const it = list[i], src = photoOf(it), profit = it.purchasePrice != null && it.purchasePrice !== "" ? (Number(it.price) || 0) - Number(it.purchasePrice) : null;
  const sp = loadSpaces().find((s) => s.id === it.spaceId);
  const s = ctx.openSheet(`<a class="back" href="#" data-close>‹ Back</a>
    <div class="co-zoom"><div class="co-zimg"><div class="co-img big">${src ? `<img src="${esc(src)}" alt="" draggable="false">` : `<span class="co-ini">${esc(nameOf(it).charAt(0))}</span>`}<i class="co-sheen"></i></div></div>
    <h2>${esc(nameOf(it))}</h2><div class="sub">${esc(STAGE_NAME[it.phase] || "")} · ${esc(laneOf(it) === "sealed" ? "Sealed" : "Single")} · ${esc(gameOf(it))}</div>
    <div class="row"><span>Market value</span><span>${money(it.price)}</span></div><div class="row"><span>Quantity</span><span>${Number(it.quantity) || 1}</span></div>
    ${profit != null ? `<div class="row"><span>You paid</span><span>${money(it.purchasePrice)}</span></div><div class="row"><span>Profit</span><span>${profit < 0 ? "-" : ""}${money(Math.abs(profit))}</span></div>` : ""}
    <div class="row"><span>Bin</span><span>${esc(sp ? sp.name : "Not filed yet")}</span></div>
    <div class="co-znav"><button class="btn" id="zPrev" type="button" ${i ? "" : "disabled"}>‹ Previous</button><button class="btn" id="zLane" type="button">Move to ${laneOf(it) === "sealed" ? "Singles" : "Sealed"}</button><button class="btn" id="zNext" type="button" ${i < list.length - 1 ? "" : "disabled"}>Next ›</button></div></div>`);
  const img = s.querySelector(".co-img.big"), z = s.querySelector(".co-zimg");
  z.addEventListener("pointermove", (e) => { const r = z.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; img.style.transform = `perspective(900px) rotateY(${x * 22}deg) rotateX(${-y * 22}deg)`; img.style.setProperty("--mx", `${(x + .5) * 100}%`); img.style.setProperty("--my", `${(y + .5) * 100}%`); img.classList.add("tilt"); });
  z.addEventListener("pointerleave", () => { img.style.transform = ""; img.classList.remove("tilt"); });
  s.querySelector("#zPrev").addEventListener("click", () => openZoom(list[i - 1].id)); s.querySelector("#zNext").addEventListener("click", () => openZoom(list[i + 1].id));
  s.querySelector("#zLane").addEventListener("click", () => { setLane([it.id], laneOf(it) === "sealed" ? "singles" : "sealed"); ctx.closeSheet(); paint(); });
}
export function renderCollection(host, api) { ctx = { host, ...api }; if (!host.querySelector(".co-wrap")) S.sel.clear(); paint(); }
export function repaintCollection() { if (ctx && ctx.host.querySelector(".co-wrap")) paint(); }
