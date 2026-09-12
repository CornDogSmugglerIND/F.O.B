import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { lookupBarcode } from "../lookup.js";
import { runIdentify, identityToItemPatch } from "../identify/router.js";
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
   * Command Identify router (LISTING-ENGINE §1 + #55).
   * Photos-first. Barcode is a shortcut. Manual always available.
   * Never barcode-only. Never silent no-op. Never lose photos.
   */
  router.post("/identify", async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const result = await runIdentify({
        barcode: body.barcode,
        photos: body.photos,
        name: body.name,
        number: body.number,
        set: body.set,
        query: body.query,
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
      paths: ["barcode", "catalog", "photo_search", "manual"],
      photoSearchReady: keys.ready,
      missingKeys: keys.missingKeys,
      setupTask: keys.ready
        ? null
        : "Add ANTHROPIC_API_KEY to Cursor Cloud Secrets and Vercel (same key GitHub Actions already uses).",
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
        barcode: body.barcode ?? item.barcode,
        photos,
        name: body.name ?? item.productName,
        number: body.number ?? item.collectorNumber,
        set: body.set ?? item.setCode,
        query: body.query,
        notes: body.notes ?? item.notes,
        category: body.category ?? item.category,
        quantity: body.quantity ?? item.quantity,
        manual: body.manual,
        forcePath: body.forcePath,
      });

      let updated = item;
      if (result.identity) {
        const patch = {
          ...identityToItemPatch(result.identity, result.path),
          barcode: body.barcode ?? item.barcode ?? result.identity.set_code,
        };
        updated = await updateScoutItem(item.id, patch);
      }

      const status = result.ok ? 200 : result.setupTask ? 503 : 422;
      res.status(status).json({ item: updated, identify: result });
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

  return router;
}
