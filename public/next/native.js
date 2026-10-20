/* Native feel: swipe-down sheets, pull to refresh, direction-aware tab transitions. No dependencies. */
const $ = (s) => document.querySelector(s);
const phone = () => matchMedia("(max-width:820px)").matches;
const reduce = () => matchMedia("(prefers-reduced-motion:reduce)").matches;
const ORDER = ["command", "scouter", "spaces", "channels", "collection", "settings"];

/* tab direction */
const nav = $("#nav");
if (nav) nav.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-view]"); if (!b) return;
  const cur = ORDER.indexOf(($("#nav .on") || {}).dataset?.view), nxt = ORDER.indexOf(b.dataset.view), m = $("#main");
  if (m) { m.dataset.dir = nxt > cur ? "r" : nxt < cur ? "l" : ""; setTimeout(() => { m.scrollTop = 0; }, 0); }
}, true);

/* sliding highlight under the active tab */
if (nav) {
  const ind = document.createElement("i"); ind.className = "nav-ind"; nav.prepend(ind);
  const place = () => { const on = nav.querySelector("button.on"); if (!on) return; ind.style.opacity = "1"; ind.style.width = on.offsetWidth + "px"; ind.style.height = on.offsetHeight + "px"; ind.style.transform = `translate(${on.offsetLeft}px,${on.offsetTop}px)`; };
  nav.addEventListener("click", () => setTimeout(place, 0)); addEventListener("resize", place); new MutationObserver(place).observe(nav, { subtree: true, attributes: true, attributeFilter: ["class"] });
  setTimeout(place, 50); setTimeout(place, 600);
}

/* numbers count up/down instead of jumping */
const money = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const seen = new WeakMap();
const mo = new MutationObserver(() => {
  document.querySelectorAll(".cx-val b, .stat b, .cm-big, .cm-two b, .cm-big, .cm-two b").forEach((el) => {
    const txt = el.textContent.trim(); if (seen.get(el) === txt || el.dataset.anim) return;
    const isMoney = txt.startsWith("$"), to = parseFloat(txt.replace(/[^0-9.\-]/g, "")); if (!Number.isFinite(to)) return;
    const from = Number(el.dataset.last ?? 0); el.dataset.last = String(to); seen.set(el, txt);
    if (from === to) return; el.dataset.anim = "1"; const t0 = performance.now(), dur = 600;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3), v = from + (to - from) * e; el.textContent = isMoney ? money(v) : String(Math.round(v)); if (k < 1) requestAnimationFrame(step); else { el.textContent = txt; seen.set(el, txt); delete el.dataset.anim; } };
    requestAnimationFrame(step);
  });
});
mo.observe(document.body, { childList: true, subtree: true, characterData: true });

/* swipe a sheet down to close (phone) */
const sheet = $("#sheet"), back = $("#sheetBack");
if (sheet) {
  let y0 = null, dy = 0, t0 = 0;
  sheet.addEventListener("touchstart", (e) => { if (!phone() || sheet.scrollTop > 0 || e.touches.length !== 1) { y0 = null; return; } y0 = e.touches[0].clientY; dy = 0; t0 = Date.now(); sheet.style.transition = "none"; }, { passive: true });
  sheet.addEventListener("touchmove", (e) => { if (y0 == null) return; dy = e.touches[0].clientY - y0; if (dy < 0) { dy = 0; } sheet.style.transform = `translateY(${dy}px)`; if (back) back.style.opacity = String(Math.max(0, 1 - dy / 500)); }, { passive: true });
  const end = () => {
    if (y0 == null) return; const fast = dy / Math.max(1, Date.now() - t0) > 0.6; y0 = null;
    sheet.style.transition = "transform .22s cubic-bezier(.2,.8,.2,1)";
    if (dy > 120 || (fast && dy > 40)) { sheet.style.transform = "translateY(110%)"; setTimeout(() => { sheet.querySelector("[data-close]")?.click(); sheet.style.transform = ""; sheet.style.transition = ""; if (back) back.style.opacity = ""; }, 200); }
    else { sheet.style.transform = ""; if (back) back.style.opacity = ""; setTimeout(() => { sheet.style.transition = ""; }, 240); }
  };
  sheet.addEventListener("touchend", end); sheet.addEventListener("touchcancel", end);
}

/* pull down to sync (phone, scrollable tabs) */
const main = $("#main");
if (main) {
  const pill = document.createElement("div"); pill.className = "ptr"; pill.textContent = "Pull to sync"; document.body.appendChild(pill);
  let y0 = null, d = 0;
  main.addEventListener("touchstart", (e) => { const v = ($("#nav .on") || {}).dataset?.view; if (!phone() || v === "command" || main.scrollTop > 0 || e.touches.length !== 1 || !sheet.hidden || document.querySelector(".k-zoom")) { y0 = null; return; } y0 = e.touches[0].clientY; d = 0; }, { passive: true });
  main.addEventListener("touchmove", (e) => { if (y0 == null) return; d = Math.max(0, e.touches[0].clientY - y0); if (d > 8) { pill.style.opacity = String(Math.min(1, d / 90)); pill.style.transform = `translate(-50%,${Math.min(d, 110) * 0.6}px)`; pill.textContent = d > 90 ? "Release to sync" : "Pull to sync"; } }, { passive: true });
  const end = () => { if (y0 == null) return; const go = d > 90; y0 = null; pill.style.opacity = "0"; pill.style.transform = "translate(-50%,0)"; if (go) $("#syncBtn")?.click(); };
  main.addEventListener("touchend", end); main.addEventListener("touchcancel", end);
}

/* always run the newest build: if the server has a newer index, reload once */
const pin = (h) => (/next\.js\?v=(\d+)/.exec(h) || [])[1];
const mine = pin(document.documentElement.innerHTML);
export const BUILD = mine || "?";
async function fresh() {
  try {
    const r = await fetch("/next/?_=" + Date.now(), { cache: "no-store" }), t = await r.text(), v = pin(t);
    if (v && mine && v !== mine && sessionStorage.getItem("fob-reload") !== v) { sessionStorage.setItem("fob-reload", v); location.reload(); }
  } catch { /* offline */ }
}
fresh(); document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") fresh(); });
const tag = document.createElement("div"); tag.className = "build-tag"; tag.textContent = "Build " + BUILD; document.body.appendChild(tag);
