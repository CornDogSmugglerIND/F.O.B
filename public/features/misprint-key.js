/* Misprint key field (Channels tab). The key goes straight to the server's private store; it is never shown again. */
(function () {
  function say(m) { var c = window.HUDcore; if (c && c.toast) c.toast(m); }
  async function state() {
    try { var r = await fetch("/api/channels/misprint/key"); return await r.json(); } catch (e) { return { keySaved: false }; }
  }
  async function paint(card) {
    var st = await state();
    card.innerHTML =
      '<div class="mk-h">Misprint</div>' +
      '<div class="mk-s">' + (st.keySaved ? "Key saved" + (st.baseSet ? "" : " · needs API host") : "No key yet") + "</div>" +
      '<input type="password" id="mkKey" class="mk-in" autocomplete="off" placeholder="' + (st.keySaved ? "Paste new key to replace" : "Paste Misprint API key") + '">' +
      (st.baseSet ? "" : '<input type="url" id="mkBase" class="mk-in" autocomplete="off" placeholder="API host (https://…)">') +
      '<button type="button" class="fh-btn" id="mkSave">Save</button>';
    card.querySelector("#mkSave").addEventListener("click", async function () {
      var key = card.querySelector("#mkKey").value.trim();
      var baseEl = card.querySelector("#mkBase");
      var base = baseEl ? baseEl.value.trim() : "";
      if (!key && !base) { say("Paste the key first"); return; }
      var body = { apiKey: key, apiBase: base || undefined };
      try {
        var r = await fetch("/api/channels/misprint/key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        var j = await r.json().catch(function () { return {}; });
        if (!r.ok) throw new Error(j.error || "save failed");
        say("Misprint key saved");
        paint(card);
      } catch (e) { say("Couldn't save: " + e.message); }
    });
  }
  function mount() {
    var view = document.getElementById("view-channels");
    if (!view || document.getElementById("mpKeyCard")) return;
    var card = document.createElement("div");
    card.id = "mpKeyCard"; card.className = "files-hub mk";
    var hub = document.getElementById("filesHub");
    view.insertBefore(card, hub ? hub.nextSibling : view.firstChild);
    paint(card);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(mount, 120); });
  else setTimeout(mount, 120);
})();
