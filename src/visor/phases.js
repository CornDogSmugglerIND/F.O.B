/**
 * Lifecycle phases — single source of truth (Base44 catalog.js pattern).
 * Spine: 7 fixed nodes, left → right. Never reflows.
 */
/** @typedef {'intake'|'staged'|'listed'|'sold'|'packed'|'shipped'|'delivered'} PhaseId */

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

/** @param {string | null | undefined} id */
export function isPhase(id) {
  return Boolean(id && PHASE_BY_ID[id]);
}

/** @param {string | null | undefined} id @returns {PhaseId} */
export function normalizePhase(id) {
  return isPhase(id) ? /** @type {PhaseId} */ (id) : "intake";
}

/** @param {{ phase?: string | null, staged?: boolean }} item @returns {PhaseId} */
export function phaseFromItem(item) {
  if (item?.phase && isPhase(item.phase)) return /** @type {PhaseId} */ (item.phase);
  if (item?.staged) return "staged";
  return "intake";
}
