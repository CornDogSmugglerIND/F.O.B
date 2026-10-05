/**
 * eBay OAuth connect flow (3-legged).
 *
 * The app previously only supported a pre-provisioned EBAY_REFRESH_TOKEN env
 * var, so "Check connection" could never turn into a real connect flow.
 * These helpers power:
 *   GET /api/channels/ebay/connect   -> 302 to eBay consent
 *   GET /api/channels/ebay/callback  -> code exchange, token persisted server-side
 *   GET /api/channels/ebay/status    -> { connected, missing[], lastError }
 *
 * Redirect-URI quirk (locked from production experience): when the RuName is
 * not a resolvable URL, eBay records the grant against its fallback redirect
 * (https://www.ebay.com/) instead of the RuName. The token exchange therefore
 * tries the configured redirect URI first, then ebay.com/ and ebay.com.
 * A dead/expired code (invalid_grant) stops the chain immediately.
 */

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getDataRoot } from "../store.js";

const EBAY_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/sell.account",
];

function env(key, fallback = "") {
  const v = process.env[key];
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function tokenBase() {
  const mode = (process.env.EBAY_ENV || "production").toLowerCase();
  return mode === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
}

export function ebayAuthBase() {
  const mode = env("EBAY_ENV", "production").toLowerCase();
  return mode === "sandbox"
    ? "https://auth.sandbox.ebay.com/oauth2/authorize"
    : "https://auth.ebay.com/oauth2/authorize";
}

/** Redirect URI for the authorize step: explicit URI wins, RuName otherwise. */
export function ebayRedirectUri() {
  return env("EBAY_REDIRECT_URI") || env("EBAY_RU_NAME");
}

/** Redirect-URI candidates for the token exchange (RuName quirk). */
export function ebayRedirectUriCandidates() {
  const configured = ebayRedirectUri();
  const cands = [];
  if (configured) cands.push(configured);
  for (const fb of ["https://www.ebay.com/", "https://www.ebay.com"]) {
    if (!cands.includes(fb)) cands.push(fb);
  }
  return cands;
}

export function ebayConnectEnv() {
  return {
    clientId: env("EBAY_CLIENT_ID"),
    clientSecret: env("EBAY_CLIENT_SECRET"),
    redirectUri: ebayRedirectUri(),
  };
}

/** @param {{ state: string }} opts */
export function buildEbayAuthorizeUrl({ state }) {
  const { clientId, redirectUri } = ebayConnectEnv();
  if (!clientId) {
    const err = new Error("eBay connect needs EBAY_CLIENT_ID");
    err.code = "CHANNEL_NOT_CONFIGURED";
    throw err;
  }
  if (!redirectUri) {
    const err = new Error("eBay connect needs EBAY_REDIRECT_URI (or EBAY_RU_NAME)");
    err.code = "CHANNEL_NOT_CONFIGURED";
    throw err;
  }
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: EBAY_SCOPES.join(" "),
    state,
  });
  return `${ebayAuthBase()}?${q.toString()}`;
}

function tokenFile() {
  if (env("EBAY_TOKEN_FILE")) return env("EBAY_TOKEN_FILE");
  return join(getDataRoot(), "ebay-tokens.json");
}

/** Stored tokens, or null. Never throws. */
export async function loadEbayTokenStore() {
  try {
    const raw = await readFile(tokenFile(), "utf8");
    const t = JSON.parse(raw);
    if (t && typeof t.refresh_token === "string" && t.refresh_token) return t;
    return null;
  } catch {
    return null;
  }
}

/** Persist tokens server-side (0600). Merges with any existing store. */
export async function saveEbayTokenStore(tokens) {
  const prev = (await loadEbayTokenStore()) || {};
  const next = {
    ...prev,
    ...tokens,
    obtained_at: new Date().toISOString(),
  };
  const file = tokenFile();
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, JSON.stringify(next, null, 2), { mode: 0o600, encoding: "utf8" });
  try {
    await chmod(file, 0o600);
  } catch {
    /* non-posix FS — best effort */
  }
  return next;
}

/** Refresh token: server-side store first, env fallback. */
export async function getEbayRefreshToken() {
  const stored = await loadEbayTokenStore();
  if (stored?.refresh_token) return stored.refresh_token;
  return env("EBAY_REFRESH_TOKEN");
}

/** Last auth failure message for /status. Never a secret. */
let lastAuthError = null;
export function getLastEbayAuthError() {
  return lastAuthError;
}
export function setLastEbayAuthError(msg) {
  lastAuthError = msg || null;
}

/**
 * Exchange an authorization code for tokens. Tries redirect-URI candidates
 * in order; a dead code (invalid_grant) aborts the chain.
 * @param {string} code
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function exchangeEbayAuthCode(code, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const { clientId, clientSecret } = ebayConnectEnv();
  if (!clientId || !clientSecret) {
    const err = new Error("eBay connect needs EBAY_CLIENT_ID and EBAY_CLIENT_SECRET");
    err.code = "CHANNEL_NOT_CONFIGURED";
    throw err;
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  let lastErr = null;
  for (const redirectUri of ebayRedirectUriCandidates()) {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    const res = await fetchImpl(`${tokenBase()}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.access_token) {
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token || null,
        expires_in: Number(data.expires_in) || 7200,
        refresh_token_expires_in: Number(data.refresh_token_expires_in) || null,
        redirect_uri_used: redirectUri,
      };
    }
    lastErr = new Error(
      `eBay code exchange failed (${res.status}): ${data.error_description || data.error || res.statusText}`,
    );
    lastErr.code = "EBAY_AUTH_FAILED";
    lastErr.status = res.status;
    // Dead code — no other redirect URI will save it.
    if (data.error === "invalid_grant") break;
  }
  throw lastErr;
}

/**
 * Refresh-token grant used by the inventory client. Persists rotated
 * refresh tokens so the connect flow survives token rotation.
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function refreshEbayAccessToken(opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const { clientId, clientSecret } = ebayConnectEnv();
  const refreshToken = await getEbayRefreshToken();
  if (!clientId || !clientSecret || !refreshToken) {
    const err = new Error(
      "eBay not configured — connect at /api/channels/ebay/connect or set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_REFRESH_TOKEN",
    );
    err.code = "CHANNEL_NOT_CONFIGURED";
    throw err;
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: EBAY_SCOPES.join(" "),
  });
  const res = await fetchImpl(`${tokenBase()}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const msg = `eBay token refresh failed (${res.status}): ${data.error_description || data.error || res.statusText}`;
    setLastEbayAuthError(msg);
    const err = new Error(msg);
    err.code = "EBAY_AUTH_FAILED";
    err.status = res.status;
    err.details = data;
    throw err;
  }
  setLastEbayAuthError(null);
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    await saveEbayTokenStore({
      refresh_token: data.refresh_token,
      refresh_token_expires_in: Number(data.refresh_token_expires_in) || null,
    });
  }
  return {
    accessToken: data.access_token,
    expiresIn: Number(data.expires_in) || 7200,
  };
}

export { EBAY_SCOPES };
