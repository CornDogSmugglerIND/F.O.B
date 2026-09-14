/** Base44 route shell — nav + Intake/Scouter from live silky bundle (Zle/Mle/tle). */
const LS_KEY = "scouter-items-v1";
const ROUTES = {
  "/": { id: "view-command", brand: "COMMAND" },
  "/inventory": { id: "view-inventory", brand: "SCOUTER" },
  "/storage": { id: "view-storage", brand: "STORAGE" },
  "/channel": { id: "view-channel", brand: "CHANNEL" },
  "/scan-intake": { id: "view-intake", brand: "INTAKE" },
  "/settings": { id: "view-settings", brand: "SETTINGS" },
};

const state = {
  route: "/scan-intake",
  items: [],
  spaces: [],
  draftPhotos: [],
  title: "",
  barcode: "",
  qty: 1,
  category: "other",
  game: "ITM",
  batchName: "",
  backsIncluded: false,
  intakeMode: "list", // list | batch | identifying
  filterIntake: "",
  filterScouter: "",
  filterSpaces: "",
  channelTab: "live",
};

const SPACES_KEY = "scouter-spaces-v1";

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s || "").replace(/[<>&"']/g, (c) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function loadItems() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    state.items = raw ? JSON.parse(raw) : [];
  } catch {
    state.items = [];
  }
  const n = pad2(state.items.length);
  if ($("statCount")) $("statCount").textContent = n;
  if ($("scouterCount")) $("scouterCount").textContent = n;
  if ($("intakeValue")) $("intakeValue").textContent = n;
  if ($("cmdScouterCount")) $("cmdScouterCount").textContent = n;
  if ($("cmdToList")) $("cmdToList").textContent = n;
  if ($("pipeIntake")) $("pipeIntake").textContent = n;
  if ($("pipeReady")) $("pipeReady").textContent = "00";
  if ($("pipeListed")) $("pipeListed").textContent = "00";
  updateSitrep();
  renderCollection();
  renderIntakeList();
  renderSpaces();
  renderChannel();
}

function updateSitrep() {
  const waiting = state.items.length;
  if ($("sitrepTitle")) $("sitrepTitle").textContent = waiting ? "To list" : "All clear";
  if ($("sitrepHint")) {
    $("sitrepHint").textContent = waiting
      ? `${waiting} item${waiting === 1 ? "" : "s"} waiting on you`
      : "Nothing is blocked, errored, or sitting untouched.";
  }
}

function saveItems() {
  localStorage.setItem(LS_KEY, JSON.stringify(state.items));
  loadItems();
}

function navigate(route) {
  const path = ROUTES[route] ? route : "/scan-intake";
  state.route = path;
  const meta = ROUTES[path];
  document.querySelectorAll(".b44-view").forEach((el) => {
    el.classList.toggle("active", el.id === meta.id);
  });
  document.querySelectorAll(".b44-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.route === path);
  });
  if ($("pageBrand")) $("pageBrand").textContent = meta.brand;
  if (location.hash !== `#${path}`) history.replaceState(null, "", `#${path}`);
}

function setIntakeMode(mode) {
  state.intakeMode = mode;
  $("intakeList")?.classList.toggle("hidden", mode !== "list");
  $("intakeBatch")?.classList.toggle("hidden", mode !== "batch");
  $("intakeIdentifying")?.classList.toggle("hidden", mode !== "identifying");
}

function renderIntakeList() {
  const root = $("intakeBatches");
  const empty = $("intakeEmpty");
  if (!root || !empty) return;
  const q = state.filterIntake.trim().toLowerCase();
  const rows = state.items.filter((it) => {
    if (!q) return true;
    return String(it.title || "")
      .toLowerCase()
      .includes(q);
  });
  empty.classList.toggle("hidden", rows.length > 0);
  root.innerHTML = rows
    .slice(0, 40)
    .map((it) => {
      const thumb = it.photos?.[0]?.dataUrl || "";
      const badge = it.staged ? "STAGED" : "OPEN";
      const img = thumb
        ? `<img src="${thumb}" alt="" />`
        : `<div style="width:48px;height:48px;border-radius:8px;background:#0a0e14;border:1px solid rgba(255,255,255,0.1)"></div>`;
      return `<div class="v-panel v-cut-sm b44-item">${img}<div class="meta"><strong>${esc(it.title || "Untitled")}</strong><span>${badge} · ${esc(it.game || "ITM")}</span></div><div class="qty">×${it.quantity || 1}</div></div>`;
    })
    .join("");
}

function renderCollection() {
  const root = $("collectionRoot");
  const empty = $("scouterEmpty");
  if (!root) return;
  const q = state.filterScouter.trim().toLowerCase();
  const rows = state.items.filter((it) => {
    if (!q) return true;
    return String(it.title || "")
      .toLowerCase()
      .includes(q);
  });
  if (empty) empty.classList.toggle("hidden", rows.length > 0);
  if (!rows.length) {
    root.innerHTML = "";
    return;
  }
  root.innerHTML = rows
    .slice(0, 60)
    .map((it) => {
      const thumb = it.photos?.[0]?.dataUrl || "";
      const sku = it.barcode || "NO SKU";
      const img = thumb
        ? `<img src="${thumb}" alt="" />`
        : `<div style="width:48px;height:48px;border-radius:8px;background:#0a0e14;border:1px solid rgba(255,255,255,0.1)"></div>`;
      return `<div class="v-panel v-cut-sm b44-item">${img}<div class="meta"><strong>${esc(it.title || "Untitled")}</strong><span>${esc(sku)} · ${esc(it.game || "ITM")}</span></div><div class="qty">×${it.quantity || 1}</div></div>`;
    })
    .join("");
}

function renderPhotos() {
  const grid = $("photoGrid");
  if (!grid) return;
  grid.innerHTML = state.draftPhotos
    .map(
      (p, i) =>
        `<div class="b44-thumb"><img src="${p.dataUrl}" alt="" /><button type="button" data-rm="${i}" title="Remove">×</button></div>`,
    )
    .join("");
  grid.querySelectorAll("[data-rm]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.draftPhotos.splice(Number(btn.dataset.rm), 1);
      renderPhotos();
      updateSave();
    });
  });
}

function updateSave() {
  const canId = state.draftPhotos.length > 0;
  const canStage = !!(state.title.trim() && state.draftPhotos.length);
  if ($("btnStartIntake")) $("btnStartIntake").disabled = !canId;
  if ($("btnIdentify")) $("btnIdentify").disabled = !canId;
  if ($("btnSave")) $("btnSave").disabled = !canStage;
}

function setStatus(msg) {
  if ($("identifyStatus")) $("identifyStatus").textContent = msg;
}

async function addFiles(fileList) {
  const isImage = window.ScouterImage?.isImageFile ?? ((f) => f.type?.startsWith("image/"));
  const incoming = [...(fileList || [])].filter(isImage).slice(0, 8 - state.draftPhotos.length);
  if (!incoming.length) return;
  setStatus("Uploading…");
  const compressed = await window.ScouterImage.compressPhotos(incoming);
  for (const file of compressed) {
    const dataUrl = await window.ScouterImage.fileToDataUrl(file);
    state.draftPhotos.push({ dataUrl, file });
  }
  renderPhotos();
  updateSave();
  setStatus(`${state.draftPhotos.length} scan(s) ready`);
}

async function runIdentify() {
  const photos = state.draftPhotos.map((p) => p.dataUrl).filter(Boolean);
  if (!photos.length) {
    setStatus("Need photos first");
    return false;
  }
  setIntakeMode("identifying");
  setStatus("IDENTIFYING…");
  try {
    const res = await fetch("/api/scouter/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        photos,
        category: state.category,
        quantity: state.qty,
        game: state.game,
      }),
    });
    const result = await res.json();
    setIntakeMode("batch");
    if (result.identity?.product_name) {
      state.title = result.identity.product_name;
      if ($("manualTitle")) $("manualTitle").value = state.title;
      setStatus(result.message || `Identified: ${state.title}`);
      updateSave();
      return true;
    }
    setStatus(result.message || "No match — set Manual. Photos kept.");
    updateSave();
    return false;
  } catch (e) {
    setIntakeMode("batch");
    setStatus(`Identify failed: ${e.message}. Photos kept.`);
    updateSave();
    return false;
  }
}

async function lookupBarcode(code) {
  const trimmed = String(code || "").trim();
  if (!trimmed) {
    setStatus("Enter a barcode");
    return;
  }
  state.barcode = trimmed;
  setStatus("Looking up barcode…");
  try {
    const res = await fetch(`/api/scouter/barcode/${encodeURIComponent(trimmed)}`);
    const result = await res.json();
    if (result.title || result.name || result.identity?.product_name) {
      state.title = result.title || result.name || result.identity.product_name;
      if ($("manualTitle")) $("manualTitle").value = state.title;
      setStatus(`Barcode: ${state.title}`);
    } else {
      setStatus(result.message || result.error || "No barcode match");
    }
  } catch (e) {
    setStatus(`Lookup failed: ${e.message}`);
  }
  updateSave();
}

function stageItem() {
  if (!state.title.trim() || !state.draftPhotos.length) return;
  const item = {
    id: crypto.randomUUID(),
    title: state.title.trim(),
    barcode: state.barcode || null,
    quantity: state.qty,
    category: state.category,
    game: state.game,
    batchName: state.batchName || null,
    staged: true,
    photos: state.draftPhotos.map((p) => ({ dataUrl: p.dataUrl })),
    createdAt: new Date().toISOString(),
  };
  state.items.unshift(item);
  saveItems();
  resetDraft();
  setStatus("Staged");
  setIntakeMode("list");
  navigate("/inventory");
}

function resetDraft() {
  state.draftPhotos = [];
  state.title = "";
  state.barcode = "";
  state.batchName = "";
  if ($("manualTitle")) $("manualTitle").value = "";
  if ($("barcodeInput")) $("barcodeInput").value = "";
  if ($("batchName")) $("batchName").value = "";
  if ($("backsIncluded")) $("backsIncluded").checked = false;
  renderPhotos();
  updateSave();
}

function openNewBatch() {
  resetDraft();
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  state.batchName = `BATCH-${stamp}`;
  if ($("batchName")) $("batchName").value = state.batchName;
  setIntakeMode("batch");
  setStatus("Drop scans here · or click to browse");
}

function bindDropZone() {
  const zone = $("dropZone");
  if (!zone) return;
  const open = () => $("inputGallery")?.click();
  zone.addEventListener("click", open);
  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  });
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("drag");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("drag");
    addFiles(e.dataTransfer?.files);
  });
}

function loadSpaces() {
  try {
    const raw = localStorage.getItem(SPACES_KEY);
    state.spaces = raw ? JSON.parse(raw) : [];
  } catch {
    state.spaces = [];
  }
}

function saveSpaces() {
  localStorage.setItem(SPACES_KEY, JSON.stringify(state.spaces));
  renderSpaces();
}

function renderSpaces() {
  loadSpaces();
  const root = $("spaceList");
  const empty = $("spaceEmpty");
  if (!root) return;
  const q = state.filterSpaces.trim().toLowerCase();
  const rows = state.spaces.filter((s) => {
    if (!q) return true;
    return String(s.name || "")
      .toLowerCase()
      .includes(q);
  });
  if ($("spaceCount")) $("spaceCount").textContent = pad2(state.spaces.length);
  if (empty) empty.classList.toggle("hidden", rows.length > 0);
  root.innerHTML = rows
    .map(
      (s) =>
        `<div class="v-panel v-cut-sm b44-item"><div class="meta"><strong>${esc(s.name)}</strong><span>Warehouse · location</span></div><button type="button" class="m-btn" data-del-space="${esc(s.id)}">×</button></div>`,
    )
    .join("");
  root.querySelectorAll("[data-del-space]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.spaces = state.spaces.filter((s) => s.id !== btn.dataset.delSpace);
      saveSpaces();
    });
  });
}

function renderChannel() {
  const live = $("channelLive");
  const ship = $("channelShip");
  if (live) live.classList.toggle("hidden", state.channelTab !== "live");
  if (ship) ship.classList.toggle("hidden", state.channelTab !== "ship");
  $("tabLive")?.classList.toggle("m-btn-primary", state.channelTab === "live");
  $("tabShip")?.classList.toggle("m-btn-primary", state.channelTab === "ship");
  const list = $("channelList");
  const empty = $("channelEmpty");
  if (!list) return;
  // Local port: staged items show as intake pipeline; no live channel sync yet
  const rows = state.items.slice(0, 40);
  if (empty) empty.classList.toggle("hidden", rows.length > 0 && state.channelTab === "live");
  if (state.channelTab !== "live") {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = rows
    .map((it) => {
      const status = it.staged ? "Intake" : "Open";
      return `<div class="v-panel v-cut-sm b44-item"><div class="meta"><strong>${esc(it.title || "Untitled")}</strong><span>${status} · not published</span></div><div class="qty">×${it.quantity || 1}</div></div>`;
    })
    .join("");
}

function bind() {
  document.querySelectorAll(".b44-tab").forEach((tab) => {
    tab.addEventListener("click", () => navigate(tab.dataset.route));
  });
  document.querySelectorAll('a[href^="#/"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      navigate(a.getAttribute("href").slice(1));
    });
  });
  window.addEventListener("hashchange", () => {
    const path = location.hash.replace(/^#/, "") || "/scan-intake";
    navigate(path);
  });

  $("btnNewBatch")?.addEventListener("click", () => openNewBatch());
  $("btnCancelBatch")?.addEventListener("click", () => {
    resetDraft();
    setIntakeMode("list");
  });
  $("inputGallery")?.addEventListener("change", (e) => {
    addFiles(e.target.files);
    e.target.value = "";
  });
  $("btnIdentify")?.addEventListener("click", () => runIdentify());
  $("btnStartIntake")?.addEventListener("click", async () => {
    const ok = await runIdentify();
    if (ok) updateSave();
  });
  $("btnSave")?.addEventListener("click", () => stageItem());
  $("btnManualOk")?.addEventListener("click", () => {
    state.title = ($("manualTitle")?.value || "").trim();
    updateSave();
    if (state.title) setStatus(`Title set: ${state.title}`);
  });
  $("btnLookup")?.addEventListener("click", () => lookupBarcode($("barcodeInput")?.value));
  $("barcodeInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      lookupBarcode($("barcodeInput").value);
    }
  });
  $("batchName")?.addEventListener("input", (e) => {
    state.batchName = e.target.value;
  });
  $("batchGame")?.addEventListener("change", (e) => {
    state.game = e.target.value;
  });
  $("backsIncluded")?.addEventListener("change", (e) => {
    state.backsIncluded = !!e.target.checked;
  });
  $("intakeFilter")?.addEventListener("input", (e) => {
    state.filterIntake = e.target.value;
    renderIntakeList();
  });
  $("scouterFilter")?.addEventListener("input", (e) => {
    state.filterScouter = e.target.value;
    renderCollection();
  });
  $("manualTitle")?.addEventListener("input", (e) => {
    state.title = e.target.value.trim();
    updateSave();
  });

  bindDropZone();

  $("btnAddSpace")?.addEventListener("click", () => {
    const name = prompt("Location name (bin, shelf, or tote)");
    if (!name?.trim()) return;
    loadSpaces();
    state.spaces.unshift({
      id: crypto.randomUUID(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
    });
    saveSpaces();
  });
  $("spaceFilter")?.addEventListener("input", (e) => {
    state.filterSpaces = e.target.value;
    renderSpaces();
  });
  $("tabLive")?.addEventListener("click", () => {
    state.channelTab = "live";
    renderChannel();
  });
  $("tabShip")?.addEventListener("click", () => {
    state.channelTab = "ship";
    renderChannel();
  });
  $("btnChannelSync")?.addEventListener("click", () => {
    setStatus("Channel sync needs eBay connected in Settings.");
    alert("eBay isn't connected — publishing and sync are offline. Connect it in Settings.");
  });

  $("btnExport")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ items: state.items }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `coalition-intake-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  });
  $("btnImport")?.addEventListener("click", () => $("importFile").click());
  $("importFile")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        const incoming = Array.isArray(parsed) ? parsed : parsed.items;
        if (!Array.isArray(incoming)) throw new Error("Invalid file");
        state.items = incoming;
        saveItems();
      } catch (err) {
        setStatus(err.message || "Import failed");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });
  $("btnWipe")?.addEventListener("click", () => {
    if (!confirm("Wipe local intake on this phone?")) return;
    state.items = [];
    saveItems();
  });
}

loadItems();
bind();
setIntakeMode("list");
navigate((location.hash || "#/scan-intake").replace(/^#/, "") || "/scan-intake");
