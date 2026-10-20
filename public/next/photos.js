import { esc, loadItems, saveItems } from "./shared.js?v=5";

/* One photo editor for every item, wherever it is: set main, reorder, remove, add. */
async function shrink(file, max = 1400) {
  let bmp = null;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* fall back */ }
  if (!bmp) bmp = await new Promise((res, rej) => { const im = new Image(), u = URL.createObjectURL(file); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = rej; im.src = u; });
  const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight, k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); if (bmp.close) bmp.close();
  return c.toDataURL("image/jpeg", 0.8);
}
const src = (p) => p.dataUrl || p.url || "";
const skuOf = (it) => it.channels?.ebay?.sku || it.sku || "";
const isLive = (it) => Boolean(it.channels?.ebay?.listingId) && !it.ended && it.phase !== "intake";

export function photoManager(box, id, api) {
  let dirty = false, busy = "";
  const get = () => loadItems().find((x) => String(x.id) === String(id));
  const edit = (mut) => { const l = loadItems(), it = l.find((x) => String(x.id) === String(id)); if (!it) return; it.photos = it.photos || []; mut(it.photos); it.updatedAt = new Date().toISOString(); if (!saveItems(l)) { api.toast("Couldn't save. Storage is full."); return; } dirty = true; api.refresh && api.refresh(); draw(); };
  function draw() {
    const it = get(); if (!it) { box.innerHTML = ""; return; }
    const list = it.photos || [], live = isLive(it) && skuOf(it);
    box.innerHTML = `<div class="ph-head"><b>Photos</b><span>${list.length ? "First one is the main photo" : "No photos yet"}</span></div>
      <div class="ph-row">${list.map((p, k) => `<div class="ph-tile${k === 0 ? " main" : ""}" data-k="${k}"><img src="${esc(src(p))}" alt="" draggable="false">${k === 0 ? "<b>Main</b>" : `<button type="button" class="ph-star" data-main="${k}" aria-label="Make main photo">★ Main</button>`}
        <div class="ph-act">${k > 0 ? `<button type="button" data-left="${k}" aria-label="Move earlier">‹</button>` : "<i></i>"}<button type="button" class="ph-x" data-rm="${k}" aria-label="Remove photo">×</button>${k < list.length - 1 ? `<button type="button" data-right="${k}" aria-label="Move later">›</button>` : "<i></i>"}</div></div>`).join("")}
        <label class="ph-add" aria-label="Add photos"><input type="file" accept="image/*" multiple hidden><span>+</span><em>Add</em></label></div>
      ${live ? `<button type="button" class="btn ph-push${dirty ? " go" : ""}" id="phPush"${busy ? " disabled" : ""}>${busy || (dirty ? "Update photos on eBay" : "Push these photos to eBay")}</button>` : ""}`;
    box.querySelectorAll("[data-main]").forEach((b) => b.addEventListener("click", () => edit((ps) => { const [x] = ps.splice(Number(b.dataset.main), 1); ps.unshift(x); })));
    box.querySelectorAll("[data-left]").forEach((b) => b.addEventListener("click", () => edit((ps) => { const k = Number(b.dataset.left); [ps[k - 1], ps[k]] = [ps[k], ps[k - 1]]; })));
    box.querySelectorAll("[data-right]").forEach((b) => b.addEventListener("click", () => edit((ps) => { const k = Number(b.dataset.right); [ps[k + 1], ps[k]] = [ps[k], ps[k + 1]]; })));
    box.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => { if ((get().photos || []).length <= 1 && isLive(get())) { api.toast("A live listing needs at least one photo."); return; } edit((ps) => { ps.splice(Number(b.dataset.rm), 1); }); }));
    box.querySelector(".ph-add input")?.addEventListener("change", async (e) => {
      const files = [...e.target.files]; if (!files.length) return; busy = ""; const add = [];
      for (const f of files) { try { add.push({ id: `ph-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, dataUrl: await shrink(f), createdAt: new Date().toISOString() }); } catch { /* skip */ } }
      if (add.length) edit((ps) => { ps.push(...add); }); else api.toast("Those weren't photos.");
    });
    box.querySelector("#phPush")?.addEventListener("click", async () => {
      const cur = get(); busy = "Updating eBay…"; draw();
      try {
        const r = await fetch("/api/channels/ebay/update-photos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku: skuOf(cur), photos: (cur.photos || []).map(src) }) });
        const out = await r.json().catch(() => ({}));
        if (!r.ok || !out.ok) throw new Error(out.error || "eBay said no.");
        dirty = false; busy = ""; api.toast("Photos updated on eBay."); draw();
      } catch (e) { busy = ""; api.toast(String(e.message || "Couldn't reach eBay.").slice(0, 90)); draw(); }
    });
  }
  draw();
}
