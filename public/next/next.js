import { phaseFromItem } from "/visor/phases.js?v=3";

const LS_ITEMS = "coalition-items-v4";
const LS_AVATAR = "cdsc-avatar";
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nameOf = (it) => it.title || it.productName || "Untitled";
const photoOf = (it) => (it.photos && it.photos[0] && (it.photos[0].dataUrl || it.photos[0].url)) || "";
const worth = (it) => (Number(it.price) || 0) * (Number(it.quantity) || 1);
const CLASSIC = "/hud.html";

/* ---------- data ---------- */
function loadItems() { try { const v = JSON.parse(localStorage.getItem(LS_ITEMS) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
function saveItems(items) { try { localStorage.setItem(LS_ITEMS, JSON.stringify(items)); } catch { toast("Couldn't save. Storage is full."); } }
let items = loadItems();

const STOPS = [
  { id: "intake", label: "Photos in", note: "not identified yet", phases: ["intake"], c: "#B3FBD5", pos: [12, 76], movable: true },
  { id: "staged", label: "Ready to list", note: "listing not built yet", phases: ["staged"], c: "#B3FBD5", pos: [34, 48], movable: true },
  { id: "listed", label: "Live on eBay", note: "selling now", phases: ["listed"], c: "#90FFEE", pos: [57, 72], movable: false },
  { id: "sold", label: "Sold", note: "needs packing", phases: ["sold", "packed"], c: "#E8924A", pos: [78, 40], movable: true },
  { id: "shipped", label: "Shipped", note: "on the way", phases: ["shipped", "delivered"], c: "#E8924A", pos: [92, 66], movable: true },
];
const MOVE_TO = { intake: "intake", staged: "staged", sold: "sold", shipped: "shipped" };

function groups() {
  const g = Object.fromEntries(STOPS.map((s) => [s.id, []]));
  for (const it of items) {
    const ph = phaseFromItem(it);
    const s = STOPS.find((x) => x.phases.includes(ph));
    if (s) g[s.id].push(it);
  }
  return g;
}

/* ---------- toast / sheet ---------- */
let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600); }
function closeSheet() { $("#sheet").hidden = true; $("#sheetBack").hidden = true; }
function openSheet(html) {
  const s = $("#sheet"); s.innerHTML = `<button class="x" aria-label="Close" data-close>×</button>${html}`; s.hidden = false; $("#sheetBack").hidden = false;
  s.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeSheet));
  s.scrollTop = 0;
  return s;
}
$("#sheetBack").addEventListener("click", closeSheet);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

function itemSheet(id) {
  const it = items.find((i) => String(i.id) === String(id)); if (!it) return;
  const src = photoOf(it); const ph = phaseFromItem(it); const st = STOPS.find((s) => s.phases.includes(ph));
  const s = openSheet(`
    <a class="back" href="#" data-close>‹ Back</a>
    ${src ? `<img src="${esc(src)}" alt="" style="width:100%;max-height:300px;object-fit:contain;border-radius:14px;background:#0f1211;margin-bottom:12px">` : ""}
    <h2>${esc(nameOf(it))}</h2>
    <div class="sub">${st ? esc(st.label) : ph === "ended" ? "Ended on eBay" : ""}</div>
    <div class="row"><span>Price</span><span>${money(it.price)}</span></div>
    <div class="row"><span>Quantity</span><span>${Number(it.quantity) || 1}</span></div>
    ${it.purchasePrice ? `<div class="row"><span>You paid</span><span>${money(it.purchasePrice)}</span></div>` : ""}
    <a class="btn" href="${CLASSIC}">Open in the classic app</a>`);
  s.querySelector(".back").addEventListener("click", (e) => { e.preventDefault(); closeSheet(); });
}
function stageSheet(sid) {
  const stop = STOPS.find((x) => x.id === sid); const list = groups()[sid];
  const cap = 60;
  const s = openSheet(`
    <a class="back" href="#" data-close>‹ Back</a>
    <h2>${esc(stop.label)}</h2><div class="sub">${list.length} ${list.length === 1 ? "item" : "items"} · ${esc(stop.note)}</div>
    ${list.length ? `<div class="grid">${list.slice(0, cap).map((it) => { const src = photoOf(it); return `<button class="tile" data-item="${esc(it.id)}">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ""}<span class="cap">${esc(nameOf(it))}</span></button>`; }).join("")}</div>${list.length > cap ? `<p class="sub" style="margin-top:12px">Showing ${cap} of ${list.length}. Search and filters arrive with Collection.</p>` : ""}` : `<p class="sub">Nothing here yet.</p>`}`);
  s.querySelector(".back").addEventListener("click", (e) => { e.preventDefault(); closeSheet(); });
  s.querySelectorAll("[data-item]").forEach((b) => b.addEventListener("click", () => itemSheet(b.dataset.item)));
}

/* ---------- header ---------- */
function renderStats() {
  const g = groups();
  const open = items.filter((i) => !["ended", "sold", "packed", "shipped", "delivered"].includes(phaseFromItem(i)));
  const value = open.reduce((a, i) => a + worth(i), 0);
  $("#stats").innerHTML = [[money(value), "VALUE ON THE LINE"], [g.intake.length + g.staged.length, "TO WORK"], [g.listed.length, "LIVE ON EBAY"]]
    .map(([b, l]) => `<div class="stat"><b>${b}</b><span>${l}</span></div>`).join("");
}
function initAvatar() {
  try { const a = localStorage.getItem(LS_AVATAR); if (a) $("#avatarImg").src = a; } catch { /* default husky */ }
  const f = $("#avatarFile");
  $("#avatarBtn").addEventListener("click", () => f.click());
  f.addEventListener("change", () => {
    const file = f.files && f.files[0]; if (!file) return;
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d");
      const m = Math.min(img.width, img.height); x.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, 256, 256);
      const data = c.toDataURL("image/jpeg", 0.88);
      try { localStorage.setItem(LS_AVATAR, data); } catch { /* ignore */ }
      $("#avatarImg").src = data; URL.revokeObjectURL(url); toast("Profile picture saved");
    };
    img.onerror = () => toast("That file isn't an image"); img.src = url; f.value = "";
  });
}

/* ---------- Command ---------- */
const phone = () => matchMedia("(max-width:820px)").matches;
function pileHtml(list, cls) {
  if (!list.length) return `<div class="empty ${cls}">Nothing here yet</div>`;
  const top = list[0]; const src = photoOf(top);
  const face = (it, k) => { const p = photoOf(it); return `<div class="pc ${k}" ${k === "" ? `data-item="${esc(it.id)}"` : ""}>${p ? `<img src="${esc(p)}" alt="" draggable="false">` : `<div class="ini">${esc(nameOf(it).charAt(0).toUpperCase())}</div>`}${k === "" ? `<span class="cap"><span>${esc(nameOf(it))}</span><em>${money(worth(it))}</em></span>` : ""}</div>`; };
  return `<div class="pile ${cls}">${list[2] ? face(list[2], "b2") : ""}${list[1] ? face(list[1], "b1") : ""}${face(top, "")}${list.length > 1 ? `<span class="more" data-stage="${""}">+${list.length - 1} more</span>` : ""}</div>`;
}
function renderCommand() {
  const g = groups(); const main = $("#main");
  const pills = [
    [g.intake.length, "Identify new photos", "scouter"],
    [g.staged.length, "Build and publish", "channels"],
    [g.sold.length, "Pack and ship", "spaces"],
  ].map(([n, t, v]) => `<button class="pill" data-goto="${v}"><b>${n}</b>${t}</button>`).join("");
  if (phone()) {
    main.style.overflowY = "auto";
    main.innerHTML = `<div class="road v" style="position:relative;padding:4px 0 24px 34px"><div class="dock">${pills}</div>
      <div style="position:absolute;left:12px;top:14px;bottom:70px;width:3px;border-radius:3px;background:linear-gradient(#50B97E,#B3FBD5 60%,#E8924A);box-shadow:0 0 14px rgba(144,255,204,.6)"></div>
      ${STOPS.map((s) => `<section class="stop" data-drop="${s.id}" style="position:relative;transform:none;margin-bottom:26px;--c:${s.c}">
        <div class="dot" style="position:absolute;left:-30px;top:6px;margin:0"></div>
        <div class="tag" style="position:static;transform:none;text-align:left;margin-bottom:10px" data-stage="${s.id}"><b>${g[s.id].length}</b><span>${s.label}</span><small>${s.note}</small></div>
        <div style="position:relative;height:${g[s.id].length ? 170 : 90}px;width:130px">${g[s.id].length ? pileHtml(g[s.id], "").replace('class="pile ', 'style="left:0;transform:none;width:112px;height:156px" class="pile ') : `<div class="empty" style="position:static;transform:none;width:130px;height:80px">Nothing here yet</div>`}</div>
      </section>`).join("")}
      </div>`;
  } else {
    main.style.overflowY = "hidden";
    const pts = STOPS.map((s) => s.pos);
    const path = pts.map((p, i) => `${i ? "L" : "M"}${p[0] * 10},${p[1] * 6}`).join(" ");
    main.innerHTML = `<div class="road"><svg viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stop-color="#50B97E"/><stop offset=".55" stop-color="#B3FBD5"/><stop offset="1" stop-color="#E8924A"/></linearGradient></defs>
      <path d="${path}" fill="none" stroke="#90FFCC" stroke-opacity=".4" stroke-width="11" vector-effect="non-scaling-stroke" style="filter:blur(7px)"/>
      <path d="${path}" fill="none" stroke="url(#rg)" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>
      ${STOPS.map((s) => `<div class="stop" data-drop="${s.id}" style="left:${s.pos[0]}%;top:${s.pos[1]}%;--c:${s.c}">
        ${pileHtml(g[s.id], "up")}<div class="dot" data-stage="${s.id}" role="button" tabindex="0" aria-label="${s.label}, ${g[s.id].length} items"></div>
        <div class="tag" data-stage="${s.id}"><b>${g[s.id].length}</b><span>${s.label}</span><small>${s.note}</small></div></div>`).join("")}
      <div class="dock">${pills}</div><div class="hint">Tap a stop to open it · hold a card and drop it on a stop to move it</div></div>`;
  }
  // wire up
  main.querySelectorAll(".more").forEach((m) => { const st = m.closest(".stop"); m.dataset.stage = st.dataset.drop; });
  main.querySelectorAll("[data-stage]").forEach((el) => el.addEventListener("click", () => stageSheet(el.dataset.stage)));
  main.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => go(b.dataset.goto)));
  main.querySelectorAll(".stop .dot").forEach((d) => d.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); stageSheet(d.dataset.stage); } }));
  main.querySelectorAll(".pc[data-item]").forEach(bindDrag);
}
function bindDrag(el) {
  let ghost = null, sx = 0, sy = 0, moved = false, over = null, down = false;
  el.addEventListener("pointerdown", (e) => { down = true; moved = false; sx = e.clientX; sy = e.clientY; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointermove", (e) => {
    if (!down) return;
    if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) < 8) return;
    if (!moved) { moved = true; ghost = el.cloneNode(true); ghost.className = "pc ghost"; document.body.appendChild(ghost); el.style.opacity = ".3"; }
    ghost.style.left = e.clientX + "px"; ghost.style.top = e.clientY + "px";
    const hit = document.elementsFromPoint(e.clientX, e.clientY).map((n) => n.closest && n.closest(".stop")).find(Boolean);
    if (over && over !== hit) over.classList.remove("drop"); over = hit || null; if (over) over.classList.add("drop");
  });
  const end = (e) => {
    if (!down) return; down = false;
    try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!moved) { itemSheet(el.dataset.item); return; }
    const target = over && over.dataset.drop; if (over) over.classList.remove("drop"); if (ghost) ghost.remove(); el.style.opacity = "";
    if (!target) return;
    const it = items.find((i) => String(i.id) === String(el.dataset.item)); if (!it) return;
    if (!MOVE_TO[target]) { toast("Use Build and publish to put an item live on eBay."); return; }
    it.phase = MOVE_TO[target]; saveItems(items); toast(`Moved to ${STOPS.find((s) => s.id === target).label}`); render();
  };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
}

/* ---------- other views ---------- */
const NEXT_UP = {
  scouter: ["Scouter", "Your photo tool, built for one hand on your phone, with a big drop zone on desktop. Built next. Until then the classic Scouter works."],
  collection: ["Collection", "Sealed and singles as interactive cards. Built after Scouter. The classic Collection still works."],
  channels: ["Channels", "Grid views, filters and bulk actions. Built after Collection. The classic Channels still works."],
  spaces: ["Spaces", "Auto-grouped so you never sort 500 listings by hand. Built after Channels. The classic Spaces still works."],
};
function renderSettings() {
  $("#main").style.overflowY = "auto";
  $("#main").innerHTML = `<div class="card-panel"><h2>Settings</h2><p>Your profile picture is the round picture at the top right. Tap it any time to change it.</p>
    <button class="btn" id="chg">Change profile picture</button>
    <div class="badges"><img src="img/veteran.jpg" alt="Veteran-Owned Coalition"><img src="img/pristine.jpg" alt="Pristine 10"><img src="img/husky.jpg" alt="The Coalition team"></div>
    <img src="img/plate.jpg" alt="" style="width:100%;max-width:420px;border-radius:16px;margin-top:18px;border:1px solid var(--edge)">
    <img src="img/wordmark.jpg" alt="CornDogSmuggler Coalition" style="width:100%;max-width:560px;border-radius:16px;margin-top:14px;border:1px solid var(--edge)">
    <p style="margin-top:14px">Classic settings (eBay, Misprint, Double Holo) are still in the <a class="btn" href="${CLASSIC}">classic app</a></p></div>`;
  $("#chg").addEventListener("click", () => $("#avatarBtn").click());
}
function renderPlaceholder(v) {
  const [t, d] = NEXT_UP[v]; $("#main").style.overflowY = "auto";
  $("#main").innerHTML = `<div class="card-panel"><h2>${t}</h2><p>${d}</p><a class="btn" href="${CLASSIC}">Open the classic ${t}</a><button class="btn" data-goto="command">‹ Back to Command</button></div>`;
  $("#main").querySelector("[data-goto]").addEventListener("click", () => go("command"));
}

/* ---------- router ---------- */
let view = "command";
function go(v) {
  view = v; closeSheet();
  document.querySelectorAll("#nav button").forEach((b) => { b.classList.toggle("on", b.dataset.view === v); if (b.dataset.view === v) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  try { history.replaceState(null, "", v === "command" ? "./" : `#${v}`); } catch { /* ignore */ }
  render();
}
function render() {
  items = loadItems(); renderStats();
  if (view === "command") renderCommand(); else if (view === "settings") renderSettings(); else renderPlaceholder(view);
}
document.querySelectorAll("#nav button").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));
addEventListener("resize", (() => { let t; let last = phone(); return () => { clearTimeout(t); t = setTimeout(() => { if (phone() !== last) { last = phone(); render(); } }, 150); }; })());
addEventListener("storage", () => render());
initAvatar();
const h = (location.hash || "").slice(1);
go(["scouter", "collection", "channels", "spaces", "settings"].includes(h) ? h : "command");
