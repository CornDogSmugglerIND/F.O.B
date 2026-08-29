import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/app.js";
import { setDataRoot } from "../src/store.js";

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

let tempDir;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "scouter-test-"));
  setDataRoot(tempDir);
});

after(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

test("GET /api/health reports scouter", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/health`);
    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.equal(body.service, "scouter");
  } finally {
    await close();
  }
});

test("GET / serves Scouter frontend", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/`);
    const html = await res.text();
    assert.match(html, /Scouter · Coalition/);
    assert.match(html, /Start intake/);
    assert.match(html, /scouter\.css\?v=10/);
  } finally {
    await close();
  }
});

test("Scouter API creates and lists items with quantity and category", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const createRes = await fetch(`${baseUrl}/api/scouter/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Test Card",
        barcode: "123456789012",
        quantity: 3,
        category: "raw_cards",
      }),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.equal(created.item.quantity, 3);
    assert.equal(created.item.category, "raw_cards");

    const listRes = await fetch(`${baseUrl}/api/scouter/items`);
    const list = await listRes.json();
    assert.equal(list.items.length, 1);
  } finally {
    await close();
  }
});

test("barcode lookup returns structured response", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/scouter/barcode/abc`);
    const body = await res.json();
    assert.equal(body.found, false);
  } finally {
    await close();
  }
});
