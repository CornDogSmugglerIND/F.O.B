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
    <section class="card-panel set"><h3>Space on this device</h3><div class="meter"><i style="width:${pct}%"></i></div><p class="sub" id="spMsg">${mb} MB of about 5 MB used. Photos you scout are shrunk to save room. eBay photos are links and take none.</p><button class="btn" id="spFree" type="button">Free up space</button></section>
    <section class="card-panel set"><h3>eBay</h3><p class="sub">App build ${(/next\.js\?v=(\d+)/.exec(document.documentElement.innerHTML) || [])[1] || "?"}</p><p class="sub">Pull your live listings, sold orders and photos from eBay.</p><button class="btn go" id="spSync" type="button">Sync with eBay now</button></section>
</div>`;
  host.querySelector("#spSync").addEventListener("click", () => document.querySelector("#syncBtn")?.click());
  host.querySelector("#spFree").addEventListener("click", async (e) => {
    const btn = e.currentTarget, msg = host.querySelector("#spMsg"); btn.disabled = true; btn.textContent = "Working…";
    const shrink = (u) => new Promise((res) => { const im = new Image(); im.onload = () => { const k = Math.min(1, 480 / Math.max(im.naturalWidth, im.naturalHeight)); const c = document.createElement("canvas"); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", 0.6)); }; im.onerror = () => res(u); im.src = u; });
    try {
      const raw = localStorage.getItem("coalition-items-v4") || "[]", list = JSON.parse(raw); let n = 0;
      for (const it of list) { if (!it.channels?.ebay?.listingId || it.ended) continue; for (const p of it.photos || []) { const u = p.dataUrl || ""; if (u.startsWith("data:") && u.length > 40000) { p.dataUrl = await shrink(u); n++; } } }
      const out = JSON.stringify(list); localStorage.setItem("coalition-items-v4", out);
      const freed = Math.max(0, (raw.length - out.length) * 2 / 1048576).toFixed(1);
      msg.textContent = n ? `Shrunk ${n} photos on items that are already live. Freed about ${freed} MB.` : "Nothing to shrink. Only photos of items already live on eBay get shrunk.";
    } catch { msg.textContent = "Couldn't free space right now."; }
    btn.disabled = false; btn.textContent = "Free up space";
  });
  host.querySelector("#chg").addEventListener("click", () => document.querySelector("#avatarBtn")?.click());
  const names = { ebay: "eBay", misprint: "Misprint", double_holo: "Double Holo" };
  fetch("/api/channels/status").then((r) => r.json()).then((d) => {
    const el = host.querySelector("#conn"); if (!el) return;
    el.innerHTML = (d.channels || []).map((c) => `<div class="row"><span>${esc(names[c.id] || c.id)}</span><span class="${c.configured ? "okk" : "bad"}">${c.configured ? "Connected" : "Not connected"}</span></div>`).join("") || `<span class="sub">No channels reported.</span>`;
  }).catch(() => { const el = host.querySelector("#conn"); if (el) el.innerHTML = `<span class="sub">Couldn't check right now.</span>`; });
}
