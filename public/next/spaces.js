import { esc, money, nameOf, photoOf, onHand, laneOf, gameOf, peekItems, loadItems, loadSpaces, saveSpaces, assign, catOf } from "./shared.js?v=6";
import { fly, rectOf, sleep, openCard } from "./kit.js?v=5";

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
const ORDER_BINS = SHELVES.flatMap((sh) => sh.bins);
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
  const keep = sp.filter((x) => x.phys || (x.kind !== "ebay_listed" && x.id !== "staged"));
  if (keep.length !== sp.length) { saveSpaces(keep); return keep; }
  if (changed) saveSpaces(sp);
  return sp;
}
const shelfNames = () => { try { return JSON.parse(localStorage.getItem(SHELVES_KEY) || "{}"); } catch { return {}; } };
const shelfName = (sh) => shelfNames()[sh.id] || sh.name;
const val = (its) => its.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
function world() {
  const spaces = ensureBins(), hand = peekItems().filter(onHand);
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
/* zoomed onto one bin on its shelf; swipe up/down to the next bin, tap it to open */
function focusTf(id) { const [x, y, ww, hh] = PHYS[id].rect; const k = Math.min(2.6, Math.max(1.15, 88 / Math.max(ww, hh * 1.15))); const cx = x + ww / 2, cy = y + hh / 2; return `translate(-50%,-50%) translate(${(50 - cx) * k}%, ${(50 - cy) * k}%) scale(${k})`; }
function shelfFocusView(w) {
  const id = S.bin, sh = SHELVES.find((x) => x.id === PHYS[id].shelf), i = ORDER_BINS.indexOf(id), sp = w.spaces.find((x) => x.id === id) || {}, its = w.inBin(id);
  return `<div class="spx-stage"><div class="spx-cam" id="cam"><div class="spx-pan" id="pan" style="transform:${focusTf(id)}"><img src="${IMG}${sh.photo}" alt="${esc(shelfName(sh))}" draggable="false">
      ${sh.bins.map((b) => { const [x, y, ww, hh] = PHYS[b].rect; return `<button class="spx-fhot${b === id ? " on" : ""}" data-fbin="${b}" style="left:${x}%;top:${y}%;width:${ww}%;height:${hh}%" type="button" aria-label="Open ${esc(nm(w, b))}"></button>`; }).join("")}</div>
      <div class="spx-fnav"><button type="button" class="spx-fbtn" id="fPrev" aria-label="Bin above"${i <= 0 ? " disabled" : ""}>˄</button><button type="button" class="spx-fbtn" id="fNext" aria-label="Bin below"${i >= ORDER_BINS.length - 1 ? " disabled" : ""}>˅</button></div></div>
    <div class="spx-fcard"><div><b>${esc(sp.name || nm(w, id))}</b><em>${esc(sp.sub || PHYS[id].sub || "")} · ${its.length} item${its.length === 1 ? "" : "s"} · ${money(val(its))}</em></div><button class="btn go" id="fOpen" type="button">Open it</button></div>
    <p class="spx-hint">Swipe up or down for the next bin. Tap the bin to open it.</p></div>`;
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
  if ((S.level === "bin" || S.level === "shelf") && sp) crumbs.push({ t: sp.name });
  const body = S.level === "area" ? areaView(w) : S.level === "shelf" && PHYS[S.bin] ? shelfFocusView(w) : binView(w);
  ctx.host.innerHTML = `<div class="sp-wrap spx" data-level="${S.level}">${head(w, crumbs)}${body}</div>`;
  if (S.level === "bin" && S.open) setLid(true, true);
  wire(w); fitPan();
}
async function camera(next, fromEl) {
  if (busy) return; busy = true;
  try {
    const from = rectOf(fromEl), old = ctx.host.querySelector(".spx-stage"), deeper = rank(next.level) > rank(S.level), prev = { shelf: S.shelf, bin: S.bin };
    if (old && from) { const r = old.getBoundingClientRect(); old.style.transformOrigin = `${from.left + from.width / 2 - r.left}px ${from.top + from.height / 2 - r.top}px`;
      const dive = Math.min(5, Math.max(2.2, (r.width * .85) / Math.max(1, from.width)));
      old.animate(deeper ? [{ transform: "scale(1)", opacity: 1 }, { transform: `scale(${dive})`, opacity: 0 }] : [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(.88)", opacity: 0 }], { duration: 340, easing: "cubic-bezier(.5,0,.8,.45)", fill: "forwards" }); await sleep(300); }
    Object.assign(S, next); paint(); try { document.getElementById("main").scrollTo(0, 0); } catch { /* ignore */ }
    const st = ctx.host.querySelector(".spx-stage"), foc = ctx.host.querySelector("[data-focus]");
    if (deeper) { if (foc && from) fly(foc, from, { dur: 560 }); st && st.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: "ease-out" }); }
    else if (st) { const back = ctx.host.querySelector(`[data-shelf="${prev.shelf}"]`) || ctx.host.querySelector(`[data-bin="${prev.bin}"]`);
      if (back) { const r = st.getBoundingClientRect(), b = back.getBoundingClientRect(); st.style.transformOrigin = `${b.left + b.width / 2 - r.left}px ${b.top + b.height / 2 - r.top}px`; }
      st.animate([{ transform: "scale(1.4)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: 500, easing: "cubic-bezier(.2,.8,.2,1)" }); }
  } finally { busy = false; }
}
function setLid(open, quiet) {
  S.open = open; const h = ctx.host, f = h.querySelector("#flip"), it = h.querySelector("#items"), b = h.querySelector("#lidBtn"); if (!f) return;
  f.classList.toggle("opened", open); it && it.classList.toggle("show", open); if (b) b.textContent = open ? "Close lid" : "Open lid";
  if (open && !quiet && it) [...it.children].slice(0, 24).forEach((c, i) => c.animate([{ opacity: 0, transform: "translateY(26px) scale(.9)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: 260 + i * 35, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" }));
}

/* ---------- sheets ---------- */
function renameSheet(title, current, save, after) {
  const s = ctx.openSheet(`<a class="back" href="#" data-close>‹ Back</a><h2>${esc(title)}</h2><form id="rnF"><label class="sc-f"><span>Name</span><input name="n" value="${esc(current)}"></label><button class="btn go" type="submit" style="margin-top:12px">Save</button></form>`);
  s.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); ctx.closeSheet(); }));
  s.querySelector("#rnF").addEventListener("submit", (e) => { e.preventDefault(); const inp = s.querySelector("[name=n]"); const n = inp.value.trim(); if (!n) { ctx.toast("Give it a name."); return; } inp.blur(); save(n); ctx.closeSheet(); ctx.toast(`Renamed to ${n}`); if (after) after(); else setTimeout(paint, 380); });
}
function pickSheet(targetId) {
  const sel = new Set(); let q = "", cat = "All", more = 60;
  const s = ctx.openSheet(`<div id="pk"></div>`), box = s.querySelector("#pk");
  const move = (ids, to, label) => { const prev = snapshot(); if (!assign(ids, to)) { ctx.toast("Couldn't save. Storage is full."); return; } const name = (loadSpaces().find((b) => b.id === to) || {}).name || "bin"; ctx.closeSheet(); ctx.refresh(); paint(); ctx.toastUndo(`Put ${label} in ${name}`, () => { restore(prev); ctx.refresh(); paint(); }); };
  const draw = (keepScroll) => {
    const w2 = world(), un = w2.un, cats = new Map(); un.forEach((i) => { const c = catOf(i); cats.set(c, (cats.get(c) || 0) + 1); });
    const shown = un.filter((i) => (cat === "All" || catOf(i) === cat) && (!q || nameOf(i).toLowerCase().includes(q.toLowerCase())));
    const bins = w2.spaces.filter((b) => b.phys || true);
    const ids = shown.map((i) => String(i.id)), allOn = ids.length && ids.every((x) => sel.has(x));
    const sc = keepScroll ? box.querySelector(".pk-grid")?.scrollTop : 0;
    box.innerHTML = `<div class="pk-top"><a class="back" href="#" data-close>‹ Back</a><h2>${targetId ? "Add items" : "Put away"}</h2><div class="sub">${un.length} not in a bin</div>
      <div class="pk-chips" role="tablist"><button type="button" class="${cat === "All" ? "on" : ""}" data-cat="All">All <em>${un.length}</em></button>${[...cats.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `<button type="button" class="${cat === c ? "on" : ""}" data-cat="${esc(c)}">${esc(c)} <em>${n}</em></button>`).join("")}</div>
      <div class="pk-tools"><input id="pkq" type="search" placeholder="Search" value="${esc(q)}" class="spx-q"><button type="button" class="pk-all" id="pkAll">${allOn ? "Clear" : `Select all ${shown.length}`}</button></div></div>
      <div class="pk-grid">${shown.slice(0, more).map((i) => { const on = sel.has(String(i.id)), ph = photoOf(i); return `<button type="button" class="pk-tile${on ? " on" : ""}" data-id="${esc(i.id)}" draggable="true">${ph ? `<img src="${esc(ph)}" alt="" loading="lazy" decoding="async" draggable="false">` : `<span class="pk-ini">${esc(nameOf(i).charAt(0))}</span>`}<i class="pk-ck"></i><span class="pk-cap">${esc(nameOf(i))}</span></button>`; }).join("") || `<div class="spx-empty">${un.length ? "Nothing matches." : "Everything is in a bin."}</div>`}${shown.length > more ? `<button type="button" class="pk-more" id="pkMore">Show more (${shown.length - more})</button>` : ""}</div>
      <div class="pk-bar${sel.size ? " on" : ""}"><b>${sel.size ? `${sel.size} picked. Put in:` : "Tap photos to pick, then choose a bin"}</b><div class="pk-bins">${bins.map((b) => `<button type="button" class="pk-bin${b.id === targetId ? " tgt" : ""}" data-to="${esc(b.id)}"${sel.size ? "" : " disabled"}>${esc(b.name)}</button>`).join("")}</div></div>`;
    if (sc) box.querySelector(".pk-grid").scrollTop = sc;
    box.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); ctx.closeSheet(); }));
    box.querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => { cat = b.dataset.cat; more = 60; draw(); }));
    box.querySelector("#pkAll")?.addEventListener("click", () => { allOn ? ids.forEach((x) => sel.delete(x)) : ids.forEach((x) => sel.add(x)); draw(true); });
    box.querySelector("#pkMore")?.addEventListener("click", () => { more += 60; draw(true); });
    const qi = box.querySelector("#pkq"); qi?.addEventListener("input", () => { q = qi.value; more = 60; const p = qi.selectionStart; draw(); const n = box.querySelector("#pkq"); n.focus(); n.setSelectionRange(p, p); });
    box.querySelectorAll(".pk-tile").forEach((t) => {
      t.addEventListener("click", () => { const id = t.dataset.id; sel.has(id) ? sel.delete(id) : sel.add(id); t.classList.toggle("on", sel.has(id)); const bar = box.querySelector(".pk-bar"); bar.classList.toggle("on", sel.size > 0); bar.querySelector("b").textContent = sel.size ? `${sel.size} picked. Put in:` : "Tap photos to pick, then choose a bin"; bar.querySelectorAll(".pk-bin").forEach((x) => { x.disabled = !sel.size; }); const all = box.querySelector("#pkAll"); if (all) { const on = ids.length && ids.every((x) => sel.has(x)); all.textContent = on ? "Clear" : `Select all ${shown.length}`; } });
      t.addEventListener("dragstart", (e) => { if (!sel.has(t.dataset.id)) { sel.add(t.dataset.id); t.classList.add("on"); } e.dataTransfer.setData("text/plain", "pk"); e.dataTransfer.effectAllowed = "move"; });
    });
    box.querySelectorAll(".pk-bin").forEach((b) => {
      b.addEventListener("click", () => { if (sel.size) move([...sel], b.dataset.to, `${sel.size} item${sel.size === 1 ? "" : "s"}`); });
      b.addEventListener("dragover", (e) => { e.preventDefault(); b.classList.add("over"); }); b.addEventListener("dragleave", () => b.classList.remove("over"));
      b.addEventListener("drop", (e) => { e.preventDefault(); b.classList.remove("over"); if (sel.size) move([...sel], b.dataset.to, `${sel.size} item${sel.size === 1 ? "" : "s"}`); });
    });
  };
  draw();
}

/* ---------- wiring ---------- */
function up() { if (busy) return; const f = ctx.host.querySelector("[data-focus]") || ctx.host.querySelector("#cam");
  if (S.level === "bin" && PHYS[S.bin]) { focusOn(S.bin, true); return; }
  if (S.level === "bin" || S.level === "shelf") camera({ level: "area", shelf: null, bin: null, open: false }, f); }
/* area -> zoom onto a bin on its shelf (animated), or move between bins */
function focusOn(id, fromBin) {
  const first = S.level === "area"; Object.assign(S, { level: "shelf", shelf: PHYS[id].shelf, bin: id, open: false }); paint();
  const pan = ctx.host.querySelector("#pan"); if (!pan) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (first) pan.animate([{ transform: "translate(-50%,-50%)" }, { transform: focusTf(id) }], { duration: 650, easing: "cubic-bezier(.2,.8,.2,1)" });
  else if (fromBin) ctx.host.querySelector(".spx-stage")?.animate([{ transform: "scale(1.25)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" });
}
function stepBin(d) {
  const i = ORDER_BINS.indexOf(S.bin), nid = ORDER_BINS[i + d]; if (!nid) return;
  const pan = ctx.host.querySelector("#pan");
  if (pan && PHYS[nid].shelf === PHYS[S.bin].shelf) {
    S.bin = nid; pan.style.transition = matchMedia("(prefers-reduced-motion: reduce)").matches ? "none" : "transform .55s cubic-bezier(.2,.8,.2,1)"; pan.style.transform = focusTf(nid);
    const w = world(); pan.querySelectorAll("[data-fbin]").forEach((b) => b.classList.toggle("on", b.dataset.fbin === nid));
    const card = ctx.host.querySelector(".spx-fcard"), tmp = document.createElement("div"); tmp.innerHTML = shelfFocusView(w); const nc = tmp.querySelector(".spx-fcard"); if (card && nc) card.replaceWith(nc);
    const nav = ctx.host.querySelector(".spx-fnav"), nn = tmp.querySelector(".spx-fnav"); if (nav && nn) nav.replaceWith(nn);
    const cr = ctx.host.querySelector(".spx-crumbs"); tmp.innerHTML = head(w, [{ t: "Spaces", go: true }, { t: nm(w, nid) }]); const nh = tmp.querySelector(".spx-crumbs"); if (cr && nh) cr.replaceWith(nh);
    wireFocus();
  } else { S.bin = nid; focusOn(nid); }
}
function openBin() { if (busy) return; const hot = ctx.host.querySelector(".spx-fhot.on") || ctx.host.querySelector("#cam"); camera({ level: "bin", shelf: S.shelf, bin: S.bin, open: false }, hot); }
function fitPan() { const pan = ctx.host.querySelector("#pan"), im = pan && pan.querySelector("img"); if (!im) return; const set = () => { if (im.naturalWidth) pan.style.aspectRatio = `${im.naturalWidth} / ${im.naturalHeight}`; }; if (im.complete) set(); else im.addEventListener("load", set, { once: true }); }
function wireFocus() {
  const h = ctx.host, $ = (q) => h.querySelector(q);
  $("#fPrev")?.addEventListener("click", () => stepBin(-1));
  $("#fNext")?.addEventListener("click", () => stepBin(1));
  $("#fOpen")?.addEventListener("click", openBin);
  $("[data-up]")?.addEventListener("click", up);
  /* swipe in from the left edge = back, like iPhone */
  { const st = $(".spx-stage"); if (st && S.level !== "area") { let x0 = null, y0 = 0; st.addEventListener("touchstart", (e) => { const t = e.touches[0]; x0 = t.clientX < 34 ? t.clientX : null; y0 = t.clientY; }, { passive: true }); st.addEventListener("touchend", (e) => { if (x0 == null) return; const t = e.changedTouches[0]; if (t.clientX - x0 > 80 && Math.abs(t.clientY - y0) < 60) up(); x0 = null; }, { passive: true }); } }
  h.querySelectorAll("[data-crumb]").forEach((b) => b.addEventListener("click", () => { if (Number(b.dataset.crumb) === 0) camera({ level: "area", shelf: null, bin: null, open: false }, b); }));
}
function wire(w) {
  const h = ctx.host, $ = (s) => h.querySelector(s);
  h.querySelectorAll("[data-bin]").forEach((b) => b.addEventListener("click", () => { const id = b.dataset.bin; if (PHYS[id]) focusOn(id); else camera({ level: "bin", shelf: S.shelf, bin: id, open: false }, b); }));
  h.querySelectorAll("[data-fbin]").forEach((b) => b.addEventListener("click", () => { if (b.dataset.fbin === S.bin) openBin(); else { const d = ORDER_BINS.indexOf(b.dataset.fbin) - ORDER_BINS.indexOf(S.bin); stepBin(d); } }));
  $("#fPrev")?.addEventListener("click", () => stepBin(-1)); $("#fNext")?.addEventListener("click", () => stepBin(1)); $("#fOpen")?.addEventListener("click", openBin);
  const cam = $("#cam"); if (cam) { let sy = null, sx = 0; cam.addEventListener("touchstart", (e) => { if (e.touches.length !== 1) { sy = null; return; } sy = e.touches[0].clientY; sx = e.touches[0].clientX; }, { passive: true });
    cam.addEventListener("touchend", (e) => { if (sy == null) return; const dy = e.changedTouches[0].clientY - sy, dx = e.changedTouches[0].clientX - sx; sy = null; if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx) * 1.3) stepBin(dy < 0 ? 1 : -1); }, { passive: true });
    let wt = 0; cam.addEventListener("wheel", (e) => { if (Math.abs(e.deltaY) < 20) return; e.preventDefault(); const now = Date.now(); if (now - wt < 650) return; wt = now; stepBin(e.deltaY > 0 ? 1 : -1); }, { passive: false }); }
  $("[data-up]")?.addEventListener("click", up);
  h.querySelectorAll("[data-crumb]").forEach((b) => b.addEventListener("click", () => { if (busy) return; const i = Number(b.dataset.crumb); if (i === 0) camera({ level: "area", shelf: null, bin: null, open: false }, b); }));
  $("[data-un]")?.addEventListener("click", () => pickSheet(null));
  $("#lidBtn")?.addEventListener("click", (e) => { e.stopPropagation(); setLid(!S.open); });
  $("#flip")?.addEventListener("click", () => setLid(!S.open));
  $("[data-add]")?.addEventListener("click", () => pickSheet(S.bin));
  h.querySelectorAll("[data-rename-shelf]").forEach((eb) => eb.addEventListener("click", (ev) => { ev.stopPropagation(); const sh = SHELVES.find((x) => x.id === eb.dataset.renameShelf); renameSheet("Rename shelf", shelfName(sh), (n) => { const m = shelfNames(); m[sh.id] = n; try { localStorage.setItem(SHELVES_KEY, JSON.stringify(m)); } catch { /* ignore */ } }); }));
  $("[data-rename-bin]")?.addEventListener("click", () => { const sp = loadSpaces().find((s) => s.id === S.bin); renameSheet("Rename bin", sp.name, (n) => { const all = loadSpaces(); all.find((s) => s.id === S.bin).name = n; saveSpaces(all); }, () => { const t = h.querySelector(".spx-sidehead h3"); if (t) t.textContent = loadSpaces().find((s) => s.id === S.bin)?.name || ""; const c = h.querySelector(".spx-crumbs h2"); if (c && t) c.textContent = t.textContent; }); });
  $("[data-out]")?.addEventListener("click", () => { const its = w.inBin(S.bin), name = nm(w, S.bin), prev = snapshot(); assign(its.map((i) => i.id), null); ctx.refresh(); paint(); ctx.toastUndo(`Took ${its.length} out of ${name}`, () => { restore(prev); ctx.refresh(); paint(); }); });
  $("[data-del]")?.addEventListener("click", () => { const its = w.inBin(S.bin), name = nm(w, S.bin), prev = snapshot(); assign(its.map((i) => i.id), null); saveSpaces(loadSpaces().filter((x) => x.id !== S.bin)); S.level = "area"; S.bin = null; S.open = false; ctx.refresh(); paint(); ctx.toastUndo(`Deleted ${name}`, () => { restore(prev); ctx.refresh(); paint(); }); });
  h.querySelectorAll("[data-item]").forEach((c) => c.addEventListener("click", () => {
    const list = w.inBin(S.bin), name = nm(w, S.bin);
    openCard(list, { index: list.findIndex((i) => String(i.id) === c.dataset.item), from: c, photo: photoOf, name: nameOf, backLabel: name,
      info: (it) => `<div class="sub">In ${esc(name)}</div><div class="row"><span>Price</span><span>${money(it.price)}</span></div><div class="row"><span>Quantity</span><span>${Number(it.quantity) || 1}</span></div><button class="btn" data-takeout type="button">Take out of bin</button>`,
      wire: (root, it, api) => root.querySelector("[data-takeout]")?.addEventListener("click", () => { const prev = snapshot(); assign([it.id], null); api.close(); ctx.refresh(); paint(); ctx.toastUndo("Took it out of the bin", () => { restore(prev); ctx.refresh(); paint(); }); }) });
  }));
}
export function renderSpaces(host, api) {
  ctx = { host, ...api }; ensureBins(); Object.assign(S, { level: "area", shelf: null, bin: null, open: false }); busy = false; paint();
  if (!keyBound) { keyBound = true; document.addEventListener("keydown", (e) => { const sh = document.getElementById("sheet"); if (e.key === "Escape" && ctx && ctx.host.querySelector(".spx") && !document.querySelector(".k-zoom") && (!sh || sh.hidden)) up(); }); }
}
export function repaintSpaces() { if (ctx && ctx.host.querySelector(".spx")) paint(); }
