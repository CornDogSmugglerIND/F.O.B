/** Scanner -> app intake queue.
 * The Mac pipeline (collage.py -> fob_push.py) POSTs each scan of a finished batch here.
 * Scans are kept as private Blobs under coalition/intake/<batch>/<seq>__<file>; the listing IS the queue.
 * Every device pulls them into its Photo inbox; a scan leaves the queue once it's identified on any device. */
import { Router } from "express";

const ROOT = "coalition/intake/";
const MAX_AGE_DAYS = 21;
function token() { const k = Object.keys(process.env).find((n) => /READ_WRITE_TOKEN$/.test(n) && process.env[n]); return k ? process.env[k] : ""; }
const safe = (s, n = 80) => String(s || "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, n);
export function parsePath(p) {
  const m = String(p).slice(ROOT.length).match(/^([^/]+)\/(\d+)__(.+)$/); if (!m) return null;
  return { path: p, batch: m[1], seq: Number(m[2]), file: m[3] };
}
function keyOk(req) { const k = process.env.FOB_INTAKE_KEY; return !k || req.get("x-fob-key") === k; }

export function identifyQueueRouter() {
  const r = Router();
  r.use((req, res, next) => { if (!token()) return res.status(503).json({ ok: false, error: "Durable storage isn't attached." }); next(); });

  /* what's waiting, oldest batch first, scan order inside a batch */
  r.get("/", async (_req, res) => {
    try {
      const { list, del } = await import("../kv.js"); const t = token(); let cursor, blobs = [];
      do { const page = await list({ prefix: ROOT, cursor, limit: 1000, token: t }); blobs = blobs.concat(page.blobs); cursor = page.hasMore ? page.cursor : undefined; } while (cursor);
      const old = Date.now() - MAX_AGE_DAYS * 864e5, stale = blobs.filter((b) => Date.parse(b.uploadedAt) < old).map((b) => b.url);
      if (stale.length) del(stale, { token: t }).catch(() => {});
      const entries = blobs.filter((b) => Date.parse(b.uploadedAt) >= old).map((b) => { const p = parsePath(b.pathname); return p && { ...p, size: b.size, uploadedAt: b.uploadedAt }; }).filter(Boolean)
        .sort((a, b) => a.batch.localeCompare(b.batch) || a.seq - b.seq);
      const batches = [...new Set(entries.map((e) => e.batch))].map((b) => ({ batch: b, count: entries.filter((e) => e.batch === b).length }));
      res.json({ ok: true, count: entries.length, batches, entries });
    } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
  });

  /* one scan in: { batch, file, seq, dataUrl } (one per request keeps every call small) */
  r.post("/", async (req, res) => {
    if (!keyOk(req)) return res.status(401).json({ ok: false, error: "Wrong intake key." });
    const b = req.body || {}, m = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i.exec(String(b.dataUrl || ""));
    const batch = safe(b.batch), file = safe(b.file || `scan_${b.seq}.jpg`, 120), seq = Math.max(0, parseInt(b.seq, 10) || 0);
    if (!batch) return res.status(400).json({ ok: false, error: "batch is required." });
    if (!m) return res.status(400).json({ ok: false, error: "dataUrl must be a base64 image." });
    try {
      const { put } = await import("../kv.js");
      const path = `${ROOT}${batch}/${String(seq).padStart(5, "0")}__${file}`;
      await put(path, Buffer.from(m[2], "base64"), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: `image/${m[1].toLowerCase() === "jpg" ? "jpeg" : m[1].toLowerCase()}`, token: token() });
      res.json({ ok: true, path, batch, seq, file });
    } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
  });

  /* the scan itself, for the app to pull into its inbox */
  r.get("/photo", async (req, res) => {
    const p = String(req.query.path || ""); if (!p.startsWith(ROOT) || p.includes("..")) return res.status(400).json({ ok: false, error: "Bad path." });
    try {
      const { get } = await import("../kv.js"); const g = await get(p, { access: "private", token: token() });
      if (!g || g.statusCode !== 200) return res.status(404).json({ ok: false, error: "Not found." });
      res.set("Content-Type", g.blob?.contentType || "image/jpeg"); res.set("Cache-Control", "private, max-age=3600");
      res.send(Buffer.from(await new Response(g.stream).arrayBuffer()));
    } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
  });

  /* done with these (identified on some device) */
  r.delete("/", async (req, res) => {
    const paths = (Array.isArray(req.body?.paths) ? req.body.paths : []).filter((p) => typeof p === "string" && p.startsWith(ROOT) && !p.includes("..")).slice(0, 500);
    if (!paths.length) return res.json({ ok: true, removed: 0 });
    try { const { del } = await import("../kv.js"); await del(paths, { token: token() }); res.json({ ok: true, removed: paths.length }); }
    catch (e) { res.status(502).json({ ok: false, error: e.message }); }
  });
  return r;
}
