/* Coalition H.U.D. — Settings: Listing templates, Shipping presets, Storage bins.
 * Mirrors the Base44 Settings tab (ListingTemplate, ShippingPreset, StorageLocation).
 * Classic script. window.HUD_presets = { render(host) }.
 * Persistence: localStorage "coalition-presets-v1" (templates + shipping).
 * Storage bins are the Spaces list in the live app state (same store Spaces uses).
 */
(function () {
  "use strict";

  var LS = "coalition-presets-v1";
  var CARRIERS = ["USPS", "FedEx", "UPS", "Other"];
  var CONDITIONS = ["", "New", "Near mint", "Lightly played", "Moderately played", "Heavily played", "Graded"];

  var data = load();
  var editing = null; // { kind: "tpl" | "ship" | "bin", id }
  var armed = null;

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(LS) || "null");
      if (raw && Array.isArray(raw.templates) && Array.isArray(raw.shipping)) return raw;
    } catch (e) { /* fall through */ }
    return { templates: [], shipping: [] };
  }

  function save() {
    try {
      localStorage.setItem(LS, JSON.stringify(data));
      return true;
    } catch (e) {
      toast("Could not save — storage is full");
      return false;
    }
  }

  function core() { return window.HUDcore || null; }
  function toast(m) { var c = core(); if (c && c.toast) c.toast(m); }
  function money(n) { return "$" + (Number(n) || 0).toFixed(2); }
  function uid(p) { return p + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function spaces() { var c = core(); return (c && c.state && c.state.spaces) || []; }
  function items() { var c = core(); return (c && c.state && c.state.items) || []; }
  function binCount(id) { return items().filter(function (i) { return i.spaceId === id; }).length; }

  function options(list, cur) {
    return list.map(function (o) {
      return '<option value="' + esc(o) + '"' + (o === cur ? " selected" : "") + ">" + (o || "Not set") + "</option>";
    }).join("");
  }

  /* ---------- rows ---------- */
  function rowHtml(kind, id, title, sub, isDefault) {
    var armedNow = armed === kind + id;
    return (
      '<div class="pre-row">' +
      '<button type="button" class="pre-main" data-pre="edit" data-kind="' + kind + '" data-id="' + esc(id) + '">' +
      '<span class="pre-title">' + esc(title) + (isDefault ? '<span class="pre-badge">Default</span>' : "") + "</span>" +
      '<span class="pre-sub">' + esc(sub) + "</span></button>" +
      '<button type="button" class="pre-del' + (armedNow ? " armed" : "") + '" data-pre="del" data-kind="' + kind + '" data-id="' + esc(id) + '" aria-label="Remove ' + esc(title) + '">' +
      (armedNow ? "Tap to remove" : "Remove") + "</button>" +
      "</div>"
    );
  }

  function emptyHtml(msg) { return '<p class="pre-empty">' + msg + "</p>"; }

  /* ---------- editors ---------- */
  function tplForm(t) {
    t = t || { name: "", condition: "", markupPercent: 30, description: "", isDefault: false };
    return (
      '<div class="pre-form" data-form="tpl">' +
      '<label>Template name<input type="text" id="preName" value="' + esc(t.name) + '" placeholder="Sealed boxes" autocomplete="off" /></label>' +
      '<div class="pre-two">' +
      '<label>Default condition<select id="preCond">' + options(CONDITIONS, t.condition) + "</select></label>" +
      '<label>Markup %<input type="number" id="preMarkup" inputmode="decimal" min="0" step="1" value="' + esc(t.markupPercent) + '" /></label>' +
      "</div>" +
      '<label>Description text<textarea id="preDesc" rows="4" placeholder="Shipped in a top loader inside a bubble mailer.">' + esc(t.description) + "</textarea></label>" +
      '<label class="pre-check"><input type="checkbox" id="preDefault"' + (t.isDefault ? " checked" : "") + " /> Use as my default template</label>" +
      formButtons() + "</div>"
    );
  }

  function shipForm(s) {
    s = s || { name: "", carrier: "USPS", service: "", cost: 0, handlingDays: 1, isDefault: false };
    return (
      '<div class="pre-form" data-form="ship">' +
      '<label>Preset name<input type="text" id="preName" value="' + esc(s.name) + '" placeholder="Plain white envelope" autocomplete="off" /></label>' +
      '<div class="pre-two">' +
      '<label>Carrier<select id="preCarrier">' + options(CARRIERS, s.carrier) + "</select></label>" +
      '<label>Service<input type="text" id="preService" value="' + esc(s.service) + '" placeholder="Ground Advantage" autocomplete="off" /></label>' +
      "</div>" +
      '<div class="pre-two">' +
      '<label>Shipping cost<input type="number" id="preCost" inputmode="decimal" min="0" step="0.01" value="' + esc(s.cost) + '" /></label>' +
      '<label>Handling days<input type="number" id="preHandling" inputmode="numeric" min="0" step="1" value="' + esc(s.handlingDays) + '" /></label>' +
      "</div>" +
      '<label class="pre-check"><input type="checkbox" id="preDefault"' + (s.isDefault ? " checked" : "") + " /> Use as my default preset</label>" +
      formButtons() + "</div>"
    );
  }

  function binForm(b) {
    b = b || { name: "" };
    return (
      '<div class="pre-form" data-form="bin">' +
      '<label>Bin name<input type="text" id="preName" value="' + esc(b.name) + '" placeholder="Tote 3" autocomplete="off" /></label>' +
      formButtons() + "</div>"
    );
  }

  function formButtons() {
    return '<div class="pre-actions"><button type="button" class="btn btn-amber" data-pre="save">Save</button>' +
      '<button type="button" class="btn btn-ghost" data-pre="cancel">Cancel</button></div>';
  }

  /* ---------- sections ---------- */
  function section(title, hint, bodyHtml, addLabel, kind) {
    var isEditingNew = editing && editing.kind === kind && !editing.id;
    return (
      '<div class="panel settings-block pre-block">' +
      '<div class="pre-head"><div><div class="pre-h">' + title + '</div><div class="pre-hint">' + hint + "</div></div>" +
      '<button type="button" class="btn btn-sm" data-pre="add" data-kind="' + kind + '"' + (isEditingNew ? " hidden" : "") + ">" + addLabel + "</button></div>" +
      bodyHtml + "</div>"
    );
  }

  function tplSection() {
    var body = data.templates.map(function (t) {
      if (editing && editing.kind === "tpl" && editing.id === t.id) return tplForm(t);
      return rowHtml("tpl", t.id, t.name, (t.condition || "Any condition") + " · " + (t.markupPercent || 0) + "% markup", t.isDefault);
    }).join("");
    if (editing && editing.kind === "tpl" && !editing.id) body += tplForm();
    if (!data.templates.length && !(editing && editing.kind === "tpl")) body = emptyHtml("No templates yet. A template fills in condition, markup and description when you build a listing.");
    return section("Listing templates", "Reusable defaults for new listings", body, "+ Template", "tpl");
  }

  function shipSection() {
    var body = data.shipping.map(function (s) {
      if (editing && editing.kind === "ship" && editing.id === s.id) return shipForm(s);
      return rowHtml("ship", s.id, s.name, s.carrier + (s.service ? " " + s.service : "") + " · " + money(s.cost) + " · " + (s.handlingDays || 0) + "d handling", s.isDefault);
    }).join("");
    if (editing && editing.kind === "ship" && !editing.id) body += shipForm();
    if (!data.shipping.length && !(editing && editing.kind === "ship")) body = emptyHtml("No shipping presets yet. Add the envelopes and boxes you actually ship in.");
    return section("Shipping presets", "Carrier, cost and handling time", body, "+ Preset", "ship");
  }

  function binSection() {
    var body = spaces().map(function (b) {
      if (editing && editing.kind === "bin" && editing.id === b.id) return binForm(b);
      var n = binCount(b.id);
      return rowHtml("bin", b.id, b.name, n === 0 ? "Empty" : n + " item" + (n === 1 ? "" : "s"), false);
    }).join("");
    if (editing && editing.kind === "bin" && !editing.id) body += binForm();
    return section("Storage", "Bins your items live in. A bin must be empty to remove.", body, "+ Bin", "bin");
  }

  function render(host) {
    host = host || document.getElementById("stgPresetsHost");
    if (!host) return;
    host.innerHTML = tplSection() + shipSection() + binSection();
  }

  function rerender() { render(); var c = core(); if (c && c.render) c.render(); }

  /* ---------- actions ---------- */
  function clearDefaults(list, keepId) { list.forEach(function (x) { if (x.id !== keepId) x.isDefault = false; }); }

  function val(id) { var e = document.getElementById(id); return e ? e.value : ""; }

  function doSave() {
    var name = val("preName").trim();
    if (!name) { toast("Give it a name first"); return; }
    var c = core();
    if (editing.kind === "tpl") {
      var t = editing.id ? data.templates.filter(function (x) { return x.id === editing.id; })[0] : null;
      if (!t) { t = { id: uid("tpl") }; data.templates.push(t); }
      t.name = name; t.condition = val("preCond"); t.markupPercent = Number(val("preMarkup")) || 0;
      t.description = val("preDesc"); t.isDefault = !!document.getElementById("preDefault").checked;
      if (t.isDefault) clearDefaults(data.templates, t.id);
      if (!save()) return;
      toast(editing.id ? "Template updated" : "Template added");
    } else if (editing.kind === "ship") {
      var s = editing.id ? data.shipping.filter(function (x) { return x.id === editing.id; })[0] : null;
      if (!s) { s = { id: uid("ship") }; data.shipping.push(s); }
      s.name = name; s.carrier = val("preCarrier"); s.service = val("preService").trim();
      s.cost = Math.max(0, Number(val("preCost")) || 0); s.handlingDays = Math.max(0, parseInt(val("preHandling"), 10) || 0);
      s.isDefault = !!document.getElementById("preDefault").checked;
      if (s.isDefault) clearDefaults(data.shipping, s.id);
      if (!save()) return;
      toast(editing.id ? "Preset updated" : "Preset added");
    } else if (editing.kind === "bin") {
      if (!c || !c.state) return;
      if (editing.id) {
        var b = c.state.spaces.filter(function (x) { return x.id === editing.id; })[0];
        if (b) b.name = name;
      } else {
        c.state.spaces.push({ id: uid("bin"), name: name, kind: "ebay_listed", itemIds: [], cover: null });
      }
      if (!c.saveSpaces()) return;
      toast(editing.id ? "Bin renamed" : "Bin added");
    }
    editing = null;
    rerender();
  }

  function doDelete(kind, id) {
    var key = kind + id;
    if (armed !== key) {
      armed = key;
      render();
      setTimeout(function () { if (armed === key) { armed = null; render(); } }, 3000);
      return;
    }
    armed = null;
    var c = core();
    if (kind === "tpl") { data.templates = data.templates.filter(function (x) { return x.id !== id; }); save(); toast("Template removed"); }
    else if (kind === "ship") { data.shipping = data.shipping.filter(function (x) { return x.id !== id; }); save(); toast("Preset removed"); }
    else if (kind === "bin") {
      if (binCount(id) > 0) { toast("Move this bin's items out first"); render(); return; }
      c.state.spaces = c.state.spaces.filter(function (x) { return x.id !== id; });
      c.saveSpaces();
      toast("Bin removed");
    }
    rerender();
  }

  var bound = false;
  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-pre]") : null;
      var host = document.getElementById("stgPresetsHost");
      if (!t || !host || !host.contains(t)) return;
      var act = t.getAttribute("data-pre");
      var kind = t.getAttribute("data-kind");
      var id = t.getAttribute("data-id");
      if (act === "add") { editing = { kind: kind, id: null }; armed = null; render(); }
      else if (act === "edit") { editing = { kind: kind, id: id }; armed = null; render(); }
      else if (act === "cancel") { editing = null; render(); }
      else if (act === "save") doSave();
      else if (act === "del") doDelete(kind, id);
    });
  }

  bind();
  window.HUD_presets = { render: render, get: function () { return JSON.parse(JSON.stringify(data)); } };
})();
