/* AX: the clean surface. New markup for Scouter + Tree, one title per tab.
 * All behavior (photos, identify, stage, move, tracking) stays in coalition.js / hud.js;
 * this file only draws and forwards taps to them. */
(function () {
  "use strict";
  var D = document;
  var $ = function (id) { return D.getElementById(id); };
  var C = function () { return window.HUDcore; };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]; }); };
  var photo = function (it) { return (it.photos && it.photos[0] && it.photos[0].dataUrl) || ""; };
  var nameOf = function (it) { return it.title || it.productName || "Untitled"; };
  var worth = function (it) { return (Number(it.price) || 0) * (Number(it.quantity) || 1); };
  var TITLES = { command: "Command", scouter: "Scouter", constellation: "Tree", collection: "Collection", spaces: "Spaces", channels: "Channels", settings: "Settings" };
  var NEXT = { intake: "Stage it", staged: "Mark listed", listed: "Mark sold", sold: "Mark packed", packed: "Mark shipped", shipped: "Mark delivered" };
  var ICON = {
    cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-2.4h6L17 8h3v11H4V8z"/><circle cx="12" cy="13.4" r="3.4"/></svg>',
    bar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4.5 6v12M8 6v12M11 6v12M13.5 6v12M16.5 6v12M20 6v12"/></svg>',
    img: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><circle cx="9" cy="10.5" r="1.6"/><path d="M4.5 16.5l4.5-3.6 3.6 2.8 3.4-3.2 3.5 3.4"/></svg>'
  };

  var scoutFilter = "all";
  var treeStage = null;
  var focus = { scout: null, tree: null };

  function money(n) { return C().money(n); }
  function phaseOf(it) { return C().phaseFromItem(it); }
  function phases() { return C().PHASES; }
  function phaseLabel(id) { var p = phases().filter(function (x) { return x.id === id; })[0]; return p ? p.label : id; }

  function ensure(sectionId, id) {
    var sec = $(sectionId);
    if (!sec) return null;
    var el = $(id);
    if (!el) { el = D.createElement("div"); el.id = id; el.className = "ax-v"; sec.appendChild(el); }
    return el;
  }

  function card(it, idx) {
    var src = photo(it), q = Number(it.quantity) || 1;
    return '<button type="button" class="ax-card" data-id="' + esc(it.id) + '" data-i="' + idx + '" aria-label="' + esc(nameOf(it)) + '">' +
      (src ? '<img src="' + src + '" alt="" draggable="false" loading="lazy">' : '<b class="ax-ini">' + esc(nameOf(it).charAt(0).toUpperCase()) + "</b>") +
      '<span class="ax-pill">' + esc(phaseLabel(phaseOf(it))) + "</span>" +
      (q > 1 ? '<span class="ax-qty">×' + q + "</span>" : "") +
      '<span class="ax-meta"><b>' + esc(nameOf(it)) + "</b><i>" + money(worth(it)) + "</i></span></button>";
  }

  /* horizontal snap rail with a focused card; returns nothing, wires focus into state[key] */
  function wireRail(host, key, afterFocus) {
    var rail = host.querySelector(".ax-rail");
    if (!rail) return;
    var cards = [].slice.call(rail.querySelectorAll(".ax-card"));
    function pick() {
      var mid = rail.scrollLeft + rail.clientWidth / 2, best = null, bd = 1e9;
      cards.forEach(function (c) {
        var d = Math.abs(c.offsetLeft - rail.offsetLeft + c.offsetWidth / 2 - mid);
        if (d < bd) { bd = d; best = c; }
      });
      cards.forEach(function (c) { c.classList.toggle("on", c === best); });
      if (best && focus[key] !== best.dataset.id) { focus[key] = best.dataset.id; afterFocus(); }
    }
    var t;
    rail.addEventListener("scroll", function () { clearTimeout(t); t = setTimeout(pick, 40); }, { passive: true });
    cards.forEach(function (c) {
      c.addEventListener("click", function () {
        if (!c.classList.contains("on")) { rail.scrollTo({ left: c.offsetLeft - rail.offsetLeft - (rail.clientWidth - c.offsetWidth) / 2, behavior: "smooth" }); return; }
        if (C().openCard) C().openCard(c.dataset.id, c);
      });
    });
    var want = cards.filter(function (c) { return c.dataset.id === focus[key]; })[0] || cards[0];
    if (want) {
      want.classList.add("on");
      rail.scrollLeft = want.offsetLeft - rail.offsetLeft - (rail.clientWidth - want.offsetWidth) / 2;
      focus[key] = want.dataset.id;
    }
  }

  function nextBar(items, key) {
    var it = items.filter(function (x) { return x.id === focus[key]; })[0] || items[0];
    if (!it) return "";
    var ph = phaseOf(it), list = phases(), i = list.map(function (p) { return p.id; }).indexOf(ph), nx = list[i + 1];
    var early = i <= 1;
    return '<div class="ax-next" data-id="' + esc(it.id) + '">' +
      (early ? '<button type="button" class="ax-btn" data-a="identify">Identify</button>' : '<button type="button" class="ax-btn" data-a="open">Details</button>') +
      (nx ? '<button type="button" class="ax-btn pri" data-a="next" data-to="' + nx.id + '">' + (NEXT[ph] || "Next") + "</button>" : "") +
      "</div>";
  }

  function wireNext(host) {
    host.querySelectorAll(".ax-next [data-a]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.closest(".ax-next").dataset.id, a = b.dataset.a;
        if (a === "next") C().moveItemToPhase(id, b.dataset.to);
        else if (a === "open") C().openSheet(id);
        else if (a === "identify") { C().openSheet(id); setTimeout(function () { var x = $("btnIdentify"); if (x) x.click(); }, 80); }
      });
    });
  }

  /* ---------------- Scouter ---------------- */
  function renderScouter() {
    var host = ensure("view-scouter", "axScout");
    if (!host || !C()) return;
    var all = C().state.items.filter(function (i) { var p = phaseOf(i); return p === "intake" || p === "staged"; });
    var intake = all.filter(function (i) { return phaseOf(i) === "intake"; });
    var staged = all.filter(function (i) { return phaseOf(i) === "staged"; });
    var list = scoutFilter === "intake" ? intake : scoutFilter === "staged" ? staged : all;
    list = list.slice().sort(function (a, b) { return (Date.parse(b.createdAt || 0) || 0) - (Date.parse(a.createdAt || 0) || 0); });
    var total = all.reduce(function (s, i) { return s + worth(i); }, 0);
    var seg = [["all", "All", all.length], ["intake", "Intake", intake.length], ["staged", "Staged", staged.length]].map(function (s) {
      return '<button type="button" data-f="' + s[0] + '" class="' + (scoutFilter === s[0] ? "on" : "") + '">' + s[1] + " <i>" + s[2] + "</i></button>";
    }).join("");
    var body = list.length
      ? '<div class="ax-rail">' + list.map(card).join("") + "</div>" + '<div id="axScoutNext">' + nextBar(list, "scout") + "</div>"
      : '<button type="button" class="ax-empty" data-proxy="btnSnap">' + ICON.cam + "<b>Snap your first item</b><span>It lands here, ready to identify</span></button>";
    host.innerHTML =
      '<div class="ax-hero"><div><div class="ax-big">' + String(all.length).padStart(2, "0") + '</div><div class="ax-cap">on your Scouter</div></div>' +
      '<div class="ax-val">' + money(total) + "</div></div>" +
      '<div class="ax-seg" role="tablist">' + seg + "</div>" + body;
    host.querySelectorAll(".ax-seg [data-f]").forEach(function (b) { b.addEventListener("click", function () { scoutFilter = b.dataset.f; focus.scout = null; renderScouter(); }); });
    var pr = host.querySelector("[data-proxy]");
    if (pr) pr.addEventListener("click", function () { var x = $(pr.dataset.proxy); if (x) x.click(); });
    wireRail(host, "scout", function () { var n = $("axScoutNext"); if (n) { n.innerHTML = nextBar(list, "scout"); wireNext(n); } });
    wireNext(host);

    var dock = $("axDock");
    if (!dock) {
      dock = D.createElement("div"); dock.id = "axDock"; dock.className = "ax-dock";
      dock.innerHTML = '<button type="button" class="ax-d pri" data-p="btnSnap" aria-label="Take photo">' + ICON.cam + "<span>Photo</span></button>" +
        '<button type="button" class="ax-d" data-p="btnBarcode" aria-label="Scan barcode">' + ICON.bar + "</button>" +
        '<button type="button" class="ax-d" data-p="btnGallery" aria-label="Add from gallery">' + ICON.img + "</button>";
      D.body.appendChild(dock);
      dock.querySelectorAll("[data-p]").forEach(function (b) { b.addEventListener("click", function () { var x = $(b.dataset.p); if (x) x.click(); }); });
    }
  }

  /* ---------------- Tree ---------------- */
  function renderTree() {
    var host = ensure("view-constellation", "axTree");
    if (!host || !C()) return;
    var items = C().state.items, P = phases();
    var by = {}; P.forEach(function (p) { by[p.id] = []; });
    items.forEach(function (i) { (by[phaseOf(i)] || by.intake).push(i); });
    if (!treeStage || !by[treeStage]) { var f = P.filter(function (p) { return by[p.id].length; })[0]; treeStage = (f || P[0]).id; }
    var nodes = P.map(function (p, i) {
      var n = by[p.id].length;
      return '<button type="button" class="ax-node' + (p.id === treeStage ? " sel" : "") + (n ? " has" : "") + '" data-s="' + p.id + '"><i>' + n + "</i><span>" + p.label + "</span></button>";
    }).join("");
    var list = by[treeStage];
    var val = list.reduce(function (s, i) { return s + worth(i); }, 0);
    var body = list.length
      ? '<div class="ax-rail">' + list.map(card).join("") + "</div>" + '<div id="axTreeNext">' + nextBar(list, "tree") + "</div>"
      : '<div class="ax-quiet">Nothing at ' + esc(phaseLabel(treeStage)) + " yet</div>";
    host.innerHTML =
      '<div class="ax-line"><div class="ax-track"></div>' + nodes + "</div>" +
      '<div class="ax-stagehead"><b>' + esc(phaseLabel(treeStage)) + "</b><span>" + list.length + (list.length === 1 ? " item" : " items") + " · " + money(val) + "</span></div>" + body;
    host.querySelectorAll(".ax-node").forEach(function (b) { b.addEventListener("click", function () { treeStage = b.dataset.s; focus.tree = null; renderTree(); }); });
    wireRail(host, "tree", function () { var n = $("axTreeNext"); if (n) { n.innerHTML = nextBar(list, "tree"); wireNext(n); } });
    wireNext(host);
    var sel = host.querySelector(".ax-node.sel");
    if (sel && sel.scrollIntoView) { var ln = host.querySelector(".ax-line"); ln.scrollLeft = sel.offsetLeft - ln.clientWidth / 2 + sel.offsetWidth / 2; }
  }

  function title() {
    var v = C().state.view || "command";
    var w = D.querySelector(".hud-wordmark");
    if (w) w.textContent = TITLES[v] || "Coalition";
    D.body.setAttribute("data-view", v);
  }

  window.AX = {
    render: function () { if (!C()) return; try { title(); renderScouter(); renderTree(); } catch (e) { console.error("AX", e); } }
  };
  D.addEventListener("DOMContentLoaded", function () { var n = 0; (function w() { if (C() && C().state) window.AX.render(); else if (n++ < 60) setTimeout(w, 100); })(); });
})();
