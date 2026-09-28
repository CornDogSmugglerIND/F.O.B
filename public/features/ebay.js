/* Coalition H.U.D. — eBay connection UI.
 * Vanilla JS, no deps. Frontend calls /api/channels/* only —
 * credentials live server-side (~/.config/ebay) and are never touched here.
 */
(function () {
  "use strict";

  var LAST_SYNC_KEY = "coalition-ebay-last-sync";

  // offline | live | error
  var connState = "offline";
  var connDetail = "";
  var syncBusy = false;
  var inited = false;

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    if (typeof escapeHtml === "function") return escapeHtml(String(s));
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function say(msg) {
    if (typeof toast === "function") toast(msg);
    else console.log("[hud-ebay]", msg);
  }

  /* ---------- status fetchers ---------- */

  async function fetchStatusEntry() {
    try {
      var res = await fetch("/api/channels/status");
      if (!res.ok) return { configured: false };
      var body = await res.json();
      var list = (body && body.channels) || [];
      var ebay = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].id === "ebay") { ebay = list[i]; break; }
      }
      return { configured: Boolean(ebay && ebay.configured), entry: ebay };
    } catch (e) {
      return { configured: false };
    }
  }

  // Deeper check: refresh token actually valid server-side?
  async function fetchProbe() {
    try {
      var res = await fetch("/api/channels/ebay/probe");
      var body = await res.json().catch(function () { return {}; });
      return { ok: Boolean(res.ok && body && body.ok), detail: (body && body.error) || "" };
    } catch (e) {
      return { ok: false, detail: "probe unreachable" };
    }
  }

  /* ---------- pill ---------- */

  var PILL_LABEL = { offline: "EBAY OFFLINE", live: "EBAY LIVE", error: "EBAY ERROR" };

  function applyPill() {
    var pill = $("ebayPill");
    var label = $("ebayPillLabel");
    if (!pill || !label) return;
    // Keep coalition.js's "on" convention in sync: on only when live.
    pill.classList.toggle("on", connState === "live");
    pill.classList.toggle("ebay-live", connState === "live");
    pill.classList.toggle("ebay-error", connState === "error");
    pill.classList.toggle("ebay-offline", connState === "offline");
    label.textContent = PILL_LABEL[connState];
  }

  // coalition.js renderChannels() rewrites the pill label/class on its own renders.
  // Keep our deeper probe state canonical without editing coalition.js.
  function guardPill() {
    var pill = $("ebayPill");
    var label = $("ebayPillLabel");
    if (!pill || !label || typeof MutationObserver !== "function") return;
    var applying = false;
    var obs = new MutationObserver(function () {
      if (applying) return;
      applying = true;
      try { applyPill(); } finally { applying = false; }
    });
    obs.observe(pill, { attributes: true, attributeFilter: ["class"] });
    obs.observe(label, { childList: true, characterData: true, subtree: true });
  }

  /* ---------- status card ---------- */

  function cardHtml() {
    return (
      '<div class="ebay-card-head">' +
        '<span class="ebay-card-title">EBAY</span>' +
        '<span class="ebay-badge ebay-offline" id="ebayBadge">' +
          '<span class="dot"></span>' +
          '<span id="ebayBadgeLabel">CHECKING</span>' +
        "</span>" +
      "</div>" +
      '<div class="ebay-status-line" id="ebayStatusLine">Checking…</div>' +
      '<div class="ebay-meta" id="ebayMeta">' + esc(metaText()) + "</div>" +
      '<div class="ebay-actions">' +
        '<button type="button" class="btn btn-amber" id="btnEbayCardSync">Sync now</button>' +
        '<button type="button" class="btn btn-ghost" id="btnEbayCardProbe">Check connection</button>' +
      "</div>"
    );
  }

  function injectCard() {
    if ($("ebayCard")) return;
    var view = $("view-channels");
    if (!view) return;
    var card = document.createElement("div");
    card.className = "ebay-card";
    card.id = "ebayCard";
    card.innerHTML = cardHtml();
    view.insertBefore(card, view.firstChild);
    var b1 = $("btnEbayCardSync");
    var b2 = $("btnEbayCardProbe");
    if (b1) b1.addEventListener("click", handleSync);
    if (b2) b2.addEventListener("click", handleCheckConnection);
  }

  function renderCard() {
    var badge = $("ebayBadge");
    var badgeLabel = $("ebayBadgeLabel");
    var line = $("ebayStatusLine");
    var meta = $("ebayMeta");
    var syncBtn = $("btnEbayCardSync");
    if (!badge || !line) return;
    badge.classList.toggle("ebay-live", connState === "live");
    badge.classList.toggle("ebay-error", connState === "error");
    badge.classList.toggle("ebay-offline", connState === "offline");
    if (badgeLabel) badgeLabel.textContent = PILL_LABEL[connState];
    if (connState === "live") {
      line.textContent = "Configured · token OK";
    } else if (connState === "error") {
      line.textContent = "Configured · auth failing — link via Base44/Claude";
    } else {
      line.textContent = "Not configured — link via Base44/Claude";
    }
    if (meta) meta.textContent = metaText();
    if (syncBtn) {
      syncBtn.disabled = syncBusy;
      syncBtn.textContent = syncBusy ? "Syncing…" : "Sync now";
    }
  }

  function setState(next, detail) {
    connState = next;
    connDetail = detail || "";
    applyPill();
    renderCard();
  }

  /* ---------- last sync ---------- */

  function readLastSync() {
    try {
      var raw = localStorage.getItem(LAST_SYNC_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeLastSync(at, pulled) {
    try {
      var prev = readLastSync() || {};
      localStorage.setItem(
        LAST_SYNC_KEY,
        JSON.stringify({
          at: at,
          pulled: pulled == null ? (prev.pulled == null ? null : prev.pulled) : pulled,
        })
      );
    } catch (e) { /* storage unavailable — fine */ }
  }

  function metaText() {
    var s = readLastSync();
    if (!s || !s.at) return "Last sync: never";
    var d = new Date(s.at);
    var when = d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
    return "Last sync: " + when + (s.pulled == null ? "" : " · " + s.pulled + " pulled");
  }

  /* ---------- actions ---------- */

  async function refreshStatus() {
    var st = await fetchStatusEntry();
    if (!st.configured) {
      setState("offline");
      return;
    }
    var probe = await fetchProbe();
    if (probe.ok) setState("live");
    else setState("error", probe.detail);
  }

  async function handleCheckConnection() {
    say("Checking eBay…");
    await refreshStatus();
    if (connState === "live") say("eBay token OK");
    else if (connState === "error") say("eBay error — " + (connDetail || "auth failing"));
    else say("eBay not configured");
  }

  // Fallback when coalition's global syncEbay isn't present: own POST + merge.
  async function fallbackSync() {
    var res = await fetch("/api/channels/ebay/sync", { method: "POST" });
    var body = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      throw new Error((body && body.error) || "sync failed (" + res.status + ")");
    }
    return body;
  }

  async function handleSync() {
    if (syncBusy) return;
    syncBusy = true;
    renderCard();
    say("Pulling eBay…");
    try {
      if (typeof syncEbay === "function") {
        // coalition's global: POST + merge into store + toast. Pulled count
        // is reported by its own toast; timestamp recorded here.
        await syncEbay();
        writeLastSync(Date.now(), null);
      } else {
        var body = await fallbackSync();
        var pulled = body && typeof body.pulled === "number" ? body.pulled : null;
        writeLastSync(Date.now(), pulled);
        say("eBay sync · " + (pulled == null ? "?" : pulled) + " pulled");
      }
    } catch (e) {
      say("eBay sync failed — " + (e && e.message ? e.message : "check channel config"));
    } finally {
      syncBusy = false;
      await refreshStatus();
      renderCard();
    }
  }

  /* ---------- public ---------- */

  function init() {
    if (inited) return;
    inited = true;
    injectCard();
    applyPill();
    guardPill();
    renderCard();
    refreshStatus();
  }

  window.HUD_ebay = {
    init: init,
    refreshStatus: refreshStatus,
  };
})();
