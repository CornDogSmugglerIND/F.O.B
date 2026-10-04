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
    var c = window.HUDcore || null;
    if (c && typeof c.escapeHtml === "function") return c.escapeHtml(String(s));
    if (typeof escapeHtml === "function") return escapeHtml(String(s));
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function say(msg) {
    var c = window.HUDcore || null;
    if (c && typeof c.toast === "function") c.toast(msg);
    else if (typeof toast === "function") toast(msg);
    else console.log("[hud-ebay]", msg);
  }

  /* ---------- status fetchers ---------- */

  // A hanging fetch would freeze the pill/badge on "CHECKING" forever.
  var FETCH_TIMEOUT_MS = 8000;

  function fetchJson(url, opts) {
    var ctrl = null;
    var timer = null;
    try {
      if (typeof AbortController === "function") {
        ctrl = new AbortController();
        timer = setTimeout(function () { ctrl.abort(); }, FETCH_TIMEOUT_MS);
        opts = Object.assign({}, opts, { signal: ctrl.signal });
      }
    } catch (e) { /* no abort support — plain fetch */ }
    return fetch(url, opts)
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          return { res: res, body: body };
        });
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  async function fetchStatusEntry() {
    try {
      var out = await fetchJson("/api/channels/status", { cache: "no-store" });
      if (!out.res.ok) return { configured: false };
      var list = (out.body && out.body.channels) || [];
      var ebay = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].id === "ebay") { ebay = list[i]; break; }
      }
      return { configured: Boolean(ebay && ebay.configured), entry: ebay };
    } catch (e) {
      return { configured: false };
    }
  }

  // Deeper check: is the refresh token actually valid server-side?
  // GET /api/channels/ebay/probe mints a real eBay access token via the
  // OAuth refresh flow — ok:true only when the token is live.
  async function fetchProbe() {
    try {
      var out = await fetchJson("/api/channels/ebay/probe", { cache: "no-store" });
      var ok = Boolean(out.res.ok && out.body && out.body.ok);
      return { ok: ok, detail: ok ? "" : ((out.body && out.body.error) || "probe failed") };
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
    // Write the label ONLY when it differs: guardPill's MutationObserver
    // re-applies coalition.js's own pill writes, and an unconditional
    // textContent write would re-trigger the observer forever.
    var want = PILL_LABEL[connState];
    if (label.textContent !== want) label.textContent = want;
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
      line.textContent = "Configured · " + (connDetail || "eBay needs to reconnect");
    } else {
      line.textContent = "eBay is not connected yet";
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

  // Recorded by us and by the Settings sync button so "Last sync" stays honest.
  function noteSync(pulled) {
    writeLastSync(Date.now(), pulled);
    renderCard();
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

  var checkBusy = false;

  async function handleCheckConnection() {
    if (checkBusy) return;
    checkBusy = true;
    var btn = $("btnEbayCardProbe");
    if (btn) btn.disabled = true;
    say("Checking eBay…");
    try {
      await refreshStatus();
      if (connState === "live") say("eBay token OK");
      else if (connState === "error") say("eBay error — " + (connDetail || "auth failing"));
      else say("eBay not configured");
    } finally {
      checkBusy = false;
      if (btn) btn.disabled = false;
    }
  }

  // Fallback when the host app bridge isn't present: own POST + merge.
  async function fallbackSync() {
    var out = await fetchJson("/api/channels/ebay/sync", { method: "POST" });
    if (!out.res.ok) {
      throw new Error((out.body && out.body.error) || "sync failed (" + out.res.status + ")");
    }
    return out.body;
  }

  async function handleSync() {
    if (syncBusy) return;
    syncBusy = true;
    renderCard();
    say("Pulling eBay…");
    try {
      var core = window.HUDcore || null;
      if (core && typeof core.syncEbay === "function") {
        // Host app's global: POST + merge into store + toast.
        await core.syncEbay();
        noteSync(null);
      } else {
        var body = await fallbackSync();
        var pulled = body && typeof body.pulled === "number" ? body.pulled : null;
        noteSync(pulled);
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
    noteSync: noteSync,
  };
})();
