import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getCanonicalInventory, getChannelStatuses, getEbayChannelStatus } from "../channels/config.js";
import { applySale } from "../channels/sync.js";
import { publishListing } from "../channels/adapters.js";
import { probeEbay, syncEbayInventory, clearEbayTokenCache, getEbayTracking } from "../channels/ebay.js";
import {
  buildEbayAuthorizeUrl,
  exchangeEbayAuthCode,
  saveEbayTokenStore,
} from "../channels/ebayConnect.js";
import { probeMisprint } from "../channels/misprint.js";
import { combineVariationBatch } from "../listing/variation.js";
import { getScoutItem, updateScoutItem, listScoutItems, createScoutItem } from "../store.js";

/** Minimal cookie helpers (no extra dependency). */
function readCookie(req, name) {
  const header = req.headers?.cookie || "";
  const m = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function writeStateCookie(res, state) {
  const parts = [
    `ebay_oauth_state=${encodeURIComponent(state)}`,
    "Path=/api/channels/ebay/callback",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${10 * 60}`,
  ];
  if (process.env.VERCEL) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearStateCookie(res) {
  res.setHeader(
    "Set-Cookie",
    "ebay_oauth_state=; Path=/api/channels/ebay/callback; HttpOnly; SameSite=Lax; Max-Age=0",
  );
}

/**
 * Visible HTML failure page for the browser eBay OAuth flow.
 * Every connect failure Sawyer can hit in a browser must land here:
 * a plain-words error plus a link back to the Channels tab.
 * `?json=1` callers keep the JSON contract.
 */
function ebayConnectErrorHtml(message) {
  const safe = String(message ?? "Something went wrong connecting eBay.")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>eBay connection failed</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0e14;color:#e8ecf3;font-family:-apple-system,system-ui,sans-serif;padding:24px;box-sizing:border-box}
main{max-width:420px;text-align:center}
h1{font-size:22px;margin:0 0 12px}
.err{font-size:15px;line-height:1.5;color:#f0a3a3;background:#2a1215;border:1px solid #5c2226;border-radius:10px;padding:12px 14px;margin:0 0 20px;word-break:break-word}
.btn{display:inline-block;background:#2f7cf6;color:#fff;text-decoration:none;font-size:16px;font-weight:600;padding:12px 28px;border-radius:10px;margin-bottom:14px}
.link{display:block;color:#8ab4f8;font-size:14px;margin-top:4px}
</style>
</head>
<body>
<main>
<h1>eBay connection failed</h1>
<p class="err">${safe}</p>
<a class="btn" href="/hud.html#/channels">Back to Channels</a>
<a class="link" href="/api/channels/ebay/connect">Try connecting again</a>
</main>
</body>
</html>`;
}

/**
 * eBay connect failure responder.
 * Browser flow -> visible error page with a link back to Channels.
 * ?json=1 -> JSON contract ({ ok:false, error, code }).
 */
function ebayConnectFailure(res, status, message, opts = {}) {
  const { asJson = false, code = "EBAY_CONNECT_FAILED" } = opts;
  if (asJson) return res.status(status).json({ ok: false, error: message, code });
  return res.status(status).type("html").send(ebayConnectErrorHtml(message));
}

export function channelsRouter() {
  const router = Router();

  router.get("/status", (_req, res) => {
    res.json({
      canonical: getCanonicalInventory(),
      goal: "synced inventory + auto pricing across ebay, double_holo, misprint",
      channels: getChannelStatuses(),
    });
  });

  /**
   * Inventory sync — pull eBay offers into HUD store when configured.
   */
  router.post("/ebay/sync", async (_req, res, next) => {
    try {
      const statuses = getChannelStatuses();
      const ebay = statuses.find((c) => c.id === "ebay");
      if (!ebay?.configured) {
        return res.status(503).json({
          ok: false,
          error: "eBay isn't connected yet. Add your eBay keys in Vercel to turn this on.",
          code: "CHANNEL_NOT_CONFIGURED",
          missing: ebay?.missing || [],
        });
      }

      const sync = await syncEbayInventory({ limit: 50 });
      const existing = await listScoutItems();
      const byEbaySku = new Map();
      for (const it of existing) {
        const sku = it.channels?.ebay?.sku;
        if (sku) byEbaySku.set(sku, it);
      }

      let created = 0;
      let updated = 0;
      for (const rec of sync.records) {
        const hit = byEbaySku.get(rec.sku);
        if (hit) {
          await updateScoutItem(hit.id, {
            title: rec.title,
            price: rec.price,
            quantity: rec.quantity,
            staged: false,
            phase: "listed",
            channels: rec.channels,
            notes: hit.notes || "ebay-sync",
          });
          updated += 1;
        } else {
          await createScoutItem({
            title: rec.title,
            productName: rec.title,
            price: rec.price,
            quantity: Math.max(1, rec.quantity || 1),
            staged: false,
            phase: "listed",
            channels: rec.channels,
            notes: "ebay-sync",
            lookupSource: "ebay_inventory",
          });
          created += 1;
        }
      }

      res.json({
        ok: true,
        pulled: sync.pulled,
        offerTotal: sync.offerTotal,
        inventoryTotal: sync.inventoryTotal,
        created,
        updated,
      });
    } catch (err) {
      if (err.code === "CHANNEL_NOT_CONFIGURED" || err.code === "EBAY_AUTH_FAILED" || err.code === "EBAY_API_ERROR") {
        return res.status(503).json({ ok: false, error: err.message, code: err.code });
      }
      next(err);
    }
  });

  /**
   * Combine cards into a Pick-Your-Card variation batch.
   * Body: { items: [...], setName?, rarity?, game? } OR { itemIds: [...] }
   * Returns parent+children payload + eBay FE CSV (parent has no StartPrice).
   * Does not publish — listing push still needs eBay creds.
   */
  router.post("/ebay/combine", async (req, res, next) => {
    try {
      let children = Array.isArray(req.body?.items) ? req.body.items : null;
      if (!children?.length && Array.isArray(req.body?.itemIds)) {
        const found = [];
        for (const id of req.body.itemIds) {
          const it = await getScoutItem(id);
          if (it) found.push(it);
        }
        children = found;
      }
      if (!children?.length) {
        return res.status(400).json({ error: "items or itemIds required", code: "VALIDATION" });
      }

      const batch = combineVariationBatch(children, {
        setName: req.body?.setName,
        rarity: req.body?.rarity,
        game: req.body?.game,
      });

      /** Persist parent + link children when they live in the server store. */
      let parentItem = null;
      if (Array.isArray(req.body?.itemIds) && req.body.itemIds.length) {
        parentItem = await createScoutItem({
          title: batch.title,
          productName: batch.title,
          description: batch.description,
          setName: batch.setName,
          rarity: batch.rarity,
          game: batch.game,
          condition: "NM",
          language: "English",
          quantity: batch.totalQty,
          staged: true,
          phase: "staged",
          notes: `variation-parent:${batch.groupId}`,
          price: null,
        });
        await updateScoutItem(parentItem.id, {
          channels: {
            ebay: {
              listingId: null,
              price: null,
              status: "variation_parent",
              sku: batch.parent.sku,
            },
          },
        });
        parentItem = await getScoutItem(parentItem.id);
        for (const id of req.body.itemIds) {
          const child = await getScoutItem(id);
          if (!child) continue;
          await updateScoutItem(id, {
            notes: [child.notes, `variation-child:${batch.groupId}`].filter(Boolean).join(" | "),
            staged: true,
            phase: child.phase === "listed" ? "listed" : "staged",
          });
        }
      }

      res.json({
        ok: true,
        ...batch,
        parentItem,
        csv: batch.csv,
      });
    } catch (err) {
      if (err.code === "VALIDATION") {
        return res.status(400).json({ ok: false, error: err.message, code: err.code });
      }
      next(err);
    }
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

  /**
   * eBay OAuth connect flow.
   * GET /api/channels/ebay/connect -> 302 to eBay consent (?json=1 returns { authorizeUrl })
   */
  router.get("/ebay/connect", (req, res, next) => {
    try {
      const state = randomUUID();
      const authorizeUrl = buildEbayAuthorizeUrl({ state });
      writeStateCookie(res, state);
      if (req.query.json === "1") {
        return res.json({ ok: true, authorizeUrl, state });
      }
      res.redirect(302, authorizeUrl);
    } catch (err) {
      if (err.code === "CHANNEL_NOT_CONFIGURED") {
        return ebayConnectFailure(res, 503, err.message, {
          asJson: req.query.json === "1",
          code: err.code,
        });
      }
      next(err);
    }
  });

  /**
   * GET /api/channels/ebay/callback?code=...&state=...
   * Validates state, exchanges the code, persists tokens server-side.
   */
  router.get("/ebay/callback", async (req, res, next) => {
    try {
      const { code, state } = req.query ?? {};
      const expected = readCookie(req, "ebay_oauth_state");
      // State check: when the browser kept the cookie it must match.
      if (!code || typeof code !== "string") {
        return ebayConnectFailure(res, 400, "Missing code — restart the connect flow from Channels.", {
          asJson: req.query.json === "1",
          code: "VALIDATION",
        });
      }
      if (expected && state !== expected) {
        return ebayConnectFailure(res, 400, "State mismatch — restart the connect flow from Channels.", {
          asJson: req.query.json === "1",
          code: "VALIDATION",
        });
      }
      const tokens = await exchangeEbayAuthCode(code);
      await saveEbayTokenStore({
        refresh_token: tokens.refresh_token,
        refresh_token_expires_in: tokens.refresh_token_expires_in,
      });
      clearEbayTokenCache();
      clearStateCookie(res);
      if (req.query.json === "1") {
        return res.json({ ok: true, connected: true });
      }
      res.redirect(302, "/hud.html#/channels");
    } catch (err) {
      if (err.code === "CHANNEL_NOT_CONFIGURED") {
        return ebayConnectFailure(res, 503, err.message, { asJson: req.query.json === "1", code: err.code });
      }
      if (err.code === "EBAY_AUTH_FAILED") {
        return ebayConnectFailure(res, 502, err.message, { asJson: req.query.json === "1", code: err.code });
      }
      next(err);
    }
  });

  /**
   * GET /api/channels/ebay/status -> { connected, missing[], lastError }
   * The contract Claude's settings UI wires "Check connection" to.
   */
  router.get("/ebay/status", async (_req, res, next) => {
    try {
      const s = await getEbayChannelStatus();
      res.json({
        connected: s.configured,
        missing: s.missing,
        tokenStored: s.tokenStored,
        lastError: s.lastError,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/channels/ebay/orders?days=30
   * Per-item tracking cards: line items + carrier/tracking + status.
   */
  router.get("/ebay/orders", async (req, res, next) => {
    try {
      const days = Math.max(1, Math.min(90, Number(req.query.days) || 30));
      const orders = await getEbayTracking({ days });
      res.json({ ok: true, days, count: orders.length, orders });
    } catch (err) {
      if (err.code === "CHANNEL_NOT_CONFIGURED") {
        return res.status(503).json({ ok: false, error: err.message, code: err.code });
      }
      if (err.code === "EBAY_AUTH_FAILED" || err.code === "EBAY_API_ERROR") {
        return res.status(502).json({ ok: false, error: err.message, code: err.code });
      }
      next(err);
    }
  });

  return router;
}
