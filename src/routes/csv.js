import { Router } from "express";
import { importCsv, exportCsv } from "../listing/csv.js";
import { listScoutItems } from "../store.js";
import { tcgplayerProductFor } from "../comps.js";
import { readDoc } from "./deviceSync.js";

const EXPORT_SOURCES = ["double_holo_tcgplayer", "double_holo_photos", "ebay", "double_holo", "generic", "tcgplayer"];
const IMPORT_SOURCES = ["ebay", "double_holo", "misprint", "seller_fb"];

export function csvRouter() {
  const router = Router();

  /**
   * Import a vendor CSV into normalized item partials.
   * Body: { source: 'ebay'|'double_holo'|'misprint'|'seller_fb', csv: string }
   * Does not persist — caller decides what to do with items.
   */
  router.post("/import", (req, res, next) => {
    try {
      const { source, csv } = req.body ?? {};
      if (!IMPORT_SOURCES.includes(source)) {
        return res.status(400).json({
          ok: false,
          error: `source must be one of ${IMPORT_SOURCES.join(", ")}`,
          code: "VALIDATION",
        });
      }
      if (typeof csv !== "string" || !csv.trim()) {
        return res.status(400).json({ ok: false, error: "csv text required", code: "VALIDATION" });
      }
      const { items, errors } = importCsv(source, csv);
      res.json({ ok: true, source, imported: items.length, items, errors });
    } catch (err) {
      if (err.code === "VALIDATION") {
        return res.status(400).json({ ok: false, error: err.message, code: err.code });
      }
      next(err);
    }
  });

  /**
   * Export H.U.D items as a vendor CSV download.
   * Query: ?source=ebay|double_holo|generic|tcgplayer&itemIds=a,b,c (optional)
   */
  router.get("/export", async (req, res, next) => {
    try {
      const source = String(req.query.source || "generic");
      if (!EXPORT_SOURCES.includes(source)) {
        return res.status(400).json({
          ok: false,
          error: `source must be one of ${EXPORT_SOURCES.join(", ")}`,
          code: "VALIDATION",
        });
      }
      const all = await listScoutItems();
      const wanted = String(req.query.itemIds || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const items = wanted.length ? all.filter((it) => wanted.includes(it.id)) : all;
      const csv = exportCsv(source === "generic" ? "tcgplayer" : source, items);
      const filename = `hud-export-${source}-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Export the app's own items (they live in the browser, not on the server).
   * Body: { source, items: [...] }  -> text/csv
   */
  router.post("/export", async (req, res, next) => {
    try {
      const source = String((req.body && req.body.source) || "generic");
      if (!EXPORT_SOURCES.includes(source)) {
        return res.status(400).json({ ok: false, error: `source must be one of ${EXPORT_SOURCES.join(", ")}`, code: "VALIDATION" });
      }
      const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
      if (!items.length) return res.status(400).json({ ok: false, error: "No items to export", code: "VALIDATION" });
      if (source === "double_holo_tcgplayer") {
        /* fill missing TCGplayer Ids (one product per finish) from TCGdex; report back so the app can keep them */
        const found = {};
        await Promise.all(items.slice(0, 60).map(async (it) => {
          if (it.tcgplayerId) return;
          const hit = await tcgplayerProductFor({ name: it.productName || it.name, number: it.collectorNumber || it.number, set: it.setName || it.set, finish: it.finish }).catch(() => null);
          if (hit) { it.tcgplayerId = hit.productId; it.tcgFinishKey = hit.finishKey; if (it.tcgMarket == null) it.tcgMarket = hit.market; found[it.id || it.sku || hit.productId] = hit.productId; }
        }));
        res.setHeader("X-TCGP-Ids", encodeURIComponent(JSON.stringify(found)));
        res.setHeader("X-DH-Missing", String(items.filter((it) => !it.tcgplayerId).length));
      }
      const csv = exportCsv(source === "generic" ? "tcgplayer" : source, items);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.send(csv);
    } catch (err) {
      next(err);
    }
  });

  /**
   * DH photo manifest for A.R.I. (bridge [50]): one row per card that has a TCGplayer Id,
   * with the exact photos Sawyer took, so "Add photos" on each DH entry uses those and nothing else.
   * Query: ?since=ISO (default: last 7 days) &ids=a,b (optional)
   */
  router.get("/dh-photos", async (req, res) => {
    const doc = await readDoc().catch(() => null);
    if (!doc) return res.status(503).json({ ok: false, error: "store unavailable" });
    const since = Date.parse(String(req.query.since || "")) || Date.now() - 7 * 864e5;
    const ids = new Set(String(req.query.ids || "").split(",").map((s) => s.trim()).filter(Boolean));
    const urlOf = (p) => (typeof p === "string" ? p : p?.url || p?.dataUrl || "");
    const rows = (doc.items || []).filter((it) => it.tcgplayerId && (ids.size ? ids.has(String(it.id)) : Date.parse(it.updatedAt || it.createdAt || 0) >= since));
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["TCGplayer Id", "Product Name", "Number", "Set Name", "Front URL", "Back URL", "More URLs", "Item Id"].map(esc).join(",")];
    for (const it of rows) {
      const ps = (it.photos || []).map(urlOf).filter((u) => /^https:\/\//.test(u));
      lines.push([it.tcgplayerId, it.productName || it.title, it.collectorNumber || "", it.setName || "", ps[0] || "", ps[1] || "", ps.slice(2).join(" "), it.id].map(esc).join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("X-Rows", String(rows.length));
    res.send(lines.join("\r\n") + "\r\n");
  });

  return router;
}
