/**
 * Identify output gate — design/LISTING-ENGINE.md §1.4
 * Listing must not start until every required field is present.
 */

export const IDENTIFY_REQUIRED = [
  "product_name",
  "collector_number",
  "set_name",
  "set_code",
  "game",
  "rarity",
  "finish",
  "language",
  "condition",
  "quantity",
  "confidence",
];

/**
 * @typedef {'barcode'|'catalog'|'photo_search'|'manual'|'none'} IdentifyPath
 * @typedef {'high'|'low'} Confidence
 *
 * @typedef {object} IdentifyCandidate
 * @property {string|null} product_name
 * @property {string|null} collector_number
 * @property {string|null} set_name
 * @property {string|null} set_code
 * @property {string|null} game
 * @property {string|null} rarity
 * @property {string|null} finish
 * @property {string|null} language
 * @property {string|null} condition
 * @property {number} quantity
 * @property {Confidence} confidence
 * @property {string|null} [image]
 * @property {string|null} [source]
 *
 * @typedef {object} IdentifyResult
 * @property {boolean} ok
 * @property {IdentifyPath} path
 * @property {IdentifyCandidate|null} identity
 * @property {IdentifyCandidate[]} candidates
 * @property {string|null} message
 * @property {string|null} setupTask
 * @property {string[]} missingKeys
 * @property {string[]} networkCalls
 */

/** @returns {IdentifyCandidate} */
export function emptyIdentity(quantity = 1) {
  return {
    product_name: null,
    collector_number: null,
    set_name: null,
    set_code: null,
    game: null,
    rarity: null,
    finish: null,
    language: "English",
    condition: "NM",
    quantity: Math.max(1, Number(quantity) || 1),
    confidence: "low",
    image: null,
    source: null,
  };
}

/**
 * @param {Partial<IdentifyCandidate>} partial
 * @param {number} [quantity]
 * @returns {IdentifyCandidate}
 */
export function normalizeIdentity(partial = {}, quantity = 1) {
  const base = emptyIdentity(quantity);
  return {
    ...base,
    ...partial,
    language: partial.language || base.language,
    condition: partial.condition || base.condition,
    quantity: partial.quantity != null ? Math.max(1, Number(partial.quantity) || 1) : base.quantity,
    confidence: partial.confidence === "high" ? "high" : "low",
  };
}

/**
 * @param {IdentifyCandidate|null} identity
 * @returns {{ complete: boolean, missing: string[] }}
 */
export function gateCheck(identity) {
  if (!identity) return { complete: false, missing: [...IDENTIFY_REQUIRED] };
  const missing = IDENTIFY_REQUIRED.filter((key) => {
    const value = identity[key];
    if (key === "quantity") return !(Number(value) > 0);
    if (key === "confidence") return value !== "high" && value !== "low";
    return value == null || String(value).trim() === "";
  });
  return { complete: missing.length === 0, missing };
}

/**
 * @param {Partial<IdentifyResult>} partial
 * @returns {IdentifyResult}
 */
export function identifyResult(partial = {}) {
  return {
    ok: Boolean(partial.ok),
    path: partial.path || "none",
    identity: partial.identity ?? null,
    candidates: Array.isArray(partial.candidates) ? partial.candidates : [],
    message: partial.message ?? null,
    setupTask: partial.setupTask ?? null,
    missingKeys: Array.isArray(partial.missingKeys) ? partial.missingKeys : [],
    networkCalls: Array.isArray(partial.networkCalls) ? partial.networkCalls : [],
  };
}

/**
 * Map identify gate fields onto the Scouter item patch shape.
 * @param {IdentifyCandidate} identity
 * @param {IdentifyPath} path
 */
export function identityToItemPatch(identity, path) {
  const title =
    [identity.product_name, identity.collector_number, identity.set_name, identity.finish]
      .filter(Boolean)
      .join(" ")
      .trim() || identity.product_name;

  return {
    title: title || null,
    brand: identity.game || null,
    description: [identity.set_code, identity.rarity, identity.finish].filter(Boolean).join(" · ") || null,
    lookupSource: identity.source || path,
    productName: identity.product_name,
    collectorNumber: identity.collector_number,
    setName: identity.set_name,
    setCode: identity.set_code,
    game: identity.game,
    rarity: identity.rarity,
    finish: identity.finish,
    language: identity.language,
    condition: identity.condition,
    identifyConfidence: identity.confidence,
    identifyPath: path,
  };
}
