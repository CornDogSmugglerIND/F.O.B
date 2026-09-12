# LISTING ENGINE — THE BACKBONE

This is the AI core of Coalition H.U.D. Everything downstream depends on it. Without a working engine:

- items cannot be identified
- titles cannot be built
- descriptions cannot be built
- channel listings cannot be correct

The engine already exists as a **specification** Sawyer runs by hand and through a separate Claude project. It is not theoretical. The rules below are locked and were paid for in real time and real money. Do not redesign them. Wire them.

---

# 1. IDENTIFY

## 1.1 Identify is NOT barcode-only

Barcode covers sealed product with a scannable UPC. That is a **minority** of what Sawyer sells. The bulk is raw TCG singles, which have no barcode at all.

An identify implementation that only reads barcodes is a failed implementation. It is also the current state of the app: the ID button fires zero network requests and spins forever.

## 1.2 The four identify paths

| Path | When it fires | What it uses |
|---|---|---|
| **Barcode / UPC** | Sealed product, ETBs, booster boxes, electronics | Camera barcode read → UPC lookup |
| **Photo + live web search** | Raw singles, most collectibles | Card art + set symbol + collector number + photos → live search |
| **Set + number match** | Card scans from the ES-580W | OCR the collector number block (e.g. `002/217`, `ASC EN`) → set database match |
| **Manual** | Anything the above miss | Sawyer types it — always available, never buried |

All four write into the same item record. They are input methods, not separate features.

## 1.3 Required inputs

Identify must accept and carry:

- **Photos** — one or many. Batch dump: a pile of photos, select ~5 for one product.
- **Front + back** — back sides are scanned deliberately ("Include back sides: On"). Back side is evidence for condition and for foil/finish type.
- **Condition** — NM is the default for singles; anything else must be explicit.
- **Quantity**
- **Category / product type** — sealed, single, used, graded slab, electronics
- **Notes** — free text Sawyer adds at intake ("big hair on scan, rescan", "dinged corner")
- **Finish/variant** — Reverse Holo, Cosmos Holo, Poke Ball pattern, Master Ball pattern, etc. This is the single most error-prone field in the whole system.

## 1.4 Required output — the gate

**Listing cannot start until identify returns all of:**

```
product_name          exact printed name, e.g. "Erika's Gloom"
collector_number      e.g. "002/217"
set_name              canonical set name
set_code              e.g. "ASC EN"
game                  Pokemon / Dragon Ball Super / One Piece / Magic / Digimon / sports / other
rarity
finish                Normal / Reverse Holo / Cosmos Holo / Illustration Rare / etc.
language              default "English", never blank
condition             default NM for singles
quantity
confidence            high / low
```

If `confidence` is low, **stop**. Do not guess. Ask Sawyer for the model/tag info.

> Locked rule: *"If unable to identify confidently, ask for model/tag info — never guess."*

## 1.5 Failure cases and what the UI must show

| Case | UI behavior |
|---|---|
| No match found | Say so plainly. Offer Manual. **Never a spinner that never resolves.** |
| Low confidence / multiple candidates | Show the candidates side by side with set symbol + number. Sawyer picks. |
| Photo unusable (blur, hair, glare) | Flag it and say rescan. This is real — a hair on the scanner produced a bad scan on 2026-09-11. |
| Network / provider down | Say which step failed. Keep the photos and the staged item. Never lose photos. |
| Provider key missing | Surface it as a setup task. Do not silently no-op. |

**Losing photos is the cardinal sin.** One of the founding reasons for this app was "don't lose photos."

## 1.6 Provider decision — ASK, DO NOT PICK

Wiring identify needs a decision on the vision/search provider and API keys. Cursor **must not** choose. Ask Sawyer one question and stop.

Context he already has: eBay Developer API keys are set up. Perplexity was the best real-time research tool he used and it was discontinued. Claude is weak at pricing specifically. Collectr requires screenshots — no external API access. TCGplayer direct fetch is blocked.

---

# 2. THE PIPELINE — 7 STEPS, NO SKIPPING

This order is non-negotiable. Skipping any step is a failure.

```
1. IDENTIFY        live search using all provided photos. Cannot ID confidently -> ask. Never guess.
2. KEYWORD RESEARCH   live. Buyer search patterns, NOT seller descriptions.
3. PRICE RESEARCH     live. Never price from memory.
4. TITLE              built from real buyer search terms.
5. DESCRIPTION        AI shopping / agentic search format.
6. ITEM SPECIFICS
7. SHIPPING           separate field.
```

**Internal pre-delivery checklist — never shown to Sawyer:**

- Live item ID search done?
- Live keyword search done?
- Live price check done?

If any answer is no, **do not write a single word of the listing yet.** Go complete that step.

When researching, run **8–15+ searches** before responding.

---

# 3. TITLE ENGINE

## 3.1 The process

Titles are built from **how buyers search**, not how sellers describe. That means live keyword research every time — what real shoppers type into the eBay search bar for this exact card or product.

Seller language ("Mint condition!", "Pack Fresh", "Rare Holo Gem") actively hurts. Buyer language (the card name, the set, the number, the finish, "NM") is what gets found.

## 3.2 Hard rules

- **80 character maximum.** eBay silently truncates past this, and it cuts finish-type strings first.
- **No exclamation point. Ever. Anywhere.**
- **Product/card name leads.** "Pokémon" / "Pokemon" is **never** in first position.
- **TCG singles always end with `NM Single`** — exact, nothing after it.
- **Sealed always ends with `New/Factory Sealed`** — same wording as the item specific. No substitutes like "Sealed" or "Factory Sealed".
- **Dash-segmented into logical blocks**, never one run-on string. The dash attaches to the last word of a block, space after: `Product Block- Condition Block`
- No abbreviations (never "POR").
- No dash between every word.
- No fluff: no "Pack Fresh", no superlatives, no filler adjectives.

## 3.3 Templates

**Variation / Pick-Your-Card:**
```
Pokemon [Set Name] - Pick Your Card [Rarity] NM
```

**Sealed:**
```
Dragon Ball Super TCG SD16 Darkness Reborn Starter Deck- New/Factory Sealed
```

**Single:**
```
[Card Name] [Number] [Set Name] [Finish]- NM Single
```

## 3.4 Good vs bad

| Bad | Why | Good |
|---|---|---|
| `Pokemon Erika's Gloom 002/217 Rare Holo Mint!!` | Pokemon leads, exclamation points, "Mint" not NM | `Erika's Gloom 002/217 ASC- NM Single` |
| `POR Charizard ex Pack Fresh Gem Mint Rare` | abbreviation, fluff, superlatives | `Charizard ex 223/197 Obsidian Flames- NM Single` |
| `DBS-Darkness-Reborn-Starter-Deck-Sealed` | dash between every word, wrong sealed wording | `Dragon Ball Super TCG SD16 Darkness Reborn Starter Deck- New/Factory Sealed` |

## 3.5 Ranking note

**"Sell Similar" preserves Cassini ranking. "Relist" resets it.** Any relist feature the app builds must default to Sell Similar.

---

# 4. DESCRIPTION ENGINE

## 4.1 Format — locked

**Plain text inside a code block. Always.**

Never a markdown table. Never chat-formatted. Descriptions built as markdown tables or chat layouts have been wrong every single time. The output must be copy-paste ready.

## 4.2 Structure — two-layer AI shopping format

```
(a) HUMAN SCAN LINE
    Card name, number, rarity, set. One line. Scannable at a glance.

(b) PROSE LINE
    One short line: finish / condition / language. Zero fluff.

(c) STRUCTURED FACTS BLOCK
    Game:
    Set:
    Rarity:
    Condition:
    Language:
    (variations: one line per card - name + number + qty)

(d) SIGN-OFF - exact, every time:
    CornDogSmuggler Coalition - Operating To Marine Corps Standards.
```

## 4.3 AI shopping discovery requirements

Buyers increasingly arrive through AI shopping agents, not keyword browsing. That changes what a description is for.

- **No marketing language. No superlatives. No filler adjectives.**
- **"Genuine", "authentic", "premium" get actively DOWNGRADED by AI agents.** They read as low-trust promotional noise.
- Structured facts beat prose. Agents parse the facts block.
- Every attribute that appears in item specifics should also appear in the facts block.
- Consistency between title, description, and item specifics is what makes an agent confident.

---

# 5. ITEM SPECIFICS

- **Pokémon TCG manufacturer is always `The Pokémon Company`.** Never Nintendo. Never The Pokémon Company International.
- **Sealed condition is always `New/Factory Sealed`** — slash required, no exceptions.
- Item specifics must agree with the title and the description facts block. Disagreement kills both search placement and agent confidence.

---

# 6. PRICING

## 6.1 Sources

- **TCG singles / sealed:** Collectr app + TCGplayer market price + eBay recently sold comps. No recent sold → check active listings.
- **Non-TCG:** eBay sold comps + multiple other sources.
- **Never price from memory.**
- **Sawyer's own real sold comps override every third-party aggregator** (Sports Card Investor, Collectr, stale search results).
- **Never fetch or cite StockX. Ever.**
- TCGplayer direct fetch is blocked — search pattern that works: `"tcgplayer" "[product name]" "$" market price [year]` through third-party articles.
- Collectr requires a screenshot; there is no external access.

## 6.2 CONFLICT — SAWYER MUST SETTLE THIS

Two different pricing rules are on record and they do not agree. **Cursor: do not pick one. Ask.**

| | Rule A | Rule B |
|---|---|---|
| Baseline | TCGplayer market price × qty × 1.30 + shipping label cost | eBay **sold comps** × 1.30 |
| Hard floor | $2.00 per card | $1.77 per card + $0.99 shipping |
| eBay Standard Envelope | $0.78 (dated 2026-07-12) | $0.74 ("use this exact figure") |

Build all of these as **config values**, never hardcoded, so whichever Sawyer picks can change in one place.

## 6.3 Settled pricing facts

- Low-cost combine base: `$4.95 × 0.90 = $4.46`
- Double Holo floor: **$3.99**, set in DH Vendor Hub, **independent of the eBay floor**. $4.99 was tested — no sales.
- Double Holo auto-pricing: **market − $0.03**, runs once per day. Confirmed working.
- **Free shipping killed sales when tested.** Low card price + separate shipping charge is the proven model. Trust Sawyer's tested numbers over influencer advice.
- Promoted Listings: 5% dynamic rate (eBay's floor for dynamic). Ad rate multiplier 0% — the cap binds, the multiplier is inert at 5%. For electronics / high-value, consider ~1.5–2% since ad spend scales with price.
- Fee model for margin math: **13.25% FVF + $0.30/order + 5% Promoted + $0.78 eSE ≈ 71% realization.**

## 6.4 Inventory strategy rules the engine should respect

- Cycle position logic over hype.
- Block underwater SKUs.
- Never flood his own listings.
- Patient capital.
- Sunday: Collectr export → Mon–Fri listing schedule.

---

# 7. LISTING TYPES — SEPARATE RULES EACH

## 7.1 Regular eBay listing

Standard 7-step pipeline. Title ≤ 80 char. Description in the two-layer format. Item specifics complete. Shipping as a separate field.

## 7.2 eBay variation listing (Pick Your Card)

- Title template: `Pokemon [Set Name] - Pick Your Card [Rarity] NM`
- Consolidates sales history — this is the main reason to use it.
- Description facts block carries **one line per card: name + number + qty**.
- **CSV handling is fragile.** Parent rows contain semicolon-separated child values. When reading an export: **drop parent rows, use child rows only.**
- **Variation parent rows get no StartPrice.**

## 7.3 eBay File Exchange CSV — exact format

- Encoding: **BOM (`utf-8-sig`)**
- **The Info metadata line in row 1 must be preserved.**
- **QUOTE_ALL**
- Variation parent rows: no StartPrice

Getting any of these wrong rejects the whole file.

## 7.4 Double Holo — how it differs from eBay

Double Holo is a vendor hub with its own CSV import. It is **not** an eBay clone.

**Required columns, in this order:**
```
Card Name | Number | Set | Condition | Quantity | SKU | Variation | Graded | Grade | Grading Company | Language
```

**Critical quirks:**

- **Number format:** no leading zeros, no `/total` suffix. `86` not `086/086`. Promos keep their prefix: `SWSH249`.
- **The Variation column is IGNORED on import.** Finish type must be embedded in the card name using **square brackets, not parentheses**:
  - `Jolteon [Reverse Holo]`
  - `Flareon [Cosmos Holo]`
- **Language: always populate.** Default `English`. Never leave blank even though it is marked optional. This is Sawyer's standing requirement.
- **Market Price column is ignored on import.**
- SKU recommended.
- **Double Holo set names differ from TCGplayer naming.** Always cross-reference Double Holo's own export — never assume TCGplayer naming transfers.
- Floor $3.99, auto-pricing market − $0.03 once daily.

## 7.5 Other channels

| Channel | Role | Notes |
|---|---|---|
| **eBay** | Primary | Top Rated Seller. ~794 listings. |
| **Double Holo** | Live and proven | 3 sales / 10 cards in first week. |
| **Shopify** | Exists | `corndogsmuggler-coalition-2.myshopify.com`, domain `corndogsmugglercoalition.com`. **Long-term plan: Shopify becomes source of truth and pushes to eBay, reversing today's flow.** Not yet. |
| **Facebook Marketplace** | Active | |
| **Courtyard.io** | Graded slabs only | |
| **CollX** | Bulk commons | |
| **Square** | POS | TCGAutomate pushes to it, one-directional |
| **Misprint** | Named, not specified | **Command has no API base URL or auth shape for Misprint. Do not invent one. Ask Sawyer.** |

## 7.6 Bridge tools (temporary, not permanent architecture)

- **TCGAutomate** — $40/mo, re-subscribed. Bulk listing, eBay sync, Square push. **Explicitly a bridge until Coalition H.U.D is 100% operational.** Do not design around it permanently.
- **Shiny Pro** — inventory of sealed product.
- **Collectr** — price research, screenshot only.

---

# 8. INTAKE → LISTING FLOW

## 8.1 Device roles

| | Scouter (phone) | Command Core (desktop) |
|---|---|---|
| Purpose | Intake only | Everything after intake |
| Does it list? | **No** | Yes |
| Actions | Camera, barcode, photo dump, quick front+back, notes, qty, category | Identify review, keyword + price research, title, description, item specifics, shipping, channel push |

Sawyer uses Scouter when he is standing at the pile. The rest happens at the desk.

## 8.2 Scouter modes — one surface, three doors

| Mode | Use |
|---|---|
| **Single** | One item, quick front + back |
| **Batch** | Resale-OS style: dump a pile of photos → select ~5 → that is one item → next |
| **Import** | CSV / TCGAutomate / Epson ES-580W scan batches |

CSV and TCGAutomate are a **mode inside Scouter**, not a separate surface. Same step, different input device.

## 8.3 The line — seven states

```
Intake -> Staged -> Listed -> Sold -> Packed -> Shipped -> Delivered
```

An item has **exactly one** state. The spine is fixed left-to-right and never reflows.

**Staged vs Listed:**

- An item is **Staged** when it has photos + a confident identity + qty + category. That is the boundary. Scouter's job ends there.
- An item becomes **Listed** only after the full 7-step pipeline has run and it is live on at least one channel.
- Scouter writes `Staged`. **Scouter does not ask which bin.**

## 8.4 Where everything else sits

- **Spaces / bins** — its own tree, **not** children of the spine. An item has two coordinates at the same time: lifecycle position and physical location. Parenting bins to the spine forces every item onto the graph twice, which is exactly what collapsed the Base44 constellation into an unclickable molecule. See `BASE44-TRUTH.md`.
- **Channels** — downstream of Listed. Reflects HUD state, never the source of it.
- **Shipping** — downstream of Sold. Dropoff → scan → in transit → doorstep, on a constellation-style path.
- **Constellation** — the view over the spine, not a separate data model.

## 8.5 Source of truth

**The H.U.D is canonical for inventory.** eBay, Double Holo, Shopify, Misprint and Square are channels that *reflect* HUD state. They are never the source.

## 8.6 Physical scan path — verified ground truth

Epson ES-580W, TCG custom size 5.00" × 5.00", `TCG-CARDS` preset.

**Verified settings (already correct on his machine as of 2026-08-21):** ADF, Double-Sided, Auto Detect size, Image Type **Color**, 600 dpi, Rotate **0°**, Skip Blank Pages **Off**, Detect Double Feed **Off**, Image Option None, Brightness 0, Contrast 0, Gamma 2.2, Unsharp Mask Off, Descreening Off, Edge Fill None, JPEG.

Reasons those four were changed: Auto image type flips cards to grayscale mid-batch · Auto rotate spins cards off text orientation · Skip Blank Pages deletes dark card sides · Detect Double Feed false-jams on thick cards.

**Where files actually land:**

```
~/Library/Mobile Documents/com~apple~CloudDocs/Coalition H.U.D/
  1.INTAKE/          <- intended intake
  Batches/  Brand Photos/  Double Holo/  Images - Unsorted/
  Inventory/  Shiny pro/  Sold Items/  ebay/
```

**Known trap:** ScanSmart creates a **new batch folder at the Coalition H.U.D root each time**, a sibling of `1.INTAKE` — not inside it. Any watcher pointed at `1.INTAKE` sees nothing, forever. Fix ScanSmart's save location to one fixed folder before building any watcher.

**Second trap:** a JPEG in iCloud Drive never becomes a Photos album item. They are separate Apple containers and nothing Apple ships bridges them. Files reaching his phone is iCloud Drive sync, not an automation.

**Also on record:** ES-580W has **no "Background Color" setting** on this model — verified absent. The black-background workaround is Advanced Settings → Edge Fill, which fills inward and eats the card border on an auto-cropped scan. Thin fill only, or post-process.

## 8.7 Packaging and shipping facts

- **Scotch Blue Flex & Seal** is the primary wrap. No boxes for most items.
- **Flex & Seal rule:** adds exactly 1 inch to each of the **two sealed ends only**. Width and depth unchanged. Weight add ~0.2 oz. **Never add to all sides.**
- **eBay Standard Envelope:** raw singles, max $20 item value, 0.25" thickness limit.
- **FedEx Ground Economy** (dropped at Walgreens) for heavier / higher value. Sawyer uses FedEx exclusively for tracked shipments, never USPS.
- Residential surcharge: $6.50/pkg on FedEx/UPS, not USPS.

---

# 9. WHAT CURSOR WIRES NOW VS LATER

**Now:**
1. Identify — real, multi-path, with the output gate and honest failure states
2. The item record and the seven states
3. Inventory surface reading that record

**Later, in order:** title engine → description engine → item specifics → channels (eBay first) → Spaces → Shipping → Portfolio.

Full ordering in `design/CURSOR-BUILD-ORDER.md`.

---

# 10. STANDING PRINCIPLE

> Guessing on specs, wording, or platform behavior costs real time and real money. Verify everything live.

That applies to Cursor exactly as much as it applies to the engine.
