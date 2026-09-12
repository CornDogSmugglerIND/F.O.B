import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getR2Config, publicUrlForKey } from "./r2Config.js";
import { draftMetaFromLabel, isImagePath, pairScanFiles } from "./pairScans.js";
import { buildDhPhotoCsv, buildPicUrlCell } from "./dhPhotoCsv.js";

function contentTypeFor(filePath) {
  switch (extname(filePath).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    default:
      return "image/jpeg";
  }
}

function stampPrefix(prefix, when = new Date()) {
  const y = when.getUTCFullYear();
  const m = String(when.getUTCMonth() + 1).padStart(2, "0");
  const d = String(when.getUTCDate()).padStart(2, "0");
  return `${prefix}/${y}-${m}-${d}`;
}

function objectKey(prefix, pairId, side, filePath) {
  const ext = extname(filePath).toLowerCase() || ".jpg";
  const safeId =
    String(pairId)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "scan";
  return `${prefix}/${safeId}-${side}${ext}`;
}

export function createR2Client(config) {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

async function listImagesRecursive(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listImagesRecursive(full)));
    else if (entry.isFile() && isImagePath(full)) out.push(full);
  }
  return out;
}

/**
 * Upload paired scans to R2 and build a Double Holo photo-import CSV.
 *
 * @param {{
 *   dir: string,
 *   dryRun?: boolean,
 *   sequential?: boolean,
 *   env?: NodeJS.ProcessEnv,
 *   putObject?: (args: { key: string, filePath: string, contentType: string }) => Promise<void>,
 *   now?: Date,
 * }} opts
 */
export async function uploadScansToR2(opts) {
  const config = getR2Config(opts.env || process.env);

  if (!opts.dryRun && !config.ok) {
    const err = new Error(`Missing R2 env: ${config.missing.join(", ")}`);
    err.code = "R2_CONFIG";
    throw err;
  }

  if (opts.dryRun) {
    if (!config.publicBaseUrl) config.publicBaseUrl = "https://scans.example.test";
    if (!config.keyPrefix) config.keyPrefix = "scans";
  }

  const files = await listImagesRecursive(opts.dir);
  const pairs = pairScanFiles(files, { sequential: Boolean(opts.sequential) });
  const dayPrefix = stampPrefix(config.keyPrefix, opts.now || new Date());

  let putObject = null;
  if (!opts.dryRun) {
    putObject =
      opts.putObject ||
      (async ({ key, filePath, contentType }) => {
        const client = createR2Client(config);
        await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: createReadStream(filePath),
            ContentType: contentType,
          })
        );
      });
  }

  const uploads = [];
  const csvRows = [];

  for (const pair of pairs) {
    const meta = draftMetaFromLabel(pair.label);
    let frontUrl = "";
    let backUrl = "";

    if (pair.front) {
      const key = objectKey(dayPrefix, pair.id, "front", pair.front);
      if (putObject) {
        await putObject({
          key,
          filePath: pair.front,
          contentType: contentTypeFor(pair.front),
        });
      }
      frontUrl = publicUrlForKey(config, key);
      uploads.push({
        side: "front",
        file: basename(pair.front),
        key,
        url: frontUrl,
        dryRun: Boolean(opts.dryRun),
      });
    }

    if (pair.back) {
      const key = objectKey(dayPrefix, pair.id, "back", pair.back);
      if (putObject) {
        await putObject({
          key,
          filePath: pair.back,
          contentType: contentTypeFor(pair.back),
        });
      }
      backUrl = publicUrlForKey(config, key);
      uploads.push({
        side: "back",
        file: basename(pair.back),
        key,
        url: backUrl,
        dryRun: Boolean(opts.dryRun),
      });
    }

    const picUrl = buildPicUrlCell(frontUrl, backUrl);
    if (picUrl) {
      csvRows.push({
        cardName: meta.cardName,
        setName: meta.setName,
        cardNumber: meta.cardNumber,
        picUrl,
      });
    }
  }

  return {
    dryRun: Boolean(opts.dryRun),
    imageCount: files.length,
    pairCount: pairs.length,
    uploadCount: uploads.length,
    uploads,
    csv: buildDhPhotoCsv(csvRows),
    csvRows,
    publicBaseUrl: config.publicBaseUrl,
  };
}
