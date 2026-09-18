import { PHASES, phaseFromItem, normalizePhase } from "/visor/phases.js?v=1";

const LS_ITEMS = "coalition-items-v1";
const LS_SPACES = "coalition-spaces-v1";
const VIEWS = ["command", "scouter", "map", "spaces", "channels", "settings"];

const state = {
  view: "command",
  items: [],
  spaces: [],
  activePhase: "intake",
  ebayOnline: false,
  sheetItemId: null,
  combineMode: false,
  combineSelected: new Set(),
};

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2800);
}

function money(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

function loadItems() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_ITEMS) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveItems() {
  localStorage.setItem(LS_ITEMS, JSON.stringify(state.items));
}

function defaultSpaces() {
  return [
    { id: "bin1", name: "Bin 1", kind: "ebay_listed", itemIds: [], cover: "/spaces/bin1.jpg" },
    { id: "bin2", name: "Bin 2", kind: "ebay_listed", itemIds: [], cover: "/spaces/bin2.jpg" },
    { id: "staged", name: "Staged", kind: "staged", itemIds: [], cover: "/spaces/staged.jpg" },
  ];
}

function loadSpaces() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_SPACES) || "null");
    if (Array.isArray(raw) && raw.length) {
      // Ensure covers land for older saves
      const defaults = Object.fromEntries(defaultSpaces().map((s) => [s.id, s]));
      return raw.map((s) => ({ ...defaults[s.id], ...s, cover: s.cover || defaults[s.id]?.cover || null }));
    }
  } catch { /* ignore */ }
  return defaultSpaces();
}

function saveSpaces() {
  localStorage.setItem(LS_SPACES, JSON.stringify(state.spaces));
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `i_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function navigate(view) {
  if (!VIEWS.includes(view)) view = "command";
  state.view = view;
  location.hash = `#/${view}`;
  for (const v of VIEWS) {
    $(`view-${v}`)?.classList.toggle("active", v === view);
    document.querySelector(`.nav-tab[data-view="${v}"]`)?.classList.toggle("active", v === view);
  }
  render();
}

function countsByPhase() {
  const counts = Object.fromEntries(PHASES.map((p) => [p.id, 0]));
  for (const it of state.items) {
    const ph = phaseFromItem(it);
    counts[ph] = (counts[ph] || 0) + 1;
  }
  return counts;
}

function scouterValue() {
  return state.items
    .filter((i) => phaseFromItem(i) === "intake" || phaseFromItem(i) === "staged")
    .reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
}

function setStat(id, value, { hotWhen = 0, cyan = false } = {}) {
  const el = $(id);
  if (!el) return;
  const n = Number(value) || 0;
  el.textContent = String(n).padStart(2, "0");
  el.classList.toggle("hot", !cyan && n > hotWhen);
  el.classList.toggle("cyan", Boolean(cyan) && n > 0);
}

function stageValue(phaseId) {
  return state.items
    .filter((i) => phaseFromItem(i) === phaseId)
    .reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
}

function oldestAge(phaseId) {
  const items = state.items.filter((i) => phaseFromItem(i) === phaseId);
  if (!items.length) return "—";
  let oldest = Date.now();
  for (const it of items) {
    const t = Date.parse(it.createdAt || it.updatedAt || "") || Date.now();
    if (t < oldest) oldest = t;
  }
  const days = Math.max(0, Math.floor((Date.now() - oldest) / 86400000));
  if (days <= 0) return "Today";
  return `Oldest ${days}d`;
}

function renderCommand() {
  const c = countsByPhase();
  const toList = c.staged || 0;
  const listed = c.listed || 0;
  const inventory = state.items.length;
  const needsBin = state.items.filter((i) => !i.spaceId && phaseFromItem(i) !== "listed").length;
  const intakeN = c.intake || 0;
  const reviewN = state.items.filter((i) => phaseFromItem(i) === "intake" && !i.productName).length;
  const builtN = toList;
  const shipN = (c.sold || 0) + (c.packed || 0);

  setStat("statToList", toList);
  setStat("statNeedsBin", needsBin);
  setStat("statListed", listed, { cyan: true });
  setStat("statInventory", inventory, { cyan: true });

  const sitrep = $("sitrepList");
  if (sitrep) {
    const rows = [
      { n: reviewN || intakeN, title: "Scans needing review", hint: "Low confidence or unidentified", goto: "scouter", tone: "amber" },
      { n: builtN, title: "Built, not published", hint: "Listing ready — push to channel", goto: "channels", tone: "amber" },
      { n: needsBin, title: "Needs bin", hint: "No Spaces location yet", goto: "spaces", tone: "amber" },
      { n: shipN, title: "Ready to ship", hint: "Sold / packed awaiting dropoff", goto: "map", tone: "cyan" },
    ];
    sitrep.innerHTML = rows
      .map(
        (r) => `<div class="sitrep-row" data-goto="${r.goto}">
          <div class="sitrep-n${r.tone === "cyan" ? " cyan" : ""}">${String(r.n).padStart(2, "0")}</div>
          <div><strong>${r.title}</strong><span>${r.hint}</span></div>
          <svg class="sitrep-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
        </div>`
      )
      .join("");
    sitrep.querySelectorAll("[data-goto]").forEach((el) =>
      el.addEventListener("click", () => navigate(el.dataset.goto))
    );
  }

  const pipe = $("pipelineCards");
  if (pipe) {
    const sorted = c.intake || 0;
    const photos = state.items.filter((i) => (i.photos || []).length > 0 && phaseFromItem(i) !== "listed").length;
    pipe.innerHTML = `
      <div class="pipe-card">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8h16v11H4zM8 8V6h8v2"/></svg>
        <div class="lbl">SORTED</div>
        <div class="big">${String(sorted).padStart(2, "0")}</div>
        <div class="cash">${money(stageValue("intake"))}</div>
        <div class="age">${oldestAge("intake")}</div>
      </div>
      <div class="pipe-card">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8h3l2-2h6l2 2h3v11H4V8z"/><circle cx="12" cy="14" r="3"/></svg>
        <div class="lbl">PHOTOS TAKEN</div>
        <div class="big">${String(photos).padStart(2, "0")}</div>
        <div class="cash">${money(stageValue("staged") + stageValue("intake"))}</div>
        <div class="age">${oldestAge("staged")}</div>
      </div>`;
  }
}

function renderScouter() {
  const onScout = state.items.filter((i) => {
    const p = phaseFromItem(i);
    return p === "intake" || p === "staged";
  });
  if ($("scouterCount")) $("scouterCount").textContent = String(onScout.length).padStart(2, "0");
  if ($("scouterValue")) $("scouterValue").textContent = money(scouterValue());

  const intake = state.items.filter((i) => phaseFromItem(i) === "intake");
  const staged = state.items.filter((i) => phaseFromItem(i) === "staged");
  paintPkgs("pkgIntake", intake);
  paintPkgs("pkgStaged", staged);
  if ($("intakeCount")) $("intakeCount").textContent = String(intake.length).padStart(2, "0");
  if ($("stagedCount")) $("stagedCount").textContent = String(staged.length).padStart(2, "0");
}

function paintPkgs(rootId, items) {
  const root = $(rootId);
  if (!root) return;
  if (!items.length) {
    root.innerHTML = `<div class="pkg empty" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 014.5 1.5c0 1.5-2.5 2-2.5 3.5M12 17h.01"/></svg></div>`;
    return;
  }
  root.innerHTML = items
    .slice(0, 12)
    .map((it) => {
      const src = it.photos?.[0]?.dataUrl || "";
      const qty = Number(it.quantity) || 1;
      return `<button type="button" class="pkg" data-item="${it.id}">
        ${src ? `<img src="${src}" alt="" />` : `<div class="pkg empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="14" height="14" rx="1"/></svg></div>`}
        ${qty > 1 ? `<span class="qty">x${qty}</span>` : ""}
      </button>`;
    })
    .join("");
  root.querySelectorAll("[data-item]").forEach((btn) =>
    btn.addEventListener("click", () => openSheet(btn.dataset.item))
  );
}

function renderMap() {
  const counts = countsByPhase();
  const track = $("mapNodes");
  if (!track) return;
  track.innerHTML = PHASES.map((p) => {
    const active = state.activePhase === p.id ? " active" : "";
    return `<button type="button" class="map-node${active}" data-phase="${p.id}">
      <span class="orb"></span>
      <span class="lbl">${p.short}</span>
      <span class="cnt">${String(counts[p.id] || 0).padStart(2, "0")}</span>
    </button>`;
  }).join("");
  track.querySelectorAll("[data-phase]").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.activePhase = btn.dataset.phase;
      renderMap();
    })
  );
  const phase = PHASES.find((p) => p.id === state.activePhase) || PHASES[0];
  if ($("mapStageName")) $("mapStageName").textContent = phase.label;
  const list = $("mapItems");
  if (!list) return;
  const items = state.items.filter((i) => phaseFromItem(i) === phase.id);
  if (!items.length) {
    list.innerHTML = `<div class="empty-quiet">Nothing in ${escapeHtml(phase.label)} yet</div>`;
    return;
  }
  list.innerHTML = items
    .map((it) => {
      const src = it.photos?.[0]?.dataUrl || "";
      const status = listingStatusLabel(it);
      return `<button type="button" class="item-card" data-item="${it.id}">
        ${src ? `<img src="${src}" alt="" />` : `<div class="ph"></div>`}
        <div><h3>${escapeHtml(it.title || it.productName || "Untitled")}</h3>
        <p>${escapeHtml(phase.label)}${it.spaceId ? ` · ${escapeHtml(spaceName(it.spaceId))}` : ""}</p>
        <span class="listing-status">${escapeHtml(status)}</span></div>
        <div class="price-col">${money(it.price || 0)}</div>
      </button>`;
    })
    .join("");
  list.querySelectorAll("[data-item]").forEach((btn) =>
    btn.addEventListener("click", () => openSheet(btn.dataset.item))
  );
}

function spaceName(id) {
  return state.spaces.find((s) => s.id === id)?.name || id;
}

function renderSpaces() {
  const nodes = $("spacesNodes");
  const unsorted = state.items.filter((i) => !i.spaceId);
  const filed = state.items.filter((i) => i.spaceId);
  setStat("statSubLoc", state.spaces.length, { cyan: true });
  setStat("statItemsHere", filed.length, { cyan: true });
  const unsortedEl = $("statUnsorted");
  if (unsortedEl) {
    unsortedEl.textContent = String(unsorted.length).padStart(2, "0");
    unsortedEl.classList.add("alert");
  }

  if (nodes) {
    nodes.innerHTML = state.spaces
      .map((sp) => {
        const n = state.items.filter((i) => i.spaceId === sp.id).length;
        const cover = sp.cover
          ? `<img src="${sp.cover}" alt="" />`
          : `<div class="ph-bin">${escapeHtml(sp.name).toUpperCase()}</div>`;
        return `<button type="button" class="space-node" data-space="${sp.id}">
          <div class="frame">${cover}</div>
          <div class="tag">${escapeHtml(sp.name)}<em>${String(n).padStart(2, "0")}</em></div>
        </button>`;
      })
      .join("");
  }

  if ($("unsortedPool")) {
    $("unsortedPool").innerHTML = unsorted.length
      ? `<strong>UNSORTED</strong>${unsorted.length} item${unsorted.length === 1 ? "" : "s"} — assign from the item card`
      : `<strong>UNSORTED</strong>Pool empty`;
  }
}

function listingStatusLabel(it) {
  if (it.variationParent || String(it.notes || "").includes("variation-parent:")) {
    return "Variation parent";
  }
  if (String(it.notes || "").includes("variation-child:") || it.variationGroupId) {
    return "In variation";
  }
  const ebay = it.channels?.ebay;
  if (ebay?.status === "active" || (ebay?.listingId && phaseFromItem(it) === "listed")) {
    return "eBay listed";
  }
  if (ebay?.status) return `eBay · ${ebay.status}`;
  if (it.channels?.double_holo?.listingId) return "Double Holo";
  const ph = phaseFromItem(it);
  if (ph === "listed") return "Listed";
  if (ph === "staged") return "Staged";
  if (ph === "intake") return "Intake";
  return ph;
}

function renderChannels() {
  const grid = $("channelGrid");
  if (!grid) return;
  const listed = state.items.filter(
    (i) => phaseFromItem(i) === "listed" || i.channels?.ebay || i.variationParent
  );
  const cards = listed.length
    ? listed
    : [
        {
          id: "_demo_ebay",
          title: "eBay",
          productName: "Live inventory sync",
          price: 0,
          demo: true,
          tone: "ebay",
          badge: "PORT",
        },
        {
          id: "_demo_dh",
          title: "Double Holo",
          productName: "Vendor hub mirror",
          price: 0,
          demo: true,
          tone: "dh",
          badge: "HUB",
        },
        {
          id: "_demo_shop",
          title: "Shopify",
          productName: "Claude holds connection",
          price: 0,
          demo: true,
          tone: "shop",
          badge: "LIVE",
        },
        {
          id: "_demo_mp",
          title: "Misprint",
          productName: "Key ready · base URL next",
          price: 0,
          demo: true,
          tone: "mp",
          badge: "KEY",
        },
      ];
  grid.innerHTML = cards
    .slice(0, 12)
    .map((it) => {
      const src = it.photos?.[0]?.dataUrl;
      const status = it.demo ? "Channel" : listingStatusLabel(it);
      const badge = it.demo ? it.badge || "SYNC" : it.condition || it.grade || "NM";
      const artClass = it.demo ? `art tone-${it.tone || "ebay"}` : "art";
      return `<button type="button" class="channel-card" data-item="${it.demo ? "" : it.id}">
        <div class="${artClass}">
          ${src ? `<img src="${src}" alt="" />` : `<div class="art-mark">${escapeHtml((it.title || "?").slice(0, 2).toUpperCase())}</div>`}
          <span class="badge">${escapeHtml(badge)}</span>
        </div>
        <div class="body">
          <h3>${escapeHtml(it.title || it.productName || "Listing")}</h3>
          <p>${escapeHtml(it.setName || it.productName || (it.demo ? "Channel surface" : status))}</p>
          <div class="price">${it.demo ? "Connect" : money(it.price || 0)}</div>
        </div>
      </button>`;
    })
    .join("");
  grid.querySelectorAll("[data-item]").forEach((btn) => {
    if (btn.dataset.item) btn.addEventListener("click", () => openSheet(btn.dataset.item));
  });
  if ($("ebayPill")) {
    $("ebayPill").classList.toggle("on", state.ebayOnline);
    $("ebayPillLabel").textContent = state.ebayOnline ? "EBAY ONLINE" : "EBAY OFFLINE";
  }
  renderCombinePool();
}

function renderCombinePool() {
  const pool = $("combinePool");
  const hint = $("combineHint");
  const runBtn = $("btnCombineRun");
  const cancelBtn = $("btnCombineCancel");
  const modeBtn = $("btnCombineMode");
  if (!pool) return;
  const on = state.combineMode;
  pool.hidden = !on;
  if (hint) hint.hidden = !on;
  if (runBtn) runBtn.hidden = !on;
  if (cancelBtn) cancelBtn.hidden = !on;
  if (modeBtn) modeBtn.hidden = on;

  if (!on) return;
  const candidates = state.items.filter((i) => {
    const p = phaseFromItem(i);
    return (p === "staged" || p === "intake") && !i.variationParent;
  });
  const grid = $("combineGrid");
  if (!grid) return;
  if (!candidates.length) {
    grid.innerHTML = `<div class="empty-quiet">Stage cards in Scouter first, then combine</div>`;
    return;
  }
  grid.innerHTML = candidates
    .map((it) => {
      const src = it.photos?.[0]?.dataUrl;
      const sel = state.combineSelected.has(it.id) ? " selected" : "";
      return `<button type="button" class="combine-card${sel}" data-combine="${it.id}">
        ${src ? `<img src="${src}" alt="" />` : `<div class="ph"></div>`}
        <div>
          <strong>${escapeHtml(it.productName || it.title || "Untitled")}</strong>
          <span>${escapeHtml(it.setName || "No set")} · ${escapeHtml(it.collectorNumber || "—")}</span>
        </div>
      </button>`;
    })
    .join("");
  grid.querySelectorAll("[data-combine]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.dataset.combine;
      if (state.combineSelected.has(id)) state.combineSelected.delete(id);
      else state.combineSelected.add(id);
      renderCombinePool();
    })
  );
}

function setCombineMode(on) {
  state.combineMode = Boolean(on);
  if (!on) state.combineSelected = new Set();
  renderChannels();
}

function downloadText(filename, text, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function runCombineBatch() {
  const ids = [...state.combineSelected];
  if (ids.length < 2) {
    toast("Select at least 2 cards");
    return;
  }
  const children = ids.map((id) => state.items.find((i) => i.id === id)).filter(Boolean);
  toast(`Combining ${children.length}…`);
  try {
    const mod = await import("/visor/variation.js?v=1");
    const batch = mod.combineVariationBatch(children);
    const parent = {
      id: uid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      title: batch.title,
      productName: batch.title,
      description: batch.description,
      setName: batch.setName,
      rarity: batch.rarity,
      game: batch.game,
      quantity: batch.totalQty,
      price: null,
      phase: "staged",
      staged: true,
      spaceId: null,
      variationParent: true,
      variationGroupId: batch.groupId,
      notes: `variation-parent:${batch.groupId}`,
      channels: { ebay: { listingId: null, price: null, status: "variation_parent", sku: batch.parent.sku } },
      photos: children.map((c) => c.photos?.[0]).filter(Boolean).slice(0, 1),
    };
    for (const c of children) {
      c.variationGroupId = batch.groupId;
      c.notes = [c.notes, `variation-child:${batch.groupId}`].filter(Boolean).join(" | ");
      c.phase = "staged";
      c.staged = true;
      c.updatedAt = new Date().toISOString();
    }
    state.items.unshift(parent);
    saveItems();
    downloadText(`ebay-variation-${batch.groupId}.csv`, batch.csv);
    toast(`Combined · ${batch.childCount} cards · CSV ready`);
    setCombineMode(false);
    render();
    // Best-effort server mirror when items exist there
    try {
      await fetch("/api/channels/ebay/combine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: children, setName: batch.setName, rarity: batch.rarity, game: batch.game }),
      });
    } catch { /* local-first ok */ }
  } catch (err) {
    toast(err?.message || "Combine failed");
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function openSheet(id) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;
  state.sheetItemId = id;
  const sheet = $("itemSheet");
  if (!sheet) return;
  sheet.classList.add("open");
  const src = it.photos?.[0]?.dataUrl || "";
  $("sheetMedia").innerHTML = src ? `<img src="${src}" alt="" />` : "";
  $("sheetTitle").textContent = it.title || it.productName || "Untitled";
  $("sheetMeta").textContent = `${phaseFromItem(it)} · ${listingStatusLabel(it)} · qty ${it.quantity || 1} · ${money(it.price || 0)}`;
  $("sheetSpace").textContent = it.spaceId ? spaceName(it.spaceId) : "No bin assigned";
}

function closeSheet() {
  state.sheetItemId = null;
  $("itemSheet")?.classList.remove("open");
}

async function addPhotos(fileList) {
  const files = [...(fileList || [])].filter((f) => f.type.startsWith("image/"));
  if (!files.length) {
    toast("No images in that drop");
    return;
  }
  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    const item = {
      id: uid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      title: file.name.replace(/\.[^.]+$/, "") || "Scan",
      productName: null,
      quantity: 1,
      price: null,
      phase: "intake",
      staged: false,
      spaceId: null,
      barcode: null,
      channels: {},
      photos: [{ id: uid(), dataUrl, createdAt: new Date().toISOString() }],
    };
    state.items.unshift(item);
  }
  saveItems();
  toast(`${files.length} on Scouter`);
  navigate("scouter");
}

async function addBarcode(code) {
  const trimmed = String(code || "").trim();
  if (!trimmed) return;
  let title = trimmed;
  try {
    const res = await fetch(`/api/scouter/barcode/${encodeURIComponent(trimmed)}`);
    if (res.ok) {
      const body = await res.json();
      title = body.title || body.name || trimmed;
    }
  } catch { /* offline ok */ }
  state.items.unshift({
    id: uid(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title,
    productName: title,
    quantity: 1,
    price: null,
    phase: "intake",
    staged: false,
    spaceId: null,
    barcode: trimmed,
    channels: {},
    photos: [],
  });
  saveItems();
  toast("Barcode added");
  closeBarcode();
  navigate("scouter");
}

async function runEngine(id) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;
  toast("Running listing engine…");
  try {
    const res = await fetch(`/api/scouter/items/${encodeURIComponent(id)}/listing-engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "regular", soldAvg: it.price }),
    });
    if (res.ok) {
      const body = await res.json();
      it.title = body.listing?.title || it.title;
      it.description = body.listing?.description || it.description;
      if (body.listing?.suggestedPrice != null) it.price = body.listing.suggestedPrice;
      it.phase = it.phase === "intake" ? "staged" : it.phase;
      it.staged = true;
      saveItems();
      toast("Listing built");
      openSheet(id);
      render();
      return;
    }
  } catch { /* fall through to client engine */ }
  try {
    const mod = await import("/visor/listing-engine.js?v=1");
    const listing = mod.runListingEngine(it, { soldAvg: it.price });
    it.title = listing.title;
    it.description = listing.description;
    if (listing.suggestedPrice != null) it.price = listing.suggestedPrice;
    it.phase = "staged";
    it.staged = true;
    saveItems();
    toast("Listing built");
    openSheet(id);
    render();
  } catch {
    toast("Listing engine failed — check item data");
  }
}

function stageItem(id) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;
  it.phase = "staged";
  it.staged = true;
  it.updatedAt = new Date().toISOString();
  saveItems();
  toast("Staged");
  closeSheet();
  render();
}

function assignSpace(id, spaceId) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;
  it.spaceId = spaceId;
  it.updatedAt = new Date().toISOString();
  saveItems();
  toast(`Filed in ${spaceName(spaceId)}`);
  closeSheet();
  render();
}

async function probeEbay() {
  try {
    const res = await fetch("/api/channels/status");
    const body = await res.json();
    const ebay = (body.channels || []).find((c) => c.id === "ebay");
    state.ebayOnline = Boolean(ebay?.configured);
  } catch {
    state.ebayOnline = false;
  }
  renderChannels();
}

async function syncEbay() {
  toast("Pulling eBay…");
  try {
    const res = await fetch("/api/channels/ebay/sync", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(body.error || "eBay sync not configured yet — Base44 link still being ported");
      return;
    }
    // Merge server-side sync into phone store for Channels tab
    try {
      const listRes = await fetch("/api/scouter/items");
      if (listRes.ok) {
        const remote = await listRes.json();
        const rows = Array.isArray(remote) ? remote : remote.items || [];
        for (const r of rows) {
          if (!r.channels?.ebay) continue;
          const sku = r.channels.ebay.sku;
          const idx = state.items.findIndex(
            (i) => i.channels?.ebay?.sku === sku || i.id === r.id
          );
          const mapped = {
            id: r.id,
            title: r.title || r.productName,
            productName: r.productName || r.title,
            quantity: r.quantity || 1,
            price: r.price,
            phase: r.phase || "listed",
            staged: false,
            spaceId: r.spaceId || null,
            channels: r.channels,
            photos: (r.photos || [])
              .filter((p) => p.dataUrl || p.url)
              .map((p) => ({ id: p.id, dataUrl: p.dataUrl || p.url })),
          };
          if (idx >= 0) state.items[idx] = { ...state.items[idx], ...mapped };
          else state.items.unshift(mapped);
        }
        saveItems();
      }
    } catch { /* local-only ok */ }
    toast(`eBay sync · ${body.pulled || 0} pulled`);
    probeEbay();
    render();
  } catch {
    toast("eBay sync failed — check channel config");
  }
}

async function loadSoldPrice(id) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;
  toast("Load sold avg — wiring to eBay sold comps");
  // Live beta: mark intent; real comps need eBay browse/finding once creds ported
  try {
    const q = encodeURIComponent(it.title || it.productName || "");
    const res = await fetch(`/api/scouter/identify?probe=price&q=${q}`);
    if (res.ok) {
      const body = await res.json();
      if (body.price != null) {
        it.price = Number(body.price);
        saveItems();
        toast(`Loaded ${money(it.price)}`);
        render();
        return;
      }
    }
  } catch { /* fall through */ }
  toast("Sold-average load needs eBay comps live — creds from Base44 next");
}

async function loadAllSold() {
  const batch = state.items.filter((i) => phaseFromItem(i) === "intake" || phaseFromItem(i) === "staged");
  if (!batch.length) {
    toast("Nothing to price");
    return;
  }
  toast(`Load all on ${batch.length} items — eBay comps next`);
  for (const it of batch) {
    await loadSoldPrice(it.id);
  }
}

function openBarcode() {
  $("barcodeSheet")?.classList.add("open");
  $("barcodeInput")?.focus();
}

function closeBarcode() {
  $("barcodeSheet")?.classList.remove("open");
  if ($("barcodeInput")) $("barcodeInput").value = "";
}

function render() {
  renderCommand();
  renderScouter();
  renderMap();
  renderSpaces();
  renderChannels();
}

function bind() {
  document.querySelectorAll(".nav-tab").forEach((tab) =>
    tab.addEventListener("click", () => navigate(tab.dataset.view))
  );

  $("btnSnap")?.addEventListener("click", () => $("inputSnap")?.click());
  $("btnBarcode")?.addEventListener("click", openBarcode);
  $("inputSnap")?.addEventListener("change", (e) => {
    addPhotos(e.target.files);
    e.target.value = "";
  });

  $("btnCloseSheet")?.addEventListener("click", closeSheet);
  $("btnStage")?.addEventListener("click", () => stageItem(state.sheetItemId));
  $("btnRunEngine")?.addEventListener("click", () => runEngine(state.sheetItemId));
  $("btnLoadSold")?.addEventListener("click", () => loadSoldPrice(state.sheetItemId));
  $("btnAssignBin1")?.addEventListener("click", () => assignSpace(state.sheetItemId, "bin1"));
  $("btnAssignBin2")?.addEventListener("click", () => assignSpace(state.sheetItemId, "bin2"));
  $("btnAssignStaged")?.addEventListener("click", () => assignSpace(state.sheetItemId, "staged"));

  $("btnCloseBarcode")?.addEventListener("click", closeBarcode);
  $("btnBarcodeAdd")?.addEventListener("click", () => addBarcode($("barcodeInput")?.value));
  $("barcodeInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addBarcode(e.target.value);
  });

  $("btnEbaySync")?.addEventListener("click", syncEbay);
  $("btnLoadAllSold")?.addEventListener("click", loadAllSold);
  $("btnLoadAllSold2")?.addEventListener("click", loadAllSold);
  $("btnOpenMap")?.addEventListener("click", () => navigate("map"));
  $("btnCombineMode")?.addEventListener("click", () => {
    navigate("channels");
    setCombineMode(true);
  });
  $("btnCombineCancel")?.addEventListener("click", () => setCombineMode(false));
  $("btnCombineRun")?.addEventListener("click", runCombineBatch);

  // drag-drop photos onto scouter view
  const scout = $("view-scouter");
  if (scout) {
    scout.addEventListener("dragover", (e) => {
      e.preventDefault();
    });
    scout.addEventListener("drop", (e) => {
      e.preventDefault();
      addPhotos(e.dataTransfer.files);
    });
  }

  window.addEventListener("hashchange", () => {
    const view = location.hash.replace(/^#\/?/, "") || "command";
    if (VIEWS.includes(view) && view !== state.view) navigate(view);
  });
}

async function boot() {
  state.items = loadItems();
  state.spaces = loadSpaces();
  saveSpaces();
  bind();
  const start = location.hash.replace(/^#\/?/, "") || "command";
  navigate(VIEWS.includes(start) ? start : "command");
  await probeEbay();
}

boot();
