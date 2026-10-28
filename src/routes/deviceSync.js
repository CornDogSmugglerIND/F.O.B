/** Device sync store — phone <-> desktop for the /next app.
 * One private Blob doc: coalition/device-sync.json
 *   { items: [], spaces: [], removedItems: [{id, at}], removedSpaces: [{id, at}], updatedAt }
 * Merge rule (Claude [36]): by id, newest record wins. Each record carries a
 * stamp (updatedAt, else createdAt); an incoming record replaces the stored
 * one only when its stamp is newer, so a stale full-array push from one
 * device can never overwrite a fresher edit from the other. A record only
 * disappears through a tombstone, and a tombstone loses to any touch
 * stamped after it.
 * localStorage stays each device's working cache; this doc is the meeting point. */
import { Router } from "express";

const PATH = "coalition/device-sync.json";
const TOMB_CAP = 500;

function token() {
  const k = Object.keys(process.env).find((n) => /READ_WRITE_TOKEN$/.test(n) && process.env[n]);
  return k ? process.env[k] : "";
}
const emptyDoc = () => ({ items: [], spaces: [], removedItems: [], removedSpaces: [], updatedAt: null });

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

async function readDoc() {
  const t = token();
  if (!t) return null;
  try {
    const { get } = await import("../kv.js");
    const r = await get(PATH, { access: "private", useCache: false, token: t });
    if (!r || r.statusCode !== 200) return emptyDoc();
    return { ...emptyDoc(), ...JSON.parse(await new Response(r.stream).text()) };
  } catch { return emptyDoc(); }
}
async function writeDoc(doc) {
  const t = token();
  if (!t) { const e = new Error("Durable storage isn't attached."); e.status = 503; throw e; }
  const { put } = await import("../kv.js");
  await put(PATH, JSON.stringify(doc), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", token: t });
}

export function deviceSyncRouter() {
  const r = Router();
  r.get("/", async (_req, res) => {
    const doc = await readDoc();
    if (!doc) return res.status(503).json({ ok: false, error: "Durable storage isn't attached." });
    res.json({ ok: true, doc });
  });
  r.put("/", async (req, res) => {
    const body = req.body || {};
    if (!Array.isArray(body.items) || !Array.isArray(body.spaces)) return res.status(400).json({ ok: false, error: "items and spaces arrays are required." });
    const stored = await readDoc();
    if (!stored) return res.status(503).json({ ok: false, error: "Durable storage isn't attached." });
    const merged = mergeDocs(stored, body);
    await writeDoc(merged);
    res.json({ ok: true, doc: merged });
  });
  return r;
}
