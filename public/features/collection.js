/* Coalition H.U.D. — Inventory surface (reseller tool, not a collection manager)
 *
 * Self-contained vanilla-JS module. Renders the working inventory — every
 * item in the live store — inside #constellationCollection (the "Inventory"
 * mode of the Constellation view). Tapping an item opens the ONE item sheet
 * (window.HUD_openSheet from coalition.js); all actions (Identify, listing
 * engine, bin filing, delete, fulfillment) live there. This module builds no
 * sheets, no forms, no second store. The "+ Add item" button reuses Scouter's
 * photo intake (HUDcore.startInventoryIntake) — the new item's sheet opens
 * for name entry after the photo saves.
 *
 * Contract:
 *   window.HUD_collection = { init(), render(), refresh() }
 *   - init()   : wire everything. Waits for #constellationCollection to exist.
 *   - render() : repaint header stats + item list (no-op until wired).
 *   - refresh(): alias of render().
 *
 * Source of truth: the live app state (window.HUDcore.state.items, persisted
 * in localStorage "coalition-items-v4"). Server sync (eBay channel) merges
 * INTO this store, so what you see here is everything the app knows. The
 * header says "On this device" to make that explicit.
 */

(function () {
  "use strict";

  var LS_ITEMS = "coalition-items-v4";

  /* Stage labels. Keep in sync with /visor/phases.js (and src/visor/phases.js).
   * This file is a classic script (no module imports), so the 7 stable labels
   * are mirrored here for display only. */
  var PHASE_LABELS = {
    intake: "Intake",
    staged: "Staged",
    listed: "Listed",
    sold: "Sold",
    packed: "Packed",
    shipped: "Shipped",
    delivered: "Delivered",
  };

  function phaseOf(item) {
    if (item && item.phase && PHASE_LABELS[item.phase]) return item.phase;
    if (item && item.staged) return "staged";
    return "intake";
  }

  function core() {
    return window.HUDcore || null;
  }

  function items() {
    var c = core();
    if (c && c.state && Array.isArray(c.state.items)) return c.state.items;
    try {
      var raw = JSON.parse(localStorage.getItem(LS_ITEMS) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function esc(s) {
    var c = core();
    if (c && c.escapeHtml) return c.escapeHtml(s);
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n) {
    var c = core();
    if (c && c.money) return c.money(n);
    return "$" + (Number(n) || 0).toFixed(2);
  }

  function binName(item) {
    var c = core();
    if (!item.spaceId) return "Unsorted";
    if (c && c.spaceName) {
      var name = c.spaceName(item.spaceId);
      return name || item.spaceId;
    }
    return item.spaceId;
  }

  function itemName(item) {
    return item.title || item.productName || "Untitled";
  }

  function thumbHtml(item) {
    var src = (item.photos && item.photos[0] && item.photos[0].dataUrl) || "";
    if (src) return '<img src="' + src + '" alt="" loading="lazy" />';
    return '<span class="inv-thumb-empty" aria-hidden="true"></span>';
  }

  var STATUSES = ["draft", "sorted", "photographed", "ready to list", "listed", "sold", "error"];
  var view = { q: "", status: "all", sort: "newest", select: false, sel: {}, mode: "grid" };

  function statusOf(item) {
    return STATUSES.indexOf(item.listingStatus) >= 0 ? item.listingStatus : "draft";
  }

  function profitOf(item) {
    var c = core();
    return c && c.estProfitTotal ? c.estProfitTotal(item) : 0;
  }

  function cardHtml(item) {
    var demo = item.demo ? '<span class="inv-demo">Demo</span>' : "";
    var picked = view.select && view.sel[item.id];
    var st = statusOf(item);
    var profit = profitOf(item);
    return (
      '<button type="button" class="inv-card' + (picked ? " picked" : "") + '" data-item="' + esc(item.id) + '"' +
      ' aria-label="' + esc(itemName(item)) + " — " + PHASE_LABELS[phaseOf(item)] + '"' +
      (view.select ? ' aria-pressed="' + (picked ? "true" : "false") + '"' : "") + ">" +
      (view.select ? '<span class="inv-check" aria-hidden="true">' + (picked ? "\u2713" : "") + "</span>" : "") +
      '<span class="inv-thumb">' + thumbHtml(item) + "</span>" +
      '<span class="inv-card-body">' +
      '<span class="inv-card-title"><span class="inv-t">' + esc(itemName(item)) + "</span></span>" +
      '<span class="inv-card-sub">' + PHASE_LABELS[phaseOf(item)] + " \u00b7 " + esc(binName(item)) + "</span>" +
      '<span class="inv-card-meta"><span class="inv-pill st-' + st.replace(/ /g, "-") + '">' + esc(st) + "</span>" +
      "qty " + (item.quantity === undefined ? 1 : item.quantity) + demo + "</span>" +
      "</span>" +
      '<span class="inv-card-money"><b>' + money(item.price || 0) + '</b><i class="' + (profit < 0 ? "neg" : "") + '">' +
      (profit < 0 ? "-" : "+") + money(Math.abs(profit)) + "</i></span>" +
      "</button>"
    );
  }

  function tileHtml(item) {
    var picked = view.select && view.sel[item.id];
    var st = statusOf(item);
    var profit = profitOf(item);
    var q = item.quantity === undefined ? 1 : item.quantity;
    return (
      '<button type="button" class="inv-card inv-tile' + (picked ? " picked" : "") + '" data-item="' + esc(item.id) + '"' +
      ' aria-label="' + esc(itemName(item)) + " \u2014 " + PHASE_LABELS[phaseOf(item)] + '"' +
      (view.select ? ' aria-pressed="' + (picked ? "true" : "false") + '"' : "") + ">" +
      '<span class="inv-art">' + thumbHtml(item) +
      (view.select ? '<span class="inv-check" aria-hidden="true">' + (picked ? "\u2713" : "") + "</span>" : "") +
      '<span class="inv-st st-' + st.replace(/ /g, "-") + '">' + esc(st) + "</span>" +
      (q > 1 ? '<span class="inv-qty">\u00d7' + q + "</span>" : "") +
      '<span class="inv-price">' + money(item.price || 0) + "</span></span>" +
      '<span class="inv-tname">' + esc(itemName(item)) + "</span>" +
      '<span class="inv-tsub">' + PHASE_LABELS[phaseOf(item)] + " \u00b7 " + esc(binName(item)) +
      ' <i class="' + (profit < 0 ? "neg" : "") + '">' + (profit < 0 ? "\u2212" : "+") + money(Math.abs(profit)) + "</i></span>" +
      "</button>"
    );
  }

  function visibleItems() {
    var q = view.q.trim().toLowerCase();
    var list = items().filter(function (i) {
      if (view.status !== "all" && statusOf(i) !== view.status) return false;
      if (!q) return true;
      var hay = [itemName(i), i.sku, i.category, i.condition, i.notes, i.setName, i.barcode].join(" ").toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    var by = {
      newest: function (a, b) { return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")); },
      profit: function (a, b) { return profitOf(b) - profitOf(a); },
      value: function (a, b) { return Number(b.price || 0) - Number(a.price || 0); },
      name: function (a, b) { return itemName(a).localeCompare(itemName(b)); },
    };
    return list.sort(by[view.sort] || by.newest);
  }

  function selectedIds() {
    return Object.keys(view.sel).filter(function (k) { return view.sel[k]; });
  }

  function paintList() {
    var host = document.getElementById("invListHost");
    if (!host) return;
    var all = items();
    var list = visibleItems();
    if (!all.length) {
      host.innerHTML = '<div class="inv-empty"><p>No items yet \u2014 tap + Add item above.</p></div>';
    } else if (!list.length) {
      host.innerHTML = '<div class="inv-empty"><p>Nothing matches. Clear the search or pick All.</p></div>';
    } else {
      host.innerHTML = view.mode === "grid"
        ? '<div class="inv-grid">' + list.map(tileHtml).join("") + "</div>"
        : '<div class="inv-list">' + list.map(cardHtml).join("") + "</div>";
    }
    var c = core();
    host.querySelectorAll("[data-item]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-item");
        if (view.select) {
          view.sel[id] = !view.sel[id];
          paintList();
          paintBulk();
          return;
        }
        if (c && c.openSheet) c.openSheet(id);
        else if (window.HUD_openSheet) window.HUD_openSheet(id);
      });
    });
  }

  function paintBulk() {
    var bar = document.getElementById("invBulk");
    if (!bar) return;
    var n = selectedIds().length;
    bar.hidden = !view.select;
    if (!view.select) return;
    var c = core();
    var spaces = (c && c.state && c.state.spaces) || [];
    bar.innerHTML =
      '<span class="inv-bulk-n">' + n + " selected</span>" +
      '<select id="invBulkStatus" aria-label="Set listing status"><option value="">Set status\u2026</option>' +
      STATUSES.map(function (s) { return '<option value="' + s + '">' + s + "</option>"; }).join("") + "</select>" +
      '<select id="invBulkBin" aria-label="Move to bin"><option value="">Move to bin\u2026</option>' +
      spaces.map(function (sp) { return '<option value="' + esc(sp.id) + '">' + esc(sp.name) + "</option>"; }).join("") + "</select>";
    bar.querySelector("#invBulkStatus").addEventListener("change", function (e) { bulkApply({ status: e.target.value }); });
    bar.querySelector("#invBulkBin").addEventListener("change", function (e) { bulkApply({ bin: e.target.value }); });
  }

  function bulkApply(change) {
    var c = core();
    var ids = selectedIds();
    if (!c || !ids.length) { if (c && c.toast) c.toast("Tap items first"); paintBulk(); return; }
    if (change.status) {
      ids.forEach(function (id) {
        var it = c.state.items.find(function (x) { return x.id === id; });
        if (it) { it.listingStatus = change.status; it.updatedAt = new Date().toISOString(); }
      });
      if (!c.saveItems()) return;
      c.toast("Updated " + ids.length + " item" + (ids.length === 1 ? "" : "s"));
    } else if (change.bin) {
      ids.forEach(function (id) { c.assignSpace(id, change.bin); });
    }
    view.sel = {};
    view.select = false;
    c.render();
    render();
  }

  var wired = false;

  function render() {
    var section = document.getElementById("constellationCollection");
    if (!section || !wired) return;
    var list = items();
    var total = list.reduce(function (s, i) {
      return s + Number(i.price || 0) * Number(i.quantity === undefined ? 1 : i.quantity);
    }, 0);
    var paid = list.reduce(function (s, i) {
      return s + Number(i.purchasePrice || 0) * Number(i.quantity === undefined ? 1 : i.quantity);
    }, 0);
    var unfiled = list.filter(function (i) { return !i.spaceId; }).length;
    var counts = { all: list.length };
    STATUSES.forEach(function (s) { counts[s] = 0; });
    list.forEach(function (i) { counts[statusOf(i)]++; });

    var chips = ["all"].concat(STATUSES).map(function (s) {
      return '<button type="button" class="inv-chip' + (view.status === s ? " on" : "") + '" data-status="' + s + '">' +
        (s === "all" ? "All" : s) + " <b>" + counts[s] + "</b></button>";
    }).join("");

    section.innerHTML =
      '<div class="inv-head">' +
      '<div class="inv-source chrome">On this device \u00b7 ' + list.length + " item" + (list.length === 1 ? "" : "s") + "</div>" +
      '<button type="button" class="inv-add" id="invAddBtn">+ Add item</button>' +
      "</div>" +
      '<div class="inv-stats">' +
      '<div class="inv-stat"><div class="k">Items</div><div class="v">' + list.length + "</div></div>" +
      '<div class="inv-stat"><div class="k">Paid</div><div class="v">' + money(paid) + "</div></div>" +
      '<div class="inv-stat"><div class="k">Market</div><div class="v">' + money(total) + "</div></div>" +
      '<div class="inv-stat hot"><div class="k">Profit</div><div class="v">' + money(total - paid) + "</div></div>" +
      "</div>" +
      '<div class="inv-tools">' +
      '<input type="search" id="invSearch" placeholder="Search items" autocomplete="off" value="' + esc(view.q) + '" />' +
      '<select id="invSort" aria-label="Sort">' +
      [["newest", "Newest"], ["profit", "Most profit"], ["value", "Highest value"], ["name", "Name A\u2013Z"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (view.sort === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") + "</select>" +
      '<button type="button" class="inv-selbtn" id="invModeBtn" aria-label="Switch grid or list">' + (view.mode === "grid" ? "List" : "Grid") + "</button>" +
      '<button type="button" class="inv-selbtn' + (view.select ? " on" : "") + '" id="invSelBtn">' + (view.select ? "Done" : "Select") + "</button>" +
      "</div>" +
      '<div class="inv-chips" id="invChips">' + chips + "</div>" +
      '<div class="inv-bulk" id="invBulk" hidden></div>' +
      '<div id="invListHost"></div>';

    var c = core();
    section.querySelector("#invAddBtn").addEventListener("click", function () {
      if (c && typeof c.startInventoryIntake === "function") {
        c.startInventoryIntake();
      } else if (window.HUDcore && typeof window.HUDcore.startInventoryIntake === "function") {
        window.HUDcore.startInventoryIntake();
      } else {
        if (c && c.toast) c.toast("Intake is not ready yet");
      }
    });
    section.querySelector("#invSearch").addEventListener("input", function (e) { view.q = e.target.value; paintList(); });
    section.querySelector("#invSort").addEventListener("change", function (e) { view.sort = e.target.value; paintList(); });
    section.querySelector("#invModeBtn").addEventListener("click", function () {
      view.mode = view.mode === "grid" ? "list" : "grid";
      render();
    });
    section.querySelector("#invSelBtn").addEventListener("click", function () {
      view.select = !view.select;
      if (!view.select) view.sel = {};
      render();
    });
    section.querySelectorAll("[data-status]").forEach(function (b) {
      b.addEventListener("click", function () { view.status = b.getAttribute("data-status"); render(); });
    });
    paintList();
    paintBulk();
  }

  /* ---------- wiring ---------- */
  function wire() {
    if (wired) return;
    var section = document.getElementById("constellationCollection");
    if (!section) return;
    wired = true;

    // Repaint whenever the host app shows the inventory mode of the
    // constellation view (MutationObserver keeps this module self-contained:
    // no edits to navigate() needed).
    var host = document.getElementById("view-constellation");
    var maybeRender = function () {
      if (host && host.classList.contains("active") && !section.hasAttribute("hidden")) render();
    };
    if (host) {
      new MutationObserver(maybeRender).observe(host, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    new MutationObserver(maybeRender).observe(section, {
      attributes: true,
      attributeFilter: ["hidden"],
    });

    maybeRender();
  }

  function waitForSection() {
    if (document.getElementById("constellationCollection")) {
      wire();
      return;
    }
    var obs = new MutationObserver(function () {
      if (document.getElementById("constellationCollection")) {
        obs.disconnect();
        wire();
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", waitForSection, { once: true });
    } else {
      waitForSection();
    }
  }

  window.HUD_collection = { init: init, render: render, refresh: render };
})();
