/* Merge rule for device sync — MUST match src/routes/deviceSync.js mergeDocs.
   By id, newest record wins: a record's stamp is updatedAt, else createdAt.
   An incoming record replaces the stored one only when newer; a record
   disappears only via a tombstone stamped after its last touch. */
const TOMB_CAP = 500;
export function mergeDocs(base, incoming) {
  const doc = {
    items: Array.isArray(base?.items) ? base.items : [],
    spaces: Array.isArray(base?.spaces) ? base.spaces : [],
    removedItems: Array.isArray(base?.removedItems) ? base.removedItems : [],
    removedSpaces: Array.isArray(base?.removedSpaces) ? base.removedSpaces : [],
    updatedAt: base?.updatedAt || null,
  };
  const stampOf = (r) => String(r?.updatedAt || r?.createdAt || "");
  const mergeList = (listKey, tombKey, incList, incTombs) => {
    const tombs = new Map(doc[tombKey].map((t) => [String(t.id), t.at || ""]));
    for (const t of Array.isArray(incTombs) ? incTombs : []) if (t && t.id != null) tombs.set(String(t.id), t.at || "");
    const byId = new Map(doc[listKey].map((r) => [String(r.id), r]));
    for (const r of Array.isArray(incList) ? incList : []) {
      if (!r || r.id == null) continue;
      const id = String(r.id), tAt = tombs.get(id), stamp = stampOf(r);
      if (tAt && stamp <= tAt) { byId.delete(id); continue; } // deleted after this record's last touch: gone
      if (tAt && stamp > tAt) tombs.delete(id); // touched after the delete: alive again
      const cur = byId.get(id);
      if (!cur || stamp > stampOf(cur)) byId.set(id, r); // newer record wins; a tie keeps the stored one
    }
    for (const [id, at] of tombs) {
      const cur = byId.get(id);
      if (cur && stampOf(cur) <= at) byId.delete(id);
    }
    doc[listKey] = [...byId.values()];
    doc[tombKey] = [...tombs.entries()].map(([id, at]) => ({ id, at })).slice(-TOMB_CAP);
  };
  mergeList("items", "removedItems", incoming?.items, incoming?.removedItems);
  mergeList("spaces", "removedSpaces", incoming?.spaces, incoming?.removedSpaces);
  doc.updatedAt = new Date().toISOString();
  return doc;
}
