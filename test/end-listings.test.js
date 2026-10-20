import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";

async function start() {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}
const KEYS = ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_REFRESH_TOKEN", "EBAY_ACCESS_TOKEN"];

test("end-listings refuses safely when eBay is not connected", async () => {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]])); KEYS.forEach((k) => delete process.env[k]);
  const s = await start();
  try {
    const r = await fetch(`${s.url}/api/channels/ebay/end-listings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [{ id: "a", offerId: "o1" }] }) });
    const out = await r.json();
    assert.equal(out.ok, false);
    assert.deepEqual(out.ended, []);
    assert.equal(out.failed.length, 1);
    assert.equal(out.failed[0].id, "a");
  } finally { await s.close(); for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v; }
});
