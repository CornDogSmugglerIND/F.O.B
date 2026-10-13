/* eBay policy pickers (Channels tab). Saved server-side; publish reads them. */
(function () {
  function say(m) { var c = window.HUDcore; if (c && c.toast) c.toast(m); }
  function opts(list, cur) {
    var h = '<option value="">Not set</option>';
    (list || []).forEach(function (p) { h += '<option value="' + p.id + '"' + (String(p.id) === String(cur) ? " selected" : "") + ">" + String(p.name).replace(/</g, "&lt;") + "</option>"; });
    if (cur && !(list || []).some(function (p) { return String(p.id) === String(cur); })) h += '<option value="' + cur + '" selected>' + cur + " (current)</option>";
    return h;
  }
  async function paint(card) {
    var d = { settings: {}, policies: {} };
    try { d = await (await fetch("/api/channels/ebay/settings")).json(); } catch (e) {}
    var s = d.settings || {}, p = d.policies || {};
    function row(label, id, list, cur) { return '<label class="mk-s">' + label + '</label><select class="mk-in" id="' + id + '">' + opts(list, cur) + "</select>"; }
    card.innerHTML = '<div class="mk-h">eBay shipping + policies</div>' +
      row("Shipping: general", "esFul", p.fulfillment, s.fulfillmentPolicyId) +
      row("Shipping: envelope (cards)", "esEnv", p.fulfillment, s.envelopePolicyId) +
      '<label class="mk-s">Envelope up to ($)</label><input class="mk-in" id="esThr" inputmode="decimal" value="' + (s.cardThresholdUsd || "20") + '">' +
      row("Payment", "esPay", p.payment, s.paymentPolicyId) +
      row("Returns", "esRet", p.returns, s.returnPolicyId) +
      '<button type="button" class="fh-btn" id="esSave">Save</button>';
    card.querySelector("#esSave").addEventListener("click", async function () {
      var g = function (i) { return card.querySelector(i).value; };
      var body = { fulfillmentPolicyId: g("#esFul"), envelopePolicyId: g("#esEnv"), cardThresholdUsd: g("#esThr"), paymentPolicyId: g("#esPay"), returnPolicyId: g("#esRet") };
      try {
        var r = await fetch("/api/channels/ebay/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        var j = await r.json().catch(function () { return {}; });
        if (!r.ok) throw new Error(j.error || "save failed");
        say("eBay settings saved");
      } catch (e) { say("Couldn't save: " + e.message); }
    });
  }
  function mount() {
    var view = document.getElementById("view-channels");
    if (!view || document.getElementById("ebSetCard")) return;
    var card = document.createElement("div");
    card.id = "ebSetCard"; card.className = "files-hub mk";
    var after = document.getElementById("mpKeyCard") || document.getElementById("filesHub");
    view.insertBefore(card, after ? after.nextSibling : view.firstChild);
    paint(card);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(mount, 220); });
  else setTimeout(mount, 220);
})();
