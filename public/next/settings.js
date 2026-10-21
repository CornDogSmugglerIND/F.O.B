/* Settings — moved out of next.js (bridge [32] file split). Same content Sawyer
   verified in P1+2: profile picture, live connections, install steps, storage
   meter, brand plates. Polish lives in settings.css. */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function renderSettings(host) {
  host.style.overflowY = "auto";
  let used = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); used += (k.length + (localStorage.getItem(k) || "").length) * 2; } } catch { /* ignore */ }
  const mb = (used / 1048576).toFixed(1), pct = Math.min(100, Math.round(used / 5242880 * 100));
  const standalone = navigator.standalone === true || matchMedia("(display-mode:standalone)").matches;
  const build = (/next\.js\?v=(\d+)/.exec(document.documentElement.innerHTML) || [])[1] || "?";
  const av = document.querySelector("#avatarImg")?.src || "img/husky.jpg";
  host.innerHTML = `<div class="set-wrap st">
    <section class="st-me"><button id="chg" type="button" class="st-av" aria-label="Change profile picture"><img src="${esc(av)}" alt=""><i>Edit</i></button><div><b>CornDogSmuggler</b><span>Coalition · Top Rated on eBay</span></div></section>
    <h3 class="st-h">Channels</h3><section class="st-grp"><div id="conn" class="conn"><div class="st-row"><span>Checking…</span></div></div></section>
    <h3 class="st-h">eBay</h3><section class="st-grp">
      <button class="st-row st-btn" id="spSync" type="button"><span>Sync with eBay now</span><u>›</u></button>
      <div class="st-row"><span>Pulls live listings, sold orders and photos</span></div></section>
    <h3 class="st-h">Storage</h3><section class="st-grp"><div class="st-row st-col"><div class="meter"><i style="width:${pct}%"></i></div><p class="sub" id="spMsg">${mb} MB of about 5 MB used. eBay photos are links and take none.</p></div>
      <button class="st-row st-btn" id="spFree" type="button"><span>Free up space</span><u>›</u></button></section>
    ${standalone || !matchMedia("(max-width:820px)").matches ? "" : `<h3 class="st-h">Install</h3><section class="st-grp"><div class="st-row st-col"><span>Safari, Share, Add to Home Screen. Then open it from the new icon.</span></div></section>`}
    <div class="badges"><img src="img/veteran.jpg" alt="Veteran-Owned Coalition"><img src="img/pristine.jpg" alt="Pristine 10"></div>
    <p class="st-ver">App build ${esc(build)}</p>
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
    el.innerHTML = (d.channels || []).map((c) => `<div class="st-row"><span>${esc(names[c.id] || c.id)}</span><b class="${c.configured ? "okk" : "bad"}">${c.configured ? "Connected" : "Not connected"}</b></div>`).join("") || `<div class="st-row"><span class="sub">No channels reported.</span></div>`;
  }).catch(() => { const el = host.querySelector("#conn"); if (el) el.innerHTML = `<div class="st-row"><span class="sub">Couldn't check right now. Tap Sync to retry.</span></div>`; });
}
