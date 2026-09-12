/**
 * Identify router — Command PR #59 comment `5649468890`.
 *
 * IDENTIFY (default): photos in → identity out (Anthropic vision when keyed).
 * Manual always available.
 * Catalog verifies / accepts typed set+number.
 *
 * BARCODE SCAN is a separate feature (`forcePath: "barcode"` only).
 * Never treat barcode as Identify’s front door. Never fall back to barcode
 * when photo vision is missing.
 */

import { lookupBarcode } from "../lookup.js";
import { searchCatalogs } from "./catalog.js";
import { identifyFromPhotos, visionKeyStatus } from "./vision.js";
import {
  emptyIdentity,
  identifyResult,
  identityToItemPatch,
  normalizeIdentity,
  gateCheck,
} from "./gate.js";

/**
 * @param {string|null|undefined} barcode
 */
async function pathBarcode(barcode, quantity = 1) {
  const networkCalls = [];
  const code = String(barcode || "").replace(/\D/g, "");
  if (!code) {
    return identifyResult({
      ok: false,
      path: "barcode",
      message: "No barcode provided.",
      networkCalls,
    });
  }

  networkCalls.push(`barcode:${code}`);
  const lookup = await lookupBarcode(code);
  if (!lookup.found || !lookup.product?.title) {
    return identifyResult({
      ok: false,
      path: "barcode",
      message: "No UPC catalog match. Photos kept.",
      networkCalls,
    });
  }

  const identity = normalizeIdentity(
    {
      product_name: lookup.product.title,
      collector_number: null,
      set_name: lookup.product.brand || null,
      set_code: code,
      game: "other",
      rarity: null,
      finish: null,
      language: "English",
      condition: "NM",
      confidence: "high",
      source: lookup.product.lookupSource || "upc",
    },
    quantity,
  );

  const gate = gateCheck(identity);
  if (!gate.complete) {
    identity.confidence = "low";
    return identifyResult({
      ok: false,
      path: "barcode",
      identity,
      candidates: [identity],
      message: `UPC hit: ${identity.product_name}. Fill missing gate fields (Manual) before listing: ${gate.missing.join(", ")}.`,
      networkCalls,
    });
  }

  return identifyResult({
    ok: true,
    path: "barcode",
    identity,
    candidates: [identity],
    message: `UPC identified: ${identity.product_name}`,
    networkCalls,
  });
}

/**
 * @param {{ name?: string, number?: string, set?: string, query?: string, quantity?: number }} input
 */
async function pathCatalog(input) {
  const { candidates, networkCalls } = await searchCatalogs(input);
  if (!candidates.length) {
    return identifyResult({
      ok: false,
      path: "catalog",
      message: "No catalog match for set/number/name. Try photos or Manual.",
      networkCalls,
    });
  }

  const qty = input.quantity ?? 1;
  const ranked = candidates.map((c) => normalizeIdentity(c, qty));
  const top = ranked[0];
  const gate = gateCheck(top);
  if (!gate.complete || top.confidence !== "high" || ranked.length > 1) {
    return identifyResult({
      ok: false,
      path: "catalog",
      identity: top,
      candidates: ranked.slice(0, 5),
      message: gate.complete
        ? ranked.length > 1
          ? "Multiple catalog candidates — pick one. Photos kept."
          : "Catalog candidate is low confidence — confirm or use Manual."
        : `Catalog hit incomplete — missing: ${gate.missing.join(", ")}. Pick/confirm or Manual.`,
      networkCalls,
    });
  }

  return identifyResult({
    ok: true,
    path: "catalog",
    identity: top,
    candidates: ranked.slice(0, 5),
    message: `Catalog match: ${top.product_name}`,
    networkCalls,
  });
}

/**
 * @param {{
 *   barcode?: string|null,
 *   photos?: string[],
 *   name?: string,
 *   number?: string,
 *   set?: string,
 *   query?: string,
 *   notes?: string,
 *   category?: string,
 *   quantity?: number,
 *   manual?: Partial<import('./gate.js').IdentifyCandidate>,
 *   forcePath?: 'barcode'|'catalog'|'photo_search'|'manual',
 * }} input
 */
export async function runIdentify(input = {}) {
  const quantity = Math.max(1, Number(input.quantity) || 1);
  const photos = Array.isArray(input.photos) ? input.photos : [];
  const hasCatalogHints = Boolean(input.number || input.set || (input.name && input.number));
  const hasPhotos = photos.some((p) => typeof p === "string" && p.startsWith("data:image/"));
  const force = input.forcePath;

  // Separate feature — Barcode Scan button only.
  if (force === "barcode") {
    return pathBarcode(input.barcode, quantity);
  }

  if (force === "manual" || input.manual?.product_name) {
    const identity = normalizeIdentity(
      {
        ...emptyIdentity(quantity),
        ...input.manual,
        confidence: "high",
        source: "manual",
      },
      quantity,
    );
    const gate = gateCheck(identity);
    return identifyResult({
      ok: gate.complete,
      path: "manual",
      identity,
      candidates: [identity],
      message: gate.complete
        ? `Manual identity set: ${identity.product_name}`
        : `Manual identity incomplete — missing: ${gate.missing.join(", ")}`,
      networkCalls: [],
    });
  }

  // Identify core: photos first.
  if (force === "photo_search" || (!force && hasPhotos)) {
    return identifyFromPhotos({
      photos,
      notes: input.notes,
      category: input.category,
      quantity,
    });
  }

  if (force === "catalog" || (!force && hasCatalogHints)) {
    return pathCatalog({
      name: input.name,
      number: input.number,
      set: input.set,
      query: input.query,
      quantity,
    });
  }

  if (input.name || input.number || input.query) {
    return pathCatalog({
      name: input.name,
      number: input.number,
      set: input.set,
      query: input.query,
      quantity,
    });
  }

  return identifyResult({
    ok: false,
    path: "none",
    message: "Identify needs photos (or Manual / set+number). Barcode scan is a separate button.",
    setupTask: null,
    missingKeys: [],
    networkCalls: [],
  });
}

export { identityToItemPatch, gateCheck, visionKeyStatus };
