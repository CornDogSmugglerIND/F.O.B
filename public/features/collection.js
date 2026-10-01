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

  function cardHtml(item) {
    var demo = item.demo ? '<span class="inv-demo">Demo</span>' : "";
    var profit = window.HUDcore && window.HUDcore.estProfitTotal ? window.HUDcore.estProfitTotal(item) : 0;
    return (
      '<button type="button" class="inv-card" data-item="' + esc(item.id) + '"' +
      ' aria-label="' + esc(itemName(item)) + " — " + PHASE_LABELS[phaseOf(item)] + '">' +
      '<span class="inv-thumb">' + thumbHtml(item) + "</span>" +
      '<span class="inv-card-body">' +
      '<span class="inv-card-title">' + esc(itemName(item)) + demo + "</span>" +
      '<span class="inv-card-sub">' + PHASE_LABELS[phaseOf(item)] + " · " + esc(binName(item)) + "</span>" +
      '<span class="inv-card-meta">qty ' + (item.quantity || 1) + " · Profit " + money(profit) + "</span>" +
      "</span>" +
      "</button>"
    );
  }

  var wired = false;

  function render() {
    var section = document.getElementById("constellationCollection");
    if (!section || !wired) return;
    var list = items();
    var total = list.reduce(function (s, i) {
      return s + Number(i.price || 0) * Number(i.quantity || 1);
    }, 0);
    var unfiled = list.filter(function (i) { return !i.spaceId; }).length;

    var body;
    if (!list.length) {
      body =
        '<div class="inv-empty">' +
        "<p>No items yet — tap + Add item above.</p>" +
        "</div>";
    } else {
      body = '<div class="inv-list">' + list.map(cardHtml).join("") + "</div>";
    }

    section.innerHTML =
      '<div class="inv-head">' +
      '<div class="inv-source chrome">On this device · ' + list.length + " item" + (list.length === 1 ? "" : "s") + "</div>" +
      '<button type="button" class="inv-add" id="invAddBtn">+ Add item</button>' +
      "</div>" +
      '<div class="stat-row">' +
      '<div class="stat"><div class="k">ITEMS</div><div class="n">' + list.length + "</div></div>" +
      '<div class="stat"><div class="k">EST VALUE</div><div class="n">' + money(total) + "</div></div>" +
      '<div class="stat"><div class="k">UNFILED</div><div class="n">' + unfiled + "</div></div>" +
      "</div>" +
      body;

    var c = core();
    var addBtn = section.querySelector("#invAddBtn");
    if (addBtn) {
      addBtn.addEventListener("click", function () {
        // Same intake flow Scouter uses (photo picker → addPhotos) — no
        // second form. The new item's sheet opens for name entry after save.
        if (c && typeof c.startInventoryIntake === "function") {
          c.startInventoryIntake();
        } else if (window.HUDcore && typeof window.HUDcore.startInventoryIntake === "function") {
          window.HUDcore.startInventoryIntake();
        } else {
          if (c && c.toast) c.toast("Intake is not ready yet");
        }
      });
    }

    var c = core();
    section.querySelectorAll("[data-item]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (c && c.openSheet) c.openSheet(btn.getAttribute("data-item"));
        else if (window.HUD_openSheet) window.HUD_openSheet(btn.getAttribute("data-item"));
      });
    });
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
