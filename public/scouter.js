const CATEGORIES = [
  { value: "pokemon_sealed", label: "Pokemon Sealed", core: "#FFB43D", hi: "#FFD98A", icon: "📦" },
  { value: "graded_slabs", label: "Graded Slabs", core: "#2BD9C0", hi: "#8FF6E8", icon: "🏆" },
  { value: "raw_cards", label: "Raw Cards", core: "#4FA8D8", hi: "#BFE9FF", icon: "🃏" },
  { value: "sports_cards", label: "Sports Cards", core: "#2E6F91", hi: "#7FD4FF", icon: "⚾" },
  { value: "other", label: "Other", core: "#4FC3F7", hi: "#A8E4FF", icon: "📋" },
];

const catMap = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));

const state = {
  items: [],
  draftPhotos: [],
  scanner: null,
  scannerActive: false,
};

const els = {
  collectionView: document.getElementById("view-collection"),
  captureView: document.getElementById("view-capture"),
  collectionEmpty: document.getElementById("collection-empty"),
  collectionHubs: document.getElementById("collection-hubs"),
  totalCount: document.getElementById("total-count"),
  photoGrid: document.getElementById("photo-grid"),
  photoCamera: document.getElementById("photo-camera"),
  photoGallery: document.getElementById("photo-gallery"),
  scannerBox: document.getElementById("scanner-box"),
  toggleScanner: document.getElementById("toggle-scanner"),
  barcodeInput: document.getElementById("barcode-input"),
  lookupBtn: document.getElementById("lookup-btn"),
  lookupResult: document.getElementById("lookup-result"),
  titleInput: document.getElementById("title-input"),
  qtyInput: document.getElementById("qty-input"),
  categoryInput: document.getElementById("category-input"),
  notesInput: document.getElementById("notes-input"),
  saveBtn: document.getElementById("save-btn"),
  detailSheet: document.getElementById("detail-sheet"),
  detailContent: document.getElementById("detail-content"),
  detailClose: document.getElementById("detail-close"),
  toast: document.getElementById("toast"),
};

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => els.toast.classList.add("hidden"), 2600);
}

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
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

function holoCardHtml(item, cat) {
  const thumb = item.photos[0]
    ? `<img class="holo-card__img" src="${item.photos[0].url}" alt="" />`
    : `<div class="holo-card__placeholder">${cat.icon}</div>`;
  const title = item.title || "Unidentified";
  const meta = item.barcode ? `×${item.quantity} · ${item.barcode}` : `×${item.quantity}`;
  return `
    <button class="holo-card" data-id="${item.id}" type="button" style="--card-core:${cat.core}">
      <div class="holo-card__frame">${thumb}</div>
      <div class="holo-card__body">
        <div class="holo-card__title">${escapeHtml(title)}</div>
        <div class="holo-card__meta">${escapeHtml(meta)}</div>
      </div>
    </button>`;
}

function renderCollection() {
  const count = state.items.length;
  els.totalCount.textContent = `${count} scan${count === 1 ? "" : "s"}`;
  els.collectionEmpty.classList.toggle("hidden", count > 0);
  els.collectionHubs.innerHTML = "";

  for (const cat of CATEGORIES) {
    const items = state.items.filter((i) => i.category === cat.value);
    const section = document.createElement("section");
    section.className = "hub-section";
    section.innerHTML = `
      <div class="hub-section__head">
        <div class="hub-section__icon" style="background:${cat.hi}22;box-shadow:inset 0 0 0 1.5px ${cat.core},0 0 20px -8px ${cat.core}">${cat.icon}</div>
        <div>
          <div class="hub-section__label">Category</div>
          <div class="hub-section__title">${cat.label}</div>
        </div>
        <div class="hub-section__count" style="color:${items.length ? cat.hi : "var(--lo)"}">${String(items.length).padStart(2, "0")}</div>
      </div>
      <div class="holo-scroll">${items.length ? items.map((i) => holoCardHtml(i, cat)).join("") : `<div style="color:var(--lo);font-size:0.8rem;padding:8px 4px">No items yet</div>`}</div>
    `;
    section.querySelectorAll(".holo-card").forEach((btn) => {
      btn.addEventListener("click", () => openDetail(btn.dataset.id));
    });
    els.collectionHubs.appendChild(section);
  }
}

function renderDraftPhotos() {
  els.photoGrid.innerHTML = state.draftPhotos
    .map(
      (p, i) =>
        `<div class="photo-thumb"><img src="${p.previewUrl}" alt="Draft ${i + 1}" /></div>`,
    )
    .join("");
}

function resetCapture() {
  state.draftPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
  state.draftPhotos = [];
  renderDraftPhotos();
  els.barcodeInput.value = "";
  els.titleInput.value = "";
  els.qtyInput.value = "1";
  els.categoryInput.value = "other";
  els.notesInput.value = "";
  els.lookupResult.classList.add("hidden");
  els.lookupResult.classList.remove("lookup-result--found");
}

function addFiles(fileList) {
  for (const file of fileList ?? []) {
    if (!file.type.startsWith("image/")) continue;
    state.draftPhotos.push({ file, previewUrl: URL.createObjectURL(file) });
  }
  renderDraftPhotos();
}

async function loadItems() {
  const data = await api("/api/scouter/items");
  state.items = data.items;
  renderCollection();
}

async function stopScanner() {
  if (!state.scanner) return;
  try {
    await state.scanner.stop();
    await state.scanner.clear();
  } catch { /* already stopped */ }
  state.scanner = null;
  state.scannerActive = false;
  els.scannerBox.classList.add("hidden");
  els.scannerBox.innerHTML = "";
  els.toggleScanner.textContent = "Start camera scanner";
}

async function startScanner() {
  if (!window.Html5Qrcode) {
    showToast("Scanner library not loaded");
    return;
  }
  if (state.scannerActive) {
    await stopScanner();
    return;
  }

  els.scannerBox.classList.remove("hidden");
  els.scannerBox.innerHTML = '<div id="qr-reader"></div>';
  els.toggleScanner.textContent = "Stop camera scanner";

  state.scanner = new Html5Qrcode("qr-reader", {
    formatsToSupport: [
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.CODE_128,
    ],
  });

  await state.scanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 260, height: 140 } },
    (code) => {
      els.barcodeInput.value = code;
      showToast(`Scanned ${code}`);
      stopScanner();
      lookupProduct();
    },
    () => {},
  );
  state.scannerActive = true;
}

function applyLookup(result) {
  els.lookupResult.classList.remove("hidden");
  if (result.found && result.product) {
    els.lookupResult.classList.add("lookup-result--found");
    if (!els.titleInput.value) els.titleInput.value = result.product.title || "";
    els.lookupResult.textContent = `Matched via ${result.product.lookupSource}. Edit title if needed.`;
  } else {
    els.lookupResult.classList.remove("lookup-result--found");
    els.lookupResult.textContent = "No catalog match — add a title manually.";
  }
}

async function lookupProduct() {
  const code = els.barcodeInput.value.trim();
  if (!code) {
    showToast("Enter or scan a barcode first");
    return;
  }
  els.lookupBtn.disabled = true;
  els.lookupBtn.textContent = "Looking up…";
  try {
    applyLookup(await api(`/api/scouter/barcode/${encodeURIComponent(code)}`));
  } catch (e) {
    showToast(e.message);
  } finally {
    els.lookupBtn.disabled = false;
    els.lookupBtn.textContent = "Identify product";
  }
}

async function saveCapture() {
  const hasPhoto = state.draftPhotos.length > 0;
  const hasBarcode = els.barcodeInput.value.trim();
  const hasTitle = els.titleInput.value.trim();
  if (!hasPhoto && !hasBarcode && !hasTitle) {
    showToast("Add a photo, barcode, or title");
    return;
  }

  els.saveBtn.disabled = true;
  els.saveBtn.textContent = "Saving…";
  try {
    let { item } = await api("/api/scouter/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: hasTitle || null,
        barcode: hasBarcode || null,
        quantity: Number(els.qtyInput.value) || 1,
        category: els.categoryInput.value,
        notes: els.notesInput.value.trim() || null,
      }),
    });

    if (hasBarcode) {
      const identified = await api(`/api/scouter/items/${item.id}/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode: hasBarcode,
          title: els.titleInput.value.trim() || null,
        }),
      });
      item = identified.item;
      if (identified.lookup?.found && !els.titleInput.value.trim()) {
        els.titleInput.value = item.title || "";
      }
    }

    if (state.draftPhotos.length) {
      const form = new FormData();
      for (const p of state.draftPhotos) form.append("photos", p.file);
      item = (await api(`/api/scouter/items/${item.id}/photos`, { method: "POST", body: form })).item;
    }

    await loadItems();
    resetCapture();
    navigate("collection");
    showToast("Saved to collection");
  } catch (e) {
    showToast(e.message);
  } finally {
    els.saveBtn.disabled = false;
    els.saveBtn.textContent = "Save to collection";
  }
}

function openDetail(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  const cat = catMap[item.category] || catMap.other;
  const photos = item.photos.length
    ? item.photos.map((p) => `<img src="${p.url}" alt="" />`).join("")
    : `<div style="color:var(--lo);font-size:0.85rem">No photos</div>`;

  els.detailContent.innerHTML = `
    <h2 style="margin:0 0 4px;font-size:1.1rem">${escapeHtml(item.title || "Unidentified")}</h2>
    <div style="font-family:var(--mono);font-size:0.7rem;color:var(--lo);letter-spacing:0.12em">${cat.label.toUpperCase()}</div>
    <div class="detail-photos">${photos}</div>
    <div class="detail-row"><span>Quantity</span><span>${item.quantity}</span></div>
    <div class="detail-row"><span>Barcode</span><span>${escapeHtml(item.barcode || "—")}</span></div>
    <div class="detail-row"><span>Notes</span><span>${escapeHtml(item.notes || "—")}</span></div>
    <button type="button" class="btn btn--danger btn--block" id="delete-item">Delete scan</button>
  `;
  document.getElementById("delete-item").addEventListener("click", async () => {
    await api(`/api/scouter/items/${id}`, { method: "DELETE" });
    els.detailSheet.close();
    await loadItems();
    showToast("Deleted");
  });
  els.detailSheet.showModal();
}

function navigate(view) {
  const isCollection = view === "collection";
  els.collectionView.classList.toggle("view--active", isCollection);
  els.collectionView.hidden = !isCollection;
  els.captureView.classList.toggle("view--active", !isCollection);
  els.captureView.hidden = isCollection;
  document.querySelectorAll(".tabbar__btn").forEach((btn) => {
    const active = btn.dataset.nav === view;
    btn.classList.toggle("tabbar__btn--active", active);
    btn.toggleAttribute("aria-current", active);
  });
  if (isCollection) stopScanner();
}

// Init category select
for (const cat of CATEGORIES) {
  const opt = document.createElement("option");
  opt.value = cat.value;
  opt.textContent = cat.label;
  els.categoryInput.appendChild(opt);
}

els.photoCamera.addEventListener("change", (e) => {
  addFiles(e.target.files);
  e.target.value = "";
});
els.photoGallery.addEventListener("change", (e) => {
  addFiles(e.target.files);
  e.target.value = "";
});
els.toggleScanner.addEventListener("click", () => startScanner().catch((e) => showToast(e.message)));
els.lookupBtn.addEventListener("click", lookupProduct);
els.saveBtn.addEventListener("click", saveCapture);
els.detailClose.addEventListener("click", () => els.detailSheet.close());
document.querySelectorAll("[data-nav]").forEach((el) => {
  el.addEventListener("click", () => navigate(el.dataset.nav));
});

loadItems().catch((e) => showToast(e.message));
