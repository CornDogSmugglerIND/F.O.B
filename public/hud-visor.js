const LS_KEY = "scouter-items-v1";

const CATEGORIES = [
  { value: "pokemon_sealed", label: "Pokemon Sealed" },
  { value: "graded_slabs", label: "Graded Slabs" },
  { value: "raw_cards", label: "Raw Cards" },
  { value: "sports_cards", label: "Sports Cards" },
  { value: "other", label: "Other" },
];

const catMap = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));

/** Category hub colors — amber-gold only (no cyan/blue). */
const CAT_HUBS = {
  pokemon_sealed: { core: "#f5c518", hi: "#ffe566", sub: "Sealed" },
  graded_slabs: { core: "#d4a017", hi: "#f5c518", sub: "Graded" },
  raw_cards: { core: "#F0C020", hi: "#FFE0A0", sub: "Raw" },
  sports_cards: { core: "#D4A017", hi: "#f5c518", sub: "Sports" },
  other: { core: "#C99612", hi: "#F0C020", sub: "Other" },
};

const MAX_PHOTOS = 8;

const VIEWS = ["command", "intake", "scan", "list", "systems"];

const VIEW_COPY = {
  command: {
    eyebrow: "Coalition H.U.D",
    title: "Overview",
    sub: "Dark tactical VISOR. Amber-gold only. Scouter is the phone intake tab.",
  },
  intake: {
    eyebrow: "H.U.D · Scouter",
    title: "Sift",
    sub: "Everything currently in Scouter. Review, correct, stage. Not a listing screen.",
  },
  scan: {
    eyebrow: "H.U.D · Scouter",
    title: "Scouter",
    sub: "Handheld intake: take or dump photos → identify → sift → stage. Does not list.",
  },
  list: {
    eyebrow: "H.U.D · Staged",
    title: "Staged",
    sub: "Batch ready for desktop pipeline. Listing engine runs on desktop — not here.",
  },
  systems: {
    eyebrow: "H.U.D · Systems",
    title: "Systems",
    sub: "Feature checks, backup, wipe. Shared local store with classic Scouter.",
  },
};

const state = {
  view: "scan",
  items: [],
  draftPhotos: [],
  qty: 1,
  category: "other",
  title: "",
  barcode: "",
  scanner: null,
  scanLoop: null,
  html5Scanner: null,
  filterQuery: "",
};

const $ = (id) => document.getElementById(id);

const els = {
  statCount: $("statCount"),
  viewCommand: $("viewCommand"),
  viewIntake: $("viewIntake"),
  viewScan: $("viewScan"),
  viewList: $("viewList"),
  viewSystems: $("viewSystems"),
  photoGrid: $("photoGrid"),
  photoDrop: $("photoDrop"),
  photoCountLbl: $("photoCountLbl"),
  pageTitle: $("pageTitle"),
  btnCamera: $("btnCamera"),
  btnShutter: $("btnShutter"),
  btnGallery: $("btnGallery"),
  viewfinderIdle: $("viewfinderIdle"),
  viewfinderPreview: $("viewfinderPreview"),
  inputCamera: $("inputCamera"),
  inputGallery: $("inputGallery"),
  identifyStatus: $("identifyStatus"),
  barcodeInput: $("barcodeInput"),
  manualRow: $("manualRow"),
  manualTitle: $("manualTitle"),
  btnManual: $("btnManual"),
  btnManualOk: $("btnManualOk"),
  btnScan: $("btnScan"),
  btnLookup: $("btnLookup"),
  qtyVal: $("qtyVal"),
  qtyMinus: $("qtyMinus"),
  qtyPlus: $("qtyPlus"),
  categoryChips: $("categoryChips"),
  fieldNotes: $("fieldNotes"),
  stagedFlag: $("stagedFlag"),
  identifyPhaseLbl: $("identifyPhaseLbl"),
  identifyResult: $("identifyResult"),
  identifyResultTitle: $("identifyResultTitle"),
  identifyResultMeta: $("identifyResultMeta"),
  btnExportStaged: $("btnExportStaged"),
  handoffNote: $("handoffNote"),
  btnSave: $("btnSave"),
  saveBar: $("saveBar"),
  collectionRoot: $("collectionRoot"),
  cmdRail: $("cmdRail"),
  listRail: $("listRail"),
  cmdItems: $("cmdItems"),
  cmdPhotos: $("cmdPhotos"),
  cmdReady: $("cmdReady"),
  listReadyLbl: $("listReadyLbl"),
  systemsNote: $("systemsNote"),
  scanOverlay: $("scanOverlay"),
  scanReader: $("scanReader"),
  scanVideo: $("scanVideo"),
  btnScanClose: $("btnScanClose"),
  toast: $("toast"),
  dragOverlay: $("dragOverlay"),
  intakeBar: $("intakeBar"),
  railToolbar: $("railToolbar"),
  railFilter: $("railFilter"),
  btnNewScan: $("btnNewScan"),
  btnExport: $("btnExport"),
  btnImport: $("btnImport"),
  btnWipe: $("btnWipe"),
  importFile: $("importFile"),
  pageHero: $("pageHero"),
  pageEyebrow: $("pageEyebrow"),
  pageSub: $("pageSub"),
};

function showToast(msg, type = "ok") {
  els.toast.textContent = msg;
  els.toast.className = `toast show ${type}`;
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => els.toast.classList.remove("show"), 3200);
}

function setStatus(msg, kind = "") {
  els.identifyStatus.textContent = msg;
  els.identifyStatus.className = `status-strip${kind ? ` ${kind}` : ""}`;
}

function loadLocalItems() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const items = raw ? JSON.parse(raw) : [];
    // Migrate legacy readyToList → staged (Scouter stages; desktop lists)
    return items.map((item) => {
      if (typeof item.staged === "boolean") return item;
      const { readyToList, ...rest } = item;
      return { ...rest, staged: Boolean(readyToList) };
    });
  } catch {
    return [];
  }
}

function saveLocalItems(items) {
  localStorage.setItem(LS_KEY, JSON.stringify(items));
}

function photoSrc(photo) {
  return photo?.dataUrl || photo?.url || "";
}

async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new Error("Network unavailable");
  }

  if (!res.ok) {
    const text = await res.text();
    let body = {};
    try {
      body = JSON.parse(text);
    } catch {
      /* plain text */
    }
    throw new Error(body.error || text.slice(0, 100) || `Request failed (${res.status})`);
  }

  if (res.status === 204) return null;
  return res.json();
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function updateSaveState() {
  const canSave =
    state.draftPhotos.length > 0 ||
    state.barcode.trim().length > 0 ||
    state.title.trim().length > 0;
  els.btnSave.disabled = !canSave;
  if (!els.btnSave.disabled) {
    els.btnSave.textContent = els.stagedFlag?.checked ? "Stage item" : "Save item";
  } else {
    els.btnSave.textContent = "Stage item";
  }
}

function setIdentifyPhase(phase, detail = "") {
  const labels = {
    idle: "IDLE",
    running: "RUNNING",
    ok: "MATCH",
    fail: "NO MATCH",
    manual: "MANUAL",
    setup: "SETUP",
  };
  if (els.identifyPhaseLbl) els.identifyPhaseLbl.textContent = labels[phase] || phase;
  if (!els.identifyResult) return;
  if (phase === "idle") {
    els.identifyResult.classList.add("hidden");
    return;
  }
  els.identifyResult.classList.remove("hidden");
  if (els.identifyResultTitle) {
    els.identifyResultTitle.textContent = state.title || detail || "—";
  }
  if (els.identifyResultMeta) {
    const bits = [
      state.identifyPath ? `path ${state.identifyPath}` : null,
      state.barcode ? `UPC ${state.barcode}` : null,
      phase === "ok" ? "gate ok" : null,
      phase === "manual" ? "manual title" : null,
      phase === "fail" ? "needs pick / manual" : null,
      phase === "setup" ? "key missing" : null,
      phase === "running" ? "working…" : null,
    ].filter(Boolean);
    els.identifyResultMeta.textContent = bits.join(" · ");
  }
}

function renderCandidates(candidates = []) {
  const box = els.identifyCandidates || $("identifyCandidates");
  if (!box) return;
  if (!candidates.length) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  box.classList.remove("hidden");
  box.innerHTML = candidates
    .slice(0, 5)
    .map((c, i) => {
      const label = [c.product_name, c.collector_number, c.set_name, c.finish]
        .filter(Boolean)
        .join(" · ");
      return `<button type="button" class="identify-candidate" data-cand="${i}">${escapeHtml(label || "Candidate")}</button>`;
    })
    .join("");
  box.querySelectorAll("[data-cand]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cand = candidates[Number(btn.dataset.cand)];
      if (!cand) return;
      applyIdentity(cand, "manual");
      setIdentifyPhase("ok", cand.product_name);
      setStatus(`Picked: ${cand.product_name}`, "ok");
      updateSaveState();
    });
  });
}

function applyIdentity(identity, path) {
  if (!identity) return;
  state.title =
    [identity.product_name, identity.collector_number, identity.set_name, identity.finish]
      .filter(Boolean)
      .join(" ")
      .trim() || identity.product_name || state.title;
  state.identifyPath = path || identity.source || null;
  state.identity = identity;
  if (els.manualTitle && identity.product_name) els.manualTitle.value = state.title;
}

/**
 * Photo-first Identify (Command LISTING-ENGINE §1 / #55).
 * Photos → /api/scouter/identify. Barcode is a shortcut. Manual always available.
 * Never hang on a spinner — every path resolves with a message.
 */
async function runIdentify() {
  const photos = state.draftPhotos.map((p) => p.dataUrl).filter(Boolean);
  const barcode = (els.barcodeInput?.value || state.barcode || "").trim();
  const manualTitle = (els.manualTitle?.value || "").trim();

  if (!photos.length && !barcode && !manualTitle) {
    setIdentifyPhase("fail", "Nothing to ID");
    setStatus("Drop/take photos first (primary), or scan a UPC, or set Manual.", "err");
    showToast("Need photos, barcode, or manual title", "err");
    return;
  }

  setIdentifyPhase("running", "Working…");
  setStatus("Identify running — photo / catalog / UPC…", "busy");
  els.btnLookup.disabled = true;
  els.btnLookup.textContent = "…";
  renderCandidates([]);

  try {
    // Optional: if no barcode yet, try reading one from photos (shortcut only)
    if (!barcode && photos.length) {
      const fromPhoto = await scanBarcodeFromPhotos();
      if (fromPhoto) {
        els.barcodeInput.value = fromPhoto;
        state.barcode = fromPhoto.trim();
      }
    }

    const payload = {
      barcode: (els.barcodeInput?.value || "").trim() || null,
      photos,
      notes: (els.fieldNotes?.value || "").trim() || null,
      category: state.category,
      quantity: state.qty,
      forcePath: photos.length ? undefined : barcode ? "barcode" : undefined,
    };
    if (manualTitle && !photos.length && !barcode) {
      payload.forcePath = "manual";
      payload.manual = {
        product_name: manualTitle,
        language: "English",
        condition: "NM",
        quantity: state.qty,
      };
    }

    const res = await fetch("/api/scouter/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let result;
    try {
      result = await res.json();
    } catch {
      throw new Error(`Identify returned non-JSON (${res.status})`);
    }
    // 422 / 503 still carry structured identify payloads — do not treat as hard crash
    if (!result || typeof result !== "object") {
      throw new Error(`Identify failed (${res.status})`);
    }

    state.identifyPath = result.path;
    if (result.identity) applyIdentity(result.identity, result.path);
    renderCandidates(result.candidates || []);

    if (result.ok && result.identity?.product_name) {
      setIdentifyPhase("ok", result.identity.product_name);
      setStatus(result.message || `Identified: ${result.identity.product_name}`, "ok");
      showToast("Identify match");
    } else if (result.setupTask || ((result.missingKeys || []).length && payload.photos?.length)) {
      setIdentifyPhase("setup", result.message || "Setup needed");
      setStatus(result.setupTask || result.message || "Identify setup needed", "err");
      showToast("Identify needs API key setup", "err");
      els.manualRow?.classList.remove("hidden");
    } else if ((result.candidates || []).length) {
      setIdentifyPhase("fail", result.message || "Pick a candidate");
      setStatus(result.message || "Multiple / low-confidence — pick one or Manual.", "err");
      showToast("Pick a candidate", "err");
      els.manualRow?.classList.remove("hidden");
    } else {
      setIdentifyPhase("fail", result.message || "No match");
      setStatus(result.message || "No match — set Manual. Photos kept.", "err");
      showToast("No match — manual title", "err");
      els.manualRow?.classList.remove("hidden");
    }
    updateSaveState();
  } catch (err) {
    setIdentifyPhase("fail", "Identify failed");
    setStatus(`Identify failed: ${err.message || "network"}. Photos kept. Use Manual.`, "err");
    els.manualRow?.classList.remove("hidden");
    showToast("Identify failed", "err");
  } finally {
    els.btnLookup.disabled = false;
    els.btnLookup.textContent = "ID";
  }
}

function setCategory(value) {
  state.category = value;
  els.categoryChips.querySelectorAll(".m-chip").forEach((chip) => {
    chip.classList.toggle("m-chip-on", chip.dataset.value === value);
  });
}

function updateViewfinder() {
  const last = state.draftPhotos[state.draftPhotos.length - 1];
  if (els.viewfinderPreview && els.viewfinderIdle) {
    if (last?.dataUrl) {
      els.viewfinderPreview.src = last.dataUrl;
      els.viewfinderPreview.classList.remove("hidden");
      els.viewfinderIdle.classList.add("hidden");
    } else {
      els.viewfinderPreview.removeAttribute("src");
      els.viewfinderPreview.classList.add("hidden");
      els.viewfinderIdle.classList.remove("hidden");
    }
  }
}

function renderPhotoGrid() {
  if (els.photoCountLbl) {
    els.photoCountLbl.textContent = `${state.draftPhotos.length} photo${state.draftPhotos.length === 1 ? "" : "s"}`;
  }
  if (!els.photoGrid) return;
  els.photoGrid.innerHTML = state.draftPhotos
    .map(
      (p, i) => `
      <div class="photo-thumb">
        <img src="${p.dataUrl}" alt="" />
        <button type="button" data-rm="${i}" aria-label="Remove">×</button>
      </div>`,
    )
    .join("");

  els.photoGrid.querySelectorAll("[data-rm]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      removePhoto(Number(btn.dataset.rm));
    });
  });
  updateViewfinder();
}

function removePhoto(idx) {
  state.draftPhotos.splice(idx, 1);
  renderPhotoGrid();
  updateSaveState();
}

async function addFiles(fileList) {
  const isImage = window.ScouterImage?.isImageFile ?? ((f) => f.type?.startsWith("image/"));
  const incoming = [...(fileList ?? [])].filter(isImage);
  if (!incoming.length) {
    showToast("No images found — try JPEG or HEIC", "err");
    return;
  }

  const room = MAX_PHOTOS - state.draftPhotos.length;
  if (room <= 0) {
    showToast(`Max ${MAX_PHOTOS} photos per item`, "err");
    return;
  }

  const batch = incoming.slice(0, room);
  setStatus("Processing photos…", "busy");

  try {
    const compressed = await window.ScouterImage.compressPhotos(batch);
    for (const file of compressed) {
      const dataUrl = await window.ScouterImage.fileToDataUrl(file);
      state.draftPhotos.push({ dataUrl, file });
    }
    renderPhotoGrid();
    updateSaveState();
    setStatus(`${state.draftPhotos.length} photo(s) ready on this device`, "ok");
    showToast("Photos added");
  } catch (e) {
    setStatus(e.message, "err");
    showToast(e.message, "err");
  }
}

function filteredItems() {
  const q = state.filterQuery.trim().toLowerCase();
  if (!q) return state.items;
  return state.items.filter(
    (i) =>
      (i.title || "").toLowerCase().includes(q) ||
      (i.barcode || "").toLowerCase().includes(q),
  );
}

function holoCardHtml(item, hub) {
  const src = photoSrc(item.photos[0]);
  const title = escapeHtml(item.title || "Untitled");
  const sub = [`×${item.quantity}`, item.barcode].filter(Boolean).join(" · ");
  const face = src
    ? `<img src="${src}" alt="" />`
    : `<div class="holo-card-empty">NO IMG</div>`;
  const badge = item.staged
    ? `<span class="holo-card-sub" style="color:var(--gold-hi)">STAGED</span>`
    : `<span class="holo-card-sub" style="color:${hub.hi}">${escapeHtml(sub)}</span>`;
  return `
    <div class="holo-card-wrap">
      <button type="button" class="holo-card" data-item="${item.id}" style="box-shadow:inset 0 1px 0 rgba(255,255,255,0.22), inset 0 0 0 1px ${hub.core}55, 0 18px 40px -16px rgba(0,0,0,0.95)">
        ${face}
        <span class="holo-card-plate">
          <span class="holo-card-title">${title}</span>
          ${badge}
        </span>
      </button>
    </div>`;
}

function renderCollection() {
  const count = state.items.length;
  els.statCount.textContent = String(count).padStart(2, "0");

  const filtered = filteredItems();

  if (!count) {
    els.collectionRoot.innerHTML = `
      <div class="coll-empty-state">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#f5c518" stroke-width="1.4" style="opacity:0.7;filter:drop-shadow(0 0 14px #ffe566)"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
        <div class="v-label" style="margin-top:16px;font-size:12px">Intake empty</div>
        <p>Scan a barcode or drop a photo to bring inventory in.</p>
      </div>`;
    return;
  }

  if (!filtered.length) {
    els.collectionRoot.innerHTML = `
      <div class="coll-empty-state">
        <div class="v-label" style="font-size:12px">No matches</div>
        <p>Try a different filter term.</p>
      </div>`;
    return;
  }

  els.collectionRoot.innerHTML = "";

  for (const cat of CATEGORIES) {
    const items = filtered.filter((i) => i.category === cat.value);
    if (!items.length) continue;

    const hub = CAT_HUBS[cat.value] || CAT_HUBS.other;
    const section = document.createElement("section");
    section.className = "hub-section v-panel v-cut panel-block";
    section.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.14), inset 0 0 40px -20px ${hub.hi}, 0 18px 44px -22px rgba(0,0,0,0.9)`;

    section.innerHTML = `
      <div class="hub-head">
        <div class="hub-icon" style="background:radial-gradient(circle at 32% 26%, rgba(255,255,255,0.2), ${hub.hi}22 32%, rgba(0,0,0,0.62) 72%);box-shadow:inset 0 0 0 1.5px ${hub.core}, 0 0 24px -8px ${hub.core}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${hub.hi}" stroke-width="1.6"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
        </div>
        <div class="hub-meta">
          <div class="v-label" style="font-size:9px">${hub.sub.toUpperCase()}</div>
          <div class="v-title" style="font-size:16px;line-height:1.1;margin-top:2px">${cat.label}</div>
        </div>
        <div class="hub-count v-readout" style="color:${hub.hi};text-shadow:0 0 16px ${hub.core}">${String(items.length).padStart(2, "0")}</div>
      </div>
      <div class="holo-scroll no-scrollbar v-stage"></div>`;

    const scroll = section.querySelector(".holo-scroll");
    scroll.innerHTML = items.map((it) => holoCardHtml(it, hub)).join("");

    bindHoloClicks(scroll);
    els.collectionRoot.appendChild(section);
  }
}

function loadItems() {
  state.items = loadLocalItems().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  els.statCount.textContent = pad2(state.items.length);
  if (state.view === "intake") renderCollection();
  if (state.view === "command" || state.view === "systems") renderCommand();
  if (state.view === "list") renderListRail();
}

function deleteItem(id) {
  state.items = state.items.filter((i) => i.id !== id);
  saveLocalItems(state.items);
  loadItems();
  showToast("Deleted");
}

function resetCapture() {
  state.draftPhotos = [];
  state.qty = 1;
  state.category = "other";
  state.title = "";
  state.barcode = "";
  els.qtyVal.textContent = "1";
  if (els.fieldNotes) els.fieldNotes.value = "";
  els.barcodeInput.value = "";
  els.manualTitle.value = "";
  if (els.stagedFlag) els.stagedFlag.checked = true;
  setCategory("other");
  renderPhotoGrid();
  setIdentifyPhase("idle");
  setStatus("Point camera · scan barcode · add item");
  updateSaveState();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function renderCommand() {
  const photoTotal = state.items.reduce((n, i) => n + (i.photos?.length || 0), 0);
  const staged = state.items.filter((i) => i.staged).length;
  els.cmdItems.textContent = pad2(state.items.length);
  els.cmdPhotos.textContent = pad2(photoTotal);
  els.cmdReady.textContent = pad2(staged);
  els.statCount.textContent = pad2(state.items.length);
  if (els.systemsNote) {
    els.systemsNote.textContent = `${state.items.length} local records · shared store (${LS_KEY})`;
  }

  const recent = state.items.slice(0, 10);
  if (!recent.length) {
    els.cmdRail.innerHTML = "";
    return;
  }
  els.cmdRail.innerHTML = recent
    .map((it) => holoCardHtml(it, CAT_HUBS[it.category] || CAT_HUBS.other))
    .join("");
  bindHoloClicks(els.cmdRail);
}

function renderListRail() {
  const staged = state.items.filter((i) => i.staged);
  els.listReadyLbl.textContent = pad2(staged.length);
  if (els.handoffNote) {
    els.handoffNote.textContent = staged.length
      ? `${staged.length} staged — export batch for desktop (Batches / Inventory)`
      : "No staged items yet — stage from Scouter or Sift";
  }
  if (els.btnExportStaged) els.btnExportStaged.disabled = staged.length === 0;
  if (!staged.length) {
    els.listRail.innerHTML = "";
    return;
  }
  els.listRail.innerHTML = staged
    .map((it) => holoCardHtml(it, CAT_HUBS[it.category] || CAT_HUBS.other))
    .join("");
  bindHoloClicks(els.listRail);
}

function exportStagedBatch() {
  const staged = loadLocalItems().filter((i) => i.staged);
  if (!staged.length) {
    showToast("Nothing staged to export", "err");
    return;
  }
  const payload = {
    app: "coalition-hud-scouter",
    kind: "staged-batch-handoff",
    version: 1,
    exportedAt: new Date().toISOString(),
    handoff: {
      from: "scouter",
      to: "desktop-pipeline",
      icloudFolders: ["1.INTAKE", "Batches", "Inventory"],
      note: "Staged inventory only. Listing engine runs on desktop.",
    },
    count: staged.length,
    items: staged,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  a.href = url;
  a.download = `coalition-staged-batch-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${staged.length} staged for desktop`);
  if (els.handoffNote) {
    els.handoffNote.textContent = `Last export: ${staged.length} items · ${stamp}`;
  }
}

function setItemStaged(id, staged) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  item.staged = Boolean(staged);
  item.updatedAt = new Date().toISOString();
  saveLocalItems(state.items);
  loadItems();
  showToast(item.staged ? "Staged for desktop" : "Unstaged");
}

function bindHoloClicks(root) {
  root.querySelectorAll("[data-item]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = state.items.find((i) => i.id === btn.dataset.item);
      if (!item) return;
      const title = item.title || "Untitled";
      const meta = [`Qty ${item.quantity}`, item.barcode, item.staged ? "Staged" : "Not staged"]
        .filter(Boolean)
        .join(" · ");
      const nextStaged = !item.staged;
      if (
        confirm(
          `${title}\n${meta}\n\n${nextStaged ? "Stage for desktop pipeline?" : "Unstage this item?"}\n\nCancel = delete options`,
        )
      ) {
        setItemStaged(item.id, nextStaged);
      } else if (confirm(`Delete ${title} from this phone?`)) {
        deleteItem(item.id);
      }
    });
  });
}

async function lookupBarcode(code) {
  const trimmed = code.trim();
  if (!trimmed) {
    showToast("Scan or enter a barcode first", "err");
    setIdentifyPhase("fail", "No barcode");
    setStatus("Need a barcode or manual title to identify", "err");
    return;
  }

  state.barcode = trimmed;
  els.barcodeInput.value = trimmed;
  setIdentifyPhase("running");
  setStatus("Identify running — watching catalog…", "busy");
  els.btnLookup.disabled = true;
  els.btnLookup.textContent = "Running…";

  try {
    const result = await api(`/api/scouter/barcode/${encodeURIComponent(trimmed)}`);
    if (result.found && result.product?.title) {
      state.title = result.product.title;
      setIdentifyPhase("ok");
      setStatus(`Identified: ${result.product.title}`, "ok");
      showToast("Identify match");
    } else {
      setIdentifyPhase("fail");
      setStatus("No catalog match — set a title manually", "err");
      els.manualRow.classList.remove("hidden");
      showToast("No match — manual title", "err");
    }
    updateSaveState();
  } catch {
    setIdentifyPhase("fail");
    setStatus("Identify offline — set a title manually", "err");
    els.manualRow.classList.remove("hidden");
  } finally {
    els.btnLookup.disabled = false;
    els.btnLookup.textContent = "ID";
  }
}

async function saveCapture() {
  if (els.btnSave.disabled) return;

  els.btnSave.disabled = true;
  els.btnSave.textContent = "Committing…";

  try {
    const now = new Date().toISOString();
    const item = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      title: state.title.trim() || null,
      barcode: state.barcode.trim() || null,
      quantity: state.qty,
      category: state.category,
      notes: (els.fieldNotes?.value || "").trim() || null,
      staged: els.stagedFlag ? Boolean(els.stagedFlag.checked) : true,
      photos: state.draftPhotos.map((p) => ({
        id: crypto.randomUUID(),
        dataUrl: p.dataUrl,
        url: p.dataUrl,
        createdAt: now,
      })),
    };

    state.items.unshift(item);
    saveLocalItems(state.items);

    // Best-effort server sync (barcode identify + backup); never block local save
    try {
      let remote = (
        await api("/api/scouter/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: item.title,
            barcode: item.barcode,
            quantity: item.quantity,
            category: item.category,
            notes: item.notes,
            staged: item.staged,
          }),
        })
      ).item;

      if (item.barcode) {
        remote = (
          await api(`/api/scouter/items/${remote.id}/identify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ barcode: item.barcode, title: item.title }),
          })
        ).item;
        if (remote.title) item.title = remote.title;
      }

      for (const photo of item.photos) {
        await api(`/api/scouter/items/${remote.id}/photos/data`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: photo.dataUrl }),
        });
      }
    } catch {
      /* local save already succeeded */
    }

    loadItems();
    resetCapture();
    navigate("intake");
    showToast(item.staged ? "Staged on rail" : "Saved to rail");
  } catch (e) {
    showToast(e.message, "err");
    setStatus(e.message, "err");
  } finally {
    els.btnSave.disabled = false;
    els.btnSave.textContent = "Add to rail";
    updateSaveState();
  }
}

function navigate(view) {
  let show = VIEWS.includes(view) ? view : "scan";
  if (show === "command" || show === "systems") show = show === "command" ? "scan" : "list";
  state.view = show;

  const map = {
    command: els.viewCommand,
    intake: els.viewIntake,
    scan: els.viewScan,
    list: els.viewList,
    systems: els.viewSystems,
  };
  Object.entries(map).forEach(([key, el]) => {
    el?.classList.toggle("active", key === show);
  });

  const copy = VIEW_COPY[show] || VIEW_COPY.scan;
  if (els.pageEyebrow) els.pageEyebrow.textContent = copy.eyebrow;
  if (els.pageTitle) els.pageTitle.textContent = copy.title;
  if (els.pageSub) els.pageSub.textContent = copy.sub;
  els.pageHero?.classList.add("hidden");
  els.intakeBar?.classList.add("hidden");
  els.saveBar?.classList.add("hidden");

  if (show !== "scan") stopScanner();

  if (show === "intake") renderCollection();
  if (show === "list") renderListRail();
  if (show === "scan") renderCommand();

  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === show);
  });

  if (location.hash.replace("#", "") !== show) {
    history.replaceState(null, "", `#${show}`);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function exportInventory() {
  const items = loadLocalItems();
  const payload = {
    app: "coalition-hud-scouter",
    version: 1,
    exportedAt: new Date().toISOString(),
    items,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `coalition-intake-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${items.length} items`);
}

function importInventoryFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || ""));
      const incoming = Array.isArray(parsed) ? parsed : parsed.items;
      if (!Array.isArray(incoming)) throw new Error("Invalid backup file");
      const existing = loadLocalItems();
      const byId = new Map(existing.map((it) => [it.id, it]));
      let added = 0;
      for (const it of incoming) {
        if (!it || !it.id) continue;
        if (!byId.has(it.id)) {
          byId.set(it.id, it);
          added += 1;
        }
      }
      const merged = [...byId.values()];
      saveLocalItems(merged);
      loadItems();
      renderCollection();
      showToast(`Imported ${added} new · ${merged.length} total`);
    } catch (e) {
      showToast(e.message || "Import failed", "err");
    }
  };
  reader.onerror = () => showToast("Could not read file", "err");
  reader.readAsText(file);
}

async function stopScanner() {
  if (state.scanLoop) {
    cancelAnimationFrame(state.scanLoop);
    state.scanLoop = null;
  }
  if (state.scanner) {
    state.scanner.getTracks().forEach((t) => t.stop());
    state.scanner = null;
  }
  if (state.html5Scanner) {
    try {
      await state.html5Scanner.stop();
      await state.html5Scanner.clear();
    } catch {
      /* already stopped */
    }
    state.html5Scanner = null;
  }
  els.scanReader.innerHTML = "";
  els.scanOverlay.classList.remove("open");
  els.scanVideo.srcObject = null;
  els.scanVideo.hidden = true;
}

function html5BarcodeFormats() {
  if (!window.Html5QrcodeSupportedFormats) return undefined;
  const F = Html5QrcodeSupportedFormats;
  return [F.UPC_A, F.UPC_E, F.EAN_13, F.EAN_8, F.CODE_128];
}

async function onBarcodeScanned(code) {
  await stopScanner();
  els.barcodeInput.value = code;
  state.barcode = code.trim();
  updateSaveState();
  await lookupBarcode(code);
  showToast(`Barcode: ${code}`);
}

async function startHtml5Scanner() {
  if (!window.Html5Qrcode) {
    throw new Error("Scanner library missing");
  }

  els.scanVideo.hidden = true;
  els.scanReader.innerHTML = "";
  els.scanOverlay.classList.add("open");
  setStatus("Camera open — point at barcode", "busy");

  state.html5Scanner = new Html5Qrcode("scanReader", {
    formatsToSupport: html5BarcodeFormats(),
    verbose: false,
  });

  await state.html5Scanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 280, height: 150 } },
    (text) => onBarcodeScanned(text),
    () => {},
  );
}

async function startNativeScanner() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false,
  });
  els.scanReader.innerHTML = "";
  els.scanVideo.hidden = false;
  els.scanVideo.srcObject = stream;
  els.scanOverlay.classList.add("open");
  state.scanner = stream;
  setStatus("Camera open — point at barcode", "busy");

  const detector = new BarcodeDetector({
    formats: ["upc_a", "upc_e", "ean_13", "ean_8", "code_128"],
  });

  const tick = async () => {
    if (!state.scanner) return;
    try {
      const codes = await detector.detect(els.scanVideo);
      if (codes.length) {
        await onBarcodeScanned(codes[0].rawValue);
        return;
      }
    } catch {
      /* frame miss */
    }
    state.scanLoop = requestAnimationFrame(tick);
  };
  state.scanLoop = requestAnimationFrame(tick);
}

/** Try to read a barcode from photos already added (works everywhere). */
async function scanBarcodeFromPhotos() {
  if (!state.draftPhotos.length || !window.Html5Qrcode) return null;

  const probe = new Html5Qrcode(/* element id not needed for scanFile */ "scanReader");
  for (const photo of state.draftPhotos) {
    if (!photo.file) continue;
    try {
      const text = await probe.scanFile(photo.file, false);
      if (text) return text;
    } catch {
      /* try next photo */
    }
  }
  return null;
}

async function startScanner() {
  try {
    if ("BarcodeDetector" in window) {
      await startNativeScanner();
      return;
    }
    await startHtml5Scanner();
  } catch (err) {
    await stopScanner();

    const fromPhoto = await scanBarcodeFromPhotos();
    if (fromPhoto) {
      els.barcodeInput.value = fromPhoto;
      state.barcode = fromPhoto.trim();
      updateSaveState();
      await lookupBarcode(fromPhoto);
      showToast(`Barcode from photo: ${fromPhoto}`);
      return;
    }

    showToast("Camera scan unavailable — type barcode below", "err");
    setStatus("Type the barcode number in the field above, or tap Lookup", "err");
    els.barcodeInput.focus();
  }
}

function initCategories() {
  els.categoryChips.innerHTML = CATEGORIES.map(
    (c) =>
      `<button type="button" class="m-chip${c.value === state.category ? " m-chip-on" : ""}" data-value="${c.value}">${c.label}</button>`,
  ).join("");
  els.categoryChips.querySelectorAll(".m-chip").forEach((chip) => {
    chip.addEventListener("click", () => setCategory(chip.dataset.value));
  });
}

function bindDragOverlay() {
  let dragDepth = 0;

  const show = () => els.dragOverlay?.classList.add("show");
  const hide = () => {
    dragDepth = 0;
    els.dragOverlay?.classList.remove("show");
    els.photoDrop?.classList.remove("drag");
  };

  document.addEventListener("dragenter", (e) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    dragDepth += 1;
    show();
  });

  document.addEventListener("dragover", (e) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    els.photoDrop?.classList.add("drag");
  });

  document.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) hide();
  });

  document.addEventListener("drop", (e) => {
    if (!e.dataTransfer?.files?.length) return;
    hide();
  });
}

function bindEvents() {
  const openCamera = () => els.inputCamera.click();
  els.btnCamera?.addEventListener("click", (e) => {
    if (e.target.closest("[data-rm]")) return;
    openCamera();
  });
  els.btnShutter?.addEventListener("click", openCamera);
  els.btnGallery?.addEventListener("click", () => els.inputGallery.click());
  els.photoDrop?.addEventListener("click", (e) => {
    if (e.target.closest("[data-rm]")) return;
    els.inputGallery.click();
  });
  els.photoDrop?.addEventListener("dragover", (e) => {
    e.preventDefault();
    els.photoDrop.classList.add("drag");
  });
  els.photoDrop?.addEventListener("dragleave", () => els.photoDrop?.classList.remove("drag"));
  els.photoDrop?.addEventListener("drop", (e) => {
    e.preventDefault();
    els.photoDrop.classList.remove("drag");
    addFiles(e.dataTransfer.files);
  });
  els.inputCamera.addEventListener("change", (e) => {
    addFiles(e.target.files);
    e.target.value = "";
  });
  els.inputGallery.addEventListener("change", (e) => {
    addFiles(e.target.files);
    e.target.value = "";
  });

  els.btnScan.addEventListener("click", () => startScanner());
  els.btnScanClose.addEventListener("click", () => stopScanner());
  els.btnLookup.addEventListener("click", () => runIdentify());
  els.barcodeInput.addEventListener("input", () => {
    state.barcode = els.barcodeInput.value.trim();
    updateSaveState();
  });
  els.barcodeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      runIdentify();
    }
  });

  els.btnManual?.addEventListener("click", () => {
    els.manualTitle?.focus();
  });
  els.btnManualOk.addEventListener("click", () => {
    state.title = els.manualTitle.value.trim();
    if (state.title) {
      setIdentifyPhase("manual");
      setStatus(`Title set: ${state.title}`, "ok");
      updateSaveState();
    }
  });

  els.qtyMinus.addEventListener("click", () => {
    state.qty = Math.max(1, state.qty - 1);
    els.qtyVal.textContent = String(state.qty);
  });
  els.qtyPlus.addEventListener("click", () => {
    state.qty += 1;
    els.qtyVal.textContent = String(state.qty);
  });

  els.stagedFlag?.addEventListener("change", () => updateSaveState());

  els.btnSave.addEventListener("click", saveCapture);

  els.btnNewScan?.addEventListener("click", () => navigate("scan"));
  els.btnExport?.addEventListener("click", exportInventory);
  els.btnExportStaged?.addEventListener("click", exportStagedBatch);
  els.btnImport?.addEventListener("click", () => els.importFile?.click());
  els.btnWipe?.addEventListener("click", () => {
    if (!confirm("Wipe all local HUD / Scouter intake data on this phone?")) return;
    state.items = [];
    saveLocalItems([]);
    loadItems();
    showToast("Wiped");
  });
  els.importFile?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importInventoryFile(file);
    e.target.value = "";
  });
  els.railFilter?.addEventListener("input", () => {
    state.filterQuery = els.railFilter.value;
    renderCollection();
  });

  document.querySelectorAll("[data-go]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.go));
  });

  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => navigate(tab.dataset.view));
  });

  window.addEventListener("hashchange", () => {
    const name = (location.hash || "#scan").replace("#", "");
    if (VIEWS.includes(name) && name !== state.view) navigate(name);
  });
}

function init() {
  initCategories();
  bindDragOverlay();
  bindEvents();
  loadItems();
  updateSaveState();
  const fromHash = (location.hash || "").replace("#", "");
  const fromQuery = new URLSearchParams(location.search).get("view");
  const legacy = {
    collection: "intake",
    capture: "scan",
    home: "scan",
    rail: "intake",
    scouter: "scan",
    stage: "list",
    ready: "list",
  };
  const raw = fromHash || fromQuery || "scan";
  navigate(legacy[raw] || (VIEWS.includes(raw) ? raw : "scan"));
}

init();
