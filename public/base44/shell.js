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
  game: "PKM",
  batchName: "",
  backsIncluded: true,
  intakeMode: "list", // list | batch | identifying
  filterIntake: "",
  filterScouter: "",
  filterSpaces: "",
  spaceTrail: [],
  channelTab: "live",
  settingsTab: "templates",
  templates: [],
  shipping: [],
  storageDefs: [],
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

function money(n) {
  return "$" + Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Live Si pipeline steps (tle). */
const PIPE_STEPS = [
  { key: "sorted", label: "Intake", match: (it) => !it.staged && it.listingStatus !== "listed" },
  { key: "ready_to_list", label: "Listing Built", match: (it) => !!it.staged && it.listingStatus !== "listed" },
  { key: "listed", label: "Listed", match: (it) => it.listingStatus === "listed" },
];

function itemPipeLabel(it) {
  if (it.listingStatus === "listed") return "Listed";
  if (it.staged) return "Listing Built";
  return "Intake";
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
      : "Nothing is blocked — the void is clear.";
  }
  renderCmdAttention();
}

const SPACE_KINDS = [
  { value: "warehouse", label: "Warehouse" },
  { value: "room", label: "Room" },
  { value: "shelf", label: "Shelf" },
  { value: "tote", label: "Tote" },
  { value: "binder", label: "Binder" },
  { value: "page", label: "Page" },
  { value: "pocket", label: "Pocket" },
];

function kindLabel(kind) {
  return SPACE_KINDS.find((k) => k.value === kind)?.label || "Warehouse";
}

function renderCmdAttention() {
  const root = $("cmdAttention");
  if (!root) return;
  // Live $K only pushes cards when count > 0.
  const cards = [];
  const push = (c) => {
    if (c.count > 0) cards.push(c);
  };
  const staged = state.items.filter((it) => it.staged);
  const needsReview = state.items.filter(
    (it) => it.needsReview || it.confidence === "Low" || it.confidence === "Failed" || (!it.title && !it.staged),
  );
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const stalled = state.items.filter((it) => {
    if (it.listingStatus === "listed") return false;
    const t = Date.parse(it.updatedAt || it.createdAt || "") || 0;
    return t && Date.now() - t >= weekMs;
  });
  push({
    key: "publish",
    tone: "act",
    to: "/inventory",
    label: "Built, not published",
    detail: "Listing is ready to go live",
    count: staged.length,
  });
  push({
    key: "review",
    tone: "act",
    to: "/scan-intake",
    label: "Scans needing review",
    detail: "Low confidence or unidentified",
    count: needsReview.length,
  });
  push({
    key: "stalled",
    tone: "idle",
    to: "/inventory",
    label: "Untouched 7+ days",
    detail: "Sitting in the pipeline going nowhere",
    count: stalled.length,
  });
  const toneRank = { bad: 0, act: 1, idle: 2 };
  cards.sort((a, b) => toneRank[a.tone] - toneRank[b.tone] || b.count - a.count);
  root.innerHTML = cards
    .map(
      (c) =>
        `<a class="b44-attn ${esc(c.tone)}" href="#${esc(c.to)}"><div><strong>${esc(c.label)}</strong><span>${esc(c.detail)}</span></div><div class="v-readout v-emit-gold" style="font-size:18px">${pad2(c.count)}</div></a>`,
    )
    .join("");
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
  if (path === "/settings") {
    setSettingsTab(state.settingsTab || "templates");
    renderSettings();
  }
  if (path === "/storage") renderSpaces();
  if (path === "/channel") renderChannel();
  if (path === "/" || path === "/command") updateSitrep();
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
      const badge = itemPipeLabel(it);
      const img = thumb
        ? `<img src="${thumb}" alt="" />`
        : `<div style="width:48px;height:48px;border-radius:8px;background:#0a0e14;border:1px solid rgba(255,255,255,0.1)"></div>`;
      return `<div class="v-panel v-cut-sm b44-item">${img}<div class="meta"><strong>${esc(it.title || "Untitled")}</strong><span>${esc(badge)} · ${esc(it.game || "PKM")}</span></div><div class="qty">×${it.quantity || 1}</div></div>`;
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
    const hay = `${it.title || ""} ${it.barcode || ""} ${it.sku || ""} ${it.game || ""}`.toLowerCase();
    return hay.includes(q);
  });
  const intakeN = state.items.filter((it) => itemPipeLabel(it) === "Intake").length;
  const builtN = state.items.filter((it) => itemPipeLabel(it) === "Listing Built").length;
  const listedN = state.items.filter((it) => itemPipeLabel(it) === "Listed").length;
  const value = state.items
    .filter((it) => it.listingStatus !== "sold")
    .reduce((sum, it) => sum + (Number(it.marketValue) || 0) * (Number(it.quantity) || 1), 0);
  if ($("scoutStepIntake")) $("scoutStepIntake").textContent = pad2(intakeN);
  if ($("scoutStepBuilt")) $("scoutStepBuilt").textContent = pad2(builtN);
  if ($("scoutStepListed")) $("scoutStepListed").textContent = pad2(listedN);
  if ($("scouterValue")) $("scouterValue").textContent = money(value);
  if (empty) empty.classList.toggle("hidden", rows.length > 0);
  if (!rows.length) {
    root.innerHTML = "";
    return;
  }
  root.innerHTML = rows
    .slice(0, 60)
    .map((it) => {
      const thumb = it.photos?.[0]?.dataUrl || "";
      const sku = it.barcode || it.sku || "NO SKU";
      const step = itemPipeLabel(it);
      const price = money(it.marketValue);
      const img = thumb
        ? `<img src="${thumb}" alt="" />`
        : `<div style="width:48px;height:48px;border-radius:8px;background:#0a0e14;border:1px solid rgba(255,255,255,0.1)"></div>`;
      return `<div class="v-panel v-cut-sm b44-item">${img}<div class="meta"><strong>${esc(it.title || "Untitled")}</strong><span>${esc(step)} · ${esc(sku)} · ${esc(it.game || "PKM")}</span></div><div class="qty"><div class="v-readout v-emit-gold" style="font-size:14px">${esc(price)}</div><div>×${it.quantity || 1}</div></div></div>`;
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
  if ($("identifyStage")) $("identifyStage").textContent = "IDENTIFYING…";
  if ($("identifyPct")) $("identifyPct").textContent = "…";
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
  const now = new Date();
  const mon = now.toLocaleString("en-US", { month: "short" }).toUpperCase();
  const day = String(now.getDate()).padStart(2, "0");
  state.batchName = `BATCH-${mon}${day}`;
  state.game = "PKM";
  state.backsIncluded = true;
  if ($("batchName")) $("batchName").value = state.batchName;
  if ($("batchTitle")) $("batchTitle").textContent = state.batchName;
  if ($("batchGame")) $("batchGame").value = "PKM";
  if ($("backsIncluded")) $("backsIncluded").checked = true;
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

function currentSpaceParentId() {
  return state.spaceTrail.length ? state.spaceTrail[state.spaceTrail.length - 1] : "";
}

function spaceById(id) {
  return state.spaces.find((s) => s.id === id);
}

function renderSpaces() {
  loadSpaces();
  const root = $("spaceList");
  const empty = $("spaceEmpty");
  if (!root) return;
  const parentId = currentSpaceParentId();
  const q = state.filterSpaces.trim().toLowerCase();
  const rows = state.spaces
    .filter((s) => (s.parentId || "") === parentId)
    .filter((s) => {
      if (!q) return true;
      const hay = `${s.name || ""} ${s.code || ""} ${s.kind || ""}`.toLowerCase();
      return hay.includes(q);
    });
  const totalHere = state.spaces.filter((s) => (s.parentId || "") === parentId).length;
  if ($("spaceCount")) $("spaceCount").textContent = pad2(totalHere);
  const crumb = parentId
    ? state.spaceTrail.map((id) => spaceById(id)?.name || "…").join(" / ")
    : "ALL STORAGE";
  if ($("spaceBreadcrumb")) $("spaceBreadcrumb").textContent = crumb;
  $("btnSpaceUp")?.classList.toggle("hidden", !parentId);
  if (empty) {
    empty.classList.toggle("hidden", rows.length > 0);
    const label = empty.querySelector(".v-label");
    const p = empty.querySelector("p");
    if (label) label.textContent = "No locations yet";
    if (p) p.textContent = "No locations yet — create one below.";
  }
  root.innerHTML = rows
    .map((s) => {
      const kind = kindLabel(s.kind);
      const code = s.code ? `${esc(s.code)} · ` : "";
      const kids = state.spaces.filter((c) => (c.parentId || "") === s.id).length;
      const sub = kids ? `${code}${esc(kind)} · ${kids} inside` : `${code}${esc(kind)}`;
      return `<div class="v-panel v-cut-sm b44-item" data-open-space="${esc(s.id)}" style="cursor:pointer"><div class="meta"><strong>${esc(s.name)}</strong><span>${sub}</span></div><button type="button" class="m-btn" data-del-space="${esc(s.id)}">×</button></div>`;
    })
    .join("");
  root.querySelectorAll("[data-open-space]").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("[data-del-space]")) return;
      state.spaceTrail = [...state.spaceTrail, row.dataset.openSpace];
      renderSpaces();
    });
  });
  root.querySelectorAll("[data-del-space]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.delSpace;
      const drop = new Set([id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const s of state.spaces) {
          if (drop.has(s.parentId || "") && !drop.has(s.id)) {
            drop.add(s.id);
            grew = true;
          }
        }
      }
      state.spaces = state.spaces.filter((s) => !drop.has(s.id));
      state.spaceTrail = state.spaceTrail.filter((x) => !drop.has(x));
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
  const intake = state.items.filter((it) => !it.staged).length;
  const ready = state.items.filter((it) => it.staged).length;
  if ($("pipeIntake")) $("pipeIntake").textContent = pad2(intake);
  if ($("pipeReady")) $("pipeReady").textContent = pad2(ready);
  if ($("pipeListed")) $("pipeListed").textContent = "00";
  const list = $("channelList");
  const empty = $("channelEmpty");
  if (!list) return;
  // Local port: intake pipeline rows until eBay sync exists
  const rows = state.items.slice(0, 40);
  if (empty) {
    empty.classList.toggle("hidden", rows.length > 0 && state.channelTab === "live");
    const p = empty.querySelector("p");
    if (p) p.textContent = "Run a sync to pull your live listings.";
  }
  if (state.channelTab !== "live") {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = rows
    .map((it) => {
      const status = it.staged ? "Listing Built" : "Intake";
      const sku = it.barcode || it.sku || "NO SKU";
      const price = Number(it.marketValue ?? it.price);
      const priceBit = Number.isFinite(price) && price > 0 ? ` · $${price.toFixed(2)}` : "";
      const thumb = it.photos?.[0]?.dataUrl || "";
      const img = thumb
        ? `<img src="${thumb}" alt="" />`
        : `<div style="width:48px;height:48px;border-radius:8px;background:#0a0e14;border:1px solid rgba(255,255,255,0.1)"></div>`;
      return `<div class="v-panel v-cut-sm b44-item">${img}<div class="meta"><strong>${esc(it.title || "Untitled")}</strong><span>${esc(status)} · ${esc(sku)}${priceBit} · not published</span></div><div class="qty">×${it.quantity || 1}</div></div>`;
    })
    .join("");
}


const SETTINGS_KEY = "scouter-settings-v1";

function loadSettingsLocal() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    state.templates = Array.isArray(parsed.templates) ? parsed.templates : [];
    state.shipping = Array.isArray(parsed.shipping) ? parsed.shipping : [];
    state.storageDefs = Array.isArray(parsed.storageDefs) ? parsed.storageDefs : [];
  } catch {
    state.templates = [];
    state.shipping = [];
    state.storageDefs = [];
  }
}

function saveSettingsLocal() {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      templates: state.templates,
      shipping: state.shipping,
      storageDefs: state.storageDefs,
    }),
  );
  renderSettings();
}

function setSettingsTab(tab) {
  state.settingsTab = tab;
  document.querySelectorAll("[data-settings-tab]").forEach((btn) => {
    btn.classList.toggle("m-btn-primary", btn.dataset.settingsTab === tab);
  });
  ["templates", "shipping", "storage", "diagnostic", "agent"].forEach((id) => {
    $(`settings-${id}`)?.classList.toggle("hidden", id !== tab);
  });
}

function renderSettings() {
  loadSettingsLocal();
  const tRoot = $("templateList");
  const tEmpty = $("templateEmpty");
  if (tRoot) {
    tRoot.innerHTML = state.templates
      .map(
        (t) =>
          `<div class="v-panel v-cut-sm b44-item"><div class="meta"><strong>${esc(t.name)}</strong><span>Markup ${esc(String(t.markup ?? 0))}%</span></div></div>`,
      )
      .join("");
    if (tEmpty) tEmpty.classList.toggle("hidden", state.templates.length > 0);
  }
  const sRoot = $("shipList");
  const sEmpty = $("shipEmpty");
  if (sRoot) {
    sRoot.innerHTML = state.shipping
      .map(
        (s) =>
          `<div class="v-panel v-cut-sm b44-item"><div class="meta"><strong>${esc(s.name)}</strong><span>${esc(s.carrier || "")} · $${esc(String(s.cost ?? 0))}</span></div></div>`,
      )
      .join("");
    if (sEmpty) sEmpty.classList.toggle("hidden", state.shipping.length > 0);
  }
  const dRoot = $("storageDefList");
  const dEmpty = $("storageDefEmpty");
  if (dRoot) {
    dRoot.innerHTML = state.storageDefs
      .map(
        (d) =>
          `<div class="v-panel v-cut-sm b44-item"><div class="meta"><strong>${esc(d.name)}</strong><span>${esc(d.code || "")}</span></div></div>`,
      )
      .join("");
    if (dEmpty) dEmpty.classList.toggle("hidden", state.storageDefs.length > 0);
  }
  if ($("aiConnectStatus")) {
    $("aiConnectStatus").textContent =
      "Identify is photo-first. If ANTHROPIC_API_KEY is set on the server, ID runs; otherwise you get an honest setup message — photos stay.";
  }
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
    if ($("batchTitle")) $("batchTitle").textContent = state.batchName || "New Scan Batch";
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

  $("btnSpaceUp")?.addEventListener("click", () => {
    state.spaceTrail = state.spaceTrail.slice(0, -1);
    renderSpaces();
  });
  $("spaceBreadcrumb")?.addEventListener("click", () => {
    if (!state.spaceTrail.length) return;
    state.spaceTrail = [];
    renderSpaces();
  });
  $("btnAddSpace")?.addEventListener("click", () => {
    const name = prompt("Location name", "Warehouse A");
    if (!name?.trim()) return;
    const kindRaw = prompt(
      "Kind (warehouse / room / shelf / tote / binder / page / pocket)",
      "warehouse",
    );
    const kind = SPACE_KINDS.some((k) => k.value === (kindRaw || "").trim().toLowerCase())
      ? (kindRaw || "").trim().toLowerCase()
      : "warehouse";
    const code = (prompt("Code (optional)", "") || "").trim();
    loadSpaces();
    state.spaces.unshift({
      id: crypto.randomUUID(),
      name: name.trim(),
      kind,
      code,
      parentId: currentSpaceParentId(),
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
  
  document.querySelectorAll("[data-settings-tab]").forEach((btn) => {
    btn.addEventListener("click", () => setSettingsTab(btn.dataset.settingsTab));
  });
  $("btnNewTemplate")?.addEventListener("click", () => {
    const name = prompt("Template name", "Default");
    if (!name?.trim()) return;
    const markup = Number(prompt("Markup %", "15") || 0);
    loadSettingsLocal();
    state.templates.unshift({ id: crypto.randomUUID(), name: name.trim(), markup });
    saveSettingsLocal();
  });
  $("btnNewShip")?.addEventListener("click", () => {
    const name = prompt("Preset name", "USPS Priority");
    if (!name?.trim()) return;
    const carrier = prompt("Carrier", "USPS") || "";
    const cost = Number(prompt("Cost ($)", "8.50") || 0);
    loadSettingsLocal();
    state.shipping.unshift({ id: crypto.randomUUID(), name: name.trim(), carrier, cost });
    saveSettingsLocal();
  });
  $("btnNewStorageDef")?.addEventListener("click", () => {
    const name = prompt("Location name", "Warehouse A");
    if (!name?.trim()) return;
    const code = prompt("Code", "WH-A") || "";
    loadSettingsLocal();
    state.storageDefs.unshift({ id: crypto.randomUUID(), name: name.trim(), code });
    saveSettingsLocal();
  });
  $("btnEbayDiag")?.addEventListener("click", () => {
    if ($("ebayDiagStatus")) {
      $("ebayDiagStatus").textContent =
        "Diagnostic call failed — eBay isn't connected. Connect it before publishing or sync.";
    }
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
loadSettingsLocal();
bind();
setIntakeMode("list");
setSettingsTab(state.settingsTab || "templates");
renderSettings();
navigate((location.hash || "#/scan-intake").replace(/^#/, "") || "/scan-intake");
