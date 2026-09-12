# COMMAND BRAIN — COALITION H.U.D

The product model. Read `LISTING-ENGINE.md` for the backbone, `BASE44-TRUTH.md` for names and visual bar, `CURSOR-BUILD-ORDER.md` for sequence.

---

# 1. WHO AND WHAT

**Sawyer** — Menomonie, WI. Marine Corps veteran, former ironworker/welder. Runs **CornDogSmuggler Coalition**, a veteran-owned multi-channel reselling operation. eBay **Top Rated Seller**, ~794 active listings. Supplements with Spark driving. Supply chain management degree, one semester left. Has ADHD and hates walls of text.

**About-us bio (locked, do not alter):**
> "Veteran-owned, Wisconsin-based. Your F.O.B for all things TCG, DBZ, Bow Hunting, Electronics and more — built for collectors, powered by outcasts!"

**Inventory:** Pokémon, One Piece, Dragon Ball Super, Digimon, Magic, hockey/sports cards, sealed product, graded slabs, bow hunting, electronics, general collectibles.

**Goal:** six-figure eBay seller, full business automation, relocation to SLC.

---

# 2. WHAT COALITION H.U.D IS

**The entire reseller workflow, start to customer doorstep, in a heads-up display.**

It evolved from an interactive shopping idea into interactive reselling.

**Why it exists, in his words:**
- One place instead of **~17 softwares and sites**
- **Don't lose photos**
- **See the whole line move**

**It is a reseller tool, not a collection manager.** Framing matters. Portfolio is a lens on inventory, not the product's identity.

**It is replacing or competing with:** Collectr, Sortly, Vendoo, Boxes, Square POS, TCGAutomate, Shiny Pro, Resale OS.

**Inspirations he named** (feel and patterns, not clones): Resale OS, TCG Automate, Shopify, eBay, Double Holo, Shiny Pro, Collectr, Spaces inventory, Sortly, Square inventory phone app, iPhone widgets and Photos albums/folders, Halo HUD, Dead Space inventory, DBZ Scouter.

---

# 3. SURFACES

```
SCOUTER      phone intake. Does NOT list.
INVENTORY    everything owned, staged or not
LISTINGS     AI buyer-facing copy, the listing engine
CHANNELS     eBay / Double Holo / Shopify / Misprint, live state
SHIPPING     dropoff -> doorstep
SPACES       physical bins, nested
PORTFOLIO    value / collection lens
DASHBOARD    HUD home
```

Names come from `BASE44-TRUTH.md` §1. **Do not invent new ones.** "Rail" is not his word.

---

# 4. THE LINE — DATA MODEL

```
Intake -> Staged -> Listed -> Sold -> Packed -> Shipped -> Delivered
```

Seven states. An item has **exactly one**. The spine is fixed left-to-right and **never reflows**.

## Two coordinates, one item

Every item has a **lifecycle position** and a **physical location** at the same time. These are independent.

- **Spine** = the 7 lifecycle nodes. Fixed positions.
- **Spaces** = a separate nested tree. Linked to items **by reference**, never parented to the spine.
- Tapping an item anywhere opens the same **half-zoom card** showing both coordinates.

Parenting bins to the spine is what collapsed Base44 into an unclickable molecule. See `BASE44-TRUTH.md` §3.1.

## Staged vs Listed — the boundary

- **Staged** = has photos + a confident identity + qty + category. Scouter's job ends here.
- **Listed** = the full 7-step pipeline has run and it is live on at least one channel.
- Scouter writes `Staged`. **Scouter does not ask which bin.**

## Source of truth

**The H.U.D is canonical for inventory.** eBay, Double Holo, Shopify, Misprint, Square are channels that *reflect* HUD state. They are never the source.

Long-term, Shopify is planned to become source of truth and push to eBay — reversing today's flow. **Not yet. Do not build for that now.**

---

# 5. SPACES

Real photos of his real bins, separate from Scouter.

**Physical nesting to mirror digitally:**
```
Outer ~$18 Walmart 3-tier collapsible tote, flip-down front lid
  -> pull-out fridge bins on tracks
       -> Connect Kinetic nested holders (big -> 2 medium -> smaller pairs)
            -> cards / Goat mini team bags
```

**Interaction:** outer space photo → click zooms forward / lid flips → fridge bins → deeper to cards in holders. Bins float and expand slightly on hover. Connected on a tree.

**Space types needed:** staged/unlisted, eBay listed, Double Holo listed, multi-platform, scanned-not-listed.

**Rules:**
- **Bin 1 / Bin 2 are the eBay-LISTED bins.** Items out of Scouter do **not** land there.
- Unlisted/staged bins come first; listed storage bins come after listing.
- **Bin names must be user-editable from day one.** Numbering is explicitly not final. Do not hardcode.

**Not specified — ask before building:** drag rules (multi-select, max nest depth, unassigned pool behavior). Bin reference photos — Sawyer must supply.

---

# 6. VISUAL SYSTEM

Full detail and rationale in `BASE44-TRUTH.md` §5. Summary:

**Tokens**
```css
--hud-bg:        #07080A;   /* ground, near black */
--hud-panel:     #0E1113;
--hud-raised:    #151A1D;

--hud-amber:     #F2A03D;   /* the accent. ONE accent. */
--hud-amber-hot: #FFC46B;   /* pressed only */
--hud-amber-dim: rgba(242,160,61,0.34);  /* hairlines */

--hud-teal:      #2E6B6E;   /* structural only, NOT a second accent */
--hud-teal-dim:  rgba(46,107,110,0.30);

--hud-text:      #E8EDEF;
--hud-text-dim:  #8A959B;
--hud-text-mute: #5A6469;
```

Keep these in **one tokens module, imported everywhere** — the `visor.js` pattern from Base44. Never hardcode a color locally. Palette drift is this project's recurring failure.

**Banned outright**
- `#F5C518`, school-bus/Crayola yellow, gold-on-black form chrome, gold buttons, gold gradients — rejected three times
- Green as primary or accent, bright/neon especially — it hurts his eyes; green-black has failed repeatedly
- The desaturated "blue colored pencil" look

**Non-negotiable**
- Accent under **10% of screen area**
- Orbitron chrome only, ≤3 words; Rajdhani everything else
- 1px hairline + blur(14px) on panels; 2–3% noise; glow at 8–12% via box-shadow only
- 180–240ms motion, `cubic-bezier(0.2, 0.8, 0.2, 1)`
- **Every space and tab needs an obvious way to back out**
- Camera-first on Scouter — the viewport IS the screen, chrome overlays it

---

# 7. LANGUAGE

Plain English in all UI.

**Banned:** deploy, archive, purge, supply, rail.
**Use:** Add, Saved, Delete, Stock, Staged.

---

# 8. HOW TO WORK WITH SAWYER

These are operating rules, not preferences. Violating them costs real time and money.

- **Answer only the exact question asked.** Nothing adjacent, nothing "related but useful."
- **Never repeat back something he just said.**
- **Never take action before the full task is stated.** Wait, then execute.
- **Explain what a thing IS before sending it.** He got a bash script with no explanation and was rightly annoyed.
- **Never claim a file, fix, or feature works without testing it first.** Click it in a running build.
- **Don't ask him to pick between two things that are the same to him.** Pick and go. But **do** ask when the choice is real — a provider, an API key, a pricing rule.
- **Ask ONE question, then stop.** Not a list of options.
- **Visual first.** Status boxes, flow diagrams, short vertical lists. He explicitly likes HUDs and hubs.
- **Never wide tables** — they cause horizontal scroll on iPhone. His #1 annoyance. Stacked single-column.
- **No walls of text. No preamble. No recap.** Lead with the answer.
- **Code blocks only for copy-paste content** — prompts, CSV rows, commands.
- **Never hand him a script or CLI as the answer** unless he asks. He does not want terminal work.
- **Don't patch aesthetics incrementally.** If direction is wrong, reset that whole aspect.
- **Default to tools he already owns** before naming anything new.
- Desktop browser is **always Opera GX**. iPhone is usually Safari.

---

# 9. OPERATING CONTEXT

- **48-hour rule (active):** any new inventory purchased must be planned and live-listed within 48 hours.
- **Living situation:** currently in a heated shop, not his own space, limited organization. **Grab-and-go workflow matters right now.** Improves after the SLC move.
- **Mobile Mac mini setup:** portable monitor (AOpen 16PM1Q) + two wireless keyboards makes the Mac mini truck-capable. Listing on the go is a real use case.
- **Current backlog:** ~$2,000 sealed product in Shiny Pro needs listing across eBay, Double Holo, and Facebook Marketplace.
- **Biggest named gap in the operation:** item identification accuracy in the scan pipeline — built early, never tested or iterated.

---

# 10. TOOLS OWNED — BUILD WITH THESE FIRST

Claude Pro · Claude Cowork · Claude Code · Cursor · Obsidian ("My Empire" vault) · TCGAutomate (bridge only) · Shiny Pro · Double Holo Vendor Hub · Era Finance + OnePay · Epson ES-580W · ResaleOS · CardUploader · Collectr · PriceCharting · Courtyard.io · Desktop Commander · Jump Desktop · eBay Developer API keys (already set up).

**Never suggest a paid tool without first verifying a free tier exists and exactly where the paywall sits.**
