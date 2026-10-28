/* Scanner link: finished scan batches from the Mac (collage.py -> fob_push.py -> /api/identify/queue)
   land in this device's Photo inbox automatically. A scan leaves the queue once it's identified or deleted on any device. */
import { inboxAdd, inboxList, inboxRemove } from "./inbox.js?v=3";

let busy = false;
export async function pullScans({ toast } = {}) {
  if (busy) return 0; busy = true;
  try {
    const r = await fetch("/api/identify/queue", { cache: "no-store" }); if (!r.ok) return 0;
    const q = await r.json(); if (!q.ok) return 0;
    const live = new Set(q.entries.map((e) => e.path)), local = await inboxList();
    /* identified/deleted on another device: drop it here too */
    const gone = local.filter((x) => x.remote && !live.has(x.remote)).map((x) => x.id);
    if (gone.length) await inboxRemove(gone, { keepRemote: true });
    const have = new Set(local.map((x) => x.remote).filter(Boolean)), fresh = q.entries.filter((e) => !have.has(e.path));
    if (!fresh.length) return 0;
    const files = [];
    for (const e of fresh) {
      try {
        const b = await (await fetch(`/api/identify/queue/photo?path=${encodeURIComponent(e.path)}`)).blob(); if (!b.size) continue;
        const f = new File([b], `${e.batch}_${String(e.seq).padStart(5, "0")}.jpg`, { type: b.type || "image/jpeg" }); f._remote = e.path; f._batch = e.batch; files.push(f);
      } catch { /* try again next pull */ }
    }
    if (files.length) { await inboxAdd(files); const names = [...new Set(files.map((f) => f._batch))]; toast?.(`📥 ${files.length} scan${files.length === 1 ? "" : "s"} arrived from the scanner (${names.join(", ")}). They're in Scouter's Photo inbox.`); }
    return files.length;
  } catch { return 0; } finally { busy = false; }
}
export function startScanLink(api) {
  /* each check lists the queue (a scarce Blob "advanced" op), so: on open, when the app comes back into view (max once a minute), and every 10 min while visible */
  let last = 0; const go = (force) => { if (document.hidden || (!force && Date.now() - last < 60000)) return; last = Date.now(); pullScans(api); };
  setTimeout(() => go(true), 2500); setInterval(() => go(true), 10 * 60 * 1000);
  document.addEventListener("visibilitychange", () => go());
}
