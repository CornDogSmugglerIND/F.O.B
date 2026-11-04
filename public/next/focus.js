/* Card focus: the card opens BIG the moment you tap it. Click/tap the photo to zoom (follows the pointer),
   arrows or swipe for the next card, Esc or the backdrop to close. Details + actions sit beside it. */
import { esc, money } from "./shared.js?v=183";
let open = null;
export function closeFocus() { if (!open) return; const v = open; open = null; v.classList.remove("on"); document.removeEventListener("keydown", onKey, true); setTimeout(() => v.remove(), 200); }
function onKey(e) { if (!open) return; if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeFocus(); } else if (e.key === "ArrowRight") open._go(1); else if (e.key === "ArrowLeft") open._go(-1); }
/* list: items; i: index; o: { photos(it)->[urls], title(it), facts(it)->[[label,value]], stats(it)->[[label,value,cls]], actions(it)->[[id,label,cls]], onAction(id,it,api) } */
export function openFocus(list, i, o) {
  closeFocus();
  const v = document.createElement("div"); v.className = "fc"; v.setAttribute("role", "dialog"); v.setAttribute("aria-modal", "true");
  document.body.appendChild(v); open = v; let k = i, ph = 0;
  const paint = () => {
    const it = list[k], photos = o.photos(it), src = photos[ph] || "";
    v.innerHTML = `<div class="fc-bg" data-x></div>
      <div class="fc-box">
        <div class="fc-stage"><div class="fc-zoom">${src ? `<img src="${esc(src)}" alt="" draggable="false">` : `<i class="fc-none">No photo</i>`}</div>
          ${photos.length > 1 ? `<div class="fc-thumbs">${photos.map((p, j) => `<button type="button" class="${j === ph ? "on" : ""}" data-ph="${j}" aria-label="Photo ${j + 1}"><img src="${esc(p)}" alt=""></button>`).join("")}</div>` : ""}
          <span class="fc-hint">Click the card to zoom</span></div>
        <aside class="fc-info">
          <div class="fc-nav"><span>${k + 1} of ${list.length}</span><button type="button" data-go="-1" aria-label="Previous card" ${list.length > 1 ? "" : "disabled"}>‹</button><button type="button" data-go="1" aria-label="Next card" ${list.length > 1 ? "" : "disabled"}>›</button><button type="button" class="fc-x" data-x aria-label="Close">✕</button></div>
          <h2>${esc(o.title(it))}</h2>
          <div class="fc-facts">${o.facts(it).filter(([, val]) => val).map(([l, val]) => `<span><em>${esc(l)}</em>${esc(val)}</span>`).join("")}</div>
          <div class="fc-stats">${o.stats(it).map(([l, val, c]) => `<div class="${c || ""}"><em>${esc(l)}</em><b>${val}</b></div>`).join("")}</div>
          ${o.extra ? `<div class="fc-extra">${o.extra(it)}</div>` : ""}
          <div class="fc-acts">${o.actions(it).map(([id, l, c]) => `<button type="button" class="${c || ""}" data-act="${id}">${esc(l)}</button>`).join("")}</div>
        </aside></div>`;
    const z = v.querySelector(".fc-zoom"), img = z.querySelector("img");
    if (img) {
      z.addEventListener("click", (e) => { const on = z.classList.toggle("zoomed"); if (on) move(e); else img.style.transformOrigin = "50% 50%"; });
      const move = (e) => { if (!z.classList.contains("zoomed")) return; const r = z.getBoundingClientRect(); img.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`; };
      z.addEventListener("pointermove", move);
      let x0 = null; z.addEventListener("pointerdown", (e) => { x0 = e.clientX; }); z.addEventListener("pointerup", (e) => { if (x0 != null && !z.classList.contains("zoomed") && Math.abs(e.clientX - x0) > 70) { e.stopPropagation(); v._go(e.clientX < x0 ? 1 : -1); } x0 = null; });
    }
    v.querySelectorAll("[data-x]").forEach((b) => b.addEventListener("click", closeFocus));
    v.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => v._go(Number(b.dataset.go))));
    v.querySelectorAll("[data-ph]").forEach((b) => b.addEventListener("click", () => { ph = Number(b.dataset.ph); paint(); }));
    v.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => o.onAction(b.dataset.act, list[k], { close: closeFocus, repaint: paint, button: b })));
    o.wire?.(v, it);
  };
  v._go = (d) => { k = (k + d + list.length) % list.length; ph = 0; paint(); };
  paint(); document.addEventListener("keydown", onKey, true);
  requestAnimationFrame(() => v.classList.add("on"));
}
