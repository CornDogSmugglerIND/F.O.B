import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { probeMisprint } from "../src/channels/misprint.js";

const saved = { ...process.env };

beforeEach(() => {
  process.env.MISPRINT_API_KEY = "sk_live_test_key";
  process.env.MISPRINT_SELLER_ID = "11111111-2222-3333-4444-555555555555";
  delete process.env.MISPRINT_API_BASE;
});

afterEach(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in saved)) delete process.env[k];
  }
  Object.assign(process.env, saved);
});

test("probeMisprint reports keys present but base required", async () => {
  const result = await probeMisprint();
  assert.equal(result.ok, false);
  assert.equal(result.keysPresent, true);
  assert.equal(result.code, "MISPRINT_BASE_REQUIRED");
});

test("GET /api/channels/misprint/probe surfaces base requirement", async () => {
  const { createApp } = await import("../src/app.js");
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/channels/misprint/probe`);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.code, "MISPRINT_BASE_REQUIRED");
    assert.equal(body.keysPresent, true);
    assert.ok(!JSON.stringify(body).includes("sk_live_test_key"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
