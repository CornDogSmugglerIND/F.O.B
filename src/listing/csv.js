/**
 * CSV exporters — eBay File Exchange, Double Holo, generic/TCGPlayer-shaped.
 * design/LISTING-ENGINE.md §7
 */

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

/** QUOTE_ALL join */
function row(cols) {
  return cols.map(csvEscape).join(",");
}

/**
 * eBay File Exchange — BOM + Info line + QUOTE_ALL.
 * Variation parents: no StartPrice.
 * @param {Array<Record<string, unknown>>} items
 * @param {{ infoLine?: string }} [opts]
 */
export function exportEbayFileExchange(items, opts = {}) {
  const info =
    opts.infoLine ||
    "Info,Version=1.0.0,Template=eBay-Live-Beta";
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
    const cols = [
      it.action || "Add",
      it.sku || it.channels?.ebay?.sku || it.id || "",
      it.title || "",
      it.description || "",
      isParent ? "" : it.price != null ? Number(it.price).toFixed(2) : "",
      it.quantity != null ? String(it.quantity) : "1",
      it.conditionId || "3000",
      it.format || "FixedPrice",
      it.duration || "GTC",
    ];
    lines.push(row(cols));
  }
  return lines.join("\r\n") + "\r\n";
}

/**
 * Double Holo Vendor Hub column order.
 * Finish in name with [brackets]. Language always set.
 * @param {Array<Record<string, unknown>>} items
 */
export function exportDoubleHoloCsv(items) {
  const headers = [
    "Card Name",
    "Number",
    "Set",
    "Condition",
    "Quantity",
    "SKU",
    "Variation",
    "Graded",
    "Grade",
    "Grading Company",
    "Language",
  ];
  const lines = [row(headers)];
  for (const it of items) {
    let name = it.productName || it.title || "";
    const finish = it.finish;
    if (finish && !/\[[^\]]+\]/.test(name)) {
      name = `${name} [${finish}]`;
    }
    let number = String(it.collectorNumber || "").replace(/^0+(?=\d)/, "");
    number = number.replace(/\/\d+$/, "");
    lines.push(
      row([
        name,
        number,
        it.setName || "",
        it.condition || "NM",
        String(it.quantity ?? 1),
        it.sku || it.id || "",
        "", // Variation ignored on import
        it.graded ? "Yes" : "",
        it.grade || "",
        it.gradingCompany || "",
        it.language || "English",
      ]),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

/**
 * Generic / TCGPlayer-shaped sheet for import/export interchange.
 * @param {Array<Record<string, unknown>>} items
 */
export function exportGenericTcgCsv(items) {
  const headers = [
    "Name",
    "Set",
    "Number",
    "Rarity",
    "Condition",
    "Finish",
    "Language",
    "Quantity",
    "Price",
    "SKU",
    "Game",
  ];
  const lines = [row(headers)];
  for (const it of items) {
    lines.push(
      row([
        it.productName || it.title || "",
        it.setName || "",
        it.collectorNumber || "",
        it.rarity || "",
        it.condition || "",
        it.finish || "",
        it.language || "English",
        String(it.quantity ?? 1),
        it.price != null ? Number(it.price).toFixed(2) : "",
        it.sku || it.id || "",
        it.game || "",
      ]),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

/**
 * @param {'ebay'|'double_holo'|'tcgplayer'} format
 * @param {Array<Record<string, unknown>>} items
 */
export function exportCsv(format, items) {
  if (format === "ebay") return exportEbayFileExchange(items);
  if (format === "double_holo") return exportDoubleHoloCsv(items);
  return exportGenericTcgCsv(items);
}
