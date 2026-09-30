import { PHASES, phaseFromItem, normalizePhase } from "/visor/phases.js?v=1";

const LS_ITEMS = "coalition-items-v4";
const LS_SPACES = "coalition-spaces-v4";
const VIEWS = ["command", "scouter", "constellation", "spaces", "channels", "settings"];

const state = {
  view: "command",
  items: [],
  spaces: [],
  justMovedId: null,
  constellationMode: "tree", // "tree" | "collection"
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
  try {
    localStorage.setItem(LS_ITEMS, JSON.stringify(state.items));
    return true;
  } catch (err) {
    // Refuse the save, keep everything in memory, and say so plainly.
    // Stored photos are never stripped to force a fit.
    const full = err && (err.name === "QuotaExceededError" || err.code === 22);
    toast(full ? "Storage full — nothing saved, your photos are safe" : "Could not save — your photos are safe");
    return false;
  }
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

function seedDemoItems() {
  // Explicit opt-in only — NEVER called automatically. Fresh installs start
  // empty (honest empty state); demo data appears only when the operator taps
  // "Load demo data" in Settings. Appends to the current inventory — real
  // items are never wiped. Safe to call repeatedly: skips when demo items
  // already exist. Returns the number of demo items added (0 = none).
  if (state.items.some((i) => i && i.notes === "demo-seed")) return 0;
  const now = new Date().toISOString();
  const idPika = uid();
  const idPack = uid();
  const idDeck = uid();
  const idEtb = uid();
  const idDest = uid();
  const demo = [
    {
      id: idPika,
      createdAt: now,
      updatedAt: now,
      title: "Pikachu VMAX Jumbo",
      productName: "Pikachu VMAX [Jumbo]",
      setName: "Pokemon Promo",
      quantity: 2,
      price: 49.97,
      phase: "intake",
      staged: false,
      spaceId: null,
      channels: {},
      photos: [{ id: uid(), dataUrl: "/demo/pack-silver-tempest.jpg", createdAt: now }],
      notes: "demo-seed",
    },
    {
      id: idPack,
      createdAt: now,
      updatedAt: now,
      title: "Pitch Black Booster",
      productName: "Mega Evolution Pitch Black",
      setName: "Mega Evolution",
      quantity: 2,
      price: 6.49,
      phase: "intake",
      staged: false,
      spaceId: null,
      channels: {},
      photos: [{ id: uid(), dataUrl: "/demo/pack-pitch-black.jpg", createdAt: now }],
      notes: "demo-seed",
    },
    {
      id: idDeck,
      createdAt: now,
      updatedAt: now,
      title: "Deluxe Battle Deck Meowscarada",
      productName: "Deluxe Battle Deck",
      setName: "Scarlet & Violet",
      quantity: 1,
      price: 35.5,
      phase: "staged",
      staged: true,
      spaceId: "bin1",
      channels: {},
      photos: [{ id: uid(), dataUrl: "/demo/card-morpeko.jpg", createdAt: now }],
      notes: "demo-seed",
    },
    {
      id: idEtb,
      createdAt: now,
      updatedAt: now,
      title: "Chaos Rising Elite Trainer Box",
      productName: "Chaos Rising ETB",
      setName: "Mega Evolution",
      quantity: 1,
      price: 68.13,
      phase: "staged",
      staged: true,
      spaceId: "staged",
      channels: {},
      photos: [{ id: uid(), dataUrl: "/demo/etb-chaos-rising.jpg", createdAt: now }],
      notes: "demo-seed",
    },
    {
      id: idDest,
      createdAt: now,
      updatedAt: now,
      title: "Destined Rivals Elite Trainer Box",
      productName: "Destined Rivals ETB",
      setName: "Destined Rivals",
      quantity: 1,
      price: 115.53,
      phase: "listed",
      staged: true,
      spaceId: "bin2",
      channels: { ebay: { status: "active", listingId: "demo-listed-1" } },
      photos: [{ id: uid(), dataUrl: "/demo/etb-destined.jpg", createdAt: now }],
      notes: "demo-seed",
    },
  ];
  const itemsBefore = state.items.length;
  const spacesBefore = JSON.stringify(state.spaces);
  state.items.push(...demo);
  for (const sp of state.spaces) {
    const ids = demo.filter((i) => i.spaceId === sp.id).map((i) => i.id);
    if (ids.length) sp.itemIds = [...(sp.itemIds || []), ...ids];
  }
  if (!saveItems()) {
    // Storage refused — roll back so memory matches disk. saveItems() already
    // showed the honest "storage full" toast.
    state.items.length = itemsBefore;
    try { state.spaces = JSON.parse(spacesBefore); } catch { /* keep running */ }
    return 0;
  }
  saveSpaces();
  render();
  return demo.length;
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
  $("app")?.classList.toggle("wide", view === "constellation");
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
      { n: reviewN || intakeN, title: "Scans needing review", hint: "Low confidence or unidentified", goto: "scouter" },
      { n: builtN, title: "Built, not published", hint: "Listing ready — push to channel", goto: "channels" },
      { n: needsBin, title: "Needs bin", hint: "No Spaces location yet", goto: "spaces" },
      { n: shipN, title: "Ready to ship", hint: "Sold / packed awaiting dropoff", goto: "constellation" },
    ].map((r) => ({
      ...r,
      // Amber only when the row is actually urgent (count > 0); cyan default
      tone: r.n > 0 ? "amber" : "cyan",
    }));
    sitrep.innerHTML = rows
      .map(
        (r) => `<div class="sitrep-row" data-goto="${r.goto}">
          <div class="sitrep-n${r.tone === "amber" ? " amber" : " cyan"}">${String(r.n).padStart(2, "0")}</div>
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
          <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 8h16v11H4zM8 8V6h8v2"/></svg>
        <div class="lbl">SORTED</div>
        <div class="big">${String(sorted).padStart(2, "0")}</div>
        <div class="cash">${money(stageValue("intake"))}</div>
        <div class="age">${oldestAge("intake")}</div>
      </div>
      <div class="pipe-card">
          <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 8h3l2-2h6l2 2h3v11H4V8z"/><circle cx="12" cy="14" r="3"/></svg>
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

function moveItemToPhase(itemId, phaseId) {
  if (!PHASES.some((p) => p.id === phaseId)) return;
  const it = state.items.find((i) => i.id === itemId);
  if (!it) return;
  if (phaseFromItem(it) === phaseId) return;
  it.phase = phaseId;
  it.staged = phaseId === "staged" ? true : it.staged;
  state.justMovedId = itemId;
  saveItems();
  render();
  toast(`Moved to ${PHASES.find((p) => p.id === phaseId).label}`);
}

function setConstellationMode(mode) {
  if (mode !== "tree" && mode !== "collection") return;
  state.constellationMode = mode;
  document.querySelectorAll(".constellation-mode").forEach((b) => {
    const on = b.dataset.cmode === mode;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  renderConstellation();
}

function bindConstellationSwitch() {
  document.querySelectorAll(".constellation-mode").forEach((b) =>
    b.addEventListener("click", () => setConstellationMode(b.dataset.cmode))
  );
}

/* Drag inventory between stages on the constellation roadmap (desktop HTML5).
 * Delegated on #roadmap: survives innerHTML re-renders, bound once. */
function bindRoadDragDrop() {
  const host = $("roadmap");
  if (!host || host.dataset.dragBound) return;
  host.dataset.dragBound = "1";
  host.addEventListener("dragstart", (e) => {
    const card = e.target.closest ? e.target.closest("[data-item]") : null;
    if (!card) return;
    try { e.dataTransfer.setData("text/plain", card.dataset.item); } catch (_) {}
    e.dataTransfer.effectAllowed = "move";
    card.classList.add("dragging-src");
  });
  host.addEventListener("dragend", () => {
    host.querySelectorAll(".dragging-src").forEach((el) => el.classList.remove("dragging-src"));
    host.querySelectorAll(".drop-hint").forEach((el) => el.classList.remove("drop-hint"));
  });
  const phaseOf = (t) => (t && t.closest ? t.closest("[data-phase]") : null);
  host.addEventListener("dragover", (e) => {
    const st = phaseOf(e.target);
    if (!st) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!st.classList.contains("drop-hint")) {
      host.querySelectorAll(".drop-hint").forEach((el) => el.classList.remove("drop-hint"));
      st.classList.add("drop-hint");
    }
  });
  host.addEventListener("dragleave", (e) => {
    const st = phaseOf(e.target);
    if (st && !st.contains(e.relatedTarget)) st.classList.remove("drop-hint");
  });
  host.addEventListener("drop", (e) => {
    const st = phaseOf(e.target);
    if (!st) return;
    e.preventDefault();
    host.querySelectorAll(".drop-hint").forEach((el) => el.classList.remove("drop-hint"));
    const itemId = e.dataTransfer.getData("text/plain");
    moveItemToPhase(itemId, st.dataset.phase);
  });
}

function renderConstellation() {
  const tree = $("constellationTree");
  const col = $("constellationCollection");
  const inCollection = state.constellationMode === "collection";
  if (tree) tree.hidden = inCollection;
  if (col) col.hidden = !inCollection;
  if (inCollection) {
    window.HUD_collection?.render();
    return;
  }
  renderRoadmap();
}

/* Constellation roadmap: items ride the line as floating nodes.
 * Row 1: item clusters per stage. Row 2: the glowing track (orb, chevron, orb…).
 * Row 3: full-word stage labels + counts. Click a node → half-zoom sheet. */
function renderRoadmap() {
  const clusters = $("roadClusters");
  const track = $("roadTrack");
  const labels = $("roadLabels");
  if (!clusters || !track || !labels) return;
  const counts = countsByPhase();
  const byPhase = Object.fromEntries(PHASES.map((p) => [p.id, []]));
  for (const it of state.items) {
    const ph = phaseFromItem(it);
    if (byPhase[ph]) byPhase[ph].push(it);
  }
  const justMoved = state.justMovedId;
  state.justMovedId = null;

  clusters.innerHTML = PHASES.map((p) => {
    const nodes = (byPhase[p.id] || []).map((it, idx) => {
      const src = it.photos?.[0]?.dataUrl || "";
      const name = it.title || it.productName || "Untitled";
      const thumb = src
        ? `<img src="${src}" alt="" loading="lazy" draggable="false" />`
        : `<span class="node-initial" aria-hidden="true">${escapeHtml(name.charAt(0).toUpperCase())}</span>`;
      const land = justMoved === it.id ? " land" : "";
      return `<button type="button" class="node-item${land}" data-item="${it.id}" draggable="true"` +
        ` style="animation-delay:${(idx * 0.4).toFixed(2)}s" aria-label="${escapeHtml(name)} — ${p.label}">` +
        `${thumb}</button>`;
    }).join("");
    return `<div class="cluster" data-phase="${p.id}" aria-label="${p.label} items">${nodes}</div>`;
  }).join("");

  track.innerHTML = PHASES.map((p, i) =>
    `${i ? `<span class="seg" aria-hidden="true"><span class="chev">\u203a</span></span>` : ""}` +
    `<span class="orb-wrap" data-phase="${p.id}"><span class="orb"></span></span>`
  ).join("");

  labels.innerHTML = PHASES.map((p) =>
    `<div class="rlabel" data-phase="${p.id}"><span class="rl-name">${p.label}</span>` +
    `<span class="rl-count">${String(counts[p.id] || 0).padStart(2, "0")}</span></div>`
  ).join("");

  clusters.querySelectorAll("[data-item]").forEach((btn) =>
    btn.addEventListener("click", () => openSheet(btn.dataset.item))
  );
  bindRoadDragDrop();
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
    const mod = await import("/visor/variation.js?v=2");
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
  disarmDelete();
  const sheet = $("itemSheet");
  if (!sheet) return;
  sheet.classList.add("open");
  window.HUD_carousel?.renderInto($("sheetMedia"), it.photos || []);
  $("sheetTitle").textContent = it.title || it.productName || "Untitled";
  $("sheetMeta").textContent = `${phaseFromItem(it)} · ${listingStatusLabel(it)} · qty ${it.quantity || 1} · ${money(it.price || 0)}`;
  $("sheetSpace").textContent = it.spaceId ? spaceName(it.spaceId) : "No bin assigned";
  const idHost = $("identifyResults");
  if (idHost) idHost.innerHTML = "";
  const idBtn = $("btnIdentify");
  if (idBtn) idBtn.disabled = false;
  window.HUD_fulfillment?.renderSheetSection(id);
}
window.HUD_openSheet = openSheet;
function closeSheet() {
  disarmDelete();
  state.sheetItemId = null;
  $("itemSheet")?.classList.remove("open");
}

let deleteArmedId = null;
let deleteTimer = null;

function disarmDelete() {
  deleteArmedId = null;
  clearTimeout(deleteTimer);
  const b = $("btnDeleteItem");
  if (b) {
    b.classList.remove("armed");
    b.textContent = "Delete";
  }
}

function deleteItem(id) {
  const idx = state.items.findIndex((x) => x.id === id);
  if (idx < 0) return;
  if (deleteArmedId !== id) {
    // First tap arms — destructive actions always need a confirm step.
    deleteArmedId = id;
    const b = $("btnDeleteItem");
    if (b) {
      b.classList.add("armed");
      b.textContent = "Tap again to delete";
    }
    toast("Tap again to delete this item");
    clearTimeout(deleteTimer);
    deleteTimer = setTimeout(disarmDelete, 5000);
    return;
  }
  clearTimeout(deleteTimer);
  // Snapshot for rollback if storage refuses the write.
  const [it] = state.items.splice(idx, 1);
  const spacesBefore = JSON.stringify(state.spaces);
  for (const sp of state.spaces) {
    if (sp && Array.isArray(sp.itemIds)) sp.itemIds = sp.itemIds.filter((x) => x !== id);
  }
  if (!saveItems()) {
    // Storage refused — restore so memory matches disk. saveItems() already
    // showed the honest "storage full" toast. Nothing is lost.
    state.items.splice(idx, 0, it);
    try { state.spaces = JSON.parse(spacesBefore); } catch { /* keep running */ }
    disarmDelete();
    return;
  }
  saveSpaces();
  disarmDelete();
  closeSheet();
  render();
  toast("Deleted");
}

async function addPhotos(fileList) {
  const files = [...(fileList || [])].filter((f) => f.type.startsWith("image/"));
  if (!files.length) {
    toast("No images in that drop");
    return;
  }
  let added = 0;
  for (const file of files) {
    let dataUrl = null;
    try {
      // Compress on intake so phone photos fit local storage. The compressor
      // returns a copy — on any failure we keep the original, never lose it.
      const shrunk = window.ScouterImage
        ? await window.ScouterImage.compressPhoto(file).catch(() => file)
        : file;
      dataUrl = await fileToDataUrl(shrunk);
    } catch {
      continue; // unreadable photo: skip it, keep the rest
    }
    const now = new Date().toISOString();
    state.items.unshift({
      id: uid(),
      createdAt: now,
      updatedAt: now,
      title: file.name.replace(/\.[^.]+$/, "") || "Scan",
      productName: null,
      quantity: 1,
      price: null,
      phase: "intake",
      staged: false,
      spaceId: null,
      barcode: null,
      channels: {},
      photos: [{ id: uid(), dataUrl, createdAt: now }],
    });
    added++;
  }
  if (!added) {
    toast("No photos could be read — nothing added");
    return;
  }
  if (!saveItems()) return; // honest toast already shown; items stay in memory
  toast(`${added} on Scouter`);
  navigate("scouter");
}

// Shrink an oversized photo data URL via the shared compressor (copy only).
// Returns the original on any failure — a photo is never destroyed to shrink it.
async function shrinkDataUrl(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return dataUrl;
  if (dataUrl.length < 400 * 1024) return dataUrl; // already small enough
  try {
    if (!window.ScouterImage) return dataUrl;
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" });
    const shrunk = await window.ScouterImage.compressPhoto(file);
    return await fileToDataUrl(shrunk);
  } catch {
    return dataUrl;
  }
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

/* Listing engine runs client-side only.
 * public/visor/listing-engine.js is byte-identical to src/listing/engine.js
 * (twin parity is asserted in test/listing-titles.test.js).
 * The server route POST /api/scouter/items/:id/listing-engine only knows
 * server-side items; HUD item ids are client-generated and never exist in
 * the server store, so that call can never resolve — it is not attempted.
 * No silent 404 fallback: one engine, one path. */
async function runEngine(id) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;
  toast("Running listing engine…");
  try {
    const mod = await import("/visor/listing-engine.js?v=2");
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
  // Settings → Defaults: auto-file into the chosen bin when staging.
  const defBin = window.HUD_settings?.get("defaultBin");
  if (!it.spaceId && (defBin === "bin1" || defBin === "bin2" || defBin === "staged")) {
    it.spaceId = defBin;
  }
  it.updatedAt = new Date().toISOString();
  saveItems();
  toast("Staged");
  closeSheet();
  render();
}

/* ---------- Identify: photo in → identity out ----------
 * One ID action (item sheet). POSTs /api/scouter/identify with the item's
 * photos, renders candidates as a pick list on low confidence, and always
 * offers manual entry. Never a silent guess, never an infinite spinner —
 * every path ends in a message, a pick list, or the manual form. */

function identifyPhotos(it) {
  return (it.photos || [])
    .map((p) => p?.dataUrl)
    .filter((u) => typeof u === "string" && u.startsWith("data:image/"));
}

/* Downscale just for the identify POST so the 2MB JSON body limit holds
 * on full-size phone photos. The stored photo is never touched. */
function identifyDownscale(dataUrl, maxDim = 1280) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        if (scale >= 1) {
          resolve(dataUrl);
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/* Client mirror of the server gate.js identityToItemPatch field mapping. */
function identifyApplyPatch(it, identity, path) {
  const name = [identity.product_name, identity.collector_number, identity.set_name, identity.finish]
    .filter(Boolean)
    .join(" ")
    .trim() || identity.product_name;
  it.title = name || it.title;
  it.productName = identity.product_name || it.productName;
  it.collectorNumber = identity.collector_number || it.collectorNumber;
  it.setName = identity.set_name || it.setName;
  it.setCode = identity.set_code || it.setCode;
  it.game = identity.game || it.game;
  it.rarity = identity.rarity || it.rarity;
  it.finish = identity.finish || it.finish;
  it.language = identity.language || it.language;
  it.condition = identity.condition || it.condition;
  it.identifyConfidence = identity.confidence || null;
  it.identifyPath = path;
  it.updatedAt = new Date().toISOString();
}

function identifyApply(id, identity, path) {
  const it = state.items.find((x) => x.id === id);
  if (!it || !identity) return false;
  identifyApplyPatch(it, identity, path);
  saveItems();
  render();
  openSheet(id);
  const host = $("identifyResults");
  if (host) {
    const name = it.productName || it.title || "item";
    host.innerHTML = `<div class="identify-head">Identified: ${escapeHtml(name)}${it.collectorNumber ? ` · ${escapeHtml(it.collectorNumber)}` : ""}${it.setName ? ` · ${escapeHtml(it.setName)}` : ""}</div>`;
  }
  return true;
}

function identifyCandidateLabel(c) {
  return (
    [c.product_name, c.collector_number, c.set_name, c.finish].filter(Boolean).join(" · ") ||
    "Unknown item"
  );
}

function identifyShowMessage(html) {
  const host = $("identifyResults");
  if (host) host.innerHTML = html;
}

function identifyShowCandidates(id, candidates, intro) {
  const host = $("identifyResults");
  if (!host) return;
  const picks = candidates.slice(0, 5);
  host.innerHTML =
    `<div class="identify-head">${escapeHtml(intro)}</div>` +
    picks
      .map(
        (c, i) =>
          `<button type="button" class="identify-pick" data-pick="${i}">` +
          `<span class="pick-name">${escapeHtml(identifyCandidateLabel(c))}</span>` +
          `<span class="pick-sub">${escapeHtml(
            [c.confidence === "high" ? "High confidence" : "Low confidence", c.source]
              .filter(Boolean)
              .join(" · ")
          )}</span></button>`
      )
      .join("") +
    `<button type="button" class="btn btn-ghost btn-sm" id="idfManualBtn">Enter manually</button>`;
  host.querySelectorAll("[data-pick]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const c = picks[Number(btn.dataset.pick)];
      if (identifyApply(id, c, "photo_search")) toast("Identity applied");
    })
  );
  $("idfManualBtn")?.addEventListener("click", () => identifyShowManualForm(id));
}

function identifyShowManualForm(id) {
  const host = $("identifyResults");
  if (!host) return;
  host.innerHTML = `
    <div class="identify-head">Enter the identity — nothing here is a guess.</div>
    <div class="identify-form">
      <label>Product name<input id="idfName" autocomplete="off" placeholder="e.g. Charizard ex" /></label>
      <label>Collector number<input id="idfNum" autocomplete="off" placeholder="e.g. 223/197" /></label>
      <label>Set name<input id="idfSet" autocomplete="off" placeholder="e.g. Obsidian Flames" /></label>
      <label>Set code<input id="idfSetCode" autocomplete="off" placeholder="e.g. OBF" /></label>
      <label>Game<input id="idfGame" autocomplete="off" placeholder="e.g. Pokemon" /></label>
      <label>Rarity<input id="idfRarity" autocomplete="off" placeholder="e.g. Double Rare" /></label>
      <label>Finish<input id="idfFinish" autocomplete="off" placeholder="e.g. Holo" /></label>
      <div class="identify-form-row">
        <button type="button" class="btn btn-amber" id="idfApply">Apply</button>
        <button type="button" class="btn btn-ghost" id="idfCancel">Back</button>
      </div>
      <div class="identify-err" id="idfErr" hidden></div>
    </div>`;
  $("idfCancel")?.addEventListener("click", () => {
    host.innerHTML = "";
  });
  $("idfApply")?.addEventListener("click", async () => {
    const btn = $("idfApply");
    btn.disabled = true;
    const err = $("idfErr");
    try {
      const res = await fetch("/api/scouter/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          forcePath: "manual",
          manual: {
            product_name: $("idfName")?.value.trim() || null,
            collector_number: $("idfNum")?.value.trim() || null,
            set_name: $("idfSet")?.value.trim() || null,
            set_code: $("idfSetCode")?.value.trim() || null,
            game: $("idfGame")?.value.trim() || null,
            rarity: $("idfRarity")?.value.trim() || null,
            finish: $("idfFinish")?.value.trim() || null,
          },
        }),
        signal: AbortSignal.timeout(30000),
      });
      const body = await res.json().catch(() => ({}));
      if (body.ok && body.identity) {
        if (identifyApply(id, body.identity, "manual")) toast("Manual identity applied");
      } else {
        err.hidden = false;
        err.textContent = body.message || "Manual identity incomplete — check the fields and try again.";
      }
    } catch {
      err.hidden = false;
      err.textContent = "Could not reach the server. Try again.";
    } finally {
      btn.disabled = false;
    }
  });
}

async function identifyFromSheet(id) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;
  const btn = $("btnIdentify");

  // Settings → Identify → Manual skips vision entirely.
  if (window.HUD_settings?.get("identifyProvider") === "manual") {
    identifyShowManualForm(id);
    return;
  }

  const photos = identifyPhotos(it);
  if (!photos.length) {
    toast("Take a photo first, then tap ID.");
    return;
  }

  if (btn) btn.disabled = true;
  identifyShowMessage(
    `<div class="identify-progress"><span class="identify-spin" aria-hidden="true"></span>Identifying from ${photos.length} photo${photos.length === 1 ? "" : "s"}…</div>`
  );
  try {
    const small = await Promise.all(photos.slice(0, 5).map((u) => identifyDownscale(u)));
    const res = await fetch("/api/scouter/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        photos: small,
        notes: it.notes || null,
        quantity: Number(it.quantity) || 1,
      }),
      signal: AbortSignal.timeout(60000),
    });
    const body = await res.json().catch(() => ({}));

    if (res.status === 503 || /isn't set up yet/i.test(String(body.message || ""))) {
      // No key / no credits: honest line, manual entry always available.
      identifyShowMessage(
        `<div class="identify-head">${escapeHtml(body.message || "Identify isn't set up yet.")}</div>` +
          `<button type="button" class="btn btn-ghost btn-sm" id="idfManualBtn">Enter manually</button>`
      );
      $("idfManualBtn")?.addEventListener("click", () => identifyShowManualForm(id));
      return;
    }

    if (body.ok && body.identity) {
      if (identifyApply(id, body.identity, body.path || "photo_search")) toast("Identified");
      return;
    }

    const candidates = Array.isArray(body.candidates) ? body.candidates : [];
    if (candidates.length) {
      // Low confidence → pick list, never a silent guess.
      identifyShowCandidates(id, candidates, body.message || "Low confidence — pick the right one.");
      return;
    }

    identifyShowMessage(
      `<div class="identify-head">${escapeHtml(body.message || "Could not identify this item. Photos kept.")}</div>` +
        `<button type="button" class="btn btn-ghost btn-sm" id="idfManualBtn">Enter manually</button>`
    );
    $("idfManualBtn")?.addEventListener("click", () => identifyShowManualForm(id));
  } catch (err) {
    const timedOut = err?.name === "AbortError" || err?.name === "TimeoutError";
    identifyShowMessage(
      `<div class="identify-head">${escapeHtml(
        timedOut
          ? "Identify timed out after 60 seconds. Photos kept."
          : "Identify failed to reach the server. Photos kept."
      )}</div>` +
        `<button type="button" class="btn btn-ghost btn-sm" id="idfManualBtn">Enter manually</button>`
    );
    $("idfManualBtn")?.addEventListener("click", () => identifyShowManualForm(id));
  } finally {
    if (btn) btn.disabled = false;
  }
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
          // Downscale oversized server photos before they hit local storage.
          for (const p of mapped.photos) {
            p.dataUrl = await shrinkDataUrl(p.dataUrl);
          }
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
  renderConstellation();
  renderSpaces();
  renderChannels();
  window.HUD_collection?.refresh();
  window.HUD_settings?.render();
  window.HUD_invtools?.refresh();
}

function bind() {
  document.querySelectorAll(".nav-tab").forEach((tab) =>
    tab.addEventListener("click", () => navigate(tab.dataset.view))
  );
  bindConstellationSwitch();
  bindRoadDragDrop();

  $("btnSnap")?.addEventListener("click", () => $("inputSnap")?.click());
  $("btnGallery")?.addEventListener("click", () => $("inputGallery")?.click());
  $("btnBarcode")?.addEventListener("click", openBarcode);
  $("inputSnap")?.addEventListener("change", (e) => {
    addPhotos(e.target.files);
    e.target.value = "";
  });
  $("inputGallery")?.addEventListener("change", (e) => {
    addPhotos(e.target.files);
    e.target.value = "";
  });

  $("btnCloseSheet")?.addEventListener("click", closeSheet);
  $("btnStage")?.addEventListener("click", () => stageItem(state.sheetItemId));
  $("btnIdentify")?.addEventListener("click", () => identifyFromSheet(state.sheetItemId));
  $("btnRunEngine")?.addEventListener("click", () => runEngine(state.sheetItemId));
  $("btnLoadSold")?.addEventListener("click", () => loadSoldPrice(state.sheetItemId));
  $("btnAssignBin1")?.addEventListener("click", () => assignSpace(state.sheetItemId, "bin1"));
  $("btnAssignBin2")?.addEventListener("click", () => assignSpace(state.sheetItemId, "bin2"));
  $("btnAssignStaged")?.addEventListener("click", () => assignSpace(state.sheetItemId, "staged"));
  $("btnDeleteItem")?.addEventListener("click", () => deleteItem(state.sheetItemId));

  $("btnCloseBarcode")?.addEventListener("click", closeBarcode);
  $("btnBarcodeAdd")?.addEventListener("click", () => addBarcode($("barcodeInput")?.value));
  $("barcodeInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addBarcode(e.target.value);
  });

  $("btnEbaySync")?.addEventListener("click", syncEbay);
  $("btnLoadAllSold")?.addEventListener("click", loadAllSold);
  $("btnLoadAllSold2")?.addEventListener("click", loadAllSold);
  $("btnOpenMap")?.addEventListener("click", () => navigate("constellation"));
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

  // Feature modules (loaded as classic scripts before this module)
  window.HUD_carousel && null; // carousel needs no init; called from openSheet
  window.HUD_spaces?.init();
  window.HUD_csv?.init();
  window.HUD_collection?.init();
  window.HUD_settings?.init();
  window.HUD_ebay?.init();
  window.HUD_fulfillment?.init();
  window.HUD_invtools?.init();

  // Bridge: expose app internals so feature modules can use live state
  // instead of localStorage fallbacks. Read-only for most; mutations go
  // through saveItems()/render().
  window.HUDcore = {
    state,
    toast,
    $,
    escapeHtml,
    money,
    uid,
    spaceName,
    openSheet,
    closeSheet,
    saveItems,
    saveSpaces,
    render,
    navigate,
    stageItem,
    assignSpace,
    syncEbay,
    seedDemoItems,
  };
}

async function boot() {
  state.items = loadItems();
  state.spaces = loadSpaces();
  saveSpaces();
  bind();
  const start = location.hash.replace(/^#\/?/, "") || "command";
  navigate(VIEWS.includes(start) ? start : "command");
  await probeEbay();
  // Settings → eBay auto-sync: background pull on launch (opt-in, default off).
  try {
    if (window.HUD_settings?.get("ebayAutoSync")) syncEbay();
  } catch {}
}

boot();
