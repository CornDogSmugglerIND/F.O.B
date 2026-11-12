/* Coalition H.U.D. — CSV import / export
 * Plain classic script, no dependencies. Safe to load before or after
 * coalition.js: app helpers (toast, escapeHtml, uid, saveItems, state)
 * are looked up lazily on globalThis with local fallbacks.
 */
(function () {
  "use strict";

  var LS_ITEMS = "coalition-items-v4";

  var EXPORT_HEADERS = ["Title", "Product Name", "Set", "Quantity", "Price", "Phase", "Bin", "Barcode", "SKU", "Notes"];

  /* field -> recognized header spellings (normalized lowercase, trimmed) */
  var FIELD_MAP = [
    ["title", ["title", "name", "item title", "item name", "product title", "card title", "card"]],
    ["productName", ["product name", "productname", "product"]],
    ["set", ["set", "set name", "setname", "edition", "series"]],
    ["quantity", ["quantity", "qty", "stock", "count"]],
    ["price", ["price", "cost", "amount", "retail", "market", "value"]],
    ["barcode", ["barcode", "upc", "ean", "gtin", "barcode number"]],
    ["sku", ["sku", "item number", "item #", "style"]],
    ["notes", ["notes", "note", "description", "comments", "memo", "details"]]
  ];

  var PRETTY = {
    title: "Title",
    productName: "Product Name",
    set: "Set",
    quantity: "Qty",
    price: "Price",
    barcode: "Barcode",
    sku: "SKU",
    notes: "Notes"
  };

  var FIELD_ORDER = ["title", "productName", "set", "quantity", "price", "barcode", "sku", "notes"];

  /* ---------- lazy app-helper access (load-order safe) ---------- */

  function G(name) {
    return (typeof globalThis !== "undefined") ? globalThis[name] : undefined;
  }

  function appFn(name) {
    var f = G(name);
    return (typeof f === "function") ? f : null;
  }

  function toast(msg) {
    var f = appFn("toast");
    if (f) f(msg);
  }

  function esc(s) {
    var f = appFn("escapeHtml");
    if (f) return f(s);
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function makeId() {
    var f = appFn("uid");
    if (f) return f();
    return "csv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }

  function getItems() {
    var st = G("state");
    if (st && Array.isArray(st.items)) return st.items;
    try {
      var raw = JSON.parse(localStorage.getItem(LS_ITEMS) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function commitItems(items) {
    var st = G("state");
    if (st) st.items = items;
    var f = appFn("saveItems");
    if (f) {
      f();
    } else {
      try { localStorage.setItem(LS_ITEMS, JSON.stringify(items)); } catch (e) { /* ignore */ }
    }
  }

  /* ---------- robust CSV parse ---------- */

  function parseCSV(text, delim) {
    delim = delim || ",";
    if (text && text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM
    var rows = [], row = [], field = "", inQuotes = false, i = 0;
    while (i < text.length) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; }
          else { inQuotes = false; i++; }
        } else { field += c; i++; }
      } else {
        if (c === '"') { inQuotes = true; i++; }
        else if (c === delim) { row.push(field); field = ""; i++; }
        else if (c === "\r") { i++; }
        else if (c === "\n") { row.push(field); field = ""; rows.push(row); row = []; i++; }
        else { field += c; i++; }
      }
    }
    row.push(field);
    rows.push(row);
    // Drop fully-blank rows (blank lines, or lines of bare commas) so they
    // never reach the preview count or the import.
    return rows.filter(function (r) {
      return r.some(function (c) { return String(c).trim() !== ""; });
    });
  }

  /* Try comma first; fall back to ; or tab when the header is a single cell. */
  function detectAndParse(text) {
    var rows = parseCSV(text, ",");
    if (rows.length && rows[0].length === 1) {
      var head = String(rows[0][0]);
      if (head.indexOf(";") >= 0) return parseCSV(text, ";");
      if (head.indexOf("\t") >= 0) return parseCSV(text, "\t");
    }
    return rows;
  }

  function mapColumns(headers) {
    var used = {};
    var map = {};
    FIELD_MAP.forEach(function (entry) {
      var field = entry[0], spellings = entry[1];
      for (var i = 0; i < headers.length; i++) {
        if (used[i]) continue;
        var h = String(headers[i] || "").trim().toLowerCase();
        if (spellings.indexOf(h) >= 0) { map[field] = i; used[i] = true; break; }
      }
    });
    return map;
  }

  /* ---------- CSV stringify ---------- */

  function csvEscape(v) {
    var s = String(v == null ? "" : v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function stringifyCSV(headers, rows) {
    var lines = [headers.map(csvEscape).join(",")];
    rows.forEach(function (r) { lines.push(r.map(csvEscape).join(",")); });
    return lines.join("\r\n") + "\r\n";
  }

  /* ---------- download ---------- */

  function downloadFile(filename, text, mime) {
    var blob = new Blob([text], { type: mime || "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
  }

  function yyyymmdd(d) {
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }

  /* ---------- EXPORT ---------- */

  function exportInventory() {
    var items = getItems();
    var rows = items.map(function (it) {
      return [
        it.title || "",
        it.productName || "",
        it.setName || "",
        (it.quantity == null ? "" : it.quantity),
        (it.price == null ? "" : it.price),
        it.phase || "intake",
        it.spaceId || "",
        it.barcode || "",
        it.sku || "",
        it.notes || ""
      ];
    });
    var csv = "\ufeff" + stringifyCSV(EXPORT_HEADERS, rows);
    downloadFile("coalition-inventory-" + yyyymmdd(new Date()) + ".csv", csv, "text/csv;charset=utf-8");
    toast("Exported " + items.length + " item" + (items.length === 1 ? "" : "s"));
  }

  /* ---------- IMPORT overlay ---------- */

  var OVERLAY_ID = "csvImportOverlay";

  function closeOverlay() {
    var el = document.getElementById(OVERLAY_ID);
    if (el) el.remove();
  }

  function openImport() {
    closeOverlay();

    var ov = document.createElement("div");
    ov.className = "csv-overlay";
    ov.id = OVERLAY_ID;
    ov.innerHTML =
      '<div class="csv-backdrop" data-csv="backdrop"></div>' +
      '<div class="csv-sheet" role="dialog" aria-modal="true" aria-label="Import CSV">' +
        '<button class="csv-back" data-csv="back" type="button">&lsaquo; Back</button>' +
        '<h2 class="csv-title">Import CSV</h2>' +
        '<div class="csv-step" data-step="choose">' +
          '<div class="csv-drop" data-csv="drop" role="button" tabindex="0" aria-label="Choose a CSV file">' +
            '<input type="file" data-csv="file" class="csv-file-input" accept=".csv,text/csv" />' +
            '<span class="csv-drop-text">Drop a CSV here<br/>or tap to choose</span>' +
            '<span class="csv-drop-sub">.csv files only</span>' +
          '</div>' +
          '<p class="csv-hint">Headers auto-detected: title, product name, set, qty, price, barcode, sku, notes.</p>' +
          '<p class="csv-error" data-csv="error" hidden></p>' +
          '<button class="btn btn-ghost csv-wide" data-csv="cancel" type="button">Cancel</button>' +
        '</div>' +
        '<div class="csv-step" data-step="preview" hidden>' +
          '<p class="csv-mapline" data-csv="mapline"></p>' +
          '<div class="csv-preview-wrap"><table class="csv-preview" data-csv="table"></table></div>' +
          '<p class="csv-count" data-csv="countline"></p>' +
          '<div class="csv-actions">' +
            '<button class="btn btn-ghost" data-csv="back2" type="button">&lsaquo; Back</button>' +
            '<button class="btn btn-amber" data-csv="import" type="button"></button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(ov);

    var parsed = null; // { headers, dataRows, colMap }
    var q = function (sel) { return ov.querySelector('[data-csv="' + sel + '"]'); };

    function showStep(name) {
      ov.querySelectorAll(".csv-step").forEach(function (s) {
        s.hidden = s.getAttribute("data-step") !== name;
      });
    }

    function showError(msg) {
      var e = q("error");
      e.textContent = msg;
      e.hidden = false;
    }

    function cellVal(row, idx) {
      return idx == null ? "" : (row[idx] == null ? "" : row[idx]);
    }

    function prettyLine(colMap) {
      var parts = FIELD_ORDER.filter(function (f) { return colMap[f] != null; })
        .map(function (f) { return PRETTY[f]; });
      return parts.length ? "Mapped: " + parts.join(" · ") : "No columns recognized.";
    }

    function renderPreview() {
      var headers = parsed.headers, dataRows = parsed.dataRows, colMap = parsed.colMap;
      var fields = FIELD_ORDER.filter(function (f) { return colMap[f] != null; });
      var headCells = fields.map(function (f) {
        var orig = String(headers[colMap[f]] || "").trim();
        return "<th>" + esc(PRETTY[f]) + '<span class="csv-src">' + esc(orig) + "</span></th>";
      }).join("");
      var bodyRows = dataRows.slice(0, 8).map(function (row) {
        return "<tr>" + fields.map(function (f) {
          return "<td>" + esc(cellVal(row, colMap[f])) + "</td>";
        }).join("") + "</tr>";
      }).join("");
      q("table").innerHTML = "<thead><tr>" + headCells + "</tr></thead><tbody>" + bodyRows + "</tbody>";
      q("mapline").textContent = prettyLine(colMap);
      q("countline").textContent = dataRows.length + " row" + (dataRows.length === 1 ? "" : "s") + " found. Previewing first " + Math.min(8, dataRows.length) + ".";
      var btn = q("import");
      btn.textContent = "Import " + dataRows.length + " item" + (dataRows.length === 1 ? "" : "s");
    }

    function numOr(v, fallback) {
      var n = parseFloat(String(v == null ? "" : v).replace(/[$,\s]/g, ""));
      return isNaN(n) ? fallback : n;
    }

    function intOr(v, fallback) {
      var n = parseInt(String(v == null ? "" : v).replace(/[,\s]/g, ""), 10);
      return isNaN(n) ? fallback : n;
    }

    function commitImport() {
      var colMap = parsed.colMap;
      var items = getItems();
      var added = 0;
      parsed.dataRows.forEach(function (row) {
        var title = String(cellVal(row, colMap.title)).trim();
        var productName = String(cellVal(row, colMap.productName)).trim();
        var sku = String(cellVal(row, colMap.sku)).trim();
        if (!title && !productName && !sku) return; // blank row
        items.push({
          id: makeId(),
          title: title || productName || sku || "Untitled import",
          productName: productName,
          setName: String(cellVal(row, colMap.set)).trim(),
          quantity: intOr(cellVal(row, colMap.quantity), 1),
          price: numOr(cellVal(row, colMap.price), 0),
          phase: "intake",
          staged: false,
          spaceId: null,
          channels: {},
          photos: [],
          barcode: String(cellVal(row, colMap.barcode)).trim(),
          sku: sku,
          notes: String(cellVal(row, colMap.notes)).trim()
        });
        added++;
      });
      commitItems(items);
      closeOverlay();
      toast("Imported " + added + " item" + (added === 1 ? "" : "s"));
      try {
        var core = G("HUDcore");
        if (core && typeof core.render === "function") core.render();
      } catch (e) { /* render is best-effort */ }
    }

    function handleText(text, fileName) {
      var rows = detectAndParse(text);
      if (!rows.length) { showError("That file is empty. Pick a CSV with a header row."); return; }
      var headers = rows[0];
      var dataRows = rows.slice(1);
      if (!dataRows.length) { showError("No data rows found under the header row."); return; }
      var colMap = mapColumns(headers);
      if (!Object.keys(colMap).length) {
        showError("Could not recognize any columns in " + (fileName || "that file") + ". Headers seen: " + headers.slice(0, 6).join(", ") + (headers.length > 6 ? "…" : ""));
        return;
      }
      // Refuse identity-less imports: without a title/product/sku every row
      // would land as "Untitled import".
      if (colMap.title == null && colMap.productName == null && colMap.sku == null) {
        showError("No usable columns found — need at least a title, product name, or SKU. Headers seen: " + headers.slice(0, 6).join(", ") + (headers.length > 6 ? "…" : ""));
        return;
      }
      parsed = { headers: headers, dataRows: dataRows, colMap: colMap };
      q("error").hidden = true;
      renderPreview();
      showStep("preview");
    }

    function handleFile(file) {
      if (!file) return;
      var name = String(file.name || "");
      if (!/\.csv$/i.test(name)) { showError("That is not a .csv file (" + name + ")."); return; }
      var reader = new FileReader();
      reader.onerror = function () { showError("Could not read that file."); };
      reader.onload = function () { handleText(String(reader.result || ""), name); };
      reader.readAsText(file);
    }

    var drop = q("drop"), fileInput = q("file");
    drop.addEventListener("click", function () { fileInput.click(); });
    drop.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
    });
    fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
      fileInput.value = "";
    });
    ["dragenter", "dragover"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("csv-drop-hot"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("csv-drop-hot"); });
    });
    drop.addEventListener("drop", function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });

    q("backdrop").addEventListener("click", closeOverlay);
    q("back").addEventListener("click", closeOverlay);
    q("cancel").addEventListener("click", closeOverlay);
    q("back2").addEventListener("click", function () { parsed = null; showStep("choose"); });
    q("import").addEventListener("click", commitImport);
    wireEscOnce();
  }

  /* One global Escape listener (not one per open) so it can't accumulate. */
  var escWired = false;
  function wireEscOnce() {
    if (escWired) return;
    escWired = true;
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeOverlay();
    });
  }

  /* ---------- toolbar wiring ---------- */

  function init() {
    function wire() {
      if (document.getElementById("btnCsvImport") || document.getElementById("btnCsvExport")) return; // already wired
      var bar = document.querySelector(".channel-toolbar");
      if (!bar) return;
      var imp = document.createElement("button");
      imp.type = "button";
      imp.className = "btn btn-ghost";
      imp.id = "btnCsvImport";
      imp.textContent = "Import CSV";
      imp.addEventListener("click", openImport);
      var exp = document.createElement("button");
      exp.type = "button";
      exp.className = "btn btn-ghost";
      exp.id = "btnCsvExport";
      exp.textContent = "Export CSV";
      exp.addEventListener("click", exportInventory);
      bar.appendChild(imp);
      bar.appendChild(exp);
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", wire);
    } else {
      wire();
    }
  }

  window.HUD_csv = {
    init: init,
    exportInventory: exportInventory,
    openImport: openImport,
    _parse: parseCSV,        // exposed for testing / debugging
    _parseAuto: detectAndParse,
    _stringify: stringifyCSV,
    _mapColumns: mapColumns,
    _escape: csvEscape
  };

})();
