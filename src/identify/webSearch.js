/**
 * Non-card verify placeholder — DuckDuckGo Instant Answer.
 *
 * KNOWN WEAK SPOT (Command #60): Instant Answer is thin for toys,
 * electronics, sealed product, and movies. It will miss most of them.
 * This is a placeholder only. Do not describe non-card Identify as working
 * until it has been tried against real non-card items.
 *
 * No Sawyer key. Do not invent a paid search provider here.
 */

/**
 * @param {string} query
 * @returns {Promise<{ candidates: object[], networkCalls: string[], placeholder: true }>}
 */
export async function searchLiveWeb(query) {
  const networkCalls = [];
  const q = String(query || "").trim();
  if (!q) return { candidates: [], networkCalls, placeholder: true };

  // WEAK PLACEHOLDER — Instant Answer, not a product catalog.
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
  networkCalls.push(url);

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { candidates: [], networkCalls, placeholder: true };
    const data = await res.json();
    /** @type {object[]} */
    const candidates = [];

    const heading = String(data.Heading || "").trim();
    const abstract = String(data.AbstractText || "").trim();
    if (heading) {
      candidates.push({
        product_name: heading,
        collector_number: null,
        set_name: null,
        set_code: null,
        game: "other",
        rarity: null,
        finish: null,
        language: "English",
        condition: "NM",
        // Instant Answer is not a product hit — never treat as high confidence.
        confidence: "low",
        source: "duckduckgo_placeholder",
        image: data.Image || null,
      });
    }

    for (const topic of data.RelatedTopics || []) {
      const text = String(topic.Text || topic.Name || "").trim();
      if (!text) continue;
      const name = text.split(" - ")[0].trim();
      if (!name || name === heading) continue;
      candidates.push({
        product_name: name,
        collector_number: null,
        set_name: null,
        set_code: null,
        game: "other",
        rarity: null,
        finish: null,
        language: "English",
        condition: "NM",
        confidence: "low",
        source: "duckduckgo_placeholder",
        image: topic.Icon?.URL || null,
      });
      if (candidates.length >= 5) break;
    }

    return { candidates, networkCalls, placeholder: true };
  } catch {
    return { candidates: [], networkCalls, placeholder: true };
  }
}
