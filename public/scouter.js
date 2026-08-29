const CATEGORIES = [
  { value: "pokemon_sealed", label: "Pokemon Sealed", core: "#FFB43D", hi: "#FFD98A", icon: "📦" },
  { value: "graded_slabs", label: "Graded Slabs", core: "#2BD9C0", hi: "#8FF6E8", icon: "🏆" },
  { value: "raw_cards", label: "Raw Cards", core: "#4FA8D8", hi: "#BFE9FF", icon: "🃏" },
  { value: "sports_cards", label: "Sports Cards", core: "#2E6F91", hi: "#7FD4FF", icon: "⚾" },
  { value: "other", label: "Other", core: "#4FC3F7", hi: "#A8E4FF", icon: "📋" },
];

const catMap = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = {
  items: [],
  draftPhotos: [],
  scanner: null,
  scannerActive: false,
  selectedCategory: "other",
};

const els = {
  hudBg: document.getElementById("hud-bg"),
  collectionView: document.getElementById("view-collection"),
  captureView: document.getElementById("view-capture"),
  collectionEmpty: document.getElementById("collection-empty"),
  collectionHubs: document.getElementById("collection-hubs"),
  totalCount: document.getElementById("total-count"),
  statusMode: document.getElementById("status-mode"),
  statusClock: document.getElementById("status-clock"),
  statusLink: document.getElementById("status-link"),
  photoGrid: document.getElementById("photo-grid"),
  photoCamera: document.getElementById("photo-camera"),
  photoGallery: document.getElementById("photo-gallery"),
  scannerWrap: document.getElementById("scanner-wrap"),
  scannerBox: document.getElementById("scanner-box"),
  toggleScanner: document.getElementById("toggle-scanner"),
  barcodeInput: document.getElementById("barcode-input"),
  lookupBtn: document.getElementById("lookup-btn"),
  lookupResult: document.getElementById("lookup-result"),
  titleInput: document.getElementById("title-input"),
  qtyInput: document.getElementById("qty-input"),
  qtyMinus: document.getElementById("qty-minus"),
  qtyPlus: document.getElementById("qty-plus"),
  categoryInput: document.getElementById("category-input"),
  categoryChips: document.getElementById("category-chips"),
  notesInput: document.getElementById("notes-input"),
  saveBtn: document.getElementById("save-btn"),
  detailSheet: document.getElementById("detail-sheet"),
  detailContent: document.getElementById("detail-content"),
  detailClose: document.getElementById("detail-close"),
  toast: document.getElementById("toast"),
  flash: document.getElementById("flash"),
};

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => els.toast.classList.add("hidden"), 2600);
}

function scanFlash() {
  if (reducedMotion) return;
  els.flash.classList.remove("hidden");
  els.flash.style.animation = "none";
  void els.flash.offsetWidth;
  els.flash.style.animation = "";
  setTimeout(() => els.flash.classList.add("hidden"), 350);
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
    <button class="holo-card" data-id="${item.id}" type="button"
      style="--card-core:${cat.core};--card-hi:${cat.hi}">
      <div class="holo-card__tilt">
        <div class="holo-card__frame">
          <div class="holo-card__brackets"><span></span><span></span><span></span><span></span></div>
          ${thumb}
        </div>
        <div class="holo-card__body">
          <div class="holo-card__title">${escapeHtml(title)}</div>
          <div class="holo-card__meta">${escapeHtml(meta)}</div>
        </div>
      </div>
    </button>`;
}

function bindCardTilt(card) {
  if (reducedMotion) return;
  const tilt = card.querySelector(".holo-card__tilt");
  if (!tilt) return;

  card.addEventListener("pointermove", (e) => {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    tilt.style.transform = `perspective(900px) rotateX(${(-py * 16).toFixed(2)}deg) rotateY(${(px * 16).toFixed(2)}deg) translateZ(12px)`;
  });
  card.addEventListener("pointerleave", () => {
    tilt.style.transform = "perspective(900px) rotateX(0) rotateY(0) translateZ(0)";
  });
}

function renderCollection() {
  const count = state.items.length;
  els.totalCount.textContent = String(count).padStart(2, "0");
  els.totalCount.classList.remove("count-pop");
  void els.totalCount.offsetWidth;
  els.totalCount.classList.add("count-pop");

  els.collectionEmpty.classList.toggle("hidden", count > 0);
  els.collectionHubs.innerHTML = "";

  for (const cat of CATEGORIES) {
    const items = state.items.filter((i) => i.category === cat.value);
    const section = document.createElement("section");
    section.className = "hub-section v-panel v-cut";
    section.style.setProperty("--hub-core", cat.core);
    section.innerHTML = `
      <div class="hub-section__head">
        <div class="hub-section__icon" style="background:${cat.hi}22;box-shadow:inset 0 0 0 1.5px ${cat.core},0 0 24px -8px ${cat.core}">${cat.icon}</div>
        <div>
          <div class="v-label">Category hub</div>
          <div class="hub-section__title">${cat.label}</div>
        </div>
        <div class="hub-section__count" style="color:${items.length ? cat.hi : "var(--lo)"};text-shadow:${items.length ? `0 0 16px ${cat.core}` : "none"}">${String(items.length).padStart(2, "0")}</div>
      </div>
      <div class="holo-scroll">${items.length ? items.map((i) => holoCardHtml(i, cat)).join("") : `<div class="v-label" style="padding:8px 4px">Awaiting scans</div>`}</div>
    `;
    section.querySelectorAll(".holo-card").forEach((btn) => {
      bindCardTilt(btn);
      btn.addEventListener("click", () => openDetail(btn.dataset.id));
    });
    els.collectionHubs.appendChild(section);
  }
}

function renderDraftPhotos() {
  els.photoGrid.innerHTML = state.draftPhotos
    .map(
      (p, i) =>
        `<div class="photo-thumb" style="animation-delay:${i * 0.04}s"><img src="${p.previewUrl}" alt="Draft ${i + 1}" /></div>`,
    )
    .join("");
}

function setCategory(value) {
  state.selectedCategory = value;
  els.categoryInput.value = value;
  els.categoryChips.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("chip--active", chip.dataset.value === value);
  });
}

function renderCategoryChips() {
  els.categoryChips.innerHTML = CATEGORIES.map(
    (c) => `<button type="button" class="chip${c.value === state.selectedCategory ? " chip--active" : ""}" data-value="${c.value}">${c.label}</button>`,
  ).join("");
  els.categoryChips.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => setCategory(chip.dataset.value));
  });
}

function resetCapture() {
  state.draftPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
  state.draftPhotos = [];
  renderDraftPhotos();
  els.barcodeInput.value = "";
  els.titleInput.value = "";
  els.qtyInput.value = "1";
  setCategory("other");
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
  if (state.draftPhotos.length) showToast(`${state.draftPhotos.length} photo(s) loaded`);
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
  } catch { /* stopped */ }
  state.scanner = null;
  state.scannerActive = false;
  els.scannerWrap.classList.add("hidden");
  els.scannerBox.innerHTML = "";
  els.scannerWrap.classList.remove("scanner-wrap--locked");
  els.toggleScanner.textContent = "Activate reticle scanner";
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

  els.scannerWrap.classList.remove("hidden");
  els.scannerBox.innerHTML = '<div id="qr-reader"></div>';
  els.toggleScanner.textContent = "Disengage scanner";

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
    { fps: 12, qrbox: { width: 260, height: 140 } },
    (code) => {
      els.scannerWrap.classList.add("scanner-wrap--locked");
      els.barcodeInput.value = code;
      scanFlash();
      showToast(`Lock · ${code}`);
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
    els.lookupResult.textContent = `IDENTIFIED · ${result.product.lookupSource}`;
  } else {
    els.lookupResult.classList.remove("lookup-result--found");
    els.lookupResult.textContent = "NO CATALOG MATCH · enter title manually";
  }
}

async function lookupProduct() {
  const code = els.barcodeInput.value.trim();
  if (!code) {
    showToast("Scan or enter a barcode");
    return;
  }
  els.lookupBtn.disabled = true;
  els.lookupBtn.textContent = "Scanning catalogs…";
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
    showToast("Add photo, barcode, or title");
    return;
  }

  els.saveBtn.disabled = true;
  els.saveBtn.textContent = "Committing…";
  try {
    let { item } = await api("/api/scouter/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: hasTitle || null,
        barcode: hasBarcode || null,
        quantity: Number(els.qtyInput.value) || 1,
        category: state.selectedCategory,
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
    }

    if (state.draftPhotos.length) {
      const form = new FormData();
      for (const p of state.draftPhotos) form.append("photos", p.file);
      item = (await api(`/api/scouter/items/${item.id}/photos`, { method: "POST", body: form })).item;
    }

    scanFlash();
    await loadItems();
    resetCapture();
    navigate("collection");
    showToast("Committed to collection");
  } catch (e) {
    showToast(e.message);
  } finally {
    els.saveBtn.disabled = false;
    els.saveBtn.textContent = "Commit to collection";
  }
}

function openDetail(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  const cat = catMap[item.category] || catMap.other;
  const photos = item.photos.length
    ? item.photos.map((p) => `<img src="${p.url}" alt="" />`).join("")
    : `<div class="v-label">No photos</div>`;

  els.detailContent.innerHTML = `
    <div class="v-label">${cat.label.toUpperCase()}</div>
    <h2 class="v-readout v-readout--sm" style="margin:6px 0 0">${escapeHtml(item.title || "UNIDENTIFIED")}</h2>
    <div class="detail-photos">${photos}</div>
    <div class="detail-row"><span>Qty</span><span>${item.quantity}</span></div>
    <div class="detail-row"><span>Barcode</span><span>${escapeHtml(item.barcode || "—")}</span></div>
    <div class="detail-row"><span>Notes</span><span>${escapeHtml(item.notes || "—")}</span></div>
    <button type="button" class="btn btn--danger btn--block btn--lift" id="delete-item">Purge scan</button>
  `;
  document.getElementById("delete-item").addEventListener("click", async () => {
    await api(`/api/scouter/items/${id}`, { method: "DELETE" });
    els.detailSheet.close();
    await loadItems();
    showToast("Scan purged");
  });
  els.detailSheet.showModal();
}

function navigate(view) {
  const isCollection = view === "collection";
  els.collectionView.classList.toggle("view--active", isCollection);
  els.collectionView.hidden = !isCollection;
  els.captureView.classList.toggle("view--active", !isCollection);
  els.captureView.hidden = isCollection;
  els.statusMode.textContent = isCollection ? "COLLECTION" : "CAPTURE";
  document.querySelectorAll(".tabbar__btn").forEach((btn) => {
    const active = btn.dataset.nav === view;
    btn.classList.toggle("tabbar__btn--active", active);
    btn.toggleAttribute("aria-current", active);
  });
  if (isCollection) stopScanner();
}

function initHudParallax() {
  if (reducedMotion) return;
  window.addEventListener("pointermove", (e) => {
    const px = (e.clientX / window.innerWidth) * 100;
    const py = (e.clientY / window.innerHeight) * 100;
    els.hudBg.style.setProperty("--px", `${px}%`);
    els.hudBg.style.setProperty("--py", `${py}%`);
    els.hudBg.style.transform = `translate(${(px - 50) * 0.012}px, ${(py - 50) * 0.012}px)`;
  }, { passive: true });
}

function initClock() {
  const tick = () => {
    const d = new Date();
    els.statusClock.textContent = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  };
  tick();
  setInterval(tick, 30_000);
}

async function checkLink() {
  try {
    await api("/api/health");
    els.statusLink.textContent = "ONLINE";
    els.statusLink.style.color = "var(--green-hi)";
  } catch {
    els.statusLink.textContent = "OFFLINE";
    els.statusLink.style.color = "var(--bad)";
  }
}

for (const cat of CATEGORIES) {
  const opt = document.createElement("option");
  opt.value = cat.value;
  opt.textContent = cat.label;
  els.categoryInput.appendChild(opt);
}
renderCategoryChips();
initHudParallax();
initClock();
checkLink();

els.qtyMinus.addEventListener("click", () => {
  els.qtyInput.value = String(Math.max(1, Number(els.qtyInput.value) - 1));
});
els.qtyPlus.addEventListener("click", () => {
  els.qtyInput.value = String(Math.max(1, Number(els.qtyInput.value) + 1));
});

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
