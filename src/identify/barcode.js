/**
 * Barcode scan — a separate feature from Identify.
 * Command #59 correction: not the front door, not step one, not a fallback
 * that counts as shipping Identify.
 */

import { lookupBarcode } from "../lookup.js";
import { identifyResult, normalizeIdentity, gateCheck } from "./gate.js";

/**
 * @param {string|null|undefined} barcode
 * @param {number} [quantity]
 */
export async function runBarcodeScan(barcode, quantity = 1) {
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
      message: "No UPC match. Photos kept. Use Identify on photos or Manual.",
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
      message: `UPC hit: ${identity.product_name}. Fill missing fields (Manual) before listing: ${gate.missing.join(", ")}.`,
      networkCalls,
    });
  }

  return identifyResult({
    ok: true,
    path: "barcode",
    identity,
    candidates: [identity],
    message: `Barcode match: ${identity.product_name}`,
    networkCalls,
  });
}
