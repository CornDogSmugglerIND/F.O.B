/* Channels hub: Sync on top, status, search + filters, one tidy list. Setup lives in a drawer at the bottom. */
(function () {
  var C = function () { return window.HUDcore; };
  var st = { q: "", f: "live", shown: 40 };
  var sig = "";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function money(n) { return n == null || n === "" ? "" : "$" + Number(n).toFixed(2); }
  var GONE = ["sold", "packed", "shipped", "delivered"];
  function bucket(i) {
    var p = i.phase;
    if (GONE.indexOf(p) >= 0) return "sold";
    if (i.ended) return "ended";
    if (p === "listed") return "live";
    return "draft";
  }
  function thumb(i) { var p = (i.photos || [])[0]; return p ? (p.dataUrl || p.url || "") : ""; }
  function chips(i) {
    var ch = i.channels || {}, out = [];
    [["ebay", "eBay"], ["misprint", "Misprint"], ["double_holo", "DH"], ["facebook", "FB"]].forEach(function (c) {
      var x = ch[c[0]]; if (x) out.push('<span class="chx' + (x.status === "PUBLISHED" || x.status === "active" ? " on" : "") + '">' + c[1] + "</span>");
    });
    return out.join("");
  }
  function counts(items) {
    var n = { live: 0, ended: 0, sold: 0, draft: 0, all: items.length };
    items.forEach(function (i) { n[bucket(i)]++; });
    return n;
  }
  function paint() {
    var host = document.getElementById("chHub");
    var c = C();
    if (!host || !c) return;
    var items = c.state.items || [];
    var n = counts(items);
    var q = st.q.trim().toLowerCase();
    var list = items.filter(function (i) {
      if (st.f !== "all" && bucket(i) !== st.f) return false;
      return !q || [i.title, i.productName, i.sku].join(" ").toLowerCase().indexOf(q) >= 0;
    });
    var seg = [["live", "Live"], ["draft", "Not listed"], ["ended", "Ended"], ["sold", "Sold"], ["all", "All"]].map(function (s) {
      return '<button type="button" data-f="' + s[0] + '" class="' + (st.f === s[0] ? "on" : "") + '">' + s[1] + " <i>" + n[s[0]] + "</i></button>";
    }).join("");
    var rows = list.slice(0, st.shown).map(function (i) {
      var t = thumb(i);
      return '<button type="button" class="chr" data-id="' + esc(i.id) + '">' +
        '<span class="chr-img">' + (t ? '<img loading="lazy" alt="" src="' + esc(t) + '">' : "") + "</span>" +
        '<span class="chr-main"><b>' + esc(i.title || i.productName || i.sku || "Untitled") + "</b><span>" + chips(i) + "</span></span>" +
        '<span class="chr-p">' + money(i.price) + "</span></button>";
    }).join("");
    var more = list.length > st.shown ? '<button type="button" class="chr-more" id="chMore">Show ' + Math.min(40, list.length - st.shown) + " more · " + (list.length - st.shown) + " left</button>" : "";
    host.innerHTML =
      '<div class="ch-top"><button type="button" class="ch-sync" id="chSync"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12a8 8 0 10-2.3 5.6M20 5v5h-5"/></svg>Sync inventory</button>' +
      '<div class="ch-sub">eBay + Misprint · ' + n.live + " live · " + n.sold + " sold</div></div>" +
      '<input class="ch-q" id="chQ" type="search" placeholder="Search your listings" value="' + esc(st.q) + '" autocomplete="off">' +
      '<div class="ax-seg ch-seg">' + seg + "</div>" +
      '<div class="chr-list">' + (rows || '<div class="chr-empty">Nothing here. Try another filter or tap Sync inventory.</div>') + more + "</div>";
    var q2 = host.querySelector("#chQ");
    q2.addEventListener("input", function () { st.q = q2.value; st.shown = 40; var p = q2.selectionStart; paint(); var z = document.getElementById("chQ"); if (z) { z.focus(); z.setSelectionRange(p, p); } });
    host.querySelector("#chSync").addEventListener("click", async function (e) {
      var b = e.currentTarget; b.disabled = true; b.classList.add("busy");
      try { await C().syncEbay(); } finally { b.disabled = false; b.classList.remove("busy"); sig = ""; paint(); }
    });
    host.querySelectorAll(".ch-seg button").forEach(function (b) { b.addEventListener("click", function () { st.f = b.dataset.f; st.shown = 40; paint(); }); });
    host.querySelectorAll(".chr").forEach(function (b) { b.addEventListener("click", function () { var x = C().openSheet; if (x) x(b.dataset.id); }); });
    var m = host.querySelector("#chMore"); if (m) m.addEventListener("click", function () { st.shown += 40; paint(); });
    sig = items.length + ":" + items.reduce(function (s, i) { return s + (i.phase || "") + (i.ended ? "e" : ""); }, "").length;
  }
  function wrapSetup(view) {
    if (document.getElementById("chSetup")) return;
    var d = document.createElement("details");
    d.id = "chSetup"; d.className = "ch-setup";
    d.innerHTML = "<summary>Setup, imports and tools</summary><div id=\"chSetupBody\"></div>";
    view.appendChild(d);
  }
  function tidy() {
    var view = document.getElementById("view-channels");
    if (!view) return;
    var hub = document.getElementById("chHub");
    if (!hub) { hub = document.createElement("div"); hub.id = "chHub"; view.insertBefore(hub, view.firstChild); }
    wrapSetup(view);
    var body = document.getElementById("chSetupBody");
    ["ebayCard", "filesHub", "mpKeyCard", "ebSetCard", "combineHint", "combinePool"].forEach(function (id) { var el = document.getElementById(id); if (el && el.parentNode !== body) body.appendChild(el); });
    view.querySelectorAll(":scope > .ff-stages, :scope > .channel-toolbar").forEach(function (el) { body.appendChild(el); });
    var c = C();
    if (c && c.state) {
      var items = c.state.items || [];
      var s2 = items.length + ":" + items.reduce(function (s, i) { return s + (i.phase || "") + (i.ended ? "e" : ""); }, "").length;
      if (!hub.firstChild || s2 !== sig) { if (document.activeElement && document.activeElement.id === "chQ") return; paint(); }
    }
  }
  setInterval(tidy, 1200);
  setTimeout(tidy, 400);
})();
