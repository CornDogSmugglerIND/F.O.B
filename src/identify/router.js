/**
 * Identify — Command correction on #55 / #59 (supersedes barcode-first).
 *
 * Identify = photos in, identity out. That is the feature.
 * Manual is the always-available fallback.
 * Barcode scanning is a separate feature (SCAN / /api/scouter/barcode). It is
 * not inside this router and does not count as shipping Identify.
 *
 * Photo-first Identify is not wired yet. Honest message. Never substitute
 * barcode. Never ask Sawyer for a key. Never infinite-spinner. Never lose photos.
 */

import { identifyFromPhotos, visionKeyStatus } from "./vision.js";
import {
  emptyIdentity,
  identifyResult,
  identityToItemPatch,
  normalizeIdentity,
  gateCheck,
} from "./gate.js";

/**
 * @param {{
 *   photos?: string[],
 *   notes?: string,
 *   category?: string,
 *   quantity?: number,
 *   manual?: Partial<import('./gate.js').IdentifyCandidate>,
 *   forcePath?: 'photo_search'|'manual'|'barcode'|'catalog',
 * }} input
 */
export async function runIdentify(input = {}) {
  const quantity = Math.max(1, Number(input.quantity) || 1);
  const photos = Array.isArray(input.photos) ? input.photos : [];
  const hasPhotos = photos.some((p) => typeof p === "string" && p.startsWith("data:image/"));
  const force = input.forcePath;

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

  if (force === "barcode") {
    return identifyResult({
      ok: false,
      path: "none",
      message: "Identify is photos in, identity out. Use Scan for UPC.",
      setupTask: null,
      missingKeys: [],
      networkCalls: [],
    });
  }

  if (force === "photo_search" || hasPhotos) {
    return identifyFromPhotos({
      photos,
      notes: input.notes,
      category: input.category,
      quantity,
    });
  }

  return identifyResult({
    ok: false,
    path: "none",
    message: "Drop or take photos first. Identify reads the item from the photo. Or use Manual.",
    setupTask: null,
    missingKeys: [],
    networkCalls: [],
  });
}

export { identityToItemPatch, gateCheck, visionKeyStatus };
