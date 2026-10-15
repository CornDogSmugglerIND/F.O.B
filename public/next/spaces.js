import { esc, money, nameOf, photoOf, onHand, laneOf, gameOf, loadItems, loadSpaces, saveSpaces, assign } from "./shared.js?v=3";
import { fly, rectOf, sleep, openCard } from "./kit.js?v=1";

/* Spaces = his real storage, as a camera you fly through:
   area -> shelf -> bin (closed, lid flips) -> bin (open, items inside). */
const IMG = "img/spaces/";
const SHELVES_KEY = "coalition-shelves-v1";
const SHELVES = [
  { id: "s1", kind: "Listed items", name: "Shelf 1", photo: "stackA.jpg", bins: ["bin-tote", "bin-apache", "bin-bunkerA"] },
  { id: "s2", kind: "Unsifted items", name: "Shelf 2", photo: "stackB.jpg", bins: ["bin-bunkerB1", "bin-bunkerB2"] },
];
/* rect = where the bin sits inside the shelf photo, in % of the photo: [x, y, w, h] */
const PHYS = {
  "bin-tote": { name: "Bin 1", sub: "Tan tote", closed: "tote-top.jpg", open: "tote-open.jpg", rect: [3, 64, 90, 34], shelf: "s1" },
  "bin-apache": { name: "Bin 2", sub: "Apache case", closed: "apache-top.jpg", open: "apache-open.jpg", rect: [8, 39, 80, 25], shelf: "s1" },
  "bin-bunkerA": { name: "Bin 3", sub: "Bunker tote", closed: "bunkerA-top.jpg", open: "bunkerA-open.jpg", rect: [3, 1, 94, 37], shelf: "s1" },
  "bin-bunkerB1": { name: "Bin 4", sub: "Bunker tote", closed: "bunkerB1-top.jpg", open: "bunkerB1-open.jpg", rect: [3, 58, 92, 40], shelf: "s2" },
  "bin-bunkerB2": { name: "Bin 5", sub: "Bunker tote", closed: "bunkerB2-top.jpg", open: "bunkerB2-open.jpg", rect: [3, 2, 92, 56], shelf: "s2" },
};

let ctx = null, busy = false, keyBound = false;
const S = { level: "area", shelf: null, bin: null, open: false };
const rank = (l) => ({ area: 0, shelf: 1, bin: 2 }[l]);

/* ---------- data ---------- */
function ensureBins() {
  const sp = loadSpaces(); let changed = false;
  for (const [id, p] of Object.entries(PHYS)) {
    const have = sp.find((s) => s.id === id);
    if (!have) { sp.push({ id, name: p.name, sub: p.sub, kind: "storage", itemIds: [], cover: null, phys: true }); changed = true; }
    else if (!have.phys) { have.phys = true; have.sub = have.sub || p.sub; changed = true; }
  }
  if (changed) saveSpaces(sp);
  return sp;
}
const shelfNames = () => { try { return JSON.parse(localStorage.getItem(SHELVES_KEY) || "{}"); } catch { return {}; } };
const shelfName = (sh) => shelfNames()[sh.id] || sh.name;
const val = (its) => its.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
function world() {
  const spaces = ensureBins(), hand = loadItems().filter(onHand);
  return { spaces, hand, inBin: (id) => hand.filter((i) => i.spaceId === id), un: hand.filter((i) => !i.spaceId || !spaces.some((s) => s.id === i.spaceId)) };
}
const snapshot = () => ({ items: localStorage.getItem("coalition-items-v4"), spaces: localStorage.getItem("coalition-spaces-v4") });
function restore(p) { try { if (p.items != null) localStorage.setItem("coalition-items-v4", p.items); if (p.spaces != null) localStorage.setItem("coalition-spaces-v4", p.spaces); } catch { /* ignore */ } }
const groupsFor = (list) => { const m = new Map(); for (const it of list) { const k = `${gameOf(it)} · ${laneOf(it) === "sealed" ? "Sealed" : "Singles"}`; if (!m.has(k)) m.set(k, []); m.get(k).push(it); } return [...m.entries()].sort((a, b) => b[1].length - a[1].length); };
const nm = (w, id) => (w.spaces.find((s) => s.id === id) || PHYS[id] || {}).name || "bin";
const brs = `<i class="k-br tl"></i><i class="k-br tr"></i><i class="k-br bl"></i><i class="k-br br"></i>`;

/* ---------- markup ---------- */
function head(w, crumbs) {
  return `<header class="spx-head"><div class="spx-crumbs">${S.level !== "area" ? `<button class="spx-back" data-up type="button" aria-label="Back">‹</button>` : ""}${crumbs.map((c, i) => c.go ? `<button class="spx-crumb" data-crumb="${i}" type="button">${esc(c.t)}</button>` : `<h2>${esc(c.t)}</h2>`).join(`<span class="spx-sep">›</span>`)}</div>
    <button class="spx-un${w.un.length ? "" : " done"}" data-un type="button">${w.un.length ? `<b>${w.un.length}</b> not in a bin` : "Everything is in a bin"}</button></header>`;
}
function hotspots(w, sh) {
  return sh.bins.map((id) => { const [x, y, ww, hh] = PHYS[id].rect, n = w.inBin(id).length;
    return `<button class="spx-hot" data-bin="${id}" style="left:${x}%;top:${y}%;width:${ww}%;height:${hh}%" type="button" aria-label="${esc(nm(w, id))}"><span class="spx-lab"><b>${esc(nm(w, id))}</b><em>${n} item${n === 1 ? "" : "s"}</em></span></button>`; }).join("");
}
function areaView(w) {
  const stacks = SHELVES.map((sh) => {
    const all = sh.bins.flatMap((id) => w.inBin(id));
    return `<figure class="spx-stack"><div class="spx-photo"><img src="${IMG}${sh.photo}" alt="${esc(shelfName(sh))}" draggable="false">${hotspots(w, sh)}${brs}</div>
      <figcaption><span><b>${esc(shelfName(sh))}</b><em>${esc(sh.kind || "")}${sh.kind ? " · " : ""}${sh.bins.length} bins · ${all.length} items · ${money(val(all))}</em></span><button class="spx-edit" data-rename-shelf="${sh.id}" type="button" aria-label="Rename ${esc(shelfName(sh))}">✎</button></figcaption></figure>`;
  }).join("");
  return `<div class="spx-stage"><div class="spx-areaview">${stacks}</div><p class="spx-hint">Tap a bin to zoom in</p></div>`;
}
function binView(w) {
  const sp = w.spaces.find((s) => s.id === S.bin); if (!sp) return `<div class="spx-stage"><p class="spx-empty">That bin is gone.</p></div>`;
  const p = PHYS[sp.id], its = w.inBin(sp.id);
  const flip = p ? `<div class="spx-flip" id="flip"><img class="spx-under" src="${IMG}${p.open}" alt="${esc(sp.name)} open" draggable="false"><img class="spx-lid" src="${IMG}${p.closed}" alt="${esc(sp.name)} closed" draggable="false"></div>`
    : `<div class="spx-flip generic" id="flip"><div class="spx-under"></div><div class="spx-lid"><b>${esc(sp.name)}</b></div></div>`;
  const cards = its.length ? its.slice(0, 150).map((i) => { const ph = photoOf(i); return `<button class="spx-card k-tilt" data-item="${esc(i.id)}" type="button">${ph ? `<img src="${esc(ph)}" alt="" loading="lazy" draggable="false">` : `<span class="spx-ini">${esc(nameOf(i).charAt(0))}</span>`}<span class="spx-cap"><span>${esc(nameOf(i))}</span><em>${money(i.price)}</em></span></button>`; }).join("") + (its.length > 150 ? `<p class="spx-more">Showing 150 of ${its.length}.</p>` : "")
    : `<div class="spx-empty"><b>Nothing in here yet</b><span>Tap Add items to put things in this bin.</span></div>`;
  return `<div class="spx-stage"><div class="spx-binview"><div class="spx-photo" data-focus>${flip}${brs}<button class="spx-lidbtn" id="lidBtn" type="button">Open lid</button></div>
    <aside class="spx-side"><div class="spx-sidehead"><h3>${esc(sp.name)}</h3><button class="spx-edit" data-rename-bin type="button" aria-label="Rename bin">✎</button></div>
      <p class="spx-note">${esc(sp.sub || "")}${sp.sub ? " · " : ""}${its.length} item${its.length === 1 ? "" : "s"} · ${money(val(its))}</p>
      <div class="spx-acts"><button class="btn go" data-add type="button">Add items</button>${its.length ? `<button class="btn" data-out type="button">Take everything out</button>` : ""}${!sp.phys ? `<button class="btn warn" data-del type="button">Delete bin</button>` : ""}</div></aside>
    <section class="spx-items" id="items">${cards}</section></div></div>`;
}

/* ---------- paint + camera ---------- */
function paint() {
  const w = world(), sh = SHELVES.find((x) => x.id === S.shelf), sp = w.spaces.find((s) => s.id === S.bin);
  const crumbs = [{ t: "Spaces", go: S.level !== "area" }];
  if (S.level === "bin" && sp) crumbs.push({ t: sp.name });
  const body = S.level === "area" ? areaView(w) : binView(w);
  ctx.host.innerHTML = `<div class="sp-wrap spx" data-level="${S.level}">${head(w, crumbs)}${body}</div>`;
  if (S.level === "bin" && S.open) setLid(true, true);
  wire(w);
}
async function camera(next, fromEl) {
  if (busy) return; busy = true;
  try {
    const from = rectOf(fromEl), old = ctx.host.querySelector(".spx-stage"), deeper = rank(next.level) > rank(S.level), prev = { shelf: S.shelf, bin: S.bin };
    if (old && from) { const r = old.getBoundingClientRect(); old.style.transformOrigin = `${from.left + from.width / 2 - r.left}px ${from.top + from.height / 2 - r.top}px`;
      const dive = Math.min(5, Math.max(2.2, (r.width * .85) / Math.max(1, from.width)));
      old.animate(deeper ? [{ transform: "scale(1)", opacity: 1, filter: "blur(0)" }, { transform: `scale(${dive})`, opacity: 0, filter: "blur(6px)" }] : [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(.84)", opacity: 0, filter: "blur(4px)" }], { duration: 340, easing: "cubic-bezier(.5,0,.8,.45)", fill: "forwards" }); await sleep(300); }
    Object.assign(S, next); paint(); try { document.getElementById("main").scrollTo(0, 0); } catch { /* ignore */ }
    const st = ctx.host.querySelector(".spx-stage"), foc = ctx.host.querySelector("[data-focus]");
    if (deeper) { if (foc && from) fly(foc, from, { dur: 560 }); st && st.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: "ease-out" }); }
    else if (st) { const back = ctx.host.querySelector(`[data-shelf="${prev.shelf}"]`) || ctx.host.querySelector(`[data-bin="${prev.bin}"]`);
      if (back) { const r = st.getBoundingClientRect(), b = back.getBoundingClientRect(); st.style.transformOrigin = `${b.left + b.width / 2 - r.left}px ${b.top + b.height / 2 - r.top}px`; }
      st.animate([{ transform: "scale(1.8)", opacity: 0, filter: "blur(7px)" }, { transform: "scale(1)", opacity: 1, filter: "blur(0)" }], { duration: 500, easing: "cubic-bezier(.2,.8,.2,1)" }); }
  } finally { busy = false; }
}
function setLid(open, quiet) {
  S.open = open; const h = ctx.host, f = h.querySelector("#flip"), it = h.querySelector("#items"), b = h.querySelector("#lidBtn"); if (!f) return;
  f.classList.toggle("opened", open); it && it.classList.toggle("show", open); if (b) b.textContent = open ? "Close lid" : "Open lid";
  if (open && !quiet && it) [...it.children].slice(0, 24).forEach((c, i) => c.animate([{ opacity: 0, transform: "translateY(26px) scale(.9)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: 260 + i * 35, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" }));
}

/* ---------- sheets ---------- */
function renameSheet(title, current, save) {
  const s = ctx.openSheet(`<a class="back" href="#" data-close>‹ Back</a><h2>${esc(title)}</h2><form id="rnF"><label class="sc-f"><span>Name</span><input name="n" value="${esc(current)}"></label><button class="btn go" type="submit" style="margin-top:12px">Save</button></form>`);
  s.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); ctx.closeSheet(); }));
  s.querySelector("#rnF").addEventListener("submit", (e) => { e.preventDefault(); const n = s.querySelector("[name=n]").value.trim(); if (!n) { ctx.toast("Give it a name."); return; } save(n); ctx.closeSheet(); paint(); });
}
function pickSheet(targetId) {
  const sel = new Set(); let q = "", tab = "group";
  const s = ctx.openSheet(`<div id="pk"></div>`), box = s.querySelector("#pk");
  const move = (ids, to, label) => { const prev = snapshot(); if (!assign(ids, to)) { ctx.toast("Couldn't save. Storage is full."); return; } const name = (loadSpaces().find((b) => b.id === to) || {}).name || "bin"; ctx.closeSheet(); ctx.refresh(); paint(); ctx.toastUndo(`Put ${label} in ${name}`, () => { restore(prev); ctx.refresh(); paint(); }); };
  const draw = () => {
    const w2 = world(), un = w2.un, shown = un.filter((i) => !q || nameOf(i).toLowerCase().includes(q.toLowerCase())), groups = groupsFor(un);
    const opts = () => w2.spaces.map((b) => `<option value="${esc(b.id)}"${b.id === targetId ? " selected" : ""}>${esc(b.name)}${b.sub ? " · " + esc(b.sub) : ""}</option>`).join("");
    box.innerHTML = `<a class="back" href="#" data-close>‹ Back</a><h2>${targetId ? "Add items" : "Not in a bin yet"}</h2><div class="sub">${un.length} item${un.length === 1 ? "" : "s"} waiting</div>
      <div class="seg" style="margin-bottom:10px"><button type="button" data-tab="group" class="${tab === "group" ? "on" : ""}">By group</button><button type="button" data-tab="pick" class="${tab === "pick" ? "on" : ""}">Pick items</button></div>
      ${tab === "group" ? (groups.map(([k, l], gi) => `<div class="spx-grp"><span><b>${esc(k)}</b><em>${l.length}</em></span><select data-g="${gi}" aria-label="Send ${esc(k)} to"><option value="">Send to…</option>${opts()}</select></div>`).join("") || `<div class="spx-empty">Everything is in a bin.</div>`)
      : `<input id="pkq" type="search" placeholder="Search" value="${esc(q)}" class="spx-q"><div class="sp-list">${shown.slice(0, 120).map((i) => `<label class="sp-row${sel.has(String(i.id)) ? " on" : ""}"><input type="checkbox" data-id="${esc(i.id)}"${sel.has(String(i.id)) ? " checked" : ""}>${photoOf(i) ? `<img src="${esc(photoOf(i))}" alt="" loading="lazy">` : "<i></i>"}<span>${esc(nameOf(i))}</span><b>${money(i.price)}</b></label>`).join("") || `<div class="spx-empty">No matches.</div>`}</div>
        ${sel.size ? `<div class="spx-pickbar"><b>${sel.size} picked</b><select id="pkTo"><option value="">Put in…</option>${opts()}</select></div>` : ""}`}`;
    box.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); ctx.closeSheet(); }));
    box.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; draw(); }));
    box.querySelectorAll("[data-g]").forEach((se) => se.addEventListener("change", () => { if (!se.value) return; const [k, l] = groups[Number(se.dataset.g)]; move(l.map((i) => i.id), se.value, `${l.length} ${k}`); }));
    const qi = box.querySelector("#pkq"); qi?.addEventListener("input", () => { q = qi.value; const p = qi.selectionStart; draw(); const n = box.querySelector("#pkq"); n.focus(); n.setSelectionRange(p, p); });
    box.querySelectorAll(".sp-row input").forEach((c) => c.addEventListener("change", () => { c.checked ? sel.add(c.dataset.id) : sel.delete(c.dataset.id); draw(); }));
    box.querySelector("#pkTo")?.addEventListener("change", (e) => { if (e.target.value) move([...sel], e.target.value, `${sel.size} item${sel.size === 1 ? "" : "s"}`); });
  };
  draw();
}

/* ---------- wiring ---------- */
function up() { if (busy) return; const f = ctx.host.querySelector("[data-focus]"); if (S.level === "bin") camera({ level: "area", shelf: null, bin: null, open: false }, f); }
function wire(w) {
  const h = ctx.host, $ = (s) => h.querySelector(s);
  h.querySelectorAll("[data-bin]").forEach((b) => b.addEventListener("click", () => { const id = b.dataset.bin; camera({ level: "bin", shelf: (PHYS[id] || {}).shelf || S.shelf, bin: id, open: false }, b.classList.contains("spx-hot") ? b : $("[data-focus]") || b); }));
  $("[data-up]")?.addEventListener("click", up);
  h.querySelectorAll("[data-crumb]").forEach((b) => b.addEventListener("click", () => { if (busy) return; const i = Number(b.dataset.crumb); if (i === 0) camera({ level: "area", shelf: null, bin: null, open: false }, b); }));
  $("[data-un]")?.addEventListener("click", () => pickSheet(null));
  $("#lidBtn")?.addEventListener("click", (e) => { e.stopPropagation(); setLid(!S.open); });
  $("#flip")?.addEventListener("click", () => setLid(!S.open));
  $("[data-add]")?.addEventListener("click", () => pickSheet(S.bin));
  h.querySelectorAll("[data-rename-shelf]").forEach((eb) => eb.addEventListener("click", (ev) => { ev.stopPropagation(); const sh = SHELVES.find((x) => x.id === eb.dataset.renameShelf); renameSheet("Rename shelf", shelfName(sh), (n) => { const m = shelfNames(); m[sh.id] = n; try { localStorage.setItem(SHELVES_KEY, JSON.stringify(m)); } catch { /* ignore */ } }); }));
  $("[data-rename-bin]")?.addEventListener("click", () => { const sp = loadSpaces().find((s) => s.id === S.bin); renameSheet("Rename bin", sp.name, (n) => { const all = loadSpaces(); all.find((s) => s.id === S.bin).name = n; saveSpaces(all); ctx.refresh(); }); });
  $("[data-out]")?.addEventListener("click", () => { const its = w.inBin(S.bin), name = nm(w, S.bin), prev = snapshot(); assign(its.map((i) => i.id), null); ctx.refresh(); paint(); ctx.toastUndo(`Took ${its.length} out of ${name}`, () => { restore(prev); ctx.refresh(); paint(); }); });
  $("[data-del]")?.addEventListener("click", () => { const its = w.inBin(S.bin), name = nm(w, S.bin), prev = snapshot(); assign(its.map((i) => i.id), null); saveSpaces(loadSpaces().filter((x) => x.id !== S.bin)); S.level = "area"; S.bin = null; S.open = false; ctx.refresh(); paint(); ctx.toastUndo(`Deleted ${name}`, () => { restore(prev); ctx.refresh(); paint(); }); });
  h.querySelectorAll("[data-item]").forEach((c) => c.addEventListener("click", () => {
    const list = w.inBin(S.bin), name = nm(w, S.bin);
    openCard(list, { index: list.findIndex((i) => String(i.id) === c.dataset.item), from: c, photo: photoOf, name: nameOf,
      info: (it) => `<div class="sub">In ${esc(name)}</div><div class="row"><span>Price</span><span>${money(it.price)}</span></div><div class="row"><span>Quantity</span><span>${Number(it.quantity) || 1}</span></div><button class="btn" data-takeout type="button">Take out of bin</button>`,
      wire: (root, it, api) => root.querySelector("[data-takeout]")?.addEventListener("click", () => { const prev = snapshot(); assign([it.id], null); api.close(); ctx.refresh(); paint(); ctx.toastUndo("Took it out of the bin", () => { restore(prev); ctx.refresh(); paint(); }); }) });
  }));
}
export function renderSpaces(host, api) {
  ctx = { host, ...api }; ensureBins(); Object.assign(S, { level: "area", shelf: null, bin: null, open: false }); busy = false; paint();
  if (!keyBound) { keyBound = true; document.addEventListener("keydown", (e) => { const sh = document.getElementById("sheet"); if (e.key === "Escape" && ctx && ctx.host.querySelector(".spx") && !document.querySelector(".k-zoom") && (!sh || sh.hidden)) up(); }); }
}
export function repaintSpaces() { if (ctx && ctx.host.querySelector(".spx")) paint(); }
