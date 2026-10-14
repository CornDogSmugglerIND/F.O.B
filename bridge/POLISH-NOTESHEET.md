# 🔶 POLISH NOTE SHEET — Claude + Muse
Written 2026-10-13 20:40 CT from Sawyer's full message. Every complaint is in here. Nothing is built yet.

## 🛑 GROUND RULES (read first)
- 🔒 **Main / prod is FROZEN.** He is using it tonight. Nobody pushes to main.
- 🌿 All work goes on branch `hud-polish` with its own Vercel preview link.
- 👀 He reviews this sheet first, then says go. **No building before his go.**
- 🔁 **Cross-check:** whatever one of us builds, the other tests. No self-grading.
- 📡 We talk on the bridge (`bridge/*.md` + `message_ari`). He is NOT the middleman. Post before telling him anything.
- 🧱 **Build on what exists. Do NOT scrap the app.** Keep: his theme, drag/drop, sync, real data, Undo.
- ✋ No eBay writes. Misprint parked. No credentials.

## 🧠 WHY IT FEELS LIKE A SPREADSHEET
- Pages are plain cards and rows with the same boxes moved around.
- Interactions were added on some pages and left off others.
- **Fix = polish the CURRENT app. Add motion, depth and interaction to what is live. No rebuild from old versions. No going back to the old look.**

## 🎯 THE BAR
- Heads-up display. Not a spreadsheet. Not an HTML page.
- Halo / Master Chief combat camera: info at the edges, glass overlays, glow, depth.
- Glossy. Premium. Floaty. Interactive on EVERY tab.
- Palette E stays: charcoal, seafoam glow, orange only on Sold/Shipped.

---

## 🌐 A. EVERY PAGE (global)

**A1. Hover/tap zoom is missing on most pages**
- He said: zoom-up on hover used to work. Now items just shift.
- Fix: one shared "lift + tilt + glow + half-zoom card" component. Used on Command, Collection, Channels, Spaces, Scouter.
- Built fresh inside the current app, in our current look.
- Check: hover a card on every page → it lifts and tilts. Tap → half-zoom card (not full screen). Always a clear back.

**A2. Interactivity was added to some pages, left off others**
- Fix: list every interactive behavior once, apply to every tab. Checklist in section I.

**A3. "Mashed together search tabs at the top"**
- Fix: one clean control bar. Everything else goes into ONE dropdown/drawer.
- Sheet-style filters, chips and toggles get collapsed. Clean it out.
- Applies to Channels first, then Collection and Spaces.

**A4. "Feels like an HTML file, not an app"**
- Fix: app chrome. HUD frame around the screen, edge readouts, glass panels, smooth transitions (180–240ms), nothing snaps.
- Real app feel on phone: bottom bar, safe-area, sheets that slide.

**A5. Keep the theme he likes**
- Keep Palette E exactly. Don't touch it.

---

## 🏠 B. COMMAND

**B1. Roadmap lost the original image it was modeled on**
- He said: now it's "just dots and lines."
- Fix: upgrade the CURRENT roadmap. Keep its layout and data. Add a glowing path, a pin, depth, and stage art.
- Only reference: the Halo HUD feel he described. No old-app copy.

**B2. Lines don't move any more**
- Fix: animated glow pulse and arrows travelling along the current path. Items ride the line.

**B3. No way to tell which step is step 1, 2, 3**
- Example he gave: "1 photo in" doesn't say it's stage one; "11 ready to list" doesn't say stage two.
- Fix: every stop gets a plain stage name AND its order. Start pin → finish flag. Current-stage highlight.

**B4. Confusing labels: "value on the line", "12 to work"**
- Fix: plain English.
  - "value on the line" → "Total value in progress" (and say what it counts)
  - "12 to work" → "12 items need action" (tap shows which)
- Rule: no label ships unless a stranger gets it in 2 seconds.

**B5. No hover zoom on Command**
- Fix: roadmap stops use the shared lift/zoom component (A1).

**B6. Keep: drag and drop between stages.** He likes it.

**B7. "One card per stop, small glowing dots, no circles"** (standing rule)
- Keep it. But the dots must animate and respond.

---

## 📲 C. SCOUTER

**What it IS (his words):** the handheld tool in his hand, on his phone. Like a Walmart employee's scanner or the Square/Shopify handheld. DBZ Scouter feel. Then he hops to desktop when done.

**C1. It looks like a boring form**
- He said: "drop your photos here," a "Windows 98 identify button," random money box.
- Reference: the original Scouter idea only (twin SNAP/SCAN buttons, ON SCOUTER / VALUE / LIVE / EBAY ONLINE readouts, little package cards). Used to understand the purpose, not to copy the old look.
- Fix: rebuild this one screen as a handheld scanner, in the current theme. Phone-first.
  - Big viewfinder frame with HUD corners and scan line
  - Two big twin buttons: **SNAP** (photo) and **SCAN** (barcode, separate button)
  - Live readout strip: ON SCOUTER · VALUE · LIVE badge · EBAY ONLINE pill
  - Little product cards stack up as you add items (with x2 counts)
  - Thumb-reach controls at the bottom

**C2. Identify button looks dated**
- Fix: replace with a glowing action tied to the viewfinder. Scanning animation while it works.

**C3. "Random thing that says money"**
- Fix: market value shown as a clear readout with a label and source ("median of active eBay listings").

**C4. Scouter does NOT list.** It only gets items IN and stages them. (Master spec.)
- Keep that. Make the "Staged" result obvious.

**C5. Phone → desktop handoff**
- Fix: items scanned on the phone show up on desktop instantly with a "just scanned" marker.
- Needs a check: today it's localStorage per device. **That does not sync phone to desktop.** Must find a way (see section H).

**C6. Keep:** instant previews, up to 5 photos per item, shrink, backup, candidate pick list, market value fill.

---

## 🗂️ D. COLLECTION

**What it IS:** the collection manager. Modeled after **Shiny Pro, Collectr**, other TCG/inventory collection apps. Riot / Champions Hub glossy grid.

**D1. "Spreadsheet with photos," not premium**
- Fix: premium glossy grid. Big photo cards, glass, holo shimmer on tilt, price chips, portfolio header (total value, change).
- Item detail page like Shiny Pro: big image, value, chart, links.

**D2. Hover zoom/tilt was working before, now just moves around**
- Fix: restore tilt + zoom (A1).

**D3. Keep:** his listings are actually in there. Sealed/Singles lanes, drag between lanes, bulk actions, Undo.

**D4. Flag for him:** the master spec says "reseller tool, not a collection manager." He now describes Collection as a collection manager. We'll treat Collection as the collection-manager *view*, the rest stays reseller. He can overrule.

---

## 📦 E. SPACES

**What it IS:** Sortly / Boxes style physical inventory. Bins you can open.

**E1. "Ugly mashed together mess," looks like a TCG Automate / Resale OS copy**
- Fix: throw out the grouped-list layout. Rebuild as a spatial bin view.

**E2. The interaction he wants (his example)**
- Space 1 → Bin 1 → shows the **outside of the bin** (real bin look).
- Tap the bin → **camera zooms IN** like you're looking inside it.
- Inside = the items in that bin.
- Back button zooms out.
- Bins float and lift slightly on hover.

**E3. Nesting (master spec)**
- Tote → pull-out fridge bins → nested holders → cards/team bags. Zoom deeper each level.

**E4. Rules**
- Bin names user-editable. Numbering not final.
- Staged bins vs listed bins are different things. Bin 1 / Bin 2 = eBay-listed.
- Keep: "File all into bins" and Undo.

**E5. Needs from him:** photos of his real bins (Base44 version used them). Without them we use clean generated bin art and swap later.

---

## 🛰️ F. CHANNELS

**F1. Too many controls up top**
- Fix: one dropdown/drawer. Clean.

**F2. No interactive features at all (zoom, tilt, glow)**
- Fix: shared component (A1).

**F3. "Live on eBay / Ready to list / Photos / Sold" strip is a mashed-together mess, looks like a rip-off**
- Fix: replace chips with a single stage selector that matches the roadmap (same names, same order, same glow).

**F4. Keep:** Cards/Grid/List, Publish/End sheets (stay OFF), Undo, bulk bar.

---

## ⚙️ G. SETTINGS / SHELL
- Check every pixel anyway. Same HUD chrome, same interactions.
- Install steps, connections, storage stay.

---

## 🔧 H. THINGS WE MIGHT NOT BE ABLE TO DO (and how we find out)

| Risk | Plan |
|---|---|
| Phone → desktop sync | Items live in browser storage per device. Test: does a phone scan show on desktop? If not, add a server-side store (Supabase or Vercel KV). Muse + I decide on the bridge, small spike first. |
| Real bin photos | Not available. Use generated bins, swap in his photos later. |
| Motion hurts phone speed | Spike the roadmap animation first. Cap animated nodes, respect reduced motion. |
| Performance with 560+ items | Test on phone-size viewport. Lazy-render, cap animated nodes. |

---

## 🧪 I. INTERACTION CHECKLIST (every tab must pass)
- [ ] Hover lifts + tilts + glows
- [ ] Tap opens half-zoom card
- [ ] Clear back / zoom-out
- [ ] Drag where it makes sense
- [ ] Smooth transitions, nothing snaps
- [ ] No spreadsheet look: no grid lines, no dense rows
- [ ] Looks right on phone (390px) AND desktop
- [ ] No horizontal scroll, no JS errors
- [ ] Labels are plain English, no jargon
- [ ] Banned words: rail, spine, deploy, archive, purge, supply

---

## 👥 J. WHO DOES WHAT

**Step 0 (Claude):** shared interaction kit (lift/tilt/glow/half-zoom/back). Everything depends on it.

**Then split:**
- **Claude builds:** Command roadmap, Scouter, Collection
- **Muse builds:** Spaces, Channels, Settings

**Cross-checks:**
- Muse tests Claude's work (visual + interactive + phone width), posts PASS/FAIL with screenshots.
- Claude tests Muse's work the same way.
- Both check against sections A–I, line by line.

**Order:**
1. Interaction kit
2. Command roadmap
3. Scouter
4. Spaces
5. Collection
6. Channels
7. Settings + full sweep of every tab
8. Preview link to Sawyer. He decides if it goes live.

---

## ❓ K. NEEDS FROM SAWYER (only when he's back)
1. OK to start? (Go / No-go)
2. Photos of your real bins, when you can.
3. Is Collection a collection manager view (Shiny Pro) or part of the reseller flow?

---

## ✅ L. DONE MEANS
- He opens the preview and it feels like a HUD.
- Every tab passes section I, verified by the OTHER builder with screenshots.
- Nothing goes live until he says so.
