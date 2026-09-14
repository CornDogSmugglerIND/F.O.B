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
  lockedItemId: null,
  readoutStatus: "",
  shipments: [],
  ebayConnected: false,
  mcpClient: "claude",
  channelTab: "live",
  channelFilter: "",
  channelSheetId: null,
  channelSheetStatus: "",
  settingsTab: "templates",
  templates: [],
  shipping: [],
  storageDefs: [],
  showTemplateForm: false,
  editingTemplateId: null,
  showShipForm: false,
  editingShipId: null,
  assetEditId: null,
  assetPhotos: [],
};

const SPACES_KEY = "scouter-spaces-v1";
const SHIPS_KEY = "scouter-shipments-v1";
const EBAY_KEY = "scouter-ebay-connected-v1";

/** Live fle/ld fulfilment stages (desktop Channel · FULFILMENT). */
const SHIP_STAGES = [
  { key: "ready_to_ship", n: 1, label: "Ready to ship", next: "dropped_off" },
  { key: "dropped_off", n: 2, label: "Dropped at carrier", next: "in_transit" },
  { key: "in_transit", n: 3, label: "Carrier scanned", next: "out_for_delivery" },
  { key: "out_for_delivery", n: 4, label: "Out for delivery", next: "delivered" },
  { key: "delivered", n: 5, label: "Delivered", next: null },
];


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
  if (it.listingStatus === "ready_to_list" || it.staged) return "Listing Built";
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
  const intakeVal = state.items
    .filter((it) => itemPipeLabel(it) === "Intake")
    .reduce((sum, it) => sum + (Number(it.marketValue) || 0) * (Number(it.quantity) || 1), 0);
  if ($("intakeValue")) $("intakeValue").textContent = money(intakeVal);
  if ($("cmdScouterCount")) $("cmdScouterCount").textContent = n;
  if ($("cmdToList")) $("cmdToList").textContent = n;
  if ($("pipeIntake")) $("pipeIntake").textContent = n;
  if ($("pipeReady")) $("pipeReady").textContent = "00";
  if ($("pipeListed")) $("pipeListed").textContent = "00";
  updateSitrep();
  renderCollection();
  renderIntakeList();
  loadShipments();
  renderSpaces();
  renderChannel();
}

const STALE_DAYS = 7;

function updateSitrep() {
  loadShipments();
  const toList = state.items.filter((it) => itemPipeLabel(it) !== "Listed").length;
  const needsBin = state.items.filter((it) => !it.spaceId && itemPipeLabel(it) !== "Listed").length;
  const listed = state.items.filter((it) => itemPipeLabel(it) === "Listed").length;
  const inventory = state.items.length;
  if ($("cmdToList")) $("cmdToList").textContent = pad2(toList);
  if ($("cmdNeedsBin")) $("cmdNeedsBin").textContent = pad2(needsBin);
  if ($("cmdListed")) $("cmdListed").textContent = pad2(listed);
  if ($("cmdInventory")) $("cmdInventory").textContent = pad2(inventory);
  if ($("cmdScouterCount")) $("cmdScouterCount").textContent = pad2(inventory);

  const cards = buildCmdAttention();
  const blocked = cards.reduce((n, c) => n + c.count, 0);
  if ($("sitrepTitle")) $("sitrepTitle").textContent = blocked ? "To list" : "All clear";
  if ($("sitrepHint")) {
    $("sitrepHint").textContent = blocked
      ? `${blocked} item${blocked === 1 ? "" : "s"} waiting on you`
      : "Nothing is blocked, errored, or sitting untouched.";
  }
  if ($("ebayWarn")) {
    $("ebayWarn").classList.toggle("hidden", !!state.ebayConnected);
  }
  renderCmdAttention(cards);
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

/** Live $K attention cards — only emit when count > 0. */
function buildCmdAttention() {
  const cards = [];
  const push = (c) => {
    if (c.count > 0) cards.push(c);
  };
  const readyShip = state.shipments.filter((s) => !s.archived && s.status === "ready_to_ship").length;
  const engineErr = state.items.filter((it) => it.engineStatus === "error").length;
  const itemErr = state.items.filter((it) => it.listingStatus === "error").length;
  const needsReview = state.items.filter(
    (it) =>
      it.needsReview ||
      it.status === "Needs Review" ||
      it.confidence === "Low" ||
      it.confidence === "Failed" ||
      (!it.title && !it.staged && itemPipeLabel(it) === "Intake"),
  ).length;
  const readyPublish = state.items.filter(
    (it) => it.listingStatus === "ready_to_list" || (it.staged && it.listingStatus !== "listed"),
  ).length;
  const staleMs = STALE_DAYS * 24 * 60 * 60 * 1000;
  const stalled = state.items.filter((it) => {
    if (it.listingStatus === "listed" || itemPipeLabel(it) === "Listed") return false;
    const t = Date.parse(it.updatedAt || it.createdAt || "") || 0;
    return t && Date.now() - t >= staleMs;
  }).length;
  push({
    key: "ship",
    tone: "act",
    to: "/channel",
    label: "Ready to ship",
    detail: "Packed and waiting on a drop-off",
    count: readyShip,
  });
  push({
    key: "engine-error",
    tone: "bad",
    to: "/",
    label: "Listing engine errors",
    detail: "The AI writer failed on these",
    count: engineErr,
  });
  push({
    key: "item-error",
    tone: "bad",
    to: "/inventory",
    label: "Items in error",
    detail: "Push to channel failed",
    count: itemErr,
  });
  push({
    key: "review",
    tone: "act",
    to: "/scan-intake",
    label: "Scans needing review",
    detail: "Low confidence or unidentified",
    count: needsReview,
  });
  push({
    key: "publish",
    tone: "act",
    to: "/inventory",
    label: "Built, not published",
    detail: "Listing is ready to go live",
    count: readyPublish,
  });
  push({
    key: "stalled",
    tone: "idle",
    to: "/inventory",
    label: `Untouched ${STALE_DAYS}+ days`,
    detail: "Sitting in the pipeline going nowhere",
    count: stalled,
  });
  const toneRank = { bad: 0, act: 1, idle: 2 };
  return cards.sort((a, b) => toneRank[a.tone] - toneRank[b.tone] || b.count - a.count);
}

function renderCmdAttention(cards) {
  const root = $("cmdAttention");
  if (!root) return;
  const list = cards || buildCmdAttention();
  if (!list.length) {
    root.innerHTML = `<div class="v-panel v-cut-sm p-4" style="text-align:center"><div class="v-readout" style="font-size:18px;color:#5fe8d0">All clear</div><p class="b44-copy-soft" style="margin-top:8px">Nothing is blocked, errored, or sitting untouched.</p></div>`;
    return;
  }
  root.innerHTML = list
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
  const raw = String(route || "");
  const [base, query = ""] = raw.split("?");
  const path = ROUTES[base] ? base : "/scan-intake";
  state.route = path;
  const meta = ROUTES[path];
  document.querySelectorAll(".b44-view").forEach((el) => {
    el.classList.toggle("active", el.id === meta.id);
  });
  document.querySelectorAll(".b44-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.route === path);
  });
  if ($("pageBrand")) $("pageBrand").textContent = meta.brand;
  const hash = query ? `#${path}?${query}` : `#${path}`;
  if (location.hash !== hash) history.replaceState(null, "", hash);
  if (path === "/settings") {
    setSettingsTab(state.settingsTab || "templates");
    renderSettings();
  }
  if (path === "/storage") renderSpaces();
  if (path === "/channel") renderChannel();
  if (path === "/" || path === "/command") updateSitrep();
  // Live Command New card → /inventory?add=1 opens VN sheet.
  if (path === "/inventory" && /(?:^|&)add=1(?:&|$)/.test(query)) {
    openAssetSheet(null);
  }
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
  if ($("intakeHint")) {
    $("intakeHint").textContent = rows.length
      ? "Click an item to build its listing, or open it."
      : "Intake is empty — scan a barcode or drop a photo to bring inventory in.";
  }
  const intakeVal = state.items
    .filter((it) => itemPipeLabel(it) === "Intake")
    .reduce((sum, it) => sum + (Number(it.marketValue) || 0) * (Number(it.quantity) || 1), 0);
  if ($("intakeValue")) $("intakeValue").textContent = money(intakeVal);
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
      return `<div class="v-panel v-cut-sm b44-item" data-open-item="${esc(it.id)}" style="cursor:pointer">${img}<div class="meta"><strong>${esc(it.title || "Untitled")}</strong><span>${esc(step)} · ${esc(sku)} · ${esc(it.game || "PKM")}</span></div><div class="qty"><div class="v-readout v-emit-gold" style="font-size:14px">${esc(price)}</div><div>×${it.quantity || 1}</div></div></div>`;
    })
    .join("");
  root.querySelectorAll("[data-open-item]").forEach((row) => {
    row.addEventListener("click", () => openScouterReadout(row.dataset.openItem));
  });
  if (state.lockedItemId) openScouterReadout(state.lockedItemId);
}

function openScouterReadout(id) {
  const it = state.items.find((x) => x.id === id);
  const panel = $("scouterReadout");
  if (!it || !panel) {
    closeScouterReadout();
    return;
  }
  if (state.lockedItemId && state.lockedItemId !== it.id) state.readoutStatus = "";
  state.lockedItemId = it.id;
  panel.classList.remove("hidden");
  const step = itemPipeLabel(it);
  const status = it.listingStatus || "";
  if ($("readoutLock")) $("readoutLock").textContent = `LOCKED · ${step.toUpperCase()}`;
  if ($("readoutTitle")) $("readoutTitle").textContent = it.title || "Untitled";
  if ($("readoutPrice")) $("readoutPrice").textContent = money(it.marketValue ?? it.price);
  if ($("readoutSku")) $("readoutSku").textContent = it.barcode || it.sku || "NO SKU";
  if ($("readoutStatus")) $("readoutStatus").textContent = state.readoutStatus || "";

  // Live Scouter locked readout (tle renderReadout): Write / Publish / Move / Manage.
  const canWrite = !["ready_to_list", "listed", "sold", "error"].includes(status) && step !== "Listed" && step !== "Listing Built";
  const canPublish = status === "ready_to_list" || step === "Listing Built";
  const nextPhase = scouterNextPhase(it);
  const canMove = !!nextPhase && status !== "ready_to_list" && step === "Intake";
  const canManage = status === "listed" || step === "Listed";

  $("btnWriteListing")?.classList.toggle("hidden", !canWrite);
  $("btnPublishEbay")?.classList.toggle("hidden", !canPublish);
  $("btnMovePhase")?.classList.toggle("hidden", !canMove);
  $("btnManageChannel")?.classList.toggle("hidden", !canManage);
  if ($("btnMovePhase") && nextPhase) {
    $("btnMovePhase").textContent = `Move to ${nextPhase.label}`;
  }
  if ($("btnPublishEbay")) {
    $("btnPublishEbay").textContent = "Publish to eBay";
  }
}

/** Live Si next-phase for locked Scouter Move button. */
function scouterNextPhase(it) {
  const step = itemPipeLabel(it);
  if (step === "Intake") return { key: "ready_to_list", label: "Listing Built" };
  if (step === "Listing Built") return { key: "listed", label: "Listed" };
  return null;
}

function closeScouterReadout() {
  state.lockedItemId = null;
  state.readoutStatus = "";
  $("scouterReadout")?.classList.add("hidden");
}

function fillAssetSpaceOptions(selected) {
  loadSpaces();
  const sel = $("assetSpace");
  if (!sel) return;
  const opts = [`<option value="">—</option>`].concat(
    state.spaces.map((s) => `<option value="${esc(s.id)}" ${s.id === selected ? "selected" : ""}>${esc(s.name)}</option>`),
  );
  sel.innerHTML = opts.join("");
}

function renderAssetThumbs() {
  const root = $("assetThumbs");
  if (!root) return;
  root.innerHTML = state.assetPhotos
    .map(
      (p, i) =>
        `<div class="b44-thumb"><img src="${p.dataUrl || p}" alt="" /><button type="button" data-del-asset-img="${i}" title="Remove">×</button></div>`,
    )
    .join("");
  root.querySelectorAll("[data-del-asset-img]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.assetPhotos.splice(Number(btn.dataset.delAssetImg), 1);
      renderAssetThumbs();
    });
  });
}

/** Live VN Open card / New asset sheet. */
function openAssetSheet(item) {
  state.assetEditId = item?.id || null;
  state.assetPhotos = Array.isArray(item?.photos)
    ? item.photos.map((p) => (typeof p === "string" ? { dataUrl: p } : { ...p }))
    : [];
  if ($("assetSheetTitle")) {
    $("assetSheetTitle").textContent = item?.id ? "// EDIT ASSET" : "// NEW ASSET";
  }
  if ($("assetTitle")) $("assetTitle").value = item?.title || "";
  if ($("assetCategory")) $("assetCategory").value = item?.category || "other";
  if ($("assetCondition")) $("assetCondition").value = item?.condition || "raw";
  if ($("assetMarket")) $("assetMarket").value = String(item?.marketValue ?? item?.market_value ?? 0);
  if ($("assetPurchase")) $("assetPurchase").value = String(item?.purchasePrice ?? item?.purchase_price ?? 0);
  if ($("assetQty")) $("assetQty").value = String(item?.quantity ?? 1);
  if ($("assetSku")) $("assetSku").value = item?.sku || item?.barcode || "";
  let phase = item?.listingStatus || item?.listing_status || "sorted";
  if (!item?.listingStatus && item?.staged) phase = "ready_to_list";
  if ($("assetPhase")) $("assetPhase").value = phase;
  if ($("assetChannel")) $("assetChannel").value = item?.liveChannel || item?.live_channel || "";
  if ($("assetGrade")) $("assetGrade").value = item?.grade || "";
  if ($("assetGrader")) $("assetGrader").value = item?.gradingCompany || item?.grading_company || "";
  if ($("assetDesc")) $("assetDesc").value = item?.description || "";
  if ($("assetNotes")) $("assetNotes").value = item?.notes || "";
  fillAssetSpaceOptions(item?.spaceId || item?.storage_location_id || "");
  if ($("assetSheetStatus")) $("assetSheetStatus").textContent = "";
  renderAssetThumbs();
  $("assetSheet")?.classList.remove("hidden");
  $("assetTitle")?.focus();
}

function closeAssetSheet() {
  state.assetEditId = null;
  state.assetPhotos = [];
  $("assetSheet")?.classList.add("hidden");
}

function saveAssetSheet() {
  const title = ($("assetTitle")?.value || "").trim();
  if (!title) {
    if ($("assetSheetStatus")) $("assetSheetStatus").textContent = "Title is required.";
    return;
  }
  const phase = $("assetPhase")?.value || "sorted";
  const qty = Number($("assetQty")?.value || 1) || 1;
  const marketValue = Number($("assetMarket")?.value || 0) || 0;
  const purchasePrice = Number($("assetPurchase")?.value || 0) || 0;
  const sku = ($("assetSku")?.value || "").trim();
  const payload = {
    title,
    category: $("assetCategory")?.value || "other",
    condition: $("assetCondition")?.value || "raw",
    marketValue,
    purchasePrice,
    quantity: qty,
    sku,
    barcode: sku,
    listingStatus: phase,
    staged: phase === "ready_to_list" || phase === "listed",
    liveChannel: $("assetChannel")?.value || "",
    grade: ($("assetGrade")?.value || "").trim(),
    gradingCompany: $("assetGrader")?.value || "",
    spaceId: $("assetSpace")?.value || "",
    description: $("assetDesc")?.value || "",
    notes: $("assetNotes")?.value || "",
    photos: state.assetPhotos.slice(),
    updatedAt: new Date().toISOString(),
  };
  if (state.assetEditId) {
    const it = state.items.find((x) => x.id === state.assetEditId);
    if (!it) return;
    Object.assign(it, payload);
  } else {
    state.items.unshift({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      game: "PKM",
      ...payload,
    });
  }
  saveItems();
  closeAssetSheet();
  renderCollection();
  renderIntakeList();
  updateSitrep();
  if (state.lockedItemId) openScouterReadout(state.lockedItemId);
}

async function addAssetImageFiles(fileList) {
  const files = [...(fileList || [])];
  for (const file of files) {
    if (!file.type?.startsWith("image/")) continue;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    if (dataUrl) state.assetPhotos.push({ dataUrl, name: file.name });
  }
  renderAssetThumbs();
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

function setIdentifyProgress(stage, done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  if ($("identifyStage")) $("identifyStage").textContent = `${String(stage || "IDENTIFYING").toUpperCase()}…`;
  if ($("identifyPct")) $("identifyPct").textContent = total ? `${done} / ${total}` : `${pct}%`;
  if ($("identifyBar")) $("identifyBar").style.width = `${pct}%`;
}

async function addFiles(fileList) {
  const isImage = window.ScouterImage?.isImageFile ?? ((f) => f.type?.startsWith("image/"));
  const incoming = [...(fileList || [])].filter(isImage).slice(0, 8 - state.draftPhotos.length);
  if (!incoming.length) return;
  setIntakeMode("identifying");
  setIdentifyProgress("Uploading", 0, incoming.length);
  setStatus("Uploading…");
  const compressed = await window.ScouterImage.compressPhotos(incoming);
  let done = 0;
  for (const file of compressed) {
    const dataUrl = await window.ScouterImage.fileToDataUrl(file);
    state.draftPhotos.push({ dataUrl, file });
    done += 1;
    setIdentifyProgress("Uploading", done, incoming.length);
  }
  setIdentifyProgress("Deduping", 1, 1);
  renderPhotos();
  updateSave();
  setIntakeMode("batch");
  setStatus(`${state.draftPhotos.length} scan(s) ready`);
}

async function runIdentify() {
  const photos = state.draftPhotos.map((p) => p.dataUrl).filter(Boolean);
  if (!photos.length) {
    setStatus("Need photos first");
    return false;
  }
  setIntakeMode("identifying");
  setIdentifyProgress("Identifying", 0, photos.length || 1);
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
    setIdentifyProgress("Identifying", photos.length || 1, photos.length || 1);
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

function loadShipments() {
  try {
    const raw = localStorage.getItem(SHIPS_KEY);
    state.shipments = raw ? JSON.parse(raw) : [];
  } catch {
    state.shipments = [];
  }
  try {
    state.ebayConnected = localStorage.getItem(EBAY_KEY) === "1";
  } catch {
    state.ebayConnected = false;
  }
}

function saveShipments() {
  localStorage.setItem(SHIPS_KEY, JSON.stringify(state.shipments));
  renderChannel();
}

function shipStageLabel(key) {
  return SHIP_STAGES.find((s) => s.key === key)?.label || key;
}

function nextShipStage(key) {
  return SHIP_STAGES.find((s) => s.key === key)?.next || null;
}

function itemsInSpace(spaceId) {
  if (!spaceId) return state.items.filter((it) => !it.spaceId);
  return state.items.filter((it) => (it.spaceId || "") === spaceId);
}

function spaceValue(items) {
  return items.reduce(
    (sum, it) => sum + (Number(it.marketValue ?? it.price) || 0) * (Number(it.quantity) || 1),
    0,
  );
}

function renderSpaces() {
  loadSpaces();
  const root = $("spaceList");
  const empty = $("spaceEmpty");
  if (!root) return;
  const parentId = currentSpaceParentId();
  const q = (state.filterSpaces || "").trim().toLowerCase();
  const rows = state.spaces
    .filter((s) => (s.parentId || "") === parentId)
    .filter((s) => {
      if (!q) return true;
      const hay = `${s.name || ""} ${s.code || ""} ${s.kind || ""}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { numeric: true }));
  const totalHere = state.spaces.filter((s) => (s.parentId || "") === parentId).length;
  if ($("spaceCount")) $("spaceCount").textContent = pad2(totalHere);
  if ($("spaceSubCount")) $("spaceSubCount").textContent = pad2(totalHere);

  const cardsHere = itemsInSpace(parentId);
  const unfiled = state.items.filter((it) => !it.spaceId);
  if ($("spaceCardCount")) $("spaceCardCount").textContent = pad2(cardsHere.length);
  if ($("spaceValue")) $("spaceValue").textContent = money(spaceValue(cardsHere));
  if ($("spaceUnfiled")) $("spaceUnfiled").textContent = pad2(unfiled.length);

  const crumb = parentId
    ? state.spaceTrail.map((id) => {
        const sp = spaceById(id);
        return sp?.code ? `${sp.code} · ${sp.name}` : sp?.name || "…";
      }).join(" / ")
    : "ALL STORAGE";
  if ($("spaceBreadcrumb")) $("spaceBreadcrumb").textContent = crumb;
  $("btnSpaceUp")?.classList.toggle("hidden", !parentId);
  $("btnFileHere")?.classList.toggle("hidden", !parentId);

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
      const cards = itemsInSpace(s.id).length;
      const bits = [`${code}${esc(kind)}`];
      if (kids) bits.push(`${kids} inside`);
      if (cards) bits.push(`${cards} card${cards === 1 ? "" : "s"}`);
      return `<div class="v-panel v-cut-sm b44-item" data-open-space="${esc(s.id)}" style="cursor:pointer"><div class="meta"><strong>${esc(s.name)}</strong><span>${bits.join(" · ")}</span></div><button type="button" class="m-btn" data-del-space="${esc(s.id)}">×</button></div>`;
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
      // Live: clearing a bin leaves cards unfiled.
      state.items = state.items.map((it) => (drop.has(it.spaceId || "") ? { ...it, spaceId: "" } : it));
      saveItems();
      state.spaces = state.spaces.filter((s) => !drop.has(s.id));
      state.spaceTrail = state.spaceTrail.filter((x) => !drop.has(x));
      saveSpaces();
    });
  });

  // Live Spaces: cards at current location (or unfiled at ALL STORAGE).
  const itemsRoot = $("spaceItems");
  const itemsEmpty = $("spaceItemsEmpty");
  const itemsLabel = $("spaceItemsLabel");
  if (itemsLabel) {
    itemsLabel.textContent = parentId ? "CARDS HERE" : "UNFILED CARDS";
  }
  if (itemsRoot) {
    const list = parentId ? cardsHere : unfiled;
    if (itemsEmpty) {
      itemsEmpty.classList.toggle("hidden", list.length > 0);
      const p = itemsEmpty.querySelector("p");
      if (p) {
        p.textContent = parentId
          ? "Cards filed into this location show up here."
          : "Cards with no location sit here until you file them.";
      }
    }
    itemsRoot.innerHTML = list
      .map((it) => {
        const price = Number(it.marketValue ?? it.price);
        const priceBit = Number.isFinite(price) && price > 0 ? money(price) : "—";
        const status = itemPipeLabel(it);
        const unfile = parentId
          ? `<button type="button" class="m-btn" data-unfile="${esc(it.id)}">Unfile</button>`
          : "";
        return `<div class="v-panel v-cut-sm b44-item"><div class="meta"><strong>${esc(it.title || "Untitled")}</strong><span>${esc(status)} · ${esc(priceBit)}</span></div>${unfile}</div>`;
      })
      .join("");
    itemsRoot.querySelectorAll("[data-unfile]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const it = state.items.find((x) => x.id === btn.dataset.unfile);
        if (!it) return;
        it.spaceId = "";
        saveItems();
        renderSpaces();
        updateSitrep();
      });
    });
  }
}

function fileCardIntoCurrentSpace() {
  const parentId = currentSpaceParentId();
  if (!parentId) return;
  const unfiled = state.items.filter((it) => !it.spaceId);
  if (!unfiled.length) {
    alert("No unfiled cards — everything already has a location.");
    return;
  }
  const names = unfiled
    .slice(0, 12)
    .map((it, i) => `${i + 1}. ${it.title || "Untitled"}`)
    .join("\n");
  const pick = prompt(`File which unfiled card into this location?\n${names}\n\nEnter number`, "1");
  const idx = Number(pick) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= unfiled.length) return;
  unfiled[idx].spaceId = parentId;
  saveItems();
  renderSpaces();
  updateSitrep();
}


/** Live ile hubs: fresh=Active on market, ended=Off market. */
function channelHubKey(it) {
  if (it.listingStatus === "ended" || it.channelStatus === "ended") return "ended";
  if (it.listingStatus === "listed" || itemPipeLabel(it) === "Listed") return "fresh";
  // Connected local port also surfaces built rows as not-yet-live actives.
  if (itemPipeLabel(it) === "Listing Built") return "fresh";
  return null;
}

function channelListingRow(it, hub) {
  const status = hub === "ended" ? "Ended" : itemPipeLabel(it) === "Listed" ? "Active" : "Built, not live";
  const sku = it.barcode || it.sku || "NO SKU";
  const price = Number(it.marketValue ?? it.price);
  const priceBit = Number.isFinite(price) && price > 0 ? ` · $${price.toFixed(2)}` : "";
  const thumb = it.photos?.[0]?.dataUrl || "";
  const img = thumb
    ? `<img src="${thumb}" alt="" />`
    : `<div style="width:48px;height:48px;border-radius:8px;background:#0a0e14;border:1px solid rgba(255,255,255,0.1)"></div>`;
  return `<div class="v-panel v-cut-sm b44-item" data-open-listing="${esc(it.id)}" style="cursor:pointer">${img}<div class="meta"><strong>${esc(it.title || "Untitled")}</strong><span>${esc(status)} · ${esc(sku)}${priceBit}</span></div><div class="qty">×${it.quantity || 1}</div></div>`;
}

function openChannelSheet(id) {
  const it = state.items.find((x) => x.id === id);
  const sheet = $("channelSheet");
  if (!it || !sheet) {
    closeChannelSheet();
    return;
  }
  if (state.channelSheetId !== id) state.channelSheetStatus = "";
  state.channelSheetId = id;
  sheet.classList.remove("hidden");
  const sku = it.barcode || it.sku || "NO SKU";
  if ($("channelSheetSku")) $("channelSheetSku").textContent = sku;
  if ($("channelSheetTitle")) $("channelSheetTitle").textContent = it.title || "Untitled";
  const price = Number(it.marketValue ?? it.price) || 0;
  if ($("channelSheetPrice")) $("channelSheetPrice").textContent = money(price);
  if ($("channelSheetStatus")) $("channelSheetStatus").textContent = state.channelSheetStatus || "";
  const ended = channelHubKey(it) === "ended";
  $("btnChannelReprice")?.classList.toggle("hidden", ended);
  $("btnChannelEnd")?.classList.toggle("hidden", ended);
  $("btnChannelRelist")?.classList.toggle("hidden", !ended);
}

function closeChannelSheet() {
  state.channelSheetId = null;
  state.channelSheetStatus = "";
  $("channelSheet")?.classList.add("hidden");
}

function channelSheetAction(kind) {
  const it = state.items.find((x) => x.id === state.channelSheetId);
  if (!it) return;
  if (!state.ebayConnected) {
    state.channelSheetStatus = "Connect eBay before listing actions.";
    openChannelSheet(it.id);
    return;
  }
  if (kind === "reprice") {
    const next = Number(prompt("New price ($)", String(it.marketValue ?? it.price ?? "")) || 0);
    if (!next || next <= 0) return;
    // Honest local port: update local value; live eBay reprice needs server creds.
    it.marketValue = next;
    it.price = next;
    saveItems();
    state.channelSheetStatus =
      `Local price set to ${money(next)}. Live eBay reprice needs server credentials.`;
    openChannelSheet(it.id);
    renderChannel();
    return;
  }
  if (kind === "relist") {
    it.listingStatus = "listed";
    it.channelStatus = "active";
    saveItems();
    state.channelSheetStatus =
      "Marked Active locally. Live Relist needs server eBay credentials.";
    openChannelSheet(it.id);
    renderChannel();
    return;
  }
  if (kind === "end") {
    it.listingStatus = "ended";
    it.channelStatus = "ended";
    saveItems();
    state.channelSheetStatus =
      "Marked Ended locally. Live End listing needs server eBay credentials.";
    openChannelSheet(it.id);
    renderChannel();
  }
}

function renderChannel() {
  loadShipments();
  const live = $("channelLive");
  const ship = $("channelShip");
  if (live) live.classList.toggle("hidden", state.channelTab !== "live");
  if (ship) ship.classList.toggle("hidden", state.channelTab !== "ship");
  $("tabLive")?.classList.toggle("m-btn-primary", state.channelTab === "live");
  $("tabShip")?.classList.toggle("m-btn-primary", state.channelTab === "ship");

  const intake = state.items.filter((it) => itemPipeLabel(it) === "Intake").length;
  const ready = state.items.filter((it) => itemPipeLabel(it) === "Listing Built").length;
  const listed = state.items.filter((it) => itemPipeLabel(it) === "Listed").length;
  if ($("pipeIntake")) $("pipeIntake").textContent = pad2(intake);
  if ($("pipeReady")) $("pipeReady").textContent = pad2(ready);
  if ($("pipeListed")) $("pipeListed").textContent = pad2(listed);

  // Live nle: Connect alone when offline; Sync + Photos/Policies/Token when connected.
  const connected = !!state.ebayConnected;
  $("btnEbayConnect")?.classList.toggle("hidden", connected);
  $("btnChannelSync")?.classList.toggle("hidden", !connected);
  $("btnChannelPhotos")?.classList.toggle("hidden", !connected);
  $("btnChannelToken")?.classList.toggle("hidden", !connected);
  $("btnChannelPolicies")?.classList.toggle("hidden", !connected);
  if ($("ebayConnectHint")) {
    $("ebayConnectHint").textContent = connected
      ? "eBay marked connected on this device. Sync/Photos/Token/Policies still need live credentials on the server."
      : "eBay isn't connected — publishing and sync are offline. Connect it below.";
  }
  if ($("liveValue")) {
    const liveVal = state.items
      .filter((it) => itemPipeLabel(it) === "Listed")
      .reduce((sum, it) => sum + (Number(it.marketValue ?? it.price) || 0) * (Number(it.quantity) || 1), 0);
    $("liveValue").textContent = money(liveVal);
  }

  const filterBar = $("channelFilterBar");
  const hubs = $("channelHubs");
  if (filterBar) filterBar.classList.toggle("hidden", !(connected && state.channelTab === "live"));
  if (hubs) hubs.classList.toggle("hidden", !(connected && state.channelTab === "live"));

  const list = $("channelList");
  const empty = $("channelEmpty");
  if (list) {
    // Live nle hubs: Active (on market) / Ended (off market). Local port uses listingStatus.
    const q = (state.channelFilter || "").trim().toLowerCase();
    const pool = connected
      ? state.items.filter((it) => {
          const hub = channelHubKey(it);
          if (!hub) return false;
          if (!q) return true;
          const hay = `${it.title || ""} ${it.barcode || ""} ${it.sku || ""}`.toLowerCase();
          return hay.includes(q);
        })
      : [];
    const active = pool.filter((it) => channelHubKey(it) === "fresh");
    const ended = pool.filter((it) => channelHubKey(it) === "ended");
    if ($("hubActive")) $("hubActive").textContent = pad2(active.length);
    if ($("hubEnded")) $("hubEnded").textContent = pad2(ended.length);

    if (empty) {
      empty.classList.toggle("hidden", !(state.channelTab === "live" && pool.length === 0));
      const label = empty.querySelector(".v-label");
      const p = empty.querySelector("p");
      if (label) label.textContent = "Channel empty";
      if (p) {
        p.textContent = connected
          ? q
            ? "No listings match this filter."
            : "Run a sync to pull your live listings."
          : "Connect eBay to see what's on the channel.";
      }
    }
    if (state.channelTab === "live") {
      const chunks = [];
      const pushHub = (key, title, rows) => {
        if (!rows.length) return;
        chunks.push(
          `<div class="v-label" style="font-size:9px;margin:12px 0 6px;color:var(--b44-gold,#ffb43d)">${esc(title)} · ${pad2(rows.length)}</div>`,
        );
        for (const it of rows.slice(0, 40)) {
          chunks.push(channelListingRow(it, key));
        }
      };
      pushHub("fresh", "ACTIVE · ON MARKET", active);
      pushHub("ended", "ENDED · OFF MARKET", ended);
      list.innerHTML = chunks.join("");
      list.querySelectorAll("[data-open-listing]").forEach((row) => {
        row.addEventListener("click", () => openChannelSheet(row.dataset.openListing));
      });
    } else {
      list.innerHTML = "";
    }
  }
  if (state.channelSheetId) openChannelSheet(state.channelSheetId);
  else closeChannelSheet();

  // Fulfilment stage counters + grouped rows (live fle/ld)
  const counts = Object.fromEntries(SHIP_STAGES.map((s) => [s.key, 0]));
  for (const sh of state.shipments) {
    if (counts[sh.status] != null) counts[sh.status] += 1;
  }
  if ($("fulReady")) $("fulReady").textContent = pad2(counts.ready_to_ship);
  if ($("fulDropped")) $("fulDropped").textContent = pad2(counts.dropped_off);
  if ($("fulTransit")) $("fulTransit").textContent = pad2(counts.in_transit);
  if ($("fulOut")) $("fulOut").textContent = pad2(counts.out_for_delivery);
  if ($("fulDelivered")) $("fulDelivered").textContent = pad2(counts.delivered);
  const awaiting = state.shipments.filter((s) => s.status !== "delivered").length;
  if ($("fulPayout")) $("fulPayout").textContent = pad2(awaiting);

  const fulList = $("fulList");
  const fulEmpty = $("fulEmpty");
  if (fulList) {
    if (fulEmpty) {
      fulEmpty.classList.toggle("hidden", state.shipments.length > 0);
      const p = fulEmpty.querySelector("p");
      if (p) {
        p.textContent =
          "Packages appear here once an order is created from Listings or eBay Sync.";
      }
    }
    const chunks = [];
    for (const stage of SHIP_STAGES) {
      const rows = state.shipments.filter((sh) => sh.status === stage.key);
      if (!rows.length) continue;
      chunks.push(
        `<div class="v-label" style="font-size:9px;margin:12px 0 6px;color:var(--b44-gold,#ffb43d)">STEP ${stage.n} · ${esc(stage.label)} · ${pad2(rows.length)}</div>`,
      );
      for (const sh of rows) {
        const next = nextShipStage(sh.status);
        const price = Number(sh.salePrice);
        const priceBit = Number.isFinite(price) && price > 0 ? money(price) : "—";
        const carrier = sh.carrier || "NO CARRIER";
        let advance;
        if (sh.status === "delivered") {
          const payout = sh.payoutReleaseAt
            ? new Date(sh.payoutReleaseAt).toLocaleDateString("en-US", {
                month: "short",
                day: "2-digit",
              })
            : "—";
          advance = `<span class="v-label">PAYOUT EST. ${esc(payout)}</span>`;
        } else if (next) {
          advance = `<button type="button" class="m-btn m-btn-primary" data-advance-ship="${esc(sh.id)}">Advance to ${esc(shipStageLabel(next))}</button>`;
        } else {
          advance = `<span class="v-label">Complete</span>`;
        }
        chunks.push(
          `<div class="v-panel v-cut-sm b44-item"><div class="meta"><strong>${esc(sh.title || "Untitled")}</strong><span>PACKAGE · ${esc(stage.label.toUpperCase())} · ${esc(priceBit)} · ${esc(carrier)}</span></div><div class="qty">${advance}</div></div>`,
        );
      }
    }
    fulList.innerHTML = chunks.join("");
    fulList.querySelectorAll("[data-advance-ship]").forEach((btn) => {
      btn.addEventListener("click", () => advanceShipment(btn.dataset.advanceShip));
    });
  }
}

function advanceShipment(id) {
  loadShipments();
  const sh = state.shipments.find((s) => s.id === id);
  if (!sh) return;
  const next = nextShipStage(sh.status);
  if (!next) return;
  sh.status = next;
  sh.updatedAt = new Date().toISOString();
  if (next === "dropped_off") sh.droppedOffAt = sh.updatedAt;
  if (next === "delivered") {
    sh.deliveredAt = sh.updatedAt;
    const payout = new Date();
    payout.setDate(payout.getDate() + 4);
    sh.payoutReleaseAt = payout.toISOString();
  }
  saveShipments();
  if ($("channelActionStatus")) {
    $("channelActionStatus").textContent = `Advanced to ${shipStageLabel(next)}.`;
  }
}

function addPackedOrder() {
  const title = prompt("Order title", "Packed card lot");
  if (!title?.trim()) return;
  const sale = Number(prompt("Sale price ($)", "24.99") || 0);
  loadShipments();
  state.shipments.unshift({
    id: crypto.randomUUID(),
    title: title.trim(),
    salePrice: sale,
    status: "ready_to_ship",
    createdAt: new Date().toISOString(),
  });
  saveShipments();
  state.channelTab = "ship";
  renderChannel();
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

/** Live xo listing-template defaults. */
const DEFAULT_TITLE_TEMPLATE = "Pokémon [SET] - Pick Your Card! [RARITY] NM";
const DEFAULT_DESC_TEMPLATE = "[TITLE]\n\n[BRAND_TAGLINE]";

function resetTemplateForm() {
  if ($("tplName")) $("tplName").value = "";
  if ($("tplMarkup")) $("tplMarkup").value = "30";
  if ($("tplDefault")) $("tplDefault").checked = false;
  state.showTemplateForm = false;
  $("templateForm")?.classList.add("hidden");
}

function resetShipForm() {
  if ($("shipName")) $("shipName").value = "";
  if ($("shipCarrier")) $("shipCarrier").value = "";
  if ($("shipService")) $("shipService").value = "";
  if ($("shipCost")) $("shipCost").value = "0";
  if ($("shipHandle")) $("shipHandle").value = "1";
  if ($("shipDefault")) $("shipDefault").checked = false;
  state.showShipForm = false;
  $("shipForm")?.classList.add("hidden");
}

function templateCardHtml(t) {
  const markup = t.markup_percent ?? t.markup ?? 0;
  const chip = t.is_default
    ? `<span class="v-label" style="color:var(--b44-gold,#ffb43d)">DEFAULT</span>`
    : "";
  if (state.editingTemplateId === t.id) {
    return `<div class="v-panel v-cut-sm p-4" data-edit-tpl="${esc(t.id)}">
      <label class="v-label" style="display:block;margin-bottom:6px;font-size:9px">Name</label>
      <input class="b44-input" data-edit-tpl-name value="${esc(t.name)}" />
      <label class="v-label" style="display:block;margin:10px 0 6px;font-size:9px">Markup %</label>
      <input class="b44-input" type="number" data-edit-tpl-markup value="${esc(String(markup))}" />
      <label class="b44-copy-soft" style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px">
        <input type="checkbox" data-edit-tpl-default ${t.is_default ? "checked" : ""} /> Default
      </label>
      <div class="b44-actions" style="margin-top:12px">
        <button type="button" class="m-btn m-btn-primary" data-save-tpl="${esc(t.id)}">Save</button>
        <button type="button" class="m-btn" data-cancel-tpl>Cancel</button>
      </div>
    </div>`;
  }
  return `<div class="v-panel v-cut-sm p-4">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">${chip || "<span></span>"}
      <button type="button" class="m-btn" data-del-template="${esc(t.id)}" title="Delete">×</button>
    </div>
    <div class="v-readout v-emit-white" style="font-size:15px;margin-top:8px">${esc(t.name)}</div>
    <div class="v-readout" style="font-size:22px;margin-top:6px">${esc(String(markup))}<span class="b44-copy-soft" style="font-size:14px">% markup</span></div>
    <div class="b44-actions" style="margin-top:12px">
      <button type="button" class="m-btn" data-edit-template="${esc(t.id)}">Edit</button>
    </div>
  </div>`;
}

function shipCardHtml(s) {
  if (state.editingShipId === s.id) {
    return `<div class="v-panel v-cut-sm p-4" data-edit-ship="${esc(s.id)}">
      <label class="v-label" style="display:block;margin-bottom:6px;font-size:9px">Name</label>
      <input class="b44-input" data-edit-ship-name value="${esc(s.name)}" />
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">
        <div><label class="v-label" style="display:block;margin-bottom:6px;font-size:9px">Carrier</label>
        <input class="b44-input" data-edit-ship-carrier value="${esc(s.carrier || "")}" /></div>
        <div><label class="v-label" style="display:block;margin-bottom:6px;font-size:9px">Service</label>
        <input class="b44-input" data-edit-ship-service value="${esc(s.service || "")}" /></div>
        <div><label class="v-label" style="display:block;margin-bottom:6px;font-size:9px">Cost</label>
        <input class="b44-input" type="number" data-edit-ship-cost value="${esc(String(s.cost ?? 0))}" /></div>
        <div><label class="v-label" style="display:block;margin-bottom:6px;font-size:9px">Days</label>
        <input class="b44-input" type="number" data-edit-ship-handle value="${esc(String(s.handling_days ?? 1))}" /></div>
      </div>
      <label class="b44-copy-soft" style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px">
        <input type="checkbox" data-edit-ship-default ${s.is_default ? "checked" : ""} /> Default
      </label>
      <div class="b44-actions" style="margin-top:12px">
        <button type="button" class="m-btn m-btn-primary" data-save-ship="${esc(s.id)}">Save</button>
        <button type="button" class="m-btn" data-cancel-ship>Cancel</button>
      </div>
    </div>`;
  }
  const chip = s.is_default
    ? `<span class="v-label" style="color:var(--b44-gold,#ffb43d)">DEFAULT</span>`
    : "";
  const service = s.service ? ` · ${s.service}` : "";
  const handle = s.handling_days != null ? ` · ${s.handling_days}d` : "";
  return `<div class="v-panel v-cut-sm p-4">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">${chip || "<span></span>"}
      <button type="button" class="m-btn" data-del-ship="${esc(s.id)}" title="Delete">×</button>
    </div>
    <div class="v-readout v-emit-white" style="font-size:15px;margin-top:8px">${esc(s.name)}</div>
    <div class="b44-copy-soft" style="margin-top:6px;font-size:13px">${esc(s.carrier || "—")}${esc(service)} · $${esc(String(s.cost ?? 0))}${esc(handle)}</div>
    <div class="b44-actions" style="margin-top:12px">
      <button type="button" class="m-btn" data-edit-ship-btn="${esc(s.id)}">Edit</button>
    </div>
  </div>`;
}

function renderSettings() {
  loadSettingsLocal();
  $("templateForm")?.classList.toggle("hidden", !state.showTemplateForm);
  $("shipForm")?.classList.toggle("hidden", !state.showShipForm);

  const tRoot = $("templateList");
  const tEmpty = $("templateEmpty");
  if (tRoot) {
    tRoot.innerHTML = state.templates.map(templateCardHtml).join("");
    if (tEmpty) {
      tEmpty.classList.toggle("hidden", state.templates.length > 0);
      tEmpty.textContent = "No templates yet. Create one to apply default markup and policies.";
    }
    tRoot.querySelectorAll("[data-del-template]").forEach((btn) => {
      btn.addEventListener("click", () => {
        loadSettingsLocal();
        state.templates = state.templates.filter((t) => t.id !== btn.dataset.delTemplate);
        if (state.editingTemplateId === btn.dataset.delTemplate) state.editingTemplateId = null;
        saveSettingsLocal();
        renderSettings();
      });
    });
    tRoot.querySelectorAll("[data-edit-template]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.editingTemplateId = btn.dataset.editTemplate;
        state.showTemplateForm = false;
        renderSettings();
      });
    });
    tRoot.querySelectorAll("[data-cancel-tpl]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.editingTemplateId = null;
        renderSettings();
      });
    });
    tRoot.querySelectorAll("[data-save-tpl]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest("[data-edit-tpl]");
        if (!card) return;
        loadSettingsLocal();
        const id = btn.dataset.saveTpl;
        const name = card.querySelector("[data-edit-tpl-name]")?.value?.trim();
        if (!name) return;
        const markup_percent = Number(card.querySelector("[data-edit-tpl-markup]")?.value || 0);
        const is_default = !!card.querySelector("[data-edit-tpl-default]")?.checked;
        if (is_default) {
          state.templates = state.templates.map((t) => ({ ...t, is_default: false }));
        }
        state.templates = state.templates.map((t) =>
          t.id === id ? { ...t, name, markup_percent, is_default } : t,
        );
        state.editingTemplateId = null;
        saveSettingsLocal();
        renderSettings();
      });
    });
  }
  const sRoot = $("shipList");
  const sEmpty = $("shipEmpty");
  if (sRoot) {
    sRoot.innerHTML = state.shipping.map(shipCardHtml).join("");
    if (sEmpty) {
      sEmpty.classList.toggle("hidden", state.shipping.length > 0);
      sEmpty.textContent = "No shipping presets yet. Add carriers and services to reuse on listings.";
    }
    sRoot.querySelectorAll("[data-del-ship]").forEach((btn) => {
      btn.addEventListener("click", () => {
        loadSettingsLocal();
        state.shipping = state.shipping.filter((s) => s.id !== btn.dataset.delShip);
        if (state.editingShipId === btn.dataset.delShip) state.editingShipId = null;
        saveSettingsLocal();
        renderSettings();
      });
    });
    sRoot.querySelectorAll("[data-edit-ship-btn]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.editingShipId = btn.dataset.editShipBtn;
        state.showShipForm = false;
        renderSettings();
      });
    });
    sRoot.querySelectorAll("[data-cancel-ship]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.editingShipId = null;
        renderSettings();
      });
    });
    sRoot.querySelectorAll("[data-save-ship]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest("[data-edit-ship]");
        if (!card) return;
        loadSettingsLocal();
        const id = btn.dataset.saveShip;
        const name = card.querySelector("[data-edit-ship-name]")?.value?.trim();
        if (!name) return;
        const carrier = card.querySelector("[data-edit-ship-carrier]")?.value || "";
        const service = card.querySelector("[data-edit-ship-service]")?.value || "";
        const cost = Number(card.querySelector("[data-edit-ship-cost]")?.value || 0);
        const handling_days = Number(card.querySelector("[data-edit-ship-handle]")?.value || 1);
        const is_default = !!card.querySelector("[data-edit-ship-default]")?.checked;
        if (is_default) {
          state.shipping = state.shipping.map((s) => ({ ...s, is_default: false }));
        }
        state.shipping = state.shipping.map((s) =>
          s.id === id ? { ...s, name, carrier, service, cost, handling_days, is_default } : s,
        );
        state.editingShipId = null;
        saveSettingsLocal();
        renderSettings();
      });
    });
  }
  const dRoot = $("storageDefList");
  const dEmpty = $("storageDefEmpty");
  if (dRoot) {
    dRoot.innerHTML = state.storageDefs
      .map(
        (d) =>
          `<div class="v-panel v-cut-sm b44-item"><div class="meta"><strong>${esc(d.name)}</strong><span>${esc(d.code || "")}</span></div><button type="button" class="m-btn" data-del-storage-def="${esc(d.id)}">×</button></div>`,
      )
      .join("");
    if (dEmpty) dEmpty.classList.toggle("hidden", state.storageDefs.length > 0);
    dRoot.querySelectorAll("[data-del-storage-def]").forEach((btn) => {
      btn.addEventListener("click", () => {
        loadSettingsLocal();
        state.storageDefs = state.storageDefs.filter((d) => d.id !== btn.dataset.delStorageDef);
        saveSettingsLocal();
        renderSettings();
      });
    });
  }
  refreshAiConnect();
}



/** Live NR MCP client setup steps (AI Connect). */
const MCP_CLIENTS = {
  claude: {
    label: "Claude",
    steps: [
      "Open your profile menu (top-left) and go to Settings.",
      "Select the Connectors tab and click “Add custom connector”.",
      "Name the connector (e.g. “Coalition”), paste the server URL, and click Add.",
      "On first use, Claude opens this app’s consent page — sign in with your account and Approve.",
    ],
  },
  chatgpt: {
    label: "ChatGPT",
    steps: [
      "Go to Settings → Apps → enable Developer mode (confirm the warning ChatGPT shows).",
      "Click “Create app”, name it, paste the server URL, and click Create.",
      "Enable the app from the chat composer before prompting it.",
      "On first use, ChatGPT opens this app’s consent page — sign in with your account and Approve.",
    ],
  },
  cursor: {
    label: "Cursor",
    steps: [
      "Open Settings → Tools & Integrations and click “New MCP Server”.",
      "This opens mcp.json — add an entry whose url is the server URL, then save.",
      "Toggle the server on in the list.",
      "On first use, Cursor opens this app’s consent page — sign in with your account and Approve.",
    ],
  },
  custom: {
    label: "Custom",
    steps: [
      "Copy the server URL below.",
      "Add it as a streamable HTTP MCP server in your client.",
      "A name and the URL is all most clients need — then reload the client.",
      "On first use, your client opens this app’s consent page — sign in with your account and Approve.",
    ],
  },
};

function mcpServerUrl() {
  return new URL("/api/mcp", window.location.origin).toString();
}

function renderMcpClient(key) {
  state.mcpClient = key in MCP_CLIENTS ? key : "claude";
  document.querySelectorAll("[data-mcp-client]").forEach((btn) => {
    btn.classList.toggle("m-btn-primary", btn.dataset.mcpClient === state.mcpClient);
  });
  const client = MCP_CLIENTS[state.mcpClient];
  const root = $("mcpClientSteps");
  if (!root || !client) return;
  root.innerHTML =
    `<div class="v-label" style="font-size:9px;margin-bottom:8px">${esc(client.label)}</div>` +
    `<ol style="margin:0;padding-left:22px;display:flex;flex-direction:column;gap:8px">` +
    client.steps
      .map(
        (step, i) =>
          `<li><span class="v-label" style="font-size:10px;margin-right:6px">${String(i + 1).padStart(2, "0")}</span>${esc(step)}</li>`,
      )
      .join("") +
    `</ol>`;
}

async function refreshAiConnect() {
  if ($("mcpServerUrl")) $("mcpServerUrl").textContent = mcpServerUrl();
  if (!state.mcpClient) state.mcpClient = "claude";
  renderMcpClient(state.mcpClient);
  const status = $("aiConnectStatus");
  if (!status) return;
  status.textContent = "Checking photo Identify…";
  try {
    const res = await fetch("/api/scouter/identify/status");
    const data = await res.json();
    if (data.photoSearchReady) {
      status.textContent =
        "Photo Identify ready on this server. MCP clients can also connect with the URL above.";
    } else {
      status.textContent =
        data.setupTask ||
        "Photo Identify needs ANTHROPIC_API_KEY on the server. Photos still save — ID stays honest until the key is set.";
    }
  } catch {
    status.textContent =
      "Could not reach Identify status. Photos still save locally; reconnect and try again.";
  }
}

function runEbayDiagnostic() {
  const status = $("ebayDiagStatus");
  const result = $("ebayDiagResult");
  if (status) status.textContent = "Checking eBay…";
  if (result) {
    result.classList.add("hidden");
    result.innerHTML = "";
  }
  // Local port: no server ebayAuth yet — honest structured result shaped like live.
  window.setTimeout(() => {
    if (!state.ebayConnected) {
      if (status) {
        status.textContent =
          "Diagnostic call failed — eBay isn't connected. Connect it on Channel before publishing or sync.";
      }
      return;
    }
    const listed = state.items.filter((it) => itemPipeLabel(it) === "Listed").length;
    if (status) {
      status.textContent =
        "Local flag is connected, but live eBay OAuth credentials are not on this server — showing Coalition inventory only.";
    }
    if (result) {
      result.classList.remove("hidden");
      result.innerHTML = `
        <div class="v-panel v-cut-sm p-3" style="margin-bottom:8px;border-color:rgba(43,217,192,0.35)">
          <span class="b44-copy-soft">Synced in Coalition HUD right now: <strong>${pad2(listed)}</strong> listings</span>
        </div>
        <div class="v-panel v-cut-sm p-3" style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;gap:8px">
            <strong>Active</strong>
            <span class="v-label" style="color:#ff4d6d">Skipped</span>
          </div>
          <p class="b44-copy-soft" style="margin-top:6px;font-size:12px">eBay API not called — server credentials missing.</p>
        </div>
        <div class="v-panel v-cut-sm p-3">
          <div style="display:flex;justify-content:space-between;gap:8px">
            <strong>Unsold</strong>
            <span class="v-label" style="color:#ff4d6d">Skipped</span>
          </div>
          <p class="b44-copy-soft" style="margin-top:6px;font-size:12px">eBay API not called — server credentials missing.</p>
        </div>`;
    }
  }, 350);
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

  $("btnCloseReadout")?.addEventListener("click", () => closeScouterReadout());
  $("btnWriteListing")?.addEventListener("click", () => {
    state.readoutStatus =
      "Listing engine isn't connected here yet — title/photos stay. Identify remains photo-first.";
    if (state.lockedItemId) openScouterReadout(state.lockedItemId);
  });
  $("btnMovePhase")?.addEventListener("click", () => {
    const it = state.items.find((x) => x.id === state.lockedItemId);
    if (!it) return;
    const next = scouterNextPhase(it);
    if (!next) return;
    if (next.key === "ready_to_list") {
      it.staged = true;
      it.listingStatus = "ready_to_list";
    } else if (next.key === "listed") {
      it.listingStatus = "listed";
    }
    it.updatedAt = new Date().toISOString();
    saveItems();
    state.readoutStatus = `Moved to ${next.label}.`;
    openScouterReadout(it.id);
    renderCollection();
    updateSitrep();
  });
  $("btnPublishEbay")?.addEventListener("click", () => {
    const it = state.items.find((x) => x.id === state.lockedItemId);
    if (!it) return;
    if (!state.ebayConnected) {
      state.readoutStatus = "Connect eBay on Channel before publishing.";
      openScouterReadout(it.id);
      return;
    }
    // Honest local port: mark Listed locally; live publish needs server eBay creds.
    it.staged = true;
    it.listingStatus = "listed";
    it.updatedAt = new Date().toISOString();
    saveItems();
    state.readoutStatus =
      "Marked Listed locally. Live Publish to eBay needs server credentials.";
    openScouterReadout(it.id);
    renderCollection();
    updateSitrep();
  });
  $("btnOpenCard")?.addEventListener("click", () => {
    const it = state.items.find((x) => x.id === state.lockedItemId);
    if (!it) return;
    openAssetSheet(it);
  });
  $("btnNewCard")?.addEventListener("click", () => {
    navigate("/inventory?add=1");
  });
  $("btnAssetClose")?.addEventListener("click", () => closeAssetSheet());
  $("btnAssetCancel")?.addEventListener("click", () => closeAssetSheet());
  $("btnAssetSave")?.addEventListener("click", () => saveAssetSheet());
  $("btnAssetAddImages")?.addEventListener("click", () => $("assetImages")?.click());
  $("assetImages")?.addEventListener("change", async (e) => {
    await addAssetImageFiles(e.target.files);
    e.target.value = "";
  });
  $("assetSheet")?.addEventListener("click", (e) => {
    if (e.target === $("assetSheet")) closeAssetSheet();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!$("assetSheet")?.classList.contains("hidden")) closeAssetSheet();
      else closeScouterReadout();
    }
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
  $("btnFileHere")?.addEventListener("click", () => fileCardIntoCurrentSpace());
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
  $("channelFilter")?.addEventListener("input", (e) => {
    state.channelFilter = e.target.value;
    renderChannel();
  });
  $("btnChannelSheetClose")?.addEventListener("click", () => {
    closeChannelSheet();
  });
  $("btnChannelReprice")?.addEventListener("click", () => channelSheetAction("reprice"));
  $("btnChannelRelist")?.addEventListener("click", () => channelSheetAction("relist"));
  $("btnChannelEnd")?.addEventListener("click", () => channelSheetAction("end"));
  
  document.querySelectorAll("[data-settings-tab]").forEach((btn) => {
    btn.addEventListener("click", () => setSettingsTab(btn.dataset.settingsTab));
  });
  $("btnNewTemplate")?.addEventListener("click", () => {
    state.editingTemplateId = null;
    state.showShipForm = false;
    state.showTemplateForm = true;
    if ($("tplName")) $("tplName").value = "";
    if ($("tplMarkup")) $("tplMarkup").value = "30";
    if ($("tplDefault")) $("tplDefault").checked = false;
    renderSettings();
    $("tplName")?.focus();
  });
  $("btnTplCancel")?.addEventListener("click", () => {
    resetTemplateForm();
    renderSettings();
  });
  $("btnTplSave")?.addEventListener("click", () => {
    const name = ($("tplName")?.value || "").trim();
    if (!name) return;
    const markup_percent = Number($("tplMarkup")?.value || 0);
    const makeDefault = !!$("tplDefault")?.checked;
    loadSettingsLocal();
    if (makeDefault) {
      state.templates = state.templates.map((t) => ({ ...t, is_default: false }));
    }
    state.templates.unshift({
      id: crypto.randomUUID(),
      name,
      markup_percent,
      is_default: makeDefault || state.templates.length === 0,
      title_template: DEFAULT_TITLE_TEMPLATE,
      description_template: DEFAULT_DESC_TEMPLATE,
      pricing_type: "markup",
      price_floor: 1.77,
      round_to_nearest: 0.99,
    });
    saveSettingsLocal();
    resetTemplateForm();
    renderSettings();
  });
  $("btnNewShip")?.addEventListener("click", () => {
    state.editingShipId = null;
    state.showTemplateForm = false;
    state.showShipForm = true;
    if ($("shipName")) $("shipName").value = "";
    if ($("shipCarrier")) $("shipCarrier").value = "";
    if ($("shipService")) $("shipService").value = "";
    if ($("shipCost")) $("shipCost").value = "0";
    if ($("shipHandle")) $("shipHandle").value = "1";
    if ($("shipDefault")) $("shipDefault").checked = false;
    renderSettings();
    $("shipName")?.focus();
  });
  $("btnShipCancel")?.addEventListener("click", () => {
    resetShipForm();
    renderSettings();
  });
  $("btnShipSave")?.addEventListener("click", () => {
    const name = ($("shipName")?.value || "").trim();
    if (!name) return;
    const carrier = ($("shipCarrier")?.value || "").trim();
    const service = ($("shipService")?.value || "").trim();
    const cost = Number($("shipCost")?.value || 0);
    const handling_days = Number($("shipHandle")?.value || 1);
    const makeDefault = !!$("shipDefault")?.checked;
    loadSettingsLocal();
    if (makeDefault) {
      state.shipping = state.shipping.map((s) => ({ ...s, is_default: false }));
    }
    state.shipping.unshift({
      id: crypto.randomUUID(),
      name,
      carrier,
      service,
      cost,
      handling_days,
      is_default: makeDefault || state.shipping.length === 0,
    });
    saveSettingsLocal();
    resetShipForm();
    renderSettings();
  });
  $("btnNewStorageDef")?.addEventListener("click", () => {
    const name = prompt("Location name", "Warehouse A");
    if (!name?.trim()) return;
    const code = prompt("Code", "WH-A") || "";
    loadSettingsLocal();
    state.storageDefs.unshift({ id: crypto.randomUUID(), name: name.trim(), code });
    saveSettingsLocal();
    renderSettings();
  });
  $("btnEbayDiag")?.addEventListener("click", () => runEbayDiagnostic());
  $("btnCopyMcp")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(mcpServerUrl());
      if ($("btnCopyMcp")) $("btnCopyMcp").textContent = "Copied";
      window.setTimeout(() => {
        if ($("btnCopyMcp")) $("btnCopyMcp").textContent = "Copy";
      }, 1800);
    } catch {
      if ($("aiConnectStatus")) {
        $("aiConnectStatus").textContent = "Could not copy — select the URL and copy manually.";
      }
    }
  });
  document.querySelectorAll("[data-mcp-client]").forEach((btn) => {
    btn.addEventListener("click", () => renderMcpClient(btn.dataset.mcpClient));
  });

  const setChannelStatus = (msg) => {
    if ($("channelActionStatus")) $("channelActionStatus").textContent = msg;
    setStatus(msg);
  };
  $("btnEbayConnect")?.addEventListener("click", () => {
    loadShipments();
    if (state.ebayConnected) {
      setChannelStatus("eBay already marked connected on this device.");
      return;
    }
    // Local port: no OAuth consent URL yet — flag only, honest about server auth.
    state.ebayConnected = true;
    localStorage.setItem(EBAY_KEY, "1");
    setChannelStatus("Marked connected locally. Live eBay OAuth still needs server credentials.");
    renderChannel();
  });
  $("btnChannelSync")?.addEventListener("click", () => {
    if (!state.ebayConnected) {
      setChannelStatus("Connect eBay before Sync.");
      return;
    }
    setChannelStatus("Sync needs live eBay credentials on the server — nothing pulled.");
  });
  $("btnChannelPhotos")?.addEventListener("click", () => {
    if (!state.ebayConnected) {
      setChannelStatus("Connect eBay before Photos.");
      return;
    }
    setChannelStatus("Photos sync needs live eBay credentials on the server.");
  });
  $("btnChannelToken")?.addEventListener("click", () => {
    if (!state.ebayConnected) {
      setChannelStatus("Connect eBay before Token refresh.");
      return;
    }
    setChannelStatus("Token refresh needs live eBay credentials on the server.");
  });
  $("btnChannelPolicies")?.addEventListener("click", () => {
    if (!state.ebayConnected) {
      setChannelStatus("Connect eBay before Policies.");
      return;
    }
    setChannelStatus("Policies load needs live eBay credentials on the server.");
  });
  $("btnAddShipment")?.addEventListener("click", () => addPackedOrder());

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
