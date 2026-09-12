/**
 * Cloudflare R2 config from env. Never log secret values.
 */

const REQUIRED = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
];

export function getR2Config(env = process.env) {
  const missing = REQUIRED.filter((key) => !String(env[key] || "").trim());
  const accountId = String(env.R2_ACCOUNT_ID || "").trim();
  const publicBaseUrl = String(env.R2_PUBLIC_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");

  return {
    ok: missing.length === 0,
    missing,
    accountId,
    accessKeyId: String(env.R2_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: String(env.R2_SECRET_ACCESS_KEY || "").trim(),
    bucket: String(env.R2_BUCKET || "").trim(),
    publicBaseUrl,
    endpoint: accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "",
    keyPrefix: String(env.R2_KEY_PREFIX || "scans").trim().replace(/^\/+|\/+$/g, "") || "scans",
  };
}

export function publicUrlForKey(config, key) {
  const cleanKey = String(key || "").replace(/^\/+/, "");
  return `${config.publicBaseUrl}/${cleanKey}`;
}
