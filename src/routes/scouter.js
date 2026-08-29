import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { lookupBarcode } from "../lookup.js";
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

  router.get("/items", async (_req, res, next) => {
    try {
      res.json({ items: await listScoutItems() });
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

  router.post("/items/:id/identify", async (req, res, next) => {
    try {
      const item = await getScoutItem(req.params.id);
      if (!item) return res.status(404).json({ error: "Item not found" });

      const barcode = req.body?.barcode ?? item.barcode;
      if (!barcode) {
        return res.status(400).json({ error: "Barcode is required" });
      }

      const lookup = await lookupBarcode(barcode);
      const patch = lookup.found
        ? {
            barcode: lookup.barcode,
            title: req.body?.title ?? lookup.product.title,
            brand: req.body?.brand ?? lookup.product.brand,
            description: req.body?.description ?? lookup.product.description,
            lookupSource: lookup.product.lookupSource,
          }
        : {
            barcode: lookup.barcode,
            title: req.body?.title ?? item.title,
            brand: req.body?.brand ?? item.brand,
          };

      const updated = await updateScoutItem(item.id, patch);
      res.json({ item: updated, lookup });
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
