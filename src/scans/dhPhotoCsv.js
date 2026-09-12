/**
 * Double Holo Vendor Hub — Import photos CSV.
 * Headers must match the DH UI exactly (asterisks included).
 */

export const DH_PHOTO_HEADERS = [
  "*C:Card Name",
  "*C:Set",
  "*C:Card Number",
  "PicURL",
];

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * @param {{ cardName: string, setName: string, cardNumber: string, picUrl: string }[]} rows
 */
export function buildDhPhotoCsv(rows) {
  const lines = [DH_PHOTO_HEADERS.join(",")];
  for (const row of rows) {
    lines.push(
      [
        csvEscape(row.cardName),
        csvEscape(row.setName),
        csvEscape(row.cardNumber),
        csvEscape(row.picUrl),
      ].join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

/** PicURL cell: front|back (front first). DH only uses the first two. */
export function buildPicUrlCell(frontUrl, backUrl) {
  return [frontUrl, backUrl]
    .map((u) => String(u || "").trim())
    .filter(Boolean)
    .join("|");
}
