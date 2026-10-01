import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { constants } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const pub = join(root, "public");

async function src(rel) {
  return readFile(join(pub, rel), "utf8");
}

async function gone(rel) {
  try {
    await access(join(pub, rel), constants.F_OK);
    return false;
  } catch {
    return true;
  }
}

/* ---------- branch 7: honesty sweep — dead controls are gone ---------- */

test("sold-average dead ends are gone: no buttons, no fetch, no excuse toasts", async () => {
  const js = await src("coalition.js");
  assert.ok(!/loadSoldPrice/.test(js), "loadSoldPrice() is gone");
  assert.ok(!/loadAllSold/.test(js), "loadAllSold() is gone");
  assert.ok(!/probe=price/.test(js), "dead price-probe fetch is gone");
  assert.ok(!/wiring to eBay sold comps/.test(js), "excuse toast is gone");
  for (const page of ["index.html", "hud.html"]) {
    const html = await src(page);
    assert.ok(!/btnLoadSold/.test(html), `${page}: Load sold avg button is gone`);
    assert.ok(!/btnLoadAllSold/.test(html), `${page}: Load all / Load sold buttons are gone`);
  }
});

test("barcode reads the real server response shape and surfaces misses honestly", async () => {
  const js = await src("coalition.js");
  assert.ok(
    /body\.product\?\.title/.test(js),
    "addBarcode reads body.product.title (the actual server shape)"
  );
  assert.ok(
    !/body\.title \|\| body\.name/.test(js),
    "old wrong shape (body.title || body.name) is gone"
  );
  assert.ok(/lookupMiss/.test(js), "lookup miss is surfaced instead of silently titling with digits");
});

test("Channels tab shows no fake tiles — honest empty state only", async () => {
  const js = await src("coalition.js");
  assert.ok(!/_demo_ebay/.test(js), "fake eBay tile is gone");
  assert.ok(!/_demo_dh/.test(js), "fake Double Holo tile is gone");
  assert.ok(!/_demo_shop/.test(js), "fake Shopify tile is gone");
  assert.ok(!/_demo_mp/.test(js), "fake Misprint tile is gone");
  assert.ok(/No channel listings yet/.test(js), "honest empty state renders");
});

test("Settings has no dead notification controls", async () => {
  const js = await src("features/settings.js");
  assert.ok(!/NOTIF_META/.test(js), "notification metadata is gone");
  assert.ok(!/data-notif/.test(js), "notification toggles are gone");
  assert.ok(!/function notify/.test(js), "notify() is gone");
  assert.ok(!/window\.HUD_settings = \{[^}]*notify/.test(js), "notify not exposed on HUD_settings");
  assert.ok(/HUD_settings/.test(js), "settings API still exposed");
});

/* ---------- branch 7: orphaned files are gone ---------- */

test("orphaned public files were removed (restored pages excluded)", async () => {
  // Claude's d364a4d review reversed the sweep for three pages that are part
  // of Sawyer's phone workflow (routed in vercel.json): listing-copy.html,
  // trio-setup.html, hud-status.html. Those are restored, not orphans.
  for (const f of [
    "scouter.js",
    "scouter.css",
    "hud-visor.js",
    "desk-trio.sh",
    "ba-terms.html",
    "ba-paper-checklist.html",
    "lib/html5-qrcode.min.js",
  ]) {
    assert.ok(await gone(f), `${f} is removed`);
  }
});

test("no live file references the removed orphans", async () => {
  const js = await src("coalition.js");
  const settings = await src("features/settings.js");
  for (const name of ["scouter.js", "hud-visor.js", "html5-qrcode"]) {
    assert.ok(!js.includes(name), `coalition.js does not reference ${name}`);
    assert.ok(!settings.includes(name), `settings.js does not reference ${name}`);
  }
});

/* ---------- branch 7: server never claims a save it can't keep ---------- */

test("server store is labeled ephemeral; localStorage is the durable store", async () => {
  const store = await readFile(join(root, "src", "store.js"), "utf8");
  assert.ok(/EPHEMERAL/.test(store), "store.js states ephemerality loudly");
  assert.ok(
    /localStorage/.test(store),
    "store.js names localStorage on the device as the durable store"
  );
  assert.ok(
    !/survive Vercel/.test(store),
    "no comment implies data survives beyond the instance"
  );
});

test("no UI copy claims server-side persistence", async () => {
  const pages = [await src("index.html"), await src("coalition.js"), await src("features/settings.js")];
  for (const text of pages) {
    assert.ok(!/saved to server/i.test(text), "nothing claims saved-to-server");
    assert.ok(!/cloud backup/i.test(text), "nothing claims cloud backup");
  }
});
