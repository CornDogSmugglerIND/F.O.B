import { archMap, unarchive, esc as escA } from "./shared.js?v=6";
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
    <h3 class="st-h">Archive</h3><section class="st-grp"><button class="st-row st-btn" id="spArch" type="button"><span>Archived items and orders</span><b class="okk" id="spArchN">${Object.keys(archMap()).length}</b><u>›</u></button></section>
    <h3 class="st-h">Storage</h3><section class="st-grp"><div class="st-row st-col"><div class="meter"><i style="width:${pct}%"></i></div><p class="sub" id="spMsg">${mb} MB of about 5 MB used. eBay photos are links and take none.</p></div>
      <button class="st-row st-btn" id="spFree" type="button"><span>Free up space</span><u>›</u></button></section>
    ${standalone || !matchMedia("(max-width:820px)").matches ? "" : `<h3 class="st-h">Install</h3><section class="st-grp"><div class="st-row st-col"><span>Safari, Share, Add to Home Screen. Then open it from the new icon.</span></div></section>`}
    <div class="badges"><img src="img/veteran.jpg" alt="Veteran-Owned Coalition"><img src="img/pristine.jpg" alt="Pristine 10"></div>
    <p class="st-ver">App build ${esc(build)}</p>
</div>`;
  const openArch = () => {
    const f = window.__fob; if (!f) return; const m = archMap(), ids = Object.keys(m).sort((a, b) => String(m[b].at).localeCompare(String(m[a].at)));
    const items = (() => { try { return JSON.parse(localStorage.getItem("coalition-items-v4") || "[]"); } catch { return []; } })(), byId = new Map(items.map((i) => [String(i.id), i]));
    const pic = (id) => { const it = byId.get(id); const p = (it && it.photos && it.photos[0] && (it.photos[0].dataUrl || it.photos[0].url)) || m[id].photo; return p ? `<img src="${escA(p)}" alt="" loading="lazy">` : `<i>${escA((m[id].title || "?").charAt(0))}</i>`; };
    const s = f.openSheet(`<div class="iv-bar"><button type="button" class="iv-back" data-close>‹ Back to Settings</button></div><h2>Archive</h2><div class="sub">${ids.length ? `${ids.length} archived. They're hidden from every tab. Restore puts one back.` : "Nothing archived yet. Use Archive on any item or order, or Archive all on Sold, Shipped and Delivered."}</div>
      ${ids.length ? `<button class="btn" id="arAll" type="button">Restore all ${ids.length}</button><div class="ar-list">${ids.map((id) => `<div class="ar-row" data-ar="${escA(id)}">${pic(id)}<span><b>${escA(m[id].title || id)}</b><em>${m[id].order ? "Order" : "Item"} · archived ${new Date(m[id].at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</em></span><button class="btn" data-restore="${escA(id)}" type="button">Restore</button></div>`).join("")}</div>` : ""}`);
    s.querySelectorAll("[data-restore]").forEach((b) => b.addEventListener("click", () => { unarchive([b.dataset.restore]); b.closest(".ar-row").remove(); f.render(); f.toast("Restored"); const n = host.querySelector("#spArchN"); if (n) n.textContent = String(Object.keys(archMap()).length); }));
    s.querySelector("#arAll")?.addEventListener("click", (e) => { const b = e.currentTarget; if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = `Yes, restore all ${ids.length}`; return; } unarchive(ids); f.closeSheet(); f.render(); f.toast(`Restored ${ids.length}`); });
  };
  host.querySelector("#spArch").addEventListener("click", openArch);
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
