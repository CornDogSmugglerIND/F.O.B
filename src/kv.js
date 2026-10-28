/** Storage shim with the same calls the app used from @vercel/blob (get / put / list / del).
 * When CF_STORE_URL + CF_STORE_KEY are set, everything goes to the Cloudflare D1 worker (cloudflare/fob-store);
 * otherwise it falls through to Vercel Blob. Callers keep their own code. */
const CF = () => (process.env.CF_STORE_URL && process.env.CF_STORE_KEY) ? { url: process.env.CF_STORE_URL.replace(/\/$/, ""), key: process.env.CF_STORE_KEY } : null;
const hdr = (c, extra = {}) => ({ "x-store-key": c.key, ...extra });
const blob = () => import("@vercel/blob");

export async function get(path, opts = {}) {
  const c = CF(); if (!c) return (await blob()).get(path, opts);
  const r = await fetch(`${c.url}/f?path=${encodeURIComponent(path)}`, { headers: hdr(c) });
  if (r.status === 404) return { statusCode: 404, stream: null, blob: null };
  if (!r.ok) throw new Error(`store get ${r.status}`);
  return { statusCode: 200, stream: r.body, blob: { contentType: r.headers.get("content-type"), pathname: path } };
}
export async function put(path, body, opts = {}) {
  const c = CF(); if (!c) return (await blob()).put(path, body, opts);
  const r = await fetch(`${c.url}/f?path=${encodeURIComponent(path)}`, { method: "PUT", headers: hdr(c, { "content-type": opts.contentType || "application/octet-stream" }), body: typeof body === "string" ? body : new Uint8Array(body) });
  const d = await r.json().catch(() => ({})); if (!r.ok || !d.ok) throw new Error(`store put: ${d.error || r.status}`);
  return { pathname: path, url: path };
}
export async function list(opts = {}) {
  const c = CF(); if (!c) return (await blob()).list(opts);
  const r = await fetch(`${c.url}/list?prefix=${encodeURIComponent(opts.prefix || "")}&limit=${opts.limit || 1000}`, { headers: hdr(c) });
  const d = await r.json().catch(() => ({})); if (!r.ok || !d.ok) throw new Error(`store list: ${d.error || r.status}`);
  return { blobs: d.blobs, hasMore: false };
}
export async function del(urls, opts = {}) {
  const c = CF(); if (!c) return (await blob()).del(urls, opts);
  const paths = (Array.isArray(urls) ? urls : [urls]).map(String);
  const r = await fetch(`${c.url}/del`, { method: "POST", headers: hdr(c, { "content-type": "application/json" }), body: JSON.stringify({ paths }) });
  if (!r.ok) throw new Error(`store del ${r.status}`);
}
