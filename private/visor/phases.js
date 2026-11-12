/** Keep in sync with src/visor/phases.js */
export const PHASES = Object.freeze([
  { id: "intake", label: "Photos in", short: "IN", order: 0 },
  { id: "staged", label: "Ready to list", short: "ST", order: 1 },
  { id: "listed", label: "Live", short: "LI", order: 2 },
  { id: "sold", label: "Sold", short: "SO", order: 3 },
  { id: "packed", label: "Packed", short: "PK", order: 4 },
  { id: "shipped", label: "Shipped", short: "SH", order: 5 },
  { id: "delivered", label: "Delivered", short: "DV", order: 6 },
]);

export const PHASE_BY_ID = Object.freeze(Object.fromEntries(PHASES.map((p) => [p.id, p])));

export function isPhase(id) {
  return Boolean(id && PHASE_BY_ID[id]);
}

export function normalizePhase(id) {
  return isPhase(id) ? id : "intake";
}

export function phaseFromItem(item) {
  if (item?.ended && !["sold", "packed", "shipped", "delivered"].includes(item.phase)) return "ended"; // off eBay, not a sale
  if (item?.phase && isPhase(item.phase)) return item.phase;
  if (item?.staged) return "staged";
  return "intake";
}
