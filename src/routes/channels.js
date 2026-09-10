import { Router } from "express";
import { getCanonicalInventory, getChannelStatuses } from "../channels/config.js";
import { applySale } from "../channels/sync.js";
import { publishListing } from "../channels/adapters.js";
import { probeEbay } from "../channels/ebay.js";
import { probeMisprint } from "../channels/misprint.js";
import { getScoutItem, updateScoutItem } from "../store.js";

export function channelsRouter() {
  const router = Router();

  router.get("/status", (_req, res) => {
    res.json({
      canonical: getCanonicalInventory(),
      goal: "synced inventory + auto pricing across ebay, double_holo, misprint",
      channels: getChannelStatuses(),
    });
  });

  /** Soft auth check for eBay (uses refresh token; never returns secrets). */
  router.get("/ebay/probe", async (_req, res, next) => {
    try {
      const result = await probeEbay();
      res.json(result);
    } catch (err) {
      if (err.code === "CHANNEL_NOT_CONFIGURED") {
        return res.status(503).json({ ok: false, error: err.message, code: err.code });
      }
      if (err.code === "EBAY_AUTH_FAILED") {
        return res.status(502).json({ ok: false, error: err.message, code: err.code });
      }
      next(err);
    }
  });

  /** Misprint probe — never returns secret values. */
  router.get("/misprint/probe", async (_req, res, next) => {
    try {
      const result = await probeMisprint();
      const status = result.ok ? 200 : result.code === "MISPRINT_BASE_REQUIRED" ? 503 : 502;
      res.status(status).json(result);
    } catch (err) {
      if (err.code === "CHANNEL_NOT_CONFIGURED") {
        return res.status(503).json({ ok: false, error: err.message, code: err.code });
      }
      next(err);
    }
  });

  /**
   * Publish a staged HUD item to a channel.
   * Body: { itemId, channel }
   */
  router.post("/publish", async (req, res, next) => {
    try {
      const { itemId, channel } = req.body ?? {};
      if (!itemId || !channel) {
        return res.status(400).json({ error: "itemId and channel required" });
      }
      const item = await getScoutItem(itemId);
      if (!item) return res.status(404).json({ error: "Item not found" });

      const published = await publishListing(channel, item);
      const channels = {
        ...(item.channels || {}),
        [channel]: {
          listingId: published.listingId,
          price: published.price ?? item.price,
          status: published.status || "active",
          offerId: published.offerId || null,
          sku: published.sku || null,
        },
      };
      const updated = await updateScoutItem(item.id, {
        channels,
        staged: false,
      });
      res.json({ item: updated, published });
    } catch (err) {
      if (err.code === "CHANNEL_NOT_CONFIGURED") {
        return res.status(503).json({ error: err.message, code: err.code });
      }
      if (err.code === "VALIDATION") {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      if (err.code === "EBAY_API_ERROR" || err.code === "EBAY_AUTH_FAILED") {
        return res.status(502).json({ error: err.message, code: err.code, details: err.details });
      }
      if (err.code === "MISPRINT_BASE_REQUIRED" || err.code === "MISPRINT_API_ERROR") {
        return res.status(err.code === "MISPRINT_BASE_REQUIRED" ? 503 : 502).json({
          error: err.message,
          code: err.code,
          details: err.details,
        });
      }
      next(err);
    }
  });

  /** Record a sale against H.U.D inventory and fan out qty/end (adapters stub until secrets). */
  router.post("/sale", async (req, res, next) => {
    try {
      const { itemId, channel, quantitySold, externalOrderId } = req.body ?? {};
      if (!itemId || !channel) {
        return res.status(400).json({ error: "itemId and channel required" });
      }
      const result = await applySale({ itemId, channel, quantitySold, externalOrderId });
      res.json(result);
    } catch (err) {
      if (err.code === "NOT_FOUND") return res.status(404).json({ error: err.message });
      next(err);
    }
  });

  return router;
}
