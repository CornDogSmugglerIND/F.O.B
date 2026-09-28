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

  /* ---------------- app bridge (lazy, with fallbacks) ---------------- */

  function appState() {
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
    if (typeof window.saveItems === "function") {
      window.saveItems();
      return;
    }
    var st = appState();
    var items = st ? st.items : fallbackItems;
    if (items) {
      try {
        localStorage.setItem(LS_ITEMS, JSON.stringify(items));
      } catch (e) {
        /* storage full/blocked — nothing more we can do */
      }
    }
  }

  function esc(s) {
    if (typeof window.escapeHtml === "function") return window.escapeHtml(s);
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function moneyOf(n) {
    if (typeof window.money === "function") return window.money(n);
    return "$" + (Number(n) || 0).toFixed(2);
  }

  function spaceNameOf(id) {
    if (typeof window.spaceName === "function") return window.spaceName(id);
    var spaces = readSpaces();
    for (var i = 0; i < spaces.length; i++) {
      if (spaces[i].id === id) return spaces[i].name || id;
    }
    return id;
  }

  function showToast(msg) {
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
    it.spaceId = spaceId;
    it.updatedAt = new Date().toISOString();
    persistItems();
    showToast("Filed in " + spaceNameOf(spaceId));
    refresh();
  }

  /* ---------------- item cell markup (shared) ---------------- */

  function cellHTML(it) {
    var src = (it.photos && it.photos[0] && it.photos[0].dataUrl) || "";
    var title = esc(it.title || it.productName || "Untitled");
    var thumb = src
      ? '<img src="' + src + '" alt="" loading="lazy" draggable="false" />'
      : '<span class="sp-ph" aria-hidden="true"></span>';
    return (
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
      "</button>"
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
      ? items.map(cellHTML).join("")
      : '<div class="bd-empty">No items filed here yet.<br />Drag items onto this bin to file them.</div>';
  }

  function openBinDetail(spaceId) {
    if (!spaceId) return;
    currentSpaceId = spaceId;
    var ov = ensureOverlay();
    ov.querySelector("#binDetailCard").setAttribute("data-space", spaceId);
    renderBinGrid();
    ov.classList.add("open");
    ov.setAttribute("aria-hidden", "false");
    overlayOpen = true;
  }

  function closeBinDetail() {
    currentSpaceId = null;
    overlayOpen = false;
    var ov = document.getElementById("binDetailSheet");
    if (ov) {
      ov.classList.remove("open");
      ov.setAttribute("aria-hidden", "true");
    }
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
      var n = e.target.closest ? e.target.closest("[data-space]") : null;
      if (n) openBinDetail(n.getAttribute("data-space"));
    });
    nodes.addEventListener("dragover", function (e) {
      var n = e.target.closest ? e.target.closest("[data-space]") : null;
      if (!n) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      clearDropHints();
      n.classList.add("drop-hint");
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
    if (typeof window.renderSpaces === "function") {
      try {
        window.renderSpaces();
      } catch (e) {
        /* host render failed — still refresh our own bits */
      }
    }
    augmentPool();
    if (overlayOpen && currentSpaceId) renderBinGrid();
  }

  function init() {
    if (init._done) return;
    init._done = true;
    ensureOverlay();
    bindNodes();
    bindDesktopDrag();
    bindTaps();
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
