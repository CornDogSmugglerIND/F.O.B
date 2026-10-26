/**
 * Market value for a title = median of the cheapest-to-mid ACTIVE eBay listings
 * (Browse API, read-only). Honest label: "active listings", not sold comps.
 * Returns { ok:false } when eBay isn't connected or nothing matches.
 */
import { ebayApiBase } from "./channels/ebay.js";
import { ebayConnectEnv } from "./channels/ebayConnect.js";

// Browse is public data: it needs an APPLICATION token (client credentials), not the seller token.
let appTok = null, appExp = 0;
async function appToken(fetchImpl = fetch) {
  if (appTok && Date.now() < appExp - 60_000) return appTok;
  const { clientId, clientSecret } = ebayConnectEnv();
  if (!clientId || !clientSecret) throw new Error("eBay keys not set");
  const res = await fetchImpl(`${ebayApiBase()}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`eBay app token failed (${res.status})`);
  appTok = data.access_token; appExp = Date.now() + (Number(data.expires_in) || 7200) * 1000;
  return appTok;
}
async function browseRequest(path, fetchImpl = fetch) {
  const res = await fetchImpl(`${ebayApiBase()}${path}`, { headers: { Authorization: `Bearer ${await appToken(fetchImpl)}`, Accept: "application/json", "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" } });
  if (!res.ok) throw new Error(`eBay Browse failed (${res.status})`);
  return res.json();
}

export function medianPrice(prices) {
  const p = prices.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!p.length) return null;
  // trim the top 20% (graded outliers / reprint hype) when there are enough comps
  const cut = p.length >= 6 ? p.slice(0, Math.ceil(p.length * 0.8)) : p;
  const m = Math.floor(cut.length / 2);
  const v = cut.length % 2 ? cut[m] : (cut[m - 1] + cut[m]) / 2;
  return Math.round(v * 100) / 100;
}

export async function activeComps(query, { request = browseRequest } = {}) {
  const q = String(query || "").trim().slice(0, 120);
  if (q.length < 3) return { ok: false, reason: "query too short" };
  try {
    const data = await request(`/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=40&filter=buyingOptions:%7BFIXED_PRICE%7D,conditions:%7BNEW%7CUSED%7D`);
    const prices = (data?.itemSummaries || []).map((i) => Number(i?.price?.value));
    const value = medianPrice(prices);
    if (value == null) return { ok: false, reason: "no matching listings" };
    return { ok: true, value, count: prices.filter((n) => n > 0).length, basis: "active eBay listings", query: q };
  } catch (err) {
    return { ok: false, reason: err?.message ? String(err.message).slice(0, 160) : "eBay lookup failed" };
  }
}

/* ---------- real market value: TCGplayer market first, then cleaned-up eBay ---------- */
const TCGDEX = "https://api.tcgdex.net/v2/en";
const POKE = "https://api.pokemontcg.io/v2/cards";
const SCRY = "https://api.scryfall.com/cards";
async function getJ(url, fetchImpl = fetch, ms = 9000) {
  const r = await fetchImpl(url, { headers: { Accept: "application/json", "User-Agent": "CoalitionFOB/1.0" }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
/** "046/128" -> ["046","46"]; "TG05" -> ["TG05"] */
export function numberForms(n) {
  const head = String(n || "").split("/")[0].trim(); if (!head) return [];
  const out = new Set([head]); const m = head.match(/^([A-Za-z]*)0*(\d+)([A-Za-z]*)$/);
  if (m) { out.add(m[1] + m[2] + m[3]); out.add(m[1] + m[2].padStart(3, "0") + m[3]); }
  return [...out];
}
/** pick the TCGplayer price row that matches the finish */
export function pickTcgPrice(prices, finish) {
  if (!prices || typeof prices !== "object") return null;
  const f = norm(finish);
  const keys = Object.keys(prices).filter((k) => prices[k] && typeof prices[k] === "object");
  const want = f.includes("reverse") ? ["reverse-holofoil", "reverseHolofoil"] : f.includes("holo") || f.includes("foil") ? ["holofoil", "1st-edition-holofoil", "1stEditionHolofoil"] : ["normal", "unlimited", "1st-edition", "1stEditionNormal"];
  const order = [...want, "holofoil", "normal", "reverse-holofoil", "reverseHolofoil", ...keys];
  for (const k of order) { const row = prices[k]; const v = row && Number(row.marketPrice ?? row.market ?? row.midPrice ?? row.mid); if (Number.isFinite(v) && v > 0) return { value: Math.round(v * 100) / 100, variant: k }; }
  return null;
}
async function tcgdexPrice({ name, number, set, finish }, fetchImpl) {
  if (!number || !set) return null;
  const sets = await getJ(`${TCGDEX}/sets?name=${encodeURIComponent(set)}`, fetchImpl).catch(() => []);
  const ns = norm(set);
  const ranked = (Array.isArray(sets) ? sets : []).sort((a, b) => (norm(b.name) === ns) - (norm(a.name) === ns));
  for (const st of ranked.slice(0, 3)) {
    for (const f of numberForms(number)) {
      const card = await getJ(`${TCGDEX}/cards/${encodeURIComponent(st.id)}-${encodeURIComponent(f)}`, fetchImpl).catch(() => null);
      if (!card || !card.name) continue;
      if (name && !norm(card.name).includes(norm(name).split(" ")[0])) continue;
      const p = pickTcgPrice(card.pricing?.tcgplayer, finish);
      if (p) return { ...p, source: "TCGplayer market", card: `${card.name} ${card.localId} ${st.name}` };
      return { none: true };
    }
  }
  return null;
}
async function pokemonTcgPrice({ name, number, set, finish }, fetchImpl) {
  if (!name) return null;
  const parts = [`name:"${String(name).replace(/"/g, "")}"`]; const nf = numberForms(number)[0]; if (nf) parts.push(`number:${nf.replace(/^0+(?=\d)/, "")}`);
  const d = await getJ(`${POKE}?q=${encodeURIComponent(parts.join(" "))}&pageSize=10`, fetchImpl, 12000).catch(() => null);
  const ns = norm(set); const list = d?.data || [];
  const c = list.find((x) => ns && norm(x.set?.name) === ns) || (ns ? null : list[0]);
  const p = c && pickTcgPrice(c.tcgplayer?.prices, finish);
  return p ? { ...p, source: "TCGplayer market", card: `${c.name} ${c.number} ${c.set?.name}` } : null;
}
async function scryfallPrice({ name, set, finish }, fetchImpl) {
  if (!name) return null;
  const c = await getJ(`${SCRY}/named?fuzzy=${encodeURIComponent(name)}${set ? `&set=` : ""}`, fetchImpl).catch(() => null)
    || await getJ(`${SCRY}/named?fuzzy=${encodeURIComponent(name)}`, fetchImpl).catch(() => null);
  if (!c?.prices) return null;
  const foil = /foil|holo/i.test(finish || ""); const v = Number(foil ? c.prices.usd_foil || c.prices.usd : c.prices.usd || c.prices.usd_foil);
  return Number.isFinite(v) && v > 0 ? { value: Math.round(v * 100) / 100, source: "TCGplayer market", card: `${c.name} ${c.set_name}` } : null;
}
/** eBay active listings, cleaned: same card number + name, no slabs / lots / proxies */
const JUNK = /\b(psa|bgs|cgc|sgc|tag|ace|beckett|graded|slab|lot|lots|bundle|bulk|proxy|custom|orica|replica|metal|gold|jumbo|oversize[d]?|choose|pick|you pick|select|playset|sleeve[ds]?|binder|empty|code|digital|japanese|korean|chinese)\b|\bx\s?\d\b|\b\d+\s?x\b/i;
/* sealed product + accessories (binders, tins, ETBs): different junk, looser name match */
const JUNK_SEALED = /\b(psa|bgs|cgc|graded|slab|proxy|custom|replica|empty box|box only|code card|digital|opened|resealed)\b/i;
export function cleanComps(items, { name, number, graded } = {}) {
  const nameW = norm(name).split(" ").filter((w) => w.length > 2 && !["the", "and", "pokemon", "tcg", "card", "cards", "game"].includes(w));
  const nums = numberForms(number).map((n) => n.toLowerCase()), sealed = !nums.length;
  return (items || []).filter((i) => {
    const t = String(i?.title || ""); const tn = norm(t);
    if (!graded && (sealed ? JUNK_SEALED : JUNK).test(t)) return false;
    if (nameW.length && (sealed ? nameW.filter((w) => tn.includes(w)).length < Math.max(2, Math.ceil(nameW.length * 0.6)) : !nameW.every((w) => tn.includes(w)))) return false;
    if (nums.length && !nums.some((n) => new RegExp(`(^|[^a-z0-9])${n}([^0-9]|$)`, "i").test(t))) return false;
    return true;
  }).map((i) => Number(i?.price?.value)).filter((n) => Number.isFinite(n) && n > 0);
}
async function ebayClean(info, request) {
  const short = (t) => String(t || "").replace(/[()\[\]/,&-]+/g, " ").split(/\s+/).filter(Boolean).slice(0, 8).join(" ");
  const q = (info.number ? [info.name, numberForms(info.number)[0], info.set].filter(Boolean).join(" ") : [short(info.name), info.set].filter(Boolean).join(" ")).slice(0, 100) || String(info.q || "").slice(0, 100);
  if (q.length < 3) return null;
  const cat = info.number ? "&category_ids=183454" : "";
  const data = await request(`/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=100${cat}&filter=buyingOptions:%7BFIXED_PRICE%7D,itemLocationCountry:US`).catch(() => null);
  const prices = cleanComps(data?.itemSummaries, info);
  if (prices.length < 3) return null;
  /* asking prices run above what cards sell for: use the lower third, not the middle */
  const p = prices.sort((a, b) => a - b); const cut = p.slice(0, Math.max(3, Math.ceil(p.length * 0.5)));
  return { value: medianPrice(cut), count: prices.length, source: "eBay active (cleaned)" };
}
export async function marketValue(info = {}, { fetchImpl = fetch, request = browseRequest } = {}) {
  const i = { name: String(info.name || "").trim(), number: String(info.number || "").trim(), set: String(info.set || "").trim(), finish: String(info.finish || "").trim(), game: String(info.game || "").trim(), graded: /psa|bgs|cgc|sgc|graded/i.test(`${info.finish} ${info.name}`), q: info.q };
  const isMagic = /magic|mtg/i.test(i.game);
  let tcg = null;
  try {
    if (isMagic) tcg = await scryfallPrice(i, fetchImpl);
    else if (i.number && i.set) { tcg = await tcgdexPrice(i, fetchImpl); if (!tcg || tcg.none) tcg = (await pokemonTcgPrice(i, fetchImpl)) || null; }
  } catch { tcg = null; }
  const eb = await ebayClean(i, request).catch(() => null);
  if (tcg && tcg.value) return { ok: true, value: tcg.value, basis: tcg.source, count: 1, matched: tcg.card, variant: tcg.variant || null, ebay: eb ? eb.value : null };
  if (eb && eb.value) return { ok: true, value: eb.value, basis: eb.source, count: eb.count };
  if (i.q || i.name) { const a = await activeComps(String(i.q || i.name).replace(/[()\[\]/,&-]+/g, " ").split(/\s+/).filter(Boolean).slice(0, 8).join(" "), { request }).catch(() => null); if (a && a.ok) return { ...a, basis: "active eBay listings" }; }
  return { ok: false, reason: "no matching listings" };
}

/** eBay's own category pick for a title (sealed product, binders, figures...). null when unsure. */
export async function suggestCategory(title, { fetchImpl = fetch } = {}) {
  const q = String(title || "").replace(/[()\[\]/,&:-]+/g, " ").trim().slice(0, 100); if (q.length < 3) return null;
  try {
    const data = await browseRequest(`/commerce/taxonomy/v1/category_tree/0/get_category_suggestions?q=${encodeURIComponent(q)}`, fetchImpl);
    const c = (data?.categorySuggestions || [])[0]?.category; return c && c.categoryId ? { id: String(c.categoryId), name: c.categoryName || "" } : null;
  } catch { return null; }
}
