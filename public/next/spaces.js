import { esc, money, nameOf, photoOf, onHand, laneOf, gameOf, loadItems, loadSpaces, saveSpaces, assign, uid } from "./shared.js?v=2";

let ctx = null;
const S = { sel: new Set(), open: null, filter: "all", q: "" };

function groupsFor(list) {
  const m = new Map();
  for (const it of list) { const k = `${gameOf(it)} · ${laneOf(it) === "sealed" ? "Sealed" : "Singles"}`; if (!m.has(k)) m.set(k, []); m.get(k).push(it); }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
}
function paint() {
  const items = loadItems(), spaces = loadSpaces(), hand = items.filter(onHand);
  const un = hand.filter((i) => !i.spaceId || !spaces.some((s) => s.id === i.spaceId));
  const ended = items.filter((i) => i.ended && !["sold", "packed", "shipped", "delivered"].includes(i.phase) && !i.spaceId).length;
  const groups = groupsFor(un);
  const shown = un.filter((i) => (S.filter === "all" || `${gameOf(i)} · ${laneOf(i) === "sealed" ? "Sealed" : "Singles"}` === S.filter) && (!S.q || nameOf(i).toLowerCase().includes(S.q.toLowerCase())));
  const h = ctx.host;
  h.innerHTML = `<div class="sp-wrap">
   <div class="co-head"><div><h2>Spaces</h2><p>Where everything physically lives. ${hand.length - un.length} filed · <b>${un.length} not filed yet</b></p></div></div>
   ${un.length ? `<div class="sp-auto"><div><b>Sort ${un.length} unfiled items in one tap</b><span>I grouped them by game and sealed vs singles. Review, then file them all into bins.</span></div>
     <div class="sp-sug">${groups.map(([k, l]) => `<button class="chip${S.filter === k ? " on" : ""}" data-filter="${esc(k)}" type="button">${esc(k)} <em>${l.length}</em></button>`).join("")}</div>
     <button class="btn go" id="spAuto" type="button">File all ${un.length} into ${groups.length} bin${groups.length > 1 ? "s" : ""}</button></div>` : `<div class="sp-auto ok"><b>Everything on hand is filed.</b></div>`}
   <div class="sp-bins">${spaces.length ? spaces.map((sp) => { const its = hand.filter((i) => i.spaceId === sp.id); const val = its.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
      return `<button class="sp-bin" data-bin="${esc(sp.id)}" type="button"><div class="sp-thumbs">${its.slice(0, 4).map((i) => photoOf(i) ? `<img src="${esc(photoOf(i))}" alt="" loading="lazy">` : "<i></i>").join("")}</div><b>${esc(sp.name)}</b><span>${its.length} item${its.length === 1 ? "" : "s"} · ${money(val)}</span></button>`; }).join("") : `<div class="co-empty">No bins yet. File your items above and bins appear here, or add one.</div>`}
     <button class="sp-bin add" id="spNew" type="button"><b>+ New bin</b><span>Name it, then move items in</span></button></div>
   ${un.length ? `<h3 class="sp-h">Not filed yet${S.filter !== "all" ? ` · ${esc(S.filter)}` : ""} <em>${shown.length}</em></h3>
     <div class="sp-tools"><input id="spQ" type="search" placeholder="Search unfiled items" value="${esc(S.q)}"><button class="btn" id="spAll" type="button">Select all ${shown.length}</button></div>
     <div class="sp-list">${shown.slice(0, 200).map((i) => `<label class="sp-row${S.sel.has(String(i.id)) ? " on" : ""}"><input type="checkbox" data-id="${esc(i.id)}" ${S.sel.has(String(i.id)) ? "checked" : ""}>${photoOf(i) ? `<img src="${esc(photoOf(i))}" alt="" loading="lazy">` : "<i></i>"}<span>${esc(nameOf(i))}</span><b>${money(i.price)}</b></label>`).join("")}${shown.length > 200 ? `<div class="co-empty">Showing 200 of ${shown.length}. Use a filter to narrow it down.</div>` : ""}</div>` : ""}
   ${ended ? `<p class="co-hint">${ended} more items ended on eBay and aren't filed. They stay hidden until you need them.</p>` : ""}
   ${S.sel.size ? `<div class="co-bar"><b>${S.sel.size} selected</b><select id="spTo" aria-label="Send to bin"><option value="">File into…</option>${spaces.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}</select><button class="btn" id="spClear" type="button">Clear</button></div>` : ""}</div>`;
  wire();
}
function wire() {
  const h = ctx.host, $ = (s) => h.querySelector(s);
  h.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => { S.filter = S.filter === b.dataset.filter ? "all" : b.dataset.filter; S.sel.clear(); paint(); }));
  $("#spAuto")?.addEventListener("click", autoFile);
  $("#spNew")?.addEventListener("click", newBin);
  $("#spQ")?.addEventListener("input", (e) => { S.q = e.target.value; const p = e.target.selectionStart; paint(); const q = h.querySelector("#spQ"); q.focus(); q.setSelectionRange(p, p); });
  $("#spAll")?.addEventListener("click", () => { const un = loadItems().filter(onHand).filter((i) => !i.spaceId); un.filter((i) => (S.filter === "all" || `${gameOf(i)} · ${laneOf(i) === "sealed" ? "Sealed" : "Singles"}` === S.filter) && (!S.q || nameOf(i).toLowerCase().includes(S.q.toLowerCase()))).forEach((i) => S.sel.add(String(i.id))); paint(); });
  h.querySelectorAll(".sp-row input").forEach((c) => c.addEventListener("change", () => { c.checked ? S.sel.add(c.dataset.id) : S.sel.delete(c.dataset.id); paint(); }));
  $("#spClear")?.addEventListener("click", () => { S.sel.clear(); paint(); });
  $("#spTo")?.addEventListener("change", (e) => { if (!e.target.value) return; const n = S.sel.size; const prev = snapshot(); if (assign([...S.sel], e.target.value)) { S.sel.clear(); ctx.refresh(); paint(); ctx.toastUndo(`Filed ${n} items`, () => { restore(prev); ctx.refresh(); paint(); }); } });
  h.querySelectorAll("[data-bin]").forEach((b) => b.addEventListener("click", () => binSheet(b.dataset.bin)));
}
const snapshot = () => ({ items: localStorage.getItem("coalition-items-v4"), spaces: localStorage.getItem("coalition-spaces-v4") });
function restore(p) { try { if (p.items != null) localStorage.setItem("coalition-items-v4", p.items); if (p.spaces != null) localStorage.setItem("coalition-spaces-v4", p.spaces); } catch { /* ignore */ } }
function autoFile() {
  const prev = snapshot(); const spaces = loadSpaces(); const un = loadItems().filter(onHand).filter((i) => !i.spaceId || !spaces.some((s) => s.id === i.spaceId));
  let made = 0;
  for (const [k, list] of groupsFor(un)) { let sp = spaces.find((s) => s.name === k); if (!sp) { sp = { id: uid(), name: k, kind: "storage", itemIds: [], cover: null }; spaces.push(sp); made++; } }
  if (!saveSpaces(spaces)) { ctx.toast("Couldn't save. Storage is full."); return; }
  for (const [k, list] of groupsFor(un)) assign(list.map((i) => i.id), spaces.find((s) => s.name === k).id);
  S.filter = "all"; S.sel.clear(); ctx.refresh(); paint();
  ctx.toastUndo(`Filed ${un.length} items into ${made || "existing"} bin${made === 1 ? "" : "s"}`, () => { restore(prev); ctx.refresh(); paint(); });
}
function newBin() {
  const s = ctx.openSheet(`<a class="back" href="#" data-close>‹ Back</a><h2>New bin</h2><form id="nbF"><label class="sc-f"><span>Name</span><input name="n" placeholder="Bin 3, Shelf A, Slab case…" autofocus></label><button class="btn go" type="submit" style="margin-top:12px">Create bin</button></form>`);
  s.querySelector("#nbF").addEventListener("submit", (e) => { e.preventDefault(); const n = s.querySelector("[name=n]").value.trim(); if (!n) { ctx.toast("Give the bin a name."); return; } const sp = loadSpaces(); sp.push({ id: uid(), name: n, kind: "storage", itemIds: [], cover: null }); saveSpaces(sp); ctx.closeSheet(); paint(); ctx.toast(`Created ${n}`); });
}
function binSheet(id) {
  const sp = loadSpaces().find((s) => s.id === id); if (!sp) return; const its = loadItems().filter(onHand).filter((i) => i.spaceId === id);
  const s = ctx.openSheet(`<a class="back" href="#" data-close>‹ Back</a><h2>${esc(sp.name)}</h2><div class="sub">${its.length} items · ${money(its.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0))}</div>
    <div class="sp-list">${its.slice(0, 120).map((i) => `<div class="sp-row"><${photoOf(i) ? `img src="${esc(photoOf(i))}" alt="" loading="lazy"` : "i"}><span>${esc(nameOf(i))}</span><b>${money(i.price)}</b></div>`).join("") || `<div class="co-empty">Empty bin.</div>`}</div>
    <button class="btn" id="bnEmpty" type="button" ${its.length ? "" : "disabled"}>Take everything out (back to unfiled)</button><button class="btn warn" id="bnDel" type="button">Delete this bin</button>`);
  s.querySelector("#bnEmpty").addEventListener("click", () => { const prev = snapshot(); assign(its.map((i) => i.id), null); ctx.closeSheet(); ctx.refresh(); paint(); ctx.toastUndo(`Took ${its.length} out of ${sp.name}`, () => { restore(prev); ctx.refresh(); paint(); }); });
  s.querySelector("#bnDel").addEventListener("click", () => { const prev = snapshot(); assign(its.map((i) => i.id), null); saveSpaces(loadSpaces().filter((x) => x.id !== id)); ctx.closeSheet(); ctx.refresh(); paint(); ctx.toastUndo(`Deleted ${sp.name}`, () => { restore(prev); ctx.refresh(); paint(); }); });
}
export function renderSpaces(host, api) { ctx = { host, ...api }; paint(); }
export function repaintSpaces() { if (ctx && ctx.host.querySelector(".sp-wrap")) paint(); }
