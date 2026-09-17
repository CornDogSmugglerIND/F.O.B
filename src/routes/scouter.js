import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { lookupBarcode } from "../lookup.js";
import { runIdentify, identityToItemPatch } from "../identify/router.js";
import { runBarcodeScan } from "../identify/barcode.js";
import { visionKeyStatus } from "../identify/vision.js";
import {
  addInlinePhotoToItem,
  addPhotoToItem,
  createScoutItem,
  deleteScoutItem,
  findPhoto,
  getScoutItem,
  getUploadsDir,
  listScoutItems,
  replaceAllItems,
  updateScoutItem,
} from "../store.js";

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, getUploadsDir()),
    filename: (_req, file, cb) => {
      const ext = file.originalname.split(".").pop() || "jpg";
      cb(null, `${randomUUID()}.${ext}`);
    },
  }),
  limits: { fileSize: 12 * 1024 * 1024, files: 20 },
});

export function scouterRouter() {
  const router = Router();

  router.get("/items", async (req, res, next) => {
    try {
      let items = await listScoutItems();
      if (req.query.staged === "1" || req.query.staged === "true") {
        items = items.filter((item) => item.staged);
      }
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  router.get("/items/:id", async (req, res, next) => {
    try {
      const item = await getScoutItem(req.params.id);
      if (!item) return res.status(404).json({ error: "Item not found" });
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  router.post("/items", async (req, res, next) => {
    try {
      const item = await createScoutItem(req.body ?? {});
      res.status(201).json({ item });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/items/:id", async (req, res, next) => {
    try {
      const item = await updateScoutItem(req.params.id, req.body ?? {});
      if (!item) return res.status(404).json({ error: "Item not found" });
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/items/:id", async (req, res, next) => {
    try {
      const removed = await deleteScoutItem(req.params.id);
      if (!removed) return res.status(404).json({ error: "Item not found" });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.get("/photos/:photoId", async (req, res, next) => {
    try {
      const found = await findPhoto(req.params.photoId);
      if (!found?.photo.dataUrl) {
        return res.status(404).json({ error: "Photo not found" });
      }
      const match = found.photo.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return res.status(404).json({ error: "Photo not found" });
      const buf = Buffer.from(match[2], "base64");
      res.setHeader("Content-Type", match[1]);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(buf);
    } catch (err) {
      next(err);
    }
  });

  router.put("/items/sync", async (req, res, next) => {
    try {
      const items = req.body?.items;
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: "items array required" });
      }
      await replaceAllItems(items);
      res.json({ items: await listScoutItems() });
    } catch (err) {
      next(err);
    }
  });

  router.post("/items/:id/photos/data", async (req, res, next) => {
    try {
      const item = await getScoutItem(req.params.id);
      if (!item) return res.status(404).json({ error: "Item not found" });

      const dataUrl = req.body?.dataUrl;
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
        return res.status(400).json({ error: "dataUrl must be a data:image/ URI" });
      }
      if (dataUrl.length > 900_000) {
        return res.status(413).json({ error: "Photo too large after compression" });
      }

      const updated = await addInlinePhotoToItem(item.id, dataUrl);
      res.json({ item: updated });
    } catch (err) {
      next(err);
    }
  });

  router.post("/items/:id/photos", upload.array("photos", 20), async (req, res, next) => {
    try {
      const item = await getScoutItem(req.params.id);
      if (!item) return res.status(404).json({ error: "Item not found" });

      let current = item;
      for (const file of req.files ?? []) {
        const photo = {
          id: randomUUID(),
          filename: file.filename,
          url: `/uploads/${file.filename}`,
          dataUrl: null,
          createdAt: new Date().toISOString(),
        };
        current = /** @type {typeof item} */ (await addPhotoToItem(current.id, photo));
      }
      res.json({ item: current });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Identify — photos in, identity out. Command #59 correction.
   * Barcode is not accepted as an Identify path.
   */
  router.post("/identify", async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const result = await runIdentify({
        photos: body.photos,
        notes: body.notes,
        category: body.category,
        quantity: body.quantity,
        manual: body.manual,
        forcePath: body.forcePath,
      });
      const status = result.ok ? 200 : result.setupTask ? 503 : 422;
      res.status(status).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get("/identify/status", (_req, res) => {
    const keys = visionKeyStatus();
    res.json({
      service: "identify",
      feature: "photo",
      paths: ["photo_search", "manual"],
      barcodeFeature: {
        separate: true,
        endpoint: "/api/scouter/barcode/:code",
      },
      photoSearchReady: keys.ready,
      missingKeys: [],
      setupTask: keys.ready ? null : keys.message,
    });
  });

  router.post("/items/:id/identify", async (req, res, next) => {
    try {
      const item = await getScoutItem(req.params.id);
      if (!item) return res.status(404).json({ error: "Item not found" });

      const body = req.body ?? {};
      const photosFromItem = (item.photos || [])
        .map((p) => p.dataUrl)
        .filter((u) => typeof u === "string" && u.startsWith("data:image/"));
      const photos = Array.isArray(body.photos) && body.photos.length ? body.photos : photosFromItem;

      const result = await runIdentify({
        photos,
        notes: body.notes ?? item.notes,
        category: body.category ?? item.category,
        quantity: body.quantity ?? item.quantity,
        manual: body.manual,
        forcePath: body.forcePath === "barcode" ? undefined : body.forcePath,
      });

      let updated = item;
      if (result.identity) {
        const patch = identityToItemPatch(result.identity, result.path);
        updated = await updateScoutItem(item.id, patch);
      }

      const status = result.ok ? 200 : result.setupTask ? 503 : 422;
      res.status(status).json({ item: updated, identify: result });
    } catch (err) {
      next(err);
    }
  });

  router.post("/barcode", async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const result = await runBarcodeScan(body.barcode ?? body.code, body.quantity);
      const status = result.ok ? 200 : 422;
      res.status(status).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get("/barcode/:code", async (req, res, next) => {
    try {
      res.json(await lookupBarcode(req.params.code));
    } catch (err) {
      next(err);
    }
  });

  /** Bake listing fields from locked engine rules. */
  router.post("/items/:id/listing-engine", async (req, res, next) => {
    try {
      const { runListingEngine, LISTING_CONFIG } = await import("../listing/engine.js");
      const item = await getScoutItem(req.params.id);
      if (!item) return res.status(404).json({ error: "Item not found" });
      const mode = req.body?.mode === "variation" ? "variation" : "regular";
      const soldAvg = req.body?.soldAvg != null ? Number(req.body.soldAvg) : null;
      if (req.body?.baseline === "tcgplayer_market" || req.body?.baseline === "sold_comps") {
        LISTING_CONFIG.activeBaseline = req.body.baseline;
      }
      const listing = runListingEngine(item, { mode, soldAvg });
      const updated = await updateScoutItem(item.id, {
        title: listing.title,
        description: listing.description,
        price: listing.suggestedPrice ?? item.price,
        notes: item.notes,
      });
      res.json({ item: updated, listing });
    } catch (err) {
      next(err);
    }
  });

  /** CSV export — ebay | double_holo | tcgplayer */
  router.get("/export.csv", async (req, res, next) => {
    try {
      const { exportCsv } = await import("../listing/csv.js");
      const format = String(req.query.format || "tcgplayer");
      let items = await listScoutItems();
      if (req.query.staged === "1") items = items.filter((i) => i.staged);
      const csv = exportCsv(format, items);
      const name =
        format === "ebay"
          ? "ebay-file-exchange.csv"
          : format === "double_holo"
            ? "double-holo.csv"
            : "tcg-generic.csv";
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
      res.send(csv);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
