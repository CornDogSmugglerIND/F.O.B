import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { probeMisprint, listMisprintInventory, misprintBaseUrl } from "../src/channels/misprint.js";

const saved = { ...process.env };

beforeEach(() => {
  process.env.MISPRINT_API_KEY = "sk_live_test_key";
  process.env.MISPRINT_SELLER_ID = "11111111-2222-3333-4444-555555555555";
  process.env.MISPRINT_API_BASE = "https://www.misprint.com";
});

afterEach(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in saved)) delete process.env[k];
  }
  Object.assign(process.env, saved);
});

function mockFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  return { fetchImpl, calls };
}
const json = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  async text() { return JSON.stringify(body); },
});

test("base URL is origin + /api/v1 whatever form the env holds", () => {
  assert.equal(misprintBaseUrl(), "https://www.misprint.com/api/v1");
  process.env.MISPRINT_API_BASE = "www.misprint.com";
  assert.equal(misprintBaseUrl(), "https://www.misprint.com/api/v1");
  process.env.MISPRINT_API_BASE = "https://www.misprint.com/api/v1/";
  assert.equal(misprintBaseUrl(), "https://www.misprint.com/api/v1");
});

test("probe hits /seller/inventory?limit=1 with Bearer + X-User-Id only", async () => {
  const { fetchImpl, calls } = mockFetch(() => json(200, { data: [] }));
  const r = await probeMisprint({ fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(calls[0].url, "https://www.misprint.com/api/v1/seller/inventory?page=1&limit=1");
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk_live_test_key");
  assert.equal(calls[0].init.headers["X-User-Id"], "11111111-2222-3333-4444-555555555555");
  assert.equal(calls[0].init.headers["X-API-Key"], undefined);
  assert.equal(calls[0].init.headers["X-Seller-Id"], undefined);
  assert.ok(!JSON.stringify(r).includes("sk_live_test_key"));
});

test("probe reports a rejected key without leaking it", async () => {
  const { fetchImpl } = mockFetch(() => json(401, { error: "bad key" }));
  const r = await probeMisprint({ fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
  assert.ok(!JSON.stringify(r).includes("sk_live_test_key"));
});

test("inventory pages until a short page and reads the data array", async () => {
  const page = (n) => Array.from({ length: n }, (_, i) => ({ id: String(i) }));
  const { fetchImpl, calls } = mockFetch((url) => json(200, { data: url.includes("page=1&") ? page(100) : page(17) }));
  const rows = await listMisprintInventory({ fetchImpl });
  assert.equal(rows.length, 117);
  assert.equal(calls.length, 2);
});

test("probe with no keys throws CHANNEL_NOT_CONFIGURED", async () => {
  delete process.env.MISPRINT_API_KEY;
  await assert.rejects(() => probeMisprint(), (e) => e.code === "CHANNEL_NOT_CONFIGURED");
});
