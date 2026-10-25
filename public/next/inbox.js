/* Photo inbox: dump any number of photos at the start of intake, run them through the Scouter later.
   Photos live in IndexedDB (device storage), not in the item list, so a big dump never fills the app's storage. */
const DB = "fob-inbox", ST = "photos";
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: "id" }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return dbp;
}
const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(ST, mode), s = t.objectStore(ST); const out = fn(s); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); }); };
const nid = () => "ib-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

async function shrink(file, max, q) {
  let bmp = null; try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* fall back */ }
  if (!bmp) bmp = await new Promise((res, rej) => { const im = new Image(), u = URL.createObjectURL(file); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = rej; im.src = u; });
  const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight, k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k)); c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return c.toDataURL("image/jpeg", q);
}

export async function inboxAdd(files, onProgress) {
  const imgs = [...files].filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(f.name || ""));
  let done = 0;
  for (const f of imgs) {
    try {
      const full = await shrink(f, 1000, .82), thumb = await shrink(f, 240, .7);
      await tx("readwrite", (s) => s.put({ id: nid(), full, thumb, name: f.name || "", createdAt: Date.now() + done }));
    } catch { /* skip unreadable photo */ }
    done++; onProgress && onProgress(done, imgs.length);
  }
  window.__fobInboxN = await inboxCount(); dispatchEvent(new CustomEvent("fob:inbox"));
  return imgs.length;
}
export async function inboxList() { try { const all = await tx("readonly", (s) => s.getAll()); return (all || []).sort((a, b) => a.createdAt - b.createdAt); } catch { return []; } }
export async function inboxCount() { try { return await tx("readonly", (s) => s.count()); } catch { return 0; } }
export async function inboxRemove(ids) { if (!ids.length) return; await tx("readwrite", (s) => { ids.forEach((id) => s.delete(id)); }); window.__fobInboxN = await inboxCount(); dispatchEvent(new CustomEvent("fob:inbox")); }
inboxCount().then((n) => { window.__fobInboxN = n; dispatchEvent(new CustomEvent("fob:inbox")); });
