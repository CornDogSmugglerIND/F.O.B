/* Device sync client — keeps this device's localStorage cache in step with
   the server doc (GET/PUT /api/sync, merge by id, newest stamp wins; see
   src/routes/deviceSync.js).
   - On boot: pull the server doc, merge it into the local cache, push the
     merged result back so both sides converge, re-render if anything moved.
   - On any local save to the items/spaces keys: debounced push.
   - Edits are detected by diffing against the last-synced shadow and get an
     updatedAt stamp at push time, so the other device's stale copy can never
     overwrite them. Removals travel as tombstones the same way. */
import { mergeDocs } from "./syncMerge.js?v=1";

const LS_ITEMS = "coalition-items-v4";
const LS_SPACES = "coalition-spaces-v4";
const SHADOW = "coalition-sync-shadow-v2"; // v1 kept a full JSON copy of every record: too big for localStorage, so it silently never saved
const hash = (r) => { const t = JSON.stringify({ ...r, updatedAt: undefined }); let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + "." + t.length; };

let rawSet = null; // localStorage.setItem before our hook: internal writes use it so they don't retrigger pushes
const read = (k, dflt) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v ?? dflt; } catch { return dflt; } };
const writeRaw = (k, v) => { try { (rawSet || localStorage.setItem.bind(localStorage))(k, JSON.stringify(v)); return true; } catch { return false; } };
const local = () => ({ items: read(LS_ITEMS, []), spaces: read(LS_SPACES, []) });
const idSet = (list) => new Set((list || []).map((r) => String(r.id)));

function applyDoc(doc) {
  const before = JSON.stringify(local());
  writeRaw(LS_ITEMS, doc.items || []);
  writeRaw(LS_SPACES, doc.spaces || []);
  const shadow = { items: {}, spaces: {}, tombItems: doc.removedItems || [], tombSpaces: doc.removedSpaces || [] };
  for (const r of doc.items || []) shadow.items[String(r.id)] = hash(r);
  for (const r of doc.spaces || []) shadow.spaces[String(r.id)] = hash(r);
  writeRaw(SHADOW, shadow);
  return JSON.stringify(local()) !== before;
}
function diffed(curList, shadowMap, at) {
  // stamp records whose content changed since the last sync; return list + whether stamps were written
  let stamped = false;
  const list = (curList || []).map((r) => {
    const prev = shadowMap ? shadowMap[String(r.id)] : undefined;
    if (prev !== undefined && prev === hash(r)) return r;
    stamped = true;
    return { ...r, updatedAt: at };
  });
  return { list, stamped };
}
function outgoing() {
  const cur = local(), sh = read(SHADOW, { items: {}, spaces: {}, tombItems: [], tombSpaces: [] });
  const at = new Date().toISOString();
  const items = diffed(cur.items, sh.items, at);
  const spaces = diffed(cur.spaces, sh.spaces, at);
  if (items.stamped) writeRaw(LS_ITEMS, items.list);
  if (spaces.stamped) writeRaw(LS_SPACES, spaces.list);
  const fresh = (list, shadowMap, prevTombs) => {
    const now = idSet(list);
    const tombs = new Map((prevTombs || []).map((t) => [String(t.id), t.at || ""]));
    for (const id of Object.keys(shadowMap || {})) if (!now.has(id)) tombs.set(id, at);
    return [...tombs.entries()].map(([id, t]) => ({ id, at: t }));
  };
  return { items: items.list, spaces: spaces.list, removedItems: fresh(items.list, sh.items, sh.tombItems), removedSpaces: fresh(spaces.list, sh.spaces, sh.tombSpaces), updatedAt: at };
}

let timer = null, pushing = false, again = false, onMerged = null;
async function push() {
  if (pushing) { again = true; return; }
  pushing = true;
  try {
    const r = await fetch("/api/sync", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(outgoing()) });
    if (r.ok) { const d = await r.json(); if (d.doc) { const changed = applyDoc(d.doc); if (changed && onMerged) onMerged(); } }
  } catch { /* offline or no backend: local cache keeps working */ }
  pushing = false;
  if (again) { again = false; schedule(); }
}
function schedule() { clearTimeout(timer); timer = setTimeout(push, 700); }

export function initSync(cb) {
  onMerged = cb || null;
  try { localStorage.removeItem("coalition-sync-shadow-v1"); } catch { /* ignore */ }
  rawSet = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (k, v) => { const r = rawSet(k, v); if (k === LS_ITEMS || k === LS_SPACES) schedule(); return r; };
  (async () => {
    try {
      const r = await fetch("/api/sync");
      if (r.ok) {
        const d = await r.json();
        if (d.doc && ((d.doc.items || []).length || (d.doc.spaces || []).length || (d.doc.removedItems || []).length)) {
          const sh = read(SHADOW, { items: {}, spaces: {}, tombItems: [], tombSpaces: [] }), cur = local(), at = new Date().toISOString();
          // deletes made on this device that haven't been pushed yet must survive the pull, or the server copy brings them back
          const pend = (map, list) => { const have = idSet(list); return Object.keys(map || {}).filter((id) => !have.has(id)).map((id) => ({ id, at })); };
          const merged = mergeDocs({ ...cur, removedItems: [...(sh.tombItems || []), ...pend(sh.items, cur.items)], removedSpaces: [...(sh.tombSpaces || []), ...pend(sh.spaces, cur.spaces)] }, d.doc);
          const changed = applyDoc(merged);
          if (changed && onMerged) onMerged();
        }
      }
    } catch { /* local-only mode */ }
    schedule();
  })();
  addEventListener("online", schedule);
  /* pull what the other device did: when this tab comes back into view, and every 30s while it is open */
  addEventListener("focus", schedule);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(); });
  setInterval(() => { if (!document.hidden) schedule(); }, 30000);
}
