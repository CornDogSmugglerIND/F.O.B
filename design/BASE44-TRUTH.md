# BASE44 TRUTH — KEEP, KILL, AND WHAT THINGS ARE ACTUALLY CALLED

The Base44 build is the reference point. It was not great — Sawyer rates it roughly **50 out of 100**. But it was **far better than what has shipped since**, and it contained real, working ideas that must survive the migration.

The app: `silky-coalition-command-core.base44.app` (app ID `6a45d0cea37e6615c8e0de67`). Base44 Builder tier, $50/mo, purchased July 2026, time-limited and now out of credits. That is why this repo exists.

---

# 1. REAL NAMES — USE THESE, INVENT NOTHING

These are words Sawyer actually uses. They came from Base44 and from how he talks about his own operation.

| Name | What it is |
|---|---|
| **Coalition H.U.D** | The whole product |
| **Command Core** | The desktop side |
| **Scouter** | Phone intake tab. Named for the Dragon Ball scouter. |
| **Constellation** | The roadmap/spine view items travel along |
| **Phases** | The stages along the line. Base44 stored these in `catalog.js`. |
| **AI Intake Engine** | The identify + listing brain (Base44 called this Phase 3) |
| **Channels** | eBay / Double Holo / Shopify / Misprint surfaces |
| **Shipping** | Dropoff → doorstep tracking |
| **Spaces** / **Bins** | Physical storage mirror |
| **Bin 1 / Bin 2** | Specifically the **eBay-listed** bins |
| **Visor** | Base44's HUD material layer, in `visor.js` |

## WORDS THAT ARE NOT HIS — DO NOT USE

- **"Rail"** — appears in the current Vercel build's bottom nav (`SCOUT` / `RAIL`) and in the button "Add to rail". **Sawyer never approved this word.** It was invented during the rebuild. Remove it.
- **"On rail"** — same. Remove.
- **deploy, archive, purge, supply** — explicitly rejected UI vocabulary.

If a surface needs a name and it is not in the table above, **ask Sawyer**. Do not coin one.

---

# 2. WHAT BASE44 GOT RIGHT — KEEP THESE

## 2.1 The constellation / spine concept

The idea came from a simple glowing line with an arrow — a roadmap look. Products move down the line until listed, then into their proper bins. **The concept is correct and is the backbone of the UI.** Keep it.

## 2.2 Half-zoom item inspection

On the listing surface, items float on the constellation. Clicking one opens a **half-zoom info card — not full-screen**. Deeper detail is optional from there. This was right.

## 2.3 Floating, interactive, nested Spaces

Real photos of his real bins. Click the outer space photo → zoom forward / lid flips → fridge bins → deeper to cards in holders. Hover expands slightly. Connected on a tree.

Physical nesting to mirror:
```
Outer ~$18 Walmart 3-tier collapsible tote, flip-down front lid
  -> pull-out fridge bins on tracks
       -> Connect Kinetic nested holders (big -> 2 medium -> smaller pairs)
            -> cards / Goat mini team bags
```

## 2.4 Live eBay sync on Channels

Base44 synced live eBay: photo per item, quantity updates. This worked and is expected.

## 2.5 Shipping as a constellation path

Dropoff → scan → in transit → doorstep, drawn as a path rather than a list. Keep.

## 2.6 Single-source-of-truth modules

Base44 kept `catalog.js` as the single source of truth for **Phases**, and `visor.js` holding **all HUD materials**. Everything imported from those — nothing hardcoded locally.

**This pattern is correct and should be rebuilt.** One phases module, one materials/tokens module, imported everywhere. It is the only thing that stops palette drift, which is the exact failure mode this project keeps hitting.

## 2.7 Always-visible AI chat widget

Queued for Base44, wanted on every tab. Carry it forward.

## 2.8 Other queued Base44 work worth keeping

- Double Holo Listed bin
- Stale-listing analytics (90+ days)
- eBay auto-pricing rule mirroring the Double Holo Vendor Hub
- CSV export with a destination picker (eBay / DH / Shopify), pre-validated

---

# 3. WHAT BASE44 GOT WRONG — DO NOT REBUILD

## 3.1 The constellation collapsed into a molecule

The single biggest failure. Listings clustered around the graph unorganized, overlapping, hard to click. It stopped being a roadmap and became a ball of nodes.

**Root cause:** an item has **two coordinates at once** — where it is in the lifecycle, and where it physically sits. Base44 hung bins off the spine as children, so every item appeared on the graph twice and cross-edges multiplied until the layout degenerated.

**The fix, and it is not optional:**
- The **spine** is 7 fixed lifecycle nodes, left to right, in fixed positions. It never reflows.
- **Spaces** is a **separate tree**, linked to items by reference — not parented to the spine.
- Tapping an item anywhere opens the same half-zoom card, which shows **both** coordinates.
- Nothing on the spine ever moves except along it.

## 3.2 Constellation navigation was broken

Infinite zoom-in with no way to zoom back out. Sawyer got trapped in the view.

**Every space and every tab needs an obvious way to back out.** This is a hard requirement, stated repeatedly.

## 3.3 Green-black was beaten to death

Multiple Base44 and Claude runs leaned green-black. It looked bad. **Green is off the table as a primary or accent color** — bright/neon especially, stated reason: it hurts his eyes.

## 3.4 Item identification accuracy was never tested

The scan pipeline's identify step was built early and **never tested or iterated**. Sawyer named this the **biggest current gap** in the whole operation. It is still the gap today — identify in the current build fires zero network requests.

## 3.5 Base44 tooling gotchas (if anyone touches it again)

- Multi-edit batches to `base44/functions/` paths fail — single edits only.

---

# 4. WHAT THE REBUILD GOT WRONG — ALSO DO NOT REPEAT

This is below the Base44 bar, not above it.

1. **Yellow/gold-on-black form chrome.** Rejected in about three seconds. Described as JV, Crayola, Windows 98.
2. **PR #53 "fixed" it by going from brown-gold to brighter gold** (`#F5C518`). That is the third rejected palette and it fixed nothing, because the problem was never the hue — it is a form with a dark theme, not a HUD.
3. **Invented vocabulary** — "Rail", "On rail".
4. **Treating the GitHub Actions `@claude` bot as if it were Command.** It has no memory and no design record.
5. **Building without asking.** Running off and producing screens nobody specified.
6. **Shipping chrome over nothing.** Buttons that look real and do nothing — the identify spinner is the worst example.

---

# 5. THE VISUAL BAR — CONCRETE, NOT ADJECTIVES

Sawyer's taste is level 100. Base44 was ~50. The reskins were below 50. The target is not "nicer colors" — it is a different class of interface.

## 5.1 The three references and what to actually take from each

| Reference | The concrete thing to take |
|---|---|
| **Halo (TV series) helmet HUD** | Chrome floats **over** a live view. Thin segmented bars. A slow radar sweep. Information sits at the edges; the center is the world, not a form. |
| **Dead Space holographic inventory** | Panels are translucent and **float in front of** the scene with depth and parallax. Elements have physical presence — they settle, they do not pop. Diegetic: the UI belongs to the world. |
| **Dragon Ball Scouter** | A handheld readout. Small, dense, glanceable. Numbers and short labels, never paragraphs. |

Merged with his eBay store's **metal / dark teal** aesthetic.

## 5.2 Rules that produce that feel

**Layout**
- Camera-first on Scouter: the **live camera viewport IS the screen**. Chrome overlays it. The current build stacks labeled form sections above a "Start intake" button — that is a Google Form in a dark theme, and it is the core reason it reads cheap.
- Information at the edges, subject in the center.
- One thumb reaches every primary action on phone.

**Depth — this is what separates 100 from 50**
- Every panel: **1px hairline** + `backdrop-filter: blur(14px)`. The hairline is the whole effect. Not a 2px border. Not a gradient edge.
- **2–3% noise overlay** fixed to the viewport. Kills the flat-webpage read instantly.
- Float: hover/active lifts `translateY(-2px)` to `-4px`. Subtle. Not bouncy, not springy.
- Glow: `box-shadow` amber at **8–12% opacity**, tight radius. **Never** `text-shadow` bloom. Never a glowing button.

**Color — restraint is the whole point**
- Ground `#07080A` · Panel `#0E1113` · Raised `#151A1D`
- Accent amber `#F2A03D` · hot `#FFC46B` (pressed only) · dim `rgba(242,160,61,0.34)` for hairlines
- Structural teal `#2E6B6E` — rails, connectors, inactive nodes. **Not a second accent.**
- Text `#E8EDEF` · dim `#8A959B` · muted `#5A6469`
- **Accent covers under 10% of screen area.** Strokes, one active state, small glyphs. Never large fills, never gradients, never a gold button.
- Avoid the desaturated "blue colored pencil" look.

**Type**
- **Orbitron**: chrome only. Uppercase, letterspaced, ≤ 3 words. Counters, status, tab labels.
- **Rajdhani**: everything else.
- **Orbitron inside a sentence is the single fastest way to look amateur.** It is the difference between a HUD and a gamer template.

**Motion**
- 180–240ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`. Nothing snaps.
- Radar sweep: dashboard only, ~4s loop, ≤ 6% opacity. Not on Scouter.
- Segmented gauge bars fill **segment by segment**, not as a smooth bar.

**Sound**
- Dead Space-style cues are wanted. **Later, not now.** Do not build audio before identify works.

## 5.3 How Sawyer gives design feedback

- He communicates through **specific cultural references** and expects them synthesized into a coherent direction — not applied literally, not applied superficially.
- Corrections come **mid-build when direction has drifted**, and he is direct about what is wrong.
- He expects a **full reset on the relevant aspect**, not incremental patching. Incremental tweaks on a bad foundation are what burn him out.
- He wants a **deployable artifact**, not a prototype.

---

# 6. THINGS COMMAND DOES NOT HAVE — DO NOT INVENT THEM

Ask Sawyer. Do not fill these in from imagination.

1. Base44's actual hex values, design tokens, or exported CSS. The tokens in this repo are Command-authored from his stated direction — they are **not** recovered Base44 values.
2. The exact tab bar labels and count from the good Base44 build. Section 1 is Command's model, built from words he actually uses.
3. Reference photos, bin photos, Base44 screenshots. **Sawyer must supply these, and they are only required for Spaces.** They are not needed to fix identify.
4. Spaces drag rules — multi-select, maximum nest depth, unassigned pool behavior. Never specified.
5. Misprint and Double Holo API base URLs and auth shape.
6. Shipping carrier tracking source of truth.
7. Auth / multi-device account model between phone Scouter and desktop Command Core.
8. Final bin numbering. Bin names must be **user-editable from day one** — numbering is explicitly not final.
