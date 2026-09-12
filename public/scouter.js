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
  btnShutter: $("btnShutter"),
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
  stagedFlag: $("stagedFlag"),
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
  btnRailNew: $("btnRailNew"),
  btnExport: $("btnExport"),
  btnImport: $("btnImport"),
  importFile: $("importFile"),
  pageHero: $("pageHero"),
  pageEyebrow: $("pageEyebrow"),
  pageSub: $("pageSub"),
  viewfinderIdle: $("viewfinderIdle"),
  viewfinderPreview: $("viewfinderPreview"),
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
  els.identifyStatus.className = `status-strip${kind ? ` ${kind}` : ""}`;
}

function loadLocalItems() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const items = raw ? JSON.parse(raw) : [];
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
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#7dcea0" stroke-width="1.4" style="opacity:0.7;filter:drop-shadow(0 0 14px #7dcea0)"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
        <div class="v-label" style="margin-top:16px;font-size:12px">Intake empty</div>
        <p>Capture or scan on Scout to fill the rail.</p>
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

    els.collectionRoot.appendChild(section);
  }
}

function loadItems() {
  state.items = loadLocalItems().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  renderCollection();
}

function deleteItem(id) {
  state.items = state.items.filter((i) => i.id !== id);
  saveLocalItems(state.items);
  renderCollection();
  showToast("Deleted");
}

function setItemStaged(id, staged) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  item.staged = Boolean(staged);
  item.updatedAt = new Date().toISOString();
  saveLocalItems(state.items);
  renderCollection();
  showToast(item.staged ? "Staged for desktop" : "Unstaged");
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
  setStatus("Point camera · scan barcode · add item");
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
  // Re-sync from DOM so a typed barcode always counts even if an input event was missed
  if (els.barcodeInput) state.barcode = els.barcodeInput.value.trim();
  if (els.manualTitle && els.manualTitle.value.trim()) {
    state.title = els.manualTitle.value.trim();
  }
  updateSaveState();
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

    if (!item.title && !item.barcode && !item.photos.length) {
      throw new Error("Add a photo, barcode, or title first");
    }

    state.items.unshift(item);
    saveLocalItems(state.items);

    // Finish local UX immediately — never wait on network for rail handoff
    loadItems();
    resetCapture();
    navigate("collection");
    showToast(item.staged ? "Staged on rail" : "Saved to rail");
    els.btnSave.disabled = false;
    els.btnSave.textContent = "Add to rail";
    updateSaveState();

    // Best-effort server sync in background (barcode identify + backup)
    void (async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
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
            signal: ctrl.signal,
          })
        ).item;

        if (item.barcode) {
          remote = (
            await api(`/api/scouter/items/${remote.id}/identify`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ barcode: item.barcode, title: item.title }),
              signal: ctrl.signal,
            })
          ).item;
          if (remote.title) {
            item.title = remote.title;
            saveLocalItems(state.items);
            loadItems();
          }
        }

        for (const photo of item.photos) {
          await api(`/api/scouter/items/${remote.id}/photos/data`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataUrl: photo.dataUrl }),
            signal: ctrl.signal,
          });
        }
      } catch {
        /* local save already succeeded */
      } finally {
        clearTimeout(timer);
      }
    })();
  } catch (e) {
    showToast(e.message, "err");
    setStatus(e.message, "err");
    els.btnSave.disabled = false;
    els.btnSave.textContent = "Add to rail";
    updateSaveState();
  }
}

function navigate(view) {
  const known = ["capture", "collection", "spaces", "spine", "channels"];
  if (!known.includes(view)) view = "capture";

  const map = {
    capture: els.viewCapture,
    collection: els.viewCollection,
    spaces: $("viewSpaces"),
    spine: $("viewSpine"),
    channels: $("viewChannels"),
  };

  Object.entries(map).forEach(([key, node]) => {
    node?.classList.toggle("active", key === view);
  });

  els.saveBar?.classList.toggle("hidden", true);
  els.pageHero?.classList.toggle("hidden", true);
  els.intakeBar?.classList.toggle("hidden", true);
  els.railToolbar?.classList.toggle("hidden", true);

  if (view === "collection") {
    if (els.pageTitle) els.pageTitle.textContent = "Rail";
    renderCollection();
    stopScanner();
  } else if (view === "spaces") {
    renderSpaces();
    stopScanner();
  } else if (view === "spine") {
    renderSpine();
    stopScanner();
  } else if (view === "channels") {
    renderChannels();
    stopScanner();
  } else if (els.pageTitle) {
    els.pageTitle.textContent = "Scout";
  }

  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });

  const hash = `#${view}`;
  if (location.hash !== hash) history.replaceState(null, "", hash);
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

function openCamera() {
  els.inputCamera.click();
}

function bindEvents() {
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
  els.photoDrop?.addEventListener("dragleave", () => els.photoDrop.classList.remove("drag"));
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
      setStatus(`Title: ${state.title}`, "ok");
      updateSaveState();
    }
  });
  els.manualTitle?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      els.btnManualOk.click();
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
  els.btnRailNew?.addEventListener("click", () => navigate("capture"));
  els.btnExport?.addEventListener("click", exportInventory);
  els.btnImport?.addEventListener("click", () => els.importFile?.click());
  els.importFile?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importInventoryFile(file);
    e.target.value = "";
  });
  els.railFilter?.addEventListener("input", () => {
    state.filterQuery = els.railFilter.value;
    renderCollection();
  });

  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => navigate(tab.dataset.view));
  });
}


/* ── Spaces / Spine / Channels / Dump ── */
const SPACES_KEY = "coalition-spaces-v1";
const SPINE_STAGES = [
  { id: "intake", label: "Intake" },
  { id: "sift", label: "Sift" },
  { id: "photos", label: "Photos" },
  { id: "listing", label: "Listing" },
  { id: "listed", label: "Listed" },
  { id: "ship", label: "Ship" },
  { id: "door", label: "Door" },
];

const hudUi = {
  dumpPanel: $("dumpPanel"),
  dumpPool: $("dumpPool"),
  btnDumpPick: $("btnDumpPick"),
  btnDumpAssign: $("btnDumpAssign"),
  inputDump: $("inputDump"),
  spacesField: $("spacesField"),
  itemPool: $("itemPool"),
  spaceDetail: $("spaceDetail"),
  btnSpaceBack: $("btnSpaceBack"),
  spaceDetailTitle: $("spaceDetailTitle"),
  spaceDetailGrid: $("spaceDetailGrid"),
  btnAddSpace: $("btnAddSpace"),
  spineTrack: $("spineTrack"),
  spineStageName: $("spineStageName"),
  spineStageItems: $("spineStageItems"),
  channelGrid: $("channelGrid"),
  modeShoot: $("modeShoot"),
  modeDump: $("modeDump"),
  modeScanBtn: $("modeScanBtn"),
  viewfinderHint: $("viewfinderHint"),
};

state.intakeMode = "shoot";
state.dumpPhotos = [];
state.dumpSelected = new Set();
state.activeSpine = "intake";
state.openSpaceId = null;

function defaultSpaces() {
  return [
    { id: "space-staged", name: "Staged / Unlisted", kind: "unlisted", itemIds: [] },
    { id: "space-ebay-1", name: "eBay Bin 1", kind: "ebay", itemIds: [] },
    { id: "space-ebay-2", name: "eBay Bin 2", kind: "ebay", itemIds: [] },
    { id: "space-scanned", name: "Scanned Cards", kind: "scanned", itemIds: [] },
  ];
}

function loadSpaces() {
  try {
    const raw = localStorage.getItem(SPACES_KEY);
    if (!raw) return defaultSpaces();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : defaultSpaces();
  } catch {
    return defaultSpaces();
  }
}

function saveSpaces(spaces) {
  localStorage.setItem(SPACES_KEY, JSON.stringify(spaces));
}

function setIntakeMode(mode) {
  state.intakeMode = mode;
  document.querySelectorAll(".mode-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.mode === mode);
  });
  hudUi.dumpPanel?.classList.toggle("hidden", mode !== "dump");
  if (hudUi.viewfinderHint) {
    hudUi.viewfinderHint.textContent =
      mode === "dump" ? "Dump mode · pick a pile" : mode === "scan" ? "Scan barcode" : "Tap to shoot";
  }
  if (mode === "scan") startScanner();
}

function renderDumpPool() {
  if (!hudUi.dumpPool) return;
  if (!state.dumpPhotos.length) {
    hudUi.dumpPool.innerHTML = `<div class="pool-empty">No dump photos yet</div>`;
    hudUi.btnDumpAssign.disabled = true;
    return;
  }
  hudUi.dumpPool.innerHTML = state.dumpPhotos
    .map((p, idx) => {
      const on = state.dumpSelected.has(idx);
      return `<button type="button" class="dump-thumb${on ? " selected" : ""}" data-dump="${idx}">
        <img src="${p.dataUrl}" alt="" />
        <span class="dump-check">✓</span>
      </button>`;
    })
    .join("");
  hudUi.dumpPool.querySelectorAll("[data-dump]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.dump);
      if (state.dumpSelected.has(idx)) state.dumpSelected.delete(idx);
      else state.dumpSelected.add(idx);
      renderDumpPool();
    });
  });
  hudUi.btnDumpAssign.disabled = state.dumpSelected.size === 0;
}

async function addDumpFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith("image/"));
  for (const file of files) {
    const dataUrl = await window.ScouterImage.fileToDataUrl(file);
    state.dumpPhotos.push({ dataUrl, file });
  }
  renderDumpPool();
  showToast(`Dump loaded · ${state.dumpPhotos.length} photos`);
}

function assignDumpToDraft() {
  const picked = [...state.dumpSelected].sort((a, b) => a - b).map((i) => state.dumpPhotos[i]).filter(Boolean);
  if (!picked.length) return;
  state.draftPhotos = [...state.draftPhotos, ...picked.map((p) => ({ dataUrl: p.dataUrl, file: p.file }))].slice(0, MAX_PHOTOS);
  renderPhotoGrid();
  updateSaveState();
  setIntakeMode("shoot");
  setStatus(`${picked.length} dump photo(s) attached`, "ok");
  showToast("Dump assigned to this item");
}

function assignedItemIds(spaces) {
  const ids = new Set();
  for (const space of spaces) for (const id of space.itemIds || []) ids.add(id);
  return ids;
}

function renderSpaces() {
  const spaces = loadSpaces();
  const assigned = assignedItemIds(spaces);
  const unassigned = state.items.filter((it) => !assigned.has(it.id));

  if (hudUi.spacesField) {
    hudUi.spacesField.innerHTML = spaces
      .map(
        (space) => `<div class="space-card" data-space="${space.id}" tabindex="0">
          <div class="space-card-name">${escapeHtml(space.name)}</div>
          <div class="space-card-meta">${escapeHtml(space.kind || "bin")}</div>
          <div class="space-card-count">${String((space.itemIds || []).length).padStart(2, "0")}</div>
        </div>`,
      )
      .join("");

    hudUi.spacesField.querySelectorAll(".space-card").forEach((card) => {
      card.addEventListener("click", () => openSpace(card.dataset.space));
      card.addEventListener("dragover", (e) => {
        e.preventDefault();
        card.classList.add("drag-over");
      });
      card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
      card.addEventListener("drop", (e) => {
        e.preventDefault();
        card.classList.remove("drag-over");
        const itemId = e.dataTransfer.getData("text/item-id");
        if (itemId) moveItemToSpace(itemId, card.dataset.space);
      });
    });
  }

  if (hudUi.itemPool) {
    if (!unassigned.length) {
      hudUi.itemPool.innerHTML = `<div class="pool-empty">All items are filed · capture more on Scout</div>`;
    } else {
      hudUi.itemPool.innerHTML = unassigned
        .map((it) => {
          const src = photoSrc(it.photos?.[0]);
          const face = src ? `<img src="${src}" alt="" />` : `<div class="holo-card-empty">NO IMG</div>`;
          return `<div class="pool-card" draggable="true" data-item="${it.id}">${face}<div class="pool-card-title">${escapeHtml(it.title || "Untitled")}</div></div>`;
        })
        .join("");
      hudUi.itemPool.querySelectorAll(".pool-card").forEach((card) => {
        card.addEventListener("dragstart", (e) => {
          e.dataTransfer.setData("text/item-id", card.dataset.item);
        });
      });
    }
  }

  if (state.openSpaceId) openSpace(state.openSpaceId);
  else closeSpaceDetail();
}

function moveItemToSpace(itemId, spaceId) {
  const spaces = loadSpaces();
  for (const space of spaces) {
    space.itemIds = (space.itemIds || []).filter((id) => id !== itemId);
  }
  const target = spaces.find((s) => s.id === spaceId);
  if (!target) return;
  target.itemIds = [...(target.itemIds || []), itemId];
  saveSpaces(spaces);
  showToast(`Filed into ${target.name}`);
  renderSpaces();
}

function openSpace(spaceId) {
  const spaces = loadSpaces();
  const space = spaces.find((s) => s.id === spaceId);
  if (!space || !hudUi.spaceDetail) return;
  state.openSpaceId = spaceId;
  hudUi.spaceDetail.classList.remove("hidden");
  hudUi.spaceDetailTitle.textContent = space.name;
  const items = (space.itemIds || []).map((id) => state.items.find((it) => it.id === id)).filter(Boolean);
  if (!items.length) {
    hudUi.spaceDetailGrid.innerHTML = `<div class="space-empty">Empty bin — drag items here from the pool</div>`;
    return;
  }
  hudUi.spaceDetailGrid.innerHTML = items
    .map((it) => {
      const src = photoSrc(it.photos?.[0]);
      const face = src ? `<img src="${src}" alt="" />` : "";
      return `<div class="detail-card">${face}<div class="detail-card-title">${escapeHtml(it.title || "Untitled")}</div></div>`;
    })
    .join("");
}

function closeSpaceDetail() {
  state.openSpaceId = null;
  hudUi.spaceDetail?.classList.add("hidden");
}

function addSpaceBin() {
  const name = prompt("Bin name", "New Space");
  if (!name) return;
  const spaces = loadSpaces();
  spaces.push({ id: `space-${Date.now()}`, name: name.trim(), kind: "custom", itemIds: [] });
  saveSpaces(spaces);
  renderSpaces();
}

function itemSpineStage(item) {
  if (item.shipped) return "door";
  if (item.listed || item.channel === "ebay") return "listed";
  if (item.listingReady) return "listing";
  if ((item.photos || []).length >= 2) return "photos";
  if (item.staged) return "sift";
  return "intake";
}

function renderSpine() {
  if (!hudUi.spineTrack) return;
  const counts = Object.fromEntries(SPINE_STAGES.map((s) => [s.id, 0]));
  for (const item of state.items) counts[itemSpineStage(item)] += 1;

  hudUi.spineTrack.innerHTML = SPINE_STAGES.map((stage, idx) => {
    const active = stage.id === state.activeSpine ? " active" : "";
    const arrow = idx < SPINE_STAGES.length - 1 ? `<div class="spine-arrow" aria-hidden="true"></div>` : "";
    return `<button type="button" class="spine-node${active}" data-spine="${stage.id}">
        <div class="spine-node-label">${stage.label}</div>
        <div class="spine-node-count">${String(counts[stage.id] || 0).padStart(2, "0")}</div>
      </button>${arrow}`;
  }).join("");

  hudUi.spineTrack.querySelectorAll("[data-spine]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeSpine = btn.dataset.spine;
      renderSpine();
    });
  });

  const stage = SPINE_STAGES.find((s) => s.id === state.activeSpine) || SPINE_STAGES[0];
  hudUi.spineStageName.textContent = stage.label;
  const items = state.items.filter((it) => itemSpineStage(it) === stage.id);
  if (!items.length) {
    hudUi.spineStageItems.innerHTML = `<div class="spine-empty">Nothing in ${stage.label} yet</div>`;
    return;
  }
  hudUi.spineStageItems.innerHTML = items
    .map((it) => {
      const src = photoSrc(it.photos?.[0]);
      const face = src ? `<img src="${src}" alt="" />` : "";
      return `<div class="spine-item-row">${face}<span>${escapeHtml(it.title || "Untitled")}</span></div>`;
    })
    .join("");
}

function renderChannels() {
  if (!hudUi.channelGrid) return;
  const staged = state.items.filter((it) => it.staged).length;
  const listed = state.items.filter((it) => it.listed || it.channel === "ebay").length;
  const channels = [
    {
      name: "eBay",
      status: "live",
      statusLabel: "Live sync path",
      meta: `${listed} listed · ${staged} staged on rail · qty + photo updates wire through HUD`,
    },
    {
      name: "Double Holo",
      status: "stub",
      statusLabel: "Stub · awaiting API base",
      meta: "Channel card ready — no invented endpoints.",
    },
    {
      name: "Misprint",
      status: "stub",
      statusLabel: "Stub · awaiting API base",
      meta: "Seller key shape known · host still unknown.",
    },
    {
      name: "Shopify",
      status: "stub",
      statusLabel: "Planned",
      meta: "Portfolio / storefront mirror later.",
    },
  ];
  hudUi.channelGrid.innerHTML = channels
    .map(
      (ch) => `<article class="channel-card">
        <div class="channel-name">${ch.name}</div>
        <div class="channel-status ${ch.status}">${ch.statusLabel}</div>
        <div class="channel-meta">${ch.meta}</div>
      </article>`,
    )
    .join("");
}

function bindHudEvents() {
  hudUi.modeShoot?.addEventListener("click", () => setIntakeMode("shoot"));
  hudUi.modeDump?.addEventListener("click", () => setIntakeMode("dump"));
  hudUi.modeScanBtn?.addEventListener("click", () => setIntakeMode("scan"));
  hudUi.btnDumpPick?.addEventListener("click", () => hudUi.inputDump?.click());
  hudUi.inputDump?.addEventListener("change", (e) => {
    addDumpFiles(e.target.files || []);
    e.target.value = "";
  });
  hudUi.btnDumpAssign?.addEventListener("click", assignDumpToDraft);
  hudUi.btnAddSpace?.addEventListener("click", addSpaceBin);
  hudUi.btnSpaceBack?.addEventListener("click", closeSpaceDetail);
}


function init() {
  initCategories();
  bindDragOverlay();
  bindEvents();
  bindHudEvents();
  loadItems();
  updateSaveState();
  const params = new URLSearchParams(location.search);
  const hashView = (location.hash || "").replace("#", "");
  const view = params.get("view") || hashView;
  if (["collection", "capture", "spaces", "spine", "channels"].includes(view)) navigate(view);
  else navigate("capture");
}

init();
