/* Visor HUD: Home readout, the Line (constellation roadmap) and the item readout card.
 * Pure rendering. coalition.js passes in state + actions via initHud(ctx). */

const STAGE = {
  intake:    { c: "#DDE3EE", h: "#FFFFFF", sub: "Step 1" },
  staged:    { c: "#B58CFF", h: "#D9C2FF", sub: "Step 2" },
  listed:    { c: "#FF7A45", h: "#FFB08A", sub: "Step 3" },
  sold:      { c: "#FF5CA8", h: "#FF9DCB", sub: "Step 4" },
  packed:    { c: "#C9B8FF", h: "#EDE5FF", sub: "Step 5" },
  shipped:   { c: "#FF9A5C", h: "#FFC59E", sub: "Step 6" },
  delivered: { c: "#FFFFFF", h: "#FFFFFF", sub: "Step 7" },
};
const NEXT_LABEL = { intake: "Stage it", staged: "Mark listed", listed: "Mark sold", sold: "Mark packed", packed: "Mark shipped", shipped: "Mark delivered" };

let ctx = null;
let lastValue = null;
const pad2 = (n) => String(n).padStart(2, "0");

export function initHud(c) {
  ctx = c;
  bindTilt();
}

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const sty = (id) => {
  const s = STAGE[id] || STAGE.intake;
  return `--c:${s.c};--h:${s.h}`;
};
const photoOf = (it) => (it.photos && it.photos[0] && it.photos[0].dataUrl) || "";
const nameOf = (it) => it.title || it.productName || "Untitled";
const worth = (it) => (Number(it.price) || 0) * (Number(it.quantity) || 1);

function countUp(el, to) {
  if (!el) return;
  const from = lastValue == null ? 0 : lastValue;
  lastValue = to;
  if (from === to || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = ctx.money(to);
    return;
  }
  const t0 = performance.now();
  const dur = 700;
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = ctx.money(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------- Home ---------- */
export function renderHome() {
  const host = document.getElementById("hudHome");
  if (!host || !ctx) return;
  const { state, PHASES, phaseFromItem } = ctx;
  const items = state.items;
  const counts = Object.fromEntries(PHASES.map((p) => [p.id, 0]));
  for (const it of items) counts[phaseFromItem(it)] = (counts[phaseFromItem(it)] || 0) + 1;
  const open = items.filter((i) => !["sold", "packed", "shipped", "delivered"].includes(phaseFromItem(i)));
  const value = open.reduce((s, i) => s + worth(i), 0);
  const paid = open.reduce((s, i) => s + (Number(i.purchasePrice) || 0) * (Number(i.quantity) || 1), 0);
  const total = items.length;
  const live = counts.listed || 0;
  const pct = total ? Math.round((live / total) * 100) : 0;
  const toList = items.filter((i) => i.listingStatus === "ready to list" || (phaseFromItem(i) === "staged" && i.listingStatus !== "listed")).length;
  const needsBin = items.filter((i) => !i.spaceId && phaseFromItem(i) !== "listed").length;
  const toShip = (counts.sold || 0) + (counts.packed || 0);
  const review = items.filter((i) => phaseFromItem(i) === "intake" && !i.productName).length || counts.intake || 0;
  const R = 30, C = 2 * Math.PI * R;

  const hubs = PHASES.map((p) => {
    const n = counts[p.id] || 0;
    return `<button type="button" class="vh-hub${n ? " on" : ""}" data-phase-go="${p.id}" style="${sty(p.id)}" aria-label="${p.label} ${n}">
      <span class="vh-orb"><b>${pad2(n)}</b></span><span class="vh-lab">${p.label}</span></button>`;
  }).join("");

  const needs = [
    { n: review, t: "Scans to review", h: "Unidentified or low confidence", go: "scouter", s: "intake" },
    { n: toList, t: "Ready to list", h: "Built and waiting for a channel", go: "channels", s: "listed" },
    { n: needsBin, t: "Needs a bin", h: "Not in Spaces yet", go: "spaces", s: "staged" },
    { n: toShip, t: "Ready to ship", h: "Sold, packed, waiting on dropoff", go: "constellation", s: "sold" },
  ].map((r) => `<button type="button" class="vh-need${r.n ? " hot" : ""}" data-goto="${r.go}" style="${sty(r.s)}">
      <span class="vh-need-n">${pad2(r.n)}</span>
      <span class="vh-need-t"><b>${r.t}</b><i>${r.h}</i></span><span class="vh-go">›</span>
      <span class="v-gloss"></span></button>`).join("");

  const recent = [...items].sort((a, b) => (Date.parse(b.createdAt || 0) || 0) - (Date.parse(a.createdAt || 0) || 0)).slice(0, 4);
  const feed = recent.length
    ? recent.map((it) => {
        const ph = phaseFromItem(it);
        return `<button type="button" class="vh-row" data-readout="${esc(it.id)}" style="${sty(ph)}">
          <span class="vh-dot"></span><span class="vh-row-t">${esc(nameOf(it))}</span>
          <span class="vh-row-s">${esc((PHASES.find((p) => p.id === ph) || {}).label || "")}</span></button>`;
      }).join("")
    : `<div class="vh-empty">Nothing yet. Snap a photo in Scouter and it shows up here.</div>`;

  host.innerHTML = `
    <section class="v-panel v-cut-lg vh-hero">
      <div class="v-eyebrow">Stock value on the line</div>
      <div class="v-big" id="vhValue">${ctx.money(lastValue == null ? 0 : lastValue)}</div>
      <div class="vh-chips">
        <span class="v-chip on">${live} live</span>
        <span class="v-chip">${total} items</span>
        <span class="v-chip">Paid ${ctx.money(paid)}</span>
      </div>
      <svg class="vh-ring" viewBox="0 0 76 76" aria-label="${pct}% listed">
        <circle cx="38" cy="38" r="${R}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="5"/>
        <circle cx="38" cy="38" r="${R}" fill="none" stroke="url(#vhg)" stroke-width="5" stroke-linecap="round"
          stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct / 100)).toFixed(1)}" transform="rotate(-90 38 38)"/>
        <defs><linearGradient id="vhg" x1="0" x2="1"><stop offset="0" stop-color="#B58CFF"/><stop offset="1" stop-color="#FF7A45"/></linearGradient></defs>
        <text x="38" y="43" text-anchor="middle" class="vh-ring-t">${pct}%</text>
      </svg>
    </section>

    <section class="v-panel v-cut vh-line">
      <div class="vh-line-head"><span class="v-eyebrow">The line · pile to doorstep</span>
        <button type="button" class="v-btn" data-goto="constellation">Open</button></div>
      <div class="vh-track"><i class="vh-rail"></i>${hubs}</div>
    </section>

    <section class="vh-needs">${needs}</section>

    <section class="v-panel v-cut vh-feed">
      <div class="v-eyebrow">Latest in</div>${feed}
    </section>`;
  countUp(document.getElementById("vhValue"), value);

  host.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => ctx.navigate(b.dataset.goto)));
  host.querySelectorAll("[data-phase-go]").forEach((b) => b.addEventListener("click", () => {
    ctx.navigate("constellation");
    setTimeout(() => {
      const sec = document.querySelector(`#roadmap [data-phase="${b.dataset.phaseGo}"]`);
      if (sec) sec.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  }));
  host.querySelectorAll("[data-readout]").forEach((b) => b.addEventListener("click", () => openReadout(b.dataset.readout)));
}

/* ---------- The Line (constellation roadmap) ---------- */
export function renderLine() {
  const root = document.getElementById("roadClusters");
  if (!root || !ctx) return;
  const { state, PHASES, phaseFromItem } = ctx;
  const by = Object.fromEntries(PHASES.map((p) => [p.id, []]));
  for (const it of state.items) (by[phaseFromItem(it)] || by.intake).push(it);
  const moved = state.justMovedId;
  state.justMovedId = null;

  root.innerHTML = PHASES.map((p, i) => {
    const list = by[p.id];
    const val = list.reduce((s, it) => s + worth(it), 0);
    const cards = list.map((it) => {
      const src = photoOf(it);
      const q = Number(it.quantity) || 1;
      return `<button type="button" class="node-item vcard${moved === it.id ? " land" : ""}" data-item="${esc(it.id)}" draggable="true" aria-label="${esc(nameOf(it))} — ${p.label}">
        <span class="vcard-face">${src ? `<img src="${src}" alt="" loading="lazy" draggable="false">` : `<b class="vcard-i">${esc(nameOf(it).charAt(0).toUpperCase())}</b>`}</span>
        <span class="vcard-scan"></span><span class="v-gloss"></span>
        ${q > 1 ? `<span class="vcard-q">x${q}</span>` : ""}
        <span class="vcard-plate"><b>${esc(nameOf(it))}</b><i>${ctx.money(worth(it))}</i></span></button>`;
    }).join("");
    return `<section class="stage vs${list.length ? "" : " empty"}" data-phase="${p.id}" style="${sty(p.id)}" aria-label="${p.label}">
      <div class="vs-rail"><span class="vs-hub"><i class="vs-ring"></i><i class="vs-ring r2"></i><b>${pad2(list.length)}</b></span>${i < PHASES.length - 1 ? '<i class="vs-line"></i>' : ""}</div>
      <div class="vs-body">
        <header class="stage-head"><span class="stage-name">${p.label}</span><span class="stage-val">${ctx.money(val)}</span></header>
        ${list.length ? `<div class="stage-items vs-strip">${cards}</div>` : `<div class="vs-empty">Drag an item here</div>`}
      </div></section>`;
  }).join("");

  root.querySelectorAll("[data-item]").forEach((b) => b.addEventListener("click", () => openReadout(b.dataset.item)));
}

/* ---------- half-zoom readout ---------- */
export function openReadout(id) {
  if (!ctx) return;
  const it = ctx.state.items.find((x) => x.id === id);
  if (!it) return;
  const { PHASES, phaseFromItem } = ctx;
  const ph = phaseFromItem(it);
  const idx = PHASES.findIndex((p) => p.id === ph);
  const next = PHASES[idx + 1];
  const label = (PHASES[idx] || {}).label || "";
  const src = photoOf(it);
  const paid = (Number(it.purchasePrice) || 0) * (Number(it.quantity) || 1);
  const profit = worth(it) - paid;
  closeReadout(true);
  const el = document.createElement("div");
  el.id = "vReadout";
  el.className = "v-readout-wrap";
  el.setAttribute("style", sty(ph));
  el.innerHTML = `<div class="v-readout-card v-panel v-cut-lg" role="dialog" aria-label="${esc(nameOf(it))}">
    <span class="vr-beam"></span>
    <button type="button" class="vr-x" aria-label="Close">×</button>
    <div class="vr-top">
      <span class="vr-art">${src ? `<img src="${src}" alt="">` : `<b>${esc(nameOf(it).charAt(0).toUpperCase())}</b>`}<span class="v-gloss on"></span></span>
      <div class="vr-info">
        <div class="v-eyebrow">${esc(label)}</div>
        <div class="vr-title">${esc(nameOf(it))}</div>
        <div class="v-big sm">${ctx.money(worth(it))}</div>
        <div class="vr-sub">${paid ? `Paid ${ctx.money(paid)} · ${profit >= 0 ? "+" : "-"}${ctx.money(Math.abs(profit))}` : "No purchase price yet"}</div>
      </div>
    </div>
    <div class="vr-actions">
      ${next ? `<button type="button" class="v-btn primary" data-vr="move">${NEXT_LABEL[ph] || "Advance"}</button>` : ""}
      <button type="button" class="v-btn" data-vr="open">Open details</button>
    </div></div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  el.addEventListener("click", (e) => { if (e.target === el) closeReadout(); });
  el.querySelector(".vr-x").addEventListener("click", () => closeReadout());
  el.querySelector('[data-vr="open"]').addEventListener("click", () => { closeReadout(true); ctx.openSheet(id); });
  const mv = el.querySelector('[data-vr="move"]');
  if (mv) mv.addEventListener("click", () => { closeReadout(true); ctx.moveItemToPhase(id, next.id); });
}

export function closeReadout(instant) {
  const el = document.getElementById("vReadout");
  if (!el) return;
  if (instant) { el.remove(); return; }
  el.classList.remove("in");
  setTimeout(() => el.remove(), 220);
}

/* ---------- tilt: cards lean toward the finger / cursor ---------- */
function bindTilt() {
  const apply = (e) => {
    const c = e.target.closest && e.target.closest(".vcard, .vh-need, .vh-hub");
    if (!c) return;
    const r = c.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    c.style.setProperty("--rx", (-py * 16).toFixed(1) + "deg");
    c.style.setProperty("--ry", (px * 16).toFixed(1) + "deg");
    c.classList.add("tilt");
  };
  const clear = (e) => {
    const c = e.target.closest && e.target.closest(".vcard, .vh-need, .vh-hub");
    if (!c) return;
    c.style.removeProperty("--rx");
    c.style.removeProperty("--ry");
    c.classList.remove("tilt");
  };
  document.addEventListener("pointermove", apply, { passive: true });
  document.addEventListener("pointerdown", apply, { passive: true });
  document.addEventListener("pointerup", clear, { passive: true });
  document.addEventListener("pointerout", clear, { passive: true });
  document.addEventListener("pointercancel", clear, { passive: true });
}
