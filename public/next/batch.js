/* Batch identify: dump a stack of scans (front + back per card) and let Identify run through all of them,
   like TCGAutomate / carduploader. Each card is saved as it finishes; photos are hosted on eBay so storage never fills. */
import { inboxList, inboxRemove } from "./inbox.js?v=2";

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

async function oneCard(c, k, api) {
  c.state = "work"; c.msg = "Reading the card…"; api.paint();
  let id = null, guess = false;
  try {
    const photos = await Promise.all(c.full.map((f) => resize(f, 1000, 0.85)));
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 60000);
    const r = await fetch("/api/scouter/identify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photos, quantity: 1 }), signal: ctl.signal });
    clearTimeout(to); const out = await r.json().catch(() => ({}));
    if (out.ok && out.identity) id = out.identity; else if ((out.candidates || []).length) { id = out.candidates[0]; guess = true; }
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

export async function openBatch(api) {
  const f = window.__fob; if (!f) return;
  if (run && run.live) return sheet(api);
  const list = await inboxList();
  if (list.length < 1) { api.toast("Dump your scans in the Photo inbox first."); return; }
  let per = 2; try { per = Number(localStorage.getItem(PER_KEY)) || 2; } catch { /* default */ }
  const s = f.openSheet(`<div class="bt"><h2>Identify a batch</h2><p class="sub">${list.length} photos in the inbox, in file-name order (scanner order).</p>
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
    run = { id: `b${Date.now().toString(36)}`, live: true, cards: pairs().map((g) => ({ ids: g.map((x) => x.id), thumbs: g.map((x) => x.thumb), full: g.map((x) => x.full), state: "wait", msg: "Waiting…" })) };
    f.closeSheet(); setTimeout(() => { sheet(api); start({ ...api, paint: () => paintRun(), done: () => { api.refresh?.(); const n = run.cards.filter((c) => c.state === "ok" || c.state === "noprice").length; api.toast(`Batch done: ${n} of ${run.cards.length} ready to list.`); } }); }, 260);
  });
}

function sheet(api) {
  const f = window.__fob; f.openSheet(`<div class="bt"><h2>Identifying</h2><p class="sub" id="btSum"></p><div class="bt-bar"><div id="btFill"></div></div><div class="bt-list" id="btList"></div>
    <div class="co-znav bl-act" id="btAct"></div></div>`);
  paintRun(api);
}
let lastApi = null;
function paintRun(api) {
  if (api) lastApi = api; api = lastApi;
  const box = document.getElementById("btList"); if (!box || !run) return;
  const c = run.cards, n = c.length, fin = c.filter((x) => !["wait", "work"].includes(x.state)).length, ok = c.filter((x) => x.state === "ok" || x.state === "noprice").length, need = c.filter((x) => x.state === "guess" || x.state === "fail").length;
  document.getElementById("btSum").textContent = run.live ? `${fin} of ${n} done · ${ok} ready to list${need ? ` · ${need} need you` : ""}. Keep using the app, it keeps going.` : `Done: ${ok} ready to list${need ? `, ${need} need you (they're in Intake)` : ""}.`;
  document.getElementById("btFill").style.width = `${Math.round((fin / n) * 100)}%`;
  box.innerHTML = c.map((x, k) => `<div class="bt-row ${x.state}"><span class="bt-th">${x.thumbs.map((t) => `<img src="${t}" alt="">`).join("")}</span><span class="bt-tx"><b>${esc(x.title || `Card ${k + 1}`)}</b><small>${esc(x.msg)}</small></span><i class="bt-st" aria-hidden="true"></i></div>`).join("");
  const act = document.getElementById("btAct");
  if (act && !run.live && !act.dataset.on) {
    act.dataset.on = "1";
    const ids = c.filter((x) => x.itemId && (x.state === "ok" || x.state === "noprice")).map((x) => x.itemId);
    act.innerHTML = `<button type="button" class="btn" data-close>Close</button>${ids.length > 1 ? `<button type="button" class="btn" id="btVar">List as one variation listing</button>` : ""}<button type="button" class="btn go" id="btList2">Go to Ready to list</button>`;
    act.querySelector("[data-close]").addEventListener("click", () => window.__fob.closeSheet());
    act.querySelector("#btList2").addEventListener("click", () => { window.__fob.closeSheet(); api.go?.("command"); setTimeout(() => document.querySelector('.stop[data-drop="staged"] .tag')?.click(), 400); });
    act.querySelector("#btVar")?.addEventListener("click", () => { window.__fob.closeSheet(); setTimeout(() => api.variation?.(), 260); });
  }
}
export const batchRunning = () => !!(run && run.live);
