/**
 * Identify core — photo in → identity out.
 * Vision: Anthropic only, gated on ANTHROPIC_API_KEY.
 * Do not propose other providers. Do not fall back to barcode.
 *
 * When key absent: one honest line — "Identify isn't set up yet."
 * Never spinner. Never fake result. Never ask for the key in UI copy.
 *
 * Cards: catalog verify after vision.
 * Non-cards: DuckDuckGo Instant Answer is a WEAK PLACEHOLDER only
 * (see webSearch.js). Do not treat non-card Identify as working.
 */

import { normalizeIdentity, identifyResult } from "./gate.js";
import { searchCatalogs } from "./catalog.js";
import { searchLiveWeb } from "./webSearch.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.IDENTIFY_VISION_MODEL || "claude-sonnet-4-20250514";
const NOT_SET_UP = "Identify isn't set up yet.";

const CARD_GAMES = new Set([
  "Pokemon",
  "Magic",
  "One Piece",
  "Dragon Ball Super",
  "Digimon",
  "sports",
]);

/** @returns {{ ready: boolean, missingKeys: string[], message: string }} */
export function visionKeyStatus() {
  const ready = Boolean(process.env.ANTHROPIC_API_KEY);
  return {
    ready,
    missingKeys: [],
    message: ready ? "Photo identify ready." : NOT_SET_UP,
  };
}

/**
 * @param {string} dataUrl
 * @returns {{ mediaType: string, data: string } | null}
 */
function parseDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return { mediaType: match[1], data: match[2] };
}

/**
 * @param {string[]} dataUrls
 * @param {{ notes?: string, category?: string }} [ctx]
 */
async function callClaudeVision(dataUrls, ctx = {}) {
  const images = [];
  for (const url of dataUrls.slice(0, 5)) {
    const parsed = parseDataUrl(url);
    if (parsed) {
      images.push({
        type: "image",
        source: { type: "base64", media_type: parsed.mediaType, data: parsed.data },
      });
    }
  }
  if (!images.length) throw new Error("No usable photo data URLs");

  const prompt = `You identify collectible / retail products for a reseller intake tool (Coalition H.U.D Scouter).

Category hint: ${ctx.category || "unknown"}
Operator notes: ${ctx.notes || "none"}

Look at the photo(s). Return ONLY valid JSON (no markdown) with this shape:
{
  "product_name": string|null,
  "collector_number": string|null,
  "set_name": string|null,
  "set_code": string|null,
  "game": "Pokemon"|"Magic"|"One Piece"|"Dragon Ball Super"|"Digimon"|"sports"|"electronics"|"other"|null,
  "rarity": string|null,
  "finish": string|null,
  "language": string,
  "condition": string,
  "confidence": "high"|"low",
  "kind": "card"|"sealed"|"toy"|"electronics"|"movie"|"other",
  "search_query": string|null,
  "candidates": [{"product_name":string,"collector_number":string|null,"set_name":string|null,"set_code":string|null,"game":string|null,"finish":string|null,"confidence":"high"|"low"}],
  "unusable_photo": boolean,
  "reason": string|null
}

Rules:
- Never guess finish/variant if unsure — set confidence low.
- Prefer exact printed name and collector number from the card.
- If photo is blurry / hair / glare, set unusable_photo true.
- kind=card for TCG/sports cards; sealed/toy/electronics/movie/other otherwise.
- search_query should be what a buyer would type into eBay for this exact item.`;

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
      messages: [{ role: "user", content: [...images, { type: "text", text: prompt }] }],
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Anthropic vision failed: HTTP ${res.status}`);
    err.status = res.status;
    err.body = text.slice(0, 400);
    throw err;
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Vision returned no JSON");
  return JSON.parse(jsonMatch[0]);
}

function isCardLike(vision) {
  if (vision.kind === "card") return true;
  if (vision.collector_number && vision.set_name) return true;
  return CARD_GAMES.has(String(vision.game || ""));
}

/**
 * @param {{ photos?: string[], notes?: string, category?: string, quantity?: number }} input
 */
export async function identifyFromPhotos(input = {}) {
  const networkCalls = [];
  const photos = (input.photos || []).filter((p) => typeof p === "string" && p.startsWith("data:image/"));
  if (!photos.length) {
    return identifyResult({
      ok: false,
      path: "photo_search",
      message: "No photos to identify. Drop or take photos first.",
      networkCalls,
    });
  }

  const keys = visionKeyStatus();
  if (!keys.ready) {
    return identifyResult({
      ok: false,
      path: "photo_search",
      message: NOT_SET_UP,
      setupTask: null,
      missingKeys: [],
      networkCalls,
    });
  }

  networkCalls.push(ANTHROPIC_URL);
  let vision;
  try {
    vision = await callClaudeVision(photos, { notes: input.notes, category: input.category });
  } catch (err) {
    return identifyResult({
      ok: false,
      path: "photo_search",
      message: `Vision provider failed: ${err.message}. Photos kept. Try Manual or retry.`,
      networkCalls,
    });
  }

  if (vision.unusable_photo) {
    return identifyResult({
      ok: false,
      path: "photo_search",
      message: vision.reason || "Photo unusable (blur, hair, or glare). Rescan and try again. Photos kept.",
      networkCalls,
    });
  }

  const qty = input.quantity ?? 1;
  /** @type {import('./gate.js').IdentifyCandidate[]} */
  const candidates = [];

  if (vision.product_name || vision.collector_number) {
    candidates.push(
      normalizeIdentity(
        {
          product_name: vision.product_name,
          collector_number: vision.collector_number,
          set_name: vision.set_name,
          set_code: vision.set_code,
          game: vision.game,
          rarity: vision.rarity,
          finish: vision.finish,
          language: vision.language || "English",
          condition: vision.condition || "NM",
          confidence: vision.confidence === "high" ? "high" : "low",
          source: "anthropic_vision",
        },
        qty,
      ),
    );
  }

  for (const c of vision.candidates || []) {
    candidates.push(normalizeIdentity({ ...c, source: "anthropic_vision_candidate" }, qty));
  }

  const searchQuery =
    vision.search_query ||
    [vision.product_name, vision.collector_number, vision.set_name].filter(Boolean).join(" ");

  if (isCardLike(vision) && (searchQuery || vision.collector_number)) {
    const catalog = await searchCatalogs({
      name: vision.product_name || undefined,
      number: vision.collector_number || undefined,
      set: vision.set_code || undefined,
      query: searchQuery,
    });
    networkCalls.push(...catalog.networkCalls);
    candidates.push(...catalog.candidates);
  } else if (searchQuery) {
    // WEAK PLACEHOLDER — Instant Answer, not a product catalog.
    // Do not treat this as a working non-card Identify path.
    const web = await searchLiveWeb(searchQuery);
    networkCalls.push(...web.networkCalls);
    for (const c of web.candidates) {
      candidates.push(
        normalizeIdentity(
          {
            ...c,
            confidence: "low",
            source: c.source || "duckduckgo_placeholder",
          },
          qty,
        ),
      );
    }
  }

  if (!candidates.length) {
    return identifyResult({
      ok: false,
      path: "photo_search",
      message: vision.reason || "No match found from photos. Use Manual. Photos kept.",
      networkCalls,
    });
  }

  candidates.sort((a, b) => {
    const score = (c) =>
      (c.confidence === "high" ? 2 : 0) +
      (c.source?.includes("pokemon") || c.source === "scryfall" || c.source === "tcgdex" ? 1 : 0) +
      (c.collector_number ? 1 : 0);
    return score(b) - score(a);
  });

  const top = candidates[0];
  const fromPlaceholder = String(top.source || "").includes("placeholder");
  const multi = candidates.length > 1 && top.confidence !== "high";

  if (fromPlaceholder || multi || top.confidence === "low") {
    return identifyResult({
      ok: false,
      path: "photo_search",
      identity: top,
      candidates: candidates.slice(0, 5),
      message: fromPlaceholder
        ? "Non-card verify is a placeholder and not proven. Pick a candidate or use Manual. Photos kept."
        : "Low confidence / multiple candidates. Pick one or use Manual. Never auto-guess finish. Photos kept.",
      networkCalls,
    });
  }

  return identifyResult({
    ok: true,
    path: "photo_search",
    identity: top,
    candidates: candidates.slice(0, 5),
    message: `Identified via photo: ${top.product_name}`,
    networkCalls,
  });
}
