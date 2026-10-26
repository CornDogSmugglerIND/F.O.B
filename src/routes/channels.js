import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getCanonicalInventory, getChannelStatuses, getEbayChannelStatus } from "../channels/config.js";
import { applySale } from "../channels/sync.js";
import { publishListing, assertChannelConfigured } from "../channels/adapters.js";
import { publishEbayVariationListing, publishEbayListing, endEbayListing, endEbayVariationListing, resolveEbayImages, updateEbayPhotos, cardAspects, resolveFulfillmentPolicyId, reviseEbayItems } from "../channels/ebay.js";
import { runListingEngine, buildItemSpecifics } from "../listing/engine.js";
import { probeEbay, syncEbayInventory, syncEbayWindow, clearEbayTokenCache, getEbayTracking } from "../channels/ebay.js";
import {
  buildEbayAuthorizeUrl,
  exchangeEbayAuthCode,
  saveEbayTokenStore,
  blobDiag,
} from "../channels/ebayConnect.js";
import { hydrateEbaySettings, currentEbaySettings, saveEbaySettings, listEbayPolicies } from "../channels/ebaySettings.js";
import { publishMisprintListing, endMisprintAsk } from "../channels/misprint.js";
import { probeMisprint, listMisprintInventory, listMisprintOrders, hydrateMisprintKeys, saveMisprintKeys, misprintKeysPresent, misprintBaseUrl } from "../channels/misprint.js";
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
  router.use(async (_req, _res, next) => { try { await hydrateMisprintKeys(); await hydrateEbaySettings(); } catch { /* ignore */ } next(); });
  /** The real button: list one item from the app on eBay (photos are hosted on eBay first). */
  /** Everything the Build-the-listing screen shows before it goes live: description, item specifics, shipping / returns / payment. Read-only, nothing is sent to eBay. */
  router.post("/ebay/listing-preview", async (req, res) => {
    const item = req.body?.item || {};
    const { resolveCategory, categoryAspectList, autoAspects, looksLikeCard } = await import("../comps.js");
    const { buildEbayDescription, itemKind } = await import("../listing/engine.js");
    let cat = { id: "183454", name: "CCG Individual Cards" };
    try { cat = await resolveCategory(item); } catch { /* keep cards */ }
    const isCard = cat.id === "183454";
    const id = { productName: item.productName || item.title, title: item.title, setName: item.setName, collectorNumber: item.collectorNumber, rarity: item.rarity, finish: item.finish, language: item.language, condition: isCard ? item.condition : (item.condition && !/^(NM|LP|MP|HP)$/i.test(item.condition) ? item.condition : "NEW"), game: item.game, quantity: item.quantity, sealed: !isCard };
    /* what we know for sure from identify; then everything the title supports for this category */
    const known = {};
    if (isCard) for (const [k, v] of Object.entries(cardAspects({ ...item, number: item.number || item.collectorNumber, cardName: item.cardName || item.productName }) || {})) known[k] = v;
    if (isCard && item.rarity) known.Rarity = [String(item.rarity)];
    if (isCard && item.finish) known.Finish = [String(item.finish)];
    if (isCard && !known.Language) known.Language = [String(item.language || "English")];
    if (isCard) { const man = buildItemSpecifics({ game: item.game }).Manufacturer; if (man) known.Manufacturer = [man]; }
    /* true for any raw single you pull from a pack */
    if (isCard && !/\b(PSA|BGS|CGC|SGC|TAG|BCCG|HGA|Beckett)\b/i.test(`${item.title}`)) Object.assign(known, { "Card Size": ["Standard"], Autographed: ["No"], Customized: ["No"] });
    if (isCard && /pok/i.test(item.game || item.title || "")) known.Franchise = ["Pokémon"];
    let list = []; try { list = [...(await categoryAspectList(cat.id))]; } catch { list = []; }
    /* thin categories (Pez, toys, figures...) list barely any specifics: add the ones buyers actually search by. eBay accepts custom specifics. */
    if (!isCard && list.filter((a) => !/prop 65|country of origin/i.test(a.name)).length < 8) {
      let chars = []; try { chars = ((await categoryAspectList("183454")).find((a) => a.name === "Character") || {}).values || []; } catch { chars = []; }
      const extra = [
        { name: "Brand", values: ["PEZ", "Funko", "Hasbro", "Mattel", "Jakks Pacific", "Bandai", "Nintendo", "Tomy", "Takara Tomy", "Wicked Cool Toys", "Build-A-Bear", "LEGO", "McDonald's", "Burger King", "Ultra Pro", "Dragon Shield", "BCW", "Banpresto", "Good Smile", "Kotobukiya", "Sanrio", "Hallmark", "Zoteki", "Pokémon Center", "The Pokémon Company"] },
        { name: "Franchise", values: ["Pokémon", "One Piece", "Dragon Ball", "Yu-Gi-Oh!", "Digimon", "Star Wars", "Marvel", "Disney", "Nintendo", "Sonic the Hedgehog", "Naruto", "My Hero Academia", "Demon Slayer", "Hello Kitty"] },
        { name: "Character", values: chars },
        { name: "Type", values: ["Dispenser", "Figure", "Action Figure", "Plush", "Toy", "Keychain", "Pin", "Poster", "Binder", "Album", "Sleeves", "Playmat", "Deck Box", "Tin", "Booster Box", "Booster Pack", "Elite Trainer Box", "Collection Box", "Blister", "Statue", "Figurine", "Mug", "Cup", "Lunch Box", "Backpack", "Hat", "Shirt", "Sticker", "Puzzle", "Lamp", "Blanket", "Video Game", "Book", "Manga"] },
        { name: "Color", values: ["Black", "White", "Red", "Orange", "Yellow", "Green", "Blue", "Purple", "Pink", "Brown", "Gray", "Gold", "Silver", "Multicolor", "Clear"] },
        { name: "Year Manufactured", values: Array.from({ length: 40 }, (_, k) => String(2026 - k)) },
        { name: "Material", values: ["Plastic", "Vinyl", "PVC", "Metal", "Plush", "Cardboard", "Paper", "Resin", "Ceramic", "Fabric"] },
        { name: "Features", values: ["Limited Edition", "Exclusive", "Rare", "Collector's Edition", "Retired", "Promo", "Glow in the Dark", "Holographic"] },
        { name: "Packaging", values: ["Original (Unopened)", "Original (Opened)", "No Packaging", "Blister Pack", "Box"] },
        { name: "Original/Licensed Reproduction", values: ["Original", "Licensed Reproduction"] },
      ];
      const have = new Set(list.map((a) => a.name.toLowerCase()));
      list = [...list, ...extra.filter((e) => !have.has(e.name.toLowerCase())).map((e) => ({ ...e, required: false, recommended: true, mode: "FREE_TEXT" }))];
    }
    const names = new Set(list.map((a) => a.name.toLowerCase()));
    for (const k of Object.keys(known)) if (list.length && !names.has(k.toLowerCase())) delete known[k]; /* only specifics this category has */
    const filled = autoAspects(list, `${item.title || ""} ${item.productName || ""} ${item.setName || ""} ${item.description || ""}`, known);
    const aspects = {}; for (const [k, v] of Object.entries(filled)) aspects[k] = (Array.isArray(v) ? v : [v]).join(", ");
    const rank = (a) => (a.required ? 0 : a.recommended ? 1 : 2);
    const more = list.filter((a) => !aspects[a.name] && !/prop 65|autograph authentication number|signed by|customized/i.test(a.name)).sort((a, b) => rank(a) - rank(b)).slice(0, 24).map((a) => ({ name: a.name, required: a.required, values: a.values.slice(0, 200) }));
    let names2 = {}, shippingOptions = [], returnOptions = [];
    try { const p = await listEbayPolicies(); shippingOptions = p.fulfillment || []; returnOptions = p.returns || []; for (const g of [p.fulfillment, p.payment, p.returns]) for (const x of g || []) names2[x.id] = x.name; } catch { /* not connected: ids only */ }
    const st = currentEbaySettings(), ship = resolveFulfillmentPolicyId({ ...item, categoryId: cat.id });
    const pol = (pid) => (pid ? { id: pid, name: names2[pid] || "Your saved eBay policy" } : null);
    const eng = runListingEngine(item);
    res.json({ ok: true, kind: isCard ? itemKind(id) : "product", category: cat, allNames: list.map((a) => a.name), title: eng.title, description: buildEbayDescription({ ...id, specifics: isCard ? null : filled }), aspects, more, shipping: pol(ship), shippingOptions, returns: pol(item.returnPolicyId || st.returnPolicyId), returnOptions, payment: pol(st.paymentPolicyId) });
  });
  /* change live listings: price / quantity / title per SKU (variations = one SKU each) */
  router.post("/ebay/revise", async (req, res) => {
    const updates = Array.isArray(req.body?.updates) ? req.body.updates.slice(0, 200) : [];
    try {
      assertChannelConfigured("ebay");
      if (!updates.length) return res.status(400).json({ ok: false, error: "Nothing to change." });
      const results = await reviseEbayItems(updates);
      const bad = results.filter((r) => !r.ok);
      res.json({ ok: bad.length === 0, results, error: bad.length ? bad[0].error : undefined });
    } catch (e) {
      res.status(e.code === "VALIDATION" ? 400 : 502).json({ ok: false, error: e.message });
    }
  });
  router.post("/ebay/offers-on", async (req, res) => {
    const skus = Array.isArray(req.body?.skus) ? req.body.skus.filter(Boolean).slice(0, 300) : [];
    try {
      assertChannelConfigured("ebay"); if (!skus.length) return res.status(400).json({ ok: false, error: "Nothing picked." });
      const { enableBestOffer } = await import("../channels/ebay.js");
      const results = await enableBestOffer(skus, { pct: Number(req.body?.pct) || 80 }), bad = results.filter((r) => !r.ok);
      res.json({ ok: bad.length === 0, done: results.length - bad.length, failed: bad.length, results, error: bad[0]?.error });
    } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
  });
  router.post("/ebay/update-photos", async (req, res) => {
    const { sku, photos } = req.body || {};
    try {
      assertChannelConfigured("ebay");
      if (!sku) return res.status(400).json({ ok: false, error: "This item has no eBay SKU." });
      const out = await updateEbayPhotos(String(sku), photos || []);
      res.json({ ok: true, ...out });
    } catch (e) {
      res.status(e.code === "VALIDATION" ? 400 : 502).json({ ok: false, error: e.message, details: e.details });
    }
  });
  router.post("/ebay/publish-item", async (req, res) => {
    const item = req.body?.item || {};
    try {
      assertChannelConfigured("ebay");
      if (!item.title) return res.status(400).json({ ok: false, error: "Add a title first." });
      if (!(Number(item.price) > 0)) return res.status(400).json({ ok: false, error: "Add a price first." });
      if (!(item.photos || []).length) return res.status(400).json({ ok: false, error: "eBay needs at least one photo." });
      const out = await publishEbayListing(item, { dryRun: Boolean(req.body?.dryRun) });
      res.json({ ok: true, ...out });
    } catch (e) {
      res.status(e.code === "VALIDATION" ? 400 : 502).json({ ok: false, error: e.message, details: e.details });
    }
  });
  /** End live listings. Body: { items: [{ id, offerId, listingId, groupId }] }. Variation listings end as one group. */
  router.post("/ebay/end-listings", async (req, res) => {
    const list = Array.isArray(req.body?.items) ? req.body.items.slice(0, 200) : [];
    try {
      assertChannelConfigured("ebay");
      if (!list.length) return res.status(400).json({ ok: false, error: "Pick at least one listing." });
      const ended = [], failed = [], doneGroups = new Map(), doneOffers = new Set();
      for (const it of list) {
        try {
          if (it.groupId) {
            if (!doneGroups.has(it.groupId)) { doneGroups.set(it.groupId, endEbayVariationListing(it.groupId).then(() => null, (e) => e)); }
            const err = await doneGroups.get(it.groupId); if (err) throw err;
          } else if (it.offerId) {
            if (!doneOffers.has(it.offerId)) { doneOffers.add(it.offerId); await endEbayListing({ listingId: it.offerId }); }
          } else { throw new Error("No eBay offer on this item. Tap Sync, then try again."); }
          ended.push(it.id);
        } catch (e) { failed.push({ id: it.id, error: e.message || "eBay said no." }); }
      }
      res.json({ ok: failed.length === 0, ended, failed });
    } catch (e) {
      res.status(502).json({ ok: false, error: e.message, ended: [], failed: list.map((x) => ({ id: x.id, error: e.message })) });
    }
  });
  /** One-shot live proof of a Pick-Your-Card listing: publish 2 cheap cards as one listing, then end it. */
  router.post("/ebay/variation-test", async (req, res) => {
    const stamp = Date.now();
    const img = "https://tcgplayer-cdn.tcgplayer.com/product/714386_in_1000x1000.jpg";
    const mk = (n, price) => ({ sku: `hud-vartest-${stamp}-${n}`, title: `Pokemon Holo Rare Card Option ${n} Near Mint`, price, quantity: 1, condition: "NM", game: "pokemon", photos: [img] });
    const batch = { groupId: `hud-vartest-${stamp}`, title: "Pokemon Holo Rare Pick Your Card Near Mint", description: "Pick your card. Near mint Pokemon trading cards, ships in a toploader and bubble mailer.", game: "pokemon", setName: "Misc", children: [mk(1, 4.99), mk(2, 5.99)] };
    let pub = null;
    try {
      pub = await publishEbayVariationListing(batch);
      let ended = false, endError = null;
      try { await endEbayVariationListing(batch.groupId); ended = true; } catch (e) { endError = e.message; }
      res.json({ ok: true, listingId: pub.listingId, groupKey: pub.groupKey, offerIds: pub.offerIds, childCount: pub.childCount, ended, endError });
    } catch (e) {
      res.status(502).json({ ok: false, error: e.message, details: e.details });
    }
  });
  /** One-shot live proof: publish a card under $20, confirm policy, withdraw immediately. */
  router.post("/ebay/publish-test", async (req, res) => {
    const item = req.body?.item || {};
    if (!(Number(item.price) > 0 && Number(item.price) < 20)) return res.status(400).json({ ok: false, error: "Test card must be priced under $20" });
    let pub = null;
    try {
      pub = await publishEbayListing({ ...item, id: item.id || `livetest-${Date.now()}`, game: item.game || "pokemon" });
      let ended = false, endError = null;
      try { await endEbayListing({ listingId: pub.offerId }); ended = true; } catch (e) { endError = e.message; }
      res.json({ ok: true, listingId: pub.listingId, offerId: pub.offerId, sku: pub.sku, price: pub.price, fulfillmentPolicyId: pub.fulfillmentPolicyId, ended, endError });
    } catch (e) {
      res.status(502).json({ ok: false, error: e.message, details: e.details, published: pub });
    }
  });
  /** Sawyer-approved (Oct 12) throwaway test: does re-posting the same product update price or duplicate? Cleans up after itself. */
  router.post("/misprint/upsert-test", async (req, res) => {
    const pid = Number(req.body?.product_id);
    const before = await listMisprintInventory();
    const known = new Set(before.map((r) => r.listing_id));
    const log = [];
    try {
      for (const price of [9.91, 9.93]) {
        const r = await publishMisprintListing({ tcgplayerId: pid, price, condition: "NM", quantity: 1, variant: req.body?.variant, misprintVariantId: req.body?.misprintVariantId }, { confirmed: true });
        log.push({ price, listingId: r.listingId, raw: r.raw });
      }
      const after = (await listMisprintInventory()).filter((r) => r.product_id === pid);
      const created = after.filter((r) => !known.has(r.listing_id));
      const cleanup = [];
      for (const r of created) {
        try { await endMisprintAsk({ listingId: r.listing_id }, { confirmed: true }); cleanup.push({ id: r.listing_id, ended: true }); }
        catch (e) { cleanup.push({ id: r.listing_id, ended: false, error: e.message }); }
      }
      res.json({ ok: true, log, newRows: created.map((r) => ({ id: r.listing_id, price: r.price, status: r.status })), cleanup });
    } catch (e) {
      res.status(502).json({ ok: false, error: e.message, details: e.details, log });
    }
  });
  /** In-app eBay policy pickers: current values + the account's real policies. */
  router.get("/ebay/settings", async (_req, res) => {
    let policies = { fulfillment: [], payment: [], returns: [] };
    try { policies = await listEbayPolicies(); } catch { /* not connected */ }
    res.json({ settings: currentEbaySettings(), policies });
  });
  router.post("/ebay/settings", async (req, res) => {
    try { res.json({ ok: true, settings: await saveEbaySettings(req.body || {}) }); }
    catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }); }
  });
  /** Misprint key state for the in-app field (never returns the key). */
  router.get("/misprint/key", (_req, res) => {
    res.json({ keySaved: misprintKeysPresent(), baseSet: Boolean(misprintBaseUrl()) });
  });
  router.post("/misprint/key", async (req, res) => {
    try {
      res.json({ ok: true, ...(await saveMisprintKeys(req.body || {})) });
    } catch (err) {
      const code = err.code === "CONFLICT" ? 409 : err.code === "VALIDATION" ? 400 : 500;
      res.status(code).json({ ok: false, error: err.message, code: err.code || "ERROR" });
    }
  });

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

      if (_req.body && _req.body.offset !== undefined) {
        // Windowed mode (used by /next): small deterministic pages, client stitches them.
        return res.json(await syncEbayWindow({ offset: _req.body.offset, limit: _req.body.limit }));
      }
      const sync = await syncEbayInventory({ maxItems: 1000 });
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
        truncated: Boolean(sync.truncated),
        partial: Boolean(sync.partial),
        records: sync.records,
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
  /**
   * Combine + PUBLISH a Pick-Your-Card variation listing to eBay.
   * Body: same as /ebay/combine. Needs eBay connected + policy IDs.
   */
  router.post("/ebay/publish-variation", async (req, res) => {
    try {
      const children = Array.isArray(req.body?.items) ? req.body.items : [];
      if (children.length < 2) return res.status(400).json({ ok: false, error: "Pick at least 2 cards to make a variation listing." });
      for (const c of children) {
        if (!(Number(c.price) > 0)) return res.status(400).json({ ok: false, error: `${c.title || c.id} needs a price.` });
        if (!(c.photos || []).length) return res.status(400).json({ ok: false, error: `${c.title || c.id} needs a photo.` });
      }
      const opts = { setName: req.body?.setName, rarity: req.body?.rarity, game: req.body?.game };
      const batch = combineVariationBatch(children, opts);
      const b = req.body || {};
      if (b.title) batch.title = String(b.title).slice(0, 80);
      if (b.description) batch.description = String(b.description);
      for (const k of ["returnPolicyId", "fulfillmentPolicyId", "bestOffer", "offerFloorPct"]) if (b[k] != null) batch[k] = b[k];
      if (req.body?.dryRun) return res.json({ ok: true, dryRun: true, groupId: batch.groupId, title: batch.title, count: children.length, totalQty: batch.totalQty });
      assertChannelConfigured("ebay");
      for (let i = 0; i < children.length; i++) batch.children[i].photos = (await resolveEbayImages(children[i])).map((url) => ({ url }));
      const published = await publishEbayVariationListing(batch);
      res.json({ ok: true, groupId: batch.groupId, title: batch.title, published });
    } catch (e) {
      res.status(e.code === "VALIDATION" ? 400 : 502).json({ ok: false, error: e.message, details: e.details });
    }
  });

  /** Safe check: builds the item + offer on eBay, then deletes both. Never publishes. */
  router.post("/ebay/publish-check", async (_req, res) => {
    try {
      assertChannelConfigured("ebay");
      const out = await publishEbayListing(
        { id: `check${Date.now().toString(36)}`, sku: `hud-check-${Date.now().toString(36)}`, title: "HUD publish check (never listed)", price: 1.99, quantity: 1, category: "card" },
        { dryRun: true },
      );
      res.json({ ok: true, ...out });
    } catch (err) {
      res.status(err.status || 500).json({ ok: false, error: err.message, code: err.code || "ERROR", details: err.details || null });
    }
  });

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
  /** Misprint listings + orders (read). First record's field names are echoed so the mapping can be checked. */
  router.get("/misprint/inventory", async (_req, res) => {
    try {
      const rows = await listMisprintInventory();
      res.json({ ok: true, count: rows.length, sampleKeys: rows[0] ? Object.keys(rows[0]) : [], rows });
    } catch (err) {
      res.status(err.status || 502).json({ ok: false, error: err.message, code: err.code || "ERROR" });
    }
  });
  /** Misprint listings mapped to HUD records (channels.misprint). */
  router.post("/misprint/sync", async (_req, res) => {
    try {
      const rows = await listMisprintInventory();
      const records = rows.map((r) => {
        const st = String(r.status || "").toLowerCase();
        const live = st === "active" || st === "listed" || st === "live";
        return {
          id: `mp-${r.listing_id}`,
          title: r.title,
          price: r.price != null ? Number(r.price) : null,
          quantity: Math.max(0, Number(r.quantity_remaining ?? r.quantity) || 0),
          imageUrl: (r.image_urls && r.image_urls[0]) || r.card_image_url || null,
          setName: r.set_name || null,
          number: r.cardnumber || null,
          channels: { misprint: { listingId: r.listing_id, status: live ? "active" : st === "completed" ? "ended" : st || "queued", price: r.price != null ? Number(r.price) : null } },
        };
      });
      res.json({ ok: true, pulled: records.length, records });
    } catch (err) {
      res.status(err.status || 502).json({ ok: false, error: err.message, code: err.code || "ERROR" });
    }
  });
  router.get("/misprint/orders", async (_req, res) => {
    try {
      const rows = await listMisprintOrders();
      res.json({ ok: true, count: rows.length, sampleKeys: rows[0] ? Object.keys(rows[0]) : [], rows });
    } catch (err) {
      res.status(err.status || 502).json({ ok: false, error: err.message, code: err.code || "ERROR" });
    }
  });

  router.get("/misprint/probe", async (_req, res, next) => {
    try {
      const result = await probeMisprint();
      const status = result.ok ? 200 : 502;
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
        storage: { durable: blobDiag.enabled, error: blobDiag.lastError },
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
