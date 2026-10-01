/* Coalition H.U.D. — Spaces interactivity
 *
 * Bin detail overlay, drag-and-drop filing between bins, and a draggable
 * unsorted-pool strip. Self-contained: drops onto the existing app without
 * editing coalition.js or index.html.
 *
 * Exposes: window.HUD_spaces = { init(), openBinDetail(spaceId),
 *                                closeBinDetail(), refresh() }
 *
 * Bridge note: coalition.js is an ES module, so its helpers (toast, openSheet,
 * state, ...) are NOT on window unless the integrator exposes them (see
 * INTEGRATION.md). Every helper below resolves lazily at call time and falls
 * back to a local implementation / direct localStorage access, so this module
 * works either way.
 */
(function () {
  "use strict";

  var LS_ITEMS = "coalition-items-v4";
  var LS_SPACES = "coalition-spaces-v4";
  var LONG_PRESS_MS = 500;
  var MOVE_CANCEL_PX = 12;
  var POOL_STRIP_MAX = 48;

  var currentSpaceId = null;
  var overlayOpen = false;
  var suppressClickUntil = 0;
  var tDrag = null; // active/pending touch drag
  var fallbackItems = null; // localStorage-backed item array when window.state is absent
  var lastFocused = null; // element focused before the overlay opened

  /* ---------------- app bridge (lazy, with fallbacks) ---------------- */

  // coalition.js is an ES module: it exposes internals as window.HUDcore
  // ({ state, saveItems, render, toast, spaceName, escapeHtml, money,
  //   openSheet }), NOT as bare window.* globals. Resolve HUDcore first,
  // then the legacy bare globals, then local fallbacks.
  function hud() {
    return window.HUDcore || null;
  }

  function appState() {
    var h = hud();
    if (h && h.state && Array.isArray(h.state.items)) return h.state;
    if (window.state && Array.isArray(window.state.items)) return window.state;
    return null;
  }

  function readItems() {
    var st = appState();
    if (st) {
      fallbackItems = null;
      return st.items;
    }
    try {
      var raw = JSON.parse(localStorage.getItem(LS_ITEMS) || "[]");
      fallbackItems = Array.isArray(raw) ? raw : [];
    } catch (e) {
      fallbackItems = [];
    }
    return fallbackItems;
  }

  function readSpaces() {
    var st = appState();
    if (st && Array.isArray(st.spaces)) return st.spaces;
    try {
      var raw = JSON.parse(localStorage.getItem(LS_SPACES) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function persistItems() {
    // Returns true when the write landed. Callers must roll back on false —
    // a silent success toast after a failed save is a lie the app tells often.
    var h = hud();
    if (h && typeof h.saveItems === "function") {
      try {
        return h.saveItems() === true;
      } catch (e) {
        return false;
      }
    }
    if (typeof window.saveItems === "function") {
      try {
        return window.saveItems() === true;
      } catch (e) {
        return false;
      }
    }
    var st = appState();
    var items = st ? st.items : fallbackItems;
    if (items) {
      try {
        localStorage.setItem(LS_ITEMS, JSON.stringify(items));
        return true;
      } catch (e) {
        showToast("Storage full — filing not saved, nothing changed");
        return false;
      }
    }
    return false;
  }

  function readSpace(id) {
    var spaces = readSpaces();
    for (var i = 0; i < spaces.length; i++) {
      if (spaces[i] && spaces[i].id === id) return spaces[i];
    }
    return null;
  }

  function persistSpaces() {
    // Returns true when the write landed. Bin-cover changes must roll back
    // on false, same contract as persistItems().
    var h = hud();
    if (h && typeof h.saveSpaces === "function") {
      try {
        return h.saveSpaces() === true;
      } catch (e) {
        return false;
      }
    }
    var spaces = readSpaces();
    try {
      localStorage.setItem(LS_SPACES, JSON.stringify(spaces));
      return true;
    } catch (e) {
      showToast("Storage full — bin change not saved, nothing changed");
      return false;
    }
  }

  function setSpaceCover(spaceId, dataUrl) {
    var sp = readSpace(spaceId);
    if (!sp) return;
    var before = sp.cover || null;
    sp.cover = dataUrl || null;
    if (!persistSpaces()) {
      // Storage refused — restore so memory matches disk. The save path
      // already showed the honest toast. Nothing is lost.
      sp.cover = before;
      return;
    }
    paintCover();
    refresh();
  }

  function esc(s) {
    var h = hud();
    if (h && typeof h.escapeHtml === "function") return h.escapeHtml(s);
    if (typeof window.escapeHtml === "function") return window.escapeHtml(s);
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function moneyOf(n) {
    var h = hud();
    if (h && typeof h.money === "function") return h.money(n);
    if (typeof window.money === "function") return window.money(n);
    return "$" + (Number(n) || 0).toFixed(2);
  }

  function spaceNameOf(id) {
    var h = hud();
    if (h && typeof h.spaceName === "function") return h.spaceName(id);
    if (typeof window.spaceName === "function") return window.spaceName(id);
    var spaces = readSpaces();
    for (var i = 0; i < spaces.length; i++) {
      if (spaces[i].id === id) return spaces[i].name || id;
    }
    return id;
  }

  function showToast(msg) {
    var h = hud();
    if (h && typeof h.toast === "function") {
      h.toast(msg);
      return;
    }
    if (typeof window.toast === "function") {
      window.toast(msg);
      return;
    }
    var el = document.getElementById("spToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "spToast";
      el.className = "sp-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      el.classList.remove("show");
    }, 2800);
  }

  function openItemSheet(id) {
    var h = hud();
    if (h && typeof h.openSheet === "function") {
      h.openSheet(id);
      return;
    }
    if (typeof window.openSheet === "function") window.openSheet(id);
  }

  /* ---------------- core action ---------------- */

  function moveItemToSpace(itemId, spaceId) {
    if (!itemId || !spaceId) return;
    var items = readItems();
    var it = null;
    for (var i = 0; i < items.length; i++) {
      if (String(items[i].id) === String(itemId)) {
        it = items[i];
        break;
      }
    }
    if (!it) return;
    if (it.spaceId === spaceId) return; // dropped back in its own bin: no-op
    var before = it.spaceId;
    it.spaceId = spaceId;
    it.updatedAt = new Date().toISOString();
    if (!persistItems()) {
      // Storage refused — restore so memory matches disk. The save path
      // already showed the honest toast. Nothing is lost.
      it.spaceId = before;
      return;
    }
    showToast("Filed in " + spaceNameOf(spaceId));
    refresh();
  }

  function unfileItem(itemId) {
    // Remove an item from its bin back to the unsorted pool.
    if (!itemId) return;
    var items = readItems();
    var it = null;
    for (var i = 0; i < items.length; i++) {
      if (String(items[i].id) === String(itemId)) {
        it = items[i];
        break;
      }
    }
    if (!it || !it.spaceId) return;
    var before = it.spaceId;
    it.spaceId = null;
    it.updatedAt = new Date().toISOString();
    if (!persistItems()) {
      it.spaceId = before;
      return;
    }
    showToast("Moved to unsorted");
    refresh();
  }

  /* ---------------- item cell markup (shared) ---------------- */

  function cellHTML(it, opts) {
    var src = (it.photos && it.photos[0] && it.photos[0].dataUrl) || "";
    var title = esc(it.title || it.productName || "Untitled");
    var thumb = src
      ? '<img src="' + src + '" alt="" loading="lazy" draggable="false" />'
      : '<span class="sp-ph" aria-hidden="true"></span>';
    // The remove button is a sibling of the cell button, never nested —
    // nested buttons are invalid HTML and break tap handling.
    var unfile =
      opts && opts.unfile
        ? '<button type="button" class="sp-unfile" data-unfile="' +
          esc(it.id) +
          '" aria-label="Remove from bin">&times;</button>'
        : "";
    return (
      '<span class="sp-cellwrap">' +
      '<button type="button" class="sp-cell" data-item="' +
      esc(it.id) +
      '" draggable="true">' +
      '<span class="sp-thumb">' +
      thumb +
      "</span>" +
      '<span class="sp-name">' +
      title +
      "</span>" +
      '<span class="sp-price">' +
      esc(moneyOf(it.price)) +
      "</span>" +
      "</button>" +
      unfile +
      "</span>"
    );
  }

  /* ---------------- bin detail overlay ---------------- */

  function ensureOverlay() {
    var ov = document.getElementById("binDetailSheet");
    if (ov) return ov;
    ov = document.createElement("div");
    ov.className = "sheet bd-sheet";
    ov.id = "binDetailSheet";
    ov.setAttribute("aria-hidden", "true");
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-label", "Bin detail");
    ov.innerHTML =
      '<div class="sheet-card bd-card" id="binDetailCard">' +
      '<div class="bd-head">' +
      '<button type="button" class="bd-back" id="binDetailBack">' +
      '<span class="bd-back-arrow" aria-hidden="true">&#8249;</span>' +
      "<span>BACK</span>" +
      "</button>" +
      '<div class="bd-titlewrap">' +
      '<h2 class="bd-title" id="binDetailTitle">Bin</h2>' +
      '<span class="bd-count" id="binDetailCount"></span>' +
      "</div>" +
      "</div>" +
      '<div class="bd-coverwrap" id="binCoverWrap">' +
      '<button type="button" class="bd-cover" id="binDetailCover" aria-label="Bin photo — tap to add or change"></button>' +
      '<div class="bd-chooser" id="binCoverChooser" hidden></div>' +
      "</div>" +
      '<div class="bd-grid" id="binDetailGrid"></div>' +
      '<p class="bd-hint">Drag items onto a bin to file them</p>' +
      "</div>";
    document.body.appendChild(ov);

    ov.querySelector("#binDetailBack").addEventListener("click", closeBinDetail);
    // backdrop tap closes (tap on the sheet itself, not the card)
    ov.addEventListener("click", function (e) {
      if (e.target === ov) closeBinDetail();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlayOpen) closeBinDetail();
    });

    // desktop HTML5 drop target: the whole card files into the open bin
    var card = ov.querySelector("#binDetailCard");
    card.addEventListener("dragover", function (e) {
      if (!overlayOpen) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      card.classList.add("drop-hint");
    });
    card.addEventListener("dragleave", function (e) {
      if (!card.contains(e.relatedTarget)) card.classList.remove("drop-hint");
    });
    card.addEventListener("drop", function (e) {
      if (!overlayOpen || !currentSpaceId) return;
      e.preventDefault();
      card.classList.remove("drop-hint");
      var itemId = e.dataTransfer.getData("text/plain");
      moveItemToSpace(itemId, currentSpaceId);
    });

    return ov;
  }

  function renderBinGrid() {
    if (!currentSpaceId) return;
    var ov = document.getElementById("binDetailSheet");
    if (!ov) return;
    var items = readItems().filter(function (i) {
      return i.spaceId === currentSpaceId;
    });
    ov.querySelector("#binDetailTitle").textContent = spaceNameOf(currentSpaceId);
    ov.querySelector("#binDetailCount").textContent =
      items.length + (items.length === 1 ? " ITEM" : " ITEMS");
    var grid = ov.querySelector("#binDetailGrid");
    grid.innerHTML = items.length
      ? items
          .map(function (it) {
            return cellHTML(it, { unfile: true });
          })
          .join("")
      : '<div class="bd-empty">No items filed here yet.<br />Drag items onto this bin to file them.</div>';
  }

  /* ---------------- bin photo slot (swappable, never fake art) ---------------- */

  // The bin's hero photo. Null until Sawyer adds a real one — the slot then
  // renders as an obvious empty placeholder. No stock art, ever.
  var coverChooserOpen = false;

  function safeCover(sp) {
    var c = sp && sp.cover;
    // Only data URLs we wrote ourselves. Anything else (old stock paths,
    // junk from an older save) renders as the empty slot.
    return typeof c === "string" && c.indexOf("data:image/") === 0 ? c : null;
  }

  function paintCover() {
    if (!overlayOpen || !currentSpaceId) return;
    var slot = document.getElementById("binDetailCover");
    var chooser = document.getElementById("binCoverChooser");
    if (!slot || !chooser) return;
    var cover = safeCover(readSpace(currentSpaceId));
    if (coverChooserOpen) {
      slot.setAttribute("hidden", "");
      chooser.removeAttribute("hidden");
      paintChooser(chooser, cover);
      return;
    }
    chooser.setAttribute("hidden", "");
    slot.removeAttribute("hidden");
    slot.classList.toggle("has-photo", !!cover);
    slot.innerHTML = cover
      ? '<img src="' + cover + '" alt="" draggable="false" />' +
        '<span class="bd-cover-change">Swap photo</span>'
      : '<span class="bd-cover-empty">' +
        '<span class="bd-cover-empty-t">Tap to add photo</span>' +
        '<span class="bd-cover-empty-s">A real photo of this bin — nothing shown until you add one</span>' +
        "</span>";
  }

  function paintChooser(chooser, cover) {
    var items = readItems().filter(function (i) {
      return (
        i.spaceId === currentSpaceId && i.photos && i.photos.length && i.photos[0].dataUrl
      );
    });
    var thumbs = items
      .map(function (it) {
        return (
          '<button type="button" class="bd-pick" data-cover-pick="' +
          esc(it.id) +
          '" aria-label="Use this item photo as the bin photo">' +
          '<img src="' +
          it.photos[0].dataUrl +
          '" alt="" loading="lazy" draggable="false" />' +
          "</button>"
        );
      })
      .join("");
    chooser.innerHTML =
      '<div class="bd-chooser-t">Bin photo</div>' +
      (thumbs
        ? '<div class="bd-chooser-grid">' +
          thumbs +
          "</div>" +
          '<div class="bd-chooser-s">Use an item photo</div>'
        : "") +
      '<div class="bd-chooser-btns">' +
      '<button type="button" class="bd-chooser-btn" data-cover-act="camera">Take photo</button>' +
      '<button type="button" class="bd-chooser-btn" data-cover-act="library">Choose from library</button>' +
      (cover
        ? '<button type="button" class="bd-chooser-btn danger" data-cover-act="remove">Remove photo</button>'
        : "") +
      '<button type="button" class="bd-chooser-btn ghost" data-cover-act="cancel">Cancel</button>' +
      "</div>";
  }

  function coverFileInput() {
    var inp = document.getElementById("binCoverFile");
    if (inp) return inp;
    inp = document.createElement("input");
    inp.type = "file";
    inp.id = "binCoverFile";
    inp.accept = "image/*";
    inp.style.display = "none";
    inp.addEventListener("change", onCoverFile);
    document.body.appendChild(inp);
    return inp;
  }

  function readAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var SI = window.ScouterImage;
      if (SI && typeof SI.fileToDataUrl === "function") {
        SI.fileToDataUrl(file).then(resolve, reject);
        return;
      }
      var r = new FileReader();
      r.onload = function () {
        resolve(r.result);
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function onCoverFile(e) {
    var files = (e.target && e.target.files) || [];
    var file = files[0];
    e.target.value = ""; // allow picking the same file twice
    if (!file || !currentSpaceId) return;
    var spaceId = currentSpaceId;
    var finish = function (f) {
      readAsDataUrl(f).then(
        function (dataUrl) {
          coverChooserOpen = false;
          setSpaceCover(spaceId, dataUrl);
        },
        function () {
          showToast("Could not read that photo — nothing changed");
        }
      );
    };
    // Compress the copy like intake does; the stored photo is untouched.
    // On any failure we keep the original file — never lose the photo.
    var SI = window.ScouterImage;
    if (SI && typeof SI.compressPhoto === "function") {
      SI.compressPhoto(file).then(finish, function () {
        finish(file);
      });
    } else {
      finish(file);
    }
  }

  function openCoverChooser() {
    coverChooserOpen = true;
    paintCover();
  }

  function closeCoverChooser() {
    coverChooserOpen = false;
    paintCover();
  }

  function onCoverAction(act) {
    if (!currentSpaceId) return;
    var spaceId = currentSpaceId;
    if (act === "cancel") {
      closeCoverChooser();
      return;
    }
    if (act === "remove") {
      coverChooserOpen = false;
      setSpaceCover(spaceId, null);
      showToast("Bin photo removed");
      return;
    }
    if (act === "camera" || act === "library") {
      var inp = coverFileInput();
      if (act === "camera") inp.setAttribute("capture", "environment");
      else inp.removeAttribute("capture");
      inp.click();
    }
  }

  function onCoverPick(itemId) {
    if (!currentSpaceId) return;
    var items = readItems();
    var it = null;
    for (var i = 0; i < items.length; i++) {
      if (String(items[i].id) === String(itemId)) {
        it = items[i];
        break;
      }
    }
    var src = it && it.photos && it.photos[0] && it.photos[0].dataUrl;
    if (!src) {
      showToast("That photo is gone — nothing changed");
      return;
    }
    // Item photos are already intake-compressed; reuse the data as-is.
    coverChooserOpen = false;
    setSpaceCover(currentSpaceId, src);
  }

  function bindCover() {
    document.addEventListener("click", function (e) {
      var slot = e.target.closest ? e.target.closest("#binDetailCover") : null;
      if (slot) {
        openCoverChooser();
        return;
      }
      var pick = e.target.closest ? e.target.closest("[data-cover-pick]") : null;
      if (pick) {
        onCoverPick(pick.getAttribute("data-cover-pick"));
        return;
      }
      var act = e.target.closest ? e.target.closest("[data-cover-act]") : null;
      if (act) onCoverAction(act.getAttribute("data-cover-act"));
    });
  }

  function openBinDetail(spaceId) {
    if (!spaceId) return;
    currentSpaceId = spaceId;
    coverChooserOpen = false;
    var ov = ensureOverlay();
    lastFocused = document.activeElement;
    ov.querySelector("#binDetailCard").setAttribute("data-space", spaceId);
    renderBinGrid();
    paintCover();
    ov.classList.add("open");
    ov.setAttribute("aria-hidden", "false");
    overlayOpen = true;
    paintCover();
    var back = ov.querySelector("#binDetailBack");
    if (back && back.focus) {
      try {
        back.focus({ preventScroll: true });
      } catch (e) {
        back.focus();
      }
    }
  }

  function closeBinDetail() {
    currentSpaceId = null;
    overlayOpen = false;
    coverChooserOpen = false;
    cleanupTouchDrag();
    var ov = document.getElementById("binDetailSheet");
    if (ov) {
      ov.classList.remove("open");
      ov.setAttribute("aria-hidden", "true");
    }
    if (lastFocused && lastFocused.focus) {
      try {
        lastFocused.focus({ preventScroll: true });
      } catch (e) {
        /* focus restore is best-effort */
      }
    }
    lastFocused = null;
  }

  /* ---------------- unsorted pool strip ---------------- */

  function augmentPool() {
    var pool = document.getElementById("unsortedPool");
    if (!pool || pool.querySelector(".pool-strip")) return;
    var items = readItems().filter(function (i) {
      return !i.spaceId;
    });
    if (!items.length) return;
    var shown = items.slice(0, POOL_STRIP_MAX);
    var html =
      '<div class="pool-strip" aria-label="Unsorted items — drag one into a bin">' +
      shown.map(cellHTML).join("") +
      (items.length > POOL_STRIP_MAX
        ? '<span class="pool-more">+' + (items.length - POOL_STRIP_MAX) + " more</span>"
        : "") +
      "</div>";
    pool.insertAdjacentHTML("beforeend", html);
  }

  function watchPool() {
    var pool = document.getElementById("unsortedPool");
    if (!pool || pool._spWatched) return;
    pool._spWatched = true;
    // coalition.js rewrites #unsortedPool innerHTML on every renderSpaces();
    // re-add the draggable strip right after (marker-guarded, no loop).
    new MutationObserver(function () {
      augmentPool();
    }).observe(pool, { childList: true });
  }

  /* ---------------- desktop HTML5 drag ---------------- */

  function clearDropHints() {
    var els = document.querySelectorAll(".drop-hint");
    for (var i = 0; i < els.length; i++) els[i].classList.remove("drop-hint");
  }

  function bindDesktopDrag() {
    document.addEventListener("dragstart", function (e) {
      var cell =
        e.target && e.target.closest ? e.target.closest(".sp-cell") : null;
      if (!cell) return;
      var id = cell.getAttribute("data-item");
      if (!id) return;
      try {
        e.dataTransfer.setData("text/plain", id);
      } catch (err) {
        return;
      }
      e.dataTransfer.effectAllowed = "move";
      cell.classList.add("dragging-src");
    });

    document.addEventListener("dragend", function () {
      var els = document.querySelectorAll(".dragging-src");
      for (var i = 0; i < els.length; i++)
        els[i].classList.remove("dragging-src");
      clearDropHints();
    });
  }

  /* ---------------- bin node drop targets ---------------- */

  function bindNodes() {
    var nodes = document.getElementById("spacesNodes");
    if (!nodes) return;
    // Delegated — survives coalition.js re-rendering the node buttons.
    nodes.addEventListener("click", function (e) {
      // Swallow the synthetic click that follows a touch drag onto a bin,
      // or the drag would drop the item AND open the bin overlay.
      if (Date.now() < suppressClickUntil) return;
      var n = e.target.closest ? e.target.closest("[data-space]") : null;
      if (n) openBinDetail(n.getAttribute("data-space"));
    });
    nodes.addEventListener("dragover", function (e) {
      var n = e.target.closest ? e.target.closest("[data-space]") : null;
      if (!n) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      // dragover fires continuously; only toggle classes on change so the
      // 300ms highlight transition doesn't restart every tick.
      if (!n.classList.contains("drop-hint")) {
        clearDropHints();
        n.classList.add("drop-hint");
      }
    });
    nodes.addEventListener("dragleave", function (e) {
      var n = e.target.closest ? e.target.closest("[data-space]") : null;
      if (n && !n.contains(e.relatedTarget)) n.classList.remove("drop-hint");
    });
    nodes.addEventListener("drop", function (e) {
      var n = e.target.closest ? e.target.closest("[data-space]") : null;
      if (!n) return;
      e.preventDefault();
      clearDropHints();
      var itemId = e.dataTransfer.getData("text/plain");
      moveItemToSpace(itemId, n.getAttribute("data-space"));
    });
  }

  /* ---------------- touch drag (long-press, clone follows finger) ---------------- */

  function dropTargetAt(x, y) {
    var el = document.elementFromPoint(x, y);
    var z = el && el.closest ? el.closest("[data-space]") : null;
    return z ? z.getAttribute("data-space") : null;
  }

  function highlightAt(x, y) {
    clearDropHints();
    var el = document.elementFromPoint(x, y);
    var z = el && el.closest ? el.closest("[data-space]") : null;
    if (z) z.classList.add("drop-hint");
  }

  function positionClone(clone, x, y) {
    var w = clone.offsetWidth || 120;
    var h = clone.offsetHeight || 120;
    clone.style.transform =
      "translate(" + (x - w / 2) + "px," + (y - h / 2 - 24) + "px) scale(1.04)";
  }

  function startTouchDrag() {
    if (!tDrag || tDrag.active) return;
    tDrag.active = true;
    var r = tDrag.el.getBoundingClientRect();
    var clone = tDrag.el.cloneNode(true);
    clone.className = "sp-clone";
    clone.style.width = r.width + "px";
    clone.style.height = r.height + "px";
    clone.style.left = "0";
    clone.style.top = "0";
    document.body.appendChild(clone);
    tDrag.clone = clone;
    tDrag.el.classList.add("dragging-src");
    positionClone(clone, tDrag.x0, tDrag.y0);
    if (navigator.vibrate) {
      try {
        navigator.vibrate(12);
      } catch (e) {
        /* not critical */
      }
    }
  }

  function cancelTouchDrag() {
    if (tDrag && tDrag.timer) clearTimeout(tDrag.timer);
    cleanupTouchDrag();
  }

  function cleanupTouchDrag() {
    document.removeEventListener("touchmove", onTouchMove);
    document.removeEventListener("touchend", onTouchEnd);
    document.removeEventListener("touchcancel", onTouchCancel);
    if (tDrag) {
      clearTimeout(tDrag.timer);
      if (tDrag.clone && tDrag.clone.parentNode)
        tDrag.clone.parentNode.removeChild(tDrag.clone);
      if (tDrag.el) tDrag.el.classList.remove("dragging-src");
      tDrag = null;
    }
    clearDropHints();
  }

  function touchById(e, id) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === id) return e.changedTouches[i];
    }
    return null;
  }

  function onTouchStart(e) {
    if (tDrag) return; // one drag at a time
    if (e.touches.length > 1) return;
    var cell = e.target.closest ? e.target.closest(".sp-cell") : null;
    if (!cell) return;
    var t = e.changedTouches[0];
    tDrag = {
      itemId: cell.getAttribute("data-item"),
      el: cell,
      x0: t.clientX,
      y0: t.clientY,
      id: t.identifier,
      active: false,
      clone: null,
      timer: null,
    };
    tDrag.timer = setTimeout(startTouchDrag, LONG_PRESS_MS);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchCancel, { passive: true });
  }

  function onTouchMove(e) {
    if (!tDrag) return;
    var t = touchById(e, tDrag.id);
    if (!t) return;
    if (!tDrag.active) {
      // still in the long-press window: finger wandering = scrolling, not dragging
      var dx = t.clientX - tDrag.x0;
      var dy = t.clientY - tDrag.y0;
      if (Math.sqrt(dx * dx + dy * dy) > MOVE_CANCEL_PX) cancelTouchDrag();
      return;
    }
    e.preventDefault(); // hold the page still while the clone follows the finger
    positionClone(tDrag.clone, t.clientX, t.clientY);
    highlightAt(t.clientX, t.clientY);
  }

  function onTouchEnd(e) {
    if (!tDrag) return;
    var t = touchById(e, tDrag.id);
    if (!t) return;
    clearTimeout(tDrag.timer);
    if (tDrag.active) {
      var target = dropTargetAt(t.clientX, t.clientY);
      if (target) moveItemToSpace(tDrag.itemId, target);
      // swallow the synthetic click that follows a touch drag
      suppressClickUntil = Date.now() + 500;
    }
    cleanupTouchDrag();
  }

  function onTouchCancel() {
    cancelTouchDrag();
  }

  /* ---------------- taps ---------------- */

  function bindTaps() {
    document.addEventListener(
      "click",
      function (e) {
        if (Date.now() < suppressClickUntil) return;
        // Remove-from-bin: the × sits beside the cell button, never inside it,
        // so this never collides with the open-sheet tap below.
        var un = e.target.closest ? e.target.closest("[data-unfile]") : null;
        if (un) {
          e.stopPropagation();
          unfileItem(un.getAttribute("data-unfile"));
          return;
        }
        var cell = e.target.closest ? e.target.closest(".sp-cell") : null;
        if (!cell) return;
        var id = cell.getAttribute("data-item");
        if (!id) return;
        if (overlayOpen) closeBinDetail();
        openItemSheet(id);
      },
      false
    );
    document.addEventListener("touchstart", onTouchStart, { passive: true });
  }

  /* ---------------- public API ---------------- */

  function refresh() {
    var h = hud();
    if (h && typeof h.render === "function") {
      try {
        h.render(); // host render() repaints spaces (nodes, counts, pool)
      } catch (e) {
        /* host render failed — still refresh our own bits */
      }
    } else if (typeof window.renderSpaces === "function") {
      try {
        window.renderSpaces();
      } catch (e) {
        /* host render failed — still refresh our own bits */
      }
    }
    augmentPool();
    if (overlayOpen && currentSpaceId) {
      renderBinGrid();
      paintCover();
    }
  }

  function init() {
    if (init._done) return;
    init._done = true;
    ensureOverlay();
    bindNodes();
    bindDesktopDrag();
    bindTaps();
    bindCover();
    watchPool();
    augmentPool();
  }

  window.HUD_spaces = {
    init: init,
    openBinDetail: openBinDetail,
    closeBinDetail: closeBinDetail,
    refresh: refresh,
  };
})();
