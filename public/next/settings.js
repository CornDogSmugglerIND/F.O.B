/* Settings — moved out of next.js (bridge [32] file split). Same content Sawyer
   verified in P1+2: profile picture, live connections, install steps, storage
   meter, brand plates. Polish lives in settings.css. */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function renderSettings(host) {
  host.style.overflowY = "auto";
  let used = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); used += (k.length + (localStorage.getItem(k) || "").length) * 2; } } catch { /* ignore */ }
  const mb = (used / 1048576).toFixed(1), pct = Math.min(100, Math.round(used / 5242880 * 100));
  host.innerHTML = `<div class="set-wrap">
    <section class="card-panel set"><h2>Settings</h2><p>Your profile picture is the round picture at the top right. Tap it any time to change it.</p>
      <button class="btn" id="chg" type="button">Change profile picture</button>
      <div class="badges"><img class="k-tilt" src="img/veteran.jpg" alt="Veteran-Owned Coalition"><img class="k-tilt" src="img/pristine.jpg" alt="Pristine 10"><img class="k-tilt" src="img/husky.jpg" alt="The Coalition team"></div></section>
    <section class="card-panel set"><h3>Connections</h3><div id="conn" class="conn"><span class="sub">Checking…</span></div></section>
    <section class="card-panel set"><h3>Put it on your phone</h3>
      <ol class="how"><li>Open this page in <b>Safari</b> (iPhone) or <b>Chrome</b> (Android).</li><li>iPhone: tap Share, then <b>Add to Home Screen</b>. Android: tap the menu, then <b>Install app</b>.</li><li>Open it from the new icon. It fills the whole screen.</li></ol></section>
    <section class="card-panel set"><h3>Space on this device</h3><div class="meter"><i style="width:${pct}%"></i></div><p class="sub">${mb} MB of about 5 MB used. Photos you scout are shrunk to save room. eBay photos are links and take none.</p></section>
    <section class="card-panel set"><img class="k-tilt set-plate" src="img/plate.jpg" alt=""><img class="k-tilt set-word" src="img/wordmark.jpg" alt="CornDogSmuggler Coalition"></section></div>`;
  host.querySelector("#chg").addEventListener("click", () => document.querySelector("#avatarBtn")?.click());
  const names = { ebay: "eBay", misprint: "Misprint", double_holo: "Double Holo" };
  fetch("/api/channels/status").then((r) => r.json()).then((d) => {
    const el = host.querySelector("#conn"); if (!el) return;
    el.innerHTML = (d.channels || []).map((c) => `<div class="row"><span>${esc(names[c.id] || c.id)}</span><span class="${c.configured ? "okk" : "bad"}">${c.configured ? "Connected" : "Not connected"}</span></div>`).join("") || `<span class="sub">No channels reported.</span>`;
  }).catch(() => { const el = host.querySelector("#conn"); if (el) el.innerHTML = `<span class="sub">Couldn't check right now.</span>`; });
}
