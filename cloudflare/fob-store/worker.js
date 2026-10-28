/* F.O.B storage on Cloudflare D1 — replaces Vercel Blob (free tier capped at 2,000 writes/month).
   The Vercel server (src/store.js) is the only caller; every request carries x-store-key. */
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
export default {
  async fetch(req, env) {
    if (!env.STORE_KEY || req.headers.get("x-store-key") !== env.STORE_KEY) return json({ ok: false, error: "unauthorized" }, 401);
    const u = new URL(req.url), path = u.searchParams.get("path") || "";
    try {
      if (u.pathname === "/f" && req.method === "PUT") {
        if (!path) return json({ ok: false, error: "path required" }, 400);
        const data = new Uint8Array(await req.arrayBuffer()), at = new Date().toISOString();
        await env.DB.prepare("INSERT INTO files (path,type,size,data,uploaded_at) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(path) DO UPDATE SET type=?2,size=?3,data=?4,uploaded_at=?5")
          .bind(path, req.headers.get("content-type") || "application/octet-stream", data.byteLength, data, at).run();
        return json({ ok: true, pathname: path, size: data.byteLength, uploadedAt: at });
      }
      if (u.pathname === "/f" && req.method === "GET") {
        const r = await env.DB.prepare("SELECT type,data FROM files WHERE path=?1").bind(path).first();
        if (!r) return json({ ok: false, error: "not found" }, 404);
        return new Response(new Uint8Array(r.data), { headers: { "content-type": r.type || "application/octet-stream" } });
      }
      if (u.pathname === "/list") {
        const prefix = u.searchParams.get("prefix") || "", lim = Math.min(1000, Number(u.searchParams.get("limit")) || 1000);
        const { results } = await env.DB.prepare("SELECT path,size,uploaded_at FROM files WHERE path >= ?1 AND path < ?2 ORDER BY path LIMIT ?3")
          .bind(prefix, prefix + "￿", lim).all();
        return json({ ok: true, blobs: results.map((r) => ({ pathname: r.path, url: r.path, size: r.size, uploadedAt: r.uploaded_at })), hasMore: false });
      }
      if (u.pathname === "/del" && req.method === "POST") {
        const { paths = [] } = await req.json();
        for (const p of paths.slice(0, 1000)) await env.DB.prepare("DELETE FROM files WHERE path=?1").bind(String(p)).run();
        return json({ ok: true, removed: paths.length });
      }
      return json({ ok: false, error: "not found" }, 404);
    } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 500); }
  },
};
