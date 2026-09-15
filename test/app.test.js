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

test("GET / serves Base44 port shell", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/`);
    const html = await res.text();
    assert.match(html, /Coalition HUD/);
    assert.match(html, /base44\/app\.css/);
    assert.match(html, /base44\/shell\.js/);
    assert.match(html, /COMMAND/);
    assert.match(html, /SCOUTER|Scouter/);
    assert.match(html, /STORAGE|Storage/);
    assert.match(html, /CHANNEL|Channel/);
    assert.match(html, /INTAKE|Intake/);
    assert.match(html, /SETTINGS|Settings/);
    assert.match(html, /scan-intake/);
    assert.match(html, /Intake empty/);
    assert.match(html, /New Scan Batch|New batch/);
    assert.match(html, /Drop a folder of scans/);
    assert.match(html, /SKU prefix/);
    assert.match(html, /id="batchGameChips"/);
    assert.match(html, /id="intakeGrouping"/);
    assert.match(html, /SENSITIVITY/);
    assert.match(html, /Swap front/);
    assert.match(html, /Start identification/);
    assert.match(html, /id="intakeReview"/);
    assert.match(html, /id="reviewMult"/);
    assert.match(html, /id="reviewFloor"/);
    assert.match(html, /id="reviewBulkBar"/);
    assert.match(html, /id="reviewBulkCondition"/);
    assert.match(html, /Set condition…/);
    assert.match(html, /id="btnReviewDelete"/);
    assert.match(html, /id="btnReviewRescanList"/);
    assert.match(html, /id="reviewPreview"/);
    assert.match(html, /id="reviewPreviewEmpty"/);
    assert.match(html, /PREVIEW/);
    assert.match(html, /Hover or click a row to compare your scan against the catalog match\./);
    assert.match(html, /id="btnReviewSplitScreen"/);
    assert.match(html, / Split-screen/);
    assert.match(html, /Candidates — click the match/);
    assert.match(html, /Internet-sourced prices are estimates, not verified sold comps\./);
    assert.match(html, /Need review/);
    assert.match(html, /Double Holo CSV/);
    assert.match(html, /Batch review/);
    assert.match(html, /AI LISTING ENGINE/);
    assert.match(html, /RUN ENGINE/);
    assert.match(html, /Candidates — click the match/);
    assert.match(html, /Catalog match/);
    assert.match(html, /id="fleSheet"/);
    assert.match(html, /id="unSheet"/);
    assert.match(html, /MARKET/);
    assert.match(html, /COST/);
    assert.match(html, /PROFIT/);
    assert.match(html, /Verify — approve/);
    assert.match(html, /To scouter/);
    assert.match(html, /Duplicate/);
    assert.match(html, /Rail · Step 0/);
    assert.match(html, /STEP 1 · INTAKE/);
    assert.match(html, /STEP 2 · BUILD/);
    assert.match(html, /ON SCOUTER/);
    assert.match(html, /SCOUTER VALUE/);
    assert.match(html, /Photo/);
    assert.match(html, /SNAP/);
    assert.match(html, /Scan/);
    assert.match(html, /BARCODE/);
    assert.match(html, /Manual entry/);
    assert.match(html, /id="btnScoutDemo"/);
    assert.match(html, />LIVE</);
    assert.match(html, /id="barcodeSheet"/);
    assert.match(html, /Barcode Scanner/);
    assert.match(html, /Auto-add each scan without preview/);
    assert.match(html, /Write listing with AI/);
    assert.match(html, /LOCKED ·/);
    assert.match(html, /rows written/);
    assert.match(html, /Scan a barcode or drop a photo to bring inventory in/);
    assert.match(html, /Intake is empty — scan a barcode or drop a photo to bring inventory in\./);
    assert.match(html, /id="intakeHint"/);

    assert.match(html, /Feed the autofeed scanner/);

    assert.match(html, /Start intake/);
    assert.match(html, /Scouter empty/);
    assert.match(html, /v-panel/);
    assert.match(html, /SITREP/);
    assert.match(html, /All clear/);
    assert.match(html, /Empty location/);
    assert.match(html, /Add a bin, shelf or tote to start mapping your shelves/);
    assert.match(html, /Channel empty/);
    assert.match(html, /No collections yet\./);
    assert.match(html, /Storage Map/);
    assert.match(html, /Connect it in Settings\./);
    assert.match(html, /Connect eBay to see what's on the channel\./);
    assert.match(html, /id="btnChannelVariation"/);
    assert.match(html, /id="channelVariationBar"/);
    assert.match(html, /CARDS SELECTED/);
    assert.match(html, /Select 2\+/);
    assert.match(html, /LIVE LISTINGS/);
    assert.match(html, /FULFILMENT/);
    assert.match(html, /Listing templates/);
    assert.match(html, /Shipping presets/);
    assert.match(html, /eBay Diagnostic/);
    assert.match(html, /Agent Connect/);
    assert.match(html, /Connect an AI assistant/);
    assert.match(html, /Refresh after updates/);
    assert.match(html, /EBAY CSV MAPPING/);
    assert.match(html, /eBay CSV/);
    assert.match(html, /No templates yet/);
    assert.match(html, /No storage locations yet/);
    assert.match(html, /Add warehouses, shelves, or totes to organize inventory/);
    assert.match(html, /RELEASE TO INTAKE/);
    assert.match(html, /id="scouterReleaseOverlay"/);
    assert.match(html, /id="scouterUploadHud"/);
    assert.match(html, /Scan Batch Assistant/);
    assert.match(html, /Start the conversation to structure your scan batch/);
    assert.match(html, /id="scanAssistForm"/);
    assert.match(html, /scan-assistant/);
    assert.match(html, /No shipments yet/);
    assert.match(html, /Packages appear here once an order is created\./);
    assert.match(html, /id="btnChannelPrev"/);
    assert.match(html, /id="btnChannelNext"/);
    assert.match(html, /id="channelSheetPagerLabel"/);
    assert.match(html, /Filter listings/);
    assert.match(html, /× RELEASE LOCK/);
    assert.match(html, /id="fulHubs"/);
    assert.match(html, /id="fulSheet"/);
    assert.match(html, /id="btnFulAdvance"/);
    assert.match(html, /System/);
    assert.match(html, /Open scouter/);
    assert.match(html, /Scan batch/);
    assert.match(html, /New card/);
    assert.match(html, /ALL STORAGE/);
    assert.match(html, /btnSpaceUp/);
    assert.match(html, /Nothing is blocked, errored, or sitting untouched\./);


    assert.match(html, /m-btn-primary/);
    assert.doesNotMatch(html, /Add to rail/);
    assert.doesNotMatch(html, />Rail</);
    assert.doesNotMatch(html, /camera-first|liveCam/);
  } finally {
    await close();
  }
});

test("GET /hud.html serves Base44 port shell", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/hud.html`);
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(html, /Coalition HUD/);
    assert.match(html, /base44\/shell\.js/);
    assert.match(html, /scan-intake/);
    assert.match(html, /Intake empty/);
    assert.match(html, /Drop a folder of scans/);
    assert.match(html, /SKU prefix/);
    assert.match(html, /id="batchGameChips"/);
    assert.match(html, /id="intakeGrouping"/);
    assert.match(html, /SENSITIVITY/);
    assert.match(html, /Swap front/);
    assert.match(html, /id="intakeReview"/);
    assert.match(html, /id="reviewMult"/);
    assert.match(html, /id="reviewFloor"/);
    assert.match(html, /id="reviewBulkBar"/);
    assert.match(html, /id="reviewBulkCondition"/);
    assert.match(html, /Set condition…/);
    assert.match(html, /id="btnReviewDelete"/);
    assert.match(html, /id="btnReviewRescanList"/);
    assert.match(html, /id="reviewPreview"/);
    assert.match(html, /id="reviewPreviewEmpty"/);
    assert.match(html, /PREVIEW/);
    assert.match(html, /Hover or click a row to compare your scan against the catalog match\./);
    assert.match(html, /id="btnReviewSplitScreen"/);
    assert.match(html, / Split-screen/);
    assert.match(html, /Candidates — click the match/);
    assert.match(html, /Internet-sourced prices are estimates, not verified sold comps\./);
    assert.match(html, /Need review/);
    assert.match(html, /Double Holo CSV/);
    assert.match(html, /AI LISTING ENGINE/);
    assert.match(html, /Catalog match/);
    assert.match(html, /id="fleSheet"/);
    assert.match(html, /id="unSheet"/);
    assert.match(html, /MARKET/);
    assert.match(html, /PROFIT/);
    assert.match(html, /Verify — approve/);
    assert.match(html, /To scouter/);
    assert.doesNotMatch(html, /Add to rail/);
    assert.doesNotMatch(html, />Rail</);
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

test("Identify is photo-first and does not accept barcode as a path", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const empty = await fetch(`${baseUrl}/api/scouter/identify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ barcode: "012345678905" }),
    });
    const emptyBody = await empty.json();
    assert.equal(empty.ok, false);
    assert.equal(emptyBody.path, "none");
    assert.match(emptyBody.message, /photos/i);

    const forced = await fetch(`${baseUrl}/api/scouter/identify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forcePath: "barcode", barcode: "012345678905" }),
    });
    const forcedBody = await forced.json();
    assert.equal(forcedBody.path, "none");
    assert.match(forcedBody.message, /separate/i);

    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const photo = await fetch(`${baseUrl}/api/scouter/identify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photos: [tinyPng] }),
    });
    const photoBody = await photo.json();
    assert.equal(photoBody.path, "photo_search");
    assert.notEqual(photoBody.path, "barcode");
    assert.ok(photoBody.message);

    const status = await fetch(`${baseUrl}/api/scouter/identify/status`);
    const statusBody = await status.json();
    assert.equal(statusBody.feature, "photo");
    assert.equal(statusBody.barcodeFeature.separate, true);
    assert.ok(statusBody.paths.includes("photo_search"));
    assert.ok(statusBody.paths.includes("manual"));
    assert.ok(!statusBody.paths.includes("barcode"));
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
