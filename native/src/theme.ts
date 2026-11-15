/* Coalition palette, carried over from the web app so the native build reads
   as the same product rather than a different one. */
export const C = {
  bg: "#070D0A",
  bgLift: "#0D1813",
  ink: "#E8FFF4",
  dim: "rgba(232,255,244,0.55)",
  faint: "rgba(232,255,244,0.3)",
  green: "#90FFCC",
  greenDeep: "#50B97E",
  mint: "#B3FBD5",
  amber: "#E8924A",
  road: "#B3FBD5",
  roadCase: "#04100B",
};

export type Stage = {
  id: string;
  label: string;
  note: string;
  color: string;
  count: number;
  value: number;
};

/* The eight stops, same order and colors as the Command roadmap on the web. */
export const STAGES: Stage[] = [
  { id: "intake",    label: "Intake",        note: "not identified yet",   color: C.green, count: 0,  value: 0 },
  { id: "staged",    label: "Ready to list", note: "listing not built",    color: C.green, count: 20, value: 142.1 },
  { id: "stored",    label: "Put away",      note: "listed, needs its bin", color: C.green, count: 0, value: 0 },
  { id: "sold",      label: "Pull",          note: "sold, go get it",      color: C.amber, count: 0,  value: 0 },
  { id: "packed",    label: "Packed",        note: "boxed, needs a label", color: C.amber, count: 0,  value: 0 },
  { id: "shipped",   label: "Shipped",       note: "label made",           color: C.amber, count: 1,  value: 56.1 },
  { id: "arriving",  label: "On its way",    note: "in transit",           color: C.amber, count: 0,  value: 0 },
  { id: "delivered", label: "Delivered",     note: "done",                 color: C.amber, count: 0,  value: 0 },
];
