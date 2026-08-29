const LS_KEY = "scouter-items-v1";

const CATEGORIES = [
  { value: "pokemon_sealed", label: "Pokemon Sealed" },
  { value: "graded_slabs", label: "Graded Slabs" },
  { value: "raw_cards", label: "Raw Cards" },
  { value: "sports_cards", label: "Sports Cards" },
  { value: "other", label: "Other" },
];

const catMap = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));

/** Category hub colors — from Coalition ScanIntake.jsx CAT_HUBS */
const CAT_HUBS = {
  pokemon_sealed: { core: "#FFB43D", hi: "#FFD98A", sub: "Sealed" },
  graded_slabs: { core: "#2BD9C0", hi: "#8FF6E8", sub: "Graded" },
  raw_cards: { core: "#4FA8D8", hi: "#BFE9FF", sub: "Raw" },
  sports_cards: { core: "#2E6F91", hi: "#7FD4FF", sub: "Sports" },
  other: { core: "#4FC3F7", hi: "#A8E4FF", sub: "Other" },
};

const MAX_PHOTOS = 8;

const state = {
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
  viewCapture: $("viewCapture"),
  viewCollection: $("viewCollection"),
  photoGrid: $("photoGrid"),
  photoDrop: $("photoDrop"),
  photoCountLbl: $("photoCountLbl"),
  pageTitle: $("pageTitle"),
  btnCamera: $("btnCamera"),
  btnGallery: $("btnGallery"),
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
  btnSave: $("btnSave"),
  saveBar: $("saveBar"),
  collectionRoot: $("collectionRoot"),
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
    return raw ? JSON.parse(raw) : [];
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
}

function setCategory(value) {
  state.category = value;
  els.categoryChips.querySelectorAll(".m-chip").forEach((chip) => {
    chip.classList.toggle("m-chip-on", chip.dataset.value === value);
  });
}

function renderPhotoGrid() {
  els.photoCountLbl.textContent = `${state.draftPhotos.length} added`;
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
  return `
    <div class="holo-card-wrap">
      <button type="button" class="holo-card" data-item="${item.id}" style="box-shadow:inset 0 1px 0 rgba(255,255,255,0.22), inset 0 0 0 1px ${hub.core}55, 0 18px 40px -16px rgba(0,0,0,0.95)">
        ${face}
        <span class="holo-card-plate">
          <span class="holo-card-title">${title}</span>
          <span class="holo-card-sub" style="color:${hub.hi}">${escapeHtml(sub)}</span>
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
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2E6F91" stroke-width="1.4" style="opacity:0.7;filter:drop-shadow(0 0 14px #7FD4FF)"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
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

    scroll.querySelectorAll("[data-item]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = state.items.find((i) => i.id === btn.dataset.item);
        if (!item) return;
        const title = item.title || "Untitled";
        const meta = [`Qty ${item.quantity}`, item.barcode].filter(Boolean).join(" · ");
        if (confirm(`${title}\n${meta}\n\nDelete this item from your phone?`)) {
          deleteItem(item.id);
        }
      });
    });

    els.collectionRoot.appendChild(section);
  }
}

function loadItems() {
  state.items = loadLocalItems().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  renderCollection();
}

function deleteItem(id) {
  if (!confirm("Delete this item from this phone?")) return;
  state.items = state.items.filter((i) => i.id !== id);
  saveLocalItems(state.items);
  renderCollection();
  showToast("Deleted");
}

function resetCapture() {
  state.draftPhotos = [];
  state.qty = 1;
  state.category = "other";
  state.title = "";
  state.barcode = "";
  els.qtyVal.textContent = "1";
  els.fieldNotes.value = "";
  els.barcodeInput.value = "";
  els.manualTitle.value = "";
  els.manualRow.classList.add("hidden");
  setCategory("other");
  renderPhotoGrid();
  setStatus("Add a photo, barcode, or title to start intake");
  updateSaveState();
}

async function lookupBarcode(code) {
  const trimmed = code.trim();
  if (!trimmed) {
    showToast("Enter a barcode first", "err");
    return;
  }

  state.barcode = trimmed;
  els.barcodeInput.value = trimmed;
  setStatus("Looking up barcode…", "busy");
  els.btnLookup.disabled = true;

  try {
    const result = await api(`/api/scouter/barcode/${encodeURIComponent(trimmed)}`);
    if (result.found && result.product?.title) {
      state.title = result.product.title;
      setStatus(`Found: ${result.product.title}`, "ok");
    } else {
      setStatus("Not in catalog — add a title manually", "err");
      els.manualRow.classList.remove("hidden");
    }
    updateSaveState();
  } catch {
    setStatus("Lookup offline — add title manually", "err");
    els.manualRow.classList.remove("hidden");
  } finally {
    els.btnLookup.disabled = false;
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
      notes: els.fieldNotes.value.trim() || null,
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
    navigate("collection");
    showToast("Intake started — saved to collection");
  } catch (e) {
    showToast(e.message, "err");
    setStatus(e.message, "err");
  } finally {
    els.btnSave.disabled = false;
    els.btnSave.textContent = "Start intake";
    updateSaveState();
  }
}

function navigate(view) {
  const isCollection = view === "collection";
  els.viewCapture.classList.toggle("active", !isCollection);
  els.viewCollection.classList.toggle("active", isCollection);
  els.saveBar.classList.toggle("hidden", isCollection);
  els.pageHero.classList.toggle("hidden", isCollection);
  els.intakeBar.classList.toggle("hidden", !isCollection);
  els.railToolbar.classList.toggle("hidden", !isCollection);

  if (isCollection) {
    els.pageTitle.textContent = "Intake";
    renderCollection();
    stopScanner();
  } else {
    els.pageTitle.textContent = "New scan";
    els.pageEyebrow.textContent = "Rail · Mobile intake";
    els.pageSub.textContent =
      "Capture photos and barcodes on this device. Items stay on your phone until Command Core sync.";
  }

  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });
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
  els.btnCamera.addEventListener("click", () => els.inputCamera.click());
  els.btnGallery.addEventListener("click", () => els.inputGallery.click());
  els.photoDrop.addEventListener("click", (e) => {
    if (e.target.closest("[data-rm]")) return;
    els.inputGallery.click();
  });
  els.photoDrop.addEventListener("dragover", (e) => {
    e.preventDefault();
    els.photoDrop.classList.add("drag");
  });
  els.photoDrop.addEventListener("dragleave", () => els.photoDrop.classList.remove("drag"));
  els.photoDrop.addEventListener("drop", (e) => {
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
  els.btnLookup.addEventListener("click", async () => {
    if (!els.barcodeInput.value.trim() && state.draftPhotos.length) {
      setStatus("Checking photos for barcode…", "busy");
      const fromPhoto = await scanBarcodeFromPhotos();
      if (fromPhoto) {
        els.barcodeInput.value = fromPhoto;
        state.barcode = fromPhoto.trim();
        updateSaveState();
      }
    }
    lookupBarcode(els.barcodeInput.value);
  });
  els.barcodeInput.addEventListener("input", () => {
    state.barcode = els.barcodeInput.value.trim();
    updateSaveState();
  });

  els.btnManual.addEventListener("click", () => {
    els.manualRow.classList.remove("hidden");
    els.manualTitle.focus();
  });
  els.btnManualOk.addEventListener("click", () => {
    state.title = els.manualTitle.value.trim();
    if (state.title) {
      setStatus(`Title: ${state.title}`, "ok");
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

  els.btnSave.addEventListener("click", saveCapture);

  els.btnNewScan?.addEventListener("click", () => navigate("capture"));
  els.railFilter?.addEventListener("input", () => {
    state.filterQuery = els.railFilter.value;
    renderCollection();
  });

  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => navigate(tab.dataset.view));
  });
}

function init() {
  initCategories();
  bindDragOverlay();
  bindEvents();
  loadItems();
  updateSaveState();
}

init();
