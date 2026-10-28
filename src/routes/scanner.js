/** Scanner connection: F.O.B <-> the F.O.B Scan desktop helper.
 * The helper talks to the Cloudflare worker directly (device token from pairing).
 * This router is the app's side: get a pairing code, see paired computers + their scanners, press Scan. */
import { Router } from "express";

const CF = () => (process.env.CF_STORE_URL && process.env.CF_STORE_KEY) ? { url: process.env.CF_STORE_URL.replace(/\/$/, ""), key: process.env.CF_STORE_KEY } : null;
const ACCOUNT = "default"; // one account until logins/subscriptions land

async function cf(path, { method = "GET", body } = {}) {
  const c = CF(); if (!c) { const e = new Error("Scanner service isn't set up."); e.status = 503; throw e; }
  const r = await fetch(`${c.url}${path}${path.includes("?") ? "&" : "?"}account=${ACCOUNT}`, { method, headers: { "x-store-key": c.key, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({})); if (!r.ok || d.ok === false) { const e = new Error(d.error || `Scanner service said ${r.status}`); e.status = r.status; throw e; }
  return d;
}
const wrap = (fn) => async (req, res) => { try { res.json(await fn(req)); } catch (e) { res.status(e.status || 502).json({ ok: false, error: e.message }); } };

export function scannerRouter() {
  const r = Router();
  r.post("/pair", wrap(() => cf("/scan/pair-start", { method: "POST", body: {} })));
  r.get("/devices", wrap(() => cf("/scan/devices")));
  r.post("/scan", wrap((req) => {
    const b = req.body || {};
    return cf("/scan/cmd", { method: "POST", body: { device: String(b.device || ""), cmd: { action: "scan", duplex: !!b.duplex, dpi: Number(b.dpi) || 300, batch: String(b.batch || "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60) } } });
  }));
  r.post("/stop", wrap((req) => cf("/scan/cmd", { method: "POST", body: { device: String(req.body?.device || ""), cmd: { action: "stop" } } })));
  r.post("/forget", wrap((req) => cf("/scan/forget", { method: "POST", body: { device: String(req.body?.device || "") } })));
  /* the desktop app installer, kept in the store so a new build doesn't need a site deploy */
  r.get("/download/mac", async (_req, res) => {
    try {
      const { get } = await import("../kv.js"); const g = await get("downloads/FOB-Scan-mac.zip");
      if (!g || g.statusCode !== 200) return res.status(404).send("Not built yet.");
      res.set("Content-Type", "application/zip"); res.set("Content-Disposition", 'attachment; filename="FOB-Scan-mac.zip"'); res.set("Cache-Control", "no-store");
      res.send(Buffer.from(await new Response(g.stream).arrayBuffer()));
    } catch (e) { res.status(502).send(e.message); }
  });
  return r;
}
