/* Password gate (Nov 12). Sawyer asked for a login after /api/sync was found
   readable by anyone. Off until FOB_PASSCODE is set, so a missing env var can
   never lock him out of his own app. */
import crypto from "node:crypto";

const DAYS = 30, COOKIE = "fob_s";
const secret = () => process.env.FOB_SECRET || process.env.FOB_PASSCODE || "";
const pass = () => process.env.FOB_PASSCODE || "";
const user = () => process.env.FOB_USER || "";

/* paths that must answer before anyone has signed in */
const OPEN = [
  /^\/api\/health$/,
  /^\/api\/auth$/,
  /^\/lock\.html$/,
  /^\/lock-glyph\.png$/,
  /^\/store\//,          // Shopify storefront assets: the shop's own css/js, loaded by customers
  /^\/theme\.css$/,
  /^\/apple-touch-icon/,
  /^\/manifest\.json$/,
  /^\/favicon\./,
];

function sign(exp) {
  return crypto.createHmac("sha256", secret()).update(`v1.${exp}`).digest("hex").slice(0, 32) + "." + exp;
}
function valid(tok) {
  if (!tok || !tok.includes(".")) return false;
  const [, exp] = tok.split(".");
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const want = sign(Number(exp));
  return want.length === tok.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(tok));
}
function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const cookies = (h = "") => Object.fromEntries(h.split(";").map((c) => {
  const i = c.indexOf("="); return i < 0 ? [c.trim(), ""] : [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
}));

export function signedIn(req) {
  if (!pass()) return true;
  if (valid(cookies(req.headers.cookie).fob_s)) return true;
  const k = req.headers["x-fob-key"];
  return !!(k && process.env.FOB_SCANNER_KEY && same(k, process.env.FOB_SCANNER_KEY));
}

export function gate(lockPage) {
  return (req, res, next) => {
    if (!pass()) return next();
    const p = req.path;
    if (OPEN.some((re) => re.test(p))) return next();
    if (signedIn(req)) return next();
    if (p.startsWith("/api/")) return res.status(401).json({ ok: false, error: "locked" });
    if (req.method !== "GET") return res.status(401).end();
    res.set("Cache-Control", "no-store").status(401).sendFile(lockPage);
  };
}

/* POST /api/auth {code} -> cookie */
export function authRoute(req, res) {
  if (!pass()) return res.json({ ok: true, open: true });
  const code = String((req.body && req.body.code) || "");
  const who = String((req.body && req.body.user) || "").trim();
  const okUser = !user() || same(who.toLowerCase(), user().toLowerCase());
  const okPass = !!code && same(code, pass());
  if (!okUser || !okPass) return res.status(401).json({ ok: false, error: "wrong" });
  const exp = Date.now() + DAYS * 864e5;
  res.set("Set-Cookie", `${COOKIE}=${sign(exp)}; Path=/; Max-Age=${DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`);
  res.json({ ok: true });
}
