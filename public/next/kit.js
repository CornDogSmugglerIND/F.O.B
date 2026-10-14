/* Interaction kit: one set of moves used on every tab.
   - hover/touch lift + tilt + glint on any .k-tilt
   - openCard(): half-zoom item card that flies out of the thing you tapped
   - fly(): shared-element move between two rects (the camera moves in Spaces)
   Nothing here knows about eBay or storage. Pages just add classes. */

const reduce = () => matchMedia("(prefers-reduced-motion:reduce)").matches;
const EASE = "cubic-bezier(.2,.8,.2,1)";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- hover / touch tilt (delegated, survives every re-render) ---------- */
let hot = null;
function cool(el) { if (!el) return; el.classList.remove("is-hot"); el.style.removeProperty("--rx"); el.style.removeProperty("--ry"); }
export function initKit() {
  if (initKit.done) return; initKit.done = true;
  const move = (e) => {
    const t = e.target.closest && e.target.closest(".k-tilt");
    if (hot && hot !== t) cool(hot);
    if (!t) { hot = null; return; }
    hot = t;
    const r = t.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    const amt = Number(t.dataset.tilt) || 1;
    t.style.setProperty("--rx", ((0.5 - py) * 14 * amt).toFixed(2) + "deg");
    t.style.setProperty("--ry", ((px - 0.5) * 16 * amt).toFixed(2) + "deg");
    t.style.setProperty("--mx", (px * 100).toFixed(1) + "%"); t.style.setProperty("--my", (py * 100).toFixed(1) + "%");
    t.classList.add("is-hot");
  };
  document.addEventListener("pointermove", move, { passive: true });
  document.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") move(e); }, { passive: true });
  const out = () => { cool(hot); hot = null; };
  document.addEventListener("pointerup", (e) => { if (e.pointerType === "touch") setTimeout(out, 160); }, { passive: true });
  document.addEventListener("pointerout", (e) => { if (hot && !hot.contains(e.relatedTarget)) out(); }, { passive: true });
  document.addEventListener("pointercancel", out, { passive: true });
}

/* ---------- shared-element move ---------- */
/** Animate `el` from the rect `from` to where it sits now. */
export function fly(el, from, { dur = 520, fade = true, delay = 0 } = {}) {
  if (!el || !from || reduce()) return Promise.resolve();
  const to = el.getBoundingClientRect(); if (!to.width || !to.height) return Promise.resolve();
  const dx = from.left + from.width / 2 - (to.left + to.width / 2), dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const sx = from.width / to.width, sy = from.height / to.height, s = Math.min(Math.max(Math.min(sx, sy), 0.05), 4);
  const a = el.animate([
    { transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: fade ? 0.2 : 1 },
    { transform: "translate(0,0) scale(1)", opacity: 1 },
  ], { duration: dur, delay, easing: EASE, fill: "backwards" });
  return a.finished.catch(() => {});
}
export const rectOf = (el) => (el ? el.getBoundingClientRect() : null);
export const sleep = (ms) => new Promise((r) => setTimeout(r, reduce() ? 0 : ms));

/* ---------- half-zoom card ---------- */
let zoomEl = null;
export function closeCard(instant) {
  if (!zoomEl) return; const z = zoomEl; zoomEl = null; document.removeEventListener("keydown", z._key);
  if (instant || reduce()) { z.remove(); return; }
  z.classList.add("out"); setTimeout(() => z.remove(), 220);
}
/** items: array of item objects. opts: {index, from:Element|Rect, info:(it)=>html, wire:(root,it,api)=>void, photo:(it)=>src, name:(it)=>str, price:(it)=>str} */
export function openCard(items, opts = {}) {
  closeCard(true);
  let i = Math.max(0, Math.min(items.length - 1, opts.index || 0));
  const photo = opts.photo || ((it) => (it.photos && it.photos[0] && (it.photos[0].dataUrl || it.photos[0].url)) || "");
  const name = opts.name || ((it) => it.title || it.productName || "Untitled");
  const z = document.createElement("div"); z.className = "k-zoom"; z.setAttribute("role", "dialog"); z.setAttribute("aria-modal", "true"); document.body.appendChild(z); zoomEl = z;
  const from = opts.from && opts.from.getBoundingClientRect ? opts.from.getBoundingClientRect() : opts.from || null;
  const paint = (first) => {
    const it = items[i];
    z.innerHTML = `<div class="k-zback" data-x></div>
      <div class="k-zcard">
        <button class="k-zx" data-x aria-label="Close">×</button>
        <div class="k-zart"><div class="k-big k-tilt" data-tilt="1.4">${photo(it) ? `<img src="${esc(photo(it))}" alt="" draggable="false">` : `<div class="k-ini">${esc(name(it).charAt(0).toUpperCase())}</div>`}<i class="k-br tl"></i><i class="k-br tr"></i><i class="k-br bl"></i><i class="k-br br"></i></div></div>
        <div class="k-zinfo"><h2>${esc(name(it))}</h2>${opts.info ? opts.info(it) : ""}</div>
        ${items.length > 1 ? `<div class="k-znav"><button data-prev aria-label="Previous">‹</button><span>${i + 1} / ${items.length}</span><button data-next aria-label="Next">›</button></div>` : ""}
      </div>`;
    z.querySelectorAll("[data-x]").forEach((b) => b.addEventListener("click", () => { closeCard(); opts.onClose && opts.onClose(); }));
    z.querySelector("[data-prev]")?.addEventListener("click", () => { i = (i - 1 + items.length) % items.length; paint(false); });
    z.querySelector("[data-next]")?.addEventListener("click", () => { i = (i + 1) % items.length; paint(false); });
    opts.wire && opts.wire(z, items[i], { close: () => closeCard(), next: () => z.querySelector("[data-next]")?.click() });
    if (first && from) fly(z.querySelector(".k-big"), from, { dur: 480 }); else if (!first) z.querySelector(".k-big").animate([{ opacity: 0.2, transform: "translateX(18px)" }, { opacity: 1, transform: "none" }], { duration: 240, easing: EASE });
  };
  z._key = (e) => { if (e.key === "Escape") { closeCard(); opts.onClose && opts.onClose(); } else if (e.key === "ArrowRight") z.querySelector("[data-next]")?.click(); else if (e.key === "ArrowLeft") z.querySelector("[data-prev]")?.click(); };
  document.addEventListener("keydown", z._key);
  // swipe on phones
  let sx = null; z.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
  z.addEventListener("touchend", (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 60) z.querySelector(dx < 0 ? "[data-next]" : "[data-prev]")?.click(); }, { passive: true });
  paint(true);
  return z;
}
