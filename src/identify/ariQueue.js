/**
 * A.R.I. identify queue — R2-backed.
 *
 * Sawyer's call: A.R.I. takes the vision-provider role for Identify.
 * Flow:
 *   1. App (POST /api/scouter/identify, IDENTIFY_PROVIDER=ari) uploads the
 *      photos to R2 and writes identify-queue/<uuid>/request.json (pending).
 *   2. A.R.I. polls GET /api/identify/queue (secret-gated), downloads the
 *      photos, identifies the item, and POSTs the result to
 *      /api/identify/queue/<uuid>/result (secret-gated).
 *   3. App frontend polls GET /api/scouter/identify/queue/<uuid> until done.
 *
 * R2 layout:
 *   identify-queue/<uuid>/request.json
 *   identify-queue/<uuid>/photo-<n>.<ext>
 *   identify-queue/<uuid>/result.json
 *
 * Never guess: a low-confidence result must carry candidates (pick list)
 * or an honest no-match message. Same gate as the vision path.
 */

import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getR2Config, publicUrlForKey } from "../scans/r2Config.js";

export const QUEUE_PREFIX = "identify-queue/";
export const ARI_RESULT_BY = "ari";

function getEnv(env) {
  return env || process.env;
}

/** @returns {{ provider: string, secret: string }} */
export function getAriIdentifyConfig(env = process.env) {
  const e = getEnv(env);
  return {
    provider: String(e.IDENTIFY_PROVIDER || "ari")
      .trim()
      .toLowerCase(),
    secret: String(e.ARI_IDENTIFY_SECRET || ""),
  };
}

/**
 * R2 readiness for the queue. Reports honestly — never throw for missing env.
 * @returns {{ ok: boolean, missing: string[], config: object|null }}
 */
export function ariQueueStorageStatus(env = process.env) {
  const e = getEnv(env);
  const r2 = getR2Config(e);
  const secret = String(e.ARI_IDENTIFY_SECRET || "").trim();
  const missing = [...r2.missing];
  if (!secret) missing.push("ARI_IDENTIFY_SECRET");
  return { ok: missing.length === 0, missing, config: r2.ok ? r2 : null };
}

function createQueueClient(r2config) {
  return new S3Client({
    region: "auto",
    endpoint: r2config.endpoint,
    credentials: {
      accessKeyId: r2config.accessKeyId,
      secretAccessKey: r2config.secretAccessKey,
    },
  });
}

function parseDataUrl(dataUrl) {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/is.exec(
    String(dataUrl || "")
  );
  if (!m) return null;
  return { mime: m[1].toLowerCase(), base64: m[2] };
}

function extForMime(mime) {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

async function putJson(client, bucket, key, obj) {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.from(JSON.stringify(obj)),
      ContentType: "application/json",
    })
  );
}

async function getJson(client, bucket, key) {
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    const text = await res.Body.transformToString("utf-8");
    return JSON.parse(text);
  } catch (err) {
    if (
      err?.name === "NoSuchKey" ||
      err?.$metadata?.httpStatusCode === 404
    ) {
      return null;
    }
    throw err;
  }
}

/**
 * Enqueue an identify request. Photos are data URLs; they are uploaded to R2
 * so A.R.I. can fetch them over plain HTTPS.
 * @returns {Promise<{ queueId: string, photoUrls: string[] }>}
 */
export async function enqueueIdentifyRequest(input = {}, env = process.env) {
  const e = getEnv(env);
  const status = ariQueueStorageStatus(e);
  if (!status.ok) {
    const err = new Error(
      `Identify queue is not set up yet (missing: ${status.missing.join(", ")}).`
    );
    err.code = "ARI_QUEUE_CONFIG";
    err.missing = status.missing;
    throw err;
  }
  const r2 = status.config;
  const photos = Array.isArray(input.photos) ? input.photos : [];
  const valid = photos.map(parseDataUrl).filter(Boolean);
  if (!valid.length) {
    const err = new Error("Identify needs photos.");
    err.code = "ARI_QUEUE_NO_PHOTOS";
    throw err;
  }

  const queueId = randomUUID();
  const base = `${QUEUE_PREFIX}${queueId}/`;
  const client = createQueueClient(r2);

  const photoUrls = [];
  await Promise.all(
    valid.map(async (p, i) => {
      const ext = extForMime(p.mime);
      const key = `${base}photo-${i}.${ext}`;
      await client.send(
        new PutObjectCommand({
          Bucket: r2.bucket,
          Key: key,
          Body: Buffer.from(p.base64, "base64"),
          ContentType: p.mime,
        })
      );
      photoUrls.push(publicUrlForKey(r2, key));
    })
  );

  const request = {
    queueId,
    photoUrls,
    category: input.category || null,
    quantity: Math.max(1, Number(input.quantity) || 1),
    notes:
      typeof input.notes === "string" && input.notes.trim()
        ? input.notes.trim()
        : null,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  await putJson(client, r2.bucket, `${base}request.json`, request);
  return { queueId, photoUrls };
}

/**
 * Frontend poll: pending until A.R.I. posts result.json.
 * @returns {Promise<{ status: "pending"|"done"|"not_found", result: object|null }>}
 */
export async function getIdentifyQueueStatus(queueId, env = process.env) {
  const e = getEnv(env);
  const status = ariQueueStorageStatus(e);
  if (!status.ok) return { status: "not_found", result: null };
  const r2 = status.config;
  const client = createQueueClient(r2);
  const base = `${QUEUE_PREFIX}${queueId}/`;
  const result = await getJson(client, r2.bucket, `${base}result.json`);
  if (result) return { status: "done", result };
  const request = await getJson(client, r2.bucket, `${base}request.json`);
  if (request) return { status: "pending", result: null };
  return { status: "not_found", result: null };
}

/**
 * A.R.I. worker: list requests that have no result yet.
 * @returns {Promise<Array<{ queueId: string, photoUrls: string[], category: string|null, quantity: number, notes: string|null, createdAt: string }>>}
 */
export async function listPendingIdentifyRequests(env = process.env) {
  const e = getEnv(env);
  const status = ariQueueStorageStatus(e);
  if (!status.ok) {
    const err = new Error(
      `Identify queue is not set up yet (missing: ${status.missing.join(", ")}).`
    );
    err.code = "ARI_QUEUE_CONFIG";
    throw err;
  }
  const r2 = status.config;
  const client = createQueueClient(r2);

  const keys = [];
  let token;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: r2.bucket,
        Prefix: QUEUE_PREFIX,
        ContinuationToken: token,
      })
    );
    for (const o of res.Contents || []) keys.push(o.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  const byQueue = new Map();
  for (const key of keys) {
    const m = new RegExp(`^${QUEUE_PREFIX}([^/]+)/(request|result)\\.json$`).exec(
      key
    );
    if (!m) continue;
    const entry = byQueue.get(m[1]) || {};
    entry[m[2]] = true;
    byQueue.set(m[1], entry);
  }

  const pending = [];
  for (const [queueId, entry] of byQueue) {
    if (entry.request && !entry.result) {
      const request = await getJson(
        client,
        r2.bucket,
        `${QUEUE_PREFIX}${queueId}/request.json`
      );
      if (request) pending.push(request);
    }
  }
  pending.sort((a, b) =>
    String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
  );
  return pending;
}

/**
 * A.R.I. worker: post the identification result.
 * result.identity follows the Identify gate shape (see identify/gate.js).
 * Low confidence must include candidates (pick list) or an honest message —
 * never a silent guess.
 */
export async function writeIdentifyResult(queueId, result = {}, env = process.env) {
  const e = getEnv(env);
  const status = ariQueueStorageStatus(e);
  if (!status.ok) {
    const err = new Error(
      `Identify queue is not set up yet (missing: ${status.missing.join(", ")}).`
    );
    err.code = "ARI_QUEUE_CONFIG";
    throw err;
  }
  const r2 = status.config;
  const client = createQueueClient(r2);
  const base = `${QUEUE_PREFIX}${queueId}/`;
  const existing = await getJson(client, r2.bucket, `${base}request.json`);
  if (!existing) {
    const err = new Error("Identify request not found.");
    err.code = "ARI_QUEUE_NOT_FOUND";
    throw err;
  }
  const payload = {
    queueId,
    by: ARI_RESULT_BY,
    identifiedAt: new Date().toISOString(),
    identity: result.identity || null,
    candidates: Array.isArray(result.candidates) ? result.candidates : [],
    message: typeof result.message === "string" ? result.message : "",
  };
  await putJson(client, r2.bucket, `${base}result.json`, payload);
  return payload;
}

/** Secret-gate for the A.R.I. worker endpoints. */
export function isAriWorkerAuthorized(req, env = process.env) {
  const e = getEnv(env);
  const secret = String(e.ARI_IDENTIFY_SECRET || "");
  if (!secret) return false;
  const presented = String(req.headers?.["x-ari-secret"] || "");
  if (!presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
