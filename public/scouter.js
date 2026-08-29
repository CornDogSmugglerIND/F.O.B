const CATEGORIES = [
  { value: "pokemon_sealed", label: "Pokemon Sealed" },
  { value: "graded_slabs", label: "Graded Slabs" },
  { value: "raw_cards", label: "Raw Cards" },
  { value: "sports_cards", label: "Sports Cards" },
  { value: "other", label: "Other" },
];

const catMap = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));
const MAX_PHOTOS = 12;

const state = {
  items: [],
  draftPhotos: [],
  qty: 1,
  category: "other",
  title: "",
  barcode: "",
  scanner: null,
  scanLoop: null,
};

const $ = (id) => document.getElementById(id);

const els = {
  statCount: $("statCount"),
  viewCapture: $("viewCapture"),
  viewCollection: $("viewCollection"),
  photoGrid: $("photoGrid"),
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
  fieldBarcode: $("fieldBarcode"),
  fieldTitle: $("fieldTitle"),
  qtyVal: $("qtyVal"),
  qtyMinus: $("qtyMinus"),
  qtyPlus: $("qtyPlus"),
  fieldCategory: $("fieldCategory"),
  fieldNotes: $("fieldNotes"),
  btnSave: $("btnSave"),
  saveBar: $("saveBar"),
  collectionRoot: $("collectionRoot"),
  scanOverlay: $("scanOverlay"),
  scanVideo: $("scanVideo"),
  btnScanClose: $("btnScanClose"),
  toast: $("toast"),
};

function showToast(msg, type = "ok") {
  els.toast.textContent = msg;
  els.toast.className = `toast show ${type}`;
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => els.toast.classList.remove("show"), 3200);
}

function setIdentifyStatus(msg, kind = "") {
  els.identifyStatus.textContent = msg;
  els.identifyStatus.className = `identify-status${kind ? ` ${kind}` : ""}`;
}

async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new Error("Network error — check connection and refresh");
  }

  if (!res.ok) {
    const text = await res.text();
    let body = {};
    try {
      body = JSON.parse(text);
    } catch {
      /* plain text error from gateway */
    }
    if (res.status === 413 || text.includes("PAYLOAD_TOO_LARGE") || text.includes("Too Large")) {
      throw new Error("Photo too large — try one photo at a time");
    }
    throw new Error(body.error || text.slice(0, 120) || `Request failed (${res.status})`);
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

function renderPhotoGrid() {
  const slots = [];
  const count = state.draftPhotos.length;
  const showAdd = count < MAX_PHOTOS;

  for (let i = 0; i < count; i++) {
    const p = state.draftPhotos[i];
    slots.push(`
      <div class="photo-slot filled" data-idx="${i}">
        <img src="${p.previewUrl}" alt="" />
        <button type="button" class="rm" data-rm="${i}" aria-label="Remove">×</button>
      </div>`);
  }

  if (showAdd) {
    slots.push(`
      <div class="photo-slot" data-add="1">
        <span class="slot-icon">+</span>
        <span class="slot-lbl">ADD</span>
      </div>`);
  }

  els.photoGrid.innerHTML = slots.join("");

  els.photoGrid.querySelectorAll("[data-rm]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      removePhoto(Number(btn.dataset.rm));
    });
  });

  els.photoGrid.querySelector("[data-add]")?.addEventListener("click", () => {
    els.inputGallery.click();
  });
}

function removePhoto(idx) {
  const p = state.draftPhotos[idx];
  if (p) URL.revokeObjectURL(p.previewUrl);
  state.draftPhotos.splice(idx, 1);
  renderPhotoGrid();
  updateSaveState();
}

async function addFiles(fileList) {
  const isImage = window.ScouterImage?.isImageFile ?? ((f) => f.type?.startsWith("image/"));
  const incoming = [...(fileList ?? [])].filter(isImage);
  if (!incoming.length) {
    showToast("No images selected — iPhone HEIC is supported", "err");
    return;
  }

  const room = MAX_PHOTOS - state.draftPhotos.length;
  if (room <= 0) {
    showToast(`Max ${MAX_PHOTOS} photos`, "err");
    return;
  }

  const batch = incoming.slice(0, room);
  setIdentifyStatus("Processing photos…", "busy");

  try {
    const compressed = window.ScouterImage
      ? await window.ScouterImage.compressPhotos(batch)
      : batch;

    for (let i = 0; i < batch.length; i++) {
      const file = compressed[i];
      state.draftPhotos.push({ file, previewUrl: URL.createObjectURL(file) });
    }

    renderPhotoGrid();
    updateSaveState();
    const kb = Math.round(compressed.reduce((n, f) => n + f.size, 0) / 1024);
    setIdentifyStatus(`${state.draftPhotos.length} photo(s) ready · ~${kb} KB`, "ok");
    showToast(`${batch.length} photo(s) added`);
  } catch (e) {
    setIdentifyStatus(e.message, "err");
    showToast(e.message, "err");
  }
}

function renderCollection() {
  const count = state.items.length;
  els.statCount.textContent = String(count);

  if (!count) {
    els.collectionRoot.innerHTML = `
      <div class="coll-empty v-panel">
        <div class="v-readout-lg">No items yet</div>
        <p>Capture photos or scan a barcode,<br/>then commit to collection.</p>
      </div>`;
    return;
  }

  els.collectionRoot.innerHTML = "";

  for (const cat of CATEGORIES) {
    const items = state.items.filter((i) => i.category === cat.value);
    if (!items.length) continue;

    const section = document.createElement("section");
    section.className = "hub-section v-panel open";
    section.innerHTML = `
      <div class="hub-head">
        <span class="hub-name">${cat.label}</span>
        <span class="hub-count">${items.length}</span>
      </div>
      <div class="hub-items"></div>`;

    const list = section.querySelector(".hub-items");
    for (const item of items) {
      const thumb = item.photos[0]
        ? `<img class="item-thumb" src="${item.photos[0].url}" alt="" />`
        : `<div class="item-thumb item-thumb-empty">NO IMG</div>`;
      const title = item.title || "Unidentified";
      const meta = [
        `×${item.quantity}`,
        item.barcode || null,
        new Date(item.createdAt).toLocaleDateString(),
      ]
        .filter(Boolean)
        .join(" · ");

      const card = document.createElement("div");
      card.className = "item-card v-node";
      card.innerHTML = `
        ${thumb}
        <div class="item-info">
          <div class="item-title">${escapeHtml(title)}</div>
          <div class="item-meta">${escapeHtml(meta)}</div>
        </div>
        <button type="button" class="item-del" data-del="${item.id}" aria-label="Delete">×</button>`;
      list.appendChild(card);
    }

    section.querySelector(".hub-head").addEventListener("click", () => {
      section.classList.toggle("open");
    });

    section.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("Delete this item?")) return;
        try {
          await api(`/api/scouter/items/${btn.dataset.del}`, { method: "DELETE" });
          await loadItems();
          showToast("Item deleted");
        } catch (err) {
          showToast(err.message, "err");
        }
      });
    });

    els.collectionRoot.appendChild(section);
  }
}

async function loadItems() {
  const data = await api("/api/scouter/items");
  state.items = data.items;
  renderCollection();
}

function resetCapture() {
  state.draftPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
  state.draftPhotos = [];
  state.qty = 1;
  state.category = "other";
  state.title = "";
  state.barcode = "";
  els.qtyVal.textContent = "1";
  els.fieldCategory.value = "other";
  els.fieldNotes.value = "";
  els.fieldBarcode.value = "";
  els.fieldTitle.value = "";
  els.barcodeInput.value = "";
  els.manualTitle.value = "";
  els.manualRow.classList.add("hidden");
  renderPhotoGrid();
  setIdentifyStatus("Add photos or scan a barcode");
  updateSaveState();
}

async function lookupBarcode(code) {
  const trimmed = code.trim();
  if (!trimmed) {
    showToast("Enter or scan a barcode", "err");
    return;
  }

  state.barcode = trimmed;
  els.fieldBarcode.value = trimmed;
  els.barcodeInput.value = trimmed;
  setIdentifyStatus("Looking up product…", "busy");
  els.btnLookup.disabled = true;

  try {
    const result = await api(`/api/scouter/barcode/${encodeURIComponent(trimmed)}`);
    if (result.found && result.product) {
      state.title = result.product.title || state.title;
      els.fieldTitle.value = state.title;
      setIdentifyStatus(`Identified · ${result.product.lookupSource || "catalog"}`, "ok");
    } else {
      setIdentifyStatus("No catalog match — enter title manually", "err");
      els.manualRow.classList.remove("hidden");
    }
    updateSaveState();
  } catch (e) {
    setIdentifyStatus(e.message, "err");
    showToast(e.message, "err");
  } finally {
    els.btnLookup.disabled = false;
  }
}

async function uploadPhotos(itemId) {
  let item = null;
  const total = state.draftPhotos.length;

  for (let i = 0; i < total; i++) {
    els.btnSave.textContent = `Uploading photo ${i + 1}/${total}…`;

    let file = state.draftPhotos[i].file;
    if (window.ScouterImage) {
      file = await window.ScouterImage.compressPhoto(file);
    }

    const form = new FormData();
    form.append("photos", file);
    item = (await api(`/api/scouter/items/${itemId}/photos`, { method: "POST", body: form })).item;
  }

  return item;
}

async function saveCapture() {
  if (els.btnSave.disabled) return;

  els.btnSave.disabled = true;
  els.btnSave.textContent = "Committing…";

  try {
    let { item } = await api("/api/scouter/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: state.title.trim() || null,
        barcode: state.barcode.trim() || null,
        quantity: state.qty,
        category: state.category,
        notes: els.fieldNotes.value.trim() || null,
      }),
    });

    if (state.barcode.trim()) {
      const identified = await api(`/api/scouter/items/${item.id}/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode: state.barcode.trim(),
          title: state.title.trim() || null,
        }),
      });
      item = identified.item;
    }

    if (state.draftPhotos.length) {
      item = await uploadPhotos(item.id);
    }

    await loadItems();
    resetCapture();
    navigate("collection");
    showToast("Committed to collection");
  } catch (e) {
    showToast(e.message, "err");
    setIdentifyStatus(e.message, "err");
  } finally {
    els.btnSave.disabled = false;
    els.btnSave.textContent = "Commit to Collection";
    updateSaveState();
  }
}

function navigate(view) {
  const isCollection = view === "collection";
  els.viewCapture.classList.toggle("active", !isCollection);
  els.viewCollection.classList.toggle("active", isCollection);
  els.saveBar.classList.toggle("hidden", isCollection);
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });
  if (isCollection) stopScanner();
}

async function stopScanner() {
  if (state.scanLoop) {
    cancelAnimationFrame(state.scanLoop);
    state.scanLoop = null;
  }
  if (state.scanner) {
    state.scanner.stop();
    state.scanner = null;
  }
  els.scanOverlay.classList.remove("open");
  els.scanVideo.srcObject = null;
}

async function startScanner() {
  if (!("BarcodeDetector" in window)) {
    showToast("Barcode scan needs Safari 17+ or Chrome", "err");
    els.manualRow.classList.remove("hidden");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    els.scanVideo.srcObject = stream;
    els.scanOverlay.classList.add("open");

    const detector = new BarcodeDetector({
      formats: ["upc_a", "upc_e", "ean_13", "ean_8", "code_128"],
    });
    state.scanner = stream;

    const tick = async () => {
      if (!state.scanner) return;
      try {
        const codes = await detector.detect(els.scanVideo);
        if (codes.length) {
          const code = codes[0].rawValue;
          await stopScanner();
          els.barcodeInput.value = code;
          await lookupBarcode(code);
          showToast(`Barcode · ${code}`);
          return;
        }
      } catch {
        /* frame miss */
      }
      state.scanLoop = requestAnimationFrame(tick);
    };
    state.scanLoop = requestAnimationFrame(tick);
  } catch {
    showToast("Camera access denied", "err");
    await stopScanner();
  }
}

function initCategories() {
  els.fieldCategory.innerHTML = CATEGORIES.map(
    (c) => `<option value="${c.value}">${c.label}</option>`,
  ).join("");
  els.fieldCategory.value = state.category;
}

function bindEvents() {
  els.btnCamera.addEventListener("click", () => els.inputCamera.click());
  els.btnGallery.addEventListener("click", () => els.inputGallery.click());
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
  els.btnLookup.addEventListener("click", () => lookupBarcode(els.barcodeInput.value));
  els.barcodeInput.addEventListener("input", () => {
    state.barcode = els.barcodeInput.value.trim();
    els.fieldBarcode.value = state.barcode;
    updateSaveState();
  });
  els.barcodeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") lookupBarcode(els.barcodeInput.value);
  });
  els.btnManual.addEventListener("click", () => {
    els.manualRow.classList.remove("hidden");
    els.manualTitle.focus();
  });
  els.btnManualOk.addEventListener("click", () => {
    state.title = els.manualTitle.value.trim();
    els.fieldTitle.value = state.title;
    if (state.title) {
      setIdentifyStatus(`Manual · ${state.title}`, "ok");
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
  els.fieldCategory.addEventListener("change", () => {
    state.category = els.fieldCategory.value;
  });

  els.btnSave.addEventListener("click", saveCapture);

  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => navigate(tab.dataset.view));
  });
}

async function init() {
  initCategories();
  bindEvents();
  renderPhotoGrid();
  updateSaveState();

  try {
    await api("/api/health");
  } catch {
    showToast("API offline — refresh the page", "err");
  }

  loadItems().catch((e) => showToast(e.message, "err"));
}

init();
