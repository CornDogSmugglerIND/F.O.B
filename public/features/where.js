/* Where is it listed? One source of truth for per-channel state.
 * Used by Collection rows, the projection panel and the item sheet. */
(function () {
  var CH = [
    { id: "ebay", short: "eBay", full: "eBay", keys: ["ebay"] },
    { id: "double_holo", short: "DH", full: "Double Holo", keys: ["double_holo", "doubleHolo", "double-holo"] },
    { id: "misprint", short: "MP", full: "Misprint", keys: ["misprint"] },
    { id: "facebook", short: "FB", full: "Facebook", keys: ["facebook", "fb", "facebook_marketplace", "seller_fb"] }
  ];
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function entry(item, ch) {
    var m = (item && item.channels) || {};
    for (var i = 0; i < ch.keys.length; i++) if (m[ch.keys[i]]) return m[ch.keys[i]];
    return null;
  }
  // live | queued | ended | none
  function stateOf(item, ch) {
    var e = entry(item, ch);
    if (!e) return "none";
    var s = String(e.status || "").toLowerCase();
    if (s === "ended" || s === "sold" || s === "removed") return "ended";
    if (s === "variation_parent") return "none";
    if (s === "active" || s === "listed" || s === "live") return "live";
    if (e.listingId) return "live";
    if (s) return "queued";
    return "none";
  }
  function all(item) { return CH.map(function (ch) { return { ch: ch, st: stateOf(item, ch), e: entry(item, ch) }; }); }
  function rowChips(item) {
    var on = all(item).filter(function (x) { return x.st === "live" || x.st === "queued"; });
    if (!on.length) return '<span class="wh wh-none">Not listed</span>';
    return on.map(function (x) {
      return '<span class="wh wh-' + x.st + '" title="' + esc(x.ch.full + (x.st === "queued" ? " (queued)" : " (live)")) + '">' + esc(x.ch.short) + "</span>";
    }).join("");
  }
  function panel(item) {
    return '<div class="wh-panel"><span class="wh-h">Listed on</span>' + all(item).map(function (x) {
      var label = x.st === "live" ? "Live" : x.st === "queued" ? "Queued" : x.st === "ended" ? "Ended" : "Not listed";
      var price = x.e && x.e.price ? " \u00b7 $" + Number(x.e.price).toFixed(2) : "";
      return '<span class="wh-c wh-' + x.st + '"><b>' + esc(x.ch.full) + "</b><i>" + label + price + "</i></span>";
    }).join("") + "</div>";
  }
  function paintSheet(item) {
    var t = document.getElementById("sheetTitle");
    if (!t || !item) return;
    var host = document.getElementById("whSheet");
    if (!host) {
      host = document.createElement("div");
      host.id = "whSheet";
      t.insertAdjacentElement("afterend", host);
    }
    host.innerHTML = panel(item);
  }
  window.HUD_where = { rowChips: rowChips, panel: panel, paintSheet: paintSheet, all: all };
})();
