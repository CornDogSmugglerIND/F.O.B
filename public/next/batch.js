/* Batch identify: dump a stack of scans (front + back per card) and let Identify run through all of them,
   like TCGAutomate / carduploader. Each card is saved as it finishes; photos are hosted on eBay so storage never fills. */
import { inboxList, inboxRemove } from "./inbox.js?v=3";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "$" + (Number(n) || 0).toFixed(2);
const PER_KEY = "fob-batch-per";
let run = null; /* { cards:[{ids, thumbs, full, state, title, price, itemId, msg}], done, live } survives closing the sheet */

function resize(dataUrl, max, q = 0.85) {
  return new Promise((res) => { const im = new Image(); im.onload = () => { const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)); const c = document.createElement("canvas"); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", q)); }; im.onerror = () => res(dataUrl); im.src = dataUrl; });
}
const nid = (k) => `sc-${Date.now().toString(36)}-b${k}${Math.random().toString(36).slice(2, 5)}`;

async function hostPhoto(dataUrl) {
  try { const r = await fetch("/api/channels/ebay/upload-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl: await resize(dataUrl, 1600, 0.88) }) }); const o = await r.json(); if (o.ok && o.url) return o.url; } catch { /* fall back */ }
  return resize(dataUrl, 600, 0.78); /* small copy on the device if eBay can't take it right now */
}

/* how sure we are, as a %: a match the card catalog confirms by set + number beats the photo read alone */
function matchPct(id, guess) {
  if (guess) return 45;
  const cat = /tcgdex|pokemontcg|scryfall|catalog/i.test(id.source || ""), c = String(id.confidence || "").toLowerCase();
  return c === "high" ? (cat ? 97 : 86) : c === "medium" ? (cat ? 80 : 70) : cat ? 66 : 52;
}
async function oneCard(c, k, api) {
  c.state = "work"; c.msg = "Reading the card…"; api.paint();
  let id = null, guess = false, alts = [];
  try {
    const photos = await Promise.all(c.full.map((f) => resize(f, 1000, 0.85)));
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 60000);
    const r = await fetch("/api/scouter/identify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photos, quantity: 1 }), signal: ctl.signal });
    clearTimeout(to); const out = await r.json().catch(() => ({}));
    if (out.ok && out.identity) id = out.identity; else if ((out.candidates || []).length) { id = out.candidates[0]; guess = true; }
    const seen = new Set(); alts = (out.candidates || []).filter((x) => x.image && x !== id).filter((x) => { const k = [x.product_name, x.collector_number, x.set_name].join("|"); if (seen.has(k) || (id && k === [id.product_name, id.collector_number, id.set_name].join("|"))) return false; seen.add(k); return true; }).slice(0, 4).map((x) => ({ product_name: x.product_name, collector_number: x.collector_number, set_name: x.set_name, set_code: x.set_code, game: x.game, rarity: x.rarity, image: x.image }));
  } catch { /* stays unidentified */ }
  let price = 0, basis = "";
  if (id) {
    c.msg = "Looking up the price…"; api.paint();
    try { const qs = new URLSearchParams({ q: [id.product_name, id.collector_number, id.set_name].filter(Boolean).join(" "), name: id.product_name || "", number: id.collector_number || "", set: id.set_name || "", finish: id.finish || "", game: id.game || "" }); const m = await (await fetch(`/api/scouter/comps?${qs}`)).json(); if (m.ok) { price = Number(m.value) || 0; basis = m.basis || ""; } } catch { /* no price */ }
  }
  c.msg = "Saving photos…"; api.paint();
  const photos = []; for (const f of c.full) photos.push({ id: nid(k), dataUrl: await hostPhoto(f), createdAt: new Date().toISOString() });
  const title = id ? [id.product_name, id.collector_number, id.set_name, id.finish].filter(Boolean).join(" ").trim() : "";
  const ready = !!id && !guess;
  const now = new Date().toISOString(), item = {
    id: nid(k), createdAt: now, updatedAt: now, title: title || `Batch card ${k + 1}`, productName: id?.product_name || "",
    collectorNumber: id?.collector_number || "", setName: id?.set_name || "", setCode: id?.set_code || "", game: id?.game || "", rarity: id?.rarity || "", finish: id?.finish || "",
    language: id?.language || "", condition: "NM", identifyConfidence: id?.confidence || null, identifyPath: id ? "batch" : null,
    quantity: 1, price, source: "scouter", listingStatus: "draft", phase: ready ? "staged" : "intake", staged: ready, spaceId: null, channels: {}, photos, notes: guess ? "Batch best guess: check it" : "", collections: [], batch: run.id,
    match: id ? { image: id.image || (alts[0] && alts[0].image) || "", pct: matchPct(id, guess), basis } : { image: "", pct: 0, basis: "" }, matchAlts: alts,
  };
  try { api.setItems([item, ...api.getItems()]); } catch { c.state = "fail"; c.msg = "Phone storage is full. Clear space in Settings."; api.paint(); return; }
  inboxRemove(c.ids).catch(() => {});
  Object.assign(c, { itemId: item.id, title: item.title, price, state: ready ? (price ? "ok" : "noprice") : id ? "guess" : "fail", msg: ready ? (price ? `${money(price)}${basis ? ` · ${basis}` : ""}` : "Identified. No price found, add one when you list it.") : id ? "Best guess. Check it before listing." : "Couldn't identify. It's in Intake for you to fix." });
  api.paint();
}

async function start(api) {
  const q = run.cards.map((c, k) => [c, k]), workers = 3;
  await Promise.all(Array.from({ length: workers }, async () => { while (q.length) { const [c, k] = q.shift(); if (c.state === "wait") await oneCard(c, k, api); } }));
  run.live = false; api.paint(); api.done();
}

async function sig(src) {
  return new Promise((res) => { const im = new Image(); im.onload = () => { const c = document.createElement("canvas"); c.width = 12; c.height = 16; const g = c.getContext("2d"); g.drawImage(im, 0, 0, 12, 16); const d = g.getImageData(0, 0, 12, 16).data, v = []; for (let i = 0; i < d.length; i += 4) v.push(d[i], d[i + 1], d[i + 2]); res(v); }; im.onerror = () => res(null); im.src = src; });
}
const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
const spread = (vs) => { let s = 0, n = 0; for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) { s += dist(vs[i], vs[j]); n++; } return n ? s / n : 0; };
export async function detectPer(list) {
  if (list.length < 4) return 0;
  const v = (await Promise.all(list.slice(0, 40).map((x) => sig(x.thumb)))); if (v.some((x) => !x)) return 0;
  const odd = v.filter((_, i) => i % 2 === 1), even = v.filter((_, i) => i % 2 === 0), all = spread(v), o = spread(odd), e = spread(even);
  if (o < e * 0.45 && o < all * 0.55) return 2; /* every 2nd photo is the same card back */
  return 1;
}
export async function openBatch(api) {
  const f = window.__fob; if (!f) return;
  if (run && run.live) return sheet(api);
  const list = await inboxList();
  if (list.length < 1) { api.toast("Dump your scans in the Photo inbox first."); return; }
  let per = 2; try { per = Number(localStorage.getItem(PER_KEY)) || 2; } catch { /* default */ }
  /* front+back or fronts only? card backs all look alike, fronts don't: compare the even photos to each other vs the odd ones */
  const auto = await detectPer(list); if (auto) per = auto;
  const s = f.openSheet(`<div class="bt"><h2>Identify a batch</h2><p class="sub">${list.length} photos in the inbox, in scan order.${auto ? ` Looks like <b>${auto === 2 ? "front + back" : "fronts only"}</b>: change it below if not.` : ""}</p>
    <div class="bt-per" role="radiogroup" aria-label="Photos per card"><span>Photos per card</span>${[[2, "Front + back"], [1, "Front only"]].map(([n, l]) => `<button type="button" role="radio" class="bt-pb${per === n ? " on" : ""}" data-per="${n}" aria-checked="${per === n}">${l}</button>`).join("")}</div>
    <div class="bt-pairs" id="btPairs"></div>
    <p class="sub" id="btNote"></p>
    <div class="co-znav bl-act"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn go" id="btGo">Identify all</button></div></div>`);
  const pairs = () => { const out = []; for (let i = 0; i < list.length; i += per) out.push(list.slice(i, i + per)); return out; };
  const draw = () => { const p = pairs(); s.querySelector("#btPairs").innerHTML = p.slice(0, 60).map((g, k) => `<div class="bt-pair"><b>${k + 1}</b>${g.map((x) => `<img src="${x.thumb}" alt="">`).join("")}</div>`).join("") + (p.length > 60 ? `<div class="bt-more">+${p.length - 60} more</div>` : "");
    const odd = per === 2 && list.length % 2 === 1;
    s.querySelector("#btNote").textContent = `${p.length} card${p.length === 1 ? "" : "s"}. ${odd ? "Odd number of photos: the last card only has a front. " : ""}Check the first few pairs look right, then Identify all.`;
    s.querySelector("#btGo").textContent = `Identify all ${p.length}`; };
  draw();
  s.querySelectorAll("[data-per]").forEach((b) => b.addEventListener("click", () => { per = Number(b.dataset.per); try { localStorage.setItem(PER_KEY, String(per)); } catch { /* ignore */ } s.querySelectorAll("[data-per]").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", String(x === b)); }); draw(); }));
  s.querySelector("[data-close]").addEventListener("click", () => f.closeSheet());
  s.querySelector("#btGo").addEventListener("click", () => {
    run = { id: `b${Date.now().toString(36)}`, live: true, at: Date.now(), cards: pairs().map((g) => ({ ids: g.map((x) => x.id), thumbs: g.map((x) => x.thumb), full: g.map((x) => x.full), state: "wait", msg: "Waiting…" })) };
    try { localStorage.setItem("fob-last-batch", run.id); } catch { /* ignore */ }
    f.closeSheet(); setTimeout(() => { sheet(api); start({ ...api, paint: () => paintRun(), done: () => { api.refresh?.(); const n = run.cards.filter((c) => c.state === "ok" || c.state === "noprice").length; api.toast(`Batch done: ${n} of ${run.cards.length} ready to list.`); } }); }, 260);
  });
}

function sheet(api, title = "Identifying") {
  const f = window.__fob; const sh = f.openSheet(`<div class="bt"><h2>${title}</h2><p class="sub" id="btSum"></p><div class="bt-bar"><div id="btFill"></div></div><div class="bt-list" id="btList"></div>
    <div class="co-znav bl-act" id="btAct"></div></div>`);
  sh.querySelector("#btList").addEventListener("click", (e) => onListClick(e));
  sh.querySelector("#btList").addEventListener("input", (e) => { if (e.target.matches("[data-fq]")) { clearTimeout(qT); qT = setTimeout(() => search(e.target.closest(".bt-row")), 350); } });
  paintRun(api);
}
let lastApi = null, qT = 0, openFix = null;
const items = () => { try { return lastApi.getItems(); } catch { return []; } };
const pctCls = (p) => (p >= 90 ? "hi" : p >= 70 ? "md" : "lo");
function rowHtml(c, k, it) {
  const scans = it ? (it.photos || []).slice(0, 2).map((p) => p.dataUrl || p.url) : c.thumbs;
  const m = it?.match || {}, pct = m.pct || 0, done = it && !["wait", "work"].includes(c.state);
  const sub = it ? [it.setName, it.collectorNumber].filter(Boolean).join(" · ") : "";
  return `<div class="bt-row ${c.state}${openFix === (it?.id || "") && it ? " fixing" : ""}" data-it="${esc(it?.id || "")}" data-k="${k}">
    <span class="bt-th">${scans.map((t) => `<img src="${esc(t)}" alt="Your scan" data-view-photo="${esc(JSON.stringify(scans))}">`).join("")}</span>
    <span class="bt-ref">${m.image ? `<img src="${esc(m.image)}" alt="Matched card" data-view-photo="${esc(JSON.stringify([m.image.replace("/low.", "/high.")]))}">` : `<i>${done ? "?" : ""}</i>`}</span>
    <span class="bt-tx"><b>${esc(it?.productName || it?.title || c.title || `Card ${k + 1}`)}</b><small>${done ? esc(sub || c.msg) : esc(c.msg)}</small>${done && it?.price ? `<em>${money(it.price)}</em>` : ""}</span>
    <span class="bt-side">${done ? `<b class="bt-pct ${pctCls(pct)}">${pct ? `${pct}%` : "No match"}</b><button type="button" class="bt-fix" data-fix>${pct >= 90 ? "Wrong?" : "Fix"}</button>` : `<i class="bt-st" aria-hidden="true"></i>`}</span>
    ${openFix === it?.id && it ? fixHtml(it) : ""}</div>`;
}
function fixHtml(it) {
  const q = [it.productName, (it.collectorNumber || "").split("/")[0]].filter(Boolean).join(" ");
  const alts = (it.matchAlts || []).map((a, j) => pickTile(a, `alt${j}`)).join("");
  return `<div class="bt-fixp">${alts ? `<div class="bt-fh">Other matches</div><div class="bt-grid" data-alts>${alts}</div>` : ""}
    <div class="bt-fh">Search for the right card</div><input data-fq value="${esc(q)}" placeholder="Name and number, like Pikachu 25" aria-label="Search cards" autocomplete="off">
    <div class="bt-grid" data-res><p class="sub">Searching…</p></div></div>`;
}
const pickTile = (r, key) => `<button type="button" class="bt-pick" data-pick='${esc(JSON.stringify(r))}' aria-label="${esc(`${r.product_name} ${r.collector_number} ${r.set_name}`)}"><img src="${esc(r.image)}" alt="" loading="lazy"><b>${esc(r.product_name)}</b><small>${esc(`${r.collector_number || ""} · ${r.set_name || ""}`)}</small></button>`;
async function search(row) {
  const inp = row?.querySelector("[data-fq]"), box = row?.querySelector("[data-res]"); if (!inp || !box) return;
  const q = inp.value.trim(); if (q.length < 2) { box.innerHTML = `<p class="sub">Type a name or number.</p>`; return; }
  box.innerHTML = `<p class="sub">Searching…</p>`;
  try { const r = await (await fetch(`/api/scouter/search?q=${encodeURIComponent(q)}`)).json(); if (!box.isConnected || inp.value.trim() !== q) return;
    box.innerHTML = (r.results || []).length ? r.results.map((x) => pickTile(x)).join("") : `<p class="sub">No cards found. Search covers Pokémon. For other games, fix it in Scouter by typing it in.</p>`; }
  catch { box.innerHTML = `<p class="sub">Couldn't search. Try again.</p>`; }
}
async function onListClick(e) {
  const row = e.target.closest(".bt-row"); if (!row) return;
  if (e.target.closest("[data-fix]")) { const id = row.dataset.it; openFix = openFix === id ? null : id; paintRun(); if (openFix) { const r = document.querySelector(`.bt-row[data-it="${CSS.escape(id)}"]`); r?.scrollIntoView({ behavior: "smooth", block: "start" }); search(r); } return; }
  const pick = e.target.closest("[data-pick]"); if (!pick) return;
  const r = JSON.parse(pick.dataset.pick), id = row.dataset.it; pick.classList.add("busy");
  let rarity = r.rarity || "", finish = "";
  if (r.id) { try { const d = await (await fetch(`/api/scouter/card/${encodeURIComponent(r.id)}`)).json(); if (d.ok) { rarity = d.rarity || rarity; finish = d.finish || ""; } } catch { /* keep */ } }
  let price = 0, basis = "";
  try { const qs = new URLSearchParams({ q: [r.product_name, r.collector_number, r.set_name].join(" "), name: r.product_name, number: r.collector_number || "", set: r.set_name || "", finish, game: r.game || "pokemon" }); const m = await (await fetch(`/api/scouter/comps?${qs}`)).json(); if (m.ok) { price = Number(m.value) || 0; basis = m.basis || ""; } } catch { /* no price */ }
  const l = items(), it = l.find((x) => String(x.id) === String(id)); if (!it) return;
  Object.assign(it, { productName: r.product_name, collectorNumber: r.collector_number || "", setName: r.set_name || "", setCode: r.set_code || "", game: r.game || it.game, rarity, finish,
    title: [r.product_name, r.collector_number, r.set_name, finish].filter(Boolean).join(" "), price: price || it.price, phase: "staged", staged: true, notes: "", description: "", descEdited: false, aspects: undefined,
    match: { image: r.image, pct: 100, basis: "You picked it" }, identifyPath: "batch-picked", updatedAt: new Date().toISOString() });
  lastApi.setItems(l);
  const c = run && run.cards.find((x) => x.itemId === id); if (c) { c.state = price ? "ok" : "noprice"; c.msg = ""; }
  openFix = null; paintRun(); lastApi.toast(`Fixed: ${it.title}${price ? ` · ${money(price)}` : ""}`);
}
function paintRun(api) {
  if (api) lastApi = api; api = lastApi;
  const box = document.getElementById("btList"); if (!box || !run) return;
  const map = new Map(items().map((i) => [String(i.id), i]));
  const c = run.cards, n = c.length, fin = c.filter((x) => !["wait", "work"].includes(x.state)).length;
  const low = c.filter((x) => { const it = map.get(String(x.itemId)); return it && (it.match?.pct || 0) < 90; }).length, ok = c.filter((x) => { const it = map.get(String(x.itemId)); return it && it.phase === "staged"; }).length;
  document.getElementById("btSum").textContent = run.live ? `${fin} of ${n} done. Keep using the app, it keeps going.` : `${ok} of ${n} ready to list.${low ? ` ${low} under 90%: check the match, tap Fix if it's wrong.` : " Every match is 90% or better."}`;
  { const h = box.closest(".bt")?.querySelector("h2"); if (h && !run.live) h.textContent = "Check the batch"; }
  document.getElementById("btFill").style.width = `${Math.round((fin / n) * 100)}%`;
  /* sort: shakiest matches first once it's done, so you check those */
  const order = c.map((x, k) => [x, k]); if (!run.live) order.sort((a, b) => ((map.get(String(a[0].itemId))?.match?.pct) ?? -1) - ((map.get(String(b[0].itemId))?.match?.pct) ?? -1));
  const keepQ = document.activeElement?.matches?.("[data-fq]") ? [document.activeElement.value, document.activeElement.selectionStart] : null, keepRes = box.querySelector(".fixing [data-res]")?.innerHTML;
  box.innerHTML = order.map(([x, k]) => rowHtml(x, k, map.get(String(x.itemId)))).join("");
  if (keepQ) { const q = box.querySelector("[data-fq]"); if (q) { q.value = keepQ[0]; q.focus(); q.setSelectionRange(keepQ[1], keepQ[1]); } }
  if (keepRes) { const r = box.querySelector(".fixing [data-res]"); if (r) r.innerHTML = keepRes; }
  const act = document.getElementById("btAct");
  if (act && !run.live && !act.dataset.on) {
    act.dataset.on = "1";
    act.innerHTML = `<button type="button" class="btn" data-close>Close</button><button type="button" class="btn" id="btVar">List as one variation listing</button><button type="button" class="btn go" id="btList2">Go to Ready to list</button>`;
    act.querySelector("[data-close]").addEventListener("click", () => window.__fob.closeSheet());
    act.querySelector("#btList2").addEventListener("click", () => { window.__fob.closeSheet(); api.go?.("command"); setTimeout(() => document.querySelector('.stop[data-drop="staged"] .tag')?.click(), 400); });
    act.querySelector("#btVar").addEventListener("click", () => { window.__fob.closeSheet(); setTimeout(() => api.variation?.(), 260); });
  }
}
/* reopen the last batch any time to check matches */
export function reviewBatch(api) {
  lastApi = api; let id = ""; try { id = localStorage.getItem("fob-last-batch") || ""; } catch { /* none */ }
  if (run && run.live) return sheet(api);
  const list = api.getItems().filter((i) => i.batch && i.batch === id); if (!list.length) { api.toast("No batch to review yet."); return; }
  run = { id, live: false, cards: list.map((i) => ({ itemId: i.id, ids: [], thumbs: [], full: [], state: i.phase === "staged" ? (i.price ? "ok" : "noprice") : "guess", msg: "" })) };
  sheet(api, "Check the batch");
}
export const lastBatchCount = (getItems) => { let id = ""; try { id = localStorage.getItem("fob-last-batch") || ""; } catch { return 0; } return id ? getItems().filter((i) => i.batch === id && ["staged", "intake"].includes(i.phase)).length : 0; };
export const batchRunning = () => !!(run && run.live);
