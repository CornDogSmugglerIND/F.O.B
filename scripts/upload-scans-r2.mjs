#!/usr/bin/env node
/**
 * Upload Live Scans to Cloudflare R2 and write a Double Holo Import-photos CSV.
 *
 * Usage:
 *   npm run scans:upload -- --dir "/path/to/Live Scans" --out dh-photos.csv
 *   npm run scans:upload -- --dir "./tmp/scans" --dry-run
 *   npm run scans:upload -- --dir "./tmp/scans" --sequential
 */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnvFile } from "../src/loadEnv.js";
import { uploadScansToR2 } from "../src/scans/uploadScans.js";

function printHelp() {
  console.log(`Upload scans to Cloudflare R2 → Double Holo PicURL CSV

Options:
  --dir <path>       Folder of scan images (required)
  --out <file>       Write CSV here (default: dh-photo-import.csv)
  --dry-run          Pair + build URLs/CSV, do not upload
  --sequential       Pair files in sorted order: 1=front, 2=back, 3=front...
  --help             Show this help

Env (in .env — never paste secrets in chat):
  R2_ACCOUNT_ID
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  R2_BUCKET
  R2_PUBLIC_BASE_URL   e.g. https://scans.corndogsmugglercoalition.com
  R2_KEY_PREFIX        optional, default scans
`);
}

function parseArgs(argv) {
  const out = {
    dir: "",
    outFile: "dh-photo-import.csv",
    dryRun: false,
    sequential: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--sequential") out.sequential = true;
    else if (a === "--dir") out.dir = argv[++i] || "";
    else if (a === "--out") out.outFile = argv[++i] || out.outFile;
  }
  return out;
}

async function main() {
  loadEnvFile();
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.dir) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const dir = resolve(args.dir);
  const result = await uploadScansToR2({
    dir,
    dryRun: args.dryRun,
    sequential: args.sequential,
  });

  const outPath = resolve(args.outFile);
  await writeFile(outPath, result.csv, "utf8");

  console.log(
    JSON.stringify(
      {
        dryRun: result.dryRun,
        images: result.imageCount,
        pairs: result.pairCount,
        uploads: result.uploadCount,
        publicBaseUrl: result.publicBaseUrl,
        csv: outPath,
        sample: result.csvRows.slice(0, 3),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
