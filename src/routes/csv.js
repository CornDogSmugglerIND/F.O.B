import { Router } from "express";
import { importCsv, exportCsv } from "../listing/csv.js";
import { listScoutItems } from "../store.js";

const EXPORT_SOURCES = ["ebay", "double_holo", "generic", "tcgplayer"];
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

  return router;
}
