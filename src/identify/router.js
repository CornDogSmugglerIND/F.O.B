/**
 * Identify — photos in, identity out.
 *
 * Command #59 correction (supersedes #55 barcode-first):
 *   Identify = point the app at an item, it tells you what the item is.
 *   Barcode scanning is a separate feature with its own button.
 *   Do not fall back to barcode. That is not shipping Identify.
 *
 * Paths inside Identify:
 *   1. Photos → vision reads name/number/set/game/finish → catalog verify
 *   2. Manual — always available when confidence is low or vision is dark
 *
 * Never infinite-spinner. Never lose photos. Never guess on low confidence.
 */

import { identifyFromPhotos, visionKeyStatus } from "./vision.js";
import {
  emptyIdentity,
  identifyResult,
  identityToItemPatch,
  normalizeIdentity,
  gateCheck,
} from "./gate.js";

const PHOTO_FIRST_EMPTY =
  "Identify needs photos. Drop or take photos, then tap ID. Barcode is a separate button.";

const BARCODE_IS_SEPARATE =
  "Barcode scan is a separate feature. Identify is photos in → identity out.";

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

  if (force === "barcode") {
    return identifyResult({
      ok: false,
      path: "none",
      message: BARCODE_IS_SEPARATE,
      networkCalls: [],
    });
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

  if (force === "photo_search" || (!force && hasPhotos)) {
    return identifyFromPhotos({
      photos,
      notes: input.notes,
      category: input.category,
      quantity,
    });
  }

  const keys = visionKeyStatus();
  return identifyResult({
    ok: false,
    path: "none",
    message: PHOTO_FIRST_EMPTY,
    setupTask: null,
    missingKeys: [],
    networkCalls: [],
  });
}

export { identityToItemPatch, gateCheck, visionKeyStatus };
