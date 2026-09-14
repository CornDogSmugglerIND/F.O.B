/**
 * Anthropic Messages image payload + error parsing.
 * Issue #65: live Identify 400s when the request is malformed or the model id is dead.
 * Photos stay as data URLs in the app; this module is the only place they become API bytes.
 */

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";
/** Current Claude API id — not a dated Sonnet 4 snapshot. Override with IDENTIFY_VISION_MODEL. */
export const DEFAULT_VISION_MODEL = "claude-sonnet-5";

const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export function visionModel() {
  return process.env.IDENTIFY_VISION_MODEL || DEFAULT_VISION_MODEL;
}

/**
 * @param {Uint8Array|Buffer} bytes
 * @returns {string|null}
 */
export function sniffMediaType(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/** Map aliases Anthropic rejects (`image/jpg`) onto the four allowed media types. */
export function normalizeMediaType(declared) {
  const raw = String(declared || "")
    .toLowerCase()
    .split(";")[0]
    .trim();
  if (raw === "image/jpg" || raw === "image/pjpeg") return "image/jpeg";
  return raw;
}

/**
 * Strip the data-URL prefix. Anthropic wants only the base64 after the comma.
 * @param {string} dataUrl
 * @returns {{ mediaType: string, data: string } | null}
 */
export function parseImageDataUrl(dataUrl) {
  const raw = String(dataUrl || "").trim();
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+)((?:;[^,]*)*);base64,([\s\S]+)$/i);
  if (!match) return null;

  const declared = normalizeMediaType(match[1]);
  const data = match[3].replace(/\s+/g, "");
  if (!data) return null;

  let sniffed = null;
  try {
    sniffed = sniffMediaType(Buffer.from(data.slice(0, 64), "base64"));
  } catch {
    sniffed = null;
  }

  const mediaType = sniffed || declared;
  if (!ALLOWED_MEDIA.has(mediaType)) return null;
  return { mediaType, data };
}

/**
 * @param {string} dataUrl
 * @returns {{ type: 'image', source: { type: 'base64', media_type: string, data: string } } | null}
 */
export function toAnthropicImage(dataUrl) {
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed) return null;
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: parsed.mediaType,
      data: parsed.data,
    },
  };
}

/**
 * Pull Anthropic's `error.message` so the UI is not stuck on "HTTP 400".
 * @param {number} status
 * @param {string} bodyText
 */
export function anthropicErrorMessage(status, bodyText) {
  const text = String(bodyText || "").trim();
  let detail = "";
  try {
    const parsed = JSON.parse(text);
    detail = parsed?.error?.message || parsed?.message || "";
  } catch {
    detail = text;
  }
  detail = String(detail)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  if (detail) return `Anthropic vision failed: HTTP ${status}: ${detail}`;
  return `Anthropic vision failed: HTTP ${status}`;
}
