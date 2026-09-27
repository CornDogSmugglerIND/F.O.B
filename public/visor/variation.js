/**
 * Client twin — Pick-Your-Card variation combine.
 * Mirrors src/listing/variation.js for offline Channels combine.
 */

import { buildVariationTitle, buildEbayDescription, LISTING_CONFIG } from "/visor/listing-engine.js?v=1";

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function row(cols) {
  return cols.map(csvEscape).join(",");
}

function exportEbayFileExchange(items, opts = {}) {
  const info = opts.infoLine || "Info,Version=1.0.0,Template=eBay-Live-Beta";
  const headers = [
    "Action",
    "SKU",
    "Title",
    "Description",
    "StartPrice",
    "Quantity",
    "ConditionID",
    "Format",
    "Duration",
  ];
  const lines = ["\uFEFF" + info, row(headers)];
  for (const it of items) {
    const isParent = Boolean(it.variationParent);
    lines.push(
      row([
        it.action || "Add",
        it.sku || it.id || "",
        it.title || "",
        it.description || "",
        isParent ? "" : it.price != null ? Number(it.price).toFixed(2) : "",
        it.quantity != null ? String(it.quantity) : "1",
        it.conditionId || "3000",
        it.format || "FixedPrice",
        it.duration || "GTC",
      ]),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

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

export function variationLine(child) {
  const name = child.productName || child.title || "Card";
  const num = child.collectorNumber ? ` ${child.collectorNumber}` : "";
  const qty = Math.max(1, Number(child.quantity) || 1);
  return { name, number: child.collectorNumber || null, qty, line: `${name}${num} ×${qty}` };
}

/**
 * @param {Array<Record<string, unknown>>} children
 * @param {Record<string, unknown>} [opts]
 */
export function combineVariationBatch(children, opts = {}) {
  if (!Array.isArray(children) || children.length < 2) {
    throw new Error("Combine needs at least 2 cards");
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
      parentSku,
      id: c.id,
    };
  });

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
    csv: exportEbayFileExchange([parentRow, ...childRows]),
    childCount: children.length,
    totalQty,
  };
}
