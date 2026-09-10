import { Router } from "express";
import { getCanonicalInventory, getChannelStatuses } from "../channels/config.js";
import { applySale } from "../channels/sync.js";

export function channelsRouter() {
  const router = Router();

  router.get("/status", (_req, res) => {
    res.json({
      canonical: getCanonicalInventory(),
      goal: "synced inventory + auto pricing across ebay, double_holo, misprint",
      channels: getChannelStatuses(),
    });
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
