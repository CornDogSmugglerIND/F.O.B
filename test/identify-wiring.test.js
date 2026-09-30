import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.js";
import { setDataRoot } from "../src/store.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const pub = join(root, "public");

const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

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
const savedKey = process.env.ANTHROPIC_API_KEY;
const savedProvider = process.env.IDENTIFY_PROVIDER;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "scouter-identify-test-"));
  setDataRoot(tempDir);
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.IDENTIFY_PROVIDER;
});

after(async () => {
  if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = savedKey;
  if (savedProvider === undefined) delete process.env.IDENTIFY_PROVIDER;
  else process.env.IDENTIFY_PROVIDER = savedProvider;
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

test("POST /api/scouter/identify answers honestly with no API key (no spinner)", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/scouter/identify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photos: [tinyPng] }),
    });
    // No key: 422 with one honest line (unit contract in identify.test.js
    // asserts setupTask stays null on this path). Never a spinner.
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.path, "photo_search");
    assert.match(body.message, /isn't set up yet/i);
  } finally {
    await close();
  }
});

test("POST /api/scouter/identify manual entry validates through the gate", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/scouter/identify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        forcePath: "manual",
        manual: { product_name: "Charizard ex" },
      }),
    });
    const body = await res.json();
    assert.equal(body.path, "manual");
    assert.equal(body.ok, false);
    assert.match(body.message, /incomplete/i);
  } finally {
    await close();
  }
});

test("removed A.R.I. queue endpoints are gone", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const worker = await fetch(`${baseUrl}/api/identify/queue`);
    assert.equal(worker.status, 404);
    const poll = await fetch(`${baseUrl}/api/scouter/identify/queue/deadbeef`);
    assert.equal(poll.status, 404);
  } finally {
    await close();
  }
});

test("GET /api/scouter/identify/status is anthropic-only and honest", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/scouter/identify/status`);
    const body = await res.json();
    assert.equal(body.provider, "anthropic");
    assert.equal(body.photoSearchReady, false);
    assert.match(body.setupTask, /isn't set up yet/i);
    assert.ok(!JSON.stringify(body).toLowerCase().includes("ari"));
  } finally {
    await close();
  }
});

test("oversized identify body returns 413, not 500", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/scouter/identify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photos: ["x".repeat(2_200_000)] }),
    });
    assert.equal(res.status, 413);
    const body = await res.json();
    assert.equal(body.ok, false);
  } finally {
    await close();
  }
});

test("live UI wires one ID action into the item sheet", async () => {
  const js = await readFile(join(pub, "coalition.js"), "utf8");
  assert.match(js, /btnIdentify/);
  assert.match(js, /identifyFromSheet/);
  assert.match(js, /identifyShowManualForm/);
  assert.match(js, /\/api\/scouter\/identify/);
  assert.ok(!js.includes("/identify/queue"), "client must not poll the removed queue");

  const index = await readFile(join(pub, "index.html"), "utf8");
  const hud = await readFile(join(pub, "hud.html"), "utf8");
  for (const html of [index, hud]) {
    assert.ok(html.includes('id="btnIdentify"'), "sheet has the ID button");
    assert.ok(html.includes('id="identifyResults"'), "sheet has the results region");
  }
});

test("index.html and hud.html keep identical asset lists and cache-busters", async () => {
  const index = await readFile(join(pub, "index.html"), "utf8");
  const hud = await readFile(join(pub, "hud.html"), "utf8");
  const assets = (html) =>
    [...html.matchAll(/(?:href|src)="(\/[^"]+)\?v=(\d+)"/g)].map((m) => `${m[1]}?v=${m[2]}`).sort();
  assert.deepEqual(assets(index), assets(hud), "asset lists must match");

  for (const pair of assets(index)) {
    const [file] = pair.split("?v=");
    assert.ok(existsSync(join(pub, file.replace(/^\//, ""))), `${pair} resolves`);
  }
  const ver = (html, name) => html.match(new RegExp(`${name.replace(/\//g, "\\/")}\\?v=(\\d+)`))[1];
  assert.equal(ver(index, "/coalition.css"), ver(hud, "/coalition.css"));
  assert.equal(ver(index, "/coalition.js"), ver(hud, "/coalition.js"));
});
