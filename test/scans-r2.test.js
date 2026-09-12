import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getR2Config, publicUrlForKey } from "../src/scans/r2Config.js";
import {
  draftMetaFromLabel,
  parseScanStem,
  pairScanFiles,
} from "../src/scans/pairScans.js";
import { buildDhPhotoCsv, buildPicUrlCell, DH_PHOTO_HEADERS } from "../src/scans/dhPhotoCsv.js";
import { uploadScansToR2 } from "../src/scans/uploadScans.js";

test("R2 config reports missing env without leaking values", () => {
  const cfg = getR2Config({});
  assert.equal(cfg.ok, false);
  assert.ok(cfg.missing.includes("R2_ACCOUNT_ID"));
  assert.equal(cfg.secretAccessKey, "");
});

test("publicUrlForKey joins base + key", () => {
  const url = publicUrlForKey(
    { publicBaseUrl: "https://scans.corndogsmugglercoalition.com" },
    "scans/2026-09-12/x-front.jpg"
  );
  assert.equal(
    url,
    "https://scans.corndogsmugglercoalition.com/scans/2026-09-12/x-front.jpg"
  );
});

test("parseScanStem detects front/back suffixes", () => {
  assert.deepEqual(parseScanStem("Charizard-front"), {
    id: "charizard",
    side: "front",
    label: "Charizard",
  });
  assert.equal(parseScanStem("card_001_back").side, "back");
  assert.equal(parseScanStem("IMG_0001").side, null);
});

test("pairScanFiles pairs named front/back", () => {
  const pairs = pairScanFiles([
    "/tmp/Obsidian Flames_86_Charizard-back.jpg",
    "/tmp/Obsidian Flames_86_Charizard-front.jpg",
  ]);
  assert.equal(pairs.length, 1);
  assert.match(pairs[0].front, /front\.jpg$/);
  assert.match(pairs[0].back, /back\.jpg$/);
});

test("pairScanFiles sequential mode", () => {
  const pairs = pairScanFiles(["/tmp/a.jpg", "/tmp/b.jpg", "/tmp/c.jpg", "/tmp/d.jpg"], {
    sequential: true,
  });
  assert.equal(pairs.length, 2);
  assert.equal(basenameSafe(pairs[0].front), "a.jpg");
  assert.equal(basenameSafe(pairs[0].back), "b.jpg");
});

test("draftMetaFromLabel parses Set_Number_Name", () => {
  const meta = draftMetaFromLabel("Obsidian Flames_86_Charizard");
  assert.equal(meta.setName, "Obsidian Flames");
  assert.equal(meta.cardNumber, "86");
  assert.equal(meta.cardName, "Charizard");
});

test("DH photo CSV headers match Vendor Hub contract", () => {
  assert.deepEqual(DH_PHOTO_HEADERS, [
    "*C:Card Name",
    "*C:Set",
    "*C:Card Number",
    "PicURL",
  ]);
  const csv = buildDhPhotoCsv([
    {
      cardName: "Litwick [Reverse Holo]",
      setName: "SV",
      cardNumber: "8",
      picUrl: buildPicUrlCell("https://x/f.jpg", "https://x/b.jpg"),
    },
  ]);
  assert.match(csv, /^\*C:Card Name,\*C:Set,\*C:Card Number,PicURL\n/);
  assert.match(csv, /https:\/\/x\/f\.jpg\|https:\/\/x\/b\.jpg/);
});

test("uploadScansToR2 dry-run pairs folder and builds CSV without credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "r2-scans-"));
  try {
    await writeFile(join(dir, "SV_8_Litwick-front.jpg"), Buffer.from("front"));
    await writeFile(join(dir, "SV_8_Litwick-back.jpg"), Buffer.from("back"));

    const putCalls = [];
    const result = await uploadScansToR2({
      dir,
      dryRun: true,
      now: new Date("2026-09-12T12:00:00Z"),
      env: {
        R2_PUBLIC_BASE_URL: "https://scans.corndogsmugglercoalition.com",
        R2_KEY_PREFIX: "scans",
      },
      putObject: async (args) => {
        putCalls.push(args);
      },
    });

    assert.equal(result.imageCount, 2);
    assert.equal(result.pairCount, 1);
    assert.equal(result.uploadCount, 2);
    assert.equal(putCalls.length, 0); // dry-run must not upload
    assert.match(result.csv, /\*C:Card Name/);
    assert.match(
      result.csvRows[0].picUrl,
      /^https:\/\/scans\.corndogsmugglercoalition\.com\/scans\/2026-09-12\/.+front\.jpg\|https:\/\/scans\.corndogsmugglercoalition\.com\/scans\/2026-09-12\/.+back\.jpg$/
    );
    assert.equal(result.csvRows[0].setName, "SV");
    assert.equal(result.csvRows[0].cardNumber, "8");
    assert.equal(result.csvRows[0].cardName, "Litwick");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("uploadScansToR2 refuses live upload when env missing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "r2-scans-"));
  try {
    await writeFile(join(dir, "x-front.jpg"), Buffer.from("x"));
    await assert.rejects(
      () => uploadScansToR2({ dir, dryRun: false, env: {} }),
      /Missing R2 env/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function basenameSafe(p) {
  return String(p).split("/").pop();
}
