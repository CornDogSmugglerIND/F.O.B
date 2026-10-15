/* Scouter: one upload = one item. Photos preview instantly, get shrunk off the
 * hot path, nothing is saved until Save is pressed. */
const MAX_PICK = 5;
const SHRINK = 1000;      // longest side for working copy (also what Identify sends)
const STORE_SHRINK = 720; // longest side for what is stored on the item

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v) => { const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : null; };
let uid = 0;
const nid = () => `sc-${Date.now().toString(36)}-${(uid++).toString(36)}`;

function blank() {
  return { photos: [], paid: "", market: "", marketNote: "", marketState: "idle", qty: 1, title: "", identity: null, idState: "idle", idMsg: "", candidates: [], manual: false, saved: null };
}
let d = blank();
const session = []; // this sitting's scans, shown as little package cards
let ctx = null; // { host, getItems, setItems, toast, go }

/* ---------- image work: decode + resize without blocking taps ---------- */
async function shrink(file, max) {
  let bmp = null;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* fall back below */ }
  if (!bmp) {
    bmp = await new Promise((res, rej) => { const im = new Image(); const u = URL.createObjectURL(file); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = rej; im.src = u; });
  }
  const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return c.toDataURL("image/jpeg", 0.8);
}
function resizeData(dataUrl, max) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => { const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)); if (k >= 1) return res(dataUrl); const c = document.createElement("canvas"); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", 0.72)); };
    im.onerror = () => res(dataUrl); im.src = dataUrl;
  });
}
const tick = () => new Promise((r) => setTimeout(r, 0));

let queue = Promise.resolve();
function addFiles(files) {
  const imgs = [...files].filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(f.name || ""));
  if (!imgs.length) { ctx.toast("Those weren't photos."); return; }
  for (const f of imgs) {
    const p = { id: nid(), preview: URL.createObjectURL(f), data: "", picked: d.photos.filter((x) => x.picked).length < MAX_PICK, err: false };
    d.photos.push(p);
    queue = queue.then(async () => {
      try { await tick(); p.data = await shrink(f, SHRINK); } catch { p.err = true; p.picked = false; }
      paintTray(); paintFlow();
    });
  }
  paintAll();
}

/* ---------- identify + market value ---------- */
async function identify(manualBody) {
  const picked = d.photos.filter((p) => p.picked && p.data);
  if (!manualBody && !picked.length) { ctx.toast("Pick at least one photo first."); return; }
  d.idState = "working"; d.idMsg = ""; d.candidates = []; paintFlow();
  try {
    const body = manualBody ? { manual: manualBody, forcePath: "manual" } : { photos: picked.map((p) => p.data), quantity: d.qty };
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 45000);
    const res = await fetch("/api/scouter/identify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
    clearTimeout(to);
    const out = await res.json().catch(() => ({}));
    if (out.ok && out.identity) return applyIdentity(out.identity);
    { const seen = new Set(); d.candidates = (out.candidates || []).filter((c) => { const k = [c.product_name, c.collector_number, c.set_name, c.finish].join("|").toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); } d.idState = d.candidates.length ? "pick" : "fail";
    d.idMsg = out.setupTask || out.message || "Couldn't tell what this is.";
  } catch (e) { d.idState = "fail"; d.idMsg = e.name === "AbortError" ? "That took too long. Try again or type it." : "Couldn't reach Identify. Try again or type it."; }
  paintFlow();
}
function applyIdentity(id) {
  d.identity = id; d.idState = "ok"; d.manual = false;
  d.title = [id.product_name, id.collector_number, id.set_name, id.finish].filter(Boolean).join(" ").trim() || id.product_name || d.title;
  paintFlow(); fetchMarket();
}
async function fetchMarket() {
  const id = d.identity; if (!id) return;
  const q = [id.product_name, id.collector_number, id.set_name].filter(Boolean).join(" ");
  d.marketState = "loading"; paintFlow();
  try {
    const r = await (await fetch(`/api/scouter/comps?q=${encodeURIComponent(q)}`)).json();
    if (r.ok) { d.market = String(r.value); d.marketNote = `from ${r.count} ${r.basis}`; d.marketState = "ok"; }
    else { d.marketState = "miss"; d.marketNote = r.reason === "no matching listings" ? "No matching listings found. Type a value." : "Couldn't look up a value. Type one."; }
  } catch { d.marketState = "miss"; d.marketNote = "Couldn't look up a value. Type one."; }
  paintFlow();
}

/* ---------- save (only on confirm) ---------- */
async function save() {
  const picked = d.photos.filter((p) => p.picked && p.data);
  if (!picked.length) { ctx.toast("Add and pick at least one photo."); return; }
  const btn = ctx.host.querySelector("#scSave"); if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  const stored = [];
  for (const p of picked) { stored.push({ id: nid(), dataUrl: await resizeData(p.data, STORE_SHRINK), createdAt: new Date().toISOString() }); await tick(); }
  const identified = Boolean(d.identity || d.title.trim());
  const now = new Date().toISOString();
  const id = d.identity || {};
  const item = {
    id: nid(), createdAt: now, updatedAt: now,
    title: d.title.trim() || "Untitled item", productName: id.product_name || d.title.trim() || "",
    collectorNumber: id.collector_number || "", setName: id.set_name || "", setCode: id.set_code || "", game: id.game || "", rarity: id.rarity || "", finish: id.finish || "",
    language: id.language || "", condition: id.condition || "", identifyConfidence: id.confidence || null, identifyPath: d.identity ? (d.manual ? "manual" : "photo_search") : null,
    quantity: Math.max(1, Number(d.qty) || 1), price: num(d.market) || 0, purchasePrice: num(d.paid),
    source: "scouter", listingStatus: "draft", phase: identified ? "staged" : "intake", staged: identified, spaceId: null, channels: {}, photos: stored, notes: "", collections: [],
  };
  try { ctx.setItems([item, ...ctx.getItems()]); } catch { ctx.toast("Couldn't save. Storage is full."); if (btn) { btn.disabled = false; btn.textContent = "Save item"; } return; }
  try { let u = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); u += (k.length + (localStorage.getItem(k) || "").length) * 2; } if (u > 4.2 * 1048576) ctx.toast("Device storage is about " + Math.round(u / 52428.8) + "% full. List or remove items soon."); } catch { /* ignore */ }
  session.unshift({ title: item.title, qty: item.quantity, price: item.price, photo: stored[0] && stored[0].dataUrl, staged: item.phase === "staged" });
  d.saved = { item, backup: { done: 0, total: stored.length, state: "run" } };
  paintAll(); backup(item);
}
async function backup(item) {
  const b = d.saved?.backup; if (!b) return;
  try {
    const r = await fetch("/api/scouter/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: item.title, productName: item.productName, quantity: item.quantity, price: item.price, purchasePrice: item.purchasePrice }) });
    const sid = (await r.json())?.item?.id; if (!r.ok || !sid) throw new Error("x");
    for (const p of item.photos) { const pr = await fetch(`/api/scouter/items/${sid}/photos/data`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl: p.dataUrl }) }); if (!pr.ok) throw new Error("x"); b.done++; paintSaved(); }
    b.state = "ok";
  } catch { b.state = "skip"; }
  paintSaved();
}

/* ---------- painting ---------- */
const $ = (s) => ctx.host.querySelector(s);
function paintAll() { if (!ctx) return; ctx.host.innerHTML = shell(); wire(); paintTray(); paintFlow(); paintSaved(); }
const online = () => { const l = document.getElementById("link"); return !!(l && l.classList.contains("on")); };
function hud() {
  const n = session.reduce((a, x) => a + (Number(x.qty) || 1), 0), v = session.reduce((a, x) => a + (Number(x.price) || 0) * (Number(x.qty) || 1), 0);
  return `<div class="sc-hud" id="scHud"><div><em>On scouter</em><b>${n}</b></div><div><em>Value</em><b>${money(v)}</b></div><div class="live"><i></i>Live</div><div class="net${online() ? " on" : ""}"><i></i>${online() ? "eBay online" : "eBay offline"}</div></div>`;
}
function pkgs() {
  if (!session.length) return "";
  return `<div class="sc-pkgs"><h3>On this scouter</h3><div class="sc-pk">${session.slice(0, 12).map((x) => `<div class="sc-pkg k-tilt">${x.photo ? `<img src="${esc(x.photo)}" alt="" draggable="false">` : "<i></i>"}<span>${esc(x.title)}</span><em>${money(x.price)}</em>${x.qty > 1 ? `<u>x${x.qty}</u>` : ""}<s class="${x.staged ? "ok" : ""}">${x.staged ? "Staged" : "Intake"}</s></div>`).join("")}</div></div>`;
}
function shell() {
  if (d.saved) return `<div class="sc-wrap hh">${hud()}<div class="sc-saved" id="scSaved"></div>${pkgs()}</div>`;
  return `<div class="sc-wrap hh">${hud()}
    <section class="sc-left">
      <div class="sc-drop sc-vf" id="scDrop" tabindex="0" role="button" aria-label="Add photos">
        <img id="scVfImg" alt="" hidden draggable="false"><i class="k-br tl"></i><i class="k-br tr"></i><i class="k-br bl"></i><i class="k-br br"></i><div class="sc-beam"></div>
        <div class="sc-aim"><b>Aim at the item</b><span>Tap SNAP for a photo. Drop or paste photos here too.</span></div><div class="sc-scanmsg">Scanning…</div>
      </div>
      <input type="file" id="scFile" accept="image/*" multiple hidden><input type="file" id="scCamFile" accept="image/*" capture="environment" hidden>
      <div class="sc-twin"><button class="sc-big snap" id="scCam" type="button"><i></i>Snap</button><button class="sc-big scan" id="scId" type="button" disabled><i></i>Scan</button></div>
      <button class="sc-lib" id="scPick" type="button">Choose photos from library</button>
      <div class="sc-tray" id="scTray"></div>
    </section>
    <section class="sc-right" id="scFlow"></section>${pkgs()}</div>`;
}
function paintTray() {
  const t = $("#scTray"); if (!t) return;
  const n = d.photos.filter((p) => p.picked).length;
  t.innerHTML = d.photos.length ? `<div class="sc-count"><b>${n}</b> of ${MAX_PICK} picked${d.photos.length > MAX_PICK ? " · tap a photo to swap" : ""}</div><div class="sc-thumbs">${d.photos.map((p) => `
    <div class="sc-th${p.picked ? " on" : ""}${p.data || p.err ? "" : " busy"}" data-id="${p.id}">
      <img src="${p.data || p.preview}" alt=""><i class="sc-chk">${p.picked ? "✓" : ""}</i>${p.err ? `<em class="sc-err">can't read</em>` : ""}
      <button class="sc-x" data-del="${p.id}" aria-label="Remove photo" type="button">×</button></div>`).join("")}</div>` : "";
  t.querySelectorAll(".sc-th").forEach((el) => el.addEventListener("click", (e) => {
    if (e.target.closest("[data-del]")) return;
    const p = d.photos.find((x) => x.id === el.dataset.id); if (!p || p.err) return;
    if (p.picked) p.picked = false; else if (d.photos.filter((x) => x.picked).length < MAX_PICK) p.picked = true; else { ctx.toast(`Already ${MAX_PICK} picked. Untick one first.`); return; }
    paintTray(); paintFlow();
  }));
  t.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { const i = d.photos.findIndex((x) => x.id === b.dataset.del); if (i >= 0) { URL.revokeObjectURL(d.photos[i].preview); d.photos.splice(i, 1); } paintTray(); paintFlow(); }));
  const dz = $("#scDrop"); if (dz) dz.classList.toggle("small", d.photos.length > 0);
  const vi = $("#scVfImg"), first = d.photos.find((p) => p.picked) || d.photos[0]; if (vi) { vi.hidden = !first; if (first) vi.src = first.data || first.preview; dz && dz.classList.toggle("has", !!first); }
}
function paintFlow() {
  const f = $("#scFlow"); if (!f) return;
  const picked = d.photos.filter((p) => p.picked && p.data).length;
  const paid = d.paid, mk = d.market;
  const profit = num(d.market) != null && num(d.paid) != null ? num(d.market) - num(d.paid) : null;
  let step1;
  if (d.idState === "working") step1 = `<div class="sc-step"><div class="sc-spin"></div><b>Reading your photos…</b><span>This can take up to 30 seconds.</span></div>`;
  else if (d.idState === "ok") step1 = `<div class="sc-step ok"><span>Identified</span><b>${esc(d.title)}</b><button class="btn" id="scRe" type="button">Identify again</button></div>`;
  else if (d.idState === "pick") step1 = `<div class="sc-step"><b>Not sure. Which one is it?</b><span>${esc(d.idMsg)}</span>${d.candidates.map((c, i) => `<button class="sc-cand" data-c="${i}" type="button">${esc([c.product_name, c.collector_number, c.set_name, c.finish].filter(Boolean).join(" · "))}</button>`).join("")}<button class="btn" id="scMan" type="button">None of these. I'll type it</button></div>`;
  else if (d.idState === "fail" || d.manual) step1 = d.manual ? manualForm() : `<div class="sc-step"><b>Couldn't identify it</b><span>${esc(d.idMsg)}</span><button class="btn" id="scRe" type="button">Try again</button><button class="btn" id="scMan" type="button">I'll type it</button></div>`;
  else step1 = `<div class="sc-step idle"><b>${picked ? "Ready to scan" : "Nothing in the viewfinder"}</b><span>${picked ? `${picked} photo${picked > 1 ? "s" : ""} ready. Hit SCAN to read it.` : "Tap SNAP and take a photo."}</span><button class="btn" id="scMan" type="button">Type it instead</button></div>`;
  const mkNote = d.marketState === "loading" ? "Looking up value…" : d.marketNote;
  f.innerHTML = `${step1}
    <div class="sc-step money"><b>Money</b>
      <label class="sc-f"><span>You paid</span><input id="scPaid" inputmode="decimal" placeholder="0.00" value="${esc(paid)}"></label>
      <label class="sc-f"><span>Market value <small>median of active eBay listings</small></span><input id="scMkt" inputmode="decimal" placeholder="${d.marketState === "loading" ? "looking up…" : "0.00"}" value="${esc(mk)}"></label>
      ${mkNote ? `<small class="sc-note">${esc(mkNote)}</small>` : ""}
      ${profit != null ? `<div class="sc-profit ${profit >= 0 ? "pos" : "neg"}">Profit if it sells at market: <b>${profit < 0 ? "-" : ""}${money(Math.abs(profit))}</b></div>` : ""}
      <label class="sc-f"><span>Quantity</span><input id="scQty" inputmode="numeric" value="${esc(d.qty)}"></label>
    </div>
    <div class="sc-step stage"><b>Stage it</b><span>${d.identity || d.title.trim() ? "It goes to Ready to list." : "Not identified yet, so it goes to Intake."}</span>
      <button class="btn go" id="scSave" type="button" ${picked ? "" : "disabled"}>Save item</button></div>`;
  const sid = $("#scId"); if (sid) { sid.disabled = !picked || d.idState === "working"; if (!sid.dataset.on) { sid.dataset.on = "1"; sid.addEventListener("click", () => identify()); } }
  $("#scDrop")?.classList.toggle("scanning", d.idState === "working");
  const hd = $("#scHud"); if (hd) hd.outerHTML = hud();
  $("#scRe")?.addEventListener("click", () => identify());
  $("#scMan")?.addEventListener("click", () => { d.manual = true; paintFlow(); });
  f.querySelectorAll("[data-c]").forEach((b) => b.addEventListener("click", () => applyIdentity(d.candidates[+b.dataset.c])));
  $("#scMF")?.addEventListener("submit", (e) => { e.preventDefault(); const g = (k) => $(`#scMF [name=${k}]`).value.trim(); if (!g("n")) { ctx.toast("Type the name first."); return; } identify({ product_name: g("n"), collector_number: g("c") || null, set_name: g("s") || null, game: g("g") || null, finish: null }); });
  $("#scPaid")?.addEventListener("input", (e) => { d.paid = e.target.value; refreshProfit(); });
  $("#scMkt")?.addEventListener("input", (e) => { d.market = e.target.value; refreshProfit(); });
  $("#scQty")?.addEventListener("input", (e) => { d.qty = e.target.value; });
  $("#scSave")?.addEventListener("click", save);
}
function refreshProfit() { const el = ctx.host.querySelector(".sc-profit"); if (!el) return paintFlowKeepFocus(); const p = num(d.market) != null && num(d.paid) != null ? num(d.market) - num(d.paid) : null; if (p == null) return paintFlowKeepFocus(); el.className = `sc-profit ${p >= 0 ? "pos" : "neg"}`; el.innerHTML = `Profit if it sells at market: <b>${p < 0 ? "-" : ""}${money(Math.abs(p))}</b>`; }
function paintFlowKeepFocus() { const a = document.activeElement?.id; const pos = document.activeElement?.selectionStart; paintFlow(); if (a) { const e = document.getElementById(a); if (e) { e.focus(); try { e.setSelectionRange(pos, pos); } catch { /* ok */ } } } }
function manualForm() {
  return `<form class="sc-step" id="scMF"><b>Type what it is</b>
    <label class="sc-f"><span>Name</span><input name="n" placeholder="Pikachu VMAX" value="${esc(d.title)}"></label>
    <label class="sc-f"><span>Card number</span><input name="c" placeholder="optional"></label>
    <label class="sc-f"><span>Set</span><input name="s" placeholder="optional"></label>
    <label class="sc-f"><span>Game</span><input name="g" placeholder="Pokemon, One Piece…"></label>
    <button class="btn go" type="submit">Use this</button></form>`;
}
function paintSaved() {
  const s = $("#scSaved"); if (!s || !d.saved) return;
  const it = d.saved.item, b = d.saved.backup, ready = it.phase === "staged";
  s.innerHTML = `<div class="sc-done"><i>✓</i><h2>Saved</h2><p><b>${esc(it.title)}</b> is in <b>${ready ? "Ready to list" : "Intake"}</b>${it.price ? ` · market ${money(it.price)}` : ""}.</p>
    <small class="sc-note">${b.state === "run" ? `Backing up photos ${b.done}/${b.total}…` : b.state === "ok" ? "Photos backed up." : "Saved on this device. Backup skipped."}</small>
    <div class="sc-next"><button class="btn go" id="scNext" type="button">${ready ? "Build the listing" : "Identify it now"}</button><button class="btn" id="scAgain" type="button">Scout another item</button></div></div>`;
  $("#scAgain")?.addEventListener("click", () => { d.photos.forEach((p) => URL.revokeObjectURL(p.preview)); d = blank(); paintAll(); });
  $("#scNext")?.addEventListener("click", () => { if (ready) { window.__chStage = "staged"; ctx.go("channels"); } else { d.photos.forEach((p) => URL.revokeObjectURL(p.preview)); d = blank(); paintAll(); ctx.toast("Add the photos again to identify, or open it from Command."); } });
}
function wire() {
  const dz = $("#scDrop"); if (!dz) return;
  const file = $("#scFile"), cam = $("#scCamFile");
  const choose = () => file.click();
  dz.addEventListener("click", (e) => { if (e.target.closest("button")) return; choose(); });
  dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(); } });
  $("#scPick").addEventListener("click", choose); $("#scCam").addEventListener("click", () => cam.click());
  file.addEventListener("change", () => { addFiles(file.files); file.value = ""; }); cam.addEventListener("change", () => { addFiles(cam.files); cam.value = ""; });
  ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("over"); }));
  dz.addEventListener("drop", (e) => { if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });
}
// whole-page drop + paste while Scouter is open
let globals = false;
function bindGlobals() {
  if (globals) return; globals = true;
  document.addEventListener("paste", (e) => { if (!ctx || !ctx.host.isConnected || !ctx.host.querySelector("#scDrop")) return; const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); addFiles(fs); } });
  addEventListener("dragover", (e) => { if (ctx?.host.querySelector("#scDrop") && e.dataTransfer?.types?.includes("Files")) e.preventDefault(); });
  addEventListener("drop", (e) => { if (ctx?.host.querySelector("#scDrop") && e.dataTransfer?.files?.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
}

export function renderScouter(host, api) { ctx = { host, ...api }; bindGlobals(); paintAll(); }
