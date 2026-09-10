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
    assert.match(html, /Coalition H\.U\.D/);
    assert.match(html, /Add to rail/);
    assert.match(html, /SCOUTER/);
    assert.match(html, /hh-viewfinder/);
    assert.match(html, /scouter\.css\?v=24/);
    assert.match(html, /stagedFlag/);
    assert.match(html, /CAPTURE/);
    assert.match(html, /SCAN/);
    assert.doesNotMatch(html, /Drop a folder of scans/);
    assert.doesNotMatch(html, />Export</);
    assert.doesNotMatch(html, />Import</);
  } finally {
    await close();
  }
});

test("GET /hud.html serves Coalition H.U.D shell", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/hud.html`);
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(html, /Coalition H\.U\.D/);
    assert.match(html, /hud-visor\.js/);
    assert.match(html, /data-go="scan"/);
    assert.match(html, /Scouter/);
    assert.match(html, /stagedFlag/);
    assert.match(html, /hh-viewfinder/);
    assert.match(html, /Export staged/);
    assert.doesNotMatch(html, /Drop a folder of scans/);
    assert.doesNotMatch(html, /Command Core/);
    assert.doesNotMatch(html, /readyToList/);
  } finally {
    await close();
  }
});

test("GET /trio-setup.html serves truthful wire status", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/trio-setup.html`);
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(html, /Triple Threat/);
    assert.match(html, /Root cause/);
    assert.match(html, /CornDogSmugglerCoalition7/);
    assert.match(html, /allowed_non_write_users/);
    assert.match(html, /GITHUB_TOKEN/);
    assert.match(html, /continue-on-error/);
    assert.match(html, /github-actions\[bot\]/);
  } finally {
    await close();
  }
});

test("GET /hud-status.html serves numbered Coalition H.U.D checklist", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/hud-status.html`);
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(html, /Coalition H\.U\.D/);
    assert.match(html, /Build checklist/);
    assert.match(html, /Working now/);
    assert.match(html, /class="done"/);
    assert.match(html, /class="now"/);
    assert.match(html, /Scouter live on phone/);
    assert.match(html, /Misprint live hook/);
    assert.match(html, /Auto sync across channels/);
  } finally {
    await close();
  }
});

test("claude.yml allows Coalition7 with workflow GITHUB_TOKEN", async () => {
  const fs = await import("node:fs/promises");
  const yml = await fs.readFile(
    new URL("../.github/workflows/claude.yml", import.meta.url),
    "utf8",
  );
  assert.match(yml, /github_token:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/);
  assert.match(yml, /allowed_non_write_users:\s*"CornDogSmugglerCoalition7"/);
  assert.doesNotMatch(yml, /continue-on-error:\s*true/);
});

test("GET /ba-paper-checklist.html serves BA paper checklist", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/ba-paper-checklist.html`);
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(html, /BA Paper/);
    assert.match(html, /ba-paper-checklist-v1/);
    assert.match(html, /Syne/);
    assert.match(html, /Copy notes/);
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
        staged: true,
      }),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.equal(created.item.quantity, 3);
    assert.equal(created.item.category, "raw_cards");
    assert.equal(created.item.staged, true);

    const listRes = await fetch(`${baseUrl}/api/scouter/items`);
    const list = await listRes.json();
    assert.equal(list.items.length, 1);

    const stagedRes = await fetch(`${baseUrl}/api/scouter/items?staged=1`);
    const staged = await stagedRes.json();
    assert.equal(staged.items.length, 1);
    assert.equal(staged.items[0].staged, true);
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

test("GET /api/channels/status reports channel config skeleton", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/channels/status`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.canonical, "hud");
    assert.equal(body.channels.length, 3);
    assert.ok(body.channels.every((c) => typeof c.configured === "boolean"));
  } finally {
    await close();
  }
});

test("POST /api/channels/sale subtracts qty on canonical inventory", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const createRes = await fetch(`${baseUrl}/api/scouter/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Sync Card",
        quantity: 2,
        category: "raw_cards",
        channels: {
          ebay: { listingId: "ebay-1", price: 10, status: "active" },
          misprint: { listingId: "mp-1", price: 10, status: "active" },
        },
      }),
    });
    const { item } = await createRes.json();

    const saleRes = await fetch(`${baseUrl}/api/channels/sale`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id, channel: "ebay", quantitySold: 1 }),
    });
    assert.equal(saleRes.status, 200);
    const sale = await saleRes.json();
    assert.equal(sale.item.quantity, 1);
    assert.equal(sale.item.lastSaleChannel, "ebay");
    assert.ok(Array.isArray(sale.fanout));
  } finally {
    await close();
  }
});
