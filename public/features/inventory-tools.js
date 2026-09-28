/* Coalition H.U.D. — inventory search + bulk actions (Scouter view).
 *
 * Vanilla JS, no deps. Exposes window.HUD_invtools = { init(), refresh() }.
 *
 * - Search bar injected at top of #view-scouter (below .scout-actions).
 *   Filters BOTH pkg rows live: title, productName, setName, barcode,
 *   eBay SKU (channels.ebay.sku). Case-insensitive. 24-match cap while
 *   searching; empty query hands control back to the app's own paintPkgs
 *   (12 cap).
 * - Select mode: tapping a pkg card toggles selection instead of opening
 *   the sheet. Bottom action bar: Stage / Bin 1 / Bin 2 / Staged / Clear.
 *
 * Does NOT touch the app's render cycle: when no search is active the
 * module only adds selection classes after repaints. A MutationObserver
 * on #pkgIntake / #pkgStaged re-applies an active search filter after
 * the app repaints, so HUD_invtools.refresh() (called by the
 * coordinator after render()) is a nice-to-have, not a requirement —
 * the search input's own listener works on the current DOM.
 *
 * coalition.js loads as an ES module, so its state/functions are not
 * global. The module prefers a window.HUDcore bridge (see INTEGRATION.md)
 * and otherwise reads/writes the same localStorage store the app uses
 * ("coalition-items-v4"), so search and bulk actions work standalone.
 */
(function () {
  "use strict";

  var LS_ITEMS = "coalition-items-v4";
  var LS_SPACES = "coalition-spaces-v4";
  var CAP_SEARCH = 24;
  var CAP_IDLE = 12;

  var inited = false;
  var query = "";
  var selectMode = false;
  var selected = {}; // id -> true
  var selectedCount = 0;
  var obsTargets = []; // rows watched for app repaints
  var mo = null;

  var inputEl = null;
  var clearBtn = null;
  var selectBtn = null;
  var selectLabel = null;
  var subEl = null;
  var countEl = null;

  /* ---------- app bridge (HUDcore optional) ---------- */

  function bridge() {
    return window.HUDcore || null;
  }

  function getItems() {
    var b = bridge();
    try {
      if (b && b.state && Array.isArray(b.state.items)) return b.state.items;
    } catch (e) { /* fall through */ }
    try {
      var raw = JSON.parse(localStorage.getItem(LS_ITEMS) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function getSpaces() {
    var b = bridge();
    try {
      if (b && b.state && Array.isArray(b.state.spaces)) return b.state.spaces;
    } catch (e) { /* fall through */ }
    try {
      var raw = JSON.parse(localStorage.getItem(LS_SPACES) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function persist(items) {
    try { localStorage.setItem(LS_ITEMS, JSON.stringify(items)); } catch (e) { /* ignore */ }
    var b = bridge();
    if (b && typeof b.saveItems === "function") {
      try { b.saveItems(); } catch (e) { /* ignore */ }
    }
  }

  function say(msg) {
    var b = bridge();
    if (b && typeof b.toast === "function") {
      try { b.toast(msg); return; } catch (e) { /* fall through */ }
    }
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(say._t);
    say._t = setTimeout(function () { el.classList.remove("show"); }, 2800);
  }

  function esc(s) {
    var b = bridge();
    if (b && typeof b.escapeHtml === "function") {
      try { return b.escapeHtml(String(s == null ? "" : s)); } catch (e) { /* fall through */ }
    }
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function spaceName(id) {
    var b = bridge();
    if (b && typeof b.spaceName === "function") {
      try { return b.spaceName(id); } catch (e) { /* fall through */ }
    }
    var sp = null, list = getSpaces(), i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) { sp = list[i]; break; }
    }
    return sp && sp.name ? sp.name : String(id);
  }

  function openSheet(id) {
    var b = bridge();
    if (b && typeof b.openSheet === "function") {
      try { b.openSheet(id); return; } catch (e) { /* fall through */ }
    }
    if (typeof window.openSheet === "function") {
      try { window.openSheet(id); } catch (e) { /* ignore */ }
    }
  }

  // Re-render the scouter pkg rows. Uses the app's render() when bridged;
  // otherwise repaints the two rows from the store with the app's own
  // 12-item cap and markup (styling stays identical).
  function doRender() {
    var b = bridge();
    if (b && typeof b.render === "function") {
      try { b.render(); } catch (e) { /* ignore */ }
      return;
    }
    var items = getItems();
    stopObserve();
    try {
      paintRow("pkgIntake", filterByPhase(items, "intake"), CAP_IDLE);
      paintRow("pkgStaged", filterByPhase(items, "staged"), CAP_IDLE);
      setText("intakeCount", pad2(filterByPhase(items, "intake").length));
      setText("stagedCount", pad2(filterByPhase(items, "staged").length));
    } finally {
      startObserve();
    }
  }

  function setText(id, txt) {
    var el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  /* ---------- item helpers ---------- */

  // Mirrors /visor/phases.js phaseFromItem (coalition.js imports it).
  function phaseOf(it) {
    if (it && it.phase) return it.phase;
    return it && it.staged ? "staged" : "intake";
  }

  function filterByPhase(items, phase) {
    var out = [], i;
    for (i = 0; i < items.length; i++) {
      if (phaseOf(items[i]) === phase) out.push(items[i]);
    }
    return out;
  }

  function skuOf(it) {
    try { return (it.channels && it.channels.ebay && it.channels.ebay.sku) || ""; }
    catch (e) { return ""; }
  }

  function matches(it, q) {
    var fields = [it.title, it.productName, it.setName, it.barcode, skuOf(it)];
    for (var i = 0; i < fields.length; i++) {
      var v = fields[i];
      if (v != null && String(v).toLowerCase().indexOf(q) !== -1) return true;
    }
    return false;
  }

  function photoSrc(it) {
    var p = it && it.photos && it.photos[0];
    return (p && (p.dataUrl || p.url)) || "";
  }

  /* ---------- pkg row painting (same markup pattern as paintPkgs) ---------- */

  var EMPTY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
    '<rect x="5" y="5" width="14" height="14" rx="1"/></svg>';

  function pkgHtml(it) {
    var src = photoSrc(it);
    var qty = Number(it.quantity) || 1;
    var isSel = !!selected[it.id];
    var html = '<button type="button" class="pkg' + (isSel ? " selected" : "") +
      '" data-item="' + esc(it.id) + '" aria-pressed="' + (isSel ? "true" : "false") + '">';
    html += src
      ? '<img src="' + src + '" alt="" />'
      : '<div class="pkg empty">' + EMPTY_SVG + "</div>";
    if (qty > 1) html += '<span class="qty">x' + qty + "</span>";
    if (isSel) html += '<span class="invtools-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M4 12.5l5 5L20 6.5"/></svg></span>';
    return html + "</button>";
  }

  function paintRow(rootId, items, cap) {
    var root = document.getElementById(rootId);
    if (!root) return;
    root.innerHTML = items
      .slice(0, cap)
      .map(pkgHtml)
      .join("");
    bindRowClicks(root);
  }

  function bindRowClicks(root) {
    var btns = root.querySelectorAll("[data-item]");
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-item");
          if (selectMode) toggleSelect(id, btn);
          else openSheet(id);
        });
      })(btns[i]);
    }
  }

  /* ---------- filtering ---------- */

  function currentResults() {
    var items = getItems();
    return {
      intake: filterByPhase(items, "intake").filter(function (it) { return matches(it, query); }),
      staged: filterByPhase(items, "staged").filter(function (it) { return matches(it, query); })
    };
  }

  // Re-paint both rows with the active filter. Only called while a query
  // is non-empty; otherwise the app's own paintPkgs output is left alone.
  // The MutationObserver is paused during our own repaints so they do not
  // re-trigger the filter (observer callbacks fire async after the
  // mutations, and disconnect() discards the queued records).
  function applyFilter() {
    if (!query) return;
    stopObserve();
    try {
      var r = currentResults();
      paintRow("pkgIntake", r.intake, CAP_SEARCH);
      paintRow("pkgStaged", r.staged, CAP_SEARCH);
      updateSub(r.intake.length + r.staged.length);
    } finally {
      startObserve();
    }
  }

  function updateSub(n) {
    if (!subEl || !countEl) return;
    if (query) {
      subEl.hidden = false;
      countEl.textContent = n + (n === 1 ? " result" : " results");
    } else {
      subEl.hidden = true;
      countEl.textContent = "";
    }
  }

  /* ---------- selection ---------- */

  function isSelected(id) { return !!selected[id]; }

  function toggleSelect(id, btn) {
    if (isSelected(id)) {
      delete selected[id];
      selectedCount = Math.max(0, selectedCount - 1);
    } else {
      selected[id] = true;
      selectedCount++;
    }
    if (btn) {
      btn.classList.toggle("selected", isSelected(id));
      btn.setAttribute("aria-pressed", isSelected(id) ? "true" : "false");
      var old = btn.querySelector(".invtools-check");
      if (old) old.remove();
      if (isSelected(id)) {
        var s = document.createElement("span");
        s.className = "invtools-check";
        s.setAttribute("aria-hidden", "true");
        s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M4 12.5l5 5L20 6.5"/></svg>';
        btn.appendChild(s);
      }
    }
    updateBar();
  }

  // After the app repaints rows (not while searching), re-apply the
  // selection ring to any selected ids still on screen. Idempotent, so
  // its own DOM writes converge (observer is paused during the sync).
  function syncSelectClasses() {
    stopObserve();
    try {
      var rows = [document.getElementById("pkgIntake"), document.getElementById("pkgStaged")];
      for (var r = 0; r < rows.length; r++) {
        var root = rows[r];
        if (!root) continue;
        var btns = root.querySelectorAll("[data-item]");
        for (var i = 0; i < btns.length; i++) {
          (function (btn) {
            var id = btn.getAttribute("data-item");
            var on = selectMode && isSelected(id);
            if (btn.classList.contains("selected") !== on) {
              btn.classList.toggle("selected", on);
              btn.setAttribute("aria-pressed", on ? "true" : "false");
            }
            var badge = btn.querySelector(".invtools-check");
            if (on && !badge) {
              var s = document.createElement("span");
              s.className = "invtools-check";
              s.setAttribute("aria-hidden", "true");
              s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M4 12.5l5 5L20 6.5"/></svg>';
              btn.appendChild(s);
            } else if (!on && badge) {
              badge.remove();
            }
          })(btns[i]);
        }
      }
    } finally {
      startObserve();
    }
  }

  function setSelectMode(on) {
    selectMode = on;
    if (!on) {
      selected = {};
      selectedCount = 0;
    }
    if (selectBtn) {
      selectBtn.classList.toggle("active", on);
      selectBtn.setAttribute("aria-pressed", on ? "true" : "false");
      if (selectLabel) selectLabel.textContent = on ? "Done" : "Select";
    }
    var view = document.getElementById("view-scouter");
    if (view) view.classList.toggle("invtools-selecting", on);
    if (query) applyFilter(); else syncSelectClasses();
    updateBar();
  }

  /* ---------- bottom action bar ---------- */

  function ensureBar() {
    var bar = document.getElementById("invtoolsBar");
    if (bar) return bar;
    bar = document.createElement("div");
    bar.className = "invtools-bar";
    bar.id = "invtoolsBar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Bulk actions");
    bar.innerHTML =
      '<div class="invtools-bar-count" id="invtoolsBarCount">0 selected</div>' +
      '<div class="invtools-bar-btns">' +
        '<button type="button" data-act="stage">Stage</button>' +
        '<button type="button" data-act="bin1">Bin 1</button>' +
        '<button type="button" data-act="bin2">Bin 2</button>' +
        '<button type="button" data-act="staged">Staged</button>' +
        '<button type="button" data-act="clear" class="ghost">Clear</button>' +
      "</div>";
    var btns = bar.querySelectorAll("button[data-act]");
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () { runBulk(btn.getAttribute("data-act")); });
      })(btns[i]);
    }
    document.body.appendChild(bar);
    return bar;
  }

  function updateBar() {
    var bar = document.getElementById("invtoolsBar");
    if (!selectMode) {
      if (bar) bar.classList.remove("show");
      return;
    }
    bar = ensureBar();
    var c = document.getElementById("invtoolsBarCount");
    if (c) c.textContent = selectedCount + (selectedCount === 1 ? " selected" : " selected");
    bar.classList.add("show");
  }

  function runBulk(act) {
    if (act === "clear") {
      setSelectMode(false);
      return;
    }
    var ids = Object.keys(selected);
    if (!ids.length) {
      say("Nothing selected");
      return;
    }
    var items = getItems();
    var now = new Date().toISOString();
    var n = 0, i, it;
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (!isSelected(it.id)) continue;
      if (act === "stage") {
        it.phase = "staged";
        it.staged = true;
      } else {
        it.spaceId = act; // "bin1" | "bin2" | "staged"
      }
      it.updatedAt = now;
      n++;
    }
    persist(items);
    if (act === "stage") say(n + " staged");
    else say(n + " filed in " + spaceName(act));
    setSelectMode(false);
    doRender();
  }

  /* ---------- search bar UI ---------- */

  function injectBar() {
    if (document.getElementById("invtoolsSearch")) return true;
    var view = document.getElementById("view-scouter");
    if (!view) return false;
    var anchor = view.querySelector(".scout-actions");
    var bar = document.createElement("div");
    bar.className = "invtools";
    bar.id = "invtoolsSearch";
    bar.innerHTML =
      '<div class="invtools-row">' +
        '<div class="invtools-field">' +
          '<svg class="invtools-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
            '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>' +
          "</svg>" +
          '<input type="search" id="invtoolsInput" placeholder="Search title, set, barcode, SKU" ' +
            'autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" ' +
            'enterkeyhint="search" aria-label="Search inventory" />' +
          '<button type="button" class="invtools-x" id="invtoolsClear" aria-label="Clear search" hidden>&times;</button>' +
        "</div>" +
        '<button type="button" class="invtools-select" id="invtoolsSelect" aria-pressed="false">' +
          '<span class="invtools-select-label" id="invtoolsSelectLabel">Select</span>' +
        "</button>" +
      "</div>" +
      '<div class="invtools-sub" id="invtoolsSub" hidden>' +
        '<span class="invtools-count" id="invtoolsCount"></span>' +
      "</div>";
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(bar, anchor.nextSibling);
    } else {
      view.insertBefore(bar, view.firstChild);
    }

    inputEl = document.getElementById("invtoolsInput");
    clearBtn = document.getElementById("invtoolsClear");
    selectBtn = document.getElementById("invtoolsSelect");
    selectLabel = document.getElementById("invtoolsSelectLabel");
    subEl = document.getElementById("invtoolsSub");
    countEl = document.getElementById("invtoolsCount");

    inputEl.addEventListener("input", function () {
      query = inputEl.value.trim().toLowerCase();
      clearBtn.hidden = !inputEl.value;
      if (!query) {
        doRender(); // hand full lists back to the app (12 cap)
        updateSub(0);
        if (selectMode) syncSelectClasses();
      } else {
        applyFilter(); // works on the current DOM, no refresh() needed
      }
    });

    // Escape clears like a native search field.
    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && inputEl.value) {
        inputEl.value = "";
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        inputEl.blur();
      }
    });

    clearBtn.addEventListener("click", function () {
      inputEl.value = "";
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.focus();
    });

    selectBtn.addEventListener("click", function () {
      setSelectMode(!selectMode);
    });

    return true;
  }

  /* ---------- render-cycle hooks ---------- */

  function observe() {
    obsTargets = ["pkgIntake", "pkgStaged"]
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean);
    if (!obsTargets.length || typeof MutationObserver === "undefined") return;
    mo = new MutationObserver(function () {
      if (query) {
        applyFilter(); // app repainted rows: re-apply the active filter
      } else if (selectMode) {
        syncSelectClasses(); // app repainted rows: re-apply selection rings
      }
    });
    startObserve();
  }

  function stopObserve() {
    if (mo) mo.disconnect();
  }

  function startObserve() {
    if (!mo) return;
    for (var i = 0; i < obsTargets.length; i++) {
      mo.observe(obsTargets[i], { childList: true });
    }
  }

  /* ---------- public ---------- */

  // Re-apply the module's state after the app's render(). Safe to call any
  // time; no-ops when there is no active search or select mode.
  function refresh() {
    if (query) {
      applyFilter();
    } else if (selectMode) {
      syncSelectClasses();
    }
    if (selectMode) updateBar();
  }

  function init() {
    if (inited) return;
    if (!injectBar()) return; // scouter view not present yet; retry init() later
    inited = true;
    observe();
  }

  // Auto-init on DOM ready; coordinator can also call init() explicitly.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.HUD_invtools = {
    init: init,
    refresh: refresh
  };
})();
