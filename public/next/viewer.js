/* Full-screen photo viewer: tap any item photo to see it big.
   Pinch or double-tap to zoom (wheel / double-click on a Mac), drag to look around, swipe or arrows for the next photo. */
const TAP = ".lk-core img, .k-zimg img, .ip-hero img, #sheetMain, .ph-big img, [data-view-photo]";
let open = null;

function srcsNear(img) {
  const root = img.closest("ion-modal, .k-zoom, .shx, body") || document.body, out = [], seen = new Set();
  const add = (s) => { if (s && !seen.has(s) && !/^data:image\/svg/.test(s)) { seen.add(s); out.push(s); } };
  add(img.currentSrc || img.src);
  root.querySelectorAll(".ph-tile img, #phMgr img, .ph-grid img").forEach((i) => add(i.currentSrc || i.src));
  return out;
}

export function openViewer(list, from = 0, opts = {}) {
  if (!list.length) return; close();
  let i = Math.max(0, Math.min(list.length - 1, from)), s = 1, x = 0, y = 0;
  const v = document.createElement("div"); v.className = "pv"; v.setAttribute("role", "dialog"); v.setAttribute("aria-label", "Photo");
  v.innerHTML = `<div class="pv-stage"><img class="pv-img" alt="" draggable="false"></div>
    <button class="pv-x" type="button" aria-label="Close">×</button>
    ${list.length > 1 ? `<button class="pv-a l" type="button" aria-label="Previous photo">‹</button><button class="pv-a r" type="button" aria-label="Next photo">›</button>` : ""}
    <div class="pv-bar"><span class="pv-n"></span><span class="pv-h">Pinch or double-tap to zoom</span></div>
    ${opts.details ? `<button class="pv-d" type="button">${opts.detailsLabel || "Details, edit or delete"}</button>` : ""}`;
  document.body.appendChild(v); open = v;
  const img = v.querySelector(".pv-img"), stage = v.querySelector(".pv-stage");
  const apply = (anim) => { img.style.transition = anim ? "transform .22s cubic-bezier(.2,.8,.2,1)" : "none"; img.style.transform = `translate(${x}px,${y}px) scale(${s})`; v.classList.toggle("zoomed", s > 1.01); };
  const clamp = () => { const r = stage.getBoundingClientRect(), w = img.offsetWidth * s, h = img.offsetHeight * s, mx = Math.max(0, (w - r.width) / 2), my = Math.max(0, (h - r.height) / 2); x = Math.max(-mx, Math.min(mx, x)); y = Math.max(-my, Math.min(my, y)); };
  const reset = () => { s = 1; x = 0; y = 0; apply(true); };
  /* eBay serves bigger copies of the same photo: ask for the 1600px one */
  const big = (u) => /ebayimg\.com/.test(u) ? u.replace(/s-l\d+(\.\w+)/, "s-l1600$1").replace(/\$_\d+\.(jpe?g|png|webp)/i, "$_57.$1") : u;
  const show = (k) => { i = (k + list.length) % list.length; img.src = big(list[i]); img.onerror = () => { if (img.src !== list[i]) img.src = list[i]; }; s = 1; x = 0; y = 0; apply(false); v.querySelector(".pv-n").textContent = list.length > 1 ? `${i + 1} of ${list.length}` : ""; };
  const zoomAt = (cx, cy, to) => { const r = stage.getBoundingClientRect(), ox = cx - (r.left + r.width / 2), oy = cy - (r.top + r.height / 2), k = to / s; x = ox - (ox - x) * k; y = oy - (oy - y) * k; s = to; clamp(); apply(true); };
  show(i);
  v.querySelector(".pv-x").addEventListener("click", close);
  v.querySelector(".pv-d")?.addEventListener("click", () => { close(); setTimeout(() => opts.details(), 190); });
  v.querySelector(".pv-a.l")?.addEventListener("click", () => show(i - 1));
  v.querySelector(".pv-a.r")?.addEventListener("click", () => show(i + 1));
  stage.addEventListener("dblclick", (e) => e.preventDefault());
  stage.addEventListener("wheel", (e) => { e.preventDefault(); const to = Math.max(1, Math.min(6, s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); if (to <= 1.01) { reset(); return; } zoomAt(e.clientX, e.clientY, to); }, { passive: false });
  /* pointers: one finger pans (or swipes when not zoomed), two fingers pinch */
  const pts = new Map(); let start = null, lastTap = 0, moved = false;
  stage.addEventListener("pointerdown", (e) => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = false;
    if (pts.size === 1) start = { px: e.clientX, py: e.clientY, x, y, s };
    if (pts.size === 2) { const [a, b] = [...pts.values()]; start = { d: Math.hypot(a.x - b.x, a.y - b.y), s, x, y, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; } });
  stage.addEventListener("pointermove", (e) => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (!start) return;
    if (pts.size === 2 && start.d) { const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), to = Math.max(1, Math.min(6, start.s * d / start.d)); s = start.s; x = start.x; y = start.y; zoomAt(start.cx, start.cy, to); img.style.transition = "none"; moved = true; return; }
    if (pts.size === 1) { const dx = e.clientX - start.px, dy = e.clientY - start.py; if (Math.hypot(dx, dy) > 6) moved = true; if (s > 1.01) { x = start.x + dx; y = start.y + dy; clamp(); apply(false); } else { img.style.transition = "none"; img.style.transform = `translateX(${dx}px)`; } } });
  const up = (e) => { if (!pts.has(e.pointerId)) return; const was = pts.size; pts.delete(e.pointerId);
    if (was === 1 && start && start.px != null) {
      const dx = e.clientX - start.px;
      if (s <= 1.01 && list.length > 1 && Math.abs(dx) > 60) { show(i + (dx < 0 ? 1 : -1)); start = null; return; }
      if (s <= 1.01) apply(true);
      if (!moved) { const now = Date.now(); if (now - lastTap < 300) { s > 1.01 ? reset() : zoomAt(e.clientX, e.clientY, 2.6); lastTap = 0; } else lastTap = now; }
    }
    start = pts.size === 1 ? (() => { const p = [...pts.values()][0]; return { px: p.x, py: p.y, x, y, s }; })() : null; };
  stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up);
  requestAnimationFrame(() => v.classList.add("on"));
}
export function close() { if (!open) return; const v = open; open = null; v.classList.remove("on"); setTimeout(() => v.remove(), 180); }

document.addEventListener("keydown", (e) => { if (!open) return; if (e.key === "Escape") { e.stopPropagation(); close(); } else if (e.key === "ArrowRight") open.querySelector(".pv-a.r")?.click(); else if (e.key === "ArrowLeft") open.querySelector(".pv-a.l")?.click(); }, true);
document.addEventListener("click", (e) => {
  const img = e.target.closest && e.target.closest(TAP); if (!img || open) return;
  const el = img.tagName === "IMG" ? img : img.querySelector("img"); if (!el || !(el.currentSrc || el.src)) return;
  e.preventDefault(); e.stopPropagation();
  const own = img.closest("[data-view-photo]"), list = own && own.dataset.viewPhoto ? JSON.parse(own.dataset.viewPhoto) : srcsNear(el);
  if (own && own.dataset.viewId) openViewer(list, 0, { details: () => own.dispatchEvent(new CustomEvent("pv:details", { bubbles: true })) }); else openViewer(list, 0);
}, true);
