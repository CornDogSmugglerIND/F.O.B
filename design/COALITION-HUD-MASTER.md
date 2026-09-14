# COALITION H.U.D — MASTER SPEC

Compiled 2026-09-14 from every saved record of this build: the Command project docs, the
persistent memory files from months of sessions, and the design docs in this repo.

**This file supersedes every prior summary.** When anything disagrees with this, this wins.

---

## 1. WHAT IT IS

Coalition H.U.D is Sawyer's **entire eBay workflow in a heads-up display** — from sifting a
pile of cards, toys, electronics or sealed product, all the way to the package arriving at
the customer's doorstep.

It replaces roughly **17 separate softwares and sites** with one.

It is **not** a scan-identify-list tool. That is one feature inside it. This reduction has
happened repeatedly across builds and is the single most frequent failure of this project.

Two things drive the whole build:

1. **Never lose photos.** At any stage, for any reason.
2. **He can see the whole line move.** That is what "heads-up display" means here.

---

## 2. VOCABULARY — his words vs. invented words

This section exists because invented names keep getting shipped back to him as if they were
his. **If a name is not in the left column, it is not approved.**

### Confirmed his

| Word | Meaning |
|---|---|
| Coalition H.U.D | the app |
| Scouter | the tab he uses on his phone |
| Spaces | the bins / storage view |
| Channels | eBay, Double Holo, Misprint, Shopify |
| Constellation | the glowing line items travel along |
| Intake | getting items into the system |
| Staged | captured but not yet listed |
| Bin | a physical container, mirrored digitally |

### Invented — never approved, do not use

| Word | Where it came from | Status |
|---|---|---|
| **Rail** | appeared in the Base44 build; propagated into F.O.B | REMOVED from live app 2026-09-14 |
| **Spine** | appeared in a Cursor PR title 2026-09-11, then got copied into notes as if it were his | **REMOVE — he has never used this word** |

### Banned UI language (his rule)

deploy · archive · purge · supply · rail

Use instead: Add · Saved · Delete · Stock · Staged

Plain English everywhere. **This is a reseller tool, not a collection manager** — that
framing matters to him and shows up in word choice.

---

## 3. THE SURFACES

### Scouter — the phone tab

- A **tab inside Coalition H.U.D**, not a separate app. It is what he opens when he's on
  his phone.
- Like the Square or Shopify handheld: take or dump in photos, run identification, see all
  items, sift inventory, stage it.
- **Scouter does not list.** It gets product and inventory in. The rest of the pipeline
  happens on desktop.
- Intake tools: camera, barcode, photo dump per item.
- Wants a ResaleOS-style photo dump: drop a pile of photos, select ~5 for one product, add
  that item. Plus quick front+back for a single item.
- Cards take a different path: CSV dump and/or the TCGAutomate route, or Scouter. Folder
  automation already exists (photos hit a folder → collage made).

### Spaces — the bins

- Built on **real photos of his real bins**, not icons.
- Physical nesting mirrored digitally:
  outer ~$18 Walmart 3-tier collapsible tote with flip-down lid
  → pull-out fridge bins on tracks
  → Connect Kinetic nested holders (big → 2 medium → smaller pairs)
  → cards / Goat mini team bags
- Click an outer space → it zooms forward / the lid flips → fridge bins → deeper to cards
  in holders. Floating interactive bins that expand slightly on hover.
- **Listed bins and staged bins are different things.** Bin 1 / Bin 2 are eBay-LISTED bins;
  items coming out of Scouter do not land there immediately.
- Needs unlisted/staged bins early; listed storage bins later (eBay listed, Double Holo
  listed, multi-platform, scanned vs not). Bin numbering not finalized.

### The constellation — items moving

- Sparked by a **simple glowing line with arrows, roadmap style.** Products move down the
  line stage by stage until listed, then file into their proper bins.
- Base44 kept collapsing this into an unclickable molecule — items held two coordinates at
  once. **That version failed.** Structured constellation, never molecule chaos.
- Base44's constellation view is also broken by infinite zoom-in with no way back out.
- Listing page: items float on the constellation; click = **half-zoom info card**, not
  full-screen. Deeper is optional.

### Channels

eBay (live) · Double Holo · Misprint · Shopify

Long-term: Shopify becomes source of truth and pushes to eBay, reversing today's flow.

### Shipping

Same constellation treatment: **dropoff → scan → in transit → doorstep.**

### Listing engine

The AI core. Identify, titles, descriptions, item specifics, pricing, templates. This is
the part that replaces TCGAutomate. Full rules in §5.

---

## 4. VISUAL SYSTEM

### References he gave

- Halo TV series helmet HUD
- Star Wars Republic Commando diegetic inventory interface
- Dead Space holographic inventory (float + sound)
- DBZ Scouter for the mobile handheld
- His eBay store's metal / dark teal aesthetic

He communicates design through references like these and expects them **synthesized into a
coherent direction**, not applied literally.

### What he wants it to feel like

Glossy, premium, seamless, floaty, interactive, organized. Not a basic scroll webpage. Not
so loose he can't navigate. **Always a clear way to back out of any space or tab.**

"Apple-quality" refinement: mostly black, one restrained accent, clean typography.
Not neon, not rainbow, not cramped.

### Hard rules

- **Banned:** `#F5C518`, school-bus / Crayola yellow, gold-on-black form chrome, gold
  buttons, gold gradients. Rejected three times.
- **Banned:** green as a primary or accent. Bright/neon green especially — *"it hurts my
  eyes."* Green-black has failed in past builds.
- Accent: restrained amber `#F2A03D` on near-black `#07080A`. Panels `#0E1113`.
  Raised `#151A1D`.
- Accent covers **under 10% of screen area** — hairlines, one active state, small glyphs.
  Never large fills.
- Dark teal `#2E6B6E` is structural only — connectors, inactive nodes. Not a second accent.
- Type: **Orbitron** for chrome only (uppercase, letterspaced, ≤3 words).
  **Rajdhani** for everything else. Orbitron inside a sentence reads amateur.
- Materials: 1px hairline + `backdrop-filter: blur(14px)`; glow via `box-shadow` at 8–12%
  opacity, never text-shadow bloom; 2–3% noise overlay.
- Motion: 180–240ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`. Nothing snaps.
- Avoid the desaturated "blue colored pencil" look.
- He once mentioned a Mighty Morphin Green Ranger metallic green + gold lean but is **not**
  dead-set on color — character and premium feel matter more.

### How he gives feedback

Corrections come mid-build when direction has drifted. He is direct about what's wrong and
expects a **full reset on that aspect**, not incremental patching. Incremental tweaks
without addressing the fundamental direction frustrate him.

**Bar: his taste is level 100. Base44 hit ~50. The reskins landed below that.**

---

## 5. LISTING ENGINE — the locked rules

### Identify

**Photo-first. Photos in → identity out.** That is the feature.

**Barcode scanning is a separate feature with its own button.** Not the front door, not step
one, not a fallback that counts as shipping Identify. Every build that treated barcode as
the way in is why Identify never worked.

He sells toys, electronics, sealed product and movies too — a TCG-catalog-only identifier is
equally wrong.

Low confidence → pick list, never a silent guess. Manual entry always available.

### Pipeline order — non-negotiable, no exceptions

1. Identify the item via live search using all provided photos. Cannot identify confidently
   → ask for model/tag info. **Never guess.**
2. Live keyword research — buyer search patterns, not seller descriptions
3. Live price research
4. Build title from real buyer search terms
5. Description — AI shopping / agentic search format
6. Item specifics
7. Shipping (separate field)

Skipping any step is a failure. Before delivering any listing, internally verify all three
live searches ran. If any is no, stop and complete it first. This checklist is internal and
never shown to him.

### Pricing

- TCG singles/sealed: Collectr app + TCGplayer market price + eBay recently sold comps.
  No recent sold → check active listings.
- Non-TCG: eBay sold comps plus multiple other sources.
- **Never price from memory.**
- TCG singles formula: TCGplayer market × quantity × 1.30 + shipping label cost = list price
- Hard floor **$2.00 per card**, no exceptions
- eBay Standard Envelope: $0.78 (as of 2026-07-12)
- Low-cost combine base: $4.95 × 0.90 = $4.46
- Double Holo auto-pricing: market − $0.03, $0.25 floor; floor reverting to $3.99
  (tested $4.99, no sales). eBay and DH floors are independent.

### Titles

- Card/product name always leads. **"Pokémon"/"Pokemon" never in first position.**
- TCG singles always end with `NM Single` — exact, nothing after
- Variation template: `Pokémon [Set Name] - Pick Your Card [Rarity] NM`
- **No exclamation point, ever, anywhere**
- 80 character max
- No abbreviations (no "POR"), no dashes between every word, no "Pack Fresh" or fluff
- Dash-segmented into logical blocks, never one run-on string. Dash attaches to the last
  word of a block, space after: `Product Block- Condition Block`
- Sealed always ends `New/Factory Sealed` — same wording as the item specific, no
  substitutes like "Sealed"
- Correct structure:
  `Dragon Ball Super TCG SD16 Darkness Reborn Starter Deck- New/Factory Sealed`

### Descriptions

- Always plain text inside a code block. Never a markdown table, never chat-formatted.
- Two-layer AI shopping format:
  (a) short human scan line — card name, number, rarity, set
  (b) short prose line — finish / condition / language, zero fluff
  (c) structured facts block — Game, Set, Rarity, Condition, Language, plus per-card lines
      (name + number + qty) for variations
- No marketing language, no superlatives, no filler adjectives. "genuine / authentic /
  premium" get downgraded by AI shopping agents.
- Always ends with:
  `CornDogSmuggler Coalition — Operating To Marine Corps Standards.`

### Item specifics

- Pokémon TCG manufacturer is always **"The Pokémon Company"** — never Nintendo, never
  The Pokémon Company International
- Sealed condition is always **"New/Factory Sealed"** — slash required, no exceptions

---

## 6. THE SCAN PIPELINE — verified ground truth

Read directly off `sawyers-mini`. Trust this over any skill file.

- Root: `~/Library/Mobile Documents/com~apple~CloudDocs/Coalition H.U.D/`
- Intake: `Coalition H.U.D/1.INTAKE/Live Scans/`
- Contents of `Coalition H.U.D/`: `1.INTAKE`, `Batches`, `Brand Photos`, `Double Holo`,
  `Images - Unsorted`, `Inventory`, `Shiny pro`, `Sold Items`, `ebay`
- Photos destination:
  `Photos → folder "Seller H.U.B" → subfolder "Intake Engine " (trailing space is real)
   → album "ES-580W Live Scans"`
  Match on `contains "ES-580W"` — never hardcode, the trailing spaces will bite.
- **A JPEG in iCloud Drive never becomes a Photos album item.** Two separate Apple
  containers. Something must explicitly import.
- Scanner: Epson ES-580W, **ScanSmart only** — never Epson Scan 2 (it dumps to Documents
  where he can't see scans live).
- Epson writes JPEGs with **no ICC profile** — untagged renders flat and desaturated on
  eBay. No driver slider fixes this; it has to be added after the fact.
- Sheetfed ADF physics: the scan starts at the leading edge, so extra page length lands at
  the bottom. Even borders are impossible in-scanner.
- Local automation now running: autofix (deskew, trim, border, ICC, saturation) + collage
  builder, both as launchd agents. `tidy_loose()` is **disabled** — he sorts folders by hand
  and does not want cross-set collages.

---

## 7. WHAT IS ACTUALLY BUILT — as of 2026-09-14

### Live at f-o-b.vercel.app

- Scouter intake: capture, photo dump, add from gallery — **works**
- Identify: photo-first, fires a real request, honest failure message — **works as of PR #66**
- Barcode: separate control — **present**
- Staged tab — present (this was "Rail" until today)

### Not built

- Spaces — not built
- Constellation / items moving down the line — not built
- Channels beyond eBay — stubs only
- Shipping view — not built
- Inventory — near-blank page

### Known-good infrastructure

- Repo: `CornDogSmugglerIND/F.O.B` → f-o-b.vercel.app
- `ANTHROPIC_API_KEY` set in Vercel (note: a Claude Code CLI token was pasted first by
  mistake and later replaced — if Identify 401s, that's why)
- Cursor bridge: `cursor-bridge.vercel.app` — lets Command launch and steer Cursor agents
  directly. Verified working 2026-09-14.
- Composio: GitHub read/write works. Cursor toolkit is **read-only** — that gap is what the
  bridge exists to fill.

---

## 8. BUSINESS CONTEXT THAT SHAPES PRIORITY

- **TCGAutomate Pro is $40/month** and locks inventory sync behind the top tier. He has
  never hit the scan limit. He re-subscribed as a bridge tool only, until Coalition H.U.D is
  100% operational. Killing that bill is real money, but it is the *motivation*, not the
  scope.
- eBay: Top Rated Seller, ~794 listings, 5% promoted.
- Double Holo: live and proven — 3 sales / 10 cards in the first week.
- 48-hour rule, active: any new inventory must be planned and live-listed within 48 hours.
- Backlog: ~$2,000 of sealed product in Shiny Pro needs listing across eBay, Double Holo,
  and Facebook Marketplace.
- Living in a heated shop, not his own space, limited organization — **grab-and-go workflow
  matters right now.**
- Base44 credits are gone. That is why this moved to F.O.B.

---

## 9. HOW TO WORK WITH HIM

- He has ADHD. Structure and low-friction workflows are not a preference, they're a
  requirement. Vertically scannable, single column, most important thing first.
- **Never send him recaps, file lists, test counts, commit IDs, or option menus.** Only a
  numbered list of what he clicks or types — or "nothing for you to do."
- **Never ask him for a credential** unless the thing he asked for is blocked on it right
  now. "Might need it later" is not blocked.
- **Verify before claiming done.** Click it in a running build. If you didn't verify, say so
  explicitly. A passing unit test is not verification.
- **Never ship a reskin as a fix.** Three palettes have been shipped over a non-functional
  app. Behavior outranks visuals.
- Browser: **Opera GX only. Never open Chrome.** He has said this ~30 times.
- He does not read code or diffs. He reads the app.

---

## 10. OPEN — only he can answer

1. Bin numbering scheme for Spaces
2. Reference photos of his actual bins — Command cannot see these, he has to supply them
3. Base44 hex values / design tokens — not recoverable from here
4. Exact tab labels from the good Base44 build
5. Pricing for non-TCG is unsolved in his view; Perplexity was better but was discontinued
6. Where the eBay Dev keys live (best lead: the Base44 secrets panel,
   app ID `6a45d0cea37e6615c8e0de67`)

---

## NAMED INSPIRATIONS

ResaleOS · TCGAutomate · Shopify · eBay · Double Holo · Shiny Pro · Collectr · Spaces
inventory · Sortly · Square inventory app · iPhone widgets & Photos albums · Halo HUD ·
Dead Space inventory · DBZ Scouter
