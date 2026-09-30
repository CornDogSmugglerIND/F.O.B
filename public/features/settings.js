/* Coalition H.U.D. — Settings feature
 * Classic (non-module) script. Renders real controls into #view-settings.
 * Exposes window.HUD_settings = { init(), render(), get(), set() }.
 *
 * Persistence: localStorage "coalition-settings-v1"
 *   { identifyProvider, defaultBin, ebayAutoSync }
 * No credentials ever live here — eBay auth is server-side only.
 */
(function () {
  "use strict";

  var LS_ITEMS = "coalition-items-v4";
  var LS_SPACES = "coalition-spaces-v4";
  var LS_SETTINGS = "coalition-settings-v1";
  var VIEW_ID = "view-settings";

  var DEFAULTS = {
    identifyProvider: "anthropic", // "anthropic" | "manual"
    defaultBin: "none",            // "bin1" | "bin2" | "staged" | "none"
    ebayAutoSync: false,
  };

  var BIN_OPTIONS = [
    { value: "bin1", label: "Bin 1" },
    { value: "bin2", label: "Bin 2" },
    { value: "staged", label: "Staged" },
    { value: "none", label: "None" },
  ];

  /* ---------- local helpers (coalition.js is a module; its helpers are not global) ---------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function el(id) {
    return document.getElementById(id);
  }

  function toast(msg) {
    var t = el("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove("show"); }, 2800);
  }

  /* ---------- settings store ---------- */
  function deepMerge(base, over) {
    var out = {};
    Object.keys(base).forEach(function (k) {
      var bv = base[k];
      var ov = over && over[k];
      if (bv && typeof bv === "object" && !Array.isArray(bv)) {
        out[k] = deepMerge(bv, ov && typeof ov === "object" ? ov : {});
      } else {
        out[k] = ov === undefined ? bv : ov;
      }
    });
    return out;
  }

  function load() {
    try {
      var raw = localStorage.getItem(LS_SETTINGS);
      if (!raw) return deepMerge(DEFAULTS);
      return deepMerge(DEFAULTS, JSON.parse(raw));
    } catch (e) {
      return deepMerge(DEFAULTS);
    }
  }

  function save() {
    try {
      localStorage.setItem(LS_SETTINGS, JSON.stringify(prefs));
    } catch (e) { /* storage full/blocked — keep running */ }
  }

  var prefs = load();
  var resetArmed = false;
  var resetTimer = null;
  var ebayStatus = { state: "checking" }; // checking | on | off | error

  /* ---------- backend calls ---------- */

  // A hanging fetch would leave rows stuck on "Checking…" forever.
  var FETCH_TIMEOUT_MS = 8000;

  function fetchWithTimeout(url, opts) {
    var ctrl = null;
    var timer = null;
    try {
      if (typeof AbortController === "function") {
        ctrl = new AbortController();
        timer = setTimeout(function () { ctrl.abort(); }, FETCH_TIMEOUT_MS);
        opts = Object.assign({}, opts || {}, { signal: ctrl.signal });
      }
    } catch (e) { /* no abort support — plain fetch */ }
    return fetch(url, opts).finally(function () { if (timer) clearTimeout(timer); });
  }

  function healthEbay() {
    return fetchWithTimeout("/api/health", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (body) {
        var ch = body && (body.channels || []).filter(function (c) { return c.id === "ebay"; })[0];
        return ch ? Boolean(ch.configured) : false;
      })
      .catch(function () { return false; });
  }

  function identifyProviderBackend() {
    // Optional endpoint; 404/401/anything non-200 = not present, use local preference.
    return fetchWithTimeout("/api/identify/status", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) return null;
        return r.json().then(function (body) {
          return body && body.provider ? String(body.provider) : null;
        });
      })
      .catch(function () { return null; });
  }

  function refreshEbayRow() {
    ebayStatus = { state: "checking" };
    paintEbayRow();
    return healthEbay().then(function (configured) {
      ebayStatus = { state: configured ? "on" : "off" };
      paintEbayRow();
    });
  }

  function paintEbayRow() {
    var row = el("stgEbayRow");
    if (!row) return;
    var dot = row.querySelector(".stg-dot");
    var label = row.querySelector(".stg-chan-status");
    var btn = el("btnStgEbaySync");
    if (ebayStatus.state === "checking") {
      dot.classList.remove("on");
      label.textContent = "Checking\u2026";
      if (btn) btn.disabled = true;
    } else if (ebayStatus.state === "on") {
      dot.classList.add("on");
      label.textContent = "Connected";
      if (btn) { btn.disabled = false; btn.title = ""; }
    } else {
      dot.classList.remove("on");
      label.textContent = "Not configured";
      // Syncing while unconfigured just 503s — keep the button inert
      // until the backend reports the channel.
      if (btn) { btn.disabled = true; btn.title = "eBay not configured"; }
    }
  }

  function syncEbayNow() {
    var btn = el("btnStgEbaySync");
    if (btn) { btn.disabled = true; btn.textContent = "Syncing\u2026"; }
    var core = window.HUDcore || null;

    function recordResult(pulled) {
      if (window.HUD_ebay) {
        if (typeof window.HUD_ebay.noteSync === "function") window.HUD_ebay.noteSync(pulled);
        if (typeof window.HUD_ebay.refreshStatus === "function") window.HUD_ebay.refreshStatus();
      }
    }
    function finish() {
      if (btn) { btn.disabled = false; btn.textContent = "Sync now"; }
      refreshEbayRow();
    }

    if (core && typeof core.syncEbay === "function") {
      // Host app path: POST + merge into store + its own toasts.
      core.syncEbay().then(
        function () { recordResult(null); finish(); },
        function () { toast("eBay sync failed"); finish(); }
      );
      return;
    }

    toast("Pulling eBay\u2026");
    fetchWithTimeout("/api/channels/ebay/sync", { method: "POST" })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          return { ok: r.ok, body: body };
        });
      })
      .then(function (out) {
        if (!out.ok) {
          toast(out.body && out.body.error ? out.body.error : "eBay sync failed");
          return;
        }
        var pulled = out.body && out.body.pulled != null ? out.body.pulled : 0;
        toast("eBay sync \u00b7 " + pulled + " pulled");
        recordResult(pulled);
      })
      .catch(function () { toast("eBay sync failed"); })
      .finally(finish);
  }

  /* ---------- data actions ---------- */
  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  // The demo seeder (coalition.js) stamps demo rows with notes:"demo-seed".
  // Only rows carrying that marker are ever removed here — real user data
  // can never match this filter.
  function isDemoItem(it) {
    return it && typeof it.notes === "string" && it.notes.indexOf("demo-seed") !== -1;
  }

  function clearDemoData() {
    var removed = 0;
    var demoIds = {};
    function pruneItems(items) {
      return (items || []).filter(function (it) {
        if (isDemoItem(it)) {
          if (it.id) demoIds[it.id] = true;
          removed++;
          return false;
        }
        return true;
      });
    }
    function pruneSpaces(spaces) {
      (spaces || []).forEach(function (sp) {
        if (sp && Array.isArray(sp.itemIds)) {
          sp.itemIds = sp.itemIds.filter(function (id) { return !demoIds[id]; });
        }
      });
      return spaces;
    }
    try {
      var core = window.HUDcore || null;
      if (core && core.state) {
        // Live app state first, so the UI updates without a reload.
        core.state.items = pruneItems(core.state.items);
        core.state.spaces = pruneSpaces(core.state.spaces);
        core.saveItems();
        core.saveSpaces();
        core.render();
      } else {
        localStorage.setItem(LS_ITEMS, JSON.stringify(pruneItems(readJson(LS_ITEMS, []))));
        localStorage.setItem(LS_SPACES, JSON.stringify(pruneSpaces(readJson(LS_SPACES, []))));
      }
    } catch (e) { /* keep running */ }
    // Nothing auto-seeds anymore — demo items only exist when explicitly loaded
    // via "Load demo data", so remove-from-store is the whole job.
    toast(removed ? "Demo data cleared \u00b7 " + removed + " removed" : "No demo data found");
    render();
  }

  // Explicit opt-in: demo items are NEVER seeded automatically. This is the
  // only path that creates them — it appends to the live inventory via the
  // HUD core seeder (which guards against double-load and rolls back if
  // storage refuses). Not destructive, so no two-tap arm.
  function loadDemoData() {
    var core = window.HUDcore || null;
    if (!core || typeof core.seedDemoItems !== "function") {
      toast("Demo loader unavailable — reload the app and try again");
      return;
    }
    var already = (core.state.items || []).some(function (it) { return isDemoItem(it); });
    if (already) {
      toast("Demo data already loaded");
      render();
      return;
    }
    var added = 0;
    try { added = core.seedDemoItems() || 0; } catch (e) { added = 0; }
    if (added > 0) toast("Demo data loaded \u00b7 " + added + " items");
    // added === 0 with no demo present means storage refused — the seeder's
    // save already showed the honest "storage full" toast.
    render();
  }

  // Two-tap arming for both destructive buttons. Timers auto-disarm after 5s,
  // and render() disarms whenever the view rebuilds (nav away/back), so a
  // stale "armed" state can never survive without its red visual.
  var clearArmed = false;
  var clearTimer = null;

  function disarmClearBtn() {
    clearArmed = false;
    clearTimeout(clearTimer);
    var b = el("btnStgClearDemo");
    if (b) { b.classList.remove("armed"); b.textContent = "Clear demo data"; }
  }

  function disarmResetBtn() {
    resetArmed = false;
    clearTimeout(resetTimer);
    var b = el("btnStgReset");
    if (b) { b.classList.remove("armed"); b.textContent = "Reset all data"; }
  }

  function armClear(btn) {
    if (!clearArmed) {
      clearArmed = true;
      btn.classList.add("armed");
      btn.textContent = "Tap again to clear demo";
      toast("Tap again to remove demo-seeded items");
      clearTimeout(clearTimer);
      clearTimer = setTimeout(disarmClearBtn, 5000);
      return;
    }
    disarmClearBtn();
    clearDemoData();
  }

  function armReset(btn) {
    if (!resetArmed) {
      resetArmed = true;
      btn.classList.add("armed");
      btn.textContent = "Tap again to confirm wipe";
      toast("Tap again to wipe all local data");
      clearTimeout(resetTimer);
      resetTimer = setTimeout(disarmResetBtn, 5000);
      return;
    }
    clearTimeout(resetTimer);
    try {
      [LS_ITEMS, LS_SPACES, LS_SETTINGS].forEach(function (k) {
        localStorage.removeItem(k);
      });
    } catch (e) { /* ignore */ }
    location.reload();
  }

  function exportBackup() {
    try {
      var dump = {};
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        dump[k] = localStorage.getItem(k);
      }
      var blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      var d = new Date();
      var stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0")
        + "-" + String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0");
      a.href = URL.createObjectURL(blob);
      a.download = "coalition-backup-" + stamp + ".json";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 4000);
      toast("Backup exported");
    } catch (e) {
      toast("Export failed");
    }
  }

  /* ---------- render ---------- */
  function optionsList(list, current) {
    return list.map(function (o) {
      return '<option value="' + esc(o.value) + '"' + (o.value === current ? " selected" : "") + ">" +
        esc(o.label) + "</option>";
    }).join("");
  }

  function render() {
    var view = el(VIEW_ID);
    if (!view) return;

    // Rebuilds wipe button visuals — drop any stale armed state with them.
    disarmResetBtn();
    disarmClearBtn();

    view.innerHTML =
      '<div class="panel settings-block bracket">' +
        '<div class="chrome">Channels</div>' +
        '<div class="stg-row" id="stgEbayRow">' +
          '<span class="stg-row-main">' +
            '<span class="stg-row-label"><span class="stg-dot"></span>eBay</span>' +
            '<span class="stg-row-hint stg-chan-status">Checking\u2026</span>' +
          "</span>" +
          '<button type="button" class="btn btn-sm" id="btnStgEbaySync" data-action="ebay-sync" disabled>Sync now</button>' +
        "</div>" +
        '<label class="stg-row" for="stgEbayAuto">' +
          '<span class="stg-row-main">' +
            '<span class="stg-row-label">Auto-sync eBay</span>' +
            '<span class="stg-row-hint">Pull listings in background on launch</span>' +
          "</span>" +
          '<span class="stg-toggle"><input type="checkbox" id="stgEbayAuto"' +
            (prefs.ebayAutoSync ? " checked" : "") + " />" +
            '<span class="stg-knob" aria-hidden="true"></span>' +
          "</span>" +
        "</label>" +
      "</div>" +

      '<div class="panel settings-block">' +
        '<div class="chrome">Identify</div>' +
        '<div class="stg-row">' +
          '<span class="stg-row-main">' +
            '<span class="stg-row-label">Provider</span>' +
            '<span class="stg-row-hint" id="stgIdentifyBackend">Photo in \u2192 identity out</span>' +
          "</span>" +
          '<select class="stg-select" id="stgIdentifyProvider" aria-label="Identify provider">' +
            optionsList(
              [
                { value: "anthropic", label: "Anthropic" },
                { value: "manual", label: "Manual" },
              ],
              prefs.identifyProvider
            ) +
          "</select>" +
        "</div>" +
      "</div>" +

      '<div class="panel settings-block">' +
        '<div class="chrome">Defaults</div>' +
        '<div class="stg-row">' +
          '<span class="stg-row-main">' +
            '<span class="stg-row-label">Default bin</span>' +
            '<span class="stg-row-hint">Assigned when staging an item</span>' +
          "</span>" +
          '<select class="stg-select" id="stgDefaultBin" aria-label="Default bin">' +
            optionsList(BIN_OPTIONS, prefs.defaultBin) +
          "</select>" +
        "</div>" +
      "</div>" +

      '<div class="panel settings-block stg-danger">' +
        '<div class="chrome stg-danger-title">Data</div>' +
        '<div class="stg-actions">' +
          '<button type="button" class="btn btn-sm btn-ghost" id="btnStgClearDemo" data-action="clear-demo">Clear demo data</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" id="btnStgLoadDemo" data-action="load-demo">Load demo data</button>' +
          '<button type="button" class="btn btn-sm" data-action="export">Export backup</button>' +
          '<button type="button" class="btn btn-sm stg-btn-danger" id="btnStgReset" data-action="reset">Reset all data</button>' +
        "</div>" +
        '<p class="stg-foot">Export downloads every localStorage key as JSON. Reset wipes items, spaces and prefs, then reloads.</p>' +
      "</div>";

    paintEbayRow();
    refreshEbayRow();
    identifyProviderBackend().then(function (provider) {
      var hint = el("stgIdentifyBackend");
      if (hint && provider) hint.textContent = "Backend: " + provider;
    });
  }

  /* ---------- events (delegated; survives re-renders) ---------- */
  function bindOnce() {
    if (bindOnce._done) return;
    bindOnce._done = true;

    document.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-action]") : null;
      var view = el(VIEW_ID);
      if (!t || !view || !view.contains(t)) return;
      var action = t.getAttribute("data-action");
      if (action === "ebay-sync") syncEbayNow();
      else if (action === "clear-demo") armClear(t);
      else if (action === "load-demo") loadDemoData();
      else if (action === "export") exportBackup();
      else if (action === "reset") armReset(t);
    });

    document.addEventListener("change", function (e) {
      var t = e.target;
      if (!t || !el(VIEW_ID) || !el(VIEW_ID).contains(t)) return;
      if (t.id === "stgIdentifyProvider") {
        prefs.identifyProvider = t.value === "manual" ? "manual" : "anthropic";
        save();
        toast("Identify provider \u00b7 " + (prefs.identifyProvider === "manual" ? "Manual" : "Anthropic"));
      } else if (t.id === "stgDefaultBin") {
        prefs.defaultBin = t.value;
        save();
        var label = (BIN_OPTIONS.filter(function (o) { return o.value === t.value; })[0] || {}).label || t.value;
        toast("Default bin \u00b7 " + label);
      } else if (t.id === "stgEbayAuto") {
        prefs.ebayAutoSync = t.checked;
        save();
        toast(t.checked ? "eBay auto-sync on" : "eBay auto-sync off");
      }
    });

    // Re-render when the settings view becomes active (nav click or hash).
    function maybeRender() {
      if (el(VIEW_ID) && el(VIEW_ID).classList.contains("active")) render();
    }
    document.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest(".nav-tab") : null;
      if (t && t.getAttribute("data-view") === "settings") {
        setTimeout(maybeRender, 0);
      }
    });
    window.addEventListener("hashchange", maybeRender);
  }

  /* ---------- public API ---------- */
  function get(key) {
    if (key === undefined) return JSON.parse(JSON.stringify(prefs));
    return prefs[key];
  }

  function set(key, value) {
    prefs[key] = value;
    save();
  }

  function init() {
    bindOnce();
    render();
  }

  window.HUD_settings = {
    init: init,
    render: render,
    get: get,
    set: set,
  };
})();
