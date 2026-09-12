# CURSOR BUILD ORDER

Ordered workstreams. **Do not freelance. Do not jump ahead. Do not start until Sawyer says go.**

Every workstream has a gate. If the gate is not met, stop and ask **one** question.

---

# RULE ZERO

**Behavior before visuals, every time.**

Three palettes have shipped over a non-functional app. A fourth will be rejected the same way. The problem was never the hue — the Scouter is a form with a dark theme, not a HUD, and nothing behind it works.

Do not touch color until workstreams 1 and 2 are functional and verified in a running build.

---

# 0. FOUNDATION — do this first, it is small

**Goal:** stop palette drift permanently.

- One **tokens module** holding every color, font, radius, blur, timing. Imported everywhere. Nothing hardcoded locally.
- One **phases module** holding the 7 lifecycle states. Single source of truth.
- This is the Base44 `visor.js` / `catalog.js` pattern and it was one of the things Base44 got right.

**Gate:** no component defines its own color value.

---

# 1. IDENTIFY — the backbone

**Goal:** a real identify path that returns a complete item record, or fails honestly.

Spec: `design/LISTING-ENGINE.md` §1.

- Four input paths: barcode, photo + live web search, set + number match, manual. **Not barcode-only.**
- Must return the full output gate (product name, collector number, set, set code, game, rarity, finish, language, condition, quantity, confidence).
- Low confidence → stop and ask. **Never guess.**
- Every failure case shows a real message. **No spinner that never resolves.**
- **Never lose photos** on any failure path.

**BLOCKING GATE:** wiring this requires a vision/search provider and API keys. **Ask Sawyer one question and stop. Do not choose a provider alone.**

Context for that question: eBay Developer API keys already exist. Perplexity was the best real-time research tool he used, now discontinued. Claude is weak at pricing specifically. Collectr is screenshot-only. TCGplayer direct fetch is blocked.

**Done means:** drop a photo, hit identify, a real response comes back, verified in a running build. If you did not verify it, say so.

---

# 2. ITEM RECORD + INVENTORY SURFACE

**Goal:** the thing identify writes into, and a screen that shows it.

- Item record carries both coordinates: lifecycle state and physical location (location nullable).
- Seven states, exactly one per item.
- Inventory renders real items. Today it is a near-blank page.
- **Listing status renders on the item card itself**, never as a separate standalone field.
- Item cards are distinct visual cards — Collectr-style portfolio view.
- Photos persist. IndexedDB with JPEG compression was the working approach.

**Gate:** an item scanned in Scouter appears in Inventory as `Staged`, with its photos, and survives a reload.

---

# 3. SCOUTER — restructure, then skin

**Goal:** the intake surface Sawyer will actually pick up his phone and use.

- **Camera-first.** The live viewport IS the screen; chrome overlays it. Not stacked form sections above a "Start intake" button.
- Three modes, one surface: **Single** · **Batch** (dump a pile → select ~5 → one item) · **Import** (CSV / TCGAutomate / ES-580W).
- Quick front + back for a single item.
- Writes `Staged`. **Does not ask which bin. Does not list.**
- Remove "Rail" and "On rail" — not his words.
- Offline capable, no Base44 dependency.
- **Now** apply the token set, hairlines, blur, noise, easing.

**Gate — all must be true:**
- [ ] Opens to a live camera viewport, not a form
- [ ] One thumb reaches every primary action
- [ ] Amber under 10% of screen area, no gold buttons, no gradients
- [ ] Zero Orbitron inside any sentence
- [ ] Every panel has a 1px hairline + backdrop blur; noise overlay present
- [ ] Nothing snaps — everything eases 180–240ms
- [ ] Obvious way to back out of every space
- [ ] Photo dump works: pile → select 5 → one item
- [ ] Zero instances of: deploy, archive, purge, supply, rail
- [ ] Does not look like a web page in a dark theme

If it does not pass in a screenshot, do not hand it to him.

---

# 4. THE SPINE / CONSTELLATION

**Goal:** the roadmap view, without the molecule failure.

- 7 fixed lifecycle nodes, left to right. **Never reflows.**
- Items float on it. Click → **half-zoom info card**, not full-screen. Deeper optional.
- **Spaces is NOT parented to this.** Separate tree, linked by reference.
- Zoom must have an obvious way back out. Base44's infinite zoom-in trap is the known failure.

**Gate:** 200+ items on the spine and it is still readable and clickable.

---

# 5. LISTING ENGINE SURFACE

**Goal:** the 7-step pipeline, wired to the locked rules.

Spec: `design/LISTING-ENGINE.md` §2–6.

- Pipeline runs in order, no skipping. Internal checklist before any copy is written.
- Title engine: 80 char, no exclamation points, product name leads, dash-segmented blocks, correct endings.
- Description engine: plain text, two-layer format, exact sign-off.
- Item specifics: manufacturer and condition rules.
- Pricing as **config values**, never hardcoded.

**BLOCKING GATE:** the pricing rules conflict — two different baselines, floors, and eSE costs are on record (`LISTING-ENGINE.md` §6.2). **Ask Sawyer which is current. Do not pick.**

---

# 6. CHANNELS

**Goal:** push out, read back.

Order: **eBay first** (live sync, photo per item, qty updates — Base44 had this working), then Double Holo, then Shopify.

- Double Holo CSV has its own column order and quirks — `LISTING-ENGINE.md` §7.4. The Variation column is ignored; finish goes in the card name in **square brackets**.
- eBay File Exchange CSV: BOM utf-8-sig, preserve row 1 Info line, QUOTE_ALL, no StartPrice on variation parents.
- Relist defaults to **Sell Similar** — it preserves Cassini ranking; Relist resets it.
- **Misprint: no API details exist. Ask before building anything for it.**

**Gate:** a Listed item's channel state matches reality without manual reconciliation.

---

# 7. SPACES

**Goal:** the physical mirror.

**BLOCKED until Sawyer supplies bin reference photos** — real photos of his real bins are the UI here, not decoration.

**Also unspecified — ask first:** drag rules (multi-select, max nest depth, unassigned pool behavior).

- Four levels: tote → fridge bins → Kinetic holders → cards/team bags
- Space types: staged/unlisted, eBay listed, Double Holo listed, multi-platform, scanned-not-listed
- Bin names **user-editable from day one**

---

# 8. SHIPPING

Dropoff → scan → in transit → doorstep, on a constellation-style path.

**Unspecified — ask first:** carrier tracking source of truth.

Known: FedEx Ground Economy (Walgreens dropoff) for tracked, eBay Standard Envelope for raw singles.

---

# 9. PORTFOLIO

Value / collection lens over Inventory. Shiny Pro and Collectr influence.

**It is a lens, not the product's identity.** This is a reseller tool, not a collection manager.

---

# 10. LATER — EXPLICITLY NOT NOW

- Sound design (Dead Space cues) — wanted, but not before identify works
- Always-visible AI chat widget on every tab
- Stale-listing analytics (90+ days)
- eBay auto-pricing rule mirroring Double Holo Vendor Hub
- CSV export with destination picker, pre-validated
- Shopify-as-source-of-truth reversal
- Auth / multi-device account model — **unspecified, ask when it comes up**

---

# THE SHORT VERSION

```
0. tokens + phases modules          small, do it first
1. IDENTIFY                         <- ASK ABOUT PROVIDER, THEN STOP
2. item record + Inventory
3. Scouter restructure, then skin
4. spine / constellation
5. listing engine                   <- ASK ABOUT PRICING CONFLICT
6. channels (eBay first)
7. Spaces                           <- BLOCKED on bin photos
8. Shipping                         <- BLOCKED on tracking source
9. Portfolio
```

Three blocking questions are marked. When you hit one: **ask Sawyer one question, stop, and wait.**
