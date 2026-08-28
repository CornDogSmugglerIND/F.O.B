import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";

/** Start the app on an ephemeral port and return { baseUrl, close }. */
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

test("GET /api/health reports ok", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.equal(body.service, "fob");
    assert.equal(typeof body.uptimeSeconds, "number");
  } finally {
    await close();
  }
});

test("POST /api/echo reverses text", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/echo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "abc" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.original, "abc");
    assert.equal(body.reversed, "cba");
    assert.equal(body.length, 3);
  } finally {
    await close();
  }
});

test("GET / serves the frontend", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /F\.O\.B/);
  } finally {
    await close();
  }
});
