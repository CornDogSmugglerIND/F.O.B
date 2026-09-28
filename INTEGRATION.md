# Collection Manager — Integration

Two new files are done and smoke-tested. Nothing else was touched.

- `public/features/collection.js` — self-contained module, exposes `window.HUD_collection = { init(), render(), refresh() }`
- `public/features/collection.css` — collection-only styles (`.col-*` prefix)

The module is defensive: it waits for `#view-collection` to exist (MutationObserver), auto-renders when the view goes active, and keeps its own copy of the tiny helpers it needs (`$`, `toast`, `escapeHtml`, `money`, `uid`) because coalition.js's are module-scoped.

## 1. Head — add the stylesheet

In `public/index.html`, next to the existing coalition.css link:

```html
<link rel="stylesheet" href="/features/collection.css?v=1" />
```

## 2. Nav — add the tab

In the `<nav class="hud-nav">` block, paste after the CHANNEL tab (order is coordinator's call — after CHANNEL works well):

```html
<button type="button" class="nav-tab" data-view="collection">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z"/></svg>
  COLLECTION
</button>
```

## 3. View section — add the skeleton

Paste after the channels section (`</section>` for `#view-channels`):

```html
<section class="view" id="view-collection">
  <!-- built by HUD_collection.render() -->
</section>
```

The module paints the header stats, filter toolbar, and card grid into this section on render.

## 4. Script tag

Load before or after coalition.js — order doesn't matter. Plain script (not a module):

```html
<script src="/features/collection.js"></script>
```

## 5. coalition.js wiring (3 small edits)

a) **VIEWS array** (line 6):

```js
const VIEWS = ["command", "scouter", "map", "spaces", "channels", "collection", "settings"];
```

Confirmed: `navigate()` handles tabs generically via `.nav-tab[data-view]` and `view-${v}` toggles, so no other nav changes are needed.

b) **init call** — inside `boot()`, after `bind()`:

```js
HUD_collection?.init();
```

(The `?.` keeps boot safe if the script tag is ever missing.)

c) **render hook (optional but recommended)** — inside `render()` in coalition.js, add:

```js
window.HUD_collection?.refresh();
```

This keeps the collection view repainted by the app's own render cycle. Not strictly required — the module also self-renders via a MutationObserver on the section's `active` class — but harmless to add.

## Notes for the coordinator

- Storage key: `coalition-collection-v1`, separate from `coalition-items-v4`. Entry shape:
  `{ id, title, setName, quantity, estValue, favorite, photo, notes, addedAt }` (photo = dataUrl, downscaled to 640px JPEG client-side before save).
- Form + detail overlays are injected by the module at init using the app's existing `.sheet` / `.sheet-card` / `.btn` classes — no new overlay markup needed in index.html.
- All inputs are standard text/number/file/textarea; the file input is hidden by coalition.css's `input[type="file"] { display: none; }` rule and triggered via its `<label>`.
- Palette follows the tokens: olive `#7a8b3f` / hot `#9aa84f` accents, sand `#d4c4a0` for values, zero brown, zero blue/teal.
- 390px-first grid (2-up), 3-up at 560px+, vertical everything.
