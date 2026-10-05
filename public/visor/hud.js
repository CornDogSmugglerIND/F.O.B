/* Route HUD: Home map, the Route (constellation), stage zoom, card zoom, touch drag.
 * Pure rendering. coalition.js passes state + actions in through initHud(ctx). */

const NEXT_LABEL = { intake: "Stage it", staged: "Mark listed", listed: "Mark sold", sold: "Mark packed", packed: "Mark shipped", shipped: "Mark delivered" };
const TURL = { USPS: "https://tools.usps.com/go/TrackConfirmAction?tLabels=", UPS: "https://www.ups.com/track?tracknum=", FedEx: "https://www.fedex.com/fedextrack/?trknbr=" };
const TRACK = [["sold", "Sold"], ["packed", "Packed"], ["shipped", "In transit"], ["delivered", "Doorstep"]];
/* the Home route: seven stops climbing from the pile to the doorstep (viewBox 360 x 270) */
const STOPS = [[44, 96], [200, 208], [296, 320], [120, 432], [48, 544], [200, 656], [296, 748]];
const SIDE = [1, -1, -1, 1, 1, -1, -1]; /* cards float on the open side of each stop */
const MAP_W = 360, MAP_H = 800;

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
  setTimeout(initPremium, 0);
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

/* street network for the map backdrop (deterministic) */
function streets() {
  let seed = 7;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out = [];
  for (let i = 0; i < 40; i++) {
    const x = r() * 420 - 30, y = r() * 860 - 30, a = [0, 0.5, 1.57, 1.1, -0.6][Math.floor(r() * 5)] + (r() - 0.5) * 0.2, l = 80 + r() * 260;
    const mx = x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 30, my = y + Math.sin(a) * l * 0.5 + (r() - 0.5) * 30;
    out.push(`M${x.toFixed(0)},${y.toFixed(0)} Q${mx.toFixed(0)},${my.toFixed(0)} ${(x + Math.cos(a) * l).toFixed(0)},${(y + Math.sin(a) * l).toFixed(0)}`);
  }
  return out.map((d, i) => `<path d="${d}"${i % 6 === 0 ? ' class="av"' : ''}/>`).join("");
}

/* path through the stops (straight legs, round joins: reads like a driving route) */
function routePath(pts) {
  return pts.map((p, i) => (i ? "L" : "M") + p[0] + "," + p[1]).join(" ");
}
function routePathOld(pts) {
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
    const side = SIDE[i];
    const stack = list.slice(0, 3).map((it, k) => {
      const src = photoOf(it);
      const q = Number(it.quantity) || 1;
      return `<button type="button" class="rt-card rm-card k${k}" data-item="${esc(it.id)}" aria-label="${esc(nameOf(it))}" style="--k:${k};--side:${side}">
        <span class="rt-face">${src ? `<img src="${src}" alt="" draggable="false">` : `<b class="rt-ini">${initial(it)}</b>`}
        ${q > 1 ? `<span class="rt-q">\u00d7${q}</span>` : ""}
        <span class="rt-cap"><span>${esc(nameOf(it))}</span><b>${ctx.money(worth(it))}</b></span></span></button>`;
    }).reverse().join("");
    const more = list.length > 3 ? `<span class="rm-more" style="--side:${side}">+${list.length - 3}</span>` : "";
    return `<div class="rm-stop${list.length ? " on" : ""}" data-drop="${p.id}" style="left:${(x / MAP_W * 100).toFixed(2)}%;top:${(y / MAP_H * 100).toFixed(2)}%">
      <span class="rm-zone"></span>
      <button type="button" class="rm-pin" data-stage="${p.id}" aria-label="${p.label}, ${list.length} items"><i></i><span class="rm-name">${p.label}${list.length ? ` <b>${list.length}</b>` : ""}</span></button>
      <span class="rm-cards" style="--side:${side}">${stack}${more}</span>
    </div>`;
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
      </div>
      <div class="rm" id="rhMap" role="group" aria-label="Pile to doorstep">
        <svg viewBox="0 0 ${MAP_W} ${MAP_H}" preserveAspectRatio="none" aria-hidden="true">
          <defs><filter id="rhb" x="-20%" y="-10%" width="140%" height="120%"><feGaussianBlur stdDeviation="6"/></filter>
            <path id="rhroute" d="${d}"/></defs>
          <g class="rm-streets">${streets()}</g>
          <path d="${d}" class="rh-glow" filter="url(#rhb)"/>
          <path d="${d}" class="rh-line"/>
          <path d="${d}" class="rh-flow"/>
          <polygon points="-7,-6 8,0 -7,6 -3,0" class="rm-arrow"><animateMotion dur="9s" repeatCount="indefinite" rotate="auto"><mpath href="#rhroute"/></animateMotion></polygon>
        </svg>
        ${nodes}
        <svg class="rm-end" viewBox="0 0 24 32" style="left:${(STOPS[6][0] / MAP_W * 100).toFixed(2)}%;top:${(STOPS[6][1] / MAP_H * 100).toFixed(2)}%" aria-hidden="true"><path d="M12 1C6 1 2 5.5 2 11c0 7 10 19 10 19s10-12 10-19C22 5.5 18 1 12 1z" fill="#fff"/><circle cx="12" cy="11" r="4" fill="#0b0c10"/></svg>
      </div>
      <div class="rh-hint">Hold a card, then drop it on a stop to move it</div>
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
  const rm = document.getElementById("rhMap");
  if (rm) rm.addEventListener("pointermove", (e) => {
    const r = rm.getBoundingClientRect();
    rm.style.setProperty("--px", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    rm.style.setProperty("--py", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  }, { passive: true });
}

/* ---------- Route (constellation tree) ---------- */
export function renderLine() {
  const root = document.getElementById("roadClusters");
  if (!root || !ctx) return;
  const { state, PHASES } = ctx;
  const by = byPhase();
  const moved = state.justMovedId;
  state.justMovedId = null;

  const total = PHASES.reduce((n, p) => n + by[p.id].length, 0) || 1;
  let mode = "across";
  try { mode = localStorage.getItem("fob-tree-mode") || "across"; } catch (e) {}
  root.innerHTML = `<div class="rt-mode" role="group" aria-label="Tree direction"><button type="button" data-tmode="across" class="${mode === "across" ? "on" : ""}">Across</button><button type="button" data-tmode="down" class="${mode === "down" ? "on" : ""}">Down</button></div><div class="rt ${mode}">${PHASES.map((p, i) => {
    const list = by[p.id];
    const val = list.reduce((s, it) => s + worth(it), 0);
    const nx = PHASES[i + 1];
    const seg = p.id === "sold" ? `<div class="rt-seg"><span>Shipping tracker</span></div>` : "";
    const pct = Math.round((list.length / total) * 100);
    return `${seg}<section class="rt-stage${list.length ? "" : " empty"}" data-drop="${p.id}" aria-label="${p.label}">
      <button type="button" class="rt-node" data-stage="${p.id}" aria-label="Zoom into ${p.label}"><b>${list.length}</b></button>
      <div class="rt-body rt-step">
        <button type="button" class="rt-head" data-stage="${p.id}"><span class="rt-sq">${i + 1}</span><span class="rt-name">${p.label}</span><span class="rt-count">${list.length}</span><span class="rt-val">${list.length ? ctx.money(val) : "Empty"}</span><span class="rt-zoom" aria-hidden="true">⤢</span></button>
        <div class="rt-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
        ${list.length ? `<div class="rt-strip">${list.map((it) => cardHtml(it, moved === it.id ? " land" : "")).join("")}</div>` : `<div class="rt-none">Hold a card and drop it here</div>`}
        <div class="rt-acts">
          <button type="button" class="rt-act" data-stage="${p.id}">Zoom in</button>
          ${list.length && nx ? `<button type="button" class="rt-act pri" data-adv="${list[0].id}" data-to="${nx.id}">${NEXT_LABEL[p.id] || "Move forward"}</button>` : ""}
        </div>
      </div></section>`;
  }).join("")}</div>`;

  root.querySelectorAll("[data-tmode]").forEach((b) => b.addEventListener("click", () => { try { localStorage.setItem("fob-tree-mode", b.dataset.tmode); } catch (e) {} renderLine(); }));
  root.querySelectorAll("[data-adv]").forEach((b) => b.addEventListener("click", () => ctx.moveItemToPhase(b.dataset.adv, b.dataset.to)));
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
  const evAt = (pid) => {
    const e = (Array.isArray(it.events) ? it.events : []).filter((x) => x.phase === pid).pop();
    return e ? new Date(e.at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
  };
  const journey = `<ol class="rz-journey" aria-label="Item journey">${PHASES.map((p, i) => `<li class="${i < idx ? "done" : ""}${i === idx ? " now" : ""}"><i></i><b>${p.label}</b><em>${evAt(p.id) || (i === idx ? "now" : "")}</em></li>`).join("")}</ol>`;
  const tr = it.tracking || {};
  const track = idx >= PHASES.findIndex((p) => p.id === "sold")
    ? `<div class="rz-trk"><div class="rz-trk-row">
        <select class="rz-carrier" aria-label="Carrier">${["USPS", "UPS", "FedEx", "Other"].map((c) => `<option${tr.carrier === c ? " selected" : ""}>${c}</option>`).join("")}</select>
        <input class="rz-tnum" inputmode="text" autocomplete="off" placeholder="Tracking number" value="${esc(tr.number || "")}" aria-label="Tracking number"></div>
        <div class="rz-trk-row"><button type="button" class="rz-btn" data-act="savetrk">Save tracking</button><button type="button" class="rz-btn" data-act="track"${tr.number && TURL[tr.carrier] ? "" : " disabled"}>Track package</button></div></div>`
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
    ${journey}
    ${track}
    <div class="rz-chips" aria-label="Move to">${chips}</div>
    <div class="rz-actions">
      ${next ? `<button type="button" class="rz-btn pri" data-act="next">${NEXT_LABEL[ph] || "Move forward"}</button>` : ""}
      <button type="button" class="rz-btn" data-act="open">${idx <= 2 ? "Identify &amp; list" : "Details"}</button>
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
  const sv = el.querySelector('[data-act="savetrk"]');
  const tk = el.querySelector('[data-act="track"]');
  const upd = () => { const c = el.querySelector(".rz-carrier").value, n = el.querySelector(".rz-tnum").value.trim(); if (tk) tk.disabled = !(n && TURL[c]); };
  if (sv) {
    el.querySelector(".rz-carrier").addEventListener("change", upd);
    el.querySelector(".rz-tnum").addEventListener("input", upd);
    sv.addEventListener("click", () => {
      it.tracking = { carrier: el.querySelector(".rz-carrier").value, number: el.querySelector(".rz-tnum").value.trim() };
      if (ctx.saveItems) ctx.saveItems();
      if (ctx.toast) ctx.toast("Tracking saved");
      upd();
    });
    tk.addEventListener("click", () => { const t = it.tracking || {}; if (t.number && TURL[t.carrier]) window.open(TURL[t.carrier] + encodeURIComponent(t.number), "_blank", "noopener"); });
  }
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
    if (st.el) st.el.classList.remove("dragging-src", "holding");
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
    el.classList.add("holding");
    st.timer = setTimeout(start, 300);
  });
  document.addEventListener("pointermove", (e) => {
    if (!st || e.pointerId !== st.pid) return;
    st.x = e.clientX; st.y = e.clientY;
    if (!st.on) {
      if (Math.hypot(st.x - st.sx, st.y - st.sy) > 9) {
        if (st.touch) { clearTimeout(st.timer); st.el.classList.remove("holding"); st = null; }   /* finger moved first: that's a scroll */
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


/* ---------- premium layer: tilt on every card-like surface, bins show their items ---------- */
const TILT = ".rt-card, .inv-tile, .channel-card, .space-node, .pkg";
function bindTilt() {
  if (window.__hudTilt || reduce()) return;
  window.__hudTilt = true;
  document.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch" || e.buttons) return;
    const t = e.target.closest && e.target.closest(TILT);
    if (!t || t.closest("#rzCard")) return;
    const r = t.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    t.classList.add("tiltable", "tilting");
    t.style.setProperty("--ty", `${(px * 12).toFixed(1)}deg`);
    t.style.setProperty("--tx", `${(-py * 12).toFixed(1)}deg`);
  }, { passive: true });
  document.addEventListener("pointerout", (e) => {
    const t = e.target.closest && e.target.closest(TILT);
    if (t && t.classList.contains("tilting") && !t.contains(e.relatedTarget)) {
      t.classList.remove("tilting"); t.style.setProperty("--tx", "0deg"); t.style.setProperty("--ty", "0deg");
    }
  }, { passive: true });
}

function fanBins() {
  const host = document.getElementById("spacesNodes");
  if (!host || !ctx) return;
  host.querySelectorAll(".space-node[data-space]").forEach((n) => {
    if (n.querySelector(".bin-fan") || n.querySelector(".frame img")) return;
    const id = n.getAttribute("data-space");
    const pics = ctx.state.items.filter((it) => it.spaceId === id).map(photoOf).filter(Boolean).slice(0, 3);
    if (!pics.length) return;
    const fan = document.createElement("div");
    fan.className = "bin-fan n" + pics.length;
    fan.innerHTML = pics.map((u) => `<i style="background-image:url('${u}')"></i>`).join("");
    n.appendChild(fan);
  });
}

export function initPremium() {
  bindTilt();
  const host = document.getElementById("spacesNodes");
  if (host && !host.__fan) {
    host.__fan = new MutationObserver(() => { host.__fan.disconnect(); fanBins(); host.__fan.observe(host, { childList: true }); });
    host.__fan.observe(host, { childList: true });
    fanBins();
  }
}
