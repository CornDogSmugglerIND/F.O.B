/**
 * Path 2 — set + collector number / name catalog match.
 * Free public catalogs only (no Sawyer keys required).
 * design/LISTING-ENGINE.md §1.2; Command #55 Path 2.
 */

import { normalizeIdentity } from "./gate.js";

const POKE_API = "https://api.pokemontcg.io/v2/cards";
const SCRYFALL = "https://api.scryfall.com/cards/named";
const TCGDEX = "https://api.tcgdex.net/v2/en/cards";

/**
 * @param {string} url
 * @param {object} [opts]
 */
async function getJson(url, opts = {}) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...(opts.headers || {}) },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** @param {object} card */
function fromPokemonTcg(card) {
  const rarity = String(card.rarity || "").toLowerCase();
  const finish = rarity.includes("reverse")
    ? "Reverse Holo"
    : rarity.includes("holo")
      ? "Holo"
      : "Normal";
  return normalizeIdentity({
    product_name: card.name || null,
    collector_number: card.number || null,
    set_name: card.set?.name || null,
    set_code: card.set?.id || card.set?.ptcgoCode || null,
    game: "Pokemon",
    rarity: card.rarity || null,
    finish,
    language: "English",
    condition: "NM",
    confidence: card.name && card.number && card.set?.name ? "high" : "low",
    image: card.images?.small || card.images?.large || null,
    source: "pokemontcg.io",
  });
}

/** @param {object} card */
function fromScryfall(card) {
  return normalizeIdentity({
    product_name: card.name || null,
    collector_number: card.collector_number || null,
    set_name: card.set_name || null,
    set_code: card.set || null,
    game: "Magic",
    rarity: card.rarity || null,
    finish: card.foil ? "Foil" : "Normal",
    language: card.lang === "en" ? "English" : card.lang || "English",
    condition: "NM",
    confidence: card.name && card.set_name ? "high" : "low",
    image: card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || null,
    source: "scryfall",
  });
}

/** @param {object} card */
function fromTcgdex(card) {
  return normalizeIdentity({
    product_name: card.name || null,
    collector_number: card.localId || null,
    set_name: card.set?.name || null,
    set_code: card.set?.id || null,
    game: "Pokemon",
    rarity: card.rarity || null,
    finish: "Normal",
    language: "English",
    condition: "NM",
    confidence: card.name && card.localId ? "high" : "low",
    image: card.image ? `${card.image}/low.webp` : null,
    source: "tcgdex",
  });
}

/**
 * @param {{ name?: string, number?: string, set?: string, query?: string }} input
 * @returns {Promise<{ candidates: import('./gate.js').IdentifyCandidate[], networkCalls: string[] }>}
 */
export async function searchCatalogs(input = {}) {
  const networkCalls = [];
  const candidates = [];
  const name = String(input.name || "").trim();
  const number = String(input.number || "").trim();
  const set = String(input.set || "").trim();
  const setName = String(input.setName || "").trim();
  const query = String(input.query || "").trim();
  const numHead = number.split("/")[0].trim();
  const nk = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  /* exact hit first: set name + number straight from TCGdex (it has every new set) */
  if (setName && numHead) {
    try {
      const sets = await getJson(`https://api.tcgdex.net/v2/en/sets?name=${encodeURIComponent(setName)}`);
      const ranked = (Array.isArray(sets) ? sets : []).sort((a, b) => (nk(b.name) === nk(setName)) - (nk(a.name) === nk(setName))).slice(0, 3);
      const forms = [...new Set([numHead, numHead.replace(/^0+(?=\d)/, ""), numHead.replace(/^(\d+)$/, (m) => m.padStart(3, "0"))])];
      outer: for (const st of ranked) {
        for (const f of forms) {
          const url = `${TCGDEX}/${encodeURIComponent(st.id)}-${encodeURIComponent(f)}`; networkCalls.push(url);
          const card = await getJson(url).catch(() => null);
          if (card?.name && (!name || nk(card.name).includes(nk(name).split(" ")[0]))) {
            candidates.push(normalizeIdentity({ product_name: card.name, collector_number: number.includes("/") ? number : card.localId, set_name: card.set?.name || st.name, set_code: st.id, game: "Pokemon", rarity: card.rarity || null, finish: null, language: "English", condition: "NM", confidence: "high", image: card.image ? `${card.image}/low.webp` : null, source: "tcgdex" }));
            break outer;
          }
        }
      }
    } catch { /* next catalog */ }
  }

  if (number || name || query) {
    const parts = [];
    if (name) parts.push(`name:"${name.replace(/"/g, "")}"`);
    if (number) parts.push(`number:"${number.replace(/"/g, "")}"`);
    if (number) parts[parts.length - 1] = `number:"${numHead.replace(/^0+(?=\d)/, "").replace(/"/g, "")}"`;
    if (!parts.length && query) parts.push(`name:"${query.replace(/"/g, "")}"`);
    const q = encodeURIComponent(parts.join(" "));
    const url = `${POKE_API}?q=${q}&pageSize=5`;
    networkCalls.push(url);
    try {
      const data = await getJson(url);
      const all = data?.data || [];
      const inSet = setName ? all.filter((c) => nk(c.set?.name) === nk(setName)) : all;
      for (const card of inSet.length ? inSet : all) candidates.push(fromPokemonTcg(card));
    } catch {
      // next catalog
    }
  }

  if (name || query) {
    const fuzzy = encodeURIComponent(name || query);
    const url = `${SCRYFALL}?fuzzy=${fuzzy}`;
    networkCalls.push(url);
    try {
      const card = await getJson(url);
      if (card?.name) candidates.push(fromScryfall(card));
    } catch {
      // next
    }
  }

  if (!numHead && (name || query)) {
    const term = encodeURIComponent(name || query);
    const url = `${TCGDEX}?name=${term}`;
    networkCalls.push(url);
    try {
      const data = await getJson(url);
      const list = Array.isArray(data) ? data.slice(0, 5) : [];
      for (const card of list) candidates.push({ ...fromTcgdex(card), confidence: "low" });
    } catch {
      // done
    }
  }

  return { candidates, networkCalls };
}
