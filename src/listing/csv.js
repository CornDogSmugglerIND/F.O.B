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

/* ------------------------------------------------------------------ */
/* Importers — CSV in, normalized item partials out.                   */
/*                                                                     */
/* Normalized item shape:                                              */
/* { title, productName, collectorNumber, setName, game, rarity,        */
/*   finish, language, condition, quantity, price, sku, description,    */
/*   notes, source, externalId }                                        */
/*                                                                     */
/* Header matching is alias-based and case-insensitive: vendor exports  */
/* rename columns freely, so we match on normalized header names.       */
/* misprint + seller_fb formats are best-effort (no canonical export    */
/* spec on file); unknown columns are kept in `extra`.                 */
/* ------------------------------------------------------------------ */

/** Minimal RFC-4180-ish parser: quotes, escaped quotes, CRLF. */
export function parseCsvRows(text) {
  const src = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      cell += c;
    }
  }
  row.push(cell);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

function normHeader(h) {
  return String(h || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const FIELD_ALIASES = {
  title: ["title", "productname", "cardname", "name", "itemtitle", "listingtitle"],
  description: ["description", "itemdescription", "details"],
  sku: ["sku", "customlabel", "sellersku", "merchantsku", "itemsku"],
  price: ["startprice", "price", "myprice", "currentprice", "buyitnowprice", "amount"],
  quantity: ["quantity", "totalquantity", "qty", "availablequantity", "stock"],
  setName: ["set", "setname", "expansionset", "settitle"],
  collectorNumber: ["number", "cardnumber", "collectornumber", "cardno"],
  condition: ["condition", "itemcondition", "cardcondition"],
  finish: ["finish", "variation", "foil", "printing", "holo", "isfoil"],
  language: ["language", "lang"],
  rarity: ["rarity"],
  game: ["game", "category", "productline"],
  externalId: ["tcgplayerid", "ebayitemid", "itemid", "listingid", "orderid", "productid"],
  action: ["action"],
  graded: ["graded"],
  grade: ["grade", "gradenumeric"],
  gradingCompany: ["gradingcompany", "grader"],
};

function mapRow(headers, cells) {
  const normed = headers.map(normHeader);
  const get = (field) => {
    const aliases = FIELD_ALIASES[field] || [];
    for (let i = 0; i < normed.length; i++) {
      if (aliases.includes(normed[i])) return cells[i] ?? "";
    }
    return "";
  };
  const num = (v) => {
    const cleaned = String(v).replace(/[^0-9.\-]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  };
  const int = (v) => {
    const n = parseInt(String(v).replace(/[^0-9\-]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  };
  const known = new Set(Object.values(FIELD_ALIASES).flat());
  const extra = {};
  headers.forEach((h, i) => {
    if (!known.has(normed[i]) && (cells[i] ?? "") !== "") extra[h] = cells[i];
  });

  // eBay File Exchange finish hint: Title suffixes like "[Holo]" — left to caller.
  const finishRaw = get("finish");
  const finish = /foil|holo/i.test(finishRaw) ? finishRaw : finishRaw || null;

  return {
    title: get("title") || get("description") || "",
    productName: get("title") || "",
    description: get("description") || "",
    collectorNumber: get("collectorNumber") || "",
    setName: get("setName") || "",
    game: get("game") || "",
    rarity: get("rarity") || "",
    finish,
    language: get("language") || "",
    condition: get("condition") || "",
    quantity: int(get("quantity")) ?? 1,
    price: num(get("price")),
    sku: get("sku") || "",
    graded: /^(yes|true|1)$/i.test(get("graded")),
    grade: get("grade") || "",
    gradingCompany: get("gradingCompany") || "",
    externalId: get("externalId") || "",
    action: get("action") || "",
    notes: "",
    extra,
  };
}

/**
 * Generic import: alias-maps any CSV into normalized items.
 * @param {string} csvText
 * @param {'ebay'|'double_holo'|'misprint'|'seller_fb'} source
 */
export function importCsv(source, csvText) {
  const valid = ["ebay", "double_holo", "misprint", "seller_fb"];
  if (!valid.includes(source)) {
    const err = new Error(`Unknown CSV source: ${source}`);
    err.code = "VALIDATION";
    throw err;
  }
  let rows = parseCsvRows(csvText);
  // eBay File Exchange starts with Info + Version lines before the header row.
  rows = rows.filter((r) => {
    const first = (r[0] || "").trim().toLowerCase();
    return first !== "info" && !/^version\s*=/i.test(r[0] || "");
  });
  if (!rows.length) return { source, items: [], errors: ["empty CSV"] };
  const headers = rows[0];
  const items = [];
  const errors = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    if (!cells.some((c) => String(c || "").trim() !== "")) continue;
    try {
      const item = mapRow(headers, cells);
      item.source = source;
      // Double Holo finish-in-brackets: "Charizard [Holo]" -> finish Holo.
      if (source === "double_holo" && !item.finish) {
        const m = /\[([^\]]+)\]\s*$/.exec(item.productName || item.title);
        if (m) {
          item.finish = m[1];
          item.productName = item.productName.replace(/\s*\[[^\]]+\]\s*$/, "");
          item.title = item.title.replace(/\s*\[[^\]]+\]\s*$/, "");
        }
      }
      if (!item.title && !item.sku && !item.externalId) {
        errors.push(`row ${i + 1}: no title/sku/id — skipped`);
        continue;
      }
      items.push(item);
    } catch (e) {
      errors.push(`row ${i + 1}: ${e.message}`);
    }
  }
  return { source, items, errors };
}
