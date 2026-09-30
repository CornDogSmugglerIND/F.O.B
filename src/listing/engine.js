/**
 * Listing engine — locked rules from design/LISTING-ENGINE.md.
 * Pricing baselines are CONFIG — Sawyer settles A vs B; do not hardcode a pick.
 */

export const LISTING_CONFIG = {
  titleMaxLen: 80,
  /** Pricing conflict — both exposed; activeBaseline picks which formula Load uses. */
  activeBaseline: "sold_comps", // "tcgplayer_market" | "sold_comps"
  baselines: {
    tcgplayer_market: {
      id: "A",
      multiplier: 1.3,
      hardFloorPerCard: 2.0,
      eseCost: 0.78,
    },
    sold_comps: {
      id: "B",
      multiplier: 1.3,
      hardFloorPerCard: 1.77,
      shippingAdd: 0.99,
      eseCost: 0.74,
    },
  },
  combineBase: 4.46,
  doubleHoloFloor: 3.99,
  doubleHoloAutoOffset: 0.03,
  promotedRate: 0.05,
  fvfRate: 0.1325,
  orderFee: 0.3,
  pokemonManufacturer: "The Pokémon Company",
  sealedCondition: "New/Factory Sealed",
  signOff: "CornDogSmuggler Coalition - Operating To Marine Corps Standards.",
};

/** @param {string} s */
function clean(s) {
  return String(s || "")
    .replace(/!+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Card games whose singles use the locked TCG-single title format. */
const CARD_GAMES = /pok[eé]mon|magic|one piece|dragon ball|digimon|sports/i;

/** Finish worth naming in a title — never NM / Near Mint. @param {{ finish?: string|null }} id */
function cardFinish(id) {
  const finish = clean(id.finish);
  return finish && !/^(nm|near mint)\b/i.test(finish) ? finish : "";
}

/** @param {object} id */
function isCardLike(id) {
  if (id.collectorNumber || id.setName || cardFinish(id)) return true;
  return CARD_GAMES.test(id.game || "");
}

/**
 * Fit a product block ahead of a locked suffix without ever cutting the suffix.
 * @param {string} head
 * @param {string} suffix e.g. "- NM Single" (leading dash/space included)
 * @param {number} max
 */
function fitHead(head, suffix, max) {
  const room = max - suffix.length;
  const h = head.length > room ? head.slice(0, Math.max(0, room)).trim() : head;
  return h ? `${h}${suffix}` : suffix.trim();
}

/**
 * Build eBay title — Sawyer's locked rules (design/LISTING-ENGINE.md §3):
 * - TCG single: [Card Name] [Number] [Set Name] [Finish]- NM Single
 *   e.g. "Charizard ex 223/197 Obsidian Flames- NM Single"
 * - Sealed: [Product Name]- New/Factory Sealed
 *   e.g. "Dragon Ball Super TCG SD16 Darkness Reborn Starter Deck- New/Factory Sealed"
 * Product/card name leads, no !, ≤80 chars, truncation never cuts the locked ending.
 * Non-card, non-sealed items keep name-first dash segments with no locked ending.
 * @param {{
 *   productName?: string|null,
 *   setName?: string|null,
 *   collectorNumber?: string|null,
 *   rarity?: string|null,
 *   finish?: string|null,
 *   game?: string|null,
 *   condition?: string|null,
 *   sealed?: boolean,
 * }} id
 */
export function buildEbayTitle(id = {}) {
  const max = LISTING_CONFIG.titleMaxLen;
  const name = clean(id.productName);

  if (id.sealed) {
    return fitHead(name, `- ${LISTING_CONFIG.sealedCondition}`, max);
  }

  if (isCardLike(id)) {
    const parts = [];
    if (name) parts.push(name);
    if (id.collectorNumber) parts.push(clean(id.collectorNumber));
    if (id.setName) parts.push(clean(id.setName));
    const finish = cardFinish(id);
    if (finish) parts.push(finish);
    return fitHead(parts.join(" "), "- NM Single", max);
  }

  const parts = [];
  if (name) parts.push(name);
  if (id.condition) parts.push(clean(id.condition));
  let title = parts.join(" - ");
  if (title.length > max) title = title.slice(0, max - 1).trim();
  return title;
}

/**
 * Pick-your-card variation title — Sawyer's locked rule:
 * [Set Name] Pick Your Card [Game] TCG Singles NM
 * (design/LISTING-ENGINE.md §3.3 still shows the older
 * "Pokemon [Set Name] - Pick Your Card [Rarity] NM" template;
 * the locked rule wins — set leads, game named, no rarity slot.
 * `rarity` is accepted but unused.)
 * @param {{ setName?: string|null, rarity?: string|null, game?: string|null }} id
 */
export function buildVariationTitle(id = {}) {
  const game = clean(id.game) || "Pokemon";
  const set = clean(id.setName) || "Set";
  return fitHead(set, ` Pick Your Card ${game} TCG Singles NM`, LISTING_CONFIG.titleMaxLen);
}

/**
 * Two-layer plain-text description + locked sign-off.
 * @param {{
 *   productName?: string|null,
 *   setName?: string|null,
 *   collectorNumber?: string|null,
 *   rarity?: string|null,
 *   finish?: string|null,
 *   language?: string|null,
 *   condition?: string|null,
 *   game?: string|null,
 *   quantity?: number,
 *   variations?: Array<{ name: string, number?: string, qty?: number }>,
 * }} id
 */
export function buildEbayDescription(id = {}) {
  const facts = [
    `Game: ${clean(id.game) || "TCG"}`,
    `Product: ${clean(id.productName) || "—"}`,
    `Set: ${clean(id.setName) || "—"}`,
    `Number: ${clean(id.collectorNumber) || "—"}`,
    `Rarity: ${clean(id.rarity) || "—"}`,
    `Finish: ${clean(id.finish) || "—"}`,
    `Language: ${clean(id.language) || "English"}`,
    `Condition: ${clean(id.condition) || "NM"}`,
    `Qty: ${Number(id.quantity) || 1}`,
  ];
  if (id.variations?.length) {
    facts.push("Variations:");
    for (const v of id.variations) {
      facts.push(`- ${clean(v.name)}${v.number ? ` ${clean(v.number)}` : ""} ×${v.qty || 1}`);
    }
  }
  const layer1 = facts.join("\n");
  const layer2 = [
    "",
    "Ships from Wisconsin. Combined shipping available on eligible orders.",
    "",
    LISTING_CONFIG.signOff,
  ].join("\n");
  return `${layer1}${layer2}`;
}

/**
 * Apply active pricing baseline to a raw market/sold number.
 * @param {number} raw
 * @param {{ qty?: number, shippingLabel?: number }} [opts]
 */
export function applyPricingBaseline(raw, opts = {}) {
  const qty = Math.max(1, Number(opts.qty) || 1);
  const key = LISTING_CONFIG.activeBaseline;
  const rule = LISTING_CONFIG.baselines[key] || LISTING_CONFIG.baselines.sold_comps;
  const base = Number(raw) || 0;
  let price = base * rule.multiplier * qty;
  if (key === "tcgplayer_market" && opts.shippingLabel != null) {
    price += Number(opts.shippingLabel) || 0;
  }
  const floor =
    key === "sold_comps"
      ? rule.hardFloorPerCard * qty + (rule.shippingAdd || 0)
      : rule.hardFloorPerCard * qty;
  return Math.max(price, floor);
}

/**
 * Item specifics patch for Pokémon / sealed.
 * @param {{ game?: string|null, sealed?: boolean, condition?: string|null }} id
 */
export function buildItemSpecifics(id = {}) {
  /** @type {Record<string, string>} */
  const specs = {};
  if (/pokemon/i.test(id.game || "")) {
    specs.Manufacturer = LISTING_CONFIG.pokemonManufacturer;
  }
  if (id.sealed) {
    specs.Condition = LISTING_CONFIG.sealedCondition;
  } else if (id.condition) {
    specs.Condition = clean(id.condition);
  }
  return specs;
}

/**
 * Run engine on a scout-shaped item → listing fields.
 * @param {Record<string, unknown>} item
 * @param {{ mode?: 'regular'|'variation', soldAvg?: number|null }} [opts]
 */
export function runListingEngine(item, opts = {}) {
  const id = {
    productName: item.productName || item.title,
    setName: item.setName,
    collectorNumber: item.collectorNumber,
    rarity: item.rarity,
    finish: item.finish,
    language: item.language,
    condition: item.condition,
    game: item.game,
    quantity: item.quantity,
    sealed: /sealed/i.test(String(item.category || "")) || /sealed/i.test(String(item.condition || "")),
  };
  const title =
    opts.mode === "variation" ? buildVariationTitle(id) : buildEbayTitle(id);
  const description = buildEbayDescription(id);
  const specifics = buildItemSpecifics(id);
  const suggestedPrice =
    opts.soldAvg != null
      ? applyPricingBaseline(opts.soldAvg, { qty: id.quantity })
      : item.price != null
        ? Number(item.price)
        : null;
  return {
    title,
    description,
    specifics,
    suggestedPrice,
    baseline: LISTING_CONFIG.activeBaseline,
    signOff: LISTING_CONFIG.signOff,
  };
}
