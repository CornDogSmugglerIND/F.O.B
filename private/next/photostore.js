/* Card photos live in IndexedDB, not localStorage (Nov 12).
   localStorage caps out near 5MB. A stored card photo is ~200KB, so the item
   list stopped saving at about 20 cards and everything after that was lost.
   Photos move here; the item list keeps only {id, idb:1}, which is bytes.

   photoOf() has to stay synchronous - every screen calls it while rendering -
   so blobs are turned into object URLs once and held in a map. warm() fills
   that map, then the app repaints. */
const DB = "fob-photos", ST = "blobs";
let dbp = null;
const url = new Map();      /* photo id -> object URL */
const pending = new Set();  /* ids being fetched right now */
let onReady = null;         /* called after a batch of urls appears */
let readyTimer = 0;

function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    let r; try { r = indexedDB.open(DB, 1); } catch (e) { rej(e); return; }
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(ST)) r.result.createObjectStore(ST, { keyPath: "id" }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }).catch(() => null);
  return dbp;
}
async function tx(mode, fn) {
  const d = await db(); if (!d) return null;
  return new Promise((res) => {
    let t; try { t = d.transaction(ST, mode); } catch { res(null); return; }
    const s = t.objectStore(ST), out = fn(s);
    t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
    t.onerror = t.onabort = () => res(null);
  });
}
function toBlob(dataUrl) {
  const i = String(dataUrl).indexOf(",");
  if (i < 0) return null;
  const head = dataUrl.slice(0, i), body = dataUrl.slice(i + 1);
  const type = (head.match(/^data:([^;,]+)/) || [, "image/jpeg"])[1];
  if (!/;base64/i.test(head)) return new Blob([decodeURIComponent(body)], { type });
  try {
    const bin = atob(body), arr = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
    return new Blob([arr], { type });
  } catch { return null; }
}
function ping() { if (readyTimer) return; readyTimer = setTimeout(() => { readyTimer = 0; onReady?.(); }, 60); }

export function setOnReady(fn) { onReady = fn; }
/* sync: the url if we have it, "" if it is still loading */
export function urlFor(id) { return url.get(String(id)) || ""; }
export function has(id) { return url.has(String(id)); }

export async function put(id, dataUrl) {
  const b = toBlob(dataUrl); if (!b) return false;
  const ok = await tx("readwrite", (s) => s.put({ id: String(id), blob: b }));
  if (ok !== null) { if (!url.has(String(id))) url.set(String(id), URL.createObjectURL(b)); return true; }
  return false;
}
export async function load(ids) {
  const want = [...new Set(ids.map(String))].filter((i) => i && !url.has(i) && !pending.has(i));
  if (!want.length) return 0;
  want.forEach((i) => pending.add(i));
  let n = 0;
  for (const id of want) {
    const rec = await tx("readonly", (s) => s.get(id));
    pending.delete(id);
    if (rec && rec.blob) { url.set(id, URL.createObjectURL(rec.blob)); n++; if (n % 24 === 0) ping(); }
  }
  if (n) ping();
  return n;
}
export async function drop(ids) {
  for (const id of [...new Set(ids.map(String))]) {
    await tx("readwrite", (s) => s.delete(id));
    const u = url.get(id); if (u) { URL.revokeObjectURL(u); url.delete(id); }
  }
}
/* Pull every inline dataUrl out of the item list into IndexedDB.
   Returns true when something moved, so the caller knows to save. */
export async function migrate(items) {
  let moved = 0;
  for (const it of items || []) {
    for (const p of it.photos || []) {
      if (!p || !p.dataUrl || !/^data:/.test(p.dataUrl)) continue;
      if (!p.id) p.id = "ph-" + Math.random().toString(36).slice(2, 10);
      if (await put(p.id, p.dataUrl)) { delete p.dataUrl; p.idb = 1; moved++; }
    }
  }
  return moved;
}
/* every photo id in the list that needs an object URL */
export function idsIn(items) {
  const out = [];
  for (const it of items || []) for (const p of it.photos || []) if (p && p.idb && p.id) out.push(p.id);
  return out;
}
