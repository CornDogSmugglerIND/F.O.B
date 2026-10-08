import { test, beforeEach, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildEbayAuthorizeUrl,
  exchangeEbayAuthCode,
  saveEbayTokenStore,
  loadEbayTokenStore,
  getEbayRefreshToken,
  refreshEbayAccessToken,
  setLastEbayAuthError,
} from "../src/channels/ebayConnect.js";
import { getEbayChannelStatus } from "../src/channels/config.js";
import { createApp } from "../src/app.js";
import { setDataRoot } from "../src/store.js";

let tempDir;
const OLD_ENV = { ...process.env };

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "ebay-connect-test-"));
  setDataRoot(tempDir);
});

after(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

beforeEach(() => {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("EBAY_")) delete process.env[k];
  }
  process.env.EBAY_CLIENT_ID = "cid";
  process.env.EBAY_CLIENT_SECRET = "csec";
  process.env.EBAY_REDIRECT_URI = "https://f-o-b.vercel.app/api/channels/ebay/callback";
  process.env.EBAY_ENV = "production";
  process.env.EBAY_TOKEN_FILE = join(tempDir, "ebay-tokens.json");
  setLastEbayAuthError(null);
});

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

test("authorize URL carries client, redirect, scopes, state", () => {
  const url = new URL(buildEbayAuthorizeUrl({ state: "s123" }));
  assert.equal(url.hostname, "auth.ebay.com");
  assert.equal(url.searchParams.get("client_id"), "cid");
  assert.equal(url.searchParams.get("redirect_uri"), "https://f-o-b.vercel.app/api/channels/ebay/callback");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "s123");
  assert.match(url.searchParams.get("scope"), /sell\.fulfillment/);
});

test("authorize URL requires client id", () => {
  delete process.env.EBAY_CLIENT_ID;
  assert.throws(() => buildEbayAuthorizeUrl({ state: "x" }), /EBAY_CLIENT_ID/);
});

test("authorize URL requires redirect uri", () => {
  delete process.env.EBAY_REDIRECT_URI;
  assert.throws(() => buildEbayAuthorizeUrl({ state: "x" }), /EBAY_REDIRECT_URI/);
});

test("code exchange succeeds on configured redirect URI", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(String(new URLSearchParams(init.body).get("redirect_uri")));
    return jsonResponse(200, { access_token: "a1", refresh_token: "r1", expires_in: 7200 });
  };
  const t = await exchangeEbayAuthCode("code1", { fetchImpl });
  assert.equal(t.access_token, "a1");
  assert.equal(t.refresh_token, "r1");
  assert.deepEqual(calls, ["https://f-o-b.vercel.app/api/channels/ebay/callback"]);
});

test("code exchange falls back to ebay.com/ on RuName failure", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const uri = String(new URLSearchParams(init.body).get("redirect_uri"));
    calls.push(uri);
    if (uri === "https://f-o-b.vercel.app/api/channels/ebay/callback") {
      return jsonResponse(400, { error: "invalid_request", error_description: "redirect mismatch" });
    }
    return jsonResponse(200, { access_token: "a2", refresh_token: "r2", expires_in: 7200 });
  };
  const t = await exchangeEbayAuthCode("code2", { fetchImpl });
  assert.equal(t.access_token, "a2");
  assert.equal(t.redirect_uri_used, "https://www.ebay.com/");
  assert.ok(calls.length >= 2);
});

test("code exchange stops on invalid_grant (dead code)", async () => {
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    return jsonResponse(400, { error: "invalid_grant", error_description: "code expired" });
  };
  await assert.rejects(() => exchangeEbayAuthCode("dead", { fetchImpl }), /invalid_grant|code expired/);
  assert.equal(n, 1);
});

test("token store round-trips refresh token", async () => {
  assert.equal(await loadEbayTokenStore(), null);
  await saveEbayTokenStore({ refresh_token: "stored-r", refresh_token_expires_in: 123 });
  const t = await loadEbayTokenStore();
  assert.equal(t.refresh_token, "stored-r");
  assert.equal(await getEbayRefreshToken(), "stored-r");
});

test("refresh token falls back to env", async () => {
  const { rm } = await import("node:fs/promises");
  await rm(process.env.EBAY_TOKEN_FILE, { force: true });
  process.env.EBAY_REFRESH_TOKEN = "env-r";
  assert.equal(await getEbayRefreshToken(), "env-r");
});

test("token refresh persists rotated refresh token", async () => {
  await saveEbayTokenStore({ refresh_token: "old-r" });
  const fetchImpl = async () =>
    jsonResponse(200, { access_token: "new-a", refresh_token: "new-r", expires_in: 7200 });
  const { accessToken } = await refreshEbayAccessToken({ fetchImpl });
  assert.equal(accessToken, "new-a");
  assert.equal((await loadEbayTokenStore()).refresh_token, "new-r");
});

test("channel status honors stored token without env", async () => {
  await saveEbayTokenStore({ refresh_token: "stored-r" });
  const s = await getEbayChannelStatus();
  assert.equal(s.configured, true);
  assert.equal(s.tokenStored, true);
  assert.ok(!s.missing.includes("EBAY_REFRESH_TOKEN"));
});

test("channel status reports missing keys", async () => {
  delete process.env.EBAY_CLIENT_ID;
  const s = await getEbayChannelStatus();
  assert.equal(s.configured, false);
  assert.ok(s.missing.includes("EBAY_CLIENT_ID"));
});

async function startServer() {
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("GET /api/channels/ebay/connect?json=1 returns authorize URL + sets state cookie", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/channels/ebay/connect?json=1`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.authorizeUrl, /auth\.ebay\.com\/oauth2\/authorize/);
    const setCookie = res.headers.get("set-cookie") || "";
    assert.match(setCookie, /ebay_oauth_state=/);
    assert.match(setCookie, /HttpOnly/);
  } finally {
    await close();
  }
});

test("GET /api/channels/ebay/connect 302-redirects to eBay", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/channels/ebay/connect`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location") || "", /auth\.ebay\.com/);
  } finally {
    await close();
  }
});

test("GET /api/channels/ebay/status shape", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/channels/ebay/status`);
    const body = await res.json();
    assert.equal(typeof body.connected, "boolean");
    assert.ok(Array.isArray(body.missing));
    assert.ok("lastError" in body);
  } finally {
    await close();
  }
});

test("callback rejects state mismatch (json)", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(
      `${baseUrl}/api/channels/ebay/callback?code=abc&state=wrong&json=1`,
      { headers: { cookie: "ebay_oauth_state=right" }, redirect: "manual" },
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /State mismatch/);
  } finally {
    await close();
  }
});

test("callback state mismatch renders visible error page with link back", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(
      `${baseUrl}/api/channels/ebay/callback?code=abc&state=wrong`,
      { headers: { cookie: "ebay_oauth_state=right" }, redirect: "manual" },
    );
    assert.equal(res.status, 400);
    const html = await res.text();
    assert.match(html, /State mismatch/);
    assert.match(html, /href="\/hud\.html#\/channels"/);
  } finally {
    await close();
  }
});
