import { Router } from "express";
import { probeShopify, shopifyConfigured, listShopifyVariants, createShopifyProduct, setShopifyPrice, setShopifyQuantity } from "../channels/shopify.js";

export function shopifyRouter() {
  const r = Router();
  r.get("/status", async (_req, res) => {
    if (!shopifyConfigured()) return res.json({ ok: false, connected: false, error: "Shopify settings missing." });
    try { res.json({ connected: true, ...(await probeShopify()) }); }
    catch (e) { res.status(502).json({ ok: false, connected: false, error: e.message }); }
  });
  r.get("/variants", async (_req, res) => {
    try { const v = await listShopifyVariants(); res.json({ ok: true, count: v.length, variants: v }); }
    catch (e) { res.status(502).json({ ok: false, error: e.message }); }
  });
  /* writes: same shared secret A.R.I. already uses for /api/identify */
  const guard = (req, res, next) => {
    const k = process.env.ARI_IDENTIFY_SECRET || "";
    if (!k || req.get("x-fob-key") !== k) return res.status(401).json({ ok: false, error: "x-fob-key required" });
    next();
  };
  const wrap = (fn) => async (req, res) => { try { res.json(await fn(req.body || {})); } catch (e) { res.status(e.status || 502).json({ ok: false, error: e.message }); } };
  r.post("/product", guard, wrap(createShopifyProduct));
  r.post("/price", guard, wrap(setShopifyPrice));
  r.post("/quantity", guard, wrap(setShopifyQuantity));
  return r;
}
