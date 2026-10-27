import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { lookupBarcode } from "../lookup.js";
import { runIdentify, identityToItemPatch } from "../identify/router.js";
import { activeComps, marketValue, suggestCategory, fillRequiredAspects, categoryAspectList } from "../comps.js";
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
   *
   * Single provider: direct Anthropic vision (IDENTIFY_PROVIDER=anthropic),
   * gated on ANTHROPIC_API_KEY. The A.R.I. R2 queue path was removed —
   * no worker loop exists in this repo, so IDENTIFY_PROVIDER=ari would
   * leave the UI polling for a result that can never arrive.
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
      provider: "anthropic",
      photoSearchReady: keys.ready,
      missingKeys: keys.missingKeys,
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

  router.get("/comps", async (req, res) => {
    const q = req.query || {};
    if (q.name) return res.json(await marketValue({ name: q.name, number: q.number, set: q.set, finish: q.finish, game: q.game, q: q.q }));
    res.json(await activeComps(q.q));
  });

  /* what eBay will file this under, and the item specifics it requires (filled from the title) */
  /* card search for fixing a wrong match: name and/or number, with card images (Pokémon via TCGdex) */
  let setMap = null, setAt = 0;
  router.get("/search", async (req, res) => {
    const raw = String(req.query?.q || "").trim(); if (raw.length < 2) return res.json({ ok: true, results: [] });
    const num = (raw.match(/\b([A-Za-z]{0,4}\d{1,3}[a-z]?)(?:\s*\/\s*\d{1,4})?\b/) || [])[1] || "";
    const name = raw.replace(/\b[A-Za-z]{0,4}\d{1,3}[a-z]?(\s*\/\s*\d{1,3})?\b/g, " ").replace(/\s+/g, " ").trim();
    const T = "https://api.tcgdex.net/v2/en";
    const get = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(12000) }); if (!r.ok) return []; return r.json(); };
    try {
      if (!setMap || Date.now() - setAt > 6 * 3600e3) { const sets = await get(`${T}/sets`); setMap = new Map((sets || []).map((x) => [x.id, x])); setAt = Date.now(); }
      const qs = new URLSearchParams(); if (name) qs.set("name", name); else if (num) qs.set("localId", num.replace(/^0+(?=\d)/, ""));
      let list = (await get(`${T}/cards?${qs}&pagination:itemsPerPage=250`)) || [];
      /* exact number first, then the rest, newest sets first */
      const n0 = num.replace(/^0+(?=\d)/, "").toLowerCase(), hit = (c) => String(c.localId).replace(/^0+(?=\d)/, "").toLowerCase() === n0;
      list = num ? [...list.filter(hit).reverse(), ...list.filter((c) => !hit(c)).reverse()] : list.reverse();
      const results = (list || []).filter((c) => c.image).map((c) => { const sid = c.id.slice(0, c.id.lastIndexOf("-")), st = setMap.get(sid) || {}; const tot = st.cardCount?.official; return { id: c.id, product_name: c.name, collector_number: tot && /^\d+$/.test(c.localId) ? `${c.localId}/${String(tot).padStart(String(c.localId).length, "0")}` : c.localId, set_name: st.name || sid, set_code: sid, game: "Pokemon", image: `${c.image}/low.webp`, imageBig: `${c.image}/high.webp` }; }).slice(0, 48);
      res.json({ ok: true, results });
    } catch (e) { res.json({ ok: false, results: [], error: e.message }); }
  });
  /* one card's details (rarity) after you pick it */
  router.get("/card/:id", async (req, res) => {
    try { const r = await fetch(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(req.params.id)}`, { signal: AbortSignal.timeout(12000) }); const c = await r.json(); res.json({ ok: true, rarity: c.rarity || "", finish: c.variants?.holo ? "Holo" : c.variants?.reverse && !c.variants?.normal ? "Reverse Holo" : "" }); } catch { res.json({ ok: false }); }
  });
  router.get("/sold", async (req, res) => {
    const { soldComps } = await import("../comps.js"); const q = req.query || {};
    const r = await soldComps({ name: q.name, number: q.number, set: q.set, finish: q.finish, q: q.q });
    res.json({ ...r, debug: { err: soldComps.lastError || null, status: soldComps.lastStatus || null } });
  });
  router.get("/category", async (req, res) => {
    const title = String(req.query?.title || ""); const c = await suggestCategory(title);
    const id = c ? c.id : "183454"; const list0 = await categoryAspectList(id).catch((e) => String(e.message)); const list = Array.isArray(list0) && !list0.length && categoryAspectList.lastError ? categoryAspectList.lastError : list0;
    res.json({ ok: true, category: c || { id, name: "CCG Individual Cards" }, aspects: await fillRequiredAspects(id, title, {}), specifics: Array.isArray(list) ? list.map((a) => `${a.name}${a.required ? "*" : a.recommended ? "+" : ""}(${a.values.length})`) : list });
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
