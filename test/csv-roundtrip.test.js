import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { importCsv, exportEbayFileExchange, exportDoubleHoloCsv } from "../src/listing/csv.js";
import { createApp } from "../src/app.js";
import { setDataRoot, createScoutItem } from "../src/store.js";

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFile(join(dir, "fixtures", name), "utf8");

let tempDir;
before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "csv-test-"));
  setDataRoot(tempDir);
});
after(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

test("import eBay File Exchange fixture", async () => {
  const { items, errors } = importCsv("ebay", await fixture("ebay-file-exchange.csv"));
  assert.equal(errors.length, 0);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Dudunsparce 121/159 Journey Together NM Single");
  assert.equal(items[0].sku, "PKM-JTG-NORMAL-1-001");
  assert.equal(items[0].price, 4.99);
  assert.equal(items[0].quantity, 1);
  assert.equal(items[0].action, "Add");
  assert.equal(items[1].quantity, 2);
});

test("import Double Holo fixture (finish in brackets)", async () => {
  const { items, errors } = importCsv("double_holo", await fixture("double-holo.csv"));
  assert.equal(errors.length, 0);
  assert.equal(items.length, 2);
  assert.equal(items[0].productName, "Pikachu");
  assert.equal(items[0].finish, "Holo");
  assert.equal(items[0].collectorNumber, "025");
  assert.equal(items[0].setName, "Base Set");
  assert.equal(items[0].quantity, 3);
  assert.equal(items[0].sku, "PKM-BASE-HOLO-1-001");
});

test("import misprint + seller_fb best-effort fixtures", async () => {
  const mp = importCsv("misprint", await fixture("misprint.csv"));
  assert.equal(mp.items.length, 1);
  assert.equal(mp.items[0].title, "Mewtwo ex");
  assert.equal(mp.items[0].price, 12.5);
  assert.equal(mp.items[0].quantity, 4);
  const fb = importCsv("seller_fb", await fixture("seller-fb.csv"));
  assert.equal(fb.items.length, 1);
  assert.equal(fb.items[0].title, "Sealed booster box");
  assert.equal(fb.items[0].price, 149.99);
});

test("import rejects unknown source", () => {
  assert.throws(() => importCsv("nope", "a,b\n1,2"), /Unknown CSV source/);
});

test("import handles quoted commas + skips blank rows", () => {
  const { items } = importCsv("generic-nope".replace("generic-nope", "misprint"), '"Name","Price"\n"Foo, Bar","9.99"\n\n');
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Foo, Bar");
  assert.equal(items[0].price, 9.99);
});

test("eBay export -> re-import round trip", async () => {
  const items = [
    { id: "a1", title: "Pikachu 025/102 Base NM Single", description: "desc", price: 4.99, quantity: 3, sku: "PKM-BASE-NORMAL-1-001", channels: {} },
    { id: "a2", title: "Charizard Holo", price: 89.99, quantity: 1, sku: "PKM-BASE-HOLO-1-002", channels: {} },
  ];
  const csv = exportEbayFileExchange(items);
  const { items: back, errors } = importCsv("ebay", csv);
  assert.equal(errors.length, 0);
  assert.equal(back.length, 2);
  assert.equal(back[0].title, items[0].title);
  assert.equal(back[0].sku, items[0].sku);
  assert.equal(back[0].price, items[0].price);
  assert.equal(back[0].quantity, items[0].quantity);
});

test("Double Holo export -> re-import round trip", async () => {
  const items = [
    { id: "b1", productName: "Pikachu", title: "Pikachu", collectorNumber: "025", setName: "Base", condition: "NM", quantity: 3, finish: "Holo", language: "English", sku: "PKM-BASE-HOLO-1-001" },
  ];
  const csv = exportDoubleHoloCsv(items);
  const { items: back, errors } = importCsv("double_holo", csv);
  assert.equal(errors.length, 0);
  assert.equal(back.length, 1);
  assert.equal(back[0].productName, "Pikachu");
  assert.equal(back[0].finish, "Holo");
  assert.equal(back[0].quantity, 3);
  assert.equal(back[0].sku, "PKM-BASE-HOLO-1-001");
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

test("POST /api/csv/import end to end", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const csv = await fixture("double-holo.csv");
    const res = await fetch(`${baseUrl}/api/csv/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "double_holo", csv }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.imported, 2);
    assert.equal(body.items[0].productName, "Pikachu");
  } finally {
    await close();
  }
});

test("POST /api/csv/import rejects bad source", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/csv/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "nope", csv: "a" }),
    });
    assert.equal(res.status, 400);
  } finally {
    await close();
  }
});

test("GET /api/csv/export downloads CSV", async () => {
  const item = await createScoutItem({
    title: "Export Test Card",
    productName: "Export Test Card",
    collectorNumber: "001",
    setName: "Test Set",
    quantity: 2,
    price: 9.99,
  });
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/csv/export?source=double_holo&itemIds=${item.id}`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") || "", /text\/csv/);
    assert.match(res.headers.get("content-disposition") || "", /attachment/);
    const text = await res.text();
    assert.match(text, /Export Test Card/);
  } finally {
    await close();
  }
});
