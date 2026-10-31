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
 * @typedef {'photo_search'|'manual'|'none'|'barcode'|'catalog'} IdentifyPath
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
 * Set names are the SPECIFIC expansion set — "Destined Rivals", "Surging
 * Sparks", "30th Celebration" — never the era/block the set sits inside.
 * (Sawyer, Oct 31 2026: a Destined Rivals booster got set = "Scarlet and
 * Violet".) Sealed items get no catalog correction, so the gate resolves the
 * set here: a specific set named in the product name wins over an era name,
 * and an era name with no specific set behind it drops confidence to low so
 * the operator picks — the era is never silently kept as the set.
 */
const ERA_SET_NAMES = new Set([
  "scarlet and violet", "sword and shield", "sun and moon", "black and white",
  "diamond and pearl", "heartgold and soulsilver", "platinum", "x and y",
]);
const KNOWN_SET_NAMES = [
  "Destined Rivals", "Surging Sparks", "Journey Together", "Prismatic Evolutions",
  "Stellar Crown", "Twilight Masquerade", "Temporal Forces", "Paradox Rift",
  "Obsidian Flames", "Paldea Evolved", "Scarlet & Violet 151", "30th Celebration",
  "Chaos Rising", "White Flare", "Black Bolt", "Phantasmal Flames", "Mega Evolution",
  "Crown Zenith", "Astral Radiance", "Brilliant Stars", "Lost Origin", "Silver Tempest",
  "Fusion Strike", "Evolving Skies", "Chilling Reign", "Battle Styles", "Shining Fates",
  "Vivid Voltage", "Darkness Ablaze", "Rebel Clash", "Cosmic Eclipse", "Unified Minds",
  "Unbroken Bonds", "Team Up", "Lost Thunder", "Celestial Storm", "Forbidden Light",
  "Ultra Prism", "Crimson Invasion", "Burning Shadows", "Guardians Rising",
];
const setKey = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
/**
 * @param {Partial<IdentifyCandidate>} partial
 * @returns {Partial<IdentifyCandidate>}
 */
export function resolveSetName(partial = {}) {
  const game = setKey(partial.game);
  if (!/pokemon|pok mon/.test(game) && partial.game) return partial;
  const setName = partial.set_name ? String(partial.set_name).trim() : partial.set_name;
  const hay = setKey(`${partial.product_name || ""} ${partial.set_code || ""}`);
  const specific = KNOWN_SET_NAMES.find((n) => hay.includes(setKey(n)));
  if (specific && setKey(specific) !== setKey(setName)) return { ...partial, set_name: specific };
  if (setName && ERA_SET_NAMES.has(setKey(setName))) {
    /* era/block name with no specific set behind it: not a set — operator decides */
    return { ...partial, confidence: "low" };
  }
  return partial;
}

/**
 * @param {Partial<IdentifyCandidate>} partial
 * @param {number} [quantity]
 * @returns {IdentifyCandidate}
 */
export function normalizeIdentity(partial = {}, quantity = 1) {
  const base = emptyIdentity(quantity);
  const p = resolveSetName(partial);
  return {
    ...base,
    ...p,
    language: p.language || base.language,
    condition: p.condition || base.condition,
    quantity: p.quantity != null ? Math.max(1, Number(p.quantity) || 1) : base.quantity,
    confidence: p.confidence === "high" ? "high" : "low",
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
