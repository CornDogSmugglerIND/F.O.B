/**
 * eBay variation / Pick-Your-Card combine batches.
 * design/LISTING-ENGINE.md §7.2 — biggest Channels ask from photo dump.
 */

import {
  buildVariationTitle,
  buildEbayDescription,
  LISTING_CONFIG,
} from "./engine.js";
import { exportEbayFileExchange } from "./csv.js";

/**
 * @typedef {{
 *   id?: string,
 *   productName?: string|null,
 *   title?: string|null,
 *   collectorNumber?: string|null,
 *   setName?: string|null,
 *   rarity?: string|null,
 *   finish?: string|null,
 *   game?: string|null,
 *   condition?: string|null,
 *   language?: string|null,
 *   quantity?: number,
 *   price?: number|null,
 *   sku?: string|null,
 * }} VariationChild
 */

/**
 * Infer set / rarity / game from children when caller does not override.
 * @param {VariationChild[]} children
 */
export function inferVariationMeta(children) {
  const sets = [...new Set(children.map((c) => c.setName).filter(Boolean))];
  const rarities = [...new Set(children.map((c) => c.rarity).filter(Boolean))];
  const games = [...new Set(children.map((c) => c.game).filter(Boolean))];
  return {
    setName: sets.length === 1 ? sets[0] : sets.length ? "Mixed Sets" : "Set",
    rarity: rarities.length === 1 ? rarities[0] : "Mixed",
    game: games.length === 1 ? games[0] : "Pokemon",
    mixedSets: sets.length > 1,
  };
}

/**
 * One facts-block line per card: name + number + qty.
 * @param {VariationChild} child
 */
export function variationLine(child) {
  const name = child.productName || child.title || "Card";
  const num = child.collectorNumber ? ` ${child.collectorNumber}` : "";
  const qty = Math.max(1, Number(child.quantity) || 1);
  return { name, number: child.collectorNumber || null, qty, line: `${name}${num} ×${qty}` };
}

/**
 * Combine staged cards into one Pick-Your-Card variation listing payload.
 * Does not publish — builds title/description/CSV for File Exchange or Inventory API next.
 *
 * @param {VariationChild[]} children
 * @param {{
 *   setName?: string|null,
 *   rarity?: string|null,
 *   game?: string|null,
 *   groupId?: string|null,
 *   parentSku?: string|null,
 * }} [opts]
 */
export function combineVariationBatch(children, opts = {}) {
  if (!Array.isArray(children) || children.length < 2) {
    const err = new Error("Combine needs at least 2 cards");
    err.code = "VALIDATION";
    throw err;
  }

  const inferred = inferVariationMeta(children);
  const setName = opts.setName || inferred.setName;
  const rarity = opts.rarity || inferred.rarity;
  const game = opts.game || inferred.game;
  const groupId = opts.groupId || `var_${Date.now().toString(36)}`;

  const variations = children.map(variationLine);
  const title = buildVariationTitle({ setName, rarity, game });
  const description = buildEbayDescription({
    productName: `Pick Your Card · ${setName}`,
    setName,
    rarity,
    game,
    condition: "NM",
    language: "English",
    quantity: variations.reduce((s, v) => s + v.qty, 0),
    variations,
  });

  const parentSku = opts.parentSku || `hud-var-${groupId}`.slice(0, 50);
  const totalQty = variations.reduce((s, v) => s + v.qty, 0);

  /** Parent row — no StartPrice (FE rule). */
  const parentRow = {
    action: "Add",
    sku: parentSku,
    title,
    description,
    price: null,
    quantity: totalQty,
    variationParent: true,
    variationGroupId: groupId,
    setName,
    rarity,
    game,
    productName: title,
    condition: "NM",
  };

  const childRows = children.map((c, i) => {
    const line = variations[i];
    const childSku =
      c.sku || (c.id ? `hud-${c.id}`.slice(0, 50) : `${parentSku}-${i + 1}`);
    return {
      action: "Add",
      sku: childSku,
      title: line.name + (line.number ? ` ${line.number}` : ""),
      description: "",
      price: c.price != null ? Number(c.price) : LISTING_CONFIG.combineBase,
      quantity: line.qty,
      variationParent: false,
      variationGroupId: groupId,
      productName: c.productName || c.title,
      collectorNumber: c.collectorNumber,
      setName: c.setName || setName,
      rarity: c.rarity || rarity,
      finish: c.finish,
      game: c.game || game,
      condition: c.condition || "NM",
      language: c.language || "English",
      parentSku,
    };
  });

  const csv = exportEbayFileExchange([parentRow, ...childRows]);

  return {
    ok: true,
    groupId,
    title,
    description,
    setName,
    rarity,
    game,
    mixedSets: inferred.mixedSets,
    parent: parentRow,
    children: childRows,
    variations,
    csv,
    childCount: children.length,
    totalQty,
  };
}

/**
 * Drop variation parent rows from an FE-shaped array (read-path rule).
 * @param {Array<Record<string, unknown>>} rows
 */
export function dropVariationParents(rows) {
  return (rows || []).filter((r) => !r.variationParent);
}
