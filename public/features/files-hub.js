/* Files hub: pick where the CSV comes from / goes to, then Import or Export.
 * Talks to Muse's endpoints: POST /api/csv/import {source, csv} and GET /api/csv/export?source= */
(function () {
  var SOURCES = [["ebay", "eBay"], ["double_holo", "Double Holo"], ["misprint", "Misprint"], ["seller_fb", "Facebook"]];
  var pick = "ebay";
  try { pick = localStorage.getItem("fob-file-source") || "ebay"; } catch (e) {}
  function core() { return window.HUDcore || null; }
  function say(m) { var c = core(); if (c && c.toast) c.toast(m); }

  function html() {
    return '<div class="fh-chips" role="radiogroup" aria-label="Source">' +
      SOURCES.map(function (s) { return '<button type="button" role="radio" class="fh-chip' + (s[0] === pick ? " on" : "") + '" data-src="' + s[0] + '" aria-checked="' + (s[0] === pick) + '">' + s[1] + "</button>"; }).join("") +
      '</div><div class="fh-acts"><button type="button" class="fh-btn" id="fhImport"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 15v4h14v-4"/></svg>Import</button>' +
      '<button type="button" class="fh-btn" id="fhExport"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 15v4h14v-4"/></svg>Export</button></div>' +
      '<input type="file" id="fhFile" accept=".csv,text/csv" hidden>';
  }

  async function doImport(file) {
    var text = await file.text();
    say("Reading file…");
    try {
      var res = await fetch("/api/csv/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: pick, csv: text }) });
      var body = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(body.error || "import failed");
      var c = core(); if (!c) return;
      var have = new Set(c.state.items.map(function (i) { return i.id; }));
      var add = (body.items || []).filter(function (i) { return !have.has(i.id); }).map(function (i) { return c.normalizeItem(Object.assign({ photos: [], phase: "intake" }, i)); });
      c.state.items = c.state.items.concat(add);
      c.saveItems(); c.render();
      say(add.length + " items in" + (body.errors && body.errors.length ? " · " + body.errors.length + " skipped" : ""));
    } catch (e) {
      say("Couldn't import: " + (e && e.message ? e.message : "try again"));
    }
  }

  async function doExport() {
    try {
      var res = await fetch("/api/csv/export?source=" + encodeURIComponent(pick));
      if (!res.ok) throw new Error("export failed");
      var blob = await res.blob();
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "coalition-" + pick + ".csv";
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
      say("Exported for " + (SOURCES.filter(function (s) { return s[0] === pick; })[0] || [0, pick])[1]);
    } catch (e) {
      say("Couldn't export: " + (e && e.message ? e.message : "try again"));
    }
  }

  function mount() {
    var view = document.getElementById("view-channels");
    if (!view || document.getElementById("filesHub")) return;
    var card = document.createElement("div");
    card.id = "filesHub"; card.className = "files-hub";
    card.innerHTML = html();
    var after = document.getElementById("ebayCard");
    view.insertBefore(card, after ? after.nextSibling : view.firstChild);
    card.addEventListener("click", function (e) {
      var chip = e.target.closest(".fh-chip");
      if (chip) {
        pick = chip.dataset.src; try { localStorage.setItem("fob-file-source", pick); } catch (x) {}
        card.querySelectorAll(".fh-chip").forEach(function (c) { var on = c === chip; c.classList.toggle("on", on); c.setAttribute("aria-checked", on); });
      }
    });
    document.getElementById("fhImport").addEventListener("click", function () { document.getElementById("fhFile").click(); });
    document.getElementById("fhFile").addEventListener("change", function (e) { var f = e.target.files[0]; e.target.value = ""; if (f) doImport(f); });
    document.getElementById("fhExport").addEventListener("click", doExport);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(mount, 50); });
  else setTimeout(mount, 50);
})();
