const LS_KEY = "scouter-items-v1";

const CATEGORIES = [
  { value: "pokemon_sealed", label: "Pokemon Sealed" },
  { value: "graded_slabs", label: "Graded Slabs" },
  { value: "raw_cards", label: "Raw Cards" },
  { value: "sports_cards", label: "Sports Cards" },
  { value: "other", label: "Other" },
];

const catMap = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));

/** Category labels — structural teal, not gold fills. */
const CAT_HUBS = {
  pokemon_sealed: { core: "#2E6B6E", hi: "#F2A03D", sub: "Sealed" },
  graded_slabs: { core: "#2E6B6E", hi: "#F2A03D", sub: "Graded" },
  raw_cards: { core: "#2E6B6E", hi: "#F2A03D", sub: "Raw" },
  sports_cards: { core: "#2E6B6E", hi: "#F2A03D", sub: "Sports" },
  other: { core: "#2E6B6E", hi: "#F2A03D", sub: "Other" },
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
    eyebrow: "H.U.D · Inventory",
    title: "Inventory",
    sub: "Staged items ready for desktop pipeline. Listing engine runs on desktop — not here.",
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
  btnIdentify: $("btnIdentify"),
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
  identifyCandidates: $("identifyCandidates"),
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
  if (!els.identifyStatus) return;
  els.identifyStatus.textContent = msg;
  els.identifyStatus.className = `status-line${kind ? ` ${kind}` : ""}`;
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
  const canSave = Boolean(state.title.trim()) && state.draftPhotos.length > 0;
  if (!els.btnSave) return;
  els.btnSave.disabled = !canSave;
  const label = els.stagedFlag?.checked === false ? "Save" : "Stage";
  els.btnSave.innerHTML = `<span class="glyph">▸</span>${label}`;
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
  openSheet();
  if (els.identifyResultTitle) {
    els.identifyResultTitle.textContent = state.title || detail || "—";
  }
  if (els.identifyResultMeta) {
    const bits = [
      state.identifyPath ? `path ${state.identifyPath}` : null,
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
 * Identify — photos in, identity out. Command #59 correction.
 * Never reads a barcode. Never hangs on a spinner.
 */
async function runIdentify() {
  const photos = state.draftPhotos.map((p) => p.dataUrl).filter(Boolean);

  if (!photos.length) {
    setIdentifyPhase("fail", "Need photos");
    setStatus("Drop or take photos, then tap ID. Barcode is a separate button.", "err");
    showToast("Need photos first", "err");
    return;
  }

  setIdentifyPhase("running", "Reading photos…");
  setStatus("Identify running — reading photos…", "busy");
  if (els.btnIdentify) {
    els.btnIdentify.disabled = true;
    els.btnIdentify.setAttribute("aria-busy", "true");
  }
  renderCandidates([]);

  try {
    const payload = {
      photos,
      notes: (els.fieldNotes?.value || "").trim() || null,
      category: state.category,
      quantity: state.qty,
    };

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
    } else if (
      result.setupTask ||
      (result.missingKeys || []).length ||
      /isn't set up yet/i.test(result.message || "")
    ) {
      setIdentifyPhase("setup", result.message || "Identify isn't set up yet.");
      setStatus(result.message || "Identify isn't set up yet.", "err");
      showToast("Identify isn't set up yet.", "err");
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
    if (els.btnIdentify) {
      els.btnIdentify.disabled = false;
      els.btnIdentify.removeAttribute("aria-busy");
    }
  }
}

function setCategory(value) {
  state.category = value;
  els.categoryChips?.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("on", chip.dataset.value === value);
  });
}

function updateViewfinder() {
  const last = state.draftPhotos[state.draftPhotos.length - 1];
  const still = $("stillPreview");
  const idle = $("camIdle");
  const live = $("liveCam");
  if (last?.dataUrl && still) {
    still.src = last.dataUrl;
    still.classList.remove("hidden");
    idle?.classList.add("hidden");
    if (live) live.style.opacity = "0";
  } else if (still) {
    still.removeAttribute("src");
    still.classList.add("hidden");
    if (live && state.previewStream) {
      live.style.opacity = "1";
      idle?.classList.add("hidden");
    } else {
      if (live) live.style.opacity = "0";
      idle?.classList.remove("hidden");
    }
  }
}

async function startLivePreview() {
  if (state.previewStream) return;
  if (!navigator.mediaDevices?.getUserMedia) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    state.previewStream = stream;
    const live = $("liveCam");
    if (live) {
      live.srcObject = stream;
      live.style.opacity = state.draftPhotos.length ? "0" : "1";
      await live.play().catch(() => {});
    }
    $("camIdle")?.classList.add("hidden");
  } catch {
    /* gallery / capture still work */
  }
}

function stopLivePreview() {
  if (!state.previewStream) return;
  state.previewStream.getTracks().forEach((t) => t.stop());
  state.previewStream = null;
  const live = $("liveCam");
  if (live) {
    live.srcObject = null;
    live.style.opacity = "0";
  }
}

async function captureFromLive() {
  const live = $("liveCam");
  if (!live?.srcObject || !live.videoWidth) {
    els.inputCamera?.click();
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.width = live.videoWidth;
  canvas.height = live.videoHeight;
  canvas.getContext("2d").drawImage(live, 0, 0);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], `scouter-${Date.now()}.jpg`, { type: "image/jpeg" });
  await addFiles([file]);
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

function holoCardHtml(item) {
  const src = photoSrc(item.photos?.[0]);
  const title = escapeHtml(item.title || "Untitled");
  const sub = [`×${item.quantity}`, item.barcode].filter(Boolean).join(" · ");
  const face = src
    ? `<img src="${src}" alt="" />`
    : `<div class="ph">NO IMG</div>`;
  const badge = item.staged ? "STAGED" : "OPEN";
  return `
    <div class="item-card" data-item="${item.id}">
      ${face}
      <div>
        <div class="t">${title}</div>
        <div class="m">${escapeHtml(sub)}</div>
      </div>
      <span class="badge chrome">${badge}</span>
    </div>`;
}

function renderCollection() {
  const count = state.items.length;
  if (els.statCount) els.statCount.textContent = String(count).padStart(2, "0");
  if (!els.collectionRoot) return;

  const filtered = filteredItems();

  if (!count) {
    els.collectionRoot.innerHTML = `<div class="empty">Intake empty. Shoot photos on Scouter, tap ID, then Stage.</div>`;
    return;
  }

  if (!filtered.length) {
    els.collectionRoot.innerHTML = `<div class="empty">No matches.</div>`;
    return;
  }

  els.collectionRoot.innerHTML = filtered.map((it) => holoCardHtml(it)).join("");
  els.collectionRoot.querySelectorAll("[data-item]").forEach((el) => {
    el.addEventListener("click", () => {
      const item = state.items.find((i) => i.id === el.dataset.item);
      if (!item) return;
      if (confirm(`Delete “${item.title || "item"}”?`)) deleteItem(item.id);
    });
  });
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
  state.identity = null;
  state.identifyPath = null;
  els.qtyVal.textContent = "1";
  if (els.fieldNotes) els.fieldNotes.value = "";
  if (els.barcodeInput) els.barcodeInput.value = "";
  if (els.manualTitle) els.manualTitle.value = "";
  if (els.stagedFlag) els.stagedFlag.checked = true;
  setCategory("other");
  renderPhotoGrid();
  renderCandidates([]);
  setIdentifyPhase("idle");
  setStatus("Drop or take photos · tap ID");
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
    .map((it) => holoCardHtml(it))
    .join("");
  bindHoloClicks(els.cmdRail);
}

function renderListRail() {
  const staged = state.items.filter((i) => i.staged);
  if (els.listReadyLbl) els.listReadyLbl.textContent = pad2(staged.length);
  if (els.handoffNote) {
    els.handoffNote.textContent = staged.length
      ? `${staged.length} staged — export for desktop`
      : "No staged items yet";
  }
  if (els.btnExportStaged) els.btnExportStaged.disabled = staged.length === 0;
  if (!els.listRail) return;
  if (!staged.length) {
    els.listRail.innerHTML = `<div class="empty">Inventory empty. Scouter → photos → ID → Stage.</div>`;
    return;
  }
  els.listRail.innerHTML = staged.map((it) => holoCardHtml(it)).join("");
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
  const trimmed = String(code || "").trim();
  if (!trimmed) {
    showToast("Scan or enter a barcode first", "err");
    setStatus("Barcode is a separate button — scan or type a UPC.", "err");
    return;
  }

  state.barcode = trimmed;
  if (els.barcodeInput) els.barcodeInput.value = trimmed;
  setStatus("Looking up barcode…", "busy");
  if (els.btnLookup) {
    els.btnLookup.disabled = true;
    els.btnLookup.textContent = "…";
  }

  try {
    const result = await api(`/api/scouter/barcode/${encodeURIComponent(trimmed)}`);
    if (result.found && result.product?.title) {
      state.title = result.product.title;
      if (els.manualTitle) els.manualTitle.value = result.product.title;
      setStatus(`Barcode match: ${result.product.title}`, "ok");
      showToast("Barcode match");
    } else {
      setStatus("No UPC match — use Identify on photos or Manual.", "err");
      els.manualRow?.classList.remove("hidden");
      showToast("No barcode match", "err");
    }
    updateSaveState();
  } catch {
    setStatus("Barcode lookup offline — use Identify or Manual. Photos kept.", "err");
    els.manualRow?.classList.remove("hidden");
  } finally {
    if (els.btnLookup) {
      els.btnLookup.disabled = false;
      els.btnLookup.textContent = "Lookup";
    }
  }
}

async function saveCapture() {
  if (els.btnSave.disabled) return;

  els.btnSave.disabled = true;
  els.btnSave.textContent = "Committing…";

  try {
    const now = new Date().toISOString();
    const identity = state.identity || null;
    const staged = els.stagedFlag ? Boolean(els.stagedFlag.checked) : true;
    const item = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      title: state.title.trim() || identity?.product_name || null,
      barcode: state.barcode.trim() || null,
      quantity: state.qty,
      category: state.category,
      notes: (els.fieldNotes?.value || "").trim() || null,
      staged,
      phase: staged ? "Staged" : "Draft",
      location: null,
      identifyPath: state.identifyPath || null,
      productName: identity?.product_name || null,
      collectorNumber: identity?.collector_number || null,
      setName: identity?.set_name || null,
      setCode: identity?.set_code || null,
      game: identity?.game || null,
      rarity: identity?.rarity || null,
      finish: identity?.finish || null,
      language: identity?.language || null,
      condition: identity?.condition || null,
      identifyConfidence: identity?.confidence || null,
      photos: state.draftPhotos.map((p) => ({
        id: crypto.randomUUID(),
        dataUrl: p.dataUrl,
        url: p.dataUrl,
        createdAt: now,
      })),
    };

    state.items.unshift(item);
    saveLocalItems(state.items);

    // Best-effort server sync; never block local save / Inventory render
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
            productName: item.productName,
            collectorNumber: item.collectorNumber,
            setName: item.setName,
            setCode: item.setCode,
            game: item.game,
            rarity: item.rarity,
            finish: item.finish,
            language: item.language,
            condition: item.condition,
            identifyConfidence: item.identifyConfidence,
            identifyPath: item.identifyPath,
          }),
        })
      ).item;

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
    navigate(item.staged ? "list" : "intake");
    showToast(item.staged ? "Staged — in Inventory" : "Saved to Sift");
  } catch (e) {
    showToast(e.message, "err");
    setStatus(e.message, "err");
  } finally {
    els.btnSave.disabled = false;
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

  if (show !== "scan") {
    stopScanner();
    stopLivePreview();
    closeSheet();
  } else {
    startLivePreview();
  }

  if (show === "intake") renderCollection();
  if (show === "list") renderListRail();
  if (show === "scan") renderCommand();

  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === show);
  });

  if (location.hash.replace("#", "") !== show) {
    history.replaceState(null, "", `#${show}`);
  }
}

function openSheet() {
  const sheet = $("moreSheet");
  if (!sheet) return;
  sheet.classList.add("open");
  sheet.setAttribute("aria-hidden", "false");
}

function closeSheet() {
  const sheet = $("moreSheet");
  if (!sheet) return;
  sheet.classList.remove("open");
  sheet.setAttribute("aria-hidden", "true");
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
  if (!els.categoryChips) return;
  els.categoryChips.innerHTML = CATEGORIES.map(
    (c) =>
      `<button type="button" class="chip${c.value === state.category ? " on" : ""}" data-value="${c.value}">${c.label}</button>`,
  ).join("");
  els.categoryChips.querySelectorAll(".chip").forEach((chip) => {
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
  els.btnShutter?.addEventListener("click", () => captureFromLive());
  els.btnGallery?.addEventListener("click", () => els.inputGallery.click());
  els.btnCamera?.addEventListener("click", () => els.inputCamera.click());
  $("btnMore")?.addEventListener("click", () => openSheet());
  $("btnSheetClose")?.addEventListener("click", () => closeSheet());

  els.inputCamera.addEventListener("change", (e) => {
    addFiles(e.target.files);
    e.target.value = "";
  });
  els.inputGallery.addEventListener("change", (e) => {
    addFiles(e.target.files);
    e.target.value = "";
  });

  els.btnIdentify?.addEventListener("click", () => runIdentify());
  els.btnScan.addEventListener("click", () => {
    openSheet();
    startScanner();
  });
  els.btnScanClose.addEventListener("click", () => stopScanner());
  els.btnLookup.addEventListener("click", () => lookupBarcode(els.barcodeInput.value));
  els.barcodeInput.addEventListener("input", () => {
    state.barcode = els.barcodeInput.value.trim();
    updateSaveState();
  });
  els.barcodeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      lookupBarcode(els.barcodeInput.value);
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
