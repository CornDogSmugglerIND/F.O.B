# Carousel integration — Coalition H.U.D.

Files added (do not edit anything else):

- `public/features/carousel.js` — self-contained module, exposes `window.HUD_carousel = { renderInto(el, photos), patchOpenSheet(itemGetter) }`
- `public/features/carousel.css` — all carousel styles (390px-first, olive/sand, zero brown/blue/teal)

## 1. index.html — asset tags

In `<head>`, right after the coalition.css line:

```html
<link rel="stylesheet" href="/features/carousel.css?v=1" />
```

Before the coalition.js module script (bottom of body), add the classic script:

```html
<script src="/features/carousel.js?v=1"></script>
<script type="module" src="/coalition.js?v=14"></script>
```

Load order does not matter for correctness (openSheet only runs on user tap),
but carousel.js must be present before any click can open the sheet.

## 2. coalition.js — openSheet() change (recommended)

`coalition.js` loads as an ES module, so its `openSheet` is module-private and
cannot be monkey-patched from outside. The hook `HUD_carousel.patchOpenSheet()`
therefore cannot intercept the H.U.D.'s internal `openSheet` calls — use this
one-line change instead.

In `openSheet()` (currently around line 651), replace these two lines:

```js
  const src = it.photos?.[0]?.dataUrl || "";
  $("sheetMedia").innerHTML = src ? `<img src="${src}" alt="" />` : "";
```

with:

```js
  window.HUD_carousel?.renderInto($("sheetMedia"), it.photos || []);
```

That is the whole change. The `?.` keeps the sheet working even if
carousel.js fails to load.

## 3. About patchOpenSheet()

`window.HUD_carousel.patchOpenSheet(itemGetter)` exists for non-module pages
where `openSheet` is a true global. Called there, it wraps `window.openSheet`
so that after the original runs, `renderInto(sheetMedia, itemGetter(id).photos)`
replaces the static image. Usage on such a page:

```js
window.HUD_carousel.patchOpenSheet(function (id) {
  return state.items.find(function (x) { return x.id === id; });
});
```

In the H.U.D. app it will log a console warning and return `false`, because
`window.openSheet` is not global — apply the openSheet() change in section 2
instead.

## Behavior notes

- `renderInto(el, photos)` is idempotent and re-runnable: it tears down the
  previous instance (including the document-level keydown listener) before
  rendering, so `openSheet` can call it every time.
- 0 photos → corner-bracketed "NO PHOTO" empty state.
- 1 photo → image only; arrows and dots hidden.
- 2+ → arrows (48px targets), dots, "N / M" counter, swipe (40px threshold,
  horizontal-dominant only so vertical sheet scroll is unaffected), desktop
  arrow keys.

---

# eBay connection UI — integration

Files added (do not edit anything else):

- `public/features/ebay.js` — vanilla-JS module, exposes `window.HUD_ebay = { init(), refreshStatus() }`
- `public/features/ebay.css` — status card + pill states (390px-first, olive/sand, zero brown/blue/teal)

## 1. index.html — asset tags

In `<head>`, after the coalition.css line:

```html
<link rel="stylesheet" href="/features/ebay.css?v=1" />
```

Before the coalition.js module script (bottom of body), alongside the other
feature scripts:

```html
<script src="/features/ebay.js?v=1"></script>
```

## 2. coalition.js — init call site (end of bind())

At the end of `bind()` (after the existing button wiring):

```js
window.HUD_ebay && window.HUD_ebay.init();
```

`init()` is idempotent — safe if called again.

## 3. What it upgrades (no existing behavior removed)

- **Header pill `#ebayPill` / `#ebayPillLabel`:** `refreshStatus()` runs
  `GET /api/channels/status` (configured?) then `GET /api/channels/ebay/probe`
  (token actually valid?) and sets the pill:
  - `EBAY LIVE` — olive dot + glow (`ebay-live` class)
  - `EBAY ERROR` — configured but probe/auth failing (`ebay-error`)
  - `EBAY OFFLINE` — not configured, dim (`ebay-offline`)
- **Coexistence with coalition.js:** `renderChannels()` in coalition.js also writes
  the pill (`on` class, `EBAY ONLINE`/`EBAY OFFLINE`). The module keeps coalition's
  `on` convention in sync AND installs a MutationObserver that re-asserts the
  deeper probe state whenever coalition.js re-renders the pill. No edits to
  coalition.js required.
- **Channel tab:** injects `.ebay-card` at the top of `#view-channels`, above the
  existing toolbar (toolbar + `btnEbaySync` stay as-is). Card shows: status line,
  last-sync meta (localStorage `coalition-ebay-last-sync`), `Sync now` and
  `Check connection` buttons.
- **Honest states only:** unconfigured shows "Not configured — link via
  Base44/Claude" (no fake connect button). Probe failures show `EBAY ERROR`
  and toast the error. Sync failures toast the real message — never fake success.

## API surface used (read-only from frontend; creds stay server-side)

- `GET /api/channels/status` → ebay entry `.configured`
- `GET /api/channels/ebay/probe` → token validity check
- `POST /api/channels/ebay/sync` → sync (delegates to coalition.js's global
  `syncEbay()` when present, else own POST + merge)

## For coordinator

- Call `HUD_ebay.refreshStatus()` after any sync flow (e.g. after the existing
  `syncEbay()` in coalition.js) so the pill + card reflect the newest state.
- "Sync now" delegates to the global `syncEbay()`; timestamp is recorded in
  localStorage on completion, pulled-count shown in the meta line only when the
  module performed the sync itself (the global's toast already reports the count).


---

# Settings feature — integration (coordinator)

Files added (do not edit anything else):

- `public/features/settings.js` — classic script, exposes `window.HUD_settings = { init(), render(), get(), set(), notify(), notifyEnabled() }`
- `public/features/settings.css` — rows, toggles, selects, danger zone (390px-first, olive/sand, zero brown/blue/teal)

## 1. index.html — asset tags

In `<head>`, alongside the other feature CSS:

```html
<link rel="stylesheet" href="/features/settings.css?v=1" />
```

Before the coalition.js module script (bottom of body), alongside the other feature scripts:

```html
<script src="/features/settings.js?v=1"></script>
```

## 2. coalition.js — call sites

At the end of `bind()`:

```js
window.HUD_settings && window.HUD_settings.init();
```

In `render()`:

```js
window.HUD_settings && window.HUD_settings.render();
```

## 3. What it renders (self-rendering into #view-settings)

Replaces the two static placeholder `.settings-block` panels with five real sections:

- **CHANNELS** — eBay row, live status from `GET /api/health`
  (`channels[].{id,configured}` → Connected / Not configured), "Sync now"
  button (`POST /api/channels/ebay/sync`, toasts pulled count), plus an
  eBay auto-sync toggle (pref `ebayAutoSync`).
- **IDENTIFY** — provider select (Anthropic / Manual) persisted as
  `identifyProvider`. Tries `GET /api/identify/status` for a backend
  provider; the backend currently 404s that path (only auth-gated
  `/api/identify/queue` exists), so the local preference governs and the
  backend line stays hidden. If the backend ever returns `{provider}`, the
  UI picks it up automatically.
- **DEFAULTS** — default bin select (Bin 1 / Bin 2 / Staged / None) persisted
  as `defaultBin`; values `bin1|bin2|staged|none` match the existing
  `assignSpace` space ids, intended for `stageItem()`.
- **NOTIFICATIONS** — three real toggles (sale alerts, price drops, sync
  complete), persisted under `notifications`. Toast is the only channel.
- **DATA** — "Clear demo data" (drops items whose `notes` includes
  `demo-seed`, prunes their ids from spaces, leaves the demo flag set),
  "Export backup" (downloads all localStorage keys as JSON),
  "Reset all data" (double-tap arm → wipes items/spaces/demo-flag/settings
  keys → reload).

Prefs persist in `localStorage` key `coalition-settings-v1`
(`{identifyProvider, defaultBin, ebayAutoSync, notifications}`).
Never logs or exposes credentials — eBay auth stays server-side.

## 4. API surface for other features

```js
HUD_settings.get("defaultBin");        // "bin1" | "bin2" | "staged" | "none"
HUD_settings.get("identifyProvider");  // "anthropic" | "manual"
HUD_settings.get("ebayAutoSync");      // boolean
HUD_settings.get();                    // full prefs object (copy)
HUD_settings.set("defaultBin", "bin1");
HUD_settings.notifyEnabled("sales");   // boolean
HUD_settings.notify("sales", msg);     // toasts only if enabled, returns bool
```

Suggested future wiring: `stageItem()` applies `get("defaultBin")` as the
item's `spaceId` when it isn't `"none"`; channel code gates toasts behind
`HUD_settings.notify(kind, msg)`.

## 5. Notes for coordinator

- `init()` is idempotent; `render()` re-renders on demand. settings.js also
  auto re-renders when the settings tab becomes active (nav clicks +
  hashchange), so the `render()` call in coalition.js is belt-and-suspenders —
  keep both.
- coalition.js's `toast`, `$`, `escapeHtml` are module-scoped, so settings.js
  ships its own DOM-bound copies (toast targets the existing `#toast`
  element; its own `esc()` for HTML escaping). No changes to coalition.js
  were made. The header `#ebayPill` is untouched by this module.


---

# CSV import/export — integration (coordinator)

Files added (do not edit anything else):

- `public/features/csv.js` — plain classic script, no deps; exposes
  `window.HUD_csv = { init(), exportInventory(), openImport() }`
- `public/features/csv.css` — import overlay, drop zone, preview table
  (390px-first, olive/sand, zero brown/blue/teal)

## 1. index.html — asset tags

In `<head>`, alongside the other feature CSS:

```html
<link rel="stylesheet" href="/features/csv.css?v=1" />
```

Before the coalition.js module script (bottom of body), alongside the other
feature scripts:

```html
<script src="/features/csv.js?v=1"></script>
```

Classic script, not `type="module"` — by design. Load order is forgiving:
app helpers (`toast`, `escapeHtml`, `uid`, `saveItems`, `state.items`) are
resolved lazily off `globalThis` at click time, with local fallbacks, because
coalition.js is a module and its internals are module-scoped, not true
globals.

## 2. coalition.js — init call site (end of bind())

At the end of `bind()` (line 909):

```js
window.HUD_csv && window.HUD_csv.init();
```

`init()` injects "Import CSV" and "Export CSV" ghost buttons into the Channel
tab's `.channel-toolbar` (after Sync eBay / Load sold / Combine). It is
idempotent and also runs on DOMContentLoaded if called early.

## 3. Behavior

- **Export** — builds `Title, Product Name, Set, Quantity, Price, Phase, Bin,
  Barcode, SKU, Notes` from every item (Bin = `spaceId`), proper RFC-4180
  escaping (quotes, commas, newlines), BOM-prefixed, real Blob download named
  `coalition-inventory-YYYYMMDD.csv`. Toasts the exported count.
- **Import** — opens a bottom-sheet overlay (own injected DOM, `.csv-overlay`)
  with a prominent full-width ‹ Back button at the top, file input
  (`accept=".csv,.txt"`) plus drag-drop zone. Parser handles quoted fields,
  commas/newlines inside quotes, escaped `""`, `\r\n`, BOM, and auto-detects
  `;` / tab delimiters. Headers auto-map case-insensitively
  (title/name → Title, qty → Quantity, upc/ean → Barcode, etc.); a preview
  table shows the first 8 rows (horizontal scroll inside its wrapper, never
  widening the page) with mapped-column names and the original header under
  each. "Import N items" creates items with `phase: "intake"`,
  `staged: false`, `spaceId: null`; blank rows are skipped; qty defaults to 1,
  price to 0. Toasts the imported count. Esc/Back/Cancel close the sheet.

## 4. Notes for coordinator

- Imported items also carry `sku` on the item object (additive; export reads
  `it.sku || ""` so round-trips work).
- The module does not trigger a UI re-render after import — it commits via
  `state.items`/`saveItems()` when available, falling back to direct
  localStorage writes. Call the app's render after import if needed.
- Underscore helpers (`_parse`, `_parseAuto`, `_stringify`, `_mapColumns`,
  `_escape`) are exposed on `window.HUD_csv` for debugging/testing only.
- Parse/stringify logic was unit-tested under node (15 assertions: quoted
  fields, embedded commas/quotes/newlines, CRLF, BOM, delimiter detection,
  round-trip, header mapping incl. synonyms and no double-mapping). Test was
  scratch and has been removed.


---

# Spaces interactivity — integration (coordinator)

Files added (do not edit anything else):

- `public/features/spaces.js` — classic script, exposes `window.HUD_spaces = { init(), openBinDetail(spaceId), closeBinDetail(), refresh() }`
- `public/features/spaces.css` — bin detail overlay, item cells, drop hints, pool strip (390px-first, HUD tokens, zero brown/blue/teal)

## 1. index.html — asset tags

In `<head>`, alongside the other feature CSS:

```html
<link rel="stylesheet" href="/features/spaces.css?v=1" />
```

Before the coalition.js module script (bottom of body), alongside the other
feature scripts:

```html
<script src="/features/spaces.js?v=1"></script>
```

Classic script, not `type="module"` — by design. coalition.js is a module so
its internals (`state`, `toast`, `openSheet`, `saveItems`, `renderSpaces`,
`spaceName`, `escapeHtml`, `money`) are module-scoped, not true globals;
spaces.js resolves every helper lazily off `window` at call time and falls
back to local implementations (direct `localStorage` read/write for
`coalition-items-v4` / `coalition-spaces-v4`, self-made toast), so it works
with or without them exposed.

## 2. coalition.js — init call site (end of bind())

At the end of `bind()`:

```js
window.HUD_spaces && window.HUD_spaces.init();
```

`init()` is idempotent. It injects the bin-detail overlay DOM once, binds
delegated bin clicks/drag-drop on `#spacesNodes`, binds document-level
drag/tap/touch handlers, and starts the unsorted-pool watcher.

## 3. Bin clicks — no wiring needed in coalition.js

`init()` delegates clicks on `#spacesNodes` (container-level), so
`renderSpaces()` can re-render the `.space-node` buttons freely without
re-binding. Bin tap → `openBinDetail(spaceId)`. Do not add per-button
handlers.

## 4. Full-integration option (recommended)

For live in-memory state, styled toasts, and `renderSpaces` refresh, expose
the module internals once at the end of coalition.js, before `boot()`:

```js
Object.assign(window, {
  state, toast, escapeHtml, money, uid,
  spaceName, openSheet, closeSheet, saveItems, renderSpaces, render,
});
```

Without this, the feature still works via the localStorage fallbacks — but
`refresh()` cannot re-run the host's `renderSpaces()`, and toasts use the
fallback `.sp-toast` element.

## 5. Behavior

- **Bin detail overlay** — new injected `.sheet` (`#binDetailSheet`,
  z-index 70, reuses the app's `.sheet`/`.sheet-card` base styles): bin name,
  item count, grid of item thumbnails (photo, title, price). Item tap closes
  the overlay then calls the existing `openSheet(itemId)`. Obvious Back
  button top-left (52px min-height). Backdrop tap and ESC also close.
- **Drag and drop** — item cells (`draggable="true"`) in the bin grid and
  the unsorted-pool strip drop onto bin nodes (`#spacesNodes`) or onto the
  open bin overlay. On drop: `item.spaceId` updated, `updatedAt` stamped,
  persisted via `saveItems()` (or direct localStorage), both views refreshed,
  toast `Filed in <Bin name>`. Same-bin drops are no-ops.
- **Touch** — long-press 500ms initiates a drag: a clone follows the finger
  (`touch-action: pan-x pan-y` so plain swipes still scroll; movement beyond
  12px before the timer fires cancels into a scroll). Release hit-tests with
  `elementFromPoint` against `[data-space]` targets; haptic tick on pickup
  where supported. The synthetic click after a drag is swallowed so the item
  sheet doesn't open.
- **Unsorted pool** — a horizontal draggable item strip (max 48 shown, "+N
  more" chip) is appended inside `#unsortedPool` after the existing count
  text. A MutationObserver re-adds it after every `renderSpaces()` rewrite
  (marker-guarded, no loop). Existing pool markup is untouched.
- **refresh()** — calls `window.renderSpaces()` when present, re-augments the
  pool strip, and re-renders the open bin grid.

---

# Inventory tools (search + bulk select) — Coalition H.U.D.

Files added (do not edit anything else):

- `public/features/inventory-tools.js` — self-contained module, exposes `window.HUD_invtools = { init(), refresh() }`
- `public/features/inventory-tools.css` — search bar, select toggle, selection rings, bottom action bar (390px-first, olive/sand, zero brown/blue/teal)

## 1. index.html — asset tags

In `<head>`, right after the coalition.css line:

```html
<link rel="stylesheet" href="/features/inventory-tools.css?v=1" />
```

Bottom of body, alongside the other feature scripts (classic scripts, before or after the coalition.js module tag — load order does not matter):

```html
<script src="/features/inventory-tools.js?v=1"></script>
```

The module auto-inits on DOM ready and also exposes `HUD_invtools.init()` for explicit calls. It injects the search bar into `#view-scouter` between `.scout-actions` and `.scout-meta`. It does NOT touch `.channel-toolbar`.

## 2. coalition.js — optional, recommended: HUDcore bridge + refresh() hook

`coalition.js` loads as an ES module, so its `state`, `stageItem`, `assignSpace`, `saveItems`, `render`, `toast`, `escapeHtml`, `spaceName`, `openSheet` are module-private. The feature module works without them — it reads/writes the same localStorage store (`coalition-items-v4`) the app uses, repaints rows with the app's own `.pkg` markup, and falls back to its own toast. But for mutations to flow through the app's live state (and for `render()` to repaint everything, not just the pkg rows), add one line near the bottom of `coalition.js` (e.g. right before `boot()`):

```js
window.HUDcore = { state, stageItem, assignSpace, saveItems, render, toast, escapeHtml, spaceName, openSheet };
```

This is optional. Without it: search still filters live; bulk Stage/Bin assigns still persist to localStorage and the pkg rows re-render, but the other views (command/map/spaces counts) only refresh on the next natural `render()`.

`refresh()` hook: `HUD_invtools.refresh()` is safe to call after the app's `render()` (or anywhere). It re-applies an active search filter or selection rings after the app repaints the pkg rows. The module also runs a MutationObserver on `#pkgIntake`/`#pkgStaged` that does this automatically, so the hook is a nice-to-have, not a requirement — the search input's own `input` listener works on the current DOM regardless.

## 3. Behavior summary

- **Search**: filters both pkg rows live against title, productName, setName, barcode, and `channels.ebay.sku` (case-insensitive). While searching, up to 24 matches shown per row; "N results" + × clear below the bar. Empty query restores the app's own `paintPkgs` output (12 cap) untouched.
- **Select mode**: "Select" toggle next to the search bar. Card taps toggle selection (olive ring + check badge) instead of opening the sheet. Bottom action bar: "N selected" + Stage / Bin 1 / Bin 2 / Staged / Clear. Stage applies staged semantics to each item; Bin buttons set `spaceId`; one toast ("3 filed in Bin 1"); exits select mode and re-renders via the bridge `render()` (or its own row repaint fallback). "Clear" or tapping the toggle again exits mode.


---

# Fulfillment (sold → packed → shipped → delivered) — integration (coordinator)

Files added (do not edit anything else):

- `public/features/fulfillment.js` — self-contained module, exposes
  `window.HUD_fulfillment = { init(), renderSheetSection(itemId), refresh() }`
- `public/features/fulfillment.css` — sheet section, overlay forms, shipping
  queue rows (390px-first, olive/sand, zero brown/blue/teal)

## 1. index.html — asset tags

In `<head>`, after the coalition.css line:

```html
<link rel="stylesheet" href="/features/fulfillment.css?v=1" />
```

Before the coalition.js module script (bottom of body), alongside the other
feature scripts:

```html
<script src="/features/fulfillment.js?v=1"></script>
```

Classic script, not `type="module"` — by design. It must load before any
`openSheet()` call can happen (any user tap), which the end-of-body placement
guarantees.

## 2. coalition.js — two hook lines (required)

At the end of `bind()`:

```js
window.HUD_fulfillment && window.HUD_fulfillment.init();
```

At the end of `openSheet(id)` (after `$("sheetSpace").textContent = ...`):

```js
window.HUD_fulfillment && window.HUD_fulfillment.renderSheetSection(id);
```

Why the hook instead of a wrapper: `openSheet` is module-scoped (coalition.js
is an ES module), so it cannot be monkey-patched from outside. `init()` is
idempotent and also self-boots on DOMContentLoaded, so the `bind()` line is
belt-and-suspenders.

## 3. What it adds (no existing behavior changed)

- **Item sheet — FULFILLMENT block** (`#ffSection`, inserted before
  `.sheet-actions` so the existing buttons stay untouched). Shows only the next
  logical action for the phase, plus a compact status line when fulfillment
  data exists:
  - listed / staged → "Mark sold" → overlay form: sold price (defaults to
    `item.price`), channel select (eBay / Double Holo / Misprint / Marketplace
    / Other — pre-selected from the item's channels when present), fees
    optional. If the sold price differs from the list price, one muted line
    reads `Listed $X · selling $Y`. Confirm sets phase `sold` (+`soldPrice`,
    `soldChannel`, `soldAt`, `fees`, `updatedAt`).
  - sold → "Pack" (one tap) → phase `packed` + `packedAt`.
  - packed → "Ship" → overlay form: tracking number (required, trimmed),
    carrier select (FedEx / USPS / UPS / Other, defaults FedEx). Confirm sets
    phase `shipped` (+`trackingNumber`, `carrier`, `shippedAt`).
  - shipped → "Mark delivered" (one tap) → phase `delivered` + `deliveredAt`.
  - delivered → no CTA; block reads "DELIVERED — cycle complete".
  - intake → block hidden entirely.
  - Status line examples: `SOLD $24.50 · eBay · 9/27`;
    `SOLD $24.50 · eBay · 9/27 → SHIPPED · FedEx 12345678…`.
  - Both overlays are their own bottom sheets (`#ffSoldSheet`, `#ffShipSheet`,
    z-index 65 — above `#itemSheet` at 60, below toast at 70) with an obvious
    Back button. Back closes the overlay and reveals the item sheet behind it.
- **Shipping queue** — injected as `#ffQueue` at the very top of `#view-map`
  (above the constellation nodes). This is the pack-and-ship list: every item
  in `sold`/`packed`/`shipped`, ordered sold → packed → shipped, oldest first.
  Each row shows thumbnail, title, the compact status line, and the next action
  as a tap button (PACK / SHIP / DELIVERED). Queue re-renders whenever the Map
  view becomes active (MutationObserver) and via `HUD_fulfillment.refresh()`.

## 4. State + refresh strategy (read this)

- The module reads/writes `localStorage` key `coalition-items-v4` directly —
  the same key coalition.js uses. No new storage keys.
- After every fulfillment mutation the module writes localStorage, stashes the
  toast in `sessionStorage` (`coalition-ff-toast`), and does
  `location.reload()`. This is deliberate: coalition.js keeps its own in-memory
  copy of the items, so a reload is the only way to keep host memory and the
  module in sync without editing coalition.js. The URL hash survives the
  reload, so the user lands back in the same view; the item sheet closes
  (matches "toast + close"); the stashed toast is shown on boot by `init()`.
- `refresh()` re-reads localStorage and repaints the queue + sheet section
  without reloading — for external callers. It does not sync the host's
  in-memory state.
- Invalid transitions are blocked with a toast: Mark sold only from
  `listed`/`staged` (re-recording on an already-sold item is rejected);
  Pack only from `sold`; Ship only from `packed`; Delivered only from
  `shipped`. Confirm handlers close their overlay sheet before mutating,
  so a double-tap cannot re-submit and the sheet never gets stuck open.

## 5. Fields the module may add to an item

`soldPrice`, `soldChannel`, `soldAt`, `fees`, `packedAt`, `trackingNumber`,
`carrier`, `shippedAt`, `deliveredAt` — all additive; nothing existing is
renamed or removed. `phases.js` untouched; `phaseFromItem` semantics mirrored
locally (module cannot import it as a classic script).
