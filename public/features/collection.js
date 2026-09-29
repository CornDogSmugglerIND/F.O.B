/* Coalition H.U.D. — Collection manager (personal keepers, NOT for sale)
 *
 * Self-contained vanilla-JS module. Lives outside coalition.js on purpose:
 * coalition.js is a module bundle whose helpers ($, toast, money, ...) are
 * module-scoped, so this file carries its own tiny copies and talks to the
 * host app only through the DOM + localStorage.
 *
 * Contract:
 *   window.HUD_collection = { init(), render(), refresh() }
 *   - init()   : wire everything. Waits for #constellationCollection to exist, so it
 *                is safe to load this script before the coordinator pastes the
 *                section skeleton into index.html.
 *   - render() : repaint header stats + grid (no-op until wired).
 *   - refresh(): alias of render(); coordinator may call it from render() in
 *                coalition.js after adding "collection" to VIEWS.
 *
 * Storage: localStorage "coalition-collection-v1"
 * Entry: { id, title, setName, quantity, estValue, favorite, photo, notes, addedAt }
 * photo is a dataUrl (downscaled client-side to keep the localStorage small).
 */

(function () {
  "use strict";

  const LS_COLLECTION = "coalition-collection-v1";
  const MAX_PHOTO_PX = 640;

  /* ---------- tiny local helpers (mirrors of the ones in coalition.js) ---------- */
  const $ = (id) => document.getElementById(id);

  function toast(msg) {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2800);
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n) {
    return `$${(Number(n) || 0).toFixed(2)}`;
  }

  function uid() {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : `col_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function fmtDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return "";
    }
  }

  /* ---------- state ---------- */
  const state = {
    items: [],
    filter: "all", // "all" | "favorites"
    wired: false,
    editingId: null, // null = add mode, id = edit mode
    formPhoto: "",   // scratch photo dataUrl while the form is open
    detailId: null,
  };

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_COLLECTION) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  /* Returns true on success. On quota failure, drops the photo of
   * stripPhotoId (photos are the bulk) and retries so item metadata is
   * never lost; returns false only if it still won't fit. */
  function save(stripPhotoId) {
    try {
      localStorage.setItem(LS_COLLECTION, JSON.stringify(state.items));
      return true;
    } catch (e) {
      /* quota exceeded */
    }
    if (stripPhotoId) {
      const it = get(stripPhotoId);
      if (it && it.photo) {
        it.photo = "";
        try {
          localStorage.setItem(LS_COLLECTION, JSON.stringify(state.items));
          return true;
        } catch (e2) { /* still full */ }
      }
    }
    return false;
  }

  function get(id) {
    return state.items.find((x) => x.id === id);
  }

  /* ---------- photo handling (downscale to protect localStorage) ---------- */
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  async function downscalePhoto(dataUrl) {
    try {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = dataUrl;
      });
      const scale = Math.min(1, MAX_PHOTO_PX / Math.max(img.width, img.height));
      if (scale >= 1 && dataUrl.length < 400000) return dataUrl;
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.78);
    } catch {
      return dataUrl;
    }
  }

  /* ---------- svg icons ---------- */
  const STAR_ON =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z"/></svg>';
  const STAR_OFF =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z"/></svg>';
  const PHOTO_PH =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M3 17l5-4 4 3 4-4 5 5"/></svg>';

  /* ---------- overlays (form + detail sheets) ---------- */
  function buildSheets() {
    if ($("colFormSheet")) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="sheet" id="colFormSheet" aria-hidden="true">
        <div class="sheet-card">
          <div class="chrome" id="colFormKicker">COLLECTION · ADD</div>
          <h2 id="colFormTitle" style="font-size:20px;margin:8px 0 12px;font-weight:700">Add keeper</h2>
          <div class="col-form">
            <label class="col-field"><span class="chrome">TITLE</span>
              <input id="colFTitle" type="text" maxlength="120" placeholder="Charizard ex" autocomplete="off" />
            </label>
            <label class="col-field"><span class="chrome">SET</span>
              <input id="colFSet" type="text" maxlength="80" placeholder="Prismatic Evolutions" autocomplete="off" />
            </label>
            <div class="col-row2">
              <label class="col-field"><span class="chrome">QTY</span>
                <input id="colFQty" type="number" min="1" step="1" inputmode="numeric" value="1" />
              </label>
              <label class="col-field"><span class="chrome">EST VALUE $</span>
                <input id="colFValue" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" />
              </label>
            </div>
            <label class="col-field"><span class="chrome">NOTES</span>
              <textarea id="colFNotes" rows="3" maxlength="500" placeholder="Why it's a keeper…"></textarea>
            </label>
            <div class="col-photo-block">
              <div class="chrome">PHOTO (OPTIONAL)</div>
              <div class="col-photo-row">
                <div class="col-photo-preview" id="colFPhotoPreview">${PHOTO_PH}</div>
                <div class="col-photo-btns">
                  <label class="btn btn-sm" for="colFPhoto">Choose photo</label>
                  <button type="button" class="btn btn-ghost btn-sm" id="colFClearPhoto" hidden>Clear</button>
                </div>
              </div>
              <input type="file" id="colFPhoto" accept="image/*" />
            </div>
            <button type="button" class="col-fav-toggle" id="colFFav" aria-pressed="false">
              <span class="col-fav-star">${STAR_OFF}</span><span>Favorite</span>
            </button>
          </div>
          <div class="sheet-actions">
            <button type="button" class="btn btn-amber" id="colFSave">Save</button>
            <button type="button" class="btn btn-ghost" id="colFBack">Back</button>
          </div>
        </div>
      </div>
      <div class="sheet" id="colDetailSheet" aria-hidden="true">
        <div class="sheet-card">
          <div class="chrome">COLLECTION · KEEPER</div>
          <div id="colDetailBody"></div>
          <div class="sheet-actions">
            <button type="button" class="btn" id="colDetailFav" aria-pressed="false">Favorite</button>
            <button type="button" class="btn" id="colDetailEdit">Edit</button>
            <button type="button" class="btn btn-ghost" id="colDetailRemove">Remove</button>
            <button type="button" class="btn btn-ghost" id="colDetailBack">Back</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    $("colFBack").addEventListener("click", closeForm);
    $("colFSave").addEventListener("click", saveForm);
    $("colFPhoto").addEventListener("change", onPhotoPicked);
    $("colFClearPhoto").addEventListener("click", () => {
      state.formPhoto = "";
      paintFormPhoto();
    });
    $("colFFav").addEventListener("click", () => {
      const t = $("colFFav");
      const on = t.getAttribute("aria-pressed") === "true";
      t.setAttribute("aria-pressed", String(!on));
      t.querySelector(".col-fav-star").innerHTML = !on ? STAR_ON : STAR_OFF;
    });
    $("colDetailBack").addEventListener("click", closeDetail);
    $("colDetailFav").addEventListener("click", toggleDetailFav);
    $("colDetailEdit").addEventListener("click", () => {
      const id = state.detailId;
      closeDetail();
      openForm(id);
    });
    $("colDetailRemove").addEventListener("click", removeDetail);
    if (!buildSheets._esc) {
      buildSheets._esc = true;
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { closeDetail(); closeForm(); }
      });
    }
  }

  /* ---------- form ---------- */
  function openForm(id) {
    const editing = id ? get(id) : null;
    state.editingId = editing ? editing.id : null;
    state.formPhoto = editing?.photo || "";
    $("colFormKicker").textContent = editing ? "COLLECTION · EDIT" : "COLLECTION · ADD";
    $("colFormTitle").textContent = editing ? "Edit keeper" : "Add keeper";
    $("colFTitle").value = editing?.title || "";
    $("colFSet").value = editing?.setName || "";
    $("colFQty").value = editing?.quantity ?? 1;
    $("colFValue").value = editing?.estValue ?? "";
    $("colFNotes").value = editing?.notes || "";
    const fav = $("colFFav");
    fav.setAttribute("aria-pressed", String(Boolean(editing?.favorite)));
    fav.querySelector(".col-fav-star").innerHTML = editing?.favorite ? STAR_ON : STAR_OFF;
    paintFormPhoto();
    const sheet = $("colFormSheet");
    sheet.setAttribute("aria-hidden", "false");
    sheet.classList.add("open");
    setTimeout(() => $("colFTitle").focus(), 60);
  }

  function closeForm() {
    state.editingId = null;
    state.formPhoto = "";
    const sheet = $("colFormSheet");
    sheet.setAttribute("aria-hidden", "true");
    sheet.classList.remove("open");
  }

  function paintFormPhoto() {
    const prev = $("colFPhotoPreview");
    const clear = $("colFClearPhoto");
    if (state.formPhoto) {
      prev.innerHTML = `<img src="${state.formPhoto}" alt="Keeper photo" />`;
      clear.hidden = false;
    } else {
      prev.innerHTML = PHOTO_PH;
      clear.hidden = true;
    }
  }

  async function onPhotoPicked(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const raw = await fileToDataUrl(file);
      state.formPhoto = await downscalePhoto(raw);
      paintFormPhoto();
    } catch {
      toast("Could not read that photo");
    }
    e.target.value = "";
  }

  function saveForm() {
    const title = $("colFTitle").value.trim();
    if (!title) {
      toast("Title is required");
      $("colFTitle").focus();
      return;
    }
    const qty = Math.max(1, Math.round(Number($("colFQty").value) || 1));
    const val = Math.max(0, Number($("colFValue").value) || 0);
    const favorite = $("colFFav").getAttribute("aria-pressed") === "true";
    const notes = $("colFNotes").value.trim();
    const setName = $("colFSet").value.trim();
    const now = new Date().toISOString();
    if (state.editingId) {
      const it = get(state.editingId);
      if (!it) { closeForm(); render(); return; }
      const oldPhoto = it.photo;
      it.title = title;
      it.setName = setName;
      it.quantity = qty;
      it.estValue = val;
      it.notes = notes;
      it.favorite = favorite;
      it.photo = state.formPhoto || "";
      if (!save(it.id)) {
        it.photo = oldPhoto; // restore, keep form open so nothing is lost
        toast("Collection storage is full — changes not saved");
        return;
      }
      toast("Keeper updated");
    } else {
      const item = {
        id: uid(),
        title,
        setName,
        quantity: qty,
        estValue: val,
        favorite,
        photo: state.formPhoto || "",
        notes,
        addedAt: now,
        order: state.items.length,
      };
      state.items.push(item);
      if (!save(item.id)) {
        state.items = state.items.filter((x) => x.id !== item.id);
        toast("Collection storage is full — keeper not saved");
        return;
      }
      toast("Added to collection");
    }
    closeForm();
    render();
  }

  /* ---------- detail ---------- */
  function openDetail(id) {
    const it = get(id);
    if (!it) return;
    state.detailId = id;
    const body = $("colDetailBody");
    body.innerHTML = `
      ${it.photo ? `<img class="col-detail-photo" src="${it.photo}" alt="" />` : ""}
      <div class="col-detail-title-row">
        <h2>${escapeHtml(it.title)}</h2>
        <span class="col-star ${it.favorite ? "on" : ""}">${it.favorite ? STAR_ON : STAR_OFF}</span>
      </div>
      <p class="col-detail-meta">
        ${it.setName ? escapeHtml(it.setName) + " · " : ""}qty ${it.quantity || 1} · ${money(it.estValue)}${it.addedAt ? ` · kept ${fmtDate(it.addedAt)}` : ""}
      </p>
      ${it.notes ? `<p class="col-detail-notes">${escapeHtml(it.notes)}</p>` : ""}
    `;
    $("colDetailFav").textContent = it.favorite ? "Favorited" : "Favorite";
    $("colDetailFav").setAttribute("aria-pressed", String(Boolean(it.favorite)));
    const sheet = $("colDetailSheet");
    sheet.setAttribute("aria-hidden", "false");
    sheet.classList.add("open");
  }

  function closeDetail() {
    state.detailId = null;
    const sheet = $("colDetailSheet");
    sheet.setAttribute("aria-hidden", "true");
    sheet.classList.remove("open");
  }

  function toggleDetailFav() {
    const it = get(state.detailId);
    if (!it) return;
    it.favorite = !it.favorite;
    if (!save()) {
      it.favorite = !it.favorite; // revert: storage is full
      toast("Collection storage is full — favorite not saved");
      return;
    }
    openDetail(it.id);
    render();
  }

  function removeDetail() {
    const it = get(state.detailId);
    if (!it) return;
    if (!confirm(`Remove "${it.title}" from your collection?`)) return;
    state.items = state.items.filter((x) => x.id !== it.id);
    save();
    closeDetail();
    render();
    toast("Removed from collection");
  }

  /* ---------- grid card ---------- */
  function cardHtml(it) {
    return `
      <button type="button" class="col-card" data-col="${it.id}" draggable="true">
        <span class="col-thumb">${it.photo ? `<img src="${it.photo}" alt="" loading="lazy" />` : PHOTO_PH}</span>
        <span class="col-star ${it.favorite ? "on" : ""}">${it.favorite ? STAR_ON : STAR_OFF}</span>
        <span class="col-card-title">${escapeHtml(it.title)}</span>
        <span class="col-card-sub">${it.setName ? escapeHtml(it.setName) + " · " : ""}qty ${it.quantity || 1}</span>
        <span class="col-card-value">${money(it.estValue)}</span>
      </button>`;
  }

  /* ---------- main render ---------- */
  function visibleItems() {
    const list = state.filter === "favorites" ? state.items.filter((i) => i.favorite) : state.items;
    const manual = list.some((i) => i.order != null);
    if (manual) return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return [...list].sort((a, b) => String(b.addedAt || "").localeCompare(String(a.addedAt || "")));
  }

  /* ---------- drag-and-drop reorder ---------- */
  function bindReorder(section) {
    const grid = section.querySelector(".col-grid");
    if (!grid) return;
    let dragId = null;
    grid.addEventListener("dragstart", (e) => {
      const card = e.target.closest ? e.target.closest("[data-col]") : null;
      if (!card) return;
      dragId = card.dataset.col;
      try { e.dataTransfer.setData("text/plain", dragId); } catch (_) {}
      e.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging-src");
    });
    grid.addEventListener("dragend", () => {
      dragId = null;
      section.querySelectorAll(".dragging-src").forEach((el) => el.classList.remove("dragging-src"));
    });
    grid.addEventListener("dragover", (e) => {
      const card = e.target.closest ? e.target.closest("[data-col]") : null;
      if (!card || card.dataset.col === dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    grid.addEventListener("drop", (e) => {
      const card = e.target.closest ? e.target.closest("[data-col]") : null;
      if (!card || !dragId || card.dataset.col === dragId) return;
      e.preventDefault();
      const fromIdx = state.items.findIndex((i) => i.id === dragId);
      const toIdx = state.items.findIndex((i) => i.id === card.dataset.col);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = state.items.splice(fromIdx, 1);
      state.items.splice(toIdx, 0, moved);
      state.items.forEach((it, idx) => { it.order = idx; });
      save();
      render();
    });
  }

  function render() {
    const section = $("constellationCollection");
    if (!section || !state.wired) return;
    const total = state.items.reduce((s, i) => s + Number(i.estValue || 0) * Number(i.quantity || 1), 0);
    const favs = state.items.filter((i) => i.favorite).length;
    const list = visibleItems();

    section.innerHTML = `
      <div class="stat-row">
        <div class="stat"><div class="k">KEEPERS</div><div class="n">${state.items.length}</div></div>
        <div class="stat"><div class="k">EST VALUE</div><div class="n cyan">${money(total)}</div></div>
        <div class="stat"><div class="k">FAVORITES</div><div class="n hot">${favs}</div></div>
      </div>
      <div class="col-toolbar">
        <div class="col-filter" role="tablist" aria-label="Collection filter">
          <button type="button" class="col-filter-btn ${state.filter === "all" ? "active" : ""}" data-f="all">All</button>
          <button type="button" class="col-filter-btn ${state.filter === "favorites" ? "active" : ""}" data-f="favorites">Favorites</button>
        </div>
        <button type="button" class="btn btn-amber btn-sm" id="colAddBtn">Add</button>
      </div>
      ${list.length
        ? `<div class="col-grid">${list.map(cardHtml).join("")}</div>`
        : `<div class="col-empty">${PHOTO_PH}<p>${state.filter === "favorites" ? "No favorites yet — star a keeper to pin it here." : "Nothing kept yet. This is the personal stash, not for sale."}</p><button type="button" class="btn btn-amber col-empty-add" id="colEmptyAdd">Add keeper</button></div>`}
    `;

    section.querySelector("#colAddBtn").addEventListener("click", () => openForm(null));
    const emptyAdd = section.querySelector("#colEmptyAdd");
    if (emptyAdd) emptyAdd.addEventListener("click", () => openForm(null));
    section.querySelectorAll(".col-filter-btn").forEach((b) =>
      b.addEventListener("click", () => {
        state.filter = b.dataset.f;
        render();
      })
    );
    section.querySelectorAll("[data-col]").forEach((c) =>
      c.addEventListener("click", () => openDetail(c.dataset.col))
    );
    bindReorder(section);
  }

  /* ---------- wiring ---------- */
  function wire() {
    if (state.wired) return;
    const section = $("constellationCollection");
    if (!section) return;
    state.wired = true;
    state.items = load();
    buildSheets();

    // Repaint whenever the host app shows the collection mode of the
    // constellation view (MutationObserver keeps this module self-contained:
    // no edits to navigate() needed).
    const host = $("view-constellation");
    const maybeRender = () => {
      if (host && host.classList.contains("active") && !section.hasAttribute("hidden")) render();
    };
    if (host) new MutationObserver(maybeRender).observe(host, { attributes: true, attributeFilter: ["class"] });
    new MutationObserver(maybeRender).observe(section, { attributes: true, attributeFilter: ["hidden"] });

    maybeRender();
  }

  function waitForSection() {
    if ($("constellationCollection")) {
      wire();
      return;
    }
    new MutationObserver((_, obs) => {
      if ($("constellationCollection")) {
        obs.disconnect();
        wire();
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", waitForSection, { once: true });
    } else {
      waitForSection();
    }
  }

  window.HUD_collection = { init, render, refresh: render };
})();
