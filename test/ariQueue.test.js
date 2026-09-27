import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ariQueueStorageStatus,
  enqueueIdentifyRequest,
  getAriIdentifyConfig,
  isAriWorkerAuthorized,
} from "../src/identify/ariQueue.js";

const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function fakeEnv(overrides = {}) {
  return {
    R2_ACCOUNT_ID: "test-account",
    R2_ACCESS_KEY_ID: "test-key",
    R2_SECRET_ACCESS_KEY: "test-secret",
    R2_BUCKET: "test-bucket",
    R2_PUBLIC_BASE_URL: "https://scans.example.com",
    ARI_IDENTIFY_SECRET: "test-shared-secret",
    ...overrides,
  };
}

describe("ari identify config", () => {
  it("defaults provider to anthropic", () => {
    assert.equal(getAriIdentifyConfig(fakeEnv()).provider, "anthropic");
  });

  it("respects IDENTIFY_PROVIDER override", () => {
    assert.equal(
      getAriIdentifyConfig(fakeEnv({ IDENTIFY_PROVIDER: "anthropic" })).provider,
      "anthropic"
    );
  });

  it("reports missing storage env honestly", () => {
    const status = ariQueueStorageStatus({});
    assert.equal(status.ok, false);
    assert.ok(status.missing.includes("R2_ACCOUNT_ID"));
    assert.ok(status.missing.includes("ARI_IDENTIFY_SECRET"));
  });

  it("reports ready when env is complete", () => {
    const status = ariQueueStorageStatus(fakeEnv());
    assert.equal(status.ok, true);
    assert.deepEqual(status.missing, []);
  });
});

describe("ari worker auth", () => {
  it("accepts the correct secret", () => {
    const req = { headers: { "x-ari-secret": "test-shared-secret" } };
    assert.equal(isAriWorkerAuthorized(req, fakeEnv()), true);
  });

  it("rejects a wrong secret", () => {
    const req = { headers: { "x-ari-secret": "wrong" } };
    assert.equal(isAriWorkerAuthorized(req, fakeEnv()), false);
  });

  it("rejects a missing secret", () => {
    assert.equal(isAriWorkerAuthorized({ headers: {} }, fakeEnv()), false);
  });

  it("rejects when no secret is configured", () => {
    const req = { headers: { "x-ari-secret": "anything" } };
    assert.equal(
      isAriWorkerAuthorized(req, fakeEnv({ ARI_IDENTIFY_SECRET: "" })),
      false
    );
  });
});

describe("ari enqueue validation", () => {
  it("fails honestly when storage is not configured", async () => {
    await assert.rejects(
      () => enqueueIdentifyRequest({ photos: [tinyPng] }, {}),
      (err) => err.code === "ARI_QUEUE_CONFIG"
    );
  });

  it("fails honestly with no photos", async () => {
    await assert.rejects(
      () => enqueueIdentifyRequest({ photos: [] }, fakeEnv()),
      (err) => err.code === "ARI_QUEUE_NO_PHOTOS"
    );
  });

  it("rejects non-image data URLs", async () => {
    await assert.rejects(
      () =>
        enqueueIdentifyRequest(
          { photos: ["data:text/plain;base64,aGVsbG8="] },
          fakeEnv()
        ),
      (err) => err.code === "ARI_QUEUE_NO_PHOTOS"
    );
  });
});
