import { Router } from "express";
import {
  ariQueueStorageStatus,
  isAriWorkerAuthorized,
  listPendingIdentifyRequests,
  writeIdentifyResult,
} from "../identify/ariQueue.js";

/**
 * A.R.I. worker endpoints — the other half of the Identify bridge.
 * Sawyer's call: A.R.I. is the vision provider for Identify.
 *
 *   GET  /api/identify/queue                 pending requests (secret)
 *   POST /api/identify/queue/:queueId/result  post identification (secret)
 *
 * Auth: header x-ari-secret must equal ARI_IDENTIFY_SECRET.
 */
export function ariRouter() {
  const router = Router();

  router.use((req, res, next) => {
    if (!isAriWorkerAuthorized(req)) {
      return res.status(401).json({ error: "Not authorized." });
    }
    const storage = ariQueueStorageStatus();
    if (!storage.ok) {
      return res.status(503).json({
        error: "Identify queue is not set up yet.",
        missing: storage.missing,
      });
    }
    next();
  });

  router.get("/queue", async (_req, res, next) => {
    try {
      const pending = await listPendingIdentifyRequests();
      res.json({ pending });
    } catch (err) {
      next(err);
    }
  });

  router.post("/queue/:queueId/result", async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const payload = await writeIdentifyResult(req.params.queueId, {
        identity: body.identity,
        candidates: body.candidates,
        message: body.message,
      });
      res.json({ ok: true, queueId: payload.queueId });
    } catch (err) {
      if (err.code === "ARI_QUEUE_NOT_FOUND") {
        return res.status(404).json({ error: err.message });
      }
      next(err);
    }
  });

  return router;
}
