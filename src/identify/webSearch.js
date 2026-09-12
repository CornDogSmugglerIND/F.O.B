/**
 * Non-card verify — live web search (Command PR #59 `5649468890`).
 * DuckDuckGo Instant Answer API — no Sawyer key.
 */

/**
 * @param {string} query
 * @returns {Promise<{ candidates: object[], networkCalls: string[] }>}
 */
export async function searchLiveWeb(query) {
  const networkCalls = [];
  const q = String(query || "").trim();
  if (!q) return { candidates: [], networkCalls };

  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
  networkCalls.push(url);

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { candidates: [], networkCalls };
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
        confidence: abstract ? "high" : "low",
        source: "duckduckgo",
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
        source: "duckduckgo_related",
        image: topic.Icon?.URL || null,
      });
      if (candidates.length >= 5) break;
    }

    return { candidates, networkCalls };
  } catch {
    return { candidates: [], networkCalls };
  }
}
