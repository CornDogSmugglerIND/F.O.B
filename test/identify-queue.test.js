import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePath } from "../src/routes/identifyQueue.js";
import { createApp } from "../src/app.js";

test("intake queue: blob path carries batch, scan order and file name", () => {
  assert.deepEqual(parsePath("coalition/intake/Batch_20261028/00007__Batch_20261028_0007.jpg"), { path: "coalition/intake/Batch_20261028/00007__Batch_20261028_0007.jpg", batch: "Batch_20261028", seq: 7, file: "Batch_20261028_0007.jpg" });
  assert.equal(parsePath("coalition/intake/junk.jpg"), null);
});
test("intake queue: GET /api/identify/queue exists (503 without storage, never 404)", async () => {
  const saved = Object.keys(process.env).filter((k) => /READ_WRITE_TOKEN$/.test(k)).map((k) => [k, process.env[k]]); for (const [k] of saved) delete process.env[k];
  const srv = createApp().listen(0); const port = srv.address().port;
  try { const r = await fetch(`http://127.0.0.1:${port}/api/identify/queue`); assert.equal(r.status, 503); }
  finally { srv.close(); for (const [k, v] of saved) process.env[k] = v; }
});
