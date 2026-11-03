/* What a card IS, read from its saved facts first, then its listing title.
   Collection filters (game / set / rarity) and card captions use this. */
import { nameOf, gameOf, laneOf } from "./shared.js?v=177";

const CODES = { DRI: "Destined Rivals", ASC: "Ascended Heroes", PFL: "Phantasmal Flames", SFA: "Shrouded Fable", SSP: "Surging Sparks", PRE: "Prismatic Evolutions", JTG: "Journey Together", JTT: "Journey Together", TWM: "Twilight Masquerade", TEF: "Temporal Forces", PAL: "Paldea Evolved", OBF: "Obsidian Flames", SCR: "Stellar Crown", SVI: "Scarlet & Violet", MEW: "151", PAF: "Paldean Fates", PAR: "Paradox Rift", MEG: "Mega Evolution", MEP: "Mega Evolution Promo", SV4A: "Shiny Treasure ex", SV11B: "Black Bolt", SV11W: "White Flare", LTR: "Lord of the Rings", BT11: "Vermilion Bloodline", BT22: "Critical Blow", SB01: "Manga Booster 01" };
const NAMED = ["Destined Rivals", "Journey Together", "Pitch Black", "Perfect Order", "30th Celebration", "Mega Evolution", "Phantasmal Flames", "Twilight Masquerade", "Shrouded Fable", "Surging Sparks", "Prismatic Evolutions", "Paldean Fates", "Vivid Voltage", "Ancient Origins", "Black Bolt", "White Flare", "Stellar Crown", "Temporal Forces", "Obsidian Flames", "Paldea Evolved", "Paradox Rift", "Crown Zenith", "Evolving Skies", "Vermilion Bloodline", "Critical Blow", "A Fist of Divine Speed", "Championship Clash", "Crazy Planet", "Upper Deck Series 2", "Upper Deck Series 1"];
const RAR = [["Special Illustration Rare", /special illustration rare|\bSIR\b/i], ["Illustration Rare", /illustration rare|\bIR\b/i], ["Hyper Rare", /hyper rare/i], ["Ultra Rare", /ultra rare/i], ["Double Rare", /double rare/i], ["Shiny Rare", /shiny rare/i], ["Secret Rare", /secret rare|\bSCR\b|\bSPR\b/i], ["Super Rare", /\bSR\b|super rare/i], ["Promo", /promo/i], ["Rare", /\brare\b|\bR\//i], ["Uncommon", /uncommon|\bU\//i], ["Common", /\bcommon\b|\bC\//i]];

export function setOf(it) {
  if (it.setName) return String(it.setName).replace(/^(pok[eé]mon|pokemon tcg)\s*/i, "").trim();
  const t = `${nameOf(it)} ${it.groupTitle || ""}`;
  const named = NAMED.find((n) => t.toLowerCase().includes(n.toLowerCase())); if (named) return named;
  const code = (t.match(/\b(SV\d{1,2}[AB]?|BT\d{1,2}|SB\d{2}|[A-Z]{3})\b(?=[\s:-])/g) || []).map((c) => c.toUpperCase()).find((c) => CODES[c]);
  if (code) return CODES[code];
  const pyc = t.match(/^(?:pok[eé]mon|one piece)\s+(.+?)\s+-\s+pick your card/i); if (pyc) return pyc[1];
  return "";
}
export function rarityOf(it) { if (it.rarity) return String(it.rarity); const t = `${it.variant || ""} ${nameOf(it)}`; const r = RAR.find(([, re]) => re.test(t)); return r ? r[0] : ""; }
export function numOf(it) { if (it.collectorNumber) return String(it.collectorNumber); const m = `${it.variant || ""} ${nameOf(it)}`.match(/\b(\d{1,3}\/\d{1,3}|(?:BT|SB|FB|OP|ST|EB)\d{1,2}-\d{3}|#\d{1,4})\b/i); return m ? m[1].replace(/^#/, "") : ""; }
/* the card's own name: "Hippowdon - 106/182 - DRI - …" -> "Hippowdon"; pick-your-card lots say so */
export function cardName(it) {
  if (it.cardName) return it.cardName;
  if (it.variant) return String(it.variant).replace(/\s+(reverse holo|holofoil|holo|foil|normal)$/i, "").replace(/\s*-?\s*\d{1,3}\/\d{1,3}$/, "").replace(/\s*-\s*$/, "").trim() || it.variant;
  const t = nameOf(it);
  if (/pick your card/i.test(t)) return `${setOf(it) || t.replace(/\s*-\s*pick your card.*$/i, "")} · pick-your-card lot`;
  let n = t.split(/\s+-\s+/)[0].split(/\s+(?:reverse holo|holofoil|holo|foil)\b|\s+(?:SV\d{1,2}[AB]?|ME\d{0,2}|SWSH\d*):|\s+-?\s*pok[eé]mon\s+[A-Z]/i)[0];
  { const st = setOf(it); if (st) { const re = new RegExp(`^(?:[A-Z]{1,4}\\d{0,2}:\\s*)?${st.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"); n = n.replace(re, ""); } }
  n = n.replace(/\s+\d{1,3}$/, "");
  n = n.replace(/\b(\d{1,3}\/\d{1,3}|NM|Near Mint|Single|English)\b.*$/i, "").replace(/\s+(reverse holo|holofoil|holo|foil)\s*$/i, "").trim();
  if (n.length < 3) n = t;
  return n.length > 60 ? n.slice(0, 58) + "…" : n;
}
export function kindOf(it) { return /\b(PSA|BGS|CGC|SGC|TAG|Beckett)\s?(10|[1-9](\.5)?)\b/i.test(nameOf(it)) || it.gradingCompany ? "graded" : laneOf(it) === "sealed" && !/\b\d+\s*card lot\b/i.test(nameOf(it)) ? "sealed" : "singles"; }
export { gameOf };
