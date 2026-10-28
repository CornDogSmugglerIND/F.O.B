/* F.O.B storage + scanner link on Cloudflare (Worker + D1).
   Two kinds of caller:
   - the F.O.B server (src/kv.js, src/routes/scanner.js): x-store-key header, full access
   - the F.O.B Scan desktop helper: a device token from pairing, scanner endpoints only */
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
const now = () => new Date().toISOString();
const safe = (s, n = 80) => String(s || "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, n);
const rand = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const ONLINE_MS = 45000;

async function putFile(env, path, type, data) {
  const at = now();
  await env.DB.prepare("INSERT INTO files (path,type,size,data,uploaded_at) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(path) DO UPDATE SET type=?2,size=?3,data=?4,uploaded_at=?5")
    .bind(path, type || "application/octet-stream", data.byteLength, data, at).run();
  return at;
}
const devOut = (d) => ({ id: d.token.slice(0, 8), name: d.name, pairedAt: d.paired_at, lastSeen: d.last_seen,
  online: !!d.last_seen && Date.now() - Date.parse(d.last_seen) < ONLINE_MS, scanners: JSON.parse(d.scanners || "[]"), state: JSON.parse(d.state || "{}") });

async function helper(req, env, u) {
  /* pairing: helper sends the 6-digit code shown in F.O.B, gets a long-lived device token */
  if (u.pathname === "/scan/claim" && req.method === "POST") {
    const { code, name } = await req.json().catch(() => ({}));
    const p = await env.DB.prepare("SELECT * FROM scan_pair WHERE code=?1").bind(String(code || "").replace(/\D/g, "")).first();
    if (!p || Date.parse(p.expires) < Date.now()) return json({ ok: false, error: "That code is wrong or expired. Get a new one in F.O.B." }, 400);
    const token = rand(24);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO scan_devices (token,account,name,paired_at,last_seen,scanners,state) VALUES (?1,?2,?3,?4,?4,'[]','{}')").bind(token, p.account, safe(name, 60) || "Scanner computer", now()),
      env.DB.prepare("DELETE FROM scan_pair WHERE code=?1").bind(p.code),
    ]);
    return json({ ok: true, token, account: p.account });
  }
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const dev = tok && await env.DB.prepare("SELECT * FROM scan_devices WHERE token=?1").bind(tok).first();
  if (!dev) return json({ ok: false, error: "Not paired. Pair again from F.O.B." }, 401);

  /* heartbeat + poll in one call: helper reports its scanners/state, gets the next command if any */
  if (u.pathname === "/scan/beat" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const scanners = JSON.stringify(b.scanners || []), state = JSON.stringify(b.state || {});
    const stale = !dev.last_seen || Date.now() - Date.parse(dev.last_seen) > 20000;
    if (stale || scanners !== dev.scanners || state !== dev.state)
      await env.DB.prepare("UPDATE scan_devices SET last_seen=?2, scanners=?3, state=?4 WHERE token=?1").bind(tok, now(), scanners, state).run();
    const c = await env.DB.prepare("SELECT id,cmd FROM scan_cmds WHERE token=?1 AND taken IS NULL ORDER BY id LIMIT 1").bind(tok).first();
    if (c) await env.DB.prepare("UPDATE scan_cmds SET taken=?2 WHERE id=?1").bind(c.id, now()).run();
    return json({ ok: true, cmd: c ? { id: c.id, ...JSON.parse(c.cmd) } : null });
  }
  /* one scanned page straight into this account's intake queue */
  if (u.pathname === "/scan/upload" && req.method === "PUT") {
    const batch = safe(u.searchParams.get("batch")), seq = Math.max(0, parseInt(u.searchParams.get("seq"), 10) || 0), file = safe(u.searchParams.get("file") || `scan_${seq}.jpg`, 120);
    if (!batch) return json({ ok: false, error: "batch required" }, 400);
    const data = new Uint8Array(await req.arrayBuffer()); if (!data.byteLength) return json({ ok: false, error: "empty" }, 400);
    const root = dev.account === "default" ? "coalition/intake/" : `accounts/${dev.account}/intake/`;
    const path = `${root}${batch}/${String(seq).padStart(5, "0")}__${file}`;
    const at = await putFile(env, path, req.headers.get("content-type") || "image/jpeg", data);
    return json({ ok: true, path, uploadedAt: at });
  }
  if (u.pathname === "/scan/unpair" && req.method === "POST") { await env.DB.prepare("DELETE FROM scan_devices WHERE token=?1").bind(tok).run(); return json({ ok: true }); }
  return json({ ok: false, error: "not found" }, 404);
}

async function admin(req, env, u) {
  const path = u.searchParams.get("path") || "", account = safe(u.searchParams.get("account")) || "default";
  if (u.pathname === "/f" && req.method === "PUT") {
    if (!path) return json({ ok: false, error: "path required" }, 400);
    const data = new Uint8Array(await req.arrayBuffer());
    const at = await putFile(env, path, req.headers.get("content-type"), data);
    return json({ ok: true, pathname: path, size: data.byteLength, uploadedAt: at });
  }
  if (u.pathname === "/f" && req.method === "GET") {
    const r = await env.DB.prepare("SELECT type,data FROM files WHERE path=?1").bind(path).first();
    if (!r) return json({ ok: false, error: "not found" }, 404);
    return new Response(new Uint8Array(r.data), { headers: { "content-type": r.type || "application/octet-stream" } });
  }
  if (u.pathname === "/list") {
    const prefix = u.searchParams.get("prefix") || "", lim = Math.min(1000, Number(u.searchParams.get("limit")) || 1000);
    const { results } = await env.DB.prepare("SELECT path,size,uploaded_at FROM files WHERE path >= ?1 AND path < ?2 ORDER BY path LIMIT ?3").bind(prefix, prefix + "￿", lim).all();
    return json({ ok: true, blobs: results.map((r) => ({ pathname: r.path, url: r.path, size: r.size, uploadedAt: r.uploaded_at })), hasMore: false });
  }
  if (u.pathname === "/del" && req.method === "POST") {
    const { paths = [] } = await req.json();
    for (const p of paths.slice(0, 1000)) await env.DB.prepare("DELETE FROM files WHERE path=?1").bind(String(p)).run();
    return json({ ok: true, removed: paths.length });
  }
  /* scanner admin: F.O.B asks for a pairing code, sees paired computers, sends Scan commands */
  if (u.pathname === "/scan/pair-start" && req.method === "POST") {
    await env.DB.prepare("DELETE FROM scan_pair WHERE expires < ?1").bind(now()).run();
    let code; for (let i = 0; i < 5; i++) { code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)); if (!await env.DB.prepare("SELECT 1 FROM scan_pair WHERE code=?1").bind(code).first()) break; }
    const expires = new Date(Date.now() + 10 * 60000).toISOString();
    await env.DB.prepare("INSERT INTO scan_pair (code,account,expires) VALUES (?1,?2,?3)").bind(code, account, expires).run();
    return json({ ok: true, code, expires });
  }
  if (u.pathname === "/scan/devices") {
    const { results } = await env.DB.prepare("SELECT * FROM scan_devices WHERE account=?1 ORDER BY paired_at DESC").bind(account).all();
    return json({ ok: true, devices: results.map(devOut) });
  }
  if (u.pathname === "/scan/cmd" && req.method === "POST") {
    const { device, cmd } = await req.json().catch(() => ({}));
    const d = await env.DB.prepare("SELECT token FROM scan_devices WHERE account=?1 AND substr(token,1,8)=?2").bind(account, String(device || "")).first();
    if (!d) return json({ ok: false, error: "That scanner computer isn't paired." }, 404);
    await env.DB.prepare("UPDATE scan_cmds SET taken=?2 WHERE token=?1 AND taken IS NULL").bind(d.token, now()).run(); // newest command wins
    const r = await env.DB.prepare("INSERT INTO scan_cmds (token,cmd,created) VALUES (?1,?2,?3)").bind(d.token, JSON.stringify(cmd || {}), now()).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }
  if (u.pathname === "/scan/forget" && req.method === "POST") {
    const { device } = await req.json().catch(() => ({}));
    await env.DB.prepare("DELETE FROM scan_devices WHERE account=?1 AND substr(token,1,8)=?2").bind(account, String(device || "")).run();
    return json({ ok: true });
  }
  return json({ ok: false, error: "not found" }, 404);
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    try {
      if (env.STORE_KEY && req.headers.get("x-store-key") === env.STORE_KEY) return await admin(req, env, u);
      if (u.pathname.startsWith("/scan/")) return await helper(req, env, u);
      return json({ ok: false, error: "unauthorized" }, 401);
    } catch (e) { return json({ ok: false, error: String((e && e.message) || e) }, 500); }
  },
};
