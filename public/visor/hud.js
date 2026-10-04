/* Route HUD: Home map, the Route (constellation), stage zoom, card zoom, touch drag.
 * Pure rendering. coalition.js passes state + actions in through initHud(ctx). */

const NEXT_LABEL = { intake: "Stage it", staged: "Mark listed", listed: "Mark sold", sold: "Mark packed", packed: "Mark shipped", shipped: "Mark delivered" };
const TRACK = [["sold", "Sold"], ["packed", "Packed"], ["shipped", "In transit"], ["delivered", "Doorstep"]];
/* the Home route: seven stops climbing from the pile to the doorstep (viewBox 360 x 270) */
const STOPS = [[40, 226], [92, 166], [150, 202], [198, 124], [248, 158], [298, 82], [326, 36]];

let ctx = null;
let lastValue = null;
let dragged = 0;
const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const photoOf = (it) => (it.photos && it.photos[0] && it.photos[0].dataUrl) || "";
const nameOf = (it) => it.title || it.productName || "Untitled";
const worth = (it) => (Number(it.price) || 0) * (Number(it.quantity) || 1);
const initial = (it) => esc(nameOf(it).charAt(0).toUpperCase());

export function initHud(c) {
  ctx = c;
  bindDrag();
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (!closeCard()) closeStage(); } });
}

function byPhase() {
  const { state, PHASES, phaseFromItem } = ctx;
  const by = Object.fromEntries(PHASES.map((p) => [p.id, []]));
  for (const it of state.items) (by[phaseFromItem(it)] || by.intake).push(it);
  return by;
}

function cardHtml(it, extra = "") {
  const src = photoOf(it);
  const q = Number(it.quantity) || 1;
  return `<button type="button" class="rt-card${extra}" data-item="${esc(it.id)}" aria-label="${esc(nameOf(it))}">
    <span class="rt-face">${src ? `<img src="${src}" alt="" draggable="false" loading="lazy">` : `<b class="rt-ini">${initial(it)}</b>`}
      ${q > 1 ? `<span class="rt-q">×${q}</span>` : ""}
      <span class="rt-cap"><span>${esc(nameOf(it))}</span><b>${ctx.money(worth(it))}</b></span>
    </span></button>`;
}

function countUp(el, to) {
  if (!el) return;
  const from = lastValue == null ? 0 : lastValue;
  lastValue = to;
  if (from === to || reduce()) { el.textContent = ctx.money(to); return; }
  const t0 = performance.now();
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / 700);
    el.textContent = ctx.money(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* smooth path through the stops */
function routePath(pts) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

const cardClick = (b) => b.addEventListener("click", (e) => { if (!dragged) openCard(b.dataset.item, b); else e.preventDefault(); });

/* ---------- Home ---------- */
export function renderHome() {
  const host = document.getElementById("hudHome");
  if (!host || !ctx) return;
  const { state, PHASES, phaseFromItem } = ctx;
  const by = byPhase();
  const items = state.items;
  const open = items.filter((i) => !["sold", "packed", "shipped", "delivered"].includes(phaseFromItem(i)));
  const value = open.reduce((s, i) => s + worth(i), 0);
  const live = by.listed.length;
  const toList = items.filter((i) => i.listingStatus === "ready to list" || (phaseFromItem(i) === "staged" && i.listingStatus !== "listed")).length;
  const needsBin = items.filter((i) => !i.spaceId && phaseFromItem(i) !== "listed").length;
  const toShip = by.sold.length + by.packed.length;
  const review = by.intake.length;
  const d = routePath(STOPS);

  const nodes = PHASES.map((p, i) => {
    const list = by[p.id];
    const [x, y] = STOPS[i];
    const src = list[0] && photoOf(list[0]);
    return `<button type="button" class="rh-node${list.length ? " on" : ""}" data-stage="${p.id}" style="left:${(x / 360 * 100).toFixed(2)}%;top:${(y / 270 * 100).toFixed(2)}%" aria-label="${p.label}, ${list.length} items">
      <span class="rh-dot">${src ? `<img src="${src}" alt="">` : ""}<b>${list.length || ""}</b></span>
      <span class="rh-name">${p.label}</span></button>`;
  }).join("");

  const needs = [
    { n: review, t: "Scans to review", go: "scouter" },
    { n: toList, t: "Ready to list", go: "channels" },
    { n: needsBin, t: "Needs a bin", go: "spaces" },
    { n: toShip, t: "Ready to ship", go: "constellation" },
  ].map((r) => `<button type="button" class="rh-need${r.n ? " hot" : ""}" data-goto="${r.go}"><span class="rh-n">${r.n}</span><span class="rh-t">${r.t}</span><span class="rh-go" aria-hidden="true">›</span></button>`).join("");

  const recent = [...items].sort((a, b) => (Date.parse(b.createdAt || 0) || 0) - (Date.parse(a.createdAt || 0) || 0)).slice(0, 8);
  const latest = recent.length
    ? `<div class="rh-sec">Latest in</div><div class="rh-strip">${recent.map((it) => cardHtml(it)).join("")}</div>`
    : "";

  host.innerHTML = `
    <section class="rh" aria-label="Home">
      <div class="rh-head">
        <div>
          <div class="rh-val" id="vhValue">${ctx.money(lastValue == null ? 0 : lastValue)}</div>
          <div class="rh-sub">${items.length ? `${items.length} items on the line · ${live} live` : "Nothing on the line yet. Snap a photo in Scouter."}</div>
        </div>
        <button type="button" class="rh-scan" data-goto="scouter">Scan</button>
      </div>
      <div class="rh-map" role="group" aria-label="Pile to doorstep">
        <svg viewBox="0 0 360 270" preserveAspectRatio="none" aria-hidden="true">
          <defs><filter id="rhb" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter></defs>
          <g class="rh-streets"><path d="M-10,60 C80,90 140,40 240,70 S360,40 380,60"/><path d="M-10,150 C60,130 120,170 200,150 S330,170 380,140"/><path d="M-10,240 C90,220 160,260 250,236 S350,250 380,230"/><path d="M60,-10 C70,60 40,120 70,190 S60,260 70,290"/><path d="M170,-10 C150,60 190,110 160,180 S190,250 176,290"/><path d="M280,-10 C300,50 270,120 300,190 S280,250 296,290"/></g>
          <path d="${d}" class="rh-glow" filter="url(#rhb)"/>
          <path d="${d}" class="rh-line"/>
          <path d="${d}" class="rh-flow"/>
        </svg>
        ${nodes}
      </div>
      <div class="rh-sec">Needs you</div>
      <div class="rh-needs">${needs}</div>
      ${latest}
    </section>`;
  countUp(document.getElementById("vhValue"), value);

  host.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => ctx.navigate(b.dataset.goto)));
  host.querySelectorAll("[data-stage]").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.stage;
    ctx.navigate("constellation");
    requestAnimationFrame(() => openStage(id, b));
  }));
  host.querySelectorAll(".rt-card").forEach(cardClick);
}

/* ---------- Route (constellation tree) ---------- */
export function renderLine() {
  const root = document.getElementById("roadClusters");
  if (!root || !ctx) return;
  const { state, PHASES } = ctx;
  const by = byPhase();
  const moved = state.justMovedId;
  state.justMovedId = null;

  root.innerHTML = `<div class="rt">${PHASES.map((p) => {
    const list = by[p.id];
    const val = list.reduce((s, it) => s + worth(it), 0);
    const seg = p.id === "sold" ? `<div class="rt-seg"><span>Shipping tracker</span></div>` : "";
    return `${seg}<section class="rt-stage${list.length ? "" : " empty"}" data-drop="${p.id}" aria-label="${p.label}">
      <button type="button" class="rt-node" data-stage="${p.id}" aria-label="Zoom into ${p.label}"><b>${list.length}</b></button>
      <div class="rt-body">
        <button type="button" class="rt-head" data-stage="${p.id}"><span class="rt-name">${p.label}</span><span class="rt-val">${list.length ? ctx.money(val) : "Empty"}</span><span class="rt-zoom" aria-hidden="true">⤢</span></button>
        ${list.length ? `<div class="rt-strip">${list.map((it) => cardHtml(it, moved === it.id ? " land" : "")).join("")}</div>` : `<div class="rt-none">Hold a card and drop it here</div>`}
      </div></section>`;
  }).join("")}</div>`;

  root.querySelectorAll("[data-stage]").forEach((b) => b.addEventListener("click", () => openStage(b.dataset.stage, b)));
  root.querySelectorAll(".rt-card").forEach(cardClick);
}

/* ---------- stage zoom (zoom in to a stage, back out) ---------- */
export function openStage(id, from) {
  if (!ctx) return;
  closeStage(true);
  closeCard(true);
  const p = ctx.PHASES.find((x) => x.id === id);
  if (!p) return;
  const list = byPhase()[id];
  const val = list.reduce((s, it) => s + worth(it), 0);
  const el = document.createElement("div");
  el.id = "rzStage";
  el.className = "rz-stage";
  el.innerHTML = `<div class="rz-sheet" role="dialog" aria-label="${p.label}">
    <div class="rz-bar"><button type="button" class="rz-back" aria-label="Back to route">‹ Route</button>
      <div class="rz-title"><b>${p.label}</b><span>${list.length} ${list.length === 1 ? "item" : "items"} · ${ctx.money(val)}</span></div></div>
    ${list.length ? `<div class="rz-grid">${list.map((it) => cardHtml(it)).join("")}</div>` : `<div class="rz-empty">Nothing in ${p.label} yet.<br>Hold a card on the route and drop it on this stage.</div>`}
  </div>`;
  const r = from && from.getBoundingClientRect();
  if (r) { el.style.setProperty("--ox", `${r.left + r.width / 2}px`); el.style.setProperty("--oy", `${r.top + r.height / 2}px`); }
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  el.querySelector(".rz-back").addEventListener("click", () => closeStage());
  el.addEventListener("click", (e) => { if (e.target === el) closeStage(); });
  el.querySelectorAll(".rt-card").forEach(cardClick);
  el.querySelector(".rz-back").focus({ preventScroll: true });
}

export function closeStage(instant) {
  const el = document.getElementById("rzStage");
  if (!el) return false;
  if (instant || reduce()) { el.remove(); return true; }
  el.classList.remove("in");
  setTimeout(() => el.remove(), 260);
  return true;
}

/* ---------- card zoom: the card flies up from where it sits, and flies back ---------- */
let cardFrom = null;
export function openCard(id, srcEl) {
  if (!ctx) return;
  const it = ctx.state.items.find((x) => x.id === id);
  if (!it) return;
  closeCard(true);
  const { PHASES, phaseFromItem } = ctx;
  const ph = phaseFromItem(it);
  const idx = PHASES.findIndex((p) => p.id === ph);
  const next = PHASES[idx + 1];
  const src = photoOf(it);
  const paid = (Number(it.purchasePrice) || 0) * (Number(it.quantity) || 1);
  const profit = worth(it) - paid;
  const tIdx = TRACK.findIndex(([k]) => k === ph);
  const track = tIdx >= 0
    ? `<div class="rz-track" aria-label="Shipping tracker">${TRACK.map(([, l], i) => `<span class="${i <= tIdx ? "done" : ""}${i === tIdx ? " now" : ""}"><i></i><em>${l}</em></span>`).join("")}</div>`
    : "";
  const chips = PHASES.map((p) => `<button type="button" class="rz-chip${p.id === ph ? " cur" : ""}" data-to="${p.id}">${p.label}</button>`).join("");

  const el = document.createElement("div");
  el.id = "rzCard";
  el.className = "rz-card-wrap";
  el.innerHTML = `<div class="rz-card" role="dialog" aria-label="${esc(nameOf(it))}"><div class="rz-tilt">
    <button type="button" class="rz-x" aria-label="Close">×</button>
    <div class="rz-art">${src ? `<img src="${src}" alt="">` : `<b>${initial(it)}</b>`}<span class="rz-sheen"></span></div>
    <div class="rz-info">
      <div class="rz-stage-l">${(PHASES[idx] || {}).label || ""}</div>
      <div class="rz-name">${esc(nameOf(it))}</div>
      <div class="rz-price">${ctx.money(worth(it))}</div>
      <div class="rz-sub">${paid ? `Paid ${ctx.money(paid)} · ${profit >= 0 ? "+" : "−"}${ctx.money(Math.abs(profit))}` : "No purchase price yet"}</div>
    </div>
    ${track}
    <div class="rz-chips" aria-label="Move to">${chips}</div>
    <div class="rz-actions">
      ${next ? `<button type="button" class="rz-btn pri" data-act="next">${NEXT_LABEL[ph] || "Move forward"}</button>` : ""}
      <button type="button" class="rz-btn" data-act="open">Open details</button>
    </div></div></div>`;
  document.body.appendChild(el);
  const card = el.querySelector(".rz-card");
  const tilt = el.querySelector(".rz-tilt");

  cardFrom = srcEl && document.body.contains(srcEl) ? srcEl : null;
  const to = card.getBoundingClientRect();
  card.style.transition = "none";
  if (cardFrom && !reduce()) {
    const f = cardFrom.getBoundingClientRect();
    const s = Math.max(0.2, f.width / to.width);
    card.style.transform = `translate(${f.left + f.width / 2 - (to.left + to.width / 2)}px,${f.top + f.height / 2 - (to.top + to.height / 2)}px) scale(${s})`;
    cardFrom.classList.add("lifted");
  } else {
    card.style.transform = "scale(.92)";
    card.style.opacity = "0";
  }
  void card.offsetWidth;
  requestAnimationFrame(() => {
    el.classList.add("in");
    card.style.transition = "";
    card.style.transform = "";
    card.style.opacity = "";
  });

  tilt.addEventListener("pointermove", (e) => {
    const r = tilt.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    tilt.style.setProperty("--rx", (-py * 10).toFixed(1) + "deg");
    tilt.style.setProperty("--ry", (px * 12).toFixed(1) + "deg");
    tilt.style.setProperty("--sx", (px * 100 + 50).toFixed(0) + "%");
  });
  tilt.addEventListener("pointerleave", () => { tilt.style.removeProperty("--rx"); tilt.style.removeProperty("--ry"); });

  el.addEventListener("click", (e) => { if (e.target === el) closeCard(); });
  el.querySelector(".rz-x").addEventListener("click", () => closeCard());
  el.querySelector('[data-act="open"]').addEventListener("click", () => { closeCard(true); closeStage(true); ctx.openSheet(id); });
  const nx = el.querySelector('[data-act="next"]');
  if (nx) nx.addEventListener("click", () => { closeCard(true); closeStage(true); ctx.moveItemToPhase(id, next.id); });
  el.querySelectorAll("[data-to]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.to === ph) return;
    closeCard(true); closeStage(true); ctx.moveItemToPhase(id, b.dataset.to);
  }));
  el.querySelector(".rz-x").focus({ preventScroll: true });
}
export const openReadout = openCard;

export function closeCard(instant) {
  const el = document.getElementById("rzCard");
  if (!el) return false;
  const from = cardFrom;
  cardFrom = null;
  const unlift = () => document.querySelectorAll(".rt-card.lifted").forEach((c) => c.classList.remove("lifted"));
  if (instant || reduce()) { el.remove(); unlift(); return true; }
  const card = el.querySelector(".rz-card");
  el.classList.remove("in");
  if (from && document.body.contains(from)) {
    const to = card.getBoundingClientRect();
    const f = from.getBoundingClientRect();
    const s = Math.max(0.2, f.width / to.width);
    card.style.transform = `translate(${f.left + f.width / 2 - (to.left + to.width / 2)}px,${f.top + f.height / 2 - (to.top + to.height / 2)}px) scale(${s})`;
  } else {
    card.style.transform = "scale(.92)";
    card.style.opacity = "0";
  }
  el.classList.add("out");
  setTimeout(() => { el.remove(); unlift(); }, 320);
  return true;
}

/* ---------- hold a card, carry it, drop it on a stage ---------- */
function bindDrag() {
  let tray = null;
  let st = null;
  const fillTray = () => {
    if (!tray) { tray = document.createElement("div"); tray.id = "rtTray"; tray.setAttribute("aria-hidden", "true"); document.body.appendChild(tray); }
    const by = byPhase();
    tray.innerHTML = ctx.PHASES.map((p) => `<span class="rt-chip" data-drop="${p.id}"><b>${by[p.id].length}</b>${p.label}</span>`).join("");
  };
  const place = () => {
    if (!st || !st.ghost) return;
    st.ghost.style.transform = `translate(${st.x - st.dx}px,${st.y - st.dy}px) scale(1.06) rotate(-2deg)`;
    const t = document.elementFromPoint(st.x, st.y);
    const z = t && t.closest ? t.closest("[data-drop]") : null;
    document.querySelectorAll(".drop-hint").forEach((n) => n !== z && n.classList.remove("drop-hint"));
    if (z) z.classList.add("drop-hint");
    st.zone = z ? z.dataset.drop : null;
    st.scroll = 0;
    if (!document.getElementById("rzStage")) {
      if (st.y < 110) st.scroll = -10;
      else if (st.y > window.innerHeight - 190) st.scroll = 10;
    }
  };
  const loop = () => {
    if (!st || !st.on) return;
    if (st.scroll) { const sc = document.querySelector(".hud-main"); if (sc) { sc.scrollTop += st.scroll; place(); } }
    st.raf = requestAnimationFrame(loop);
  };
  const start = () => {
    if (!st || st.on) return;
    st.on = true;
    const r = st.el.getBoundingClientRect();
    const g = st.el.cloneNode(true);
    g.className = "rt-card rt-ghost";
    g.removeAttribute("data-item");
    g.style.width = r.width + "px";
    g.style.height = r.height + "px";
    document.body.appendChild(g);
    st.ghost = g;
    st.dx = st.x - r.left;
    st.dy = st.y - r.top;
    st.el.classList.add("dragging-src");
    document.body.classList.add("rt-dragging");
    fillTray();
    tray.classList.add("on");
    place();
    loop();
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (_) { /* ignore */ } }
  };
  const end = (drop) => {
    if (!st) return;
    clearTimeout(st.timer);
    cancelAnimationFrame(st.raf);
    const { on, id, zone } = st;
    if (st.ghost) st.ghost.remove();
    if (st.el) st.el.classList.remove("dragging-src");
    document.body.classList.remove("rt-dragging");
    if (tray) tray.classList.remove("on");
    document.querySelectorAll(".drop-hint").forEach((n) => n.classList.remove("drop-hint"));
    st = null;
    if (on) {
      dragged = Date.now();
      setTimeout(() => { dragged = 0; }, 350);
      if (drop && zone) { closeCard(true); closeStage(true); ctx.moveItemToPhase(id, zone); }
    }
  };

  document.addEventListener("pointerdown", (e) => {
    if (!ctx || (e.pointerType === "mouse" && e.button !== 0)) return;
    const el = e.target.closest && e.target.closest(".rt-card[data-item]");
    if (!el || el.closest("#rzCard")) return;
    st = { el, id: el.dataset.item, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, on: false, pid: e.pointerId, touch: e.pointerType !== "mouse" };
    st.timer = setTimeout(start, 300);
  });
  document.addEventListener("pointermove", (e) => {
    if (!st || e.pointerId !== st.pid) return;
    st.x = e.clientX; st.y = e.clientY;
    if (!st.on) {
      if (Math.hypot(st.x - st.sx, st.y - st.sy) > 9) {
        if (st.touch) { clearTimeout(st.timer); st = null; }   /* finger moved first: that's a scroll */
        else start();
      }
      return;
    }
    place();
  });
  document.addEventListener("pointerup", (e) => { if (st && e.pointerId === st.pid) end(true); });
  document.addEventListener("pointercancel", (e) => { if (st && e.pointerId === st.pid) end(false); });
  /* once a hold has started, the page must not scroll under the finger */
  document.addEventListener("touchmove", (e) => { if (st && st.on) e.preventDefault(); }, { passive: false });
  document.addEventListener("contextmenu", (e) => { if (e.target.closest && e.target.closest(".rt-card")) e.preventDefault(); });
}
