/* Coalition H.U.D. — Fulfillment (sold -> packed -> shipped -> delivered).
 *
 * Self-contained vanilla-JS module. Lives outside coalition.js on purpose:
 * coalition.js is an ES module whose helpers ($, toast, money, saveItems, ...)
 * are module-scoped, so this file carries its own tiny copies and talks to the
 * host app only through the DOM + localStorage ("coalition-items-v4").
 *
 * Contract:
 *   window.HUD_fulfillment = { init(), renderSheetSection(itemId), refresh() }
 *   - init()                : build the two overlay sheets, inject the shipping
 *                             queue, restore any toast left by a mutation.
 *   - renderSheetSection(id): paint the contextual fulfillment block inside
 *                             #itemSheet (called from openSheet(); see
 *                             public/features/INTEGRATION.md).
 *   - refresh()             : re-read items from localStorage and repaint the
 *                             queue + sheet section.
 *
 * Refresh strategy: the host keeps its own in-memory copy of the items, so
 * after every fulfillment mutation this module writes localStorage and does
 * a full page reload. The reload is the only bulletproof way to keep host
 * memory and the module in sync without editing coalition.js. The toast
 * survives the reload via sessionStorage; the URL hash survives too, so the
 * user lands back in the same view (the item sheet closes, which matches the
 * "toast + close" behavior).
 *
 * Fields this module may add to an item:
 *   soldPrice, soldChannel, soldAt, fees,
 *   packedAt,
 *   trackingNumber, carrier, shippedAt,
 *   deliveredAt
 */

(function () {
  "use strict";

  var LS_ITEMS = "coalition-items-v4";
  var LS_TOAST = "coalition-ff-toast";

  var PHASE_IDS = ["intake", "staged", "listed", "sold", "packed", "shipped", "delivered"];
  var QUEUE_PHASES = ["sold", "packed", "shipped"];
  var QUEUE_ORDER = { sold: 0, packed: 1, shipped: 2 };
  var CHANNELS = ["eBay", "Double Holo", "Misprint", "Marketplace", "Other"];
  var CARRIERS = ["FedEx", "USPS", "UPS", "Other"];

  var inited = false;
  var lastSheetId = null;
  var formItemId = null;

  /* ---------- tiny local helpers (mirrors of the ones in coalition.js) ---------- */

  function $(id) {
    return document.getElementById(id);
  }

  function toast(msg) {
    var el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove("show"); }, 2800);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n) {
    return "$" + (Number(n) || 0).toFixed(2);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function shortDate(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
    } catch (e) {
      return "";
    }
  }

  function phaseFromItem(it) {
    if (it && PHASE_IDS.indexOf(it.phase) >= 0) return it.phase;
    if (it && it.staged) return "staged";
    return "intake";
  }

  /* ---------- item store (localStorage is the shared source of truth) ---------- */

  function loadItems() {
    try {
      var raw = JSON.parse(localStorage.getItem(LS_ITEMS) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function saveAll(items) {
    try {
      localStorage.setItem(LS_ITEMS, JSON.stringify(items));
      return true;
    } catch (e) {
      toast("Storage full — could not save");
      return false;
    }
  }

  function getItem(id) {
    var list = loadItems();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return null;
  }

  function itemTitle(it) {
    return (it && (it.title || it.productName)) || "Untitled";
  }

  /* ---------- toast that survives the post-mutation reload ---------- */

  function stashToast(msg) {
    try { sessionStorage.setItem(LS_TOAST, msg); } catch (e) { /* ignore */ }
  }

  function drainToast() {
    var msg = null;
    try {
      msg = sessionStorage.getItem(LS_TOAST);
      sessionStorage.removeItem(LS_TOAST);
    } catch (e) { /* ignore */ }
    if (msg) toast(msg);
  }

  /* ---------- mutation: write through, toast, reload ---------- */

  function mutate(id, fn, toastMsg) {
    // Prefer live host state via HUDcore bridge (no reload); fall back to reload.
    var core = window.HUDcore;
    if (core && core.state && Array.isArray(core.state.items) && core.saveItems && core.render) {
      var it = null, idx = -1;
      for (var i = 0; i < core.state.items.length; i++) {
        if (core.state.items[i] && core.state.items[i].id === id) { it = core.state.items[i]; idx = i; break; }
      }
      if (!it) {
        toast("Item not found");
        return false;
      }
      var before = null;
      try { before = JSON.parse(JSON.stringify(it)); } catch (e) { before = null; }
      fn(it);
      it.updatedAt = nowIso();
      var saved = false;
      try { saved = core.saveItems(); } catch (e) { saved = false; }
      if (!saved) {
        // Refuse the mutation: restore the pre-mutation item so in-memory
        // state matches what is actually stored. Never report success.
        if (before && idx >= 0) { try { core.state.items[idx] = before; } catch (e2) { /* ignore */ } }
        try { core.toast("Storage full — could not save"); } catch (e3) { toast("Storage full — could not save"); }
        return false;
      }
      if (toastMsg) { try { core.toast(toastMsg); } catch (e) { toast(toastMsg); } }
      try { core.render(); } catch (e) { /* ignore */ }
      try { renderSheetSection(id); } catch (e) { /* ignore */ }
      try { renderQueue(); } catch (e) { /* ignore */ }
      return true;
    }
    var items = loadItems();
    var it2 = null;
    for (var j = 0; j < items.length; j++) {
      if (items[j] && items[j].id === id) { it2 = items[j]; break; }
    }
    if (!it2) {
      toast("Item not found");
      return false;
    }
    fn(it2);
    it2.updatedAt = nowIso();
    if (!saveAll(items)) return false;
    if (toastMsg) stashToast(toastMsg);
    location.reload();
    return true;
  }

  /* ---------- status line ---------- */

  function trackShort(t) {
    var s = String(t || "");
    return s.length > 8 ? s.slice(0, 8) + "…" : s;
  }

  function statusLine(it) {
    var ph = phaseFromItem(it);
    if (QUEUE_PHASES.indexOf(ph) < 0) return "";
    var sold = "SOLD " + money(it.soldPrice != null ? it.soldPrice : it.price);
    if (it.soldChannel) sold += " · " + it.soldChannel;
    if (it.soldAt) sold += " · " + shortDate(it.soldAt);
    if (ph === "sold") return sold;
    if (ph === "packed") {
      return sold + " → PACKED" + (it.packedAt ? " · " + shortDate(it.packedAt) : "");
    }
    if (ph === "shipped") {
      var s = sold + " → SHIPPED";
      if (it.carrier) s += " · " + it.carrier;
      if (it.trackingNumber) s += " " + trackShort(it.trackingNumber);
      return s;
    }
    if (ph === "delivered") {
      return sold + " → DELIVERED" + (it.deliveredAt ? " · " + shortDate(it.deliveredAt) : "");
    }
    return sold;
  }

  /* ---------- next action per phase ---------- */

  function nextAction(ph) {
    if (ph === "listed" || ph === "staged") return { label: "Mark sold", run: openSoldForm };
    if (ph === "sold") return { label: "Pack", run: packItem };
    if (ph === "packed") return { label: "Ship", run: openShipForm };
    if (ph === "shipped") return { label: "Mark delivered", run: deliverItem };
    return null;
  }

  /* ---------- sheet section (hooked into openSheet by the coordinator) ---------- */

  function renderSheetSection(id) {
    lastSheetId = id || null;
    var sheet = $("itemSheet");
    if (!sheet) return;
    var card = sheet.querySelector(".sheet-card");
    if (!card) return;
    var sec = $("ffSection");
    if (!sec) {
      sec = document.createElement("div");
      sec.id = "ffSection";
      var actions = card.querySelector(".sheet-actions");
      if (actions) card.insertBefore(sec, actions);
      else card.appendChild(sec);
    }
    var it = id ? getItem(id) : null;
    var ph = it ? phaseFromItem(it) : null;
    if (!it || PHASE_IDS.indexOf(ph) < 0 || ph === "intake") {
      sec.innerHTML = "";
      sec.style.display = "none";
      return;
    }
    sec.style.display = "";
    var line = statusLine(it);
    var act = nextAction(ph);
    sec.innerHTML =
      '<div class="chrome">FULFILLMENT</div>' +
      (line ? '<div class="ff-status">' + esc(line) + "</div>" : "") +
      (act
        ? '<button type="button" class="btn btn-amber ff-cta" id="ffCta">' + esc(act.label) + "</button>"
        : '<div class="ff-done">DELIVERED — cycle complete</div>');
    var btn = $("ffCta");
    if (btn && act) {
      (function (action, itemId) {
        btn.addEventListener("click", function () { action.run(itemId); });
      })(act, it.id);
    }
  }

  /* ---------- actions ---------- */

  function packItem(id) {
    var it = getItem(id);
    if (!it) { toast("Item not found"); return; }
    if (phaseFromItem(it) !== "sold") {
      toast("Only sold items can be packed");
      return;
    }
    mutate(id, function (x) {
      x.phase = "packed";
      x.packedAt = nowIso();
    }, "Packed · " + itemTitle(it));
  }

  function deliverItem(id) {
    var it = getItem(id);
    if (!it) { toast("Item not found"); return; }
    if (phaseFromItem(it) !== "shipped") {
      toast("Only shipped items can be marked delivered");
      return;
    }
    mutate(id, function (x) {
      x.phase = "delivered";
      x.deliveredAt = nowIso();
    }, "Delivered · " + itemTitle(it));
  }

  /* ---------- overlay sheets ---------- */

  function buildSheets() {
    if ($("ffSoldSheet")) return;
    var wrap = document.createElement("div");
    wrap.innerHTML =
      '<div class="sheet ff-sheet" id="ffSoldSheet" aria-hidden="true">' +
        '<div class="sheet-card">' +
          '<div class="chrome">FULFILLMENT · SOLD</div>' +
          '<h2>Record sale</h2>' +
          '<div class="ff-itemline" id="ffSoldItem"></div>' +
          '<div class="ff-form">' +
            '<label class="ff-field"><span class="chrome">SOLD PRICE $</span>' +
              '<input id="ffSoldPrice" class="ff-input" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" autocomplete="off" />' +
            "</label>" +
            '<label class="ff-field"><span class="chrome">CHANNEL</span>' +
              '<select id="ffSoldChannel" class="ff-input">' +
                CHANNELS.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + "</option>"; }).join("") +
              "</select>" +
            "</label>" +
            '<label class="ff-field"><span class="chrome">FEES $ (OPTIONAL)</span>' +
              '<input id="ffSoldFees" class="ff-input" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" autocomplete="off" />' +
            "</label>" +
            '<div class="ff-hint" id="ffSoldHint"></div>' +
          "</div>" +
          '<div class="sheet-actions">' +
            '<button type="button" class="btn btn-amber" id="ffSoldConfirm">Record sale</button>' +
            '<button type="button" class="btn btn-ghost" id="ffSoldBack">Back</button>' +
          "</div>" +
        "</div>" +
      "</div>" +
      '<div class="sheet ff-sheet" id="ffShipSheet" aria-hidden="true">' +
        '<div class="sheet-card">' +
          '<div class="chrome">FULFILLMENT · SHIP</div>' +
          '<h2>Ship item</h2>' +
          '<div class="ff-itemline" id="ffShipItem"></div>' +
          '<div class="ff-form">' +
            '<label class="ff-field"><span class="chrome">TRACKING NUMBER</span>' +
              '<input id="ffShipTracking" class="ff-input" type="text" placeholder="Required" autocomplete="off" autocapitalize="off" spellcheck="false" />' +
            "</label>" +
            '<label class="ff-field"><span class="chrome">CARRIER</span>' +
              '<select id="ffShipCarrier" class="ff-input">' +
                CARRIERS.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + "</option>"; }).join("") +
              "</select>" +
            "</label>" +
          "</div>" +
          '<div class="sheet-actions">' +
            '<button type="button" class="btn btn-amber" id="ffShipConfirm">Mark shipped</button>' +
            '<button type="button" class="btn btn-ghost" id="ffShipBack">Back</button>' +
          "</div>" +
        "</div>" +
      "</div>";
    document.body.appendChild(wrap);

    var q = function (sel) { return wrap.querySelector(sel); };
    q("#ffSoldBack").addEventListener("click", function () { closeOverlay("ffSoldSheet"); });
    q("#ffSoldConfirm").addEventListener("click", confirmSold);
    q("#ffShipBack").addEventListener("click", function () { closeOverlay("ffShipSheet"); });
    q("#ffShipConfirm").addEventListener("click", confirmShipped);
    q("#ffSoldPrice").addEventListener("input", paintSoldHint);
  }

  function closeOverlay(id) {
    var el = $(id);
    if (el) el.classList.remove("open");
    formItemId = null;
  }

  function inferChannel(it) {
    var ch = (it && it.channels) || {};
    if (ch.ebay && (ch.ebay.listingId || ch.ebay.status === "active")) return "eBay";
    if (ch.double_holo) return "Double Holo";
    if (ch.misprint) return "Misprint";
    return "eBay";
  }

  function sellablePhase(ph) {
    return ph === "listed" || ph === "staged";
  }

  function openSoldForm(id) {
    var it = getItem(id);
    if (!it) { toast("Item not found"); return; }
    if (!sellablePhase(phaseFromItem(it))) {
      toast("Sale already recorded");
      return;
    }
    formItemId = id;
    $("ffSoldItem").textContent = itemTitle(it);
    var priceInput = $("ffSoldPrice");
    priceInput.value = it.price != null && it.price !== "" ? it.price : "";
    $("ffSoldChannel").value = inferChannel(it);
    $("ffSoldFees").value = "";
    paintSoldHint();
    $("ffSoldSheet").classList.add("open");
    setTimeout(function () { priceInput.focus(); }, 80);
  }

  function paintSoldHint() {
    var hint = $("ffSoldHint");
    if (!hint) return;
    var it = formItemId ? getItem(formItemId) : null;
    var list = it ? Number(it.price) || 0 : 0;
    var sp = Number($("ffSoldPrice").value) || 0;
    if (list > 0 && sp !== list) {
      hint.textContent = "Listed " + money(list) + " · selling " + money(sp);
    } else {
      hint.textContent = "";
    }
  }

  function confirmSold() {
    var it = formItemId ? getItem(formItemId) : null;
    if (!it) { closeOverlay("ffSoldSheet"); return; }
    if (!sellablePhase(phaseFromItem(it))) {
      closeOverlay("ffSoldSheet");
      toast("Sale already recorded");
      return;
    }
    var soldPrice = Math.max(0, Number($("ffSoldPrice").value) || 0);
    var channel = $("ffSoldChannel").value || "eBay";
    var feesRaw = $("ffSoldFees").value;
    var fees = feesRaw === "" || feesRaw == null ? null : Math.max(0, Number(feesRaw) || 0);
    var id = it.id;
    var title = itemTitle(it);
    // Close before mutate: prevents a stuck overlay on the no-reload path
    // and a double-tap re-submitting (formItemId is cleared).
    closeOverlay("ffSoldSheet");
    mutate(id, function (x) {
      x.phase = "sold";
      x.soldPrice = soldPrice;
      x.soldChannel = channel;
      x.soldAt = nowIso();
      if (fees != null) x.fees = fees;
      else delete x.fees;
    }, "Sold · " + money(soldPrice) + " · " + channel + " · " + title);
  }

  function openShipForm(id) {
    var it = getItem(id);
    if (!it) { toast("Item not found"); return; }
    if (phaseFromItem(it) !== "packed") {
      toast("Only packed items can be shipped");
      return;
    }
    formItemId = id;
    var line = statusLine(it) || "SOLD " + money(it.soldPrice != null ? it.soldPrice : it.price);
    $("ffShipItem").textContent = itemTitle(it) + " · " + line;
    $("ffShipTracking").value = it.trackingNumber || "";
    $("ffShipCarrier").value = it.carrier || "FedEx";
    $("ffShipSheet").classList.add("open");
    setTimeout(function () { $("ffShipTracking").focus(); }, 80);
  }

  function confirmShipped() {
    var it = formItemId ? getItem(formItemId) : null;
    if (!it) { closeOverlay("ffShipSheet"); return; }
    if (phaseFromItem(it) !== "packed") {
      closeOverlay("ffShipSheet");
      toast("Only packed items can be shipped");
      return;
    }
    var tracking = ($("ffShipTracking").value || "").trim();
    if (!tracking) {
      toast("Tracking number required");
      $("ffShipTracking").focus();
      return;
    }
    var carrier = $("ffShipCarrier").value || "FedEx";
    var id = it.id;
    var title = itemTitle(it);
    // Close before mutate: prevents a stuck overlay on the no-reload path
    // and a double-tap re-submitting (formItemId is cleared).
    closeOverlay("ffShipSheet");
    mutate(id, function (x) {
      x.phase = "shipped";
      x.trackingNumber = tracking;
      x.carrier = carrier;
      x.shippedAt = nowIso();
    }, "Shipped · " + carrier + " " + trackShort(tracking) + " · " + title);
  }

  /* ---------- shipping queue (top of Map view) ---------- */

  function queueItems() {
    var list = loadItems().filter(function (i) {
      return QUEUE_PHASES.indexOf(phaseFromItem(i)) >= 0;
    });
    list.sort(function (a, b) {
      var pa = QUEUE_ORDER[phaseFromItem(a)];
      var pb = QUEUE_ORDER[phaseFromItem(b)];
      if (pa !== pb) return pa - pb;
      var ta = Date.parse(a.soldAt || a.createdAt || "") || 0;
      var tb = Date.parse(b.soldAt || b.createdAt || "") || 0;
      return ta - tb; // oldest first — longest wait gets packed first
    });
    return list;
  }

  function ensureQueue() {
    var view = $("constellationTree");
    if (!view || $("ffQueue")) return;
    var q = document.createElement("section");
    q.id = "ffQueue";
    q.className = "panel ff-queue";
    view.insertBefore(q, view.firstChild);
  }

  function queueAction(ph) {
    if (ph === "sold") return { label: "PACK", run: "pack" };
    if (ph === "packed") return { label: "SHIP", run: "ship" };
    if (ph === "shipped") return { label: "DELIVERED", run: "deliver" };
    return null;
  }

  var FF_STAGES = [
    { id: "sold", label: "Dropoff" },
    { id: "packed", label: "Scan" },
    { id: "shipped", label: "In Transit" },
  ];

  function queueRow(it, idx) {
    var ph = phaseFromItem(it);
    var act = queueAction(ph);
    var src = (it.photos && it.photos[0] && it.photos[0].dataUrl) || "";
    var name = itemTitle(it) || "Untitled";
    var thumb = src
      ? '<img src="' + esc(src) + '" alt="" loading="lazy" draggable="false" />'
      : '<span class="node-initial" aria-hidden="true">' + esc(name.charAt(0).toUpperCase()) + "</span>";
    return (
      '<div class="ff-node">' +
        '<button type="button" class="node-item ff-thumb" data-ffsheet="' + esc(it.id) + '"' +
        ' style="animation-delay:' + (idx * 0.4).toFixed(2) + 's" aria-label="' + esc(name) + '">' + thumb + "</button>" +
        (act
          ? '<button type="button" class="btn btn-amber btn-sm ff-qact" data-ffq="' + esc(it.id) + '" data-act="' + act.run + '">' + esc(act.label) + "</button>"
          : "") +
      "</div>"
    );
  }

  function renderQueue() {
    ensureQueue();
    var q = $("ffQueue");
    if (!q) return;
    var list = queueItems();
    var byStage = { sold: [], packed: [], shipped: [] };
    list.forEach(function (it) {
      var ph = phaseFromItem(it);
      if (byStage[ph]) byStage[ph].push(it);
    });
    var clusters = FF_STAGES.map(function (st) {
      var nodes = byStage[st.id].map(function (it, i) { return queueRow(it, i); }).join("");
      return '<div class="ff-cluster" data-ffphase="' + st.id + '">' + nodes + "</div>";
    }).join("");
    var track = FF_STAGES.map(function (st, i) {
      return (i ? '<span class="seg" aria-hidden="true"><span class="chev">\u203a</span></span>' : "") +
        '<span class="orb-wrap"><span class="orb"></span></span>';
    }).join("");
    var labels = FF_STAGES.map(function (st) {
      return '<div class="rlabel"><span class="rl-name">' + st.label + "</span>" +
        '<span class="rl-count">' + String(byStage[st.id].length).padStart(2, "0") + "</span></div>";
    }).join("");
    q.innerHTML =
      '<div class="ff-queue-head"><div class="chrome">SHIPPING QUEUE</div>' +
      '<div class="ff-queue-count">' + String(list.length).padStart(2, "0") + "</div></div>" +
      (list.length
        ? '<div class="ff-road"><div class="ff-clusters">' + clusters + "</div>" +
          '<div class="ff-track">' + track + "</div>" +
          '<div class="ff-labels">' + labels + "</div></div>"
        : '<div class="empty-quiet">Queue clear — nothing sold, packed, or shipped</div>');
    var btns = q.querySelectorAll("[data-ffq]");
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener("click", function (ev) {
          ev.stopPropagation();
          var id = b.getAttribute("data-ffq");
          var act = b.getAttribute("data-act");
          if (act === "pack") packItem(id);
          else if (act === "ship") openShipForm(id);
          else if (act === "deliver") deliverItem(id);
        });
      })(btns[i]);
    }
    var sheets = q.querySelectorAll("[data-ffsheet]");
    for (var j = 0; j < sheets.length; j++) {
      (function (b) {
        b.addEventListener("click", function () {
          if (window.HUD_openSheet) window.HUD_openSheet(b.getAttribute("data-ffsheet"));
        });
      })(sheets[j]);
    }
  }

  /* ---------- refresh ---------- */

  function refresh() {
    renderQueue();
    if (lastSheetId) renderSheetSection(lastSheetId);
  }

  /* ---------- init ---------- */

  function init() {
    if (inited) return;
    inited = true;
    buildSheets();
    drainToast();
    renderQueue();
    var host = $("view-constellation");
    if (host && typeof MutationObserver === "function") {
      new MutationObserver(function () {
        if (host.classList.contains("active")) renderQueue();
      }).observe(host, { attributes: true, attributeFilter: ["class"] });
    }
  }

  window.HUD_fulfillment = {
    init: init,
    renderSheetSection: renderSheetSection,
    refresh: refresh,
  };

  // Belt-and-suspenders: if the coordinator wires init() only via DOMContentLoaded
  // and never from bind(), this still boots. Idempotent either way.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
