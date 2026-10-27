import { isArchived, loadSpaces, assign } from "./shared.js?v=7";
import { inboxAdd, inboxList, inboxRemove } from "./inbox.js?v=2";
import { openBatch, batchRunning, reviewBatch, lastBatchCount } from "./batch.js?v=4";
import { phaseFromItem } from "/visor/phases.js?v=3";
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

/* The main photo (eBay shows it first): the one marked Main, else the first picked. Picked photos always go out main-first. */
function pickedOrdered() { const l = d.photos.filter((p) => p.picked), m = l.find((p) => p.id === d.main) || l[0]; return m ? [m, ...l.filter((p) => p !== m)] : []; }
function mainOf() { return pickedOrdered()[0] || null; }
function blank() {
  return { photos: [], main: null, paid: "", market: "", marketNote: "", marketState: "idle", qty: 1, title: "", identity: null, idState: "idle", idMsg: "", candidates: [], manual: false, saved: null, reid: null };
}
let d = blank();
let focus = null; // a staged item open on the scanner: { id, ids }
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
  const picked = pickedOrdered().filter((p) => p.data);
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
    const qs = new URLSearchParams({ q, name: id.product_name || "", number: id.collector_number || "", set: id.set_name || "", finish: id.finish || "", game: id.game || "" });
    const r = await (await fetch(`/api/scouter/comps?${qs}`)).json();
    if (r.ok) { d.market = String(r.value); d.marketNote = r.basis === "TCGplayer market" ? `TCGplayer market${r.matched ? ` · ${r.matched}` : ""}` : `from ${r.count} ${r.basis}`; d.marketState = "ok"; }
    else { d.marketState = "miss"; d.marketNote = r.reason === "no matching listings" ? "No matching listings found. Type a value." : "Couldn't look up a value. Type one."; }
  } catch { d.marketState = "miss"; d.marketNote = "Couldn't look up a value. Type one."; }
  paintFlow();
}

/* ---------- save (only on confirm) ---------- */
async function save() {
  const picked = pickedOrdered().filter((p) => p.data);
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
  let list = ctx.getItems();
  if (d.reid) { const old = list.find((x) => String(x.id) === String(d.reid)); if (old) { Object.assign(item, { id: old.id, createdAt: old.createdAt, notes: old.notes || "", collections: old.collections || [], spaceId: old.spaceId || null, sku: old.sku, channels: old.channels || {} }); list = list.filter((x) => x !== old); } }
  try { ctx.setItems([item, ...list]); } catch { ctx.toast("Couldn't save. Storage is full."); if (btn) { btn.disabled = false; btn.textContent = "Save item"; } return; }
  if (d.fromInbox && d.fromInbox.length) { const ids = d.fromInbox; d.fromInbox = null; inboxRemove(ids).catch(() => {}); }
  try { let u = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); u += (k.length + (localStorage.getItem(k) || "").length) * 2; } if (u > 4.2 * 1048576) ctx.toast("Device storage is about " + Math.round(u / 52428.8) + "% full. List or remove items soon."); } catch { /* ignore */ }
  session.unshift({ id: item.id, title: item.title, qty: item.quantity, price: item.price, photo: stored[0] && stored[0].dataUrl, staged: item.phase === "staged" });
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
const $ = (s) => (ctx && ctx.host ? ctx.host.querySelector(s) : null);
/* ---------- live camera: the handheld scanner ---------- */
let stream = null, camTried = false, camDenied = false;
const camOk = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
const isPhone = () => matchMedia("(max-width:820px)").matches;
async function startCam() {
  if (focus) return; if (stream || camDenied || !camOk() || !isPhone() || d.saved) { attachCam(); return; }
  camTried = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } } });
    if (document.body.dataset.view !== "scouter") { stopCam(); return; }
  } catch { camDenied = true; stream = null; }
  attachCam();
}
function attachCam() {
  const v = $("#scLive"), dz = $("#scDrop"); if (!v || !dz) return;
  if (stream) {
    if (v.srcObject !== stream) v.srcObject = stream;
    v.hidden = false; v.play?.().catch(() => {}); dz.classList.add("live"); track();
    const t = stream.getVideoTracks()[0], cap = t && t.getCapabilities ? t.getCapabilities() : {};
    const tb = $("#scTorch"); if (tb) tb.hidden = !cap.torch;
  } else { v.hidden = true; dz.classList.remove("live"); }
}
/* lock-on: find the card in the frame and follow it */
let trk = null;

/* ---------- card finder used by the live lock ---------- */
function cardBlob(px, w, h) {
  const n = w * h, R = new Uint8Array(n), G = new Uint8Array(n), B = new Uint8Array(n);
  for (let i = 0; i < n; i++) { R[i] = px[i * 4]; G[i] = px[i * 4 + 1]; B[i] = px[i * 4 + 2]; }
  /* background = median colour of a 3px frame border */
  const br = [], bg_ = [], bb = []; const take = (i) => { br.push(R[i]); bg_.push(G[i]); bb.push(B[i]); };
  for (let x = 0; x < w; x++) for (let y of [0, 1, 2, h - 3, h - 2, h - 1]) take(y * w + x);
  for (let y = 3; y < h - 3; y++) for (let x of [0, 1, 2, w - 3, w - 2, w - 1]) take(y * w + x);
  const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; }, r0 = med(br), g0 = med(bg_), b0 = med(bb);
  const D = new Uint16Array(n), hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) { const d = Math.min(255, (Math.abs(R[i] - r0) + Math.abs(G[i] - g0) + Math.abs(B[i] - b0)) / 2 | 0); D[i] = d; hist[d]++; }
  /* Otsu threshold, never below 28 so sensor noise stays background */
  let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sB = 0, wB = 0, best = 0, th = 40; for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; th = t; } }
  th = Math.max(28, th);
  const M = new Uint8Array(n); for (let i = 0; i < n; i++) M[i] = D[i] > th ? 1 : 0;
  /* close small gaps (glare, dark art) with one dilate */
  const M2 = new Uint8Array(n); for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; M2[i] = M[i] | M[i - 1] | M[i + 1] | M[i - w] | M[i + w]; }
  const lab = new Int32Array(n), q = new Int32Array(n); let bestS = 0, out = null, id = 0;
  for (let s0 = 0; s0 < n; s0++) {
    if (!M2[s0] || lab[s0]) continue; id++; let qh = 0, qt = 0; q[qt++] = s0; lab[s0] = id;
    let cnt = 0, sx = 0, sy = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    while (qh < qt) { const i = q[qh++], x = i % w, y = (i / w) | 0; cnt++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && M2[i - 1] && !lab[i - 1]) { lab[i - 1] = id; q[qt++] = i - 1; } if (x < w - 1 && M2[i + 1] && !lab[i + 1]) { lab[i + 1] = id; q[qt++] = i + 1; }
      if (y > 0 && M2[i - w] && !lab[i - w]) { lab[i - w] = id; q[qt++] = i - w; } if (y < h - 1 && M2[i + w] && !lab[i + w]) { lab[i + w] = id; q[qt++] = i + w; } }
    const bw = (x1 - x0 + 1) / w, bh = (y1 - y0 + 1) / h, area = cnt / n, fill = cnt / ((x1 - x0 + 1) * (y1 - y0 + 1));
    if (area < .035 || bw > .97 || bh > .97 || fill < .45) continue;
    const cx = sx / cnt / w - .5, cy = sy / cnt / h - .5, ar = (bw * w) / (bh * h), shape = Math.exp(-Math.abs(Math.log(ar / (63 / 88))) * 1.2);
    const score = area * fill * (0.6 + 0.4 * shape) * Math.exp(-(cx * cx + cy * cy) * 3);
    if (score > bestS) { bestS = score; out = { x: x0 / w, y: y0 / h, w: bw, h: bh }; }
  }
  if (!out) return null; const pad = .015;
  return { x: Math.max(.01, out.x - pad), y: Math.max(.01, out.y - pad), w: Math.min(.98, out.w + pad * 2), h: Math.min(.98, out.h + pad * 2) };
}
function edgeBox(px, w, h) {
  const L = new Float32Array(w * h); for (let i = 0; i < w * h; i++) L[i] = px[i * 4] * .3 + px[i * 4 + 1] * .59 + px[i * 4 + 2] * .11;
  const E = new Float32Array(w * h); let sum = 0, sq = 0, n = 0;
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) { const i = y * w + x, e = Math.abs(L[i + 1] - L[i - 1]) + Math.abs(L[i + w] - L[i - w]); E[i] = e; sum += e; sq += e * e; n++; }
  const mean = sum / n, sd = Math.sqrt(Math.max(0, sq / n - mean * mean)), th = mean + 1.2 * sd, cx = new Float32Array(w), cy = new Float32Array(h); let tot = 0;
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) { const e = E[y * w + x]; if (e > th && e > 14) { const dx = (x / w - .5) * 2, dy = (y / h - .5) * 2, wt = Math.exp(-(dx * dx + dy * dy) * 1.2); cx[x] += wt; cy[y] += wt; tot += wt; } }
  if (tot < w * h * .012) return null;
  const pct = (arr, len, qq) => { let a = 0; const t = tot * qq; for (let i = 0; i < len; i++) { a += arr[i]; if (a >= t) return i; } return len - 1; };
  const x0 = pct(cx, w, .05) / w, x1 = (pct(cx, w, .95) + 1) / w, y0 = pct(cy, h, .05) / h, y1 = (pct(cy, h, .95) + 1) / h, bw = x1 - x0, bh = y1 - y0;
  if (bw > .14 && bh > .14 && bw < .97 && bh < .97) { const pad = .018; return { x: Math.max(.02, x0 - pad), y: Math.max(.02, y0 - pad), w: Math.min(.96, bw + pad * 2), h: Math.min(.96, bh + pad * 2) }; }
  return null;
}
function track() {
  if (trk) return;
  const cv = document.createElement("canvas"), g = cv.getContext("2d", { willReadFrequently: true });
  const st = { x: .23, y: .2, w: .54, h: .6, tx: .23, ty: .2, tw: .54, th: .6, last: 0, seen: 0, still: 0, mode: "seek" };
  const def = { x: .23, y: .2, w: .54, h: .6 };
  const step = (now) => {
    const v = $("#scLive"), box = $("#scLock"), dz = $("#scDrop");
    if (!stream || !v || !box || !dz) { trk = null; return; }
    trk = requestAnimationFrame(step);
    const W = dz.clientWidth, H = dz.clientHeight; if (!W || !H) return;
    /* glide toward the target every frame; detect every ~70ms */
    const k = matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : .4;
    st.x += (st.tx - st.x) * k; st.y += (st.ty - st.y) * k; st.w += (st.tw - st.w) * k; st.h += (st.th - st.h) * k;
    box.style.transform = `translate3d(${(st.x * W).toFixed(1)}px,${(st.y * H).toFixed(1)}px,0)`; box.style.width = (st.w * W).toFixed(1) + "px"; box.style.height = (st.h * H).toFixed(1) + "px";
    if (now - st.last < 70 || !v.videoWidth) return; st.last = now;
    const sc = Math.max(W / v.videoWidth, H / v.videoHeight), cw = W / sc, chh = H / sc, sx = (v.videoWidth - cw) / 2, sy = (v.videoHeight - chh) / 2;
    const w = 96, h = Math.max(24, Math.round(96 * H / W)); cv.width = w; cv.height = h;
    g.drawImage(v, sx, sy, cw, chh, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data;
    /* 1) the card stands out from the table: segment against the frame border's colour, take the best central blob */
    let tg = cardBlob(px, w, h);
    /* 2) fallback: where the sharp edges cluster */
    if (!tg) tg = edgeBox(px, w, h);
    if (tg) st.seen = now; const t = tg || (now - st.seen > 700 ? def : null);
    if (t) {
      const mv = Math.abs(t.x - st.tx) + Math.abs(t.y - st.ty) + Math.abs(t.w - st.tw) + Math.abs(t.h - st.th);
      /* small jitter is ignored so a held card sits dead still */
      /* ease toward the new box (no snapping), and pull its shape toward a trading card (63:88) so the lock reads as "card" */
      if (mv > .012) {
        let { x, y, w: bw2, h: bh2 } = t; if (tg) { const ar = (W * bw2) / (H * bh2), want = 63 / 88, k2 = .5; const tw2 = ar > want ? bw2 * (1 - k2 + k2 * want / ar) : bw2, th2 = ar < want ? bh2 * (1 - k2 + k2 * ar / want) : bh2; x += (bw2 - tw2) / 2; y += (bh2 - th2) / 2; bw2 = tw2; bh2 = th2; }
        const e = tg ? .45 : .25; st.tx += (x - st.tx) * e; st.ty += (y - st.ty) * e; st.tw += (bw2 - st.tw) * e; st.th += (bh2 - st.th) * e;
      }
      st.still = tg && mv < .05 ? st.still + 1 : 0;
    }
    const mode = !tg ? "seek" : st.still >= 8 ? "lock" : "track";
    /* Face ID style ring: fills white -> green as the lock holds steady */
    const want = !tg ? 0 : mode === "lock" ? 1 : Math.min(.92, .12 + st.still / 6 * .8);
    st.ring = (st.ring || 0) + (want - (st.ring || 0)) * .35;
    const fg = $("#scRingFg"); if (fg) { const r = st.ring; fg.style.strokeDashoffset = String(100 - r * 100); const g = Math.round(255 - r * (255 - 124)), b2 = Math.round(255 - r * (255 - 181)); fg.style.stroke = `rgb(${g},${Math.round(255 - r * 15)},${b2})`; }
    if (mode !== st.mode) { st.mode = mode; box.dataset.mode = mode; const lk = $("#scLk"); if (lk) lk.textContent = mode === "lock" ? "Locked" : mode === "track" ? "Tracking" : "Seeking"; if (mode === "lock") ctx?.haptic?.(); }
  };
  trk = requestAnimationFrame(step);
}
function stopCam() { if (trk) { cancelAnimationFrame(trk); trk = null; } if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } const v = $("#scLive"); if (v) { v.srcObject = null; v.hidden = true; } $("#scDrop")?.classList.remove("live"); }
async function snap() {
  const v = $("#scLive"); if (!stream || !v || !v.videoWidth) return false;
  if (d.photos.filter((p) => p.picked).length >= MAX_PICK && d.photos.length >= MAX_PICK) { ctx.toast(`That's ${MAX_PICK} photos. Tap Identify.`); return true; }
  const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d").drawImage(v, 0, 0);
  const dz = $("#scDrop"); dz?.classList.remove("flash"); void dz?.offsetWidth; dz?.classList.add("flash");
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9)); if (!blob) return false;
  addFiles([new File([blob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" })]);
  return true;
}
addEventListener("fob:view", (e) => { if (e.detail !== "scouter") stopCam(); else setTimeout(startCam, 50); });
document.addEventListener("visibilitychange", () => { if (document.hidden) stopCam(); else if (document.body.dataset.view === "scouter" && ctx?.host.isConnected) startCam(); });

function paintAll() { if (!ctx) return; if (d.saved || focus) stopCam(); ctx.host.innerHTML = shell(); wire(); paintTray(); paintFlow(); paintSaved(); wireCard(); }
const online = () => { const l = document.getElementById("link"); return !!(l && l.classList.contains("on")); };
function hud() {
  const n = session.reduce((a, x) => a + (Number(x.qty) || 1), 0), v = session.reduce((a, x) => a + (Number(x.price) || 0) * (Number(x.qty) || 1), 0);
  return `<div class="sc-hud" id="scHud"><div class="sc-tally"><b>${n}</b><em>${n === 1 ? "item" : "items"} scanned</em><i></i><b>${money(v)}</b><em>total</em></div><div class="net${online() ? " on" : ""}"><i></i>${online() ? "eBay connected" : "eBay not connected"}</div></div>`;
}
function pkgs() {
  const cur = ctx.getItems(), byId = new Map(cur.map((i) => [String(i.id), i]));
  const list = session.filter((x) => !x.id || byId.has(String(x.id))).slice(0, 12);
  if (!list.length) return "";
  return `<div class="sc-pkgs"><h3>Scanned today</h3><div class="sc-pk">${list.map((x) => { const it = x.id && byId.get(String(x.id)); const st = it ? (it.listingStatus === "listed" ? "Live" : it.phase === "staged" ? "Ready to list" : "Intake") : x.staged ? "Ready to list" : "Intake"; return `<button type="button" class="sc-pkg k-tilt"${x.id ? ` data-open="${esc(x.id)}"` : ""}>${x.photo ? `<img src="${esc(x.photo)}" alt="" draggable="false">` : "<i></i>"}<span>${esc(it ? it.title : x.title)}</span><em>${money(it ? it.price : x.price)}</em>${x.qty > 1 ? `<u>x${x.qty}</u>` : ""}<s class="${st !== "Intake" ? "ok" : ""}">${st}</s></button>`; }).join("")}</div></div>`;
}
function queue_(noInbox) {
  /* exactly what Command shows at Intake and Ready to list, so the two never disagree */
  const all = ctx.getItems().filter((i) => (i.source === "scouter" || i.source === "app") && !i.ended && !isArchived(i.id));
  const wait = all.filter((i) => phaseFromItem(i) === "intake"), ready = all.filter((i) => phaseFromItem(i) === "staged");
  const tile = (i, k) => `<button class="sc-q k-tilt" data-q="${esc(i.id)}" data-k="${k}" type="button">${i.photos?.[0] ? `<img src="${esc(i.photos[0].dataUrl || i.photos[0].url || "")}" alt="" loading="lazy" draggable="false">` : "<i></i>"}<span>${esc(i.title || "Untitled item")}</span>${i.price ? `<em>${money(i.price)}</em>` : ""}<u class="sc-qx" data-qdel="${esc(i.id)}" role="button" aria-label="Delete this item">×</u></button>`;
  const row = (t, sub, l, k, acts = "") => l.length ? `<div class="sc-qh"><h3>${t}</h3><em>${l.length}</em><small>${sub}</small>${acts}</div><div class="sc-qs">${l.slice(0, 30).map((i) => tile(i, k)).join("")}</div>` : "";
  const out = row("Waiting to identify", "Tap one to read it", wait, "wait") + row("Ready to list", "Tap one to list it, bin it or fix it", ready, "ready", ready.length > 1 ? `<button type="button" class="sc-qa" id="scVar">List several as one</button>` : "");
  const tools = `<div class="sc-qtools"><button type="button" class="sc-qa" id="scCsv">Import a CSV</button></div>`;
  return `<section class="sc-queue">${noInbox ? "" : `<section class="sc-inbox" id="scInbox"></section>`}${out}${tools}</section>`;
}
function repaintLists() {
  if (!ctx || !ctx.host.isConnected) return;
  const q = ctx.host.querySelector(".sc-queue"), p = ctx.host.querySelector(".sc-pkgs"), tmp = document.createElement("div");
  tmp.innerHTML = pkgs() + queue_();
  const np = tmp.querySelector(".sc-pkgs"), nq = tmp.querySelector(".sc-queue");
  if (p) { if (np) p.replaceWith(np); else p.remove(); } else if (np && q) q.before(np);
  if (q && nq) q.replaceWith(nq);
  const h = ctx.host.querySelector("#scHud"); if (h) { tmp.innerHTML = hud(); h.replaceWith(tmp.firstElementChild); }
  wireQueue();
}
window.__fobScRepaint = () => { if (focus && !ctx.getItems().some((i) => String(i.id) === focus.id && phaseFromItem(i) === "staged")) { nextFocus(); return; } if (focus) { const c = ctx.host.querySelector("#scCard"); if (c) { c.innerHTML = focusPanel(); wireCard(); } } repaintLists(); };
/* ---------- a staged card open on the scanner: list it, bin it, fix it, flip to the next ---------- */
function openFocus(id, ids) { focus = { id: String(id), ids: (ids && ids.length ? ids : [id]).map(String) }; d.saved = null; paintAll(); try { document.getElementById("main").scrollTo({ top: 0, behavior: "smooth" }); } catch { /* ignore */ } }
function nextFocus() {
  if (!focus) return; const live = new Set(ctx.getItems().filter((i) => phaseFromItem(i) === "staged" && !isArchived(i.id)).map((i) => String(i.id)));
  const k = focus.ids.indexOf(focus.id); const rest = focus.ids.filter((x) => live.has(x));
  const nxt = focus.ids.slice(k + 1).find((x) => live.has(x)) || focus.ids.slice(0, k).reverse().find((x) => live.has(x));
  if (nxt) { focus = { id: nxt, ids: rest }; } else focus = null;
  paintAll();
}
function focusPanel() {
  const it = ctx.getItems().find((x) => String(x.id) === focus.id); if (!it) return "";
  const i = focus.ids.indexOf(focus.id), n = focus.ids.length, ph = it.photos?.[0] ? (it.photos[0].dataUrl || it.photos[0].url) : "";
  const bins = loadSpaces().filter((b) => b.phys), bin = bins.find((b) => b.id === it.spaceId);
  return `<div class="scc-bar"><button type="button" class="scc-back" id="sccBack">‹ Scanner</button>${n > 1 ? `<span class="scc-n">${i + 1} of ${n} ready</span><button type="button" class="scc-nav" id="sccPrev" aria-label="Previous card"${i === 0 ? " disabled" : ""}>‹</button><button type="button" class="scc-nav" id="sccNext" aria-label="Next card"${i === n - 1 ? " disabled" : ""}>›</button>` : ""}</div>
    <div class="scc-shot">${ph ? `<img src="${esc(ph)}" alt="" draggable="false">` : "<i></i>"}<span class="scc-tag">Ready to list</span></div>
    <h2 class="scc-t">${esc(it.title || "Untitled item")}</h2>
    <div class="scc-read"><div><em>Market</em><b>${money(it.price)}</b></div><div><em>Qty</em><b>${Number(it.quantity) || 1}</b></div><div><em>Paid</em><b>${it.purchasePrice != null && it.purchasePrice !== "" ? money(it.purchasePrice) : "—"}</b></div><div><em>Bin</em><b>${bin ? esc(bin.name) : "None"}</b></div></div>
    <button type="button" class="scc-go" id="sccList"><i></i><span>Build the listing</span></button>
    ${bins.length ? `<div class="scc-h">Put it in a bin</div><div class="scc-bins">${bins.map((b) => `<button type="button" class="scc-bin${b.id === it.spaceId ? " on" : ""}" data-sccbin="${esc(b.id)}"><b>${esc(b.name)}</b>${b.sub ? `<small>${esc(b.sub)}</small>` : ""}</button>`).join("")}</div>` : ""}
    <div class="scc-row"><button type="button" class="scc-sec" id="sccFix">Fix name or price</button><button type="button" class="scc-sec warn" id="sccDel">Delete</button></div>`;
}
function wireCard() {
  const c = ctx && ctx.host.querySelector("#scCard"); if (!c || !focus) return;
  const id = focus.id, i = focus.ids.indexOf(id), go = (k) => { const nid = focus.ids[k]; if (nid) { focus.id = nid; c.innerHTML = focusPanel(); wireCard(); } };
  c.querySelector("#sccBack")?.addEventListener("click", () => { focus = null; paintAll(); });
  c.querySelector("#sccPrev")?.addEventListener("click", () => go(i - 1));
  c.querySelector("#sccNext")?.addEventListener("click", () => go(i + 1));
  c.querySelector("#sccList")?.addEventListener("click", () => { ctx.build(id); const k = focus.ids.indexOf(id), nx = focus.ids.slice(k + 1)[0] || focus.ids.slice(0, k).reverse()[0]; focus = nx ? { id: nx, ids: focus.ids.filter((x) => x !== id) } : null; paintAll(); });
  c.querySelector("#sccFix")?.addEventListener("click", () => { focus = null; loadForId(id); });
  c.querySelectorAll("[data-sccbin]").forEach((b) => b.addEventListener("click", () => {
    const it = ctx.getItems().find((x) => String(x.id) === id); const to = it && it.spaceId === b.dataset.sccbin ? null : b.dataset.sccbin;
    assign([id], to); ctx.setItems(ctx.getItems()); ctx.toast(to ? `Put in ${b.querySelector("b").textContent}` : "Taken out of the bin"); c.innerHTML = focusPanel(); wireCard();
  }));
  c.querySelector("#sccDel")?.addEventListener("click", () => {
    const prev = ctx.getItems(), it = prev.find((x) => String(x.id) === id); if (!it) return;
    ctx.setItems(prev.filter((x) => String(x.id) !== id)); nextFocus();
    const undo = () => { ctx.setItems(prev); repaintLists(); };
    if (ctx.toastUndo) ctx.toastUndo("Deleted " + (it.title || "item"), undo); else ctx.toast("Deleted");
  });
  let sx = null, sy = 0;
  c.addEventListener("touchstart", (e) => { if (e.touches.length !== 1 || e.target.closest(".scc-bins")) { sx = null; return; } sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  c.addEventListener("touchend", (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null; if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) go(dx < 0 ? i + 1 : i - 1); }, { passive: true });
}
function loadForId(id) {
  focus = null;
  const it = ctx.getItems().find((x) => String(x.id) === String(id)); if (!it) return;
  d.photos.forEach((p) => p.preview && p.preview.startsWith("blob:") && URL.revokeObjectURL(p.preview));
  d = blank(); d.reid = it.id; d.title = /^untitled/i.test(it.title || "") ? "" : (it.title || ""); d.qty = it.quantity || 1; d.paid = it.purchasePrice ? String(it.purchasePrice) : ""; d.market = it.price ? String(it.price) : "";
  (it.photos || []).slice(0, MAX_PICK).forEach((ph, k) => { const u = ph.dataUrl || ph.url || ""; d.photos.push({ id: nid(), preview: u, data: ph.dataUrl || "", picked: true, err: false, src: u }); });
  paintAll();
  d.photos.filter((p) => !p.data && p.src).forEach(async (p) => { try { const b = await (await fetch(p.src)).blob(); p.data = await new Promise((r, j) => { const f = new FileReader(); f.onload = () => r(f.result); f.onerror = j; f.readAsDataURL(b); }); p.data = await resizeData(p.data, SHRINK); } catch { p.err = true; p.picked = false; } paintTray(); paintFlow(); });
  ctx.toast("Loaded. Tap Identify.");
}
function shell() {
  if (focus) return `<div class="sc-wrap hh">${hud()}<div class="sc-card" id="scCard">${focusPanel()}</div>${pkgs()}${queue_()}</div>`;
  if (d.saved) return `<div class="sc-wrap hh">${hud()}<div class="sc-saved" id="scSaved"></div>${pkgs()}${queue_()}</div>`;
  return `<div class="sc-wrap hh"><div class="pg-title"><h2>Scouter</h2><span>Snap a few photos of one item, tap Identify, save it.</span></div>${hud()}
    <section class="sc-left">
      <div class="sc-drop sc-vf" id="scDrop" aria-label="Camera">
        <video id="scLive" playsinline muted autoplay hidden></video><img id="scVfImg" alt="" hidden draggable="false"><div class="sc-lock" id="scLock" data-mode="seek" aria-hidden="true"><i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i><svg class="sc-ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="bg" cx="50" cy="50" r="44"/><circle class="fg" id="scRingFg" cx="50" cy="50" r="44" pathLength="100"/></svg><svg class="sc-core" viewBox="0 0 40 40"><circle cx="20" cy="20" r="13" class="ring"/><path d="M20 3v7M20 30v7M3 20h7M30 20h7" class="tk"/><circle cx="20" cy="20" r="1.6" class="dot"/></svg><span class="sc-lk" id="scLk">Seeking</span></div><i class="k-br tl"></i><i class="k-br tr"></i><i class="k-br bl"></i><i class="k-br br"></i><div class="sc-beam"></div>
        <div class="sc-ret" aria-hidden="true"><svg viewBox="0 0 300 300"><g class="r-out"><path d="M60 52 A132 132 0 0 1 240 52"/><path d="M240 248 A132 132 0 0 1 60 248"/></g><g class="r-seg"><circle cx="150" cy="150" r="112"/></g><g class="r-tk"><path d="M22 96 V204 M278 96 V204"/></g><rect class="r-card" x="104" y="86" width="92" height="128" rx="6"/><path class="r-x" d="M150 140 V160 M140 150 H160"/></svg></div><div class="sc-aim"><b>Point at the item</b><span>Tap the big button to take a photo. On a computer, drop or paste photos here.</span></div><div class="sc-scanmsg">Identifying…</div>
        <div class="sc-tools"><button class="sc-tool" id="scType" type="button">Type it in</button><button class="sc-tool" id="scTorch" type="button" hidden aria-pressed="false">Light</button></div>
        <div class="sc-deck"><button class="sc-side" id="scPick" type="button" aria-label="Choose photos from your library"><i class="ic-lib"></i><span>Photos</span></button>
        <button class="sc-big snap sc-trig" id="scCam" type="button" aria-label="Take photo"><i></i><span>Take photo</span><em id="scShotN"></em></button>
        <button class="sc-side scan" id="scId" type="button" disabled aria-label="Identify"><i class="ic-id"></i><span>Identify</span></button></div>
      </div>
      <input type="file" id="scFile" accept="image/*" multiple hidden><input type="file" id="scCamFile" accept="image/*" capture="environment" hidden>

      <div class="sc-tray" id="scTray"></div>
    </section>
    <section class="sc-right" id="scFlow"></section><section class="sc-inbox sc-inbox-top" id="scInbox"></section>${pkgs()}${queue_(true)}</div>`;
}
function paintTray() {
  const t = $("#scTray"); if (!t) return;
  const n = d.photos.filter((p) => p.picked).length;
  t.innerHTML = d.photos.length ? `<div class="sc-count"><b>${n}</b> of ${MAX_PICK} picked${d.photos.length > MAX_PICK ? " · tap a photo to swap" : ""}</div><div class="sc-thumbs">${d.photos.map((p) => `
    <div class="sc-th${p.picked ? " on" : ""}${p.data || p.err ? "" : " busy"}" data-id="${p.id}">
      <img src="${p.data || p.preview}" alt=""><i class="sc-chk">${p.picked ? "✓" : ""}</i>${p.err ? `<em class="sc-err">can't read</em>` : ""}${p.picked ? `<button class="sc-main${mainOf() === p ? " on" : ""}" data-main="${p.id}" type="button">${mainOf() === p ? "★ Main photo" : "Make main"}</button>` : ""}
      <button class="sc-x" data-del="${p.id}" aria-label="Remove photo" type="button">×</button></div>`).join("")}</div>` : "";
  t.querySelectorAll(".sc-th").forEach((el) => el.addEventListener("click", (e) => {
    if (e.target.closest("[data-del]")) return;
    const mb = e.target.closest("[data-main]"); if (mb) { d.main = mb.dataset.main; paintTray(); paintFlow(); return; }
    const p = d.photos.find((x) => x.id === el.dataset.id); if (!p || p.err) return;
    if (p.picked) { p.picked = false; if (d.main === p.id) d.main = null; } else if (d.photos.filter((x) => x.picked).length < MAX_PICK) p.picked = true; else { ctx.toast(`Already ${MAX_PICK} picked. Untick one first.`); return; }
    paintTray(); paintFlow();
  }));
  t.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { const i = d.photos.findIndex((x) => x.id === b.dataset.del); if (i >= 0) { URL.revokeObjectURL(d.photos[i].preview); d.photos.splice(i, 1); } paintTray(); paintFlow(); }));
  const dz = $("#scDrop"); if (dz) dz.classList.toggle("small", d.photos.length > 0);
  const vi = $("#scVfImg"), first = mainOf() || d.photos[0]; if (vi) { vi.hidden = !first || !!stream; if (first) vi.src = first.data || first.preview; dz && dz.classList.toggle("has", !!first && !stream); }
  if (dz && stream) dz.classList.remove("small");
  { const sn = $("#scShotN"); if (sn) sn.textContent = d.photos.length ? String(d.photos.length) : ""; }
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
  else step1 = `<div class="sc-step idle"><b>${picked ? "Ready to identify" : "No photos yet"}</b><span>${picked ? `${picked} photo${picked > 1 ? "s" : ""} ready. Tap Identify to read it.` : "Take a photo to start."}</span><button class="btn" id="scMan" type="button">Type it instead</button></div>`;
  const mkNote = d.marketState === "loading" ? "Looking up value…" : d.marketNote;
  const id = d.identity || {};
  const chips = [id.set_name, id.collector_number, id.finish].filter(Boolean).map((c) => `<i>${esc(c)}</i>`).join("");
  const money_ = `<div class="scr-money">
      <div class="scr-mkt"><em>Market value</em><input id="scMkt" inputmode="decimal" placeholder="${d.marketState === "loading" ? "…" : "0.00"}" value="${esc(mk)}" aria-label="Market value">${mkNote ? `<small>${esc(mkNote)}${d.marketState === "miss" ? ` <button type="button" class="scr-again" id="scMktRe">Look it up again</button>` : ""}</small>` : ""}</div>
      <div class="scr-mini"><label><em>You paid</em><input id="scPaid" inputmode="decimal" placeholder="0.00" value="${esc(paid)}"></label><label><em>Qty</em><input id="scQty" inputmode="numeric" value="${esc(d.qty)}"></label></div>
      ${profit != null ? `<div class="sc-profit ${profit >= 0 ? "pos" : "neg"}">${profit >= 0 ? "Profit" : "Loss"} at market <b>${profit < 0 ? "-" : ""}${money(Math.abs(profit))}</b></div>` : ""}</div>`;
  const ready = d.identity || d.title.trim();
  /* one floating card at a time: only what the next step needs */
  let card;
  if (d.idState === "ok" || d.manual && false) card = `<div class="scr-card ok"><div class="scr-top"><span class="scr-tag">Identified</span><button class="scr-link" id="scRe" type="button">Not right? Identify again</button></div><h3 class="scr-t">${esc(d.title)}</h3>${chips ? `<div class="scr-chips">${chips}</div>` : ""}${money_}
      <button class="btn go scr-go" id="scSave" type="button" ${picked ? "" : "disabled"}>Save to Ready to list</button></div>`;
  else if (d.idState === "working" || d.idState === "pick" || d.idState === "fail" || d.manual) card = `<div class="scr-card">${step1}</div>`;
  else if (picked) card = `<div class="scr-card"><div class="scr-top"><span class="scr-tag dim">${picked} photo${picked > 1 ? "s" : ""} ready</span><button class="scr-link" id="scMan" type="button">Type it in</button></div><h3 class="scr-t">Tap Identify on the camera</h3><p class="scr-p">It reads the card and fills in the name and price.</p>${money_}
      <button class="btn scr-go" id="scSave" type="button">Save without identifying</button></div>`;
  else card = `<div class="scr-card idle"><h3 class="scr-t">No photos yet</h3><p class="scr-p">Take a photo of one item, or drop photos here.</p><button class="scr-link" id="scMan" type="button">Type it in instead</button><button class="btn" id="scSave" type="button" disabled hidden>Save item</button></div>`;
  f.innerHTML = card;
  void ready;
  const sid = $("#scId"); if (sid) { sid.disabled = !picked || d.idState === "working"; if (!sid.dataset.on) { sid.dataset.on = "1"; sid.addEventListener("click", () => identify()); } }
  $("#scDrop")?.classList.toggle("scanning", d.idState === "working");
  const hd = $("#scHud"); if (hd) hd.outerHTML = hud();
  $("#scRe")?.addEventListener("click", () => identify());
  $("#scMan")?.addEventListener("click", () => { d.manual = true; paintFlow(); });
  f.querySelectorAll("[data-c]").forEach((b) => b.addEventListener("click", () => applyIdentity(d.candidates[+b.dataset.c])));
  $("#scMF")?.addEventListener("submit", (e) => { e.preventDefault(); const g = (k) => $(`#scMF [name=${k}]`).value.trim(); if (!g("n")) { ctx.toast("Type the name first."); return; } applyIdentity({ product_name: g("n"), collector_number: g("c") || "", set_name: g("s") || "", game: g("g") || "", finish: "", confidence: 1 }); d.manual = false; d.identity.typed = true; paintFlow(); });
  $("#scPaid")?.addEventListener("input", (e) => { d.paid = e.target.value; refreshProfit(); });
  $("#scMktRe")?.addEventListener("click", () => fetchMarket());
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
    <div class="sc-next"><button class="btn go" id="scNext" type="button">${ready ? "Build the listing" : "Identify it now"}</button>${ready ? `<button class="btn" id="scOpen" type="button">Put it in a bin or fix it</button>` : ""}<button class="btn" id="scAgain" type="button">Scan the next item</button></div></div>`;
  $("#scOpen")?.addEventListener("click", () => { d.photos.forEach((p) => URL.revokeObjectURL(p.preview)); d = blank(); openFocus(it.id, [String(it.id)]); });
  $("#scAgain")?.addEventListener("click", () => { d.photos.forEach((p) => URL.revokeObjectURL(p.preview)); d = blank(); paintAll(); });
  $("#scNext")?.addEventListener("click", () => { if (ready) { const bid = it.id; d.photos.forEach((p) => URL.revokeObjectURL(p.preview)); d = blank(); paintAll(); ctx.build(bid); } else { d.photos.forEach((p) => URL.revokeObjectURL(p.preview)); d = blank(); paintAll(); ctx.toast("Add the photos again to identify, or open it from Command."); } });
}
/* ---------- photo inbox: dump now, identify later ---------- */
const ibSel = new Set();
async function paintInbox() {
  const box = ctx && ctx.host.querySelector("#scInbox"); if (!box) return;
  const list = await inboxList(); if (!box.isConnected) return;
  for (const id of [...ibSel]) if (!list.some((x) => x.id === id)) ibSel.delete(id);
  const n = ibSel.size;
  box.innerHTML = `<div class="sc-qh"><h3>Photo inbox</h3><em>${list.length}</em><small>${list.length ? "Identify all at once, or pick the photos of one item" : "Dump a whole stack of scans here, front then back for each card"}</small>
      <label class="sc-qa ib-add">Dump photos<input type="file" id="ibFile" accept="image/*" multiple hidden></label>${!batchRunning() && lastBatchCount(ctx.getItems) ? `<button type="button" class="sc-qa" id="ibReview">Check last batch (${lastBatchCount(ctx.getItems)})</button>` : ""}${list.length > 1 || batchRunning() ? `<button type="button" class="sc-qa go" id="ibBatch">${batchRunning() ? "Batch running…" : `Identify all ${list.length}`}</button>` : ""}</div>
    ${list.length ? `<div class="ib-grid">${list.slice(0, 120).map((p) => `<button type="button" class="ib-t${ibSel.has(p.id) ? " on" : ""}" data-ib="${p.id}" aria-pressed="${ibSel.has(p.id)}"><img src="${p.thumb}" alt="" loading="lazy" draggable="false"><i></i></button>`).join("")}</div>
      <div class="ib-bar${n ? " on" : ""}"><b>${n ? `${n} picked` : `${list.length} photo${list.length === 1 ? "" : "s"} waiting`}</b><button type="button" class="btn" id="ibDel"${n ? "" : " disabled"}>Delete</button><button type="button" class="btn go" id="ibGo"${n ? "" : " disabled"}>Identify ${n || ""}</button></div>` : ""}`;
  box.querySelector("#ibFile").addEventListener("change", async (e) => { const fs = [...e.target.files]; e.target.value = ""; if (!fs.length) return; ctx.toast(`Adding ${fs.length} photo${fs.length === 1 ? "" : "s"} to the inbox…`); await inboxAdd(fs); ctx.toast(`${fs.length} photo${fs.length === 1 ? "" : "s"} in the inbox.`); paintInbox(); });
  box.querySelectorAll("[data-ib]").forEach((b) => b.addEventListener("click", () => { const id = b.dataset.ib; if (ibSel.has(id)) ibSel.delete(id); else { if (ibSel.size >= MAX_PICK) { ctx.toast(`Up to ${MAX_PICK} photos of one item.`); return; } ibSel.add(id); } paintInbox(); }));
  const bApi = { toast: ctx.toast, getItems: ctx.getItems, setItems: ctx.setItems, go: ctx.go, variation: ctx.variation, refresh: () => { paintInbox(); window.__fobScRepaint?.(); } };
  box.querySelector("#ibReview")?.addEventListener("click", () => reviewBatch(bApi));
  box.querySelector("#ibBatch")?.addEventListener("click", () => openBatch({ toast: ctx.toast, getItems: ctx.getItems, setItems: ctx.setItems, go: ctx.go, variation: ctx.variation, refresh: () => { paintInbox(); window.__fobScRepaint?.(); } }));
  box.querySelector("#ibDel")?.addEventListener("click", async () => { const ids = [...ibSel]; ibSel.clear(); await inboxRemove(ids); ctx.toast(`Deleted ${ids.length} photo${ids.length === 1 ? "" : "s"}.`); paintInbox(); });
  box.querySelector("#ibGo")?.addEventListener("click", () => {
    const pick = list.filter((p) => ibSel.has(p.id)); if (!pick.length) return;
    d.photos.forEach((p) => p.preview && p.preview.startsWith("blob:") && URL.revokeObjectURL(p.preview)); d = blank();
    d.photos = pick.map((p) => ({ id: nid(), preview: p.full, data: p.full, picked: true, err: false }));
    d.fromInbox = pick.map((p) => p.id); ibSel.clear(); paintAll();
    try { document.getElementById("main").scrollTo({ top: 0, behavior: "smooth" }); } catch { /* ignore */ }
    identify();
  });
}
addEventListener("fob:inbox", () => { if (ctx && ctx.host.isConnected && ctx.host.querySelector("#scInbox")) paintInbox(); });
function wireQueue() {
  paintInbox();
  ctx.host.querySelectorAll("[data-qdel]").forEach((x) => x.addEventListener("click", (e) => {
    e.stopPropagation(); e.preventDefault();
    const id = x.dataset.qdel, prev = ctx.getItems(), it = prev.find((i) => String(i.id) === String(id)); if (!it) return;
    ctx.setItems(prev.filter((i) => String(i.id) !== String(id))); paintAll();
    const undo = () => { ctx.setItems(prev); paintAll(); };
    if (ctx.toastUndo) ctx.toastUndo("Deleted " + (it.title || "item"), undo); else ctx.toast("Deleted " + (it.title || "item"));
  }));
  ctx.host.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.k === "ready") { const ids = [...ctx.host.querySelectorAll('[data-q][data-k="ready"]')].map((x) => x.dataset.q); openFocus(b.dataset.q, ids); return; }
    loadForId(b.dataset.q); try { document.getElementById("main").scrollTo({ top: 0 }); } catch { /* ignore */ }
  }));
  ctx.host.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => {
    const it = ctx.getItems().find((x) => String(x.id) === b.dataset.open); if (!it) return;
    if (phaseFromItem(it) === "intake") { loadForId(it.id); return; }
    if (phaseFromItem(it) === "staged") { const ids = [...ctx.host.querySelectorAll("[data-open]")].map((x) => x.dataset.open).filter((x) => { const y = ctx.getItems().find((z) => String(z.id) === x); return y && phaseFromItem(y) === "staged"; }); openFocus(it.id, ids); return; }
    ctx.open?.(it.id, [String(it.id)]);
  }));
  ctx.host.querySelector("#scVar")?.addEventListener("click", () => ctx.variation?.());
  ctx.host.querySelector("#scCsv")?.addEventListener("click", () => ctx.importCsv?.());
}
function wire() {
  wireQueue();
  const dz = $("#scDrop"); if (!dz) return;
  const file = $("#scFile"), cam = $("#scCamFile");
  const choose = () => file.click();
  dz.addEventListener("click", async (e) => { if (e.target.closest("button")) return; if (stream && await snap()) return; choose(); });
  dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(); } });
  $("#scPick").addEventListener("click", choose); $("#scCam").addEventListener("click", async () => { if (stream && await snap()) return; cam.click(); });
  $("#scType")?.addEventListener("click", () => { d.manual = true; paintFlow(); $("#scFlow")?.scrollIntoView({ behavior: "smooth", block: "start" }); setTimeout(() => $("#scMF [name=n]")?.focus(), 350); });
  $("#scTorch")?.addEventListener("click", async (e) => { const t = stream && stream.getVideoTracks()[0]; if (!t) return; const on = e.currentTarget.getAttribute("aria-pressed") !== "true"; try { await t.applyConstraints({ advanced: [{ torch: on }] }); e.currentTarget.setAttribute("aria-pressed", String(on)); } catch { ctx.toast("This camera has no light."); } });
  startCam();
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

export function renderScouter(host, api) {
  ctx = { host, ...api }; bindGlobals(); paintAll();
  if (window.__scReid) { const id = window.__scReid; window.__scReid = null; if (d.saved) d.saved = null; loadForId(id); }
}
