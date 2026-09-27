/** Keep in sync with src/visor/phases.js */
export const PHASES = Object.freeze([
  { id: "intake", label: "Intake", short: "IN", order: 0 },
  { id: "staged", label: "Staged", short: "ST", order: 1 },
  { id: "listed", label: "Listed", short: "LI", order: 2 },
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
  if (item?.phase && isPhase(item.phase)) return item.phase;
  if (item?.staged) return "staged";
  return "intake";
}
