import { Router } from "express";
import { probeShopify, shopifyConfigured } from "../channels/shopify.js";

export function shopifyRouter() {
  const r = Router();
  r.get("/status", async (_req, res) => {
    if (!shopifyConfigured()) return res.json({ ok: false, connected: false, error: "Shopify settings missing." });
    try { res.json({ connected: true, ...(await probeShopify()) }); }
    catch (e) { res.status(502).json({ ok: false, connected: false, error: e.message }); }
  });
  return r;
}
