/* Shared helpers for Collection + Spaces (one source of truth for lanes, games, bins). */
export const LS_ITEMS = "coalition-items-v4";
export const LS_SPACES = "coalition-spaces-v4";
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const money = (n) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const nameOf = (it) => { const t = it.title || it.productName || ""; return !t ? "Untitled" : /^sku-\d+$/i.test(t.trim()) ? `Draft listing …${t.trim().slice(-4)}` : t; };
export const photoOf = (it) => (it.photos && it.photos[0] && (it.photos[0].dataUrl || it.photos[0].url)) || "";
const DONE = ["sold", "packed", "shipped", "delivered"];
export const onHand = (it) => !it.ended && !DONE.includes(it.phase);
const SEALED = /booster|\bbox\b|\betb\b|elite trainer|bundle|\btin\b|\bpacks?\b|sealed|\bcase\b|blister|display|collection box|starter deck|battle deck|theme deck|premium collection|build (&|and) battle|sleeved|\blot\b/i;

export const laneOf = (it) => it.lane === "sealed" || it.lane === "singles" ? it.lane : (SEALED.test(nameOf(it)) && !/\bsingle\b/i.test(nameOf(it)) ? "sealed" : "singles");
const POKE = /pok[eé]mon|pikachu|charizard|\bvmax\b|\bvstar\b|\bex\b|\bholo\b|reverse holo|\b(DRI|SFA|SSP|PRE|JTT|TWM|TEF|PAL|OBF|SCR|SVI|MEW|PAF|PAR|ME\d*|SV\d+)\b|30th celebration|pitch black|destined rivals|prismatic|surging sparks|temporal forces|twilight masquerade|stellar crown|silver tempest|lost origin|brilliant stars|evolving skies|crown zenith|mega evolution|journey together|ethan'?s adventure|\b\d{2,3}\/\d{2,3}\b/i;
const GAMES = [["Pokemon", POKE],
  ["One Piece", /one piece|luffy|\bop-?\d\d/i], ["Dragon Ball", /dragon ball|goku|gogeta|vegeta|\bdbs\b|fusion world|indomitable/i], ["Magic", /magic|\bmtg\b|commander|modern horizons/i], ["Digimon", /digimon/i],
  ["Hockey", /hockey|nhl|upper deck|parkhurst|o-pee-chee|\bopc\b|sp authentic|clear cut|\bleaf\b|young guns|\bSP\b|tipsport|certified|\bcmp-?\d|\bP-\d+/i], ["Wrestling", /\bwwf\b|\bwcw\b|nwo|wwe|aew/i],
  ["Sports cards", /nba|nfl|baseball|topps|panini|prizm|rookie|\brc\b|donruss|fleer/i], ["Yu-Gi-Oh", /yu-?gi-?oh/i], ["Lorcana", /lorcana/i]];
export function gameOf(it) {
  const t = nameOf(it);
  if (it.game) { const g = GAMES.find(([n]) => n.toLowerCase() === String(it.game).toLowerCase() || String(it.game).toLowerCase().includes(n.toLowerCase().split(" ")[0])); if (g) return g[0]; }
  // check specific non-Pokemon first so "Holo"/"ex" words in other games don't hijack them
  const order = [...GAMES.slice(1), GAMES[0]];
  const hit = order.find(([, re]) => re.test(t)); return hit ? hit[0] : "Other";
}
export function loadItems() { try { const v = JSON.parse(localStorage.getItem(LS_ITEMS) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
export function saveItems(list) { try { localStorage.setItem(LS_ITEMS, JSON.stringify(list)); return true; } catch { return false; } }
/* store-style categories, used to sort things when putting away */
const BOW = /bow|arrow|broadhead|archery|hunting|quiver|camo/i;
export function catOf(it) {
  const g = gameOf(it), sealed = laneOf(it) === "sealed", t = nameOf(it);
  if (g === "Pokemon") return sealed ? "Pokémon sealed" : "Pokémon singles";
  if (g === "Dragon Ball") return sealed ? "Dragon Ball sealed" : "Dragon Ball singles";
  if (g === "One Piece") return sealed ? "One Piece sealed" : "One Piece singles";
  if (g === "Hockey") return "Hockey cards";
  if (g === "Wrestling") return "Wrestling cards";
  if (g === "Other" && BOW.test(t)) return "Bow hunting";
  if (g === "Other") return "Other";
  return sealed ? `${g} sealed` : `${g} singles`;
}
export function loadSpaces() { try { const v = JSON.parse(localStorage.getItem(LS_SPACES) || "null"); return Array.isArray(v) ? v : []; } catch { return []; } }
export function saveSpaces(list) { try { localStorage.setItem(LS_SPACES, JSON.stringify(list)); return true; } catch { return false; } }
/** Put items into a bin (or null = unsorted), keeping item.spaceId and space.itemIds in step. */
export function assign(ids, spaceId) {
  const items = loadItems(), spaces = loadSpaces(), set = new Set(ids.map(String));
  for (const it of items) if (set.has(String(it.id))) it.spaceId = spaceId || null;
  for (const sp of spaces) { sp.itemIds = (sp.itemIds || []).filter((i) => !set.has(String(i))); if (sp.id === spaceId) sp.itemIds.push(...ids); }
  return saveItems(items) && saveSpaces(spaces);
}
export const uid = () => `sp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
