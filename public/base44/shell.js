/** Base44 route shell — nav + Intake/Scouter from live silky bundle (Zle/Mle/tle). */
const LS_KEY = "scouter-items-v1";
const ROUTES = {
  "/": { id: "view-command", brand: "COMMAND" },
  "/inventory": { id: "view-inventory", brand: "SCOUTER" },
  "/item": { id: "view-item", brand: "ASSET" },
  "/storage": { id: "view-storage", brand: "STORAGE" },
  "/channel": { id: "view-channel", brand: "CHANNEL" },
  "/scan-intake": { id: "view-intake", brand: "INTAKE" },
  "/scan-assistant": { id: "view-scan-assistant", brand: "INTAKE" },
  "/settings": { id: "view-settings", brand: "SETTINGS" },
};

const state = {
  route: "/scan-intake",
  items: [],
  spaces: [],
  collections: [],
  itemCollectionsOpen: false,
  draftPhotos: [],
  title: "",
  barcode: "",
  qty: 1,
  category: "other",
  game: "PKM",
  batchName: "",
  backsIncluded: true,
  skuPrefix: "ITM",
  intakeMode: "list", // list | batch | grouping | identifying | review
  intakeScans: [],
  intakeGroups: [],
  intakeThreshold: 5,
  groupSplitOpen: null,
  groupSplitPick: [],
  intakeReviewRows: [],
  intakeReviewFilter: "",
  intakeReviewSelected: [],
  intakeReviewRescan: [],
  intakeReviewFocusId: null,
  reviewPreviewFace: "front",
  intakeReviewMult: 1.3,
  intakeReviewFloor: 1.77,
  intakeScanCount: 0,
  intakeReviewStatus: "",
  intakeExportSummary: null,
  fleRowId: null,
  fleFace: "front",
  flePickId: null,
  unItemId: null,
  unPhase: "idle", // idle | running | done | error
  unDraft: null,
  unStatus: "",
  filterIntake: "",
  spaceTrail: [],
  spaceTreeOpen: {}, // id → bool — live Ak expand state
  scouterMode: "pipeline", // pipeline | spaces — live tle breadcrumb
  scouterDemo: false, // live Xre DEMO / LIVE
  scouterStatus: "",
  lockedItemId: null,
  readoutStatus: "",
  shipments: [],
  ebayConnected: false,
  mcpClient: "claude",
  channelTab: "live",
  channelFilter: "",
  channelSheetId: null,
  channelSheetStatus: "",
  channelVariationMode: false,
  channelVariationSelected: [],
  fulSheetId: null,
  settingsTab: "templates",
  templates: [],
  shipping: [],
  storageDefs: [],
  showTemplateForm: false,
  editingTemplateId: null,
  showShipForm: false,
  editingShipId: null,
  showStorageForm: false,
  assetEditId: null,
  assetPhotos: [],
  itemPageId: null,
  itemPhotos: [],
  itemPageStatus: "",
  itemMoveExpanded: {},
  itemMoveAddParent: null,
  intakePickId: null,
  intakePickHubKey: null,
  intakePickStatus: "",
  /** Live zre spin angles per Intake hub key (desk orbit). */
  intakeOrbitSpin: {},
  /** Live zre focus (dim other hubs). */
  intakeOrbitFocus: null,
};

const SPACES_KEY = "scouter-spaces-v1";
const COLLECTIONS_KEY = "scouter-collections-v1";
const SHIPS_KEY = "scouter-shipments-v1";
const EBAY_KEY = "scouter-ebay-connected-v1";

/** Live fle/ld desk fulfilment hubs (Channel · FULFILMENT). */
const SHIP_STAGES = [
  { key: "ready_to_ship", n: 1, label: "Ready to ship", next: "dropped_off", core: "#8FA3AD", hi: "#FFFFFF" },
  { key: "dropped_off", n: 2, label: "Dropped at carrier", next: "in_transit", core: "#8FA3AD", hi: "#FFFFFF" },
  { key: "in_transit", n: 3, label: "Carrier scanned", next: "out_for_delivery", core: "#FFB43D", hi: "#FFD98A" },
  { key: "out_for_delivery", n: 4, label: "Out for delivery", next: "delivered", core: "#2BD9C0", hi: "#8FF6E8" },
  { key: "delivered", n: 5, label: "Delivered", next: null, core: "#2BD9C0", hi: "#8FF6E8" },
];

/** Live ale/ole carrier code → readout label. */
const CARRIER_LABELS = {
  usps_standard_envelope: "eBay Std Envelope",
  double_holo_envelope: "Double Holo Envelope",
  fedex_ground: "FedEx Ground",
  fedex_ground_economy: "FedEx Ground Economy",
  other: "Other",
};

/** Live Hle — Wle Var select options. */
const REVIEW_VARIANTS = ["Normal", "Holofoil", "Reverse Holofoil", "Cosmos Holo"];

function carrierLabel(code) {
  if (!code) return "NO CARRIER";
  return CARRIER_LABELS[code] || code;
}

function activeShipments() {
  return state.shipments.filter((s) => !s.archived);
}

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

function pad3(n) {
  return String(n).padStart(3, "0");
}

function money(n) {
  return "$" + Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}


/** Live Tle game chips on Intake batch form (Mle). */
const INTAKE_GAMES = [
  { code: "PKM", label: "Pokemon" },
  { code: "OPC", label: "One Piece" },
  { code: "DBS", label: "Dragon Ball" },
  { code: "HCK", label: "Hockey" },
  { code: "WRL", label: "Wrestling" },
  { code: "ITM", label: "Other" },
];

/** Live Cle / Ale / p_ — 8×8 difference hash for Intake grouping (Nle). */
function loadImageUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = url;
  });
}

async function intakeDHashFromDataUrl(dataUrl, maxEdge = 1200) {
  const img = await loadImageUrl(dataUrl);
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  const tiny = document.createElement("canvas");
  tiny.width = 9;
  tiny.height = 8;
  const ctx = tiny.getContext("2d");
  ctx.drawImage(canvas, 0, 0, 9, 8);
  const { data } = ctx.getImageData(0, 0, 9, 8);
  let bits = "";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const a = (row * 9 + col) * 4;
      const b = (row * 9 + (col + 1)) * 4;
      const la = 0.299 * data[a] + 0.587 * data[a + 1] + 0.114 * data[a + 2];
      const lb = 0.299 * data[b] + 0.587 * data[b + 1] + 0.114 * data[b + 2];
      bits += la > lb ? "1" : "0";
    }
  }
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return { hash: hex, width: w, height: h };
}

function intakeHammingHex(a, b) {
  if (!a || !b || a.length !== b.length) return 999;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

function groupFrontsByHash(fronts, threshold = 5) {
  const groups = [];
  for (const scan of fronts) {
    if (!scan.hash) {
      groups.push([scan]);
      continue;
    }
    let placed = false;
    for (const g of groups) {
      if (g[0].hash && intakeHammingHex(scan.hash, g[0].hash) <= threshold) {
        g.push(scan);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push([scan]);
  }
  return groups;
}


/** Live Xre DEMO inventory (YK → ZK), mapped to F.O.B item shape — display only. */
const DEMO_SCOUTER_ITEMS = [
  { id: "d01", title: "Charizard ex 223/197 · Obsidian Flames SIR", sku: "PKM-0412", barcode: "PKM-0412", marketValue: 289.99, purchasePrice: 92, quantity: 1, listingStatus: "sorted", category: "raw_cards", game: "PKM", photos: [], __demo: true },
  { id: "d02", title: "Umbreon VMAX Alt Art · Evolving Skies", sku: "PKM-0511", barcode: "PKM-0511", marketValue: 412.5, purchasePrice: 180, quantity: 1, listingStatus: "sorted", category: "raw_cards", game: "PKM", photos: [], __demo: true },
  { id: "d03", title: "Monkey D. Luffy OP01-003 · Leader Parallel", sku: "OP-0117", barcode: "OP-0117", marketValue: 78, purchasePrice: 22.5, quantity: 1, listingStatus: "sorted", category: "raw_cards", game: "OP", photos: [], __demo: true },
  { id: "d04", title: "Connor Bedard RC · Upper Deck Young Guns", sku: "HKY-0204", barcode: "HKY-0204", marketValue: 145, purchasePrice: 40, quantity: 1, listingStatus: "sorted", category: "sports_cards", game: "HKY", photos: [], __demo: true },
  { id: "d05", title: "Vegeta SSB · Dragon Ball Super Zenkai", sku: "DBS-0331", barcode: "DBS-0331", marketValue: 34.99, purchasePrice: 8, quantity: 2, listingStatus: "sorted", category: "raw_cards", game: "DBS", photos: [], __demo: true },
  { id: "d06", title: "Moonbreon PSA 9 · Evolving Skies 215/203", sku: "PKM-0602", barcode: "PKM-0602", marketValue: 640, purchasePrice: 310, quantity: 1, listingStatus: "sorted", category: "graded_slabs", game: "PKM", photos: [], __demo: true },
  { id: "d07", title: "Shanks OP09-118 · Manga Rare", sku: "OP-0288", barcode: "OP-0288", marketValue: 520, purchasePrice: 240, quantity: 1, listingStatus: "sorted", category: "raw_cards", game: "OP", photos: [], __demo: true },
  { id: "d08", title: "Pokemon 151 UPC · Sealed", sku: "PKM-SEAL-08", barcode: "PKM-SEAL-08", marketValue: 149.99, purchasePrice: 89.99, quantity: 3, listingStatus: "sorted", category: "pokemon_sealed", game: "PKM", photos: [], __demo: true },
  { id: "d09", title: "Gogeta SSB · Dragon Stars Action Figure", sku: "DBZ-0088", barcode: "DBZ-0088", marketValue: 24.99, purchasePrice: 6, quantity: 1, listingStatus: "sorted", category: "other", game: "DBZ", photos: [], __demo: true },
  { id: "d10", title: "Dark Magneton #28 · 2000 Rocket PSA 9", sku: "PKM-0028", barcode: "PKM-0028", marketValue: 210, purchasePrice: 74, quantity: 1, listingStatus: "ready_to_list", category: "graded_slabs", game: "PKM", photos: [], staged: true, __demo: true },
  { id: "d11", title: "Zoro OP01-025 · Super Rare", sku: "OP-0125", barcode: "OP-0125", marketValue: 42, purchasePrice: 11, quantity: 1, listingStatus: "ready_to_list", category: "raw_cards", game: "OP", photos: [], staged: true, __demo: true },
  { id: "d12", title: "Auston Matthews · SP Authentic Auto", sku: "HKY-0611", barcode: "HKY-0611", marketValue: 320, purchasePrice: 155, quantity: 1, listingStatus: "ready_to_list", category: "sports_cards", game: "HKY", photos: [], staged: true, __demo: true },
  { id: "d13", title: "Raikou V Alt Art · Brilliant Stars", sku: "PKM-0733", barcode: "PKM-0733", marketValue: 96, purchasePrice: 34, quantity: 1, listingStatus: "ready_to_list", category: "raw_cards", game: "PKM", photos: [], staged: true, __demo: true },
  { id: "d14", title: "Giratina VSTAR Gold · Lost Origin", sku: "PKM-0812", barcode: "PKM-0812", marketValue: 118, purchasePrice: 46, quantity: 1, listingStatus: "listed", category: "raw_cards", game: "PKM", photos: [], liveChannel: "ebay", __demo: true },
  { id: "d15", title: "Nami OP01-016 · Alt Art", sku: "OP-0316", barcode: "OP-0316", marketValue: 67.5, purchasePrice: 20, quantity: 1, listingStatus: "listed", category: "raw_cards", game: "OP", photos: [], liveChannel: "ebay", __demo: true },
  { id: "d16", title: "Broly Full Power · DBS Fusion World", sku: "DBS-0442", barcode: "DBS-0442", marketValue: 88, purchasePrice: 29, quantity: 1, listingStatus: "listed", category: "raw_cards", game: "DBS", photos: [], liveChannel: "courtyard", __demo: true },
  { id: "d17", title: "Lugia V Alt Art PSA 10 · Silver Tempest", sku: "PKM-0901", barcode: "PKM-0901", marketValue: 745, purchasePrice: 380, quantity: 1, listingStatus: "listed", category: "graded_slabs", game: "PKM", photos: [], liveChannel: "ebay", __demo: true },
  { id: "d18", title: "Bandai One Piece OP-07 Booster Box", sku: "OP-SEAL-07", barcode: "OP-SEAL-07", marketValue: 132, purchasePrice: 96, quantity: 4, listingStatus: "listed", category: "pokemon_sealed", game: "OP", photos: [], liveChannel: "ebay", __demo: true },
];

const PHASE_COLORS = {
  sorted: "#C9D8E2",
  ready_to_list: "#FFB43D",
  listed: "#5FE8D0",
  space: "#8FA3AD",
};

function scouterViewItems() {
  return state.scouterDemo ? DEMO_SCOUTER_ITEMS : state.items;
}

function setScouterDemo(on) {
  state.scouterDemo = !!on;
  const btn = $("btnScoutDemo");
  if (btn) {
    btn.textContent = state.scouterDemo ? "DEMO" : "LIVE";
    btn.classList.toggle("is-demo", state.scouterDemo);
  }
  // Live Xre DEMO/LIVE toggle has no status banner.
  setScouterStatus("");
  renderCollection();
}

/** Live Si pipeline steps (tle). */
const PIPE_STEPS = [
  {
    key: "sorted",
    n: 1,
    label: "Intake",
    action: "Intake",
    match: (it) => {
      const s = it.listingStatus;
      if (s === "listed" || s === "sold" || s === "error") return false;
      if (s === "ready_to_list" || it.staged) return false;
      return true;
    },
  },
  {
    key: "ready_to_list",
    n: 2,
    label: "Listing Built",
    action: "Build",
    match: (it) => it.listingStatus === "ready_to_list" || (!!it.staged && it.listingStatus !== "listed"),
  },
  {
    key: "listed",
    n: 3,
    label: "Listed",
    action: "Publish",
    match: (it) => it.listingStatus === "listed",
  },
];

function itemPipeLabel(it) {
  if (it.listingStatus === "listed") return "Listed";
  if (it.listingStatus === "ready_to_list" || it.staged) return "Listing Built";
  return "Intake";
}

function itemPipeKey(it) {
  const step = PIPE_STEPS.find((s) => s.match(it));
  return step?.key || "sorted";
}

function setScouterStatus(msg) {
  state.scouterStatus = msg || "";
  if ($("scouterStatus")) $("scouterStatus").textContent = state.scouterStatus;
}

function setScouterMode(mode) {
  state.scouterMode = mode === "spaces" ? "spaces" : "pipeline";
  const pipe = state.scouterMode === "pipeline";
  $("btnScoutPipeline")?.classList.toggle("m-btn-primary", pipe);
  $("btnScoutSpaces")?.classList.toggle("m-btn-primary", !pipe);
  document.querySelectorAll("[data-pipe-stat]").forEach((el) => el.classList.toggle("hidden", !pipe));
  document.querySelectorAll("[data-space-stat]").forEach((el) => el.classList.toggle("hidden", pipe));
  renderCollection();
}

function scouterItemCardHtml(it) {
  const thumb = it.photos?.[0]?.dataUrl || "";
  const sku = it.barcode || it.sku || "NO SKU";
  const step = itemPipeLabel(it);
  const price = money(it.marketValue);
  const img = thumb
    ? `<img src="${esc(thumb)}" alt="" draggable="false" />`
    : `<div style="width:48px;height:48px;border-radius:8px;background:#0a0e14;border:1px solid rgba(255,255,255,0.1)"></div>`;
  return `<div class="v-panel v-cut-sm b44-item" data-open-item="${esc(it.id)}" draggable="true" style="cursor:pointer">${img}<div class="meta"><strong>${esc(it.title || "Untitled")}</strong><span>${esc(step)} · ${esc(sku)} · ${esc(it.game || "PKM")}</span></div><div class="qty"><div class="v-readout v-emit-gold" style="font-size:14px">${esc(price)}</div><div>×${it.quantity || 1}</div></div></div>`;
}

function scouterTileCardHtml(it, phaseColor) {
  const thumb = it.photos?.[0]?.dataUrl || "";
  const price = money(it.marketValue);
  const qty = Number(it.quantity) || 1;
  const img = thumb
    ? `<img src="${esc(thumb)}" alt="" draggable="false" />`
    : `<span class="b44-copy-soft" style="font-size:10px">no img</span>`;
  const badge = qty > 1 ? `<span class="b44-scout-tile-badge">×${qty}</span>` : "";
  return `<button type="button" class="b44-scout-tile-card" data-open-item="${esc(it.id)}" draggable="${it.__demo ? "false" : "true"}" style="--phase:${esc(phaseColor)}">
    <div class="b44-scout-tile-img" style="box-shadow:inset 0 0 0 1px color-mix(in srgb, ${esc(phaseColor)} 35%, transparent)">${img}${badge}</div>
    <div class="b44-scout-tile-title">${esc(it.title || "Untitled")}</div>
    <div class="b44-scout-tile-sub">${esc(price)}</div>
  </button>`;
}

function scouterGroupHtml(group) {
  const phaseColor = PHASE_COLORS[group.key] || PHASE_COLORS.space;
  const useTiles = group.kind === "pipeline";
  const cards = useTiles
    ? group.items.slice(0, 14).map((it) => scouterTileCardHtml(it, phaseColor)).join("")
    : group.items.map(scouterItemCardHtml).join("");
  const more = useTiles && group.items.length > 14
    ? `<div class="b44-scout-tile-card" style="width:64px;justify-content:center;display:flex;align-items:center"><div class="b44-scout-tile-img" style="width:64px;height:151px;color:${esc(phaseColor)}">+${group.items.length - 14}</div></div>`
    : "";
  const empty = `<div class="b44-scout-group-empty v-label">Empty</div>`;
  const body = cards
    ? (useTiles ? `<div class="b44-scout-group-rail">${cards}${more}</div>` : cards)
    : empty;
  return `<section class="b44-scout-group" data-drop-key="${esc(group.key)}" data-drop-kind="${esc(group.kind)}" style="--phase:${esc(phaseColor)}">
    <div class="b44-scout-drop-here" aria-hidden="true">DROP HERE</div>
    <div class="b44-scout-group-head v-panel v-cut-sm px-3 py-2">
      <div class="b44-scout-group-head-row">
        <div class="b44-scout-phase-mark" style="--phase:${esc(phaseColor)}" aria-hidden="true"></div>
        <div style="min-width:0;flex:1">
          <div class="v-label" style="font-size:8.5px">${esc(group.sub)}</div>
          <div class="v-readout" style="font-size:15px;line-height:1.1;margin-top:2px">${esc(group.label)}</div>
        </div>
        <div class="v-readout b44-scout-group-count" style="color:${group.items.length ? esc(phaseColor) : "#6f8697"}">${pad2(group.items.length)}</div>
      </div>
    </div>
    <div class="b44-scout-group-body">${body}</div>
  </section>`;
}

function scouterPipelineGroups(rows) {
  return PIPE_STEPS.map((step) => ({
    key: step.key,
    kind: "pipeline",
    label: step.label,
    sub: `STEP ${step.n} · ${step.action.toUpperCase()}`,
    items: rows.filter((it) => itemPipeKey(it) === step.key),
  }));
}

function scouterSpaceGroups(rows) {
  loadSpaces();
  const roots = state.spaces.filter((s) => !(s.parentId || s.parent_id));
  const groups = roots.map((sp) => {
    const childIds = new Set([
      sp.id,
      ...state.spaces.filter((c) => (c.parentId || c.parent_id) === sp.id).map((c) => c.id),
    ]);
    return {
      key: sp.id,
      kind: "space",
      label: sp.name || "Space",
      sub: sp.code ? `SPACE · ${sp.code}` : "SPACE",
      items: rows.filter((it) => childIds.has(it.spaceId || "")),
    };
  });
  groups.push({
    key: "__unfiled__",
    kind: "space",
    label: "Unfiled",
    sub: "NO SPACE",
    items: rows.filter((it) => !it.spaceId),
  });
  return groups;
}

function moveScouterItem(itemId, kind, key) {
  const it = state.items.find((x) => x.id === itemId);
  if (!it) return;
  try {
    if (kind === "pipeline") {
      if (itemPipeKey(it) === key) return;
      if (key === "sorted") {
        it.staged = false;
        it.listingStatus = "sorted";
      } else if (key === "ready_to_list") {
        it.staged = true;
        it.listingStatus = "ready_to_list";
      } else if (key === "listed") {
        it.staged = true;
        it.listingStatus = "listed";
      }
      const label = PIPE_STEPS.find((s) => s.key === key)?.label || key;
      setScouterStatus(`${it.title || "Card"} → ${label}`);
      showToast(`${it.title || "Card"} → ${label}`, "ok");
    } else {
      const next = key === "__unfiled__" ? "" : key;
      if ((it.spaceId || "") === next) return;
      it.spaceId = next;
      const name =
        key === "__unfiled__"
          ? "Unfiled"
          : state.spaces.find((s) => s.id === key)?.name || "Space";
      setScouterStatus(`Filed into ${name}`);
      showToast(`Filed into ${name}`, "ok");
    }
    it.updatedAt = new Date().toISOString();
    saveItems();
    renderCollection();
    renderSpaces();
    updateSitrep();
    if (state.lockedItemId === it.id) openScouterReadout(it.id);
  } catch {
    // Live tle drop: ht.error("Could not move that item")
    showToast("Could not move that item", "err");
  }
}

function bindScouterGroupDnD(root) {
  root.querySelectorAll("[data-open-item]").forEach((row) => {
    row.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/scouter-item", row.dataset.openItem);
      e.dataTransfer.effectAllowed = "move";
      row.classList.add("b44-dragging");
    });
    row.addEventListener("dragend", () => row.classList.remove("b44-dragging"));
    row.addEventListener("click", () => openScouterReadout(row.dataset.openItem));
  });
  root.querySelectorAll("[data-drop-key]").forEach((zone) => {
    zone.addEventListener("dragover", (e) => {
      if (![...e.dataTransfer.types].includes("text/scouter-item")) return;
      e.preventDefault();
      zone.classList.add("b44-drop-hot");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("b44-drop-hot"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("b44-drop-hot");
      const id = e.dataTransfer.getData("text/scouter-item");
      if (!id) return;
      moveScouterItem(id, zone.dataset.dropKind, zone.dataset.dropKey);
    });
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/** Live tle fixed HUD — upload percent while photos land on scouter. */
function setScouterUploadHud(pct) {
  const hud = $("scouterUploadHud");
  const label = $("scouterUploadPct");
  if (!hud) return;
  if (pct == null) {
    hud.classList.add("hidden");
    return;
  }
  hud.classList.remove("hidden");
  if (label) label.textContent = `${Math.max(0, Math.min(100, Math.round(pct)))}%`;
}

/** Live tle photo drop → Intake cards on the scouter. */
async function intakePhotosOntoScouter(fileList) {
  const files = [...(fileList || [])].filter((f) => f.type?.startsWith("image/"));
  if (!files.length) {
    // Live tle: empty drop is a no-op (upload fail uses "No photos uploaded — …").
    setScouterUploadHud(null);
    return;
  }
  setScouterStatus(`Uploading ${files.length} photo${files.length === 1 ? "" : "s"}…`);
  setScouterUploadHud(0);
  const stamp = new Date().toLocaleDateString("en-US");
  const created = [];
  for (let i = 0; i < files.length; i++) {
    try {
      const dataUrl = await readFileAsDataUrl(files[i]);
      if (!dataUrl) continue;
      created.push({
        id: crypto.randomUUID(),
        title: `Intake ${stamp} #${i + 1}`,
        category: "raw_cards",
        condition: "nm",
        listingStatus: "sorted",
        staged: false,
        photos: [{ dataUrl, name: files[i].name }],
        quantity: 1,
        marketValue: 0,
        purchasePrice: 0,
        language: "English",
        game: "PKM",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch {
      /* skip bad file */
    }
    setScouterUploadHud(((i + 1) / files.length) * 100);
  }
  setScouterUploadHud(null);
  if (!created.length) {
    setScouterStatus("No photos uploaded — check the file and try again");
    // Live tle: ht.error("No photos uploaded — check the file and try again")
    showToast("No photos uploaded — check the file and try again", "err");
    return;
  }
  try {
    state.items = [...created, ...state.items];
    saveItems();
    setScouterStatus(`${created.length} card${created.length === 1 ? "" : "s"} on the scouter`);
    showToast(
      `${created.length} card${created.length === 1 ? "" : "s"} on the scouter`,
      "ok",
    );
    renderCollection();
    renderIntakeList();
    updateSitrep();
  } catch {
    // Live tle: ht.error("Intake failed")
    showToast("Intake failed", "err");
  }
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function setScouterReleaseOverlay(on) {
  const glass = $("scouterGlass");
  const overlay = $("scouterReleaseOverlay");
  glass?.classList.toggle("b44-photo-drop", !!on);
  if (overlay) {
    overlay.classList.toggle("hidden", !on);
    overlay.setAttribute("aria-hidden", on ? "false" : "true");
  }
}

function bindScouterPhotoDrop() {
  const glass = $("scouterGlass");
  if (!glass || glass.dataset.dropBound === "1") return;
  glass.dataset.dropBound = "1";
  let depth = 0;
  glass.addEventListener("dragenter", (e) => {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    depth += 1;
    setScouterReleaseOverlay(true);
  });
  glass.addEventListener("dragover", (e) => {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    setScouterReleaseOverlay(true);
  });
  glass.addEventListener("dragleave", () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) setScouterReleaseOverlay(false);
  });
  glass.addEventListener("drop", (e) => {
    depth = 0;
    setScouterReleaseOverlay(false);
    if (e.dataTransfer.files?.length) {
      e.preventDefault();
      intakePhotosOntoScouter(e.dataTransfer.files);
    }
  });
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


/** Live Zc → BX HUD pipe (breadcrumb + multi-stat rail). */
function setHud({ breadcrumb = [], stats = [] } = {}) {
  const crumb = $("hudCrumb");
  if (crumb) {
    if (!breadcrumb.length) {
      crumb.hidden = true;
      crumb.textContent = "";
    } else {
      crumb.hidden = false;
      crumb.textContent = breadcrumb.map((b) => b.label || b).join(" · ");
    }
  }
  const host = $("hudStats");
  if (host) {
    host.innerHTML = stats
      .map((s) => {
        const big = s.big ? " b44-hud-stat-big" : "";
        const color = s.color || "var(--b44-gold-hi)";
        return `<div class="b44-hud-stat${big}"><div class="b44-hud-stat-label">${esc(s.label)}</div><div class="b44-hud-stat-value" style="color:${esc(color)}">${esc(s.value)}</div></div>`;
      })
      .join("");
  }
}

function clearHud() {
  setHud({ breadcrumb: [], stats: [] });
}

function updateEbayPill() {
  const el = $("ebayPillState");
  if (!el) return;
  el.textContent = state.ebayConnected ? "ONLINE" : "OFFLINE";
  el.classList.toggle("is-online", !!state.ebayConnected);
  $("ebayPill")?.classList.toggle("is-online", !!state.ebayConnected);
}

function syncDeskNav(path) {
  document.querySelectorAll(".b44-desk-link").forEach((a) => {
    const r = a.getAttribute("data-route");
    const on = r === path || (path === "/item" && r === "/inventory") || (path === "/command" && r === "/");
    a.classList.toggle("active", on);
  });
}

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

    // Live qK hint (Zc rail) — not the SITREP empty body.
  if ($("cmdHint")) {
    $("cmdHint").textContent = blocked
      ? `${blocked} item${blocked === 1 ? "" : "s"} waiting on you`
      : "Nothing is blocked — the queue is clear";
  }

  // Live XK SITREP: panel title stays SITREP; body shows "All clear" only when empty.
  if ($("sitrepTitle")) {
    $("sitrepTitle").textContent = "All clear";
    $("sitrepTitle").classList.toggle("hidden", blocked > 0);
  }
  if ($("sitrepHint")) {
    $("sitrepHint").textContent = "Nothing is blocked, errored, or sitting untouched.";
    $("sitrepHint").classList.toggle("hidden", blocked > 0);
  }
  if ($("ebayWarn")) {
    $("ebayWarn").classList.toggle("hidden", !!state.ebayConnected);
  }
  updateEbayPill();

  // Live qK → Zc stats into BX HUD when Command is up.
  if (state.route === "/" || state.route === "/command") {
    setHud({
      breadcrumb: [{ label: "Command" }],
      stats: [
        { label: "To list", value: pad2(toList), color: toList ? "var(--b44-gold-hi)" : "var(--b44-lo)" },
        { label: "Needs bin", value: pad2(needsBin), color: needsBin ? "var(--b44-gold-hi)" : "var(--b44-lo)" },
        { label: "Listed", value: pad2(listed), color: "var(--b44-green-hi)" },
        { label: "Inventory", value: pad2(inventory), color: "var(--b44-gold-hi)", big: true },
      ],
    });
  } else if (state.route === "/inventory") {
    // Keep tle→Zc HUD in sync when sitrep refreshes after mutations.
    publishScouterHud();
  } else if (state.route === "/storage") {
    publishStorageHud();
  } else if (state.route === "/channel") {
    publishChannelHud();
  }

  renderCmdAttention(cards);
}

/** Live P2 — Move / storage-tree add-child kinds (no bin). */
const SPACE_KINDS = [
  { value: "warehouse", label: "Warehouse" },
  { value: "room", label: "Room" },
  { value: "shelf", label: "Shelf" },
  { value: "tote", label: "Tote" },
  { value: "binder", label: "Binder" },
  { value: "page", label: "Page" },
  { value: "pocket", label: "Pocket" },
];

/** Live Iq — Spaces map create-modal types (includes bin). */
const SPACE_MAP_KINDS = [
  "warehouse",
  "room",
  "shelf",
  "bin",
  "tote",
  "binder",
  "page",
  "pocket",
];

const PACKAGE_TYPES = [
  { value: "bubble_mailer", label: "Bubble Mailer" },
  { value: "box", label: "Box" },
  { value: "padded_envelope", label: "Padded Envelope" },
  { value: "rigid_mailer", label: "Rigid Mailer" },
  { value: "other", label: "Other" },
];

function packageTypeLabel(value) {
  return PACKAGE_TYPES.find((p) => p.value === value)?.label || value || "Package";
}

function kindLabel(kind) {
  if (SPACE_MAP_KINDS.includes(kind)) {
    return kind.charAt(0).toUpperCase() + kind.slice(1);
  }
  return SPACE_KINDS.find((k) => k.value === kind)?.label || "Warehouse";
}

function currentSpaceParentName() {
  const parentId = currentSpaceParentId();
  if (!parentId) return "ALL STORAGE";
  return spaceById(parentId)?.name || "ALL STORAGE";
}

function fillSpaceCreateKindOptions() {
  const sel = $("spaceCreateKind");
  if (!sel) return;
  sel.innerHTML = SPACE_MAP_KINDS.map(
    (k) => `<option value="${esc(k)}" style="background:#04070C">${esc(k)}</option>`,
  ).join("");
  sel.value = "bin";
}

function openSpaceCreateModal() {
  fillSpaceCreateKindOptions();
  if ($("spaceCreateName")) $("spaceCreateName").value = "";
  if ($("spaceCreateCode")) $("spaceCreateCode").value = "";
  if ($("spaceCreateParentLabel")) {
    $("spaceCreateParentLabel").textContent = `New location in ${currentSpaceParentName()}`;
  }
  $("spaceCreateSheet")?.classList.remove("hidden");
  $("spaceCreateName")?.focus();
}

function closeSpaceCreateModal() {
  $("spaceCreateSheet")?.classList.add("hidden");
}

function submitSpaceCreateModal() {
  const name = ($("spaceCreateName")?.value || "").trim();
  if (!name) {
    showToast("Could not create", "err");
    return;
  }
  const kindRaw = ($("spaceCreateKind")?.value || "bin").trim().toLowerCase();
  const kind = SPACE_MAP_KINDS.includes(kindRaw) ? kindRaw : "bin";
  const code = ($("spaceCreateCode")?.value || "").trim();
  loadSpaces();
  state.spaces.unshift({
    id: crypto.randomUUID(),
    name,
    kind,
    code,
    parentId: currentSpaceParentId(),
    createdAt: new Date().toISOString(),
  });
  saveSpaces();
  closeSpaceCreateModal();
  // Live Iq Spaces Map create toast: "{name} created"
  showToast(`${name} created`, "ok");
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
    // Live XK empty body is sitrepTitle/sitrepHint — don't duplicate All clear here.
    root.innerHTML = "";
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
  const itemMatch = String(base).match(/^\/item\/([^/?#]+)$/);
  const path = itemMatch ? "/item" : ROUTES[base] ? base : "/scan-intake";
  const itemId = itemMatch ? decodeURIComponent(itemMatch[1]) : null;
  state.route = path;
  state.itemPageId = itemId;
  const meta = ROUTES[path];
  document.querySelectorAll(".b44-view").forEach((el) => {
    el.classList.toggle("active", el.id === meta.id);
  });
  document.querySelectorAll(".b44-tab").forEach((tab) => {
    const tabRoute = tab.dataset.route;
    tab.classList.toggle(
      "active",
      tabRoute === path || (path === "/item" && tabRoute === "/inventory"),
    );
  });
  if ($("pageBrand")) $("pageBrand").textContent = meta.brand;
  syncDeskNav(path);
  updateEbayPill();
  if (
    path !== "/" &&
    path !== "/command" &&
    path !== "/storage" &&
    path !== "/inventory" &&
    path !== "/channel"
  ) {
    clearHud();
  }
  const hashBase = itemMatch ? `/item/${encodeURIComponent(itemId)}` : path;
  const hash = query ? `#${hashBase}?${query}` : `#${hashBase}`;
  if (location.hash !== hash) history.replaceState(null, "", hash);
  if (path === "/settings") {
    setSettingsTab(state.settingsTab || "templates");
    renderSettings();
  }
  if (path === "/storage") renderSpaces();
  if (path === "/channel") renderChannel();
  if (path === "/" || path === "/command") updateSitrep();
  if (path === "/scan-assistant") renderScanAssistant();
  // Live qle: intake owns Zc→BX HUD via renderIntakeList.
  if (path === "/scan-intake") renderIntakeList();
  // Live tle: inventory owns Zc→BX HUD via renderCollection.
  if (path === "/inventory") renderCollection();
  // Live Command New card → /inventory?add=1 opens VN sheet.
  if (path === "/inventory" && /(?:^|&)add=1(?:&|$)/.test(query)) {
    openAssetSheet(null);
  }
  // Live OK full card page at /item/:id
  if (path === "/item") {
    if (!itemId) {
      navigate("/inventory");
      return;
    }
    renderItemPage(itemId);
  } else if (state.itemPageId && path !== "/item") {
    // leaving item page — keep id only while on /item
  }
}

function setIntakeMode(mode) {
  state.intakeMode = mode;
  $("intakeList")?.classList.toggle("hidden", mode !== "list");
  $("intakeBatch")?.classList.toggle("hidden", mode !== "batch");
  $("intakeGrouping")?.classList.toggle("hidden", mode !== "grouping");
  $("intakeProcessing")?.classList.toggle("hidden", mode !== "processing");
  $("intakeIdentifying")?.classList.toggle("hidden", mode !== "identifying");
  $("intakeReview")?.classList.toggle("hidden", mode !== "review");
  if (mode === "batch" || mode === "grouping" || mode === "review") syncBatchChromeTitles();
}

/** Live kp: title is batch name (or "New Scan Batch") on form/grouping/review. */
function syncBatchChromeTitles() {
  const title = state.batchName || "New Scan Batch";
  if ($("batchTitle")) $("batchTitle").textContent = title;
  if ($("groupTitle")) $("groupTitle").textContent = title;
  if ($("reviewTitle")) $("reviewTitle").textContent = title;
}

/** Live kp Back to intake — leave batch shell for intake map/list. */
function backToIntake() {
  resetDraft();
  setIntakeMode("list");
}

/** Live _he Scan Batch Assistant — shell chrome + empty state (agent body is MCP-backed live). */
function renderScanAssistant() {
  const empty = $("scanAssistEmpty");
  const msgs = $("scanAssistMessages");
  const hasMsgs = !!(msgs && msgs.children.length);
  empty?.classList.toggle("hidden", hasMsgs);
  if ($("scanAssistStatus") && !hasMsgs) {
    $("scanAssistStatus").textContent = "";
  }
}

function submitScanAssist() {
  const input = $("scanAssistInput");
  const text = (input?.value || "").trim();
  if (!text) return;
  const msgs = $("scanAssistMessages");
  if (!msgs) return;
  const user = document.createElement("div");
  user.className = "b44-assist-msg b44-assist-msg-user";
  user.textContent = text;
  msgs.appendChild(user);
  const bot = document.createElement("div");
  bot.className = "b44-assist-msg b44-assist-msg-assistant";
  bot.textContent =
    "Scan Batch Assistant needs the live MCP agent (scan_batch_assistant) on the server — this shell shows the live chrome and empty state only.";
  msgs.appendChild(bot);
  if (input) input.value = "";
  $("scanAssistEmpty")?.classList.add("hidden");
  if ($("scanAssistStatus")) {
    // Live _he body is MCP-backed — port keeps chrome only; no invent status line.
    $("scanAssistStatus").textContent = "";
  }
  msgs.scrollTop = msgs.scrollHeight;
}

/** Live df + FR — Intake map hubs (qle / Xle). */
const INTAKE_HUBS = [
  { key: "pokemon_sealed", label: "Pokemon Sealed", core: "#FFB43D", hi: "#FFD98A" },
  { key: "graded_slabs", label: "Graded Slabs", core: "#2BD9C0", hi: "#8FF6E8" },
  { key: "raw_cards", label: "Raw Cards", core: "#8FA3AD", hi: "#FFFFFF" },
  { key: "sports_cards", label: "Sports Cards", core: "#8FA3AD", hi: "#FFFFFF" },
  { key: "other", label: "Other", core: "#2BD9C0", hi: "#8FF6E8" },
];

function intakeMapItems() {
  return state.items.filter((it) => !it.archived && itemPipeLabel(it) === "Intake");
}

function intakeItemCategory(it) {
  const key = String(it.category || "other");
  return INTAKE_HUBS.some((h) => h.key === key) ? key : "other";
}

function intakeHubsFromItems(rows) {
  return INTAKE_HUBS.map((hub) => {
    const items = rows.filter((it) => intakeItemCategory(it) === hub.key);
    return { ...hub, sub: "Intake", total: items.length, items };
  }).filter((hub) => hub.total > 0);
}

function intakeTileHtml(it, hub) {
  const thumb = it.photos?.[0]?.dataUrl || "";
  const price = money(Number(it.marketValue ?? it.price) || 0);
  const qty = Number(it.quantity) || 1;
  const img = thumb
    ? `<img src="${esc(thumb)}" alt="" draggable="false" />`
    : `<span class="b44-copy-soft" style="font-size:10px">no img</span>`;
  const badge = qty > 1 ? `<span class="b44-scout-tile-badge">×${qty}</span>` : "";
  return `<button type="button" class="b44-scout-tile-card b44-intake-tile" data-intake-pick="${esc(it.id)}" data-intake-hub="${esc(hub.key)}" style="--phase:${esc(hub.core)};--phase-hi:${esc(hub.hi)}">
    <div class="b44-scout-tile-img" style="box-shadow:inset 0 0 0 1px color-mix(in srgb, ${esc(hub.core)} 40%, transparent)">${img}${badge}</div>
    <div class="b44-scout-tile-title">${esc(it.title || "Untitled")}</div>
    <div class="b44-scout-tile-sub" style="color:${esc(hub.hi)}">${esc(price)}</div>
  </button>`;
}

function intakeHubSectionHtml(hub) {
  const count = hub.items.length;
  const countColor = count ? hub.hi : "#6F8697";
  const shown = hub.items.slice(0, 14);
  const more =
    hub.items.length > shown.length
      ? `<div class="b44-scout-tile-card" style="width:72px;justify-content:center;display:flex;align-items:center"><div class="b44-scout-tile-img" style="width:72px;height:162px;color:${esc(hub.hi)}">+${hub.items.length - shown.length}</div></div>`
      : "";
  const body = count
    ? `<div class="b44-scout-group-rail">${shown.map((it) => intakeTileHtml(it, hub)).join("")}${more}</div>`
    : `<div class="b44-channel-hub-empty v-label">Nothing in this category</div>`;
  return `<section class="b44-channel-hub b44-intake-hub" data-intake-hub="${esc(hub.key)}">
    <div class="b44-channel-hub-head">
      <span class="b44-channel-hub-dot" style="background:${esc(hub.core)};box-shadow:0 0 10px 1px ${esc(hub.core)}"></span>
      <span class="v-label" style="font-size:9px">${esc(hub.sub.toUpperCase())}</span>
      <span class="b44-channel-hub-label">${esc(hub.label)}</span>
      <span class="v-readout b44-channel-hub-count" style="color:${esc(countColor)}">${pad2(count)}</span>
    </div>
    ${body}
  </section>`;
}

/** Live St.all — octagonal hub clip. */
function clipPathAll(n = 13) {
  return `polygon(${n}px 0%, calc(100% - ${n}px) 0%, 100% ${n}px, 100% calc(100% - ${n}px), calc(100% - ${n}px) 100%, ${n}px 100%, 0% calc(100% - ${n}px), 0% ${n}px)`;
}

/** Live St.tl_br — node clip. */
function clipPathTlBr(n = 13) {
  return `polygon(${n}px 0%, 100% 0%, 100% calc(100% - ${n}px), calc(100% - ${n}px) 100%, 0% 100%, 0% ${n}px)`;
}

/** Live uf — hub/node glow box-shadow. */
function glowBox(core, hi, t = 0) {
  const r = Math.max(0, Math.min(2, t | 0));
  const i = [26, 42, 62][r];
  const s = [58, 88, 124][r];
  const o = [0.18, 0.26, 0.34][r];
  const a = [0.06, 0.16, 0.34][r];
  return [
    `inset 0 1px 0 rgba(255,255,255,${o})`,
    `inset 0 0 26px -12px ${hi}`,
    `0 0 0 1px rgba(255,255,255,${a})`,
    `0 0 ${i}px -14px ${hi}`,
    `0 0 ${s}px -26px ${core}`,
    "0 18px 42px -18px rgba(0,0,0,0.95)",
  ].join(", ");
}

/** Live Gl — hub face radial. */
function hubFaceGrad(hi) {
  return `radial-gradient(circle at 32% 24%, rgba(255,255,255,0.22), ${hi}26 30%, rgba(0,0,0,0.66) 72%)`;
}

const CHEV_LEFT =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
const CHEV_RIGHT =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

/** Live desk Intake uses Gre; without WebGL live falls back to zre (SPIN orbit). Port = zre. */
function intakeDeskOrbit() {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
}

let intakeOrbitRaf = 0;
let intakeOrbitLastTs = 0;
let intakeOrbitHubsCache = [];

function stopIntakeOrbitAnim() {
  if (intakeOrbitRaf) {
    cancelAnimationFrame(intakeOrbitRaf);
    intakeOrbitRaf = 0;
  }
  intakeOrbitLastTs = 0;
}

function bumpIntakeOrbitSpin(key, dir) {
  const cur = state.intakeOrbitSpin[key] || 0;
  state.intakeOrbitSpin = { ...state.intakeOrbitSpin, [key]: cur + dir * 0.62 };
  if (intakeOrbitHubsCache.length) applyIntakeOrbitPositions(intakeOrbitHubsCache);
}

function intakeOrbitDim(stage) {
  const rect = stage.getBoundingClientRect();
  return {
    w: Math.max(320, rect.width || stage.clientWidth || 960),
    h: Math.max(420, rect.height || stage.clientHeight || 520),
  };
}

/** Live zre layout math (cap 10). */
function intakeOrbitLayout(hubs, dim) {
  const L = hubs.length || 1;
  const B = dim.w / L;
  const j = dim.h * 0.44;
  const q = Math.max(74, Math.min(104, B * 0.24));
  const rx = Math.min(B * 0.3, dim.h * 0.24);
  const K = rx * 0.42;
  const ee = Math.max(46, Math.min(76, B * 0.17));
  const cap = 10;
  return hubs.map((G, ae) => {
    const F = B * ae + B / 2;
    const X = L === 1 ? 0.5 : ae / (L - 1);
    const ue = j - Math.sin(X * Math.PI) * (dim.h * 0.05);
    const H = ue + K * 0.34;
    const ne = (G.items || []).slice(0, cap);
    const se = ne.length;
    const le = state.intakeOrbitSpin[G.key] || 0;
    const be = ne.map((Ne, me) => {
      const Fe = (me / Math.max(1, se)) * Math.PI * 2 + le;
      const te = Math.sin(Fe);
      const Ce = (te + 1) / 2;
      return {
        it: Ne,
        x: F + Math.cos(Fe) * rx,
        y: H + te * K,
        scale: 0.62 + Ce * 0.5,
        depth: Ce,
        z: 10 + Math.round(Ce * 40),
      };
    });
    return {
      g: G,
      cx: F,
      hy: ue,
      oy: H,
      hubSize: q,
      rx,
      ry: K,
      nodeBase: ee,
      nodes: be,
      over: (G.items || []).length - ne.length,
    };
  });
}

function intakeOrbitNodeHtml(node, layoutHub, lockedId) {
  const hub = layoutHub.g;
  const it = node.it;
  const lock = lockedId === it.id;
  const x = layoutHub.nodeBase * node.scale * (lock ? 1.5 : 1);
  const h = Math.round(x * 1.4);
  const yCut = Math.max(7, x * 0.11);
  const thumb = it.photos?.[0]?.dataUrl || "";
  const qty = Number(it.quantity) || 1;
  const badge =
    qty > 1
      ? `<span class="b44-orbit-badge v-readout" style="font-size:${Math.max(9.5, x * 0.11)}px;color:${esc(hub.hi)}">×${qty}</span>`
      : "";
  const face = thumb
    ? `<img src="${esc(thumb)}" alt="" draggable="false" />`
    : `<span class="b44-orbit-face-empty" style="background:${esc(hubFaceGrad(hub.hi))}"></span>`;
  const opacity = 0.55 + node.depth * 0.45;
  const filter = `saturate(${0.7 + node.depth * 0.45}) brightness(${0.72 + node.depth * 0.4})`;
  return `<button type="button" class="b44-orbit-node ${lock ? "is-lock" : ""}" data-intake-pick="${esc(it.id)}" data-intake-hub="${esc(hub.key)}" title="${esc(it.title || "Untitled")}" style="left:${node.x}px;top:${node.y}px;width:${x}px;height:${h}px;z-index:${lock ? 80 : node.z};opacity:${opacity};filter:${filter};clip-path:${esc(clipPathTlBr(yCut))};box-shadow:${esc(glowBox(hub.core, hub.hi, lock ? 2 : 0))}">
    <span class="b44-orbit-node-face">${face}</span>
    <span class="b44-orbit-node-scan" aria-hidden="true"></span>
    <span class="b44-orbit-node-gloss" aria-hidden="true"></span>
    <span class="b44-orbit-node-inset" style="clip-path:${esc(clipPathTlBr(yCut))};box-shadow:inset 0 0 0 1px ${lock ? esc(hub.hi) : "rgba(255,255,255,0.20)"}, inset 0 0 22px -10px ${esc(hub.hi)}"></span>
    ${badge}
  </button>`;
}

function intakeOrbitHubHtml(L, focusKey, dropKey) {
  const G = L.g;
  const hot = dropKey === G.key;
  const gold = "#FFB43D";
  const goldHi = "#FFD98A";
  const core = hot ? gold : G.core;
  const hi = hot ? goldHi : G.hi;
  const focused = focusKey === G.key;
  const cut = Math.round(L.hubSize * 0.21);
  const spinLabel = L.over > 0 ? `${L.nodes.length}/${(G.items || []).length}` : "SPIN";
  const spinRow =
    L.nodes.length > 1
      ? `<div class="b44-orbit-spin">
          <button type="button" class="v-panel v-cut-sm b44-orbit-spin-btn" data-orbit-spin="${esc(G.key)}" data-orbit-dir="-1" style="color:${esc(G.hi)}">${CHEV_LEFT}</button>
          <span class="v-label b44-orbit-spin-label">${esc(spinLabel)}</span>
          <button type="button" class="v-panel v-cut-sm b44-orbit-spin-btn" data-orbit-spin="${esc(G.key)}" data-orbit-dir="1" style="color:${esc(G.hi)}">${CHEV_RIGHT}</button>
        </div>`
      : "";
  const dropHint = hot
    ? `<div class="b44-orbit-drop-hint v-panel v-cut-sm">DROP HERE</div>`
    : "";
  return `<div class="b44-orbit-hub" data-orbit-hub="${esc(G.key)}" style="left:${L.cx}px;top:${L.hy}px;z-index:${hot ? 70 : 42};opacity:${focusKey && focusKey !== G.key ? 0.25 : 1}">
    <div class="b44-orbit-hub-meta">
      <div class="v-label" style="font-size:9px;letter-spacing:0.24em">${esc((G.sub || "Intake").toUpperCase())}</div>
      <div class="v-title b44-orbit-hub-title">${esc(G.label)}</div>
    </div>
    <button type="button" class="b44-orbit-hub-btn" data-orbit-focus="${esc(G.key)}" style="width:${L.hubSize}px;height:${L.hubSize}px;clip-path:${esc(clipPathAll(cut))};background:${esc(hubFaceGrad(hi))};box-shadow:${esc(glowBox(core, hi, hot || focused ? 2 : 1))}">
      <span class="b44-orbit-hub-inset" style="clip-path:${esc(clipPathAll(cut))};box-shadow:inset 0 0 0 1.5px ${esc(hot ? goldHi : G.core)}, inset 0 0 30px -8px ${esc(G.hi)}"></span>
      <span class="v-readout b44-orbit-hub-count" style="font-size:${L.hubSize * 0.34}px;color:${esc(hot ? goldHi : G.hi)};text-shadow:0 0 1px #fff, 0 0 18px ${esc(G.core)}, 0 0 46px ${esc(G.core)}88">${pad2(G.total ?? (G.items || []).length)}</span>
    </button>
    ${spinRow}
    ${dropHint}
  </div>`;
}

/** Live zre — update node transforms without rebuilding the stage (RAF-safe). */
function applyIntakeOrbitPositions(hubs) {
  const stage = $("intakeOrbit");
  const inner = $("intakeOrbitInner");
  if (!stage || !inner || !hubs.length) return;
  const dim = intakeOrbitDim(stage);
  const layout = intakeOrbitLayout(hubs, dim);
  const lockedId = state.intakePickId;
  for (const L of layout) {
    for (const node of L.nodes) {
      const el = inner.querySelector(`[data-intake-pick="${CSS.escape(node.it.id)}"]`);
      if (!el) continue;
      const lock = lockedId === node.it.id;
      const x = L.nodeBase * node.scale * (lock ? 1.5 : 1);
      const h = Math.round(x * 1.4);
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
      el.style.width = `${x}px`;
      el.style.height = `${h}px`;
      el.style.zIndex = String(lock ? 80 : node.z);
      el.style.opacity = String(0.55 + node.depth * 0.45);
      el.style.filter = `saturate(${0.7 + node.depth * 0.45}) brightness(${0.72 + node.depth * 0.4})`;
      el.classList.toggle("is-lock", lock);
    }
    const spinLab = inner.querySelector(`[data-orbit-hub="${CSS.escape(L.g.key)}"] .b44-orbit-spin-label`);
    if (spinLab) {
      spinLab.textContent = L.over > 0 ? `${L.nodes.length}/${(L.g.items || []).length}` : "SPIN";
    }
  }
}

function paintIntakeOrbit(hubs) {
  const stage = $("intakeOrbit");
  const inner = $("intakeOrbitInner");
  if (!stage || !inner || !hubs.length) return;
  const dim = intakeOrbitDim(stage);
  const layout = intakeOrbitLayout(hubs, dim);
  const focusKey = state.intakeOrbitFocus || null;
  const lockedId = state.intakePickId;
  const firstHi = hubs[0]?.hi || "#FFFFFF";
  const lastHi = hubs[hubs.length - 1]?.hi || "#FFD98A";

  const ellipses = layout
    .map((L) => {
      const dimOp = focusKey && focusKey !== L.g.key ? 0.06 : 1;
      return `<g opacity="${dimOp}">
        <ellipse cx="${L.cx}" cy="${L.oy}" rx="${L.rx}" ry="${L.ry}" fill="none" stroke="${esc(L.g.core)}" stroke-width="1.1" opacity="0.40" stroke-dasharray="3 9"/>
        <ellipse cx="${L.cx}" cy="${L.oy}" rx="${L.rx * 0.62}" ry="${L.ry * 0.62}" fill="none" stroke="${esc(L.g.core)}" stroke-width="0.8" opacity="0.18" stroke-dasharray="2 12"/>
      </g>`;
    })
    .join("");

  const rails = layout
    .slice(0, -1)
    .map((L, B) => {
      const j = layout[B + 1];
      const q = !focusKey || focusKey === L.g.key || focusKey === j.g.key;
      const d = `M ${L.cx + L.rx} ${L.hy} Q ${(L.cx + j.cx) / 2} ${(L.hy + j.hy) / 2 - 34}, ${j.cx - j.rx} ${j.hy}`;
      return `<g opacity="${q ? 1 : 0.1}">
        <path d="${d}" fill="none" stroke="${esc(j.g.core)}" stroke-width="3" opacity="0.14"/>
        <path d="${d}" fill="none" stroke="url(#cn-rail)" stroke-width="1.5" stroke-dasharray="9 9">
          <animate attributeName="stroke-dashoffset" from="36" to="0" dur="1.7s" repeatCount="indefinite"/>
        </path>
      </g>`;
    })
    .join("");

  const hubsHtml = layout.map((L) => intakeOrbitHubHtml(L, focusKey, null)).join("");
  const nodesHtml = layout.map((L) => L.nodes.map((n) => intakeOrbitNodeHtml(n, L, lockedId)).join("")).join("");

  inner.innerHTML = `
    <svg class="b44-orbit-svg" width="${dim.w}" height="${dim.h}" aria-hidden="true">
      <defs>
        <linearGradient id="cn-rail" x1="0" x2="1">
          <stop offset="0%" stop-color="${esc(firstHi)}"/>
          <stop offset="100%" stop-color="${esc(lastHi)}"/>
        </linearGradient>
      </defs>
      ${ellipses}${rails}
    </svg>
    <div class="b44-orbit-layer" style="width:${dim.w}px;height:${dim.h}px">${hubsHtml}${nodesHtml}</div>
  `;

  inner.querySelectorAll("[data-intake-pick]").forEach((btn) => {
    btn.addEventListener("click", () => openIntakePick(btn.dataset.intakePick, btn.dataset.intakeHub));
  });
  inner.querySelectorAll("[data-orbit-spin]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      bumpIntakeOrbitSpin(btn.dataset.orbitSpin, Number(btn.dataset.orbitDir) || 1);
    });
  });
  inner.querySelectorAll("[data-orbit-focus]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.orbitFocus;
      state.intakeOrbitFocus = state.intakeOrbitFocus === key ? null : key;
      paintIntakeOrbit(hubs);
    });
  });
}

function tickIntakeOrbit(ts) {
  intakeOrbitRaf = requestAnimationFrame(tickIntakeOrbit);
  if (!intakeDeskOrbit() || state.route !== "/scan-intake") {
    stopIntakeOrbitAnim();
    return;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (state.intakePickId) return; // live zre: pause auto-spin while locked
  if (!intakeOrbitLastTs) intakeOrbitLastTs = ts;
  const dt = Math.min(64, ts - intakeOrbitLastTs);
  intakeOrbitLastTs = ts;
  if (!intakeOrbitHubsCache.length) return;
  const next = { ...state.intakeOrbitSpin };
  intakeOrbitHubsCache.forEach((hub, i) => {
    next[hub.key] = (next[hub.key] || 0) + dt * 58e-6 * (i % 2 ? -1 : 1);
  });
  state.intakeOrbitSpin = next;
  applyIntakeOrbitPositions(intakeOrbitHubsCache);
}

function startIntakeOrbitAnim() {
  stopIntakeOrbitAnim();
  if (!intakeDeskOrbit()) return;
  intakeOrbitRaf = requestAnimationFrame(tickIntakeOrbit);
}

function renderIntakeOrbit(hubs) {
  const stage = $("intakeOrbit");
  if (!stage) return;
  intakeOrbitHubsCache = hubs;
  stage.classList.remove("hidden");
  stage.setAttribute("aria-hidden", "false");
  paintIntakeOrbit(hubs);
  startIntakeOrbitAnim();
}

function closeIntakePick() {
  state.intakePickId = null;
  state.intakePickHubKey = null;
  state.intakePickStatus = "";
  $("intakePickSheet")?.classList.add("hidden");
  updateIntakeHint();
  if (intakeOrbitHubsCache.length) applyIntakeOrbitPositions(intakeOrbitHubsCache);
}

function openIntakePick(id, hubKey) {
  const it = state.items.find((x) => x.id === id);
  const sheet = $("intakePickSheet");
  if (!it || !sheet) {
    closeIntakePick();
    return;
  }
  const hub = INTAKE_HUBS.find((h) => h.key === (hubKey || intakeItemCategory(it))) || INTAKE_HUBS[4];
  state.intakePickId = it.id;
  state.intakePickHubKey = hub.key;
  sheet.classList.remove("hidden");
  if ($("intakePickEyebrow")) $("intakePickEyebrow").textContent = `${hub.label.toUpperCase()} · INTAKE`;
  if ($("intakePickTitle")) $("intakePickTitle").textContent = it.title || "Untitled";
  if ($("intakePickPrice")) $("intakePickPrice").textContent = money(Number(it.marketValue ?? it.price) || 0);
  if ($("intakePickSku")) $("intakePickSku").textContent = it.sku || it.barcode || "NO SKU";
  if ($("intakePickStatus")) $("intakePickStatus").textContent = state.intakePickStatus || "";
  updateIntakeHint();
  if (intakeOrbitHubsCache.length) applyIntakeOrbitPositions(intakeOrbitHubsCache);
}

/** Live Zc intake hint: empty / has rows / locked pick. */
function updateIntakeHint(poolLen) {
  const hint = $("intakeHint");
  if (!hint) return;
  const n =
    typeof poolLen === "number"
      ? poolLen
      : intakeMapItems().filter((it) => {
          const q = String(state.filterIntake || "").trim().toLowerCase();
          if (!q) return true;
          const hay = `${it.title || ""} ${it.sku || ""} ${it.barcode || ""}`.toLowerCase();
          return hay.includes(q);
        }).length;
  if (state.intakePickId) {
    hint.textContent = "Locked on an item — ESC to pull back out.";
  } else if (n > 0) {
    hint.textContent = "Click an item to build its listing, or open it.";
  } else {
    hint.textContent =
      "Intake is empty — scan a barcode or drop a photo to bring inventory in.";
  }
}

function buildIntakeListing() {
  const it = state.items.find((x) => x.id === state.intakePickId);
  if (!it) return;
  try {
    // Live qle onAdvance: listing_status → ready_to_list; toast `${title} → Listing Built`
    it.listingStatus = "ready_to_list";
    it.staged = true;
    it.updatedAt = new Date().toISOString();
    saveItems();
    const msg = `${it.title || "Untitled"} → Listing Built`;
    state.intakePickStatus = msg;
    closeIntakePick();
    renderIntakeList();
    setScouterStatus(msg);
    showToast(msg, "ok");
  } catch {
    // Live qle: ht.error("Could not advance that item")
    showToast("Could not advance that item", "err");
  }
}

function openIntakeCard() {
  const id = state.intakePickId;
  if (!id) return;
  closeIntakePick();
  navigate(`/item/${id}`);
}

function renderIntakeList() {
  const root = $("intakeHubs");
  const empty = $("intakeEmpty");
  const orbit = $("intakeOrbit");
  if (!root || !empty) return;
  const q = String(state.filterIntake || "").trim().toLowerCase();
  const pool = intakeMapItems().filter((it) => {
    if (!q) return true;
    const hay = `${it.title || ""} ${it.sku || ""} ${it.barcode || ""}`.toLowerCase();
    return hay.includes(q);
  });
  const hubs = intakeHubsFromItems(pool);
  const intakeVal = pool.reduce(
    (sum, it) => sum + (Number(it.marketValue ?? it.price) || 0) * (Number(it.quantity) || 1),
    0,
  );
  if ($("intakeValue")) $("intakeValue").textContent = money(intakeVal);
  empty.classList.toggle("hidden", pool.length > 0);
  updateIntakeHint(pool.length);
  publishIntakeHud(hubs, intakeVal);

  const deskOrbit = intakeDeskOrbit() && pool.length > 0;
  if (orbit) {
    if (deskOrbit) {
      root.innerHTML = "";
      root.classList.add("hidden");
      renderIntakeOrbit(hubs);
    } else {
      stopIntakeOrbitAnim();
      orbit.classList.add("hidden");
      orbit.setAttribute("aria-hidden", "true");
      const inner = $("intakeOrbitInner");
      if (inner) inner.innerHTML = "";
      intakeOrbitHubsCache = [];
      root.classList.remove("hidden");
      root.innerHTML = hubs.map(intakeHubSectionHtml).join("");
      root.querySelectorAll("[data-intake-pick]").forEach((btn) => {
        btn.addEventListener("click", () => openIntakePick(btn.dataset.intakePick, btn.dataset.intakeHub));
      });
    }
  } else {
    root.innerHTML = hubs.map(intakeHubSectionHtml).join("");
    root.querySelectorAll("[data-intake-pick]").forEach((btn) => {
      btn.addEventListener("click", () => openIntakePick(btn.dataset.intakePick, btn.dataset.intakeHub));
    });
  }

  if (state.intakePickId && pool.some((it) => it.id === state.intakePickId)) {
    openIntakePick(state.intakePickId, state.intakePickHubKey);
  } else if (state.intakePickId) {
    closeIntakePick();
  }
}

function renderCollection() {
  const root = $("collectionRoot");
  const empty = $("scouterEmpty");
  if (!root) return;
  const source = scouterViewItems();
  // Live tle: no Filter scouter / Export CSV toolbar — show all non-archived pipeline rows.
  const rows = source.filter((it) => {
    if (it.archived) return false;
    if (it.listingStatus === "sold" || it.listingStatus === "error") return false;
    return true;
  });
  const intakeN = source.filter((it) => !it.archived && itemPipeLabel(it) === "Intake").length;
  const builtN = source.filter((it) => !it.archived && itemPipeLabel(it) === "Listing Built").length;
  const listedN = source.filter((it) => !it.archived && itemPipeLabel(it) === "Listed").length;
  loadSpaces();
  const onMap = source.filter((it) => !it.archived).length; // live tle On map = all view items
  const spaceRoots = state.spaces.filter((s) => !(s.parentId || s.parent_id)).length;
  const value = source
    .filter((it) => !it.archived && it.listingStatus !== "sold")
    .reduce((sum, it) => sum + (Number(it.marketValue) || 0) * (Number(it.quantity) || 1), 0);
  if ($("scoutStepIntake")) $("scoutStepIntake").textContent = pad2(intakeN);
  if ($("scoutStepBuilt")) $("scoutStepBuilt").textContent = pad2(builtN);
  if ($("scoutStepListed")) $("scoutStepListed").textContent = pad2(listedN);
  if ($("scoutSpaceCount")) $("scoutSpaceCount").textContent = pad2(spaceRoots);
  if ($("scoutOnMap")) $("scoutOnMap").textContent = pad2(onMap);
  if ($("scouterCount")) $("scouterCount").textContent = pad2(rows.length);
  if ($("scouterValue")) $("scouterValue").textContent = money(value);

  publishScouterHud({ intakeN, builtN, listedN, spaceRoots, onMap, value });

  const demoBtn = $("btnScoutDemo");
  if (demoBtn) {
    demoBtn.textContent = state.scouterDemo ? "DEMO" : "LIVE";
    demoBtn.classList.toggle("is-demo", !!state.scouterDemo);
  }
    if ($("scouterStatus") && state.scouterStatus) $("scouterStatus").textContent = state.scouterStatus;

  const pipe = state.scouterMode !== "spaces";
  $("btnScoutPipeline")?.classList.toggle("m-btn-primary", pipe);
  $("btnScoutSpaces")?.classList.toggle("m-btn-primary", !pipe);
  document.querySelectorAll("[data-pipe-stat]").forEach((el) => el.classList.toggle("hidden", !pipe));
  document.querySelectorAll("[data-space-stat]").forEach((el) => el.classList.toggle("hidden", pipe));

  if (empty) empty.classList.toggle("hidden", rows.length > 0);
  if (!rows.length) {
    root.innerHTML = "";
    return;
  }

  const groups = pipe ? scouterPipelineGroups(rows) : scouterSpaceGroups(rows);
  root.innerHTML = `<div class="b44-scout-groups">${groups.map(scouterGroupHtml).join("")}</div>`;
  bindScouterGroupDnD(root);
  if (state.lockedItemId) openScouterReadout(state.lockedItemId);
}

/** Live tle → Zc → BX HUD (breadcrumb + Ne stats). STEP labels stay on group headers only. */
function publishScouterHud(counts) {
  if (state.route !== "/inventory" && !$("view-inventory")?.classList.contains("active")) return;
  let intakeN; let builtN; let listedN; let spaceRoots; let onMap; let value;
  if (counts) {
    ({ intakeN, builtN, listedN, spaceRoots, onMap, value } = counts);
  } else {
    const source = scouterViewItems();
    intakeN = source.filter((it) => !it.archived && itemPipeLabel(it) === "Intake").length;
    builtN = source.filter((it) => !it.archived && itemPipeLabel(it) === "Listing Built").length;
    listedN = source.filter((it) => !it.archived && itemPipeLabel(it) === "Listed").length;
    loadSpaces();
    onMap = source.filter((it) => !it.archived).length;
    spaceRoots = state.spaces.filter((s) => !(s.parentId || s.parent_id)).length;
    value = source
      .filter((it) => !it.archived && it.listingStatus !== "sold")
      .reduce((sum, it) => sum + (Number(it.marketValue) || 0) * (Number(it.quantity) || 1), 0);
  }
  const pipeMode = state.scouterMode !== "spaces";
  const hudStats = pipeMode
    ? [
        { label: "Intake", value: pad2(intakeN), color: "var(--b44-mid)" },
        { label: "Listing Built", value: pad2(builtN), color: "var(--b44-gold-hi)" },
        { label: "Listed", value: pad2(listedN), color: "var(--b44-green-hi)" },
        { label: "Scouter value", value: money(value), color: "var(--b44-gold-hi)", big: true },
      ]
    : [
        { label: "Spaces", value: pad2(spaceRoots), color: "var(--b44-tan-hi, var(--b44-mid))" },
        { label: "On map", value: pad2(onMap), color: "var(--b44-mid)" },
        { label: "Scouter value", value: money(value), color: "var(--b44-gold-hi)", big: true },
      ];
  setHud({
    breadcrumb: [{ label: "Scouter" }, { label: pipeMode ? "Pipeline" : "Spaces" }],
    stats: hudStats,
  });
}

/** Live qle → Zc → BX HUD (Intake crumb + hub counts + Intake value). */
function publishIntakeHud(hubs, intakeVal) {
  if (state.route !== "/scan-intake" && !$("view-intake")?.classList.contains("active")) return;
  const list =
    hubs ||
    intakeHubsFromItems(
      intakeMapItems().filter((it) => {
        const q = String(state.filterIntake || "").trim().toLowerCase();
        if (!q) return true;
        const hay = `${it.title || ""} ${it.sku || ""} ${it.barcode || ""}`.toLowerCase();
        return hay.includes(q);
      }),
    );
  let value = intakeVal;
  if (typeof value !== "number") {
    value = intakeMapItems().reduce(
      (sum, it) => sum + (Number(it.marketValue ?? it.price) || 0) * (Number(it.quantity) || 1),
      0,
    );
  }
  const stats = list.map((h) => ({
    label: h.label,
    value: pad2(h.total),
    color: h.hi,
  }));
  stats.push({
    label: "Intake value",
    value: money(value),
    color: "var(--b44-gold-hi)",
    big: true,
  });
  setHud({
    breadcrumb: [{ label: "Intake" }],
    stats,
  });
}

function openScouterReadout(id) {
  const it = scouterViewItems().find((x) => x.id === id);
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

/** Live VN Open card / New asset sheet — OK MARKET/COST/PROFIT + edit actions. */
function moneyUsd(n) {
  return (
    "$" +
    Number(n || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function assetCategoryLabel(value) {
  const map = {
    pokemon_sealed: "Pokemon Sealed",
    graded_slabs: "Graded Slabs",
    raw_cards: "Raw Cards",
    sports_cards: "Sports Cards",
    other: "Other",
  };
  return map[value] || "Asset";
}

function assetPhaseLabel(phase) {
  const map = {
    sorted: "INTAKE",
    photographed: "INTAKE",
    ready_to_list: "READY",
    listed: "LIVE",
    sold: "SOLD",
    error: "ERROR",
  };
  return map[phase] || "INTAKE";
}

function updateAssetEconomics() {
  const market = Number($("assetMarket")?.value || 0) || 0;
  const cost = Number($("assetPurchase")?.value || 0) || 0;
  const profit = market - cost;
  if ($("assetEconMarket")) $("assetEconMarket").textContent = moneyUsd(market);
  if ($("assetEconCost")) $("assetEconCost").textContent = moneyUsd(cost);
  if ($("assetEconProfit")) {
    $("assetEconProfit").textContent = `${profit >= 0 ? "+" : ""}${moneyUsd(profit)}`;
    $("assetEconProfit").style.color = profit >= 0 ? "var(--b44-gold-hi,#ffd98a)" : "var(--b44-bad,#ff4d6d)";
  }
  const cat = assetCategoryLabel($("assetCategory")?.value || "other");
  const phase = assetPhaseLabel($("assetPhase")?.value || "sorted");
  if ($("assetSheetEyebrow")) $("assetSheetEyebrow").textContent = `${cat} · ${phase}`;
}

function openAssetSheet(item) {
  state.assetEditId = item?.id || null;
  state.assetPhotos = Array.isArray(item?.photos)
    ? item.photos.map((p) => (typeof p === "string" ? { dataUrl: p } : { ...p }))
    : [];
  if ($("assetSheetTitle")) {
    $("assetSheetTitle").textContent = item?.id ? "// EDIT ASSET" : "// NEW ASSET";
  }
  $("assetEditActions")?.classList.toggle("hidden", !item?.id);
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
  updateAssetEconomics();
  renderAssetThumbs();
  $("assetSheet")?.classList.remove("hidden");
  $("assetTitle")?.focus();
}

function closeAssetSheet() {
  state.assetEditId = null;
  state.assetPhotos = [];
  $("assetSheet")?.classList.add("hidden");
}

function duplicateAsset() {
  const it = state.items.find((x) => x.id === state.assetEditId);
  if (!it) return;
  const copy = {
    ...structuredClone(it),
    id: crypto.randomUUID(),
    title: `${it.title || "Untitled"} (Copy)`,
    listingStatus: "sorted",
    staged: false,
    liveChannel: "",
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.items.unshift(copy);
  saveItems();
  if ($("assetSheetStatus")) $("assetSheetStatus").textContent = "Duplicated";
  closeAssetSheet();
  openScouterReadout(copy.id);
  renderCollection();
  updateSitrep();
  showToast("Duplicated", "ok");
}

function archiveAsset() {
  const it = state.items.find((x) => x.id === state.assetEditId);
  if (!it) return;
  it.archived = true;
  it.updatedAt = new Date().toISOString();
  saveItems();
  if ($("assetSheetStatus")) $("assetSheetStatus").textContent = "Archived";
  closeAssetSheet();
  closeScouterReadout();
  renderCollection();
  updateSitrep();
}

function deleteAsset() {
  const id = state.assetEditId;
  if (!id) return;
  openConfirmDialog({
    title: "Delete item",
    message: "This permanently deletes the item. This cannot be undone.",
    confirmLabel: "Delete",
    danger: true,
    onConfirm: () => {
      state.items = state.items.filter((x) => x.id !== id);
      saveItems();
      if ($("assetSheetStatus")) $("assetSheetStatus").textContent = "Item deleted";
      closeAssetSheet();
      closeScouterReadout();
      renderCollection();
      updateSitrep();
      showToast("Item deleted", "ok");
    },
  });
}

function saveAssetSheet() {
  const title = ($("assetTitle")?.value || "").trim();
  // Live New card / asset save has no invent required-title status line.
  if (!title) return;
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
  try {
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
  } catch {
    // Live item images update: ht.error("Failed to save images")
    showToast("Failed to save images", "err");
  }
}

async function addAssetImageFiles(fileList) {
  const drop = $("btnAssetAddImages");
  drop?.classList.add("is-busy");
  try {
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
  } catch {
    // Live asset image read/save path
    showToast("Failed to save images", "err");
  } finally {
    drop?.classList.remove("is-busy");
  }
}




/** Live OK /item/:id page — Market & profit + Shipping package (from live jq/zq). */
const ITEM_PHASE_META = {
  draft: { label: "INTAKE", dot: "#C9D8E2" },
  sorted: { label: "INTAKE", dot: "#C9D8E2" },
  photographed: { label: "INTAKE", dot: "#C9D8E2" },
  ready_to_list: { label: "READY", dot: "#FFB43D" },
  listed: { label: "LIVE", dot: "#5FE8D0" },
  sold: { label: "SOLD", dot: "#8FF6E8" },
  error: { label: "ERROR", dot: "#FF6B5A" },
};

function itemMoney(n) {
  return moneyUsd(Number(n) || 0);
}

function itemProfitOf(it) {
  return Number(it?.marketValue || 0) - Number(it?.purchasePrice || 0);
}

function itemRoiOf(it) {
  const cost = Number(it?.purchasePrice || 0);
  return cost ? (itemProfitOf(it) / cost) * 100 : 0;
}

function itemRecommendedOf(it) {
  const recent = Number(it?.recentSold || 0);
  const market = Number(it?.marketValue || 0);
  const cost = Number(it?.purchasePrice || 0);
  return Math.max(2, recent || market || cost * 1.3);
}

function itemQuickSaleOf(it) {
  const low = Number(it?.lowestActive || 0);
  const market = Number(it?.marketValue || 0);
  return Math.max(2, low || market * 0.9);
}

function itemMaxProfitOf(it) {
  const market = Number(it?.marketValue || 0);
  return Math.max(2, market || itemRecommendedOf(it));
}

function currentItemPage() {
  return state.items.find((x) => x.id === state.itemPageId) || null;
}

function setItemPageStatus(msg) {
  state.itemPageStatus = msg || "";
  if ($("itemPageStatus")) $("itemPageStatus").textContent = state.itemPageStatus;
}

function fillItemSpaceOptions(selected) {
  loadSpaces();
  const sel = $("itemSpace");
  if (!sel) return;
  sel.innerHTML = [`<option value="">Select…</option>`]
    .concat(
      state.spaces.map(
        (s) =>
          `<option value="${esc(s.id)}" ${s.id === selected ? "selected" : ""}>${esc(s.name)}</option>`,
      ),
    )
    .join("");
}

function fillItemShipOptions(selected) {
  loadSettingsLocal();
  const sel = $("itemShipPreset");
  if (!sel) return;
  sel.innerHTML = [`<option value="">No package assigned</option>`]
    .concat(
      state.shipping.map(
        (s) =>
          `<option value="${esc(s.id)}" ${s.id === selected ? "selected" : ""}>${esc(s.name)}</option>`,
      ),
    )
    .join("");
}

/** Live Si next-step for zN "Push to ${label}". */
function nextPipeStep(it) {
  const key = itemPipeKey(it);
  const i = PIPE_STEPS.findIndex((s) => s.key === key);
  if (i < 0 || i >= PIPE_STEPS.length - 1) return null;
  return PIPE_STEPS[i + 1];
}

function updateItemEconomics(it) {
  const market = Number(it?.marketValue || 0);
  const cost = Number(it?.purchasePrice || 0);
  const qty = Math.max(1, Number(it?.quantity || 1));
  const profit = market - cost;
  const total = market * qty;
  if ($("itemEconMarket")) $("itemEconMarket").textContent = itemMoney(market);
  if ($("itemEconQty")) $("itemEconQty").textContent = String(qty);
  if ($("itemEconTotal")) $("itemEconTotal").textContent = itemMoney(total);
  if ($("itemEconCost")) $("itemEconCost").textContent = itemMoney(cost);
  if ($("itemEconProfit")) {
    $("itemEconProfit").textContent = `${profit >= 0 ? "+" : ""}${itemMoney(profit)}`;
    $("itemEconProfit").style.color =
      profit >= 0 ? "var(--b44-gold-hi,#ffd98a)" : "var(--b44-bad,#ff4d6d)";
  }
  const roi = itemRoiOf(it);
  if ($("itemMetricProfit")) {
    $("itemMetricProfit").textContent = `${profit >= 0 ? "+" : ""}${itemMoney(profit)}`;
    $("itemMetricProfit").style.color =
      profit >= 0 ? "var(--b44-gold-hi,#ffd98a)" : "var(--b44-bad,#ff4d6d)";
  }
  if ($("itemMetricRoi")) {
    $("itemMetricRoi").textContent = `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`;
    $("itemMetricRoi").style.color =
      roi >= 0 ? "var(--b44-gold-hi,#ffd98a)" : "var(--b44-bad,#ff4d6d)";
  }
  if ($("itemMetricRec")) $("itemMetricRec").textContent = itemMoney(itemRecommendedOf(it));
  if ($("itemMetricQuick")) $("itemMetricQuick").textContent = itemMoney(itemQuickSaleOf(it));
  if ($("itemMetricMax")) $("itemMetricMax").textContent = itemMoney(itemMaxProfitOf(it));
}

function renderItemShipSummary(it) {
  const root = $("itemShipSummary");
  if (!root) return;
  loadSettingsLocal();
  const preset = state.shipping.find((s) => s.id === (it?.shippingPresetId || ""));
  if (!preset) {
    root.classList.add("hidden");
    root.innerHTML = "";
    return;
  }
  const pkg = packageTypeLabel(preset.package_type || preset.packageType || "");
  const dims =
    preset.length || preset.width || preset.height
      ? `${preset.length || 0}×${preset.width || 0}×${preset.height || 0}in`
      : "";
  const bits = [
    pkg,
    preset.weight ? `${preset.weight}oz` : "",
    dims,
    preset.carrier || "",
    preset.service || "",
    preset.cost != null && preset.cost !== "" ? itemMoney(preset.cost) : "",
    preset.handling_days != null ? `${preset.handling_days}d handle` : "",
  ].filter(Boolean);
  root.classList.remove("hidden");
  root.innerHTML = `<div class="v-label" style="margin-bottom:4px">${esc(preset.name)}</div><div class="b44-copy-soft" style="font-size:12px">${esc(bits.join(" · ") || "No details set")}</div>`;
}

function renderItemPhotos() {
  const hero = $("itemPhotoHero");
  const thumbs = $("itemPhotoThumbs");
  if (!hero || !thumbs) return;
  const photos = state.itemPhotos || [];
  const primary = photos[0];
  if (primary) {
    const src = primary.dataUrl || primary;
    hero.innerHTML = `<img src="${src}" alt="" /><span class="b44-item-primary-tag">Primary</span>`;
  } else {
    hero.innerHTML = `<button type="button" class="b44-item-hero-empty" id="btnItemHeroAdd">Add photos</button>`;
    $("btnItemHeroAdd")?.addEventListener("click", () => $("itemImages")?.click());
  }
  thumbs.innerHTML = photos
    .map((p, i) => {
      const src = p.dataUrl || p;
      return `<div class="b44-thumb"><img src="${src}" alt="" /><div class="b44-thumb-actions">${
        i === 0 ? "" : `<button type="button" data-item-primary="${i}" title="Make primary">★</button>`
      }<button type="button" data-item-del-photo="${i}" title="Remove">×</button></div></div>`;
    })
    .join("");
  thumbs.querySelectorAll("[data-item-primary]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.itemPrimary);
      if (!i) return;
      const [shot] = state.itemPhotos.splice(i, 1);
      state.itemPhotos.unshift(shot);
      persistItemPhotos();
      renderItemPhotos();
    });
  });
  thumbs.querySelectorAll("[data-item-del-photo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.itemPhotos.splice(Number(btn.dataset.itemDelPhoto), 1);
      persistItemPhotos();
      renderItemPhotos();
    });
  });
}

function persistItemPhotos() {
  const it = currentItemPage();
  if (!it) return;
  it.photos = state.itemPhotos.slice();
  it.updatedAt = new Date().toISOString();
  saveItems();
}

async function addItemImageFiles(fileList) {
  const files = [...(fileList || [])];
  if ($("itemPhotoBusy")) $("itemPhotoBusy").textContent = files.length ? "SAVING…" : "";
  for (const file of files) {
    if (!file.type?.startsWith("image/")) continue;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    if (dataUrl) state.itemPhotos.push({ dataUrl, name: file.name });
  }
  persistItemPhotos();
  if ($("itemPhotoBusy")) $("itemPhotoBusy").textContent = "";
  renderItemPhotos();
}

function patchItemField(key, value) {
  const it = currentItemPage();
  if (!it) return;
  try {
    it[key] = value;
    it.updatedAt = new Date().toISOString();
    if (key === "listingStatus") {
      it.staged = value === "ready_to_list" || value === "listed";
    }
    saveItems();
    updateItemEconomics(it);
    syncItemChrome(it);
    renderCollection();
    updateSitrep();
  } catch {
    // Live item field update: ht.error("Failed to save"); space move: "Could not move item"
    showToast(key === "spaceId" ? "Could not move item" : "Failed to save", "err");
  }
}

function syncItemChrome(it) {
  const phase = it.listingStatus || "sorted";
  const meta = ITEM_PHASE_META[phase] || ITEM_PHASE_META.sorted;
  const cat = assetCategoryLabel(it.category || "other");
  if ($("itemEyebrow")) $("itemEyebrow").textContent = `${cat} · ${meta.label}`;
  if ($("itemHeadTitle")) $("itemHeadTitle").textContent = it.title || "Untitled";
  if ($("pageBrand")) $("pageBrand").textContent = (it.title || "ASSET").slice(0, 28);
  if ($("itemPhaseLabel")) {
    $("itemPhaseLabel").textContent = meta.label;
    $("itemPhaseLabel").style.color = meta.dot;
  }
  if ($("itemPhaseDot")) {
    $("itemPhaseDot").style.background = meta.dot;
    $("itemPhaseDot").style.boxShadow = `0 0 8px ${meta.dot}`;
  }
  if ($("itemCategoryLabel")) $("itemCategoryLabel").textContent = cat;
  if ($("btnItemArchive")) {
    $("btnItemArchive").textContent = it.archived ? "Restore" : "Archive";
  }
  syncZnActions(it);
  renderItemShipSummary(it);
  setItemPageStatus(state.itemPageStatus);
}

/** Live zN item CTAs — Push / Write listing with AI / Publish / Live on eBay. */
function syncZnActions(it) {
  const status = it?.listingStatus || it?.listing_status || "";
  const next = nextPipeStep(it);
  const canWrite = !["ready_to_list", "listed", "sold", "error"].includes(status);
  const canPublish = status === "ready_to_list";
  const isLive = status === "listed";
  const pushBtn = $("btnItemPush");
  if (pushBtn) {
    pushBtn.classList.toggle("hidden", !next);
    if (next) pushBtn.textContent = `Push to ${next.label}`;
  }
  $("btnItemWriteListing")?.classList.toggle("hidden", !canWrite);
  const pub = $("btnItemPublishEbay");
  if (pub) {
    pub.classList.toggle("hidden", !canPublish);
    if (canPublish) pub.textContent = "Publish to eBay";
  }
  $("itemLiveEbay")?.classList.toggle("hidden", !isLive);
}

function bumpItemQty(delta) {
  const it = currentItemPage();
  if (!it) return;
  const next = Math.max(1, Number(it.quantity || 1) + delta);
  it.quantity = next;
  it.updatedAt = new Date().toISOString();
  if ($("itemQty")) $("itemQty").value = String(next);
  saveItems();
  updateItemEconomics(it);
  syncItemChrome(it);
  renderCollection();
  updateSitrep();
}

async function pushItemPhase() {
  const it = currentItemPage();
  if (!it) return;
  const next = nextPipeStep(it);
  if (!next) return;
  const btn = $("btnItemPush");
  if (btn) {
    btn.textContent = "Pushing…";
    btn.disabled = true;
  }
  try {
    if (next.key === "ready_to_list") {
      it.staged = true;
      it.listingStatus = "ready_to_list";
    } else if (next.key === "listed") {
      it.listingStatus = "listed";
      it.staged = true;
    } else {
      it.listingStatus = next.key;
    }
    it.updatedAt = new Date().toISOString();
    saveItems();
    setItemPageStatus(`Pushed to ${next.label}`);
    showToast(`Pushed to ${next.label}`, "ok");
    if ($("itemPhase")) $("itemPhase").value = it.listingStatus;
    updateItemEconomics(it);
    syncItemChrome(it);
    renderCollection();
    updateSitrep();
  } catch {
    // Live item push: ht.error("Push failed")
    showToast("Push failed", "err");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function publishItemEbay() {
  const it = currentItemPage();
  if (!it) return;
  if (!state.ebayConnected) {
    setItemPageStatus("Connect eBay on Channel before publishing.");
    return;
  }
  if ((it.listingStatus || "") !== "ready_to_list") {
    // Live tle be(): ht.error("No listing built yet — run the AI writer on this card first")
    const msg = "No listing built yet — run the AI writer on this card first";
    setItemPageStatus(msg);
    showToast(msg, "err");
    return;
  }
  const btn = $("btnItemPublishEbay");
  if (btn) {
    btn.textContent = "Publishing…";
    btn.disabled = true;
  }
  window.setTimeout(() => {
    try {
      it.staged = true;
      it.listingStatus = "listed";
      it.liveChannel = it.liveChannel || "ebay";
      it.updatedAt = new Date().toISOString();
      saveItems();
      setItemPageStatus(`${it.title || "Untitled"} is live on eBay`);
      showToast(`${it.title || "Untitled"} is live on eBay`, "ok");
      if ($("itemPhase")) $("itemPhase").value = "listed";
      updateItemEconomics(it);
      syncItemChrome(it);
      renderCollection();
      updateSitrep();
    } catch (e) {
      // Live publish: ht.error(`Publish failed: ${…||"eBay rejected it"}`)
      showToast(`Publish failed: ${(e && e.message) || "eBay rejected it"}`, "err");
    } finally {
      if (btn) btn.disabled = false;
    }
  }, 400);
}

function nextSpaceKind(kind) {
  const values = SPACE_KINDS.map((k) => k.value);
  const i = values.indexOf(kind);
  return SPACE_KINDS[Math.min(Math.max(i, 0) + 1, values.length - 1)].value;
}

/** Live kK Storage Location picker — tree + add child. */
function renderItemMovePanel(open) {
  const panel = $("itemMovePanel");
  if (!panel) return;
  if (!open) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    state.itemMoveExpanded = {};
    state.itemMoveAddParent = null;
    return;
  }
  loadSpaces();
  const it = currentItemPage();
  const cur = it?.spaceId || "";
  if (!state.itemMoveExpanded) state.itemMoveExpanded = {};
  panel.classList.remove("hidden");

  const kidsOf = (parentId) =>
    state.spaces
      .filter((s) => (s.parentId || s.parent_id || "") === (parentId || ""))
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { numeric: true }));

  const roots = kidsOf("");
  let html = `<div class="v-label" style="margin-bottom:8px">Storage Location</div>`;
  if (!state.spaces.length) {
    html += `<p class="b44-copy-soft" style="font-size:12px;margin-bottom:8px">No locations yet — create one below.</p>`;
  }

  const renderNode = (sp, depth) => {
    const kids = kidsOf(sp.id);
    const expanded = !!state.itemMoveExpanded[sp.id];
    const pad = depth * 16;
    const toggle =
      kids.length > 0
        ? `<button type="button" class="m-btn" data-move-toggle="${esc(sp.id)}" style="width:28px;padding:4px;min-width:28px">${expanded ? "▾" : "▸"}</button>`
        : `<span style="display:inline-block;width:28px"></span>`;
    html += `<div class="b44-move-row" style="display:flex;align-items:center;gap:4px;padding-left:${pad}px;margin-bottom:4px">
      ${toggle}
      <button type="button" class="m-btn ${sp.id === cur ? "m-btn-primary" : ""}" data-item-move="${esc(sp.id)}" style="flex:1;justify-content:flex-start">${esc(sp.name)} <span class="v-label" style="margin-left:8px;font-size:8px">${esc(kindLabel(sp.kind || sp.type))}</span></button>
      <button type="button" class="m-btn" data-move-add="${esc(sp.id)}" title="Add child" style="width:28px;padding:4px;min-width:28px">+</button>
    </div>`;
    if (expanded) kids.forEach((k) => renderNode(k, depth + 1));
  };
  roots.forEach((r) => renderNode(r, 0));

  if (state.itemMoveAddParent != null) {
    const parent = state.itemMoveAddParent === "root" ? null : spaceById(state.itemMoveAddParent);
    const defaultKind = parent
      ? nextSpaceKind(parent.kind || parent.type || "warehouse")
      : "warehouse";
    const kindOpts = SPACE_KINDS.map(
      (k) =>
        `<option value="${esc(k.value)}" ${k.value === defaultKind ? "selected" : ""}>${esc(k.label)}</option>`,
    ).join("");
    html += `<div class="b44-toolbar" style="margin-top:10px;gap:8px;flex-wrap:wrap">
      <select id="itemMoveNewKind" class="b44-input" style="width:auto">${kindOpts}</select>
      <input id="itemMoveNewName" class="b44-input" type="text" placeholder="Name" style="flex:1;min-width:120px" />
      <button type="button" class="m-btn m-btn-primary" id="btnItemMoveAddGo">Add</button>
      <button type="button" class="m-btn" id="btnItemMoveAddCancel">Cancel</button>
    </div>`;
  } else {
    html += `<button type="button" class="m-btn" data-move-add="root" style="margin-top:8px">+ New root location</button>`;
  }

  panel.innerHTML = html;

  panel.querySelectorAll("[data-move-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.moveToggle;
      state.itemMoveExpanded[id] = !state.itemMoveExpanded[id];
      renderItemMovePanel(true);
    });
  });
  panel.querySelectorAll("[data-move-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.itemMoveAddParent = btn.dataset.moveAdd;
      renderItemMovePanel(true);
      $("itemMoveNewName")?.focus();
    });
  });
  panel.querySelectorAll("[data-item-move]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.itemMove || "";
      if ($("itemSpace")) $("itemSpace").value = next;
      patchItemField("spaceId", next);
      // Live kK onSelect: update storage_location_id and close — no toast
      renderItemMovePanel(false);
    });
  });
  $("btnItemMoveAddCancel")?.addEventListener("click", () => {
    state.itemMoveAddParent = null;
    renderItemMovePanel(true);
  });
  $("btnItemMoveAddGo")?.addEventListener("click", () => {
    const name = ($("itemMoveNewName")?.value || "").trim();
    if (!name) return;
    const kind = $("itemMoveNewKind")?.value || "warehouse";
    const parentId = state.itemMoveAddParent === "root" ? "" : state.itemMoveAddParent || "";
    loadSpaces();
    const id = crypto.randomUUID();
    state.spaces.unshift({
      id,
      name,
      kind,
      code: "",
      parentId,
      createdAt: new Date().toISOString(),
    });
    saveSpaces();
    if (parentId) state.itemMoveExpanded[parentId] = true;
    state.itemMoveAddParent = null;
    fillItemSpaceOptions(cur);
    renderItemMovePanel(true);
    // Live kK / tree create toast
    showToast("Location added", "ok");
  });
  $("itemMoveNewName")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("btnItemMoveAddGo")?.click();
  });
}


/** Live PK — Shipping Presets manage sheet (OK · Shipping package · Manage). */
function closeItemShipManage() {
  $("itemShipManageSheet")?.classList.add("hidden");
  if ($("itemShipManageStatus")) $("itemShipManageStatus").textContent = "";
}

function openItemShipManage() {
  renderItemShipManage();
  $("itemShipManageSheet")?.classList.remove("hidden");
  $("pkShipName")?.focus();
}

function renderItemShipManage() {
  loadSettingsLocal();
  const list = $("pkShipList");
  const empty = $("pkShipEmpty");
  if (!list) return;
  if (!state.shipping.length) {
    list.innerHTML = "";
    if (empty) {
      empty.classList.remove("hidden");
      empty.textContent = "No presets yet. Create one below.";
    }
  } else {
    if (empty) empty.classList.add("hidden");
    list.innerHTML = state.shipping
      .map((s) => {
        const pkg = packageTypeLabel(s.package_type || s.packageType || "bubble_mailer");
        const weight = s.weight ? ` · ${s.weight}oz` : "";
        const dims =
          s.length || s.width || s.height
            ? ` · ${s.length || 0}×${s.width || 0}×${s.height || 0}in`
            : "";
        return `<div class="b44-pk-ship-row">
          <div style="flex:1;min-width:0">
            <div class="b44-pk-ship-row-name">${esc(s.name)}</div>
            <div class="b44-pk-ship-row-meta">${esc(pkg)}${esc(weight)}${esc(dims)}</div>
          </div>
          <button type="button" class="b44-pk-ship-row-del" data-pk-del-ship="${esc(s.id)}" title="Delete" aria-label="Delete preset">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
          </button>
        </div>`;
      })
      .join("");
    list.querySelectorAll("[data-pk-del-ship]").forEach((btn) => {
      btn.addEventListener("click", () => {
        loadSettingsLocal();
        state.shipping = state.shipping.filter((s) => s.id !== btn.dataset.pkDelShip);
        saveSettingsLocal();
        const it = currentItemPage();
        fillItemShipOptions(it?.shippingPresetId || it?.shipping_preset_id || "");
        if (it) renderItemShipSummary(it);
        renderItemShipManage();
        if ($("itemShipManageStatus")) $("itemShipManageStatus").textContent = "Preset deleted";
        // Live PK: ht.success("Preset deleted")
        showToast("Preset deleted", "ok");
        if (state.settingsTab === "shipping") renderSettings();
      });
    });
  }
  if ($("pkShipName")) $("pkShipName").value = "";
  if ($("pkShipPackageType")) $("pkShipPackageType").value = "bubble_mailer";
  if ($("pkShipWeight")) $("pkShipWeight").value = "";
  if ($("pkShipLength")) $("pkShipLength").value = "";
  if ($("pkShipWidth")) $("pkShipWidth").value = "";
  if ($("pkShipHeight")) $("pkShipHeight").value = "";
}

function createPkShipPreset() {
  const btn = $("btnPkShipCreate");
  if (btn?.classList.contains("is-busy")) return;
  const name = ($("pkShipName")?.value || "").trim();
  if (!name) {
    if ($("itemShipManageStatus")) $("itemShipManageStatus").textContent = "Name is required";
    // Live PK: ht.error("Name is required")
    showToast("Name is required", "err");
    return;
  }
  btn?.classList.add("is-busy");
  if (btn) btn.disabled = true;
  try {
    const package_type = $("pkShipPackageType")?.value || "bubble_mailer";
    const weight = Number($("pkShipWeight")?.value || 0);
    const length = Number($("pkShipLength")?.value || 0);
    const width = Number($("pkShipWidth")?.value || 0);
    const height = Number($("pkShipHeight")?.value || 0);
    loadSettingsLocal();
    state.shipping.unshift({
      id: crypto.randomUUID(),
      name,
      package_type,
      weight,
      length,
      width,
      height,
      carrier: "",
      service: "",
      cost: 0,
      handling_days: 1,
      is_default: state.shipping.length === 0,
    });
    saveSettingsLocal();
    const it = currentItemPage();
    fillItemShipOptions(it?.shippingPresetId || it?.shipping_preset_id || "");
    if (it) renderItemShipSummary(it);
    renderItemShipManage();
    if ($("itemShipManageStatus")) $("itemShipManageStatus").textContent = "Preset created";
    // Live PK: ht.success("Preset created")
    showToast("Preset created", "ok");
    if (state.settingsTab === "shipping") renderSettings();
  } finally {
    btn?.classList.remove("is-busy");
    if (btn) btn.disabled = false;
  }
}

function loadCollections() {
  try {
    const raw = localStorage.getItem(COLLECTIONS_KEY);
    state.collections = raw ? JSON.parse(raw) : [];
  } catch {
    state.collections = [];
  }
  if (!Array.isArray(state.collections)) state.collections = [];
}

function saveCollections() {
  localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(state.collections));
}

/** Live OK item Collections field — empty shows "No collections yet." */
function renderItemCollections(it) {
  loadCollections();
  const ids = Array.isArray(it?.collectionIds)
    ? it.collectionIds
    : Array.isArray(it?.collection_ids)
      ? it.collection_ids
      : [];
  const n = ids.filter((id) => state.collections.some((c) => c.id === id)).length;
  if ($("itemCollectionsSummary")) $("itemCollectionsSummary").textContent = `${n} selected`;
  const panel = $("itemCollectionsPanel");
  const empty = $("itemCollectionsEmpty");
  const list = $("itemCollectionsList");
  if (panel) panel.classList.toggle("hidden", !state.itemCollectionsOpen);
  if (empty) empty.classList.toggle("hidden", state.collections.length > 0);
  if (list) {
    list.innerHTML = state.collections
      .map((c) => {
        const on = ids.includes(c.id);
        return `<label class="b44-item-collection-row" style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer">
          <input type="checkbox" data-collection-id="${esc(c.id)}" ${on ? "checked" : ""} />
          <span style="font-size:13px;color:var(--b44-mid,#8a9eab)">${esc(c.name || "Untitled")}</span>
        </label>`;
      })
      .join("");
    list.querySelectorAll("[data-collection-id]").forEach((box) => {
      box.addEventListener("change", () => {
        const cur = currentItemPage();
        if (!cur) return;
        const set = new Set(
          Array.isArray(cur.collectionIds)
            ? cur.collectionIds
            : Array.isArray(cur.collection_ids)
              ? cur.collection_ids
              : [],
        );
        if (box.checked) set.add(box.dataset.collectionId);
        else set.delete(box.dataset.collectionId);
        cur.collectionIds = [...set];
        cur.collection_ids = cur.collectionIds;
        cur.updatedAt = new Date().toISOString();
        saveItems();
        renderItemCollections(cur);
      });
    });
  }
}

function renderItemPage(id) {
  const it = state.items.find((x) => x.id === id);
  if (!it) {
    setItemPageStatus("Item not found.");
    navigate("/inventory");
    return;
  }
  state.itemPageId = it.id;
  state.itemPhotos = Array.isArray(it.photos)
    ? it.photos.map((p) => (typeof p === "string" ? { dataUrl: p } : { ...p }))
    : [];
  state.itemPageStatus = "";
  if ($("itemTitle")) $("itemTitle").value = it.title || "";
  if ($("itemCategory")) $("itemCategory").value = it.category || "other";
  if ($("itemQty")) $("itemQty").value = String(it.quantity ?? 1);
  let phase = it.listingStatus || it.listing_status || "sorted";
  if (!it.listingStatus && it.staged) phase = "ready_to_list";
  if ($("itemPhase")) $("itemPhase").value = phase;
  if ($("itemChannel")) $("itemChannel").value = it.liveChannel || it.live_channel || "";
  fillItemSpaceOptions(it.spaceId || it.storage_location_id || "");
  state.itemCollectionsOpen = false;
  renderItemCollections(it);
  if ($("itemNotes")) $("itemNotes").value = it.notes || "";
  if ($("itemPurchase")) $("itemPurchase").value = String(it.purchasePrice ?? it.purchase_price ?? 0);
  if ($("itemMarket")) $("itemMarket").value = String(it.marketValue ?? it.market_value ?? 0);
  if ($("itemLowestActive")) $("itemLowestActive").value = String(it.lowestActive ?? it.lowest_active ?? 0);
  if ($("itemRecentSold")) $("itemRecentSold").value = String(it.recentSold ?? it.recent_sold ?? 0);
  fillItemShipOptions(it.shippingPresetId || it.shipping_preset_id || "");
  updateItemEconomics(it);
  syncItemChrome(it);
  renderItemPhotos();
  renderItemMovePanel(false);
  closeItemShipManage();
  closeAssetSheet();
  closeScouterReadout();
}

function duplicateItemPage() {
  const it = currentItemPage();
  if (!it) return;
  const copy = {
    ...structuredClone(it),
    id: crypto.randomUUID(),
    title: `${it.title || "Untitled"} (Copy)`,
    listingStatus: "sorted",
    staged: false,
    liveChannel: "",
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.items.unshift(copy);
  saveItems();
  renderCollection();
  updateSitrep();
  navigate(`/item/${copy.id}`);
  setItemPageStatus("Duplicated");
  showToast("Duplicated", "ok");
}

function archiveItemPage() {
  const it = currentItemPage();
  if (!it) return;
  it.archived = !it.archived;
  it.updatedAt = new Date().toISOString();
  saveItems();
  renderCollection();
  updateSitrep();
  if (it.archived) navigate("/inventory");
  else {
    syncItemChrome(it);
    setItemPageStatus("Restored");
  }
}

function deleteItemPage() {
  const id = state.itemPageId;
  if (!id) return;
  openConfirmDialog({
    title: "Delete item",
    message: "This permanently deletes the item. This cannot be undone.",
    confirmLabel: "Delete",
    danger: true,
    onConfirm: () => {
      state.items = state.items.filter((x) => x.id !== id);
      saveItems();
      state.itemPageId = null;
      state.itemPhotos = [];
      renderCollection();
      updateSitrep();
      showToast("Item deleted", "ok");
      navigate("/");
    },
  });
}


/** Live DK confirm dialog — title + message + Cancel / confirm. */
let confirmDialogOnConfirm = null;

function closeConfirmDialog() {
  confirmDialogOnConfirm = null;
  $("confirmSheet")?.classList.add("hidden");
}

function openConfirmDialog({ title, message, confirmLabel = "Confirm", danger = false, onConfirm }) {
  confirmDialogOnConfirm = typeof onConfirm === "function" ? onConfirm : null;
  if ($("confirmTitle")) $("confirmTitle").textContent = title || "Confirm";
  if ($("confirmMessage")) {
    $("confirmMessage").textContent = message || "";
    $("confirmMessage").classList.toggle("hidden", !message);
  }
  const ok = $("btnConfirmOk");
  if (ok) {
    ok.textContent = confirmLabel || "Confirm";
    ok.classList.toggle("is-danger", !!danger);
  }
  $("confirmSheet")?.classList.remove("hidden");
}

function setBatchGame(code) {
  const hit = INTAKE_GAMES.find((g) => g.code === code) || INTAKE_GAMES[0];
  state.game = hit.code;
  if ($("batchGame")) $("batchGame").value = hit.code;
  document.querySelectorAll("#batchGameChips [data-game]").forEach((btn) => {
    btn.classList.toggle("m-chip-on", btn.dataset.game === hit.code);
  });
  // Live Mle: SKU prefix derived from game (Yle[game]||"ITM") — no Mle SKU field
  state.skuPrefix = hit.code === "PKM" ? "PKM" : hit.code;
  if ($("groupSkuPrefix")) $("groupSkuPrefix").value = state.skuPrefix;
}

function updateBatchScanChrome() {
  const n = state.draftPhotos.length;
  const odd = !!state.backsIncluded && n > 0 && n % 2 !== 0;
  if ($("batchScanReady")) {
    $("batchScanReady").innerHTML = odd
      ? `${n} scan${n === 1 ? "" : "s"} ready<span class="b44-odd-inline"> · odd count</span>`
      : `${n} scan${n === 1 ? "" : "s"} ready`;
  }
  $("batchOddWarn")?.classList.toggle("hidden", !odd);
}

function regroupIntake() {
  const fronts = state.intakeScans.filter((s) => s.isFront);
  state.intakeGroups = groupFrontsByHash(fronts, state.intakeThreshold);
  renderGrouping();
}

function renderGrouping() {
  const root = $("groupGrid");
  if (!root) return;
  const scans = state.intakeScans;
  const groups = state.intakeGroups;
  const cardCount = state.backsIncluded ? Math.floor(scans.length / 2) : scans.length;
  const unique = groups.length;
  const dupes = Math.max(0, cardCount - unique);
  const fewer = cardCount ? Math.round((dupes / cardCount) * 100) : 0;
  if ($("groupStatScans")) $("groupStatScans").textContent = String(scans.length);
  if ($("groupStatCards")) $("groupStatCards").textContent = String(cardCount);
  if ($("groupStatUnique")) $("groupStatUnique").textContent = String(unique);
  if ($("groupThreshVal")) $("groupThreshVal").textContent = String(state.intakeThreshold);
  if ($("groupSensitivity")) $("groupSensitivity").value = String(state.intakeThreshold);
  if ($("groupSkuPrefix")) $("groupSkuPrefix").value = state.skuPrefix || "";
  $("btnSwapFrontBack")?.classList.toggle("hidden", !state.backsIncluded);
  if ($("groupVerify")) {
    let msg = `Verify the grouping is right before identifying. ${unique} unique group${unique === 1 ? "" : "s"} from ${cardCount} card${cardCount === 1 ? "" : "s"}.`;
    if (dupes > 0) msg += ` ${dupes} duplicates collapsed — ${fewer}% fewer AI calls.`;
    msg += " Drag the sensitivity to tighten or loosen.";
    $("groupVerify").textContent = msg;
  }
  root.innerHTML = groups
    .map((g, gi) => {
      const head = g[0];
      const open = state.groupSplitOpen === gi;
      const thumbs = g
        .slice(0, 8)
        .map(
          (s) =>
            `<div class="b44-group-mini">${s.url ? `<img src="${s.url}" alt="" />` : ""}</div>`,
        )
        .join("");
      const extra = g.length > 8 ? `<span class="b44-group-extra">+${g.length - 8}</span>` : "";
      const splitGrid = open
        ? `<div class="b44-group-split">
            <div class="b44-group-split-grid">
              ${g
                .map((s) => {
                  const on = state.groupSplitPick.includes(s.id);
                  return `<button type="button" class="b44-group-pick${on ? " on" : ""}" data-split-id="${s.id}" title="${esc(s.filename)}">
                    ${s.url ? `<img src="${s.url}" alt="" />` : ""}
                  </button>`;
                })
                .join("")}
            </div>
            <button type="button" class="m-btn m-btn-primary w-full" data-confirm-split="${gi}" ${state.groupSplitPick.length ? "" : "disabled"} style="font-size:11px;margin-top:8px">
              Split ${state.groupSplitPick.length || ""} into new group
            </button>
          </div>`
        : "";
      return `<div class="m-panel b44-group-card${open ? " open" : ""}">
        <div class="b44-group-head">
          <span class="b44-group-dot" aria-hidden="true"></span>
          <span class="b44-group-label">Group ${gi + 1}</span>
          <span class="b44-group-qty m-mono">×${g.length}</span>
        </div>
        <div class="b44-group-body">
          <div class="b44-group-hero">${head?.url ? `<img src="${head.url}" alt="" />` : ""}</div>
          <div class="b44-group-minis">${thumbs}${extra}</div>
          <button type="button" class="m-btn m-btn-ghost w-full" data-toggle-split="${gi}" style="font-size:11px;margin-top:8px">${open ? "Close" : "Split"}</button>
          ${splitGrid}
        </div>
      </div>`;
    })
    .join("");
  root.querySelectorAll("[data-toggle-split]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const gi = Number(btn.dataset.toggleSplit);
      state.groupSplitOpen = state.groupSplitOpen === gi ? null : gi;
      state.groupSplitPick = [];
      renderGrouping();
    });
  });
  root.querySelectorAll("[data-split-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.splitId);
      const set = new Set(state.groupSplitPick);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      state.groupSplitPick = [...set];
      renderGrouping();
    });
  });
  root.querySelectorAll("[data-confirm-split]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const gi = Number(btn.dataset.confirmSplit);
      splitIntakeGroup(gi, state.groupSplitPick);
    });
  });
}

function splitIntakeGroup(gi, ids) {
  if (!ids?.length) return;
  const next = state.intakeGroups.map((g) => g.slice());
  const moved = next[gi].filter((s) => ids.includes(s.id));
  next[gi] = next[gi].filter((s) => !ids.includes(s.id));
  if (moved.length) next.push(moved);
  state.intakeGroups = next.filter((g) => g.length > 0);
  state.groupSplitOpen = null;
  state.groupSplitPick = [];
  renderGrouping();
  setStatus("Group split");
  showToast("Group split", "ok");
}

function swapFrontBack() {
  state.intakeScans = state.intakeScans.map((s) => ({ ...s, isFront: !s.isFront }));
  state.groupSplitOpen = null;
  state.groupSplitPick = [];
  regroupIntake();
  setStatus("Front ↔ back swapped");
  showToast("Front ↔ back swapped", "ok");
}

async function startIntakeToGrouping() {
  const photos = state.draftPhotos;
  // Live Mle: Start intake is a no-op when the drop list is empty.
  if (!photos.length) return;
  if (state.backsIncluded && photos.length % 2 !== 0) {
    const oddMsg = `Odd file count (${photos.length}) — front/back pairing would misalign. Add or remove a scan.`;
    setStatus(oddMsg);
    // Live Yle: ht.error(`Odd file count (${…}) — …`)
    showToast(oddMsg, "err");
    $("batchOddWarn")?.classList.remove("hidden");
    return;
  }
  setIntakeMode("processing");
  setProcessingProgress("Uploading", 0, photos.length);
  const scans = [];
  for (let z = 0; z < photos.length; z++) {
    const p = photos[z];
    let hash = "";
    try {
      hash = (await intakeDHashFromDataUrl(p.dataUrl)).hash;
    } catch {
      /* empty hash → singleton */
    }
    scans.push({
      id: z,
      filename: p.file?.name || `scan-${z + 1}.jpg`,
      url: p.dataUrl,
      hash,
      isFront: !state.backsIncluded || z % 2 === 0,
      pair: state.backsIncluded ? Math.floor(z / 2) : z,
    });
    setProcessingProgress("Uploading", z + 1, photos.length);
  }
  setProcessingProgress("Deduping", 1, 1);
  state.intakeScans = scans;
  state.intakeThreshold = 5;
  state.groupSplitOpen = null;
  state.groupSplitPick = [];
  regroupIntake();
  const cards = scans.filter((s) => s.isFront).length;
  setIntakeMode("grouping");
  const groupMsg = `${cards} cards → ${state.intakeGroups.length} unique`;
  setStatus(groupMsg);
  // Live Yle: ht.success(`${n} cards → ${m} unique`)
  showToast(groupMsg, "ok");
}

async function startIdentificationFromGroups() {
  const groups = state.intakeGroups;
  // Live kp: Start identification is a no-op with zero groups.
  if (!groups.length) return;
  setIntakeMode("identifying");
  setIdentifyingRows(0);
  const total = groups.length;
  let done = 0;
  const prefix = (state.skuPrefix || "").trim().toUpperCase();
  const scanCount = state.intakeScans.length;
  const rows = [];
  for (const g of groups) {
    const front = g[0];
    const back = state.backsIncluded
      ? state.intakeScans.find((s) => s.pair === front.pair && !s.isFront)
      : null;
    const photos = [front.url].concat(back?.url ? [back.url] : []);
    let title = (front.filename || "").replace(/\.[^.]+$/, "") || `Card ${done + 1}`;
    let number = "";
    let setName = "";
    let setCode = "";
    let variation = "";
    let confidence = "Failed";
    let message = "";
    let candidates = [];
    try {
      const res = await fetch("/api/scouter/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photos,
          category: state.category,
          quantity: g.length,
          game: state.game,
          sku_prefix: prefix || undefined,
        }),
      });
      const result = await res.json();
      message = result.message || "";
      const idn = result.identity || {};
      if (idn.product_name) title = idn.product_name;
      number = idn.collector_number || idn.number || "";
      setName = idn.set_name || idn.set || "";
      setCode = idn.set_code || "";
      variation = idn.finish || idn.variation || "";
      confidence = mapIntakeConfidence(idn.confidence || result.confidence, !!idn.product_name);
      candidates = (result.candidates || []).map((c, ci) => ({
        id: c.id || `cand-${done}-${ci}`,
        name: c.product_name || c.name || "Candidate",
        number: c.collector_number || c.number || "",
        set: c.set_name || c.set || "",
        set_code: c.set_code || "",
        image_url: c.image_url || c.imageUrl || null,
      }));
    } catch (e) {
      message = `Identification failed: ${e.message}`;
      confidence = "Failed";
      // Live scanIdentify catch: ht.error("Identification failed: " + …)
      showToast(message, "err");
    }
    const status = confidence === "High" ? "Approved" : "Needs Review";
    rows.push({
      id: crypto.randomUUID(),
      card_name: title,
      number,
      set: setName,
      set_code: setCode,
      variation,
      condition: "NM",
      quantity: g.length,
      sku: prefix ? `${prefix}-${String(done + 1).padStart(3, "0")}` : "",
      language: "English",
      confidence,
      status,
      market_price: "",
      suggested_price: "",
      photos: photos.map((dataUrl) => ({ dataUrl })),
      front_url: front.url || "",
      back_url: back?.url || "",
      catalog_candidates: candidates,
      message,
    });
    done += 1;
    setIdentifyingRows(done);
  }
  state.intakeReviewRows = rows;
  state.intakeScanCount = scanCount;
  state.intakeReviewFilter = "";
  state.intakeReviewSelected = [];
  state.intakeReviewRescan = [];
  state.intakeReviewFocusId = null;
  state.reviewPreviewFace = "front";
  state.intakeExportSummary = null;
  state.intakeReviewStatus = "Identification complete";
  setIntakeMode("review");
  renderIntakeReview();
  showToast("Identification complete", "ok");
}

function mapIntakeConfidence(raw, hasName) {
  const c = String(raw || "").toLowerCase();
  if (c === "high") return "High";
  if (c === "medium") return "Medium";
  if (c === "low") return "Low";
  if (hasName) return "Medium";
  return "Failed";
}

function intakeReviewVisible() {
  const f = state.intakeReviewFilter;
  let rows = [...state.intakeReviewRows];
  if (f) rows = rows.filter((r) => r.confidence === f);
  const order = { Failed: 0, Low: 1, Medium: 2, High: 3, "": 4 };
  rows.sort(
    (a, b) =>
      (order[a.confidence] ?? 4) - (order[b.confidence] ?? 4) ||
      String(a.card_name || "").localeCompare(String(b.card_name || "")),
  );
  return rows;
}

/** Live $le batch-review alert strip. */
function renderReviewAlerts(rows, scanCount) {
  const el = $("reviewSummary");
  if (!el) return;
  const counts = { High: 0, Medium: 0, Low: 0, Failed: 0 };
  rows.forEach((r) => {
    counts[r.confidence] = (counts[r.confidence] || 0) + 1;
  });
  const below = rows.filter((r) => r.condition && r.condition !== "NM");
  const cantId = rows.filter((r) => r.confidence === "Failed" || r.confidence === "Low");
  const rescanN = (state.intakeReviewRescan || []).length;
  const glassDirty =
    rows.filter((r) => (r.raw_extraction?.unreadable_fields || []).length > 0).length >= 3;
  const parts = [
    `<div class="b44-review-alert-summary">${esc(scanCount)} scans → ${rows.length} rows · ${counts.High} High · ${counts.Medium} Medium · ${counts.Low} Low · ${counts.Failed} Failed</div>`,
  ];
  if (below.length) {
    const detail = below
      .slice(0, 6)
      .map((a) => `${a.card_name || a.title || "?"} #${a.number || "?"} — ${a.condition}`)
      .join(" · ");
    parts.push(
      `<div class="b44-review-alert-block"><div class="b44-review-alert-bad">⚠️ Below NM (${below.length})</div><div class="b44-review-alert-detail">${esc(detail)}</div></div>`,
    );
  }
  if (cantId.length) {
    const detail =
      cantId
        .slice(0, 6)
        .flatMap((a) => a.source_files || [])
        .join(" · ") || "—";
    parts.push(
      `<div class="b44-review-alert-block"><div class="b44-review-alert-bad">❓ Couldn't ID (${cantId.length})</div><div class="b44-review-alert-files">${esc(detail)}</div></div>`,
    );
  }
  if (rescanN > 0) {
    parts.push(
      `<div class="b44-review-alert-block"><div class="b44-review-alert-gold">🧹 Rescan flagged: ${rescanN} row(s)</div></div>`,
    );
  }
  if (glassDirty) {
    parts.push(
      `<div class="b44-review-alert-block"><div class="b44-review-alert-gold">🧼 3+ scans came back unreadable — clean the scanner glass.</div></div>`,
    );
  }
  el.innerHTML = parts.join("");
}

function syncReviewBulkBar() {
  const n = (state.intakeReviewSelected || []).length;
  const count = $("reviewBulkCount");
  if (count) {
    count.textContent = `${n} selected`;
    count.classList.toggle("hidden", n === 0);
  }
  $("reviewBulkBar")?.classList.toggle("is-active", n > 0);
  const rescanN = (state.intakeReviewRescan || []).length;
  const rescanBtn = $("btnReviewRescanList");
  if (rescanBtn) {
    rescanBtn.textContent = `Rescan list (${rescanN})`;
    rescanBtn.classList.toggle("hidden", rescanN === 0);
  }
  if ($("reviewMult") && document.activeElement !== $("reviewMult")) {
    $("reviewMult").value = String(state.intakeReviewMult ?? 1.3);
  }
  if ($("reviewFloor") && document.activeElement !== $("reviewFloor")) {
    $("reviewFloor").value = String(state.intakeReviewFloor ?? 1.77);
  }
}


/** Live Vle sticky PREVIEW beside batch review. */
function renderReviewPreview() {
  const empty = $("reviewPreviewEmpty");
  const body = $("reviewPreviewBody");
  if (!empty || !body) return;
  const row = state.intakeReviewRows.find((r) => r.id === state.intakeReviewFocusId) || null;
  if (!row) {
    empty.classList.remove("hidden");
    body.classList.add("hidden");
    return;
  }
  empty.classList.add("hidden");
  body.classList.remove("hidden");
  const floor = Number(state.intakeReviewFloor) || 0;
  const cands = row.catalog_candidates || [];
  const pick =
    cands.find((c) => c.id === (row.preview_candidate_id || state.flePickId)) || cands[0] || null;
  if ($("reviewPreviewTitle")) $("reviewPreviewTitle").textContent = row.card_name || "Unidentified";
  if ($("reviewPreviewMeta")) {
    const code = row.set_code ? ` (${row.set_code})` : "";
    $("reviewPreviewMeta").textContent = `#${row.number || "—"} · ${row.set || "—"}${code}`;
  }
  if ($("reviewPreviewConf")) {
    $("reviewPreviewConf").textContent = row.confidence || "—";
    $("reviewPreviewConf").className = `b44-conf b44-conf-${row.confidence || ""}`;
  }
  const face = state.reviewPreviewFace === "back" ? "back" : "front";
  const scanUrl =
    face === "back"
      ? row.back_url || row.photos?.[1]?.dataUrl || ""
      : row.front_url || row.photos?.[0]?.dataUrl || "";
  const scanEl = $("reviewPreviewScan");
  if (scanEl) {
    scanEl.innerHTML = scanUrl
      ? `<img src="${esc(scanUrl)}" alt="" />`
      : `<div class="b44-review-preview-ph">No scan</div>`;
  }
  const hasBack = !!(row.back_url || row.photos?.[1]?.dataUrl);
  $("reviewPreviewFaces")?.classList.toggle("hidden", !hasBack);
  $("btnReviewPreviewFront")?.classList.toggle("m-chip-on", face === "front");
  $("btnReviewPreviewBack")?.classList.toggle("m-chip-on", face === "back");
  const catEl = $("reviewPreviewCatalog");
  const catPh = pick ? null : cands.length ? "Pick below" : "No match";
  if (catEl) {
    catEl.style.borderColor = pick ? "rgba(61, 220, 140, 0.33)" : "rgba(255,255,255,0.12)";
    catEl.innerHTML = pick?.image_url
      ? `<img src="${esc(pick.image_url)}" alt="" />`
      : `<div class="b44-review-preview-ph">${esc(catPh)}</div>`;
  }
  if ($("reviewPreviewCatalogMeta")) {
    $("reviewPreviewCatalogMeta").textContent = pick ? `${pick.name || ""} #${pick.number || ""}`.trim() : "";
  }
  const candWrap = $("reviewPreviewCandidates");
  const candRow = $("reviewPreviewCandRow");
  if (candWrap && candRow) {
    const show = cands.length > 1;
    candWrap.classList.toggle("hidden", !show);
    candRow.innerHTML = show
      ? cands
          .map(
            (c) => `<button type="button" class="b44-review-preview-cand" data-preview-cand="${esc(c.id)}">
          ${c.image_url ? `<img src="${esc(c.image_url)}" alt="" />` : `<div class="b44-review-preview-cand-ph"></div>`}
          <div class="b44-review-preview-cand-num">#${esc(c.number || "—")}</div>
        </button>`,
          )
          .join("")
      : "";
    candRow.querySelectorAll("[data-preview-cand]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.previewCand;
        const cand = cands.find((c) => c.id === id);
        if (!cand || !row) return;
        row.preview_candidate_id = id;
        row.card_name = cand.name || row.card_name;
        row.number = cand.number || row.number;
        row.set = cand.set || row.set;
        row.set_code = cand.set_code || row.set_code;
        row.confidence = "High";
        row.status = "Approved";
        row.catalog_candidates = [];
        state.intakeReviewStatus = "Candidate applied → High";
        renderIntakeReview();
        showToast("Candidate applied → High", "ok");
      });
    });
  }
  const setField = (id, value, low = false) => {
    const el = $(id);
    if (!el) return;
    el.textContent = value || "—";
    el.parentElement?.classList.toggle("is-low", !!low);
  };
  setField("reviewPreviewCond", row.condition);
  setField("reviewPreviewVar", row.variation);
  setField("reviewPreviewQty", row.quantity != null ? String(row.quantity) : "—");
  setField("reviewPreviewLang", row.language);
  const mkt = row.market_price !== "" && row.market_price != null ? money(Number(row.market_price) || 0) : "—";
  const suggNum = row.suggested_price !== "" && row.suggested_price != null ? Number(row.suggested_price) : null;
  const sugg = suggNum != null && !Number.isNaN(suggNum) ? money(suggNum) : "—";
  setField("reviewPreviewMkt", mkt);
  setField("reviewPreviewSugg", sugg, suggNum != null && floor > 0 && suggNum < floor);
  if ($("reviewPreviewSku")) $("reviewPreviewSku").textContent = row.sku || "";
  if ($("reviewPreviewFiles")) {
    const files = row.source_files || [];
    $("reviewPreviewFiles").textContent = files.length ? files.join(", ") : "";
  }
}

function focusReviewPreview(id) {
  if (state.intakeReviewFocusId !== id) state.reviewPreviewFace = "front";
  state.intakeReviewFocusId = id;
  renderReviewPreview();
  document.querySelectorAll(".b44-review-row.is-preview").forEach((tr) => tr.classList.remove("is-preview"));
  document.querySelector(`.b44-review-row[data-row-id="${CSS.escape(id)}"]`)?.classList.add("is-preview");
}

function renderIntakeReview() {
  const rows = state.intakeReviewRows;
  const visible = intakeReviewVisible();
  const counts = { High: 0, Medium: 0, Low: 0, Failed: 0 };
  rows.forEach((r) => {
    counts[r.confidence] = (counts[r.confidence] || 0) + 1;
  });
  const need = counts.Medium + counts.Low + counts.Failed;
  if ($("reviewStatScans")) $("reviewStatScans").textContent = String(state.intakeScanCount || 0);
  if ($("reviewStatRows")) $("reviewStatRows").textContent = String(rows.length);
  if ($("reviewStatNeed")) $("reviewStatNeed").textContent = String(need);
  if ($("reviewStatNeed")) {
    $("reviewStatNeed").style.color = need ? "var(--b44-bad, #ff4d6d)" : "var(--b44-cyan, #2bd9c0)";
  }
  ["High", "Medium", "Low", "Failed"].forEach((c) => {
    const btn = $(`reviewFilter${c}`);
    if (!btn) return;
    btn.querySelector("[data-count]") && (btn.querySelector("[data-count]").textContent = String(counts[c] || 0));
    btn.style.opacity = state.intakeReviewFilter && state.intakeReviewFilter !== c ? "0.4" : "1";
    btn.classList.toggle("m-chip-on", state.intakeReviewFilter === c);
  });
  renderReviewAlerts(rows, state.intakeScanCount || 0);
  syncReviewBulkBar();
  if ($("reviewStatus")) $("reviewStatus").textContent = state.intakeReviewStatus || "";
  const sum = state.intakeExportSummary;
  const sumEl = $("reviewExportSummary");
  if (sumEl) {
    if (sum) {
      sumEl.classList.remove("hidden");
      const rescans = sum.rescans != null ? sum.rescans : (state.intakeReviewRescan || []).length;
      sumEl.innerHTML = `<div class="v-label" style="color:var(--b44-cyan,#2bd9c0)">EXPORT SUMMARY</div>
        <div style="margin-top:4px;font-size:12px;color:var(--b44-mid,#c9d8e2)">Exported ${sum.exported} rows · ${sum.held} held back (Not High: ${sum.reasons["Not High confidence"]}, Not approved: ${sum.reasons["Not approved"]}, Rejected: ${sum.reasons.Rejected}) · ${rescans} scans flagged for rescan.</div>`;
    } else sumEl.classList.add("hidden");
  }
  const body = $("reviewTableBody");
  if (!body) return;
  if (!visible.length) {
    body.innerHTML = `<tr><td colspan="16" class="b44-review-empty">Nothing in this category</td></tr>`;
    renderReviewPreview();
    renderReviewPreview();
    return;
  }
  const floor = Number(state.intakeReviewFloor) || 0;
  body.innerHTML = visible
    .map((r) => {
      const edge =
        r.confidence === "Low" || r.confidence === "Failed"
          ? "bad"
          : r.confidence === "Medium"
            ? "gold"
            : "";
      const checked = state.intakeReviewSelected.includes(r.id) ? "checked" : "";
      const rescanOn = (state.intakeReviewRescan || []).includes(r.id) ? "checked" : "";
      const mkt =
        r.market_price != null && r.market_price !== "" ? `$${r.market_price}` : "—";
      const suggBelow =
        r.suggested_price != null && r.suggested_price !== "" && Number(r.suggested_price) < floor;
      const sugg =
        r.suggested_price != null && r.suggested_price !== "" ? `$${r.suggested_price}` : "—";
      const varOpts = REVIEW_VARIANTS.map(
        (v) => `<option value="${esc(v)}" ${r.variation === v ? "selected" : ""}>${esc(v)}</option>`,
      ).join("");
      return `<tr class="b44-review-row ${edge}" data-row-id="${esc(r.id)}">
        <td><input type="checkbox" data-rev-sel="${esc(r.id)}" ${checked} /></td>
        <td class="b44-review-thumb"><button type="button" class="b44-review-open" data-open-fle="${esc(r.id)}" title="Open scan">${r.photos?.[0]?.dataUrl ? `<img src="${r.photos[0].dataUrl}" alt="" />` : "Open"}</button></td>
        <td><input class="b44-review-input" data-rev-field="card_name" data-id="${esc(r.id)}" value="${esc(r.card_name)}" /></td>
        <td><input class="b44-review-input" data-rev-field="number" data-id="${esc(r.id)}" value="${esc(r.number)}" style="width:56px" /></td>
        <td><input class="b44-review-input" data-rev-field="set" data-id="${esc(r.id)}" value="${esc(r.set)}" /></td>
        <td><input class="b44-review-input" data-rev-field="set_code" data-id="${esc(r.id)}" value="${esc(r.set_code || "")}" style="width:60px" /></td>
        <td>
          <select class="b44-review-input" data-rev-field="variation" data-id="${esc(r.id)}" style="width:80px">
            <option value="" ${!r.variation ? "selected" : ""}></option>
            ${varOpts}
          </select>
        </td>
        <td>
          <select class="b44-review-input" data-rev-field="condition" data-id="${esc(r.id)}">
            ${["NM", "LP", "MP", "HP", "DMG"].map((c) => `<option value="${c}" ${r.condition === c ? "selected" : ""}>${c}</option>`).join("")}
          </select>
        </td>
        <td>${esc(r.quantity)}</td>
        <td><input class="b44-review-input" data-rev-field="sku" data-id="${esc(r.id)}" value="${esc(r.sku)}" style="width:88px" /></td>
        <td><input class="b44-review-input" data-rev-field="language" data-id="${esc(r.id)}" value="${esc(r.language || "")}" style="width:60px" /></td>
        <td><span class="b44-conf b44-conf-${esc(r.confidence)}">${esc(r.confidence)}</span></td>
        <td>
          <select class="b44-review-input" data-rev-field="status" data-id="${esc(r.id)}">
            ${["Identified", "Needs Review", "Approved", "Rejected"].map((s) => `<option value="${s}" ${r.status === s ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </td>
        <td><span class="b44-review-mkt">${esc(mkt)}</span></td>
        <td><span class="b44-review-sugg${suggBelow ? " is-low" : ""}">${esc(sugg)}</span></td>
        <td><input type="checkbox" data-rev-rescan="${esc(r.id)}" title="Flag for rescan" ${rescanOn} /></td>
      </tr>`;
    })
    .join("");
  body.querySelectorAll("[data-open-fle]").forEach((btn) => {
    btn.addEventListener("click", () => openFleSheet(btn.dataset.openFle));
  });
  body.querySelectorAll("[data-rev-sel]").forEach((el) => {
    el.addEventListener("change", () => {
      const id = el.dataset.revSel;
      const set = new Set(state.intakeReviewSelected);
      if (el.checked) set.add(id);
      else set.delete(id);
      state.intakeReviewSelected = [...set];
      syncReviewBulkBar();
    });
  });
  body.querySelectorAll("[data-rev-rescan]").forEach((el) => {
    el.addEventListener("change", () => {
      const id = el.dataset.revRescan;
      const set = new Set(state.intakeReviewRescan || []);
      if (el.checked) set.add(id);
      else set.delete(id);
      state.intakeReviewRescan = [...set];
      renderReviewAlerts(state.intakeReviewRows, state.intakeScanCount || 0);
      syncReviewBulkBar();
    });
  });
  body.querySelectorAll("[data-rev-field]").forEach((el) => {
    const apply = () => {
      const row = state.intakeReviewRows.find((x) => x.id === el.dataset.id);
      if (!row) return;
      row[el.dataset.revField] = el.value;
      if (el.dataset.revField === "status" || el.dataset.revField === "confidence" || el.dataset.revField === "condition") {
        renderIntakeReview();
      } else {
        renderReviewPreview();
      }
    };
    el.addEventListener("change", apply);
    el.addEventListener("blur", apply);
  });
  body.querySelectorAll("tr.b44-review-row[data-row-id]").forEach((tr) => {
    const id = tr.dataset.rowId;
    tr.addEventListener("mouseenter", () => focusReviewPreview(id));
    tr.addEventListener("click", (e) => {
      if (e.target.closest("input, select, button, a")) return;
      focusReviewPreview(id);
    });
    if (id === state.intakeReviewFocusId) tr.classList.add("is-preview");
  });
  if (state.intakeReviewFocusId && !state.intakeReviewRows.some((r) => r.id === state.intakeReviewFocusId)) {
    state.intakeReviewFocusId = null;
  }
  renderReviewPreview();
}

function bulkReviewStatus(status, msg) {
  const ids = state.intakeReviewSelected;
  if (!ids.length) {
    state.intakeReviewStatus = "Select rows first";
    renderIntakeReview();
    return;
  }
  try {
    state.intakeReviewRows.forEach((r) => {
      if (ids.includes(r.id)) r.status = status;
    });
    state.intakeReviewSelected = [];
    state.intakeReviewStatus = msg;
    // Live Wle H(…, Ce): ht.success(Ce)
    showToast(msg, "ok");
    renderIntakeReview();
  } catch {
    // Live Wle: ht.error("Bulk failed")
    showToast("Bulk failed", "err");
  }
}

function bulkReviewCondition(condition) {
  const ids = state.intakeReviewSelected;
  if (!ids.length || !condition) return;
  try {
    state.intakeReviewRows.forEach((r) => {
      if (ids.includes(r.id)) r.condition = condition;
    });
    state.intakeReviewStatus = "Condition set";
    showToast("Condition set", "ok");
    renderIntakeReview();
  } catch {
    showToast("Bulk failed", "err");
  }
}

function bulkReviewDelete() {
  const ids = new Set(state.intakeReviewSelected);
  if (!ids.size) {
    state.intakeReviewStatus = "Select rows first";
    renderIntakeReview();
    return;
  }
  try {
    state.intakeReviewRows = state.intakeReviewRows.filter((r) => !ids.has(r.id));
    state.intakeReviewSelected = [];
    state.intakeReviewRescan = (state.intakeReviewRescan || []).filter((id) => !ids.has(id));
    state.intakeReviewStatus = "Deleted";
    // Live Wle: ht.success("Deleted")
    showToast("Deleted", "ok");
    renderIntakeReview();
  } catch {
    // Live Wle: ht.error("Delete failed")
    showToast("Delete failed", "err");
  }
}

function bulkReviewClear() {
  state.intakeReviewSelected = [];
  syncReviewBulkBar();
  renderIntakeReview();
}

async function copyReviewRescanList() {
  const ids = new Set(state.intakeReviewRescan || []);
  const names = state.intakeReviewRows
    .filter((r) => ids.has(r.id))
    .flatMap((r) => r.source_files || [r.card_name || r.title || r.id]);
  try {
    await navigator.clipboard.writeText(names.join("\n"));
    state.intakeReviewStatus = `Copied ${names.length} filenames to rescan`;
    showToast(`Copied ${names.length} filenames to rescan`, "ok");
  } catch {
    state.intakeReviewStatus = `Rescan list (${names.length}) — clipboard blocked`;
  }
  renderIntakeReview();
}

function exportIntakeDoubleHoloCsv() {
  const all = state.intakeReviewRows;
  const ready = all.filter((r) => r.confidence === "High" && r.status === "Approved");
  const held = all.length - ready.length;
  const reasons = {
    "Not High confidence": all.filter((r) => r.confidence !== "High").length,
    "Not approved": all.filter((r) => r.status !== "Approved").length,
    Rejected: all.filter((r) => r.status === "Rejected").length,
  };
  const headers = ["Card Name", "Number", "Set", "Condition", "Quantity", "SKU", "Variation", "Language"];
  const lines = [headers.join(",")].concat(
    ready.map((r) =>
      [r.card_name, r.number, r.set, r.condition, r.quantity, r.sku, r.variation, r.language]
        .map(csvEscape)
        .join(","),
    ),
  );
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const name = (state.batchName || "BATCH").replace(/[^\w.-]+/g, "_");
  a.download = `${name}-doubleholo-IMPORT-READY.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  state.intakeExportSummary = {
    exported: ready.length,
    held,
    reasons,
    rescans: (state.intakeReviewRescan || []).length,
  };
  state.intakeReviewStatus = `Exported ${ready.length}`;
  renderIntakeReview();
  showToast(`Exported ${ready.length} rows`, "ok");
}

/** Live jle — fields mappable onto an eBay CSV header row (Ule). */
const EBAY_CSV_FIELDS = [
  "Card Name",
  "Number",
  "Set",
  "Condition",
  "Quantity",
  "SKU",
  "Variation",
  "Language",
  "Graded",
  "Grade",
  "Grading Company",
  "Market Price",
  "Suggested Price",
];
const EBAY_CSV_MAP_KEY = "scan_ebay_mapping";

function loadEbayCsvMapping() {
  try {
    return JSON.parse(localStorage.getItem(EBAY_CSV_MAP_KEY) || "null");
  } catch {
    return null;
  }
}

function saveEbayCsvMapping(cfg) {
  localStorage.setItem(EBAY_CSV_MAP_KEY, JSON.stringify(cfg));
}

/** Live Dle — resolve a review row value for a mapped jle field. */
function ebayCsvFieldValue(row, field) {
  const map = {
    "Card Name": row.card_name,
    Number: row.number,
    Set: row.set,
    Condition: row.condition,
    Quantity: row.quantity,
    SKU: row.sku,
    Variation: row.variation,
    Language: row.language,
    Graded: row.graded ? "Yes" : "No",
    Grade: row.grade,
    "Grading Company": row.grading_company || row.gradingCompany,
    "Market Price": row.market_price,
    "Suggested Price": row.suggested_price,
  };
  return map[field] ?? "";
}

function intakeReviewExportReady() {
  return (state.intakeReviewRows || []).filter(
    (r) => r.confidence === "High" && r.status === "Approved",
  );
}

/** Live Ole — build CSV text from eBay headers + mapping. */
function buildEbayMappedCsv(rows, cfg) {
  const headers = cfg?.headers || [];
  const mapping = cfg?.mapping || {};
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(
      headers
        .map((h) => csvEscape(mapping[h] ? ebayCsvFieldValue(row, mapping[h]) : ""))
        .join(","),
    );
  }
  return lines.join("\r\n");
}

function downloadCsvText(filename, text) {
  const blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function parseEbayHeaderInput(raw) {
  return String(raw || "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
}

function renderEbayCsvMapRows() {
  const root = $("ebayCsvMapRows");
  const saveBtn = $("btnEbayCsvMapSave");
  if (!root) return;
  const headers = parseEbayHeaderInput($("ebayCsvHeaders")?.value);
  const mapping = state.ebayCsvDraftMapping || {};
  if (saveBtn) saveBtn.disabled = !headers.length;
  if (!headers.length) {
    root.innerHTML = "";
    return;
  }
  const opts = EBAY_CSV_FIELDS.map(
    (f) => `<option value="${esc(f)}">${esc(f)}</option>`,
  ).join("");
  root.innerHTML = headers
    .map(
      (h) => `<div style="display:flex;align-items:center;gap:8px">
        <span class="b44-copy-soft" style="flex:1;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(h)}</span>
        <select class="b44-input" data-ebay-map-header="${esc(h)}" style="width:170px;font-size:11px">
          <option value="">— none —</option>${opts}
        </select>
      </div>`,
    )
    .join("");
  root.querySelectorAll("[data-ebay-map-header]").forEach((sel) => {
    const h = sel.dataset.ebayMapHeader;
    if (mapping[h]) sel.value = mapping[h];
    sel.addEventListener("change", () => {
      if (!state.ebayCsvDraftMapping) state.ebayCsvDraftMapping = {};
      if (sel.value) state.ebayCsvDraftMapping[h] = sel.value;
      else delete state.ebayCsvDraftMapping[h];
    });
  });
}

function openEbayCsvMapSheet() {
  const saved = loadEbayCsvMapping();
  state.ebayCsvDraftMapping = { ...(saved?.mapping || {}) };
  if ($("ebayCsvHeaders")) {
    $("ebayCsvHeaders").value = (saved?.headers || []).join(", ");
  }
  renderEbayCsvMapRows();
  $("ebayCsvMapSheet")?.classList.remove("hidden");
  $("ebayCsvHeaders")?.focus();
}

function closeEbayCsvMapSheet() {
  $("ebayCsvMapSheet")?.classList.add("hidden");
}

function exportIntakeEbayCsv(cfg) {
  if (!cfg?.headers?.length) {
    openEbayCsvMapSheet();
    return;
  }
  const ready = intakeReviewExportReady();
  const held = (state.intakeReviewRows || []).length - ready.length;
  const text = buildEbayMappedCsv(ready, cfg);
  const name = (state.batchName || "BATCH").replace(/[^\w.-]+/g, "_");
  downloadCsvText(`${name}-ebay-IMPORT-READY.csv`, text);
  state.intakeExportSummary = {
    exported: ready.length,
    held,
    reasons: {
      "Not High confidence": (state.intakeReviewRows || []).filter((r) => r.confidence !== "High")
        .length,
      "Not approved": (state.intakeReviewRows || []).filter((r) => r.status !== "Approved").length,
      Rejected: (state.intakeReviewRows || []).filter((r) => r.status === "Rejected").length,
    },
    rescans: (state.intakeReviewRescan || []).length,
  };
  state.intakeReviewStatus = `Exported ${ready.length} eBay CSV`;
  renderIntakeReview();
  showToast(`Exported ${ready.length}`, "ok");
}

/** Live be — use saved mapping, or open Ule when none. */
function runIntakeEbayCsv() {
  const saved = loadEbayCsvMapping();
  if (!saved?.headers?.length) {
    openEbayCsvMapSheet();
    return;
  }
  exportIntakeEbayCsv(saved);
}

function saveEbayCsvMapAndExport() {
  const headers = parseEbayHeaderInput($("ebayCsvHeaders")?.value);
  if (!headers.length) return;
  const mapping = { ...(state.ebayCsvDraftMapping || {}) };
  // Drop mappings for headers that were removed from the paste.
  Object.keys(mapping).forEach((h) => {
    if (!headers.includes(h)) delete mapping[h];
  });
  const cfg = { headers, mapping };
  saveEbayCsvMapping(cfg);
  closeEbayCsvMapSheet();
  exportIntakeEbayCsv(cfg);
}

/** Live Fle — catalog candidate sheet from Intake review. */
function openFleSheet(rowId) {
  const row = state.intakeReviewRows.find((r) => r.id === rowId);
  if (!row) return;
  state.fleRowId = rowId;
  state.fleFace = "front";
  state.flePickId = row.catalog_candidates?.[0]?.id || null;
  renderFleSheet();
  $("fleSheet")?.classList.remove("hidden");
}

function closeFleSheet() {
  state.fleRowId = null;
  state.flePickId = null;
  $("fleSheet")?.classList.add("hidden");
}

function renderFleSheet() {
  const row = state.intakeReviewRows.find((r) => r.id === state.fleRowId);
  if (!row) return;
  const cands = row.catalog_candidates || [];
  const pick = cands.find((c) => c.id === state.flePickId) || cands[0] || null;
  const faceUrl = state.fleFace === "back" ? row.back_url || row.photos?.[1]?.dataUrl : row.front_url || row.photos?.[0]?.dataUrl;
  if ($("fleTitle")) {
    $("fleTitle").textContent = `${row.card_name || "UNIDENTIFIED"} · #${row.number || "—"} · ${row.set || "—"}${row.set_code ? ` (${row.set_code})` : ""}`;
  }
  if ($("fleScanImg")) {
    $("fleScanImg").innerHTML = faceUrl
      ? `<img src="${faceUrl}" alt="" />`
      : `<div class="b44-fle-empty">No ${state.fleFace} scan</div>`;
  }
  $("fleFaceFront")?.classList.toggle("m-chip-on", state.fleFace === "front");
  $("fleFaceBack")?.classList.toggle("m-chip-on", state.fleFace === "back");
  $("fleFaceBack")?.classList.toggle("hidden", !(row.back_url || row.photos?.[1]));
  if ($("fleCatalogImg")) {
    $("fleCatalogImg").innerHTML = pick?.image_url
      ? `<img src="${esc(pick.image_url)}" alt="" />`
      : `<div class="b44-fle-empty">${cands.length ? "Pick a candidate below" : "No match found"}</div>`;
  }
  if ($("fleCatalogMeta")) {
    $("fleCatalogMeta").textContent = pick ? `${pick.name} · #${pick.number || "—"} · ${pick.set || "—"}` : "";
  }
  const list = $("fleCandidates");
  const rowEl = $("fleCandRow");
  if (list && rowEl) {
    list.classList.toggle("hidden", cands.length <= 1);
    rowEl.innerHTML = cands
      .map(
        (c) => `<button type="button" class="b44-fle-cand${c.id === (pick && pick.id) ? " on" : ""}" data-fle-cand="${esc(c.id)}">
          ${c.image_url ? `<img src="${esc(c.image_url)}" alt="" />` : `<span class="b44-fle-cand-ph">${esc((c.name || "?").slice(0, 2))}</span>`}
          <span class="b44-fle-cand-meta">#${esc(c.number || "—")}</span>
        </button>`,
      )
      .join("");
    rowEl.querySelectorAll("[data-fle-cand]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cand = cands.find((c) => c.id === btn.dataset.fleCand);
        if (!cand) return;
        // Live Ble/Fle: click candidate applies immediately (toast Candidate applied → High)
        applyFleCandidate(cand);
      });
    });
  }
}

/** Live Wle onPick / ae — apply catalog candidate → High + Approved. */
function applyFleCandidate(pick) {
  const row = state.intakeReviewRows.find((r) => r.id === state.fleRowId);
  if (!row || !pick) return;
  state.flePickId = pick.id;
  row.card_name = pick.name || row.card_name;
  row.number = pick.number || row.number;
  row.set = pick.set || row.set;
  row.set_code = pick.set_code || row.set_code;
  row.confidence = "High";
  row.status = "Approved";
  row.catalog_candidates = [];
  state.intakeReviewStatus = "Candidate applied → High";
  renderFleSheet();
  renderIntakeReview();
  showToast("Candidate applied → High", "ok");
}

/** Live Ble verify actions from candidate sheet. */
function verifyFleRow(status) {
  const row = state.intakeReviewRows.find((r) => r.id === state.fleRowId);
  if (!row) return;
  try {
    row.status = status;
    if (status === "Approved" && row.confidence !== "High") {
      // Keep confidence; verify is status-only like live F()
    }
    state.intakeReviewStatus = status === "Approved" ? "Verified — approved" : "Sent to review";
    closeFleSheet();
    renderIntakeReview();
    // Live Ble verify: ht.success("Verified — approved" | "Sent to review")
    showToast(state.intakeReviewStatus, "ok");
  } catch {
    // Live Ble: ht.error("Save failed")
    showToast("Save failed", "err");
  }
}

/** Live UN — AI listing engine sheet (honest when engine unwired). */
function openUnSheet(itemId) {
  const it = state.items.find((x) => x.id === itemId);
  if (!it) return;
  state.unItemId = itemId;
  state.unPhase = "idle";
  state.unDraft = null;
  state.unStatus = "";
  renderUnSheet();
  $("unSheet")?.classList.remove("hidden");
}

function closeUnSheet() {
  state.unItemId = null;
  state.unDraft = null;
  state.unPhase = "idle";
  $("unSheet")?.classList.add("hidden");
}

function renderUnSheet() {
  const it = state.items.find((x) => x.id === state.unItemId);
  if (!it) return;
  if ($("unTarget")) $("unTarget").textContent = it.title || "Untitled Item";
  // Live UN meta: category · condition, × qty, N PHOTO(S) only when images exist
  if ($("unMeta")) {
    const cat = it.category || "other";
    const cond = it.condition || "nm";
    const bits = [`<span>${esc(cat)} · ${esc(cond)}</span>`];
    const qty = Number(it.quantity) || 1;
    if (qty > 1) bits.push(`<span>× ${qty}</span>`);
    const n = (it.photos || []).length;
    if (n > 0) bits.push(`<span>${n} PHOTO${n === 1 ? "" : "S"}</span>`);
    $("unMeta").innerHTML = bits.join("");
  }
  const phase = state.unPhase;
  $("unIdle")?.classList.toggle("hidden", phase !== "idle");
  $("unRunning")?.classList.toggle("hidden", phase !== "running");
  $("unError")?.classList.toggle("hidden", phase !== "error");
  $("unDone")?.classList.toggle("hidden", phase !== "done");
  if ($("unStatus")) $("unStatus").textContent = state.unStatus || "";
  const d = state.unDraft;
  if (phase === "done" && d) {
    if ($("unDraftTitle")) $("unDraftTitle").value = d.title || "";
    if ($("unDraftPrice")) $("unDraftPrice").value = d.price != null ? String(d.price) : "";
    if ($("unDraftConf")) $("unDraftConf").textContent = `${Math.round((d.ai_confidence || 0) * 100)}%`;
    if ($("unKeywords")) {
      $("unKeywords").innerHTML = (d.ai_keywords || [])
        .map((k) => `<span class="b44-un-chip">${esc(k)}</span>`)
        .join("");
    }
    if ($("unSpecifics")) {
      $("unSpecifics").innerHTML = (d.item_specifics || [])
        .map((s) => `<div class="b44-un-spec"><span>${esc(s.name || s.key || "")}</span><strong>${esc(s.value || "")}</strong></div>`)
        .join("");
    }
    if ($("unShipSku")) {
      // Live UN: separate SHIP · / SKU · chips
      const ship = d.shipping_method || "Standard";
      const sku = d.sku || "—";
      $("unShipSku").innerHTML = `<span><span class="b44-copy-soft">SHIP · </span>${esc(ship)}</span><span style="margin-left:auto"><span class="b44-copy-soft">SKU · </span>${esc(sku)}</span>`;
    }
    if ($("unPriceBasis")) {
      $("unPriceBasis").textContent = d.ai_price_basis ? `⊕ ${d.ai_price_basis}` : "";
      $("unPriceBasis").classList.toggle("hidden", !d.ai_price_basis);
    }
  }
}

async function runUnEngine() {
  const it = state.items.find((x) => x.id === state.unItemId);
  if (!it) return;
  state.unPhase = "running";
  state.unStatus = "";
  renderUnSheet();
  // Live sie() needs Base44 listing AI — not wired here. Fail honestly like live error path.
  await new Promise((r) => setTimeout(r, 400));
  state.unPhase = "error";
  state.unDraft = null;
  // Live UN: ht.error("AI engine failed — check item data")
  state.unStatus = "AI engine failed — check item data. Listing engine isn't connected on this device.";
  showToast("AI engine failed — check item data", "err");
  renderUnSheet();
}

function saveUnDraft() {
  const it = state.items.find((x) => x.id === state.unItemId);
  const d = state.unDraft;
  if (!it || !d) {
    state.unStatus = "Failed to save draft";
    // Live UN: ht.error("Failed to save draft")
    showToast("Failed to save draft", "err");
    renderUnSheet();
    return;
  }
  const btn = $("btnUnSave");
  const prev = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    // Live UN: spinning " SAVING…"
    btn.innerHTML = `<span class="b44-spin" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:8px"></span> SAVING…`;
  }
  // Pull edits from done-phase fields (live form state)
  if ($("unDraftTitle")) d.title = $("unDraftTitle").value.trim() || d.title;
  if ($("unDraftPrice")) {
    const p = Number($("unDraftPrice").value);
    if (Number.isFinite(p)) d.price = p;
  }
  window.setTimeout(() => {
    try {
      it.title = d.title || it.title;
      if (d.price != null) it.marketValue = Number(d.price) || it.marketValue;
      if (d.sku) it.sku = d.sku;
      it.listingStatus = "ready_to_list";
      it.staged = true;
      it.updatedAt = new Date().toISOString();
      saveItems();
      state.readoutStatus = "Draft saved → Ready to List";
      closeUnSheet();
      if (state.lockedItemId) openScouterReadout(state.lockedItemId);
      renderCollection();
      updateSitrep();
      showToast("Draft saved → Ready to List", "ok");
    } catch {
      // Live UN: ht.error("Failed to save draft")
      state.unStatus = "Failed to save draft";
      showToast("Failed to save draft", "err");
      renderUnSheet();
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = prev || "SAVE DRAFT → READY TO LIST";
      }
    }
  }, 280);
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
  updateBatchScanChrome();
}

function updateSave() {
  const canId = state.draftPhotos.length > 0;
  const canStage = !!(state.title.trim() && state.draftPhotos.length);
  if ($("btnStartIntake")) $("btnStartIntake").disabled = !canId;
  if ($("btnIdentify")) $("btnIdentify").disabled = !canId;
  if ($("btnSave")) $("btnSave").disabled = !canStage;
  updateBatchScanChrome();
}

function setStatus(msg) {
  if ($("identifyStatus")) $("identifyStatus").textContent = msg;
}

/** Live Kle — processing stage + bar + done/total. */
function setProcessingProgress(stage, done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  if ($("processStage")) $("processStage").textContent = `${String(stage || "UPLOADING").toUpperCase()}…`;
  if ($("processPct")) $("processPct").textContent = `${done} / ${total}`;
  if ($("processBar")) $("processBar").style.width = `${pct}%`;
}

/** Live identifying panel — fixed IDENTIFYING… + rows written count (no bar). */
function setIdentifyingRows(done) {
  if ($("identifyRows")) $("identifyRows").textContent = String(done ?? 0);
}

async function addFiles(fileList) {
  const isImage = window.ScouterImage?.isImageFile ?? ((f) => f.type?.startsWith("image/"));
  // Live Mle accepts up to 200 JPGs at a time.
  const incoming = [...(fileList || [])].filter(isImage).slice(0, 200 - state.draftPhotos.length);
  if (!incoming.length) return;
  setIntakeMode("processing");
  setProcessingProgress("Uploading", 0, incoming.length);
  setStatus("Uploading…");
  const compressed = await window.ScouterImage.compressPhotos(incoming);
  let done = 0;
  for (const file of compressed) {
    const dataUrl = await window.ScouterImage.fileToDataUrl(file);
    state.draftPhotos.push({ dataUrl, file });
    done += 1;
    setProcessingProgress("Uploading", done, incoming.length);
  }
  setProcessingProgress("Deduping", 1, 1);
  renderPhotos();
  updateSave();
  setIntakeMode("batch");
  setStatus(`${state.draftPhotos.length} scan(s) ready`);
}

async function runIdentify() {
  const photos = state.draftPhotos.map((p) => p.dataUrl).filter(Boolean);
  if (!photos.length) return false;
  setIntakeMode("identifying");
  setIdentifyingRows(0);
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
    setIdentifyingRows(photos.length || 1);
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
  // Live CR Look up: empty submit is a silent no-op.
  if (!trimmed) return;
  state.barcode = trimmed;
  setStatus(`Looking up ${trimmed}…`);
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
    skuPrefix: (state.skuPrefix || "").trim().toUpperCase() || null,
    sku: state.barcode || null,
    staged: true,
    photos: state.draftPhotos.map((p) => ({ dataUrl: p.dataUrl })),
    createdAt: new Date().toISOString(),
  };
  state.items.unshift(item);
  saveItems();
  resetDraft();
  // Live has no "Staged" status after this path.
  setStatus("");
  setIntakeMode("list");
  navigate("/inventory");
}

function resetDraft() {
  state.draftPhotos = [];
  state.title = "";
  state.barcode = "";
  state.batchName = "";
  state.skuPrefix = "ITM";
  state.intakeScans = [];
  state.intakeGroups = [];
  state.intakeThreshold = 5;
  state.groupSplitOpen = null;
  state.groupSplitPick = [];
  state.intakeReviewRows = [];
  state.intakeReviewFilter = "";
  state.intakeReviewSelected = [];
  state.intakeReviewRescan = [];
  state.intakeReviewFocusId = null;
  state.reviewPreviewFace = "front";
  state.intakeScanCount = 0;
  state.intakeReviewStatus = "";
  state.intakeExportSummary = null;
  if ($("batchName")) $("batchName").value = "";
  if ($("groupSkuPrefix")) $("groupSkuPrefix").value = "";
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
  state.backsIncluded = true;
  state.skuPrefix = "PKM";
  if ($("batchName")) $("batchName").value = state.batchName;
  if ($("backsIncluded")) $("backsIncluded").checked = true;
  setBatchGame("PKM");
  setIntakeMode("batch");
  syncBatchChromeTitles();
  updateBatchScanChrome();
  // Live Mle drop chrome lives on #dropZoneTitle / #dropZoneHint — no invent status line.
  setStatus("");
}

function setDropZoneDragging(on) {
  const zone = $("dropZone");
  const title = $("dropZoneTitle");
  if (!zone) return;
  zone.classList.toggle("drag", !!on);
  // Live Mle: idle "Drop a folder of scans" → drag "Drop scans here"
  if (title) title.textContent = on ? "Drop scans here" : "Drop a folder of scans";
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
    setDropZoneDragging(true);
  });
  zone.addEventListener("dragleave", () => setDropZoneDragging(false));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    setDropZoneDragging(false);
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

/** Live Nq — recursive item counts + market value under a location. */
function spaceSubtreeStats(spaceId) {
  const here = itemsInSpace(spaceId);
  let count = here.length;
  let value = spaceValue(here);
  for (const child of state.spaces.filter((s) => (s.parentId || "") === spaceId)) {
    const sub = spaceSubtreeStats(child.id);
    count += sub.count;
    value += sub.value;
  }
  return { count, value };
}

function showToast(msg, type = "ok") {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = `toast show ${type === "err" ? "err" : "ok"}`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("show"), 3200);
}

function spaceCoverUrl(sp) {
  return sp?.coverImage || sp?.cover_image || "";
}

/** Live Rq Set photo — local data-URL cover (live uploads via Core.UploadFile). */
function pickSpaceCover(spaceId) {
  const input = $("spaceCoverInput");
  if (!input || !spaceId) return;
  state.spaceCoverTargetId = spaceId;
  input.value = "";
  input.click();
}

function bindSpaceCoverInput() {
  const input = $("spaceCoverInput");
  if (!input || input.dataset.bound === "1") return;
  input.dataset.bound = "1";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    const id = state.spaceCoverTargetId;
    state.spaceCoverTargetId = "";
    if (!file || !id) return;
    if (!file.type?.startsWith("image/")) {
      showToast("Upload failed", "err");
      return;
    }
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("read failed"));
        reader.readAsDataURL(file);
      });
      const sp = state.spaces.find((x) => x.id === id);
      if (!sp || !dataUrl) {
        showToast("Upload failed", "err");
        return;
      }
      sp.coverImage = dataUrl;
      sp.cover_image = dataUrl;
      saveSpaces();
      // Live kq success toast after cover upload.
      showToast("Bin photo set", "ok");
    } catch {
      showToast("Upload failed", "err");
    }
  });
}

function spaceChildrenOf(parentId) {
  return state.spaces
    .filter((s) => (s.parentId || s.parent_id || "") === (parentId || ""))
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { numeric: true }));
}

function spacePathIds(id) {
  const path = [];
  let cur = spaceById(id);
  const guard = new Set();
  while (cur && !guard.has(cur.id)) {
    path.unshift(cur.id);
    guard.add(cur.id);
    cur = spaceById(cur.parentId || cur.parent_id);
  }
  return path;
}

/** Live kq → Zc → BX HUD (Warehouse crumb + Sub-locations / Items here / Unsorted / Value). */
function publishStorageHud(counts) {
  if (state.route !== "/storage" && !$("view-storage")?.classList.contains("active")) return;
  let subN;
  let itemsHereN;
  let unsortedN;
  let value;
  if (counts) {
    ({ subN, itemsHereN, unsortedN, value } = counts);
  } else {
    loadSpaces();
    const parentId = currentSpaceParentId();
    const unfiled = state.items.filter((it) => !it.spaceId);
    const filed = state.items.filter((it) => !!it.spaceId);
    const cardsHere = itemsInSpace(parentId);
    subN = spaceChildrenOf(parentId).length;
    // Live root: Items here + Value = filed items; nested = items at this location.
    itemsHereN = parentId ? cardsHere.length : filed.length;
    unsortedN = unfiled.length;
    value = spaceValue(parentId ? cardsHere : filed);
  }
  const trail = state.spaceTrail.map((id) => {
    const sp = spaceById(id);
    return { label: sp?.name || "…" };
  });
  setHud({
    breadcrumb: [{ label: "Warehouse" }, ...trail],
    stats: [
      { label: "Sub-locations", value: pad2(subN), color: "var(--b44-tan-hi, var(--b44-mid))" },
      { label: "Items here", value: pad2(itemsHereN), color: "var(--b44-olive-hi, var(--b44-gold-hi))" },
      {
        label: "Unsorted",
        value: pad2(unsortedN),
        color: unsortedN ? "var(--b44-bad-hi)" : "var(--b44-lo)",
      },
      { label: "Value", value: money(value), color: "var(--b44-gold-hi)", big: true },
    ],
  });
}

/** Live Ak row — recursive Storage Map tree. */
function spaceMapRowHtml(sp, depth, trailIds) {
  const kids = spaceChildrenOf(sp.id);
  const onTrail = trailIds.includes(sp.id);
  const open = !!(state.spaceTreeOpen[sp.id] || onTrail);
  const count = spaceSubtreeStats(sp.id).count;
  const pad = 6 + depth * 16;
  const chevron = kids.length
    ? `<button type="button" class="b44-space-map-chev" data-toggle-space="${esc(sp.id)}" aria-label="Toggle">${open ? "▾" : "▸"}</button>`
    : `<span class="b44-space-map-chev-gap"></span>`;
  const kidsHtml = open
    ? kids.map((c) => spaceMapRowHtml(c, depth + 1, trailIds)).join("")
    : "";
  return `<div class="b44-space-map-node">
    <button type="button" class="b44-space-map-row${onTrail ? " is-on" : ""}" data-nav-space="${esc(sp.id)}" style="padding-left:${pad}px">
      ${chevron}
      <span class="b44-space-map-ico" aria-hidden="true"></span>
      <span class="b44-space-map-name">${esc(sp.name || "Untitled")}</span>
      <span class="b44-space-map-count">${count > 0 ? esc(String(count)) : ""}</span>
    </button>
    ${kidsHtml}
  </div>`;
}

function renderSpaceMapTree(unsortedN) {
  const host = $("spaceMapTree");
  if (!host) return;
  const trailIds = state.spaceTrail.slice();
  const atRoot = !trailIds.length;
  const roots = spaceChildrenOf("");
  const tree = roots.map((sp) => spaceMapRowHtml(sp, 0, trailIds)).join("");
  const unsorted = `<button type="button" class="b44-space-map-row b44-space-map-unsorted${atRoot ? " is-on" : ""}" data-nav-space="">
    <span class="b44-space-map-chev-gap"></span>
    <span class="b44-space-map-ico is-bad" aria-hidden="true"></span>
    <span class="b44-space-map-name">Unsorted</span>
    <span class="b44-space-map-count is-bad">${esc(String(unsortedN))}</span>
  </button>`;
  host.innerHTML = `${tree}${unsorted}`;
  host.querySelectorAll("[data-toggle-space]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.toggleSpace;
      state.spaceTreeOpen[id] = !state.spaceTreeOpen[id];
      renderSpaceMapTree(unsortedN);
    });
  });
  host.querySelectorAll("[data-nav-space]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (e.target.closest("[data-toggle-space]")) return;
      const id = btn.dataset.navSpace || "";
      state.spaceTrail = id ? spacePathIds(id) : [];
      // Live Ak: navigating a node expands it.
      if (id) state.spaceTreeOpen[id] = true;
      renderSpaces();
    });
  });
}

function renderSpaces() {
  loadSpaces();
  const root = $("spaceList");
  const empty = $("spaceEmpty");
  if (!root) return;
  const parentId = currentSpaceParentId();
  // Live Pq: no Filter spaces toolbar — Back + Add location only (FAB on live).
  const rows = spaceChildrenOf(parentId);
  const totalHere = rows.length;
  const totalSpaces = state.spaces.length;
  if ($("spaceCount")) $("spaceCount").textContent = pad2(totalSpaces);
  if ($("spaceCountDesk")) $("spaceCountDesk").textContent = pad2(totalSpaces);
  if ($("spaceSubCount")) $("spaceSubCount").textContent = pad2(totalHere);

  const cardsHere = itemsInSpace(parentId);
  const unfiled = state.items.filter((it) => !it.spaceId);
  const filed = state.items.filter((it) => !!it.spaceId);
  // Live kq root: Items here + Value count filed items; nested = items at this location.
  const itemsHereN = parentId ? cardsHere.length : filed.length;
  const valueHere = spaceValue(parentId ? cardsHere : filed);
  if ($("spaceCardCount")) $("spaceCardCount").textContent = pad2(itemsHereN);
  if ($("spaceValue")) $("spaceValue").textContent = money(valueHere);
  if ($("spaceUnfiled")) $("spaceUnfiled").textContent = pad2(unfiled.length);

  const crumb = parentId
    ? state.spaceTrail.map((id) => {
        const sp = spaceById(id);
        return sp?.name || "…";
      }).join(" / ")
    : "ALL STORAGE";
  if ($("spaceBreadcrumb")) $("spaceBreadcrumb").textContent = crumb;
  $("btnSpaceUp")?.classList.toggle("hidden", !parentId);

  publishStorageHud({
    subN: totalHere,
    itemsHereN,
    unsortedN: unfiled.length,
    value: valueHere,
  });
  renderSpaceMapTree(unfiled.length);

  if (empty) {
    empty.classList.toggle("hidden", rows.length > 0);
    // Live Pq empty: Boxes icon + Empty location + bin/shelf/tote hint (static HTML).
  }

  // Live Rq photo tiles — 3:4 cover, kind·code badge, count/ITEMS/value, Set photo / Remove.
  root.classList.toggle("b44-space-grid", rows.length > 0);
  root.innerHTML = rows
    .map((s) => {
      const kind = kindLabel(s.kind);
      const badge = s.code ? `${kind} · ${s.code}` : kind;
      const stats = spaceSubtreeStats(s.id);
      const cover = spaceCoverUrl(s);
      const kindKey = s.kind || "bin";
      const coverHtml = cover
        ? `<img class="b44-space-tile-cover" src="${esc(cover)}" alt="" draggable="false" />`
        : `<div class="b44-space-tile-wash"><span class="b44-space-tile-kind">${esc(kind)}</span></div>`;
      // data-kind on the tile root so live qg cores (gold/slate/cyan) drive --kind/--kind-hi.
      return `<div class="b44-space-tile v-cut" data-kind="${esc(kindKey)}" data-open-space="${esc(s.id)}">
        <button type="button" class="b44-space-tile-hit" data-open-space="${esc(s.id)}" aria-label="Open ${esc(s.name)}">
          ${coverHtml}
          <span class="b44-space-tile-badge">${esc(badge)}</span>
          <span class="b44-space-tile-plate">
            <span class="b44-space-tile-name">${esc(s.name)}</span>
            <span class="b44-space-tile-stats">
              <span class="b44-space-tile-count">${esc(String(stats.count))}</span>
              <span class="b44-space-tile-items">ITEMS</span>
              <span class="b44-space-tile-value">${esc(money(stats.value))}</span>
            </span>
          </span>
        </button>
        <div class="b44-space-tile-actions">
          <button type="button" class="b44-space-tile-act" data-cover-space="${esc(s.id)}" title="Set photo" aria-label="Set photo">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h3l2-2h6l2 2h3v12H4z"/><circle cx="12" cy="13" r="3.5"/></svg>
          </button>
          <button type="button" class="b44-space-tile-act b44-space-tile-act-bad" data-del-space="${esc(s.id)}" title="Remove" aria-label="Remove">×</button>
        </div>
      </div>`;
    })
    .join("");

  root.querySelectorAll("[data-open-space]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-del-space], [data-cover-space]")) return;
      const id = el.dataset.openSpace || el.closest("[data-open-space]")?.dataset.openSpace;
      if (!id) return;
      state.spaceTrail = [...state.spaceTrail, id];
      renderSpaces();
    });
  });
  root.querySelectorAll("[data-cover-space]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      pickSpaceCover(btn.dataset.coverSpace);
    });
  });
  root.querySelectorAll("[data-del-space]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.delSpace;
      const sp = state.spaces.find((x) => x.id === id);
      const name = sp?.name || "location";
      // Live Rq remove confirm: "Remove {name}? Cards inside become unsorted."
      if (!confirm(`Remove ${name}? Cards inside become unsorted.`)) return;
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
      try {
        state.items = state.items.map((it) => (drop.has(it.spaceId || "") ? { ...it, spaceId: "" } : it));
        saveItems();
        state.spaces = state.spaces.filter((s) => !drop.has(s.id));
        state.spaceTrail = state.spaceTrail.filter((x) => !drop.has(x));
        saveSpaces();
        // Live Rq / Iq remove toast
        showToast("Location removed", "ok");
        renderSpaces();
        renderCollection();
        updateSitrep();
      } catch {
        // Live Rq: ht.error("Could not remove")
        showToast("Could not remove", "err");
      }
    });
  });

  // Live Spaces: cards at current location (or unfiled at ALL STORAGE) — strips only when nonempty.
  const itemsRoot = $("spaceItems");
  const itemsLabel = $("spaceItemsLabel");
  const list = parentId ? cardsHere : unfiled;
  if (itemsLabel) {
    // Live Pq: "Loose in {name|here} · n" nested; "Unsorted · No Location · n" at root — only if n>0.
    itemsLabel.classList.toggle("hidden", list.length === 0);
    if (list.length > 0) {
      if (parentId) {
        const hereName = spaceById(parentId)?.name || "here";
        itemsLabel.textContent = `Loose in ${hereName} · ${cardsHere.length}`;
      } else {
        itemsLabel.textContent = `Unsorted · No Location · ${unfiled.length}`;
      }
    }
  }
  if (itemsRoot) {
    itemsRoot.innerHTML = list
      .map((it) => {
        const price = Number(it.marketValue ?? it.price);
        const priceBit = Number.isFinite(price) && price > 0 ? money(price) : "—";
        const status = itemPipeLabel(it);
        return `<div class="v-panel v-cut-sm b44-item" data-open-item="${esc(it.id)}"><div class="meta"><strong>${esc(it.title || "Untitled")}</strong><span>${esc(status)} · ${esc(priceBit)}</span></div></div>`;
      })
      .join("");
    itemsRoot.querySelectorAll("[data-open-item]").forEach((el) => {
      el.addEventListener("click", () => navigate(`/item/${el.dataset.openItem}`));
    });
  }
}


/** Live ile hubs: fresh=Active on market, ended=Off market. */
function channelHubKey(it) {
  if (it.listingStatus === "ended" || it.channelStatus === "ended") return "ended";
  if (it.listingStatus === "listed" || itemPipeLabel(it) === "Listed") return "fresh";
  // Connected local port also surfaces built rows as not-yet-live actives.
  if (itemPipeLabel(it) === "Listing Built") return "fresh";
  return null;
}

/** Live o_ age: days since pushed_date / created_date. */
function channelAgeDays(it) {
  const raw =
    it.pushedAt ||
    it.pushed_date ||
    it.listedAt ||
    it.listed_at ||
    it.createdAt ||
    it.created_date ||
    "";
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

function channelEbayId(it) {
  return (
    it.ebayListingId ||
    it.ebay_listing_id ||
    it.ebayItemId ||
    it.ebay_item_id ||
    ""
  );
}

function setChannelRepriceOpen(open) {
  $("channelRepriceRow")?.classList.toggle("hidden", !open);
  $("channelSheetActions")?.classList.toggle("hidden", !!open);
  if (open) {
    const it = state.items.find((x) => x.id === state.channelSheetId);
    if ($("channelRepriceInput")) {
      $("channelRepriceInput").value = String(it?.marketValue ?? it?.price ?? "");
      $("channelRepriceInput").focus();
      $("channelRepriceInput").select();
    }
  }
}

/** Live wn primary paint from hub core/hi. */
function paintChannelWn(btn, hub, primary) {
  if (!btn) return;
  const core = hub?.core || "#FFB43D";
  const hi = hub?.hi || "#FFD98A";
  btn.style.setProperty("--wn-core", core);
  btn.style.setProperty("--wn-hi", hi);
  btn.classList.toggle("b44-wn-primary", !!primary);
}

function setChannelWnBusy(btn, busy) {
  if (!btn) return;
  btn.disabled = !!busy;
  btn.querySelector(".b44-wn-icon-idle")?.classList.toggle("hidden", !!busy);
  const spin = btn.querySelector(".b44-wn-icon-busy");
  if (spin) {
    spin.classList.toggle("hidden", !busy);
    spin.classList.toggle("b44-spin", !!busy);
  }
}

/** Live nle hub defs (a_): Active/On market · Ended/Off market. */
const CHANNEL_HUBS = [
  { key: "fresh", label: "Active", sub: "On market", core: "#2BD9C0", hi: "#8FF6E8" },
  { key: "ended", label: "Ended", sub: "Off market", core: "#8FA3AD", hi: "#FFFFFF" },
];

/** Live sle/fle → Zc → BX HUD (Live listings / Fulfilment). */
function publishChannelHud() {
  if (state.route !== "/channel" && !$("view-channel")?.classList.contains("active")) return;
  if (state.channelTab === "ship") {
    loadShipments();
    const ships = activeShipments();
    const awaiting = ships.filter((sh) => sh.status !== "delivered").length;
    setHud({
      breadcrumb: [{ label: "Fulfilment" }],
      stats: [
        ...SHIP_STAGES.map((stage) => {
          const n = ships.filter((sh) => sh.status === stage.key).length;
          return { label: stage.label, value: pad2(n), color: stage.hi };
        }),
        {
          label: "Awaiting payout",
          value: pad2(awaiting),
          color: "var(--b44-gold-hi)",
          big: true,
        },
      ],
    });
    return;
  }
  const fresh = state.items.filter((it) => channelHubKey(it) === "fresh");
  const ended = state.items.filter((it) => channelHubKey(it) === "ended");
  // Live Fe: sum price of active listings (no qty multiply).
  const liveVal = fresh.reduce(
    (sum, it) => sum + (Number(it.marketValue ?? it.price) || 0),
    0,
  );
  setHud({
    breadcrumb: [{ label: "Live listings" }],
    stats: [
      { label: "Active", value: pad3(fresh.length), color: CHANNEL_HUBS[0].hi },
      { label: "Ended", value: pad3(ended.length), color: CHANNEL_HUBS[1].hi },
      {
        label: "Live value",
        value: money(liveVal),
        color: "var(--b44-gold-hi)",
        big: true,
      },
    ],
  });
}

/** Live Ma tile for Channel hub rails — age badge + price sub. */
function channelListingTileHtml(it, hub) {
  const core = hub.core;
  const hi = hub.hi;
  const age = channelAgeDays(it);
  const price = money(Number(it.marketValue ?? it.price) || 0);
  const thumb = it.photos?.[0]?.dataUrl || "";
  const img = thumb
    ? `<img src="${esc(thumb)}" alt="" draggable="false" />`
    : `<span class="b44-copy-soft" style="font-size:10px">no img</span>`;
  const selected =
    state.channelVariationMode && state.channelVariationSelected.includes(it.id);
  const selClass = selected ? " is-selected" : "";
  const mark = state.channelVariationMode
    ? `<span class="b44-channel-tile-check" aria-hidden="true"></span>`
    : "";
  return `<button type="button" class="b44-scout-tile-card b44-channel-tile${selClass}" data-open-listing="${esc(it.id)}" style="--phase:${esc(core)};--phase-hi:${esc(hi)}" aria-pressed="${selected ? "true" : "false"}">
    <div class="b44-scout-tile-img" style="box-shadow:inset 0 0 0 1px color-mix(in srgb, ${esc(core)} 40%, transparent)">${img}<span class="b44-scout-tile-badge" style="color:${esc(hi)}">${age}D</span>${mark}</div>
    <div class="b44-scout-tile-title">${esc(it.title || "Untitled")}</div>
    <div class="b44-scout-tile-sub" style="color:${esc(hi)}">${esc(price)}</div>
  </button>`;
}

/** Live nle Variation mode — exit clears selection (Ce). */
function exitChannelVariationMode() {
  state.channelVariationMode = false;
  state.channelVariationSelected = [];
}

function toggleChannelVariationSelect(id) {
  const set = new Set(state.channelVariationSelected);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  state.channelVariationSelected = [...set];
}

function syncChannelVariationChrome() {
  const on = !!state.channelVariationMode && state.channelTab === "live" && !!state.ebayConnected;
  const btn = $("btnChannelVariation");
  if (btn) {
    btn.classList.toggle("m-btn-primary", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
  const n = state.channelVariationSelected.length;
  const bar = $("channelVariationBar");
  if (bar) bar.classList.toggle("hidden", !(on && n > 0));
  if ($("channelVariationCount")) $("channelVariationCount").textContent = String(n);
  const create = $("btnChannelCreateVariation");
  if (create) {
    create.disabled = n < 2;
    create.textContent = n < 2 ? "Select 2+" : "Create variation";
    create.style.opacity = n < 2 ? "0.4" : "1";
  }
}

function channelHubSectionHtml(hub, rows) {
  const count = rows.length;
  const countColor = count ? hub.hi : "#6F8697";
  const shown = rows.slice(0, 20);
  const more =
    rows.length > shown.length
      ? `<div class="b44-scout-tile-card" style="width:60px;justify-content:center;display:flex;align-items:center"><div class="b44-scout-tile-img" style="width:60px;height:196px;color:${esc(hub.hi)}">+${rows.length - shown.length}</div></div>`
      : "";
  const body = count
    ? `<div class="b44-scout-group-rail">${shown.map((it) => channelListingTileHtml(it, hub)).join("")}${more}</div>`
    : `<div class="b44-channel-hub-empty v-label">Nothing here</div>`;
  return `<section class="b44-channel-hub" data-hub="${esc(hub.key)}">
    <div class="b44-channel-hub-head">
      <span class="b44-channel-hub-dot" style="background:${esc(hub.core)};box-shadow:0 0 10px 1px ${esc(hub.core)}"></span>
      <span class="b44-channel-hub-label">${esc(hub.label)}</span>
      <span class="v-label" style="font-size:9px">${esc(hub.sub.toUpperCase())}</span>
      <span class="v-readout b44-channel-hub-count" style="color:${esc(countColor)}">${pad2(count)}</span>
    </div>
    ${body}
  </section>`;
}

/** Live sle pager pool: filtered listings sorted by pushed/created date. */
function channelSheetPool() {
  const q = (state.channelFilter || "").trim().toLowerCase();
  const pool = state.items.filter((it) => {
    if (!channelHubKey(it)) return false;
    if (!q) return true;
    const hay = `${it.title || ""} ${it.barcode || ""} ${it.sku || ""}`.toLowerCase();
    return hay.includes(q);
  });
  return pool.slice().sort((a, b) => {
    const ta = new Date(a.pushedAt || a.pushed_date || a.createdAt || a.created_date || 0).getTime();
    const tb = new Date(b.pushedAt || b.pushed_date || b.createdAt || b.created_date || 0).getTime();
    return ta - tb;
  });
}

/** Live sle Ne(±1): wrap through the locked Channel readout list. */
function channelSheetStep(delta) {
  const le = channelSheetPool();
  const be = state.channelSheetId ? le.findIndex((x) => x.id === state.channelSheetId) : -1;
  if (be === -1 || !le.length) return;
  const next = (be + delta + le.length) % le.length;
  openChannelSheet(le[next].id);
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
  const hubKey = channelHubKey(it);
  const hub = CHANNEL_HUBS.find((h) => h.key === hubKey) || CHANNEL_HUBS[0];
  const age = channelAgeDays(it);
  // Live sle/nle eyebrow: "{ACTIVE|ENDED} · {n}D ON MARKET" only (never invent off-market / BUILT).
  if ($("channelSheetEyebrow")) {
    $("channelSheetEyebrow").textContent = `${hub.label.toUpperCase()} · ${age}D ON MARKET`;
    $("channelSheetEyebrow").style.color = hub.hi;
  }
  const pool = channelSheetPool();
  const idx = pool.findIndex((x) => x.id === id);
  if ($("channelSheetPagerLabel")) {
    $("channelSheetPagerLabel").textContent =
      idx >= 0 && pool.length ? `${idx + 1} / ${pool.length}` : "—";
  }
  if ($("channelSheetTitle")) $("channelSheetTitle").textContent = it.title || "Untitled";
  const price = Number(it.marketValue ?? it.price) || 0;
  if ($("channelSheetPrice")) $("channelSheetPrice").textContent = money(price);
  // Live identity: ebay_listing_id || sku || "NO ID"
  const ebayId = channelEbayId(it);
  const ident = ebayId || it.sku || "NO ID";
  if ($("channelSheetIdent")) $("channelSheetIdent").textContent = ident;
  if ($("channelSheetStatus")) $("channelSheetStatus").textContent = state.channelSheetStatus || "";
  const ebay = $("channelSheetEbay");
  if (ebay) {
    if (ebayId) {
      ebay.href = `https://www.ebay.com/itm/${encodeURIComponent(ebayId)}`;
      ebay.classList.remove("hidden");
    } else {
      ebay.href = "#";
      ebay.classList.add("hidden");
    }
  }
  // Live wn: Reprice primary always; Relist only when hub !== fresh; End always.
  paintChannelWn($("btnChannelReprice"), hub, true);
  paintChannelWn($("btnChannelRelist"), hub, false);
  paintChannelWn($("btnChannelEnd"), hub, false);
  $("btnChannelRelist")?.classList.toggle("hidden", hubKey === "fresh");
  $("btnChannelReprice")?.classList.remove("hidden");
  $("btnChannelEnd")?.classList.remove("hidden");
  setChannelWnBusy($("btnChannelRelist"), false);
  setChannelWnBusy($("btnChannelEnd"), false);
  setChannelRepriceOpen(false);
}

function closeChannelSheet() {
  state.channelSheetId = null;
  state.channelSheetStatus = "";
  setChannelRepriceOpen(false);
  $("channelSheet")?.classList.add("hidden");
}

function applyChannelReprice() {
  const it = state.items.find((x) => x.id === state.channelSheetId);
  if (!it) return;
  if (!state.ebayConnected) {
    state.channelSheetStatus = "Connect eBay before listing actions.";
    openChannelSheet(it.id);
    return;
  }
  const next = Number($("channelRepriceInput")?.value || 0);
  if (!next || next <= 0) {
    state.channelSheetStatus = "Enter a valid price.";
    // Live nle: ht.error("Enter a valid price")
    showToast("Enter a valid price", "err");
    openChannelSheet(it.id);
    setChannelRepriceOpen(true);
    return;
  }
  // Honest local port: update local value; live eBay reprice needs server creds.
  try {
    it.marketValue = next;
    it.price = next;
    it.updatedAt = new Date().toISOString();
    saveItems();
    state.channelSheetStatus =
      `Local price set to ${money(next)}. Live eBay reprice needs server credentials.`;
    // Live nle success toast copy
    showToast(`Repriced → $${next.toFixed(2)}`, "ok");
    setChannelRepriceOpen(false);
    openChannelSheet(it.id);
    renderChannel();
  } catch {
    // Live nle: ht.error("Reprice failed")
    showToast("Reprice failed", "err");
  }
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
    // Live nle: expand inline price field (no window.prompt).
    setChannelRepriceOpen(true);
    return;
  }
  if (kind === "relist") {
    try {
      it.listingStatus = "listed";
      it.channelStatus = "active";
      it.pushedAt = new Date().toISOString();
      it.updatedAt = new Date().toISOString();
      saveItems();
      state.channelSheetStatus =
        "Marked Active locally. Live Relist needs server eBay credentials.";
      showToast("Relisted on eBay", "ok");
      openChannelSheet(it.id);
      renderChannel();
    } catch {
      // Live nle: ht.error("Relist failed")
      showToast("Relist failed", "err");
    }
    return;
  }
  if (kind === "end") {
    try {
      it.listingStatus = "ended";
      it.channelStatus = "ended";
      it.updatedAt = new Date().toISOString();
      saveItems();
      state.channelSheetStatus =
        "Marked Ended locally. Live End listing needs server eBay credentials.";
      showToast("Listing ended", "ok");
      openChannelSheet(it.id);
      renderChannel();
    } catch {
      // Live nle: ht.error("End failed")
      showToast("End failed", "err");
    }
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

  // Live nle: Connect alone when offline; Filter+Sync when connected; Photos/Policies/Token footer.
  const connected = !!state.ebayConnected;
  $("btnEbayConnect")?.classList.toggle("hidden", connected);
  $("ebayConnectPanel")?.classList.toggle("hidden", connected && state.channelTab === "live");
  $("channelFooterActions")?.classList.toggle(
    "hidden",
    !(connected && state.channelTab === "live"),
  );
  if ($("ebayConnectHint")) {
    $("ebayConnectHint").textContent = connected
      ? "eBay marked connected on this device. Sync/Photos/Token/Policies still need live credentials on the server."
      : "eBay isn't connected — publishing and sync are offline. Connect it below.";
  }
  // Live nle: status mark next to LIVE VALUE (green when connected).
  $("liveValueStatus")?.classList.toggle("is-live", connected);
  if ($("liveValue")) {
    // Live sums active listing price (no qty multiply).
    const liveVal = state.items
      .filter((it) => channelHubKey(it) === "fresh" && itemPipeLabel(it) === "Listed")
      .reduce((sum, it) => sum + (Number(it.marketValue ?? it.price) || 0), 0);
    $("liveValue").textContent = money(liveVal);
  }

  const filterBar = $("channelFilterBar");
  if (filterBar) filterBar.classList.toggle("hidden", !(connected && state.channelTab === "live"));
  // Live sle (desk): placeholder "Filter"; live nle (phone): "Filter listings"
  const channelFilter = $("channelFilter");
  if (channelFilter) {
    channelFilter.placeholder = intakeDeskOrbit() ? "Filter" : "Filter listings";
  }

  const list = $("channelList");
  const empty = $("channelEmpty");
  if (list) {
    // Live nle hubs: Active (on market) / Ended (off market) with Ma tile rails.
    const q = (state.channelFilter || "").trim().toLowerCase();
    const allHubItems = state.items.filter((it) => channelHubKey(it));
    const pool = allHubItems.filter((it) => {
      if (!q) return true;
      const hay = `${it.title || ""} ${it.barcode || ""} ${it.sku || ""}`.toLowerCase();
      return hay.includes(q);
    });
    const byKey = {
      fresh: pool.filter((it) => channelHubKey(it) === "fresh"),
      ended: pool.filter((it) => channelHubKey(it) === "ended"),
    };

    // Live nle empty: Wifi icon + Channel empty; connected → Run a sync…; offline → Connect eBay…
    const showEmpty = state.channelTab === "live" && pool.length === 0;
    if (empty) {
      empty.classList.toggle("hidden", !showEmpty);
      const sub = $("channelEmptySub") || empty.querySelector(".b44-channel-empty-sub") || empty.querySelector("p");
      if (sub) {
        sub.textContent = connected
          ? "Run a sync to pull your live listings."
          : "Connect eBay to see what's on the channel.";
      }
    }
    if (state.channelTab === "live") {
      const chunks = [];
      for (const hub of CHANNEL_HUBS) {
        const rows = byKey[hub.key] || [];
        // Live: always show hubs when connected; when offline skip empty hubs.
        if (!connected && !rows.length) continue;
        chunks.push(channelHubSectionHtml(hub, rows));
      }
      list.innerHTML = chunks.join("");
      list.querySelectorAll("[data-open-listing]").forEach((row) => {
        row.addEventListener("click", () => {
          const id = row.dataset.openListing;
          if (state.channelVariationMode && connected) {
            toggleChannelVariationSelect(id);
            syncChannelVariationChrome();
            row.classList.toggle("is-selected", state.channelVariationSelected.includes(id));
            row.setAttribute(
              "aria-pressed",
              state.channelVariationSelected.includes(id) ? "true" : "false",
            );
            return;
          }
          openChannelSheet(id);
        });
      });
    } else {
      list.innerHTML = "";
    }
  }
  if (!connected || state.channelTab !== "live") exitChannelVariationMode();
  syncChannelVariationChrome();
  if (state.channelSheetId) openChannelSheet(state.channelSheetId);
  else closeChannelSheet();

  // Live fle desktop fulfilment chrome + ale/l_ hubs (hubs unchanged)
  const ships = activeShipments();
  const fulStats = $("fulStats");
  if (fulStats) {
    const awaiting = ships.filter((sh) => sh.status !== "delivered").length;
    const bits = SHIP_STAGES.map((stage) => {
      const n = ships.filter((sh) => sh.status === stage.key).length;
      return `<div class="b44-ful-stat">
        <div class="v-label" style="font-size:8px;color:${esc(stage.hi)}">${esc(stage.label)}</div>
        <div class="v-readout" style="font-size:16px;color:${esc(stage.hi)}">${pad2(n)}</div>
      </div>`;
    });
    bits.push(`<div class="b44-ful-stat b44-ful-stat-big">
      <div class="v-label" style="font-size:8px;color:var(--b44-gold-hi,#ffd98a)">Awaiting payout</div>
      <div class="v-readout v-emit-gold" style="font-size:20px">${pad2(awaiting)}</div>
    </div>`);
    fulStats.innerHTML = bits.join("");
  }
  const fulHubs = $("fulHubs");
  const fulEmpty = $("fulEmpty");
  if (fulEmpty) {
    // Live fle empty: Truck icon + No shipments yet + Packages appear… from Listings or eBay Sync.
    fulEmpty.classList.toggle("hidden", ships.length > 0);
  }
  if (fulHubs) {
    const chunks = [];
    for (const stage of SHIP_STAGES) {
      const rows = ships.filter((sh) => sh.status === stage.key);
      if (!rows.length) continue;
      chunks.push(fulHubSectionHtml(stage, rows));
    }
    fulHubs.innerHTML = chunks.join("");
    fulHubs.querySelectorAll("[data-open-shipment]").forEach((btn) => {
      btn.addEventListener("click", () => openFulSheet(btn.dataset.openShipment));
    });
  }
  if (state.fulSheetId) openFulSheet(state.fulSheetId);
  else closeFulSheet();

  // Live sle/fle: Zc→BX owns desk stats; keep body #fulStats / LIVE VALUE for phone.
  publishChannelHud();
}

function fulTileHtml(sh, stage) {
  const price = Number(sh.salePrice ?? sh.sale_price);
  const priceBit = Number.isFinite(price) && price > 0 ? money(price) : money(0);
  const thumb = sh.labelUrl || sh.label_url || sh.photo || "";
  const img = thumb
    ? `<img src="${esc(thumb)}" alt="" draggable="false" />`
    : `<span class="b44-copy-soft" style="font-size:10px">no img</span>`;
  return `<button type="button" class="b44-scout-tile-card b44-channel-tile" data-open-shipment="${esc(sh.id)}" style="--phase:${esc(stage.core)};--phase-hi:${esc(stage.hi)}">
    <div class="b44-scout-tile-img" style="box-shadow:inset 0 0 0 1px color-mix(in srgb, ${esc(stage.core)} 40%, transparent)">${img}</div>
    <div class="b44-scout-tile-title">${esc(sh.title || "Untitled")}</div>
    <div class="b44-scout-tile-sub" style="color:${esc(stage.hi)}">${esc(priceBit)}</div>
  </button>`;
}

function fulHubSectionHtml(stage, rows) {
  const count = rows.length;
  const shown = rows.slice(0, 20);
  const more =
    rows.length > shown.length
      ? `<div class="b44-scout-tile-card" style="width:60px;justify-content:center;display:flex;align-items:center"><div class="b44-scout-tile-img" style="width:60px;height:196px;color:${esc(stage.hi)}">+${rows.length - shown.length}</div></div>`
      : "";
  const body = `<div class="b44-scout-group-rail">${shown.map((sh) => fulTileHtml(sh, stage)).join("")}${more}</div>`;
  // Live fle → Wre: sub `STEP ${n}` above stage label
  const sub = `STEP ${stage.n}`;
  return `<section class="b44-channel-hub" data-ful-hub="${esc(stage.key)}">
    <div class="b44-channel-hub-head">
      <span class="b44-channel-hub-dot" style="background:${esc(stage.core)};box-shadow:0 0 10px 1px ${esc(stage.core)}"></span>
      <span class="v-label" style="font-size:9px">${esc(sub)}</span>
      <span class="b44-channel-hub-label">${esc(stage.label)}</span>
      <span class="v-readout b44-channel-hub-count" style="color:${esc(stage.hi)}">${pad2(count)}</span>
    </div>
    ${body}
  </section>`;
}

function closeFulSheet() {
  state.fulSheetId = null;
  $("fulSheet")?.classList.add("hidden");
}

function openFulSheet(id) {
  loadShipments();
  const sh = state.shipments.find((s) => s.id === id && !s.archived);
  const sheet = $("fulSheet");
  if (!sh || !sheet) {
    closeFulSheet();
    return;
  }
  const stage = SHIP_STAGES.find((s) => s.key === sh.status) || SHIP_STAGES[0];
  state.fulSheetId = sh.id;
  sheet.classList.remove("hidden");
  const eye = $("fulSheetEyebrow");
  if (eye) {
    // Live fle readout: PACKAGE · {STAGE}
    eye.textContent = `PACKAGE · ${stage.label.toUpperCase()}`;
    eye.style.color = stage.hi;
  }
  if ($("fulSheetTitle")) $("fulSheetTitle").textContent = sh.title || "Untitled";
  const price = Number(sh.salePrice ?? sh.sale_price) || 0;
  if ($("fulSheetPrice")) $("fulSheetPrice").textContent = money(price);
  if ($("fulSheetCarrier")) $("fulSheetCarrier").textContent = carrierLabel(sh.carrier);
  const next = nextShipStage(sh.status);
  const adv = $("btnFulAdvance");
  const done = $("fulSheetDelivered");
  if (sh.status === "delivered") {
    adv?.classList.add("hidden");
    if (done) {
      done.classList.remove("hidden");
      const raw = sh.payoutReleaseAt || sh.payout_release_date || "";
      done.textContent = `PAYOUT EST. ${formatPayoutEst(raw)}`;
    }
  } else {
    done?.classList.add("hidden");
    if (adv) {
      adv.classList.remove("hidden");
      // Live fle CTA = next stage label only (no "Advance to …")
      adv.textContent = next ? shipStageLabel(next) : "Advance";
      adv.disabled = !next;
    }
  }
}

/** Live dle — payout est date (en-US short month + 2-digit day). */
function formatPayoutEst(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

function advanceShipment(id) {
  loadShipments();
  const sh = state.shipments.find((s) => s.id === id);
  if (!sh) return;
  const next = nextShipStage(sh.status);
  if (!next) return;
  try {
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
    // Live ale closes the package sheet after a successful advance.
    closeFulSheet();
    const label = shipStageLabel(next);
    if ($("channelActionStatus")) {
      $("channelActionStatus").textContent = `Advanced to ${label}.`;
    }
    // Live fle: ht.success(stage.label || "Updated")
    showToast(label || "Updated", "ok");
    renderChannel();
  } catch {
    // Live fle: ht.error("Update failed")
    showToast("Update failed", "err");
  }
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
  // Live ble: agent tab drops System Settings chrome and uses Agent Connect page head.
  const agent = tab === "agent";
  $("settingsSystemHead")?.classList.toggle("hidden", agent);
  $("settingsAgentHead")?.classList.toggle("hidden", !agent);
  if (agent) refreshAiConnect();
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
  // Live Settings shipping form: Name / Carrier / Service / Cost / Handling days / Default only.
  if ($("shipName")) $("shipName").value = "";
  if ($("shipCarrier")) $("shipCarrier").value = "";
  if ($("shipService")) $("shipService").value = "";
  if ($("shipCost")) $("shipCost").value = "0";
  if ($("shipHandle")) $("shipHandle").value = "1";
  if ($("shipDefault")) $("shipDefault").checked = false;
  state.showShipForm = false;
  $("shipForm")?.classList.add("hidden");
}

function resetStorageDefForm() {
  if ($("storageDefName")) $("storageDefName").value = "";
  if ($("storageDefCode")) $("storageDefCode").value = "";
  if ($("storageDefDesc")) $("storageDefDesc").value = "";
  state.showStorageForm = false;
  $("storageDefForm")?.classList.add("hidden");
}

function storageDefItemCount(def) {
  const code = (def.code || def.location_code || "").trim();
  const name = (def.name || "").trim();
  const spaceIds = new Set(
    state.spaces
      .filter(
        (s) =>
          (code && (s.code || "") === code) ||
          (name && (s.name || "") === name) ||
          s.storageDefId === def.id,
      )
      .map((s) => s.id),
  );
  return state.items.filter(
    (it) =>
      it.storageDefId === def.id ||
      it.storageLocationId === def.id ||
      (it.spaceId && spaceIds.has(it.spaceId)),
  ).length;
}


/** Live Listing templates card — icon tile, Default chip, big markup, Edit + Delete. */
function templateCardHtml(t) {
  const markup = t.markup_percent ?? t.markup ?? 0;
  const chip = t.is_default ? `<span class="m-chip m-chip-on">Default</span>` : "";
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
  return `<div class="v-panel v-cut-sm p-4 b44-settings-card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div class="b44-settings-card-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>
      </div>
      ${chip}
    </div>
    <div class="v-readout v-emit-white" style="font-size:15px;font-weight:600;margin-top:12px">${esc(t.name)}</div>
    <div class="v-readout" style="font-size:22px;font-weight:700;margin-top:4px">${esc(String(markup))}<span class="b44-copy-soft" style="font-size:14px;font-weight:600">%</span> <span class="b44-copy-soft" style="font-size:12px;font-weight:500">markup</span></div>
    <div class="b44-actions" style="margin-top:16px;align-items:center">
      <button type="button" class="m-btn" style="flex:1" data-edit-template="${esc(t.id)}">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        Edit
      </button>
      <button type="button" class="m-btn m-btn-danger" data-del-template="${esc(t.id)}" title="Delete" aria-label="Delete template">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
      </button>
    </div>
  </div>`;
}

/** Live Settings shipping card — Truck tile, Default chip, carrier·service, $cost · Nd, icon Edit+Delete. */
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
        <div><label class="v-label" style="display:block;margin-bottom:6px;font-size:9px">Cost ($)</label>
        <input class="b44-input" type="number" data-edit-ship-cost value="${esc(String(s.cost ?? 0))}" /></div>
        <div><label class="v-label" style="display:block;margin-bottom:6px;font-size:9px">Handling days</label>
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
  const chip = s.is_default ? `<span class="m-chip m-chip-on">Default</span>` : "";
  const cost = Number(s.cost || 0).toFixed(2);
  const days = s.handling_days ?? 1;
  return `<div class="v-panel v-cut-sm p-4 b44-settings-card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div class="b44-settings-card-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>
      </div>
      ${chip}
    </div>
    <div class="v-readout v-emit-white" style="font-size:15px;font-weight:600;margin-top:12px">${esc(s.name)}</div>
    <div class="b44-copy-soft" style="margin-top:4px;font-size:13px;font-weight:500;display:flex;align-items:center;gap:8px">
      <span>${esc(s.carrier || "—")}</span>
      <span style="color:#232A2E">·</span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.service || "—")}</span>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;gap:8px">
      <div class="v-readout" style="font-size:18px;font-weight:700">$${esc(cost)}<span class="b44-copy-soft" style="font-size:12px;font-weight:500"> · ${esc(String(days))}d</span></div>
      <div class="b44-actions" style="margin:0;flex-wrap:nowrap">
        <button type="button" class="m-btn" data-edit-ship-btn="${esc(s.id)}" title="Edit" aria-label="Edit shipping preset" style="flex:0;min-width:0;padding-left:12px;padding-right:12px">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
        <button type="button" class="m-btn m-btn-danger" data-del-ship="${esc(s.id)}" title="Delete" aria-label="Delete shipping preset">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
        </button>
      </div>
    </div>
  </div>`;
}


/** Live Settings empty panel — centered icon tile + two-line copy. */
function settingsEmptyHtml(kind, title, subtitle) {
  const icons = {
    template: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>`,
    shipping: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>`,
    storage: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>`,
  };
  const icon = icons[kind] || icons.template;
  return `<div class="b44-settings-empty">
    <div class="b44-settings-empty-icon">${icon}</div>
    <div class="b44-settings-empty-title">${esc(title)}</div>
    <p class="b44-settings-empty-sub">${esc(subtitle)}</p>
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
      tEmpty.innerHTML = settingsEmptyHtml(
        "template",
        "No templates yet",
        "Create one to apply default markup and policies.",
      );
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
      sEmpty.innerHTML = settingsEmptyHtml(
        "shipping",
        "No shipping presets yet",
        "Add carriers and services to reuse on listings.",
      );
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
          s.id === id
            ? {
                ...s,
                name,
                carrier,
                service,
                cost,
                handling_days,
                is_default,
              }
            : s,
        );
        state.editingShipId = null;
        saveSettingsLocal();
        renderSettings();
      });
    });
  }
  $("storageDefForm")?.classList.toggle("hidden", !state.showStorageForm);
  const dRoot = $("storageDefList");
  const dEmpty = $("storageDefEmpty");
  if (dRoot) {
    if (!state.storageDefs.length) {
      dRoot.innerHTML = "";
    } else {
      dRoot.innerHTML = state.storageDefs
        .map((d) => {
          const code = d.code || d.location_code || "";
          const desc = d.description || "";
          const count = storageDefItemCount(d);
          // Live vle storage card: MapPin tile, hover trash, code chip, Package + N items.
          const codeChip = code
            ? `<div class="b44-storage-code m-mono">${esc(code)}</div>`
            : "";
          const descBit = desc
            ? `<p class="b44-copy-soft" style="margin-top:8px;font-size:13px;font-weight:500;line-height:1.4">${esc(desc)}</p>`
            : "";
          return `<div class="v-panel v-cut-sm p-4 b44-settings-card b44-storage-card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div class="b44-settings-card-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>
              </div>
              <button type="button" class="m-btn m-btn-danger b44-storage-card-del" data-del-storage-def="${esc(d.id)}" title="Delete" aria-label="Delete storage location" style="padding:8px 10px">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
              </button>
            </div>
            <div class="v-readout v-emit-white" style="font-size:15px;font-weight:600;margin-top:12px">${esc(d.name)}</div>
            ${codeChip}
            ${descBit}
            <div class="b44-copy-soft" style="margin-top:16px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="m7.5 4.2 9 5.2"/></svg>
              ${esc(String(count || 0))} items
            </div>
          </div>`;
        })
        .join("");
      dRoot.style.display = "grid";
      dRoot.style.gridTemplateColumns = "repeat(auto-fill,minmax(220px,1fr))";
      dRoot.style.gap = "12px";
    }
    if (dEmpty) {
      dEmpty.classList.toggle("hidden", state.storageDefs.length > 0);
      // Live vle Settings → Storage empty (two-line).
      dEmpty.innerHTML = settingsEmptyHtml(
        "storage",
        "No storage locations yet",
        "Add warehouses, shelves, or totes to organize inventory.",
      );
    }
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
    const on = btn.dataset.mcpClient === state.mcpClient;
    btn.classList.toggle("m-chip-on", on);
    btn.classList.toggle("m-btn-primary", false);
  });
  const client = MCP_CLIENTS[state.mcpClient];
  const root = $("mcpClientSteps");
  if (!root || !client) return;
  // Live wle: client label + numbered 01… steps in gold mono.
  root.innerHTML =
    `<div style="font-family:Inter,system-ui,sans-serif;font-size:16px;font-weight:700;color:#E8EDEA;margin-bottom:16px">${esc(client.label)}</div>` +
    `<ol style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:12px">` +
    client.steps
      .map(
        (step, i) =>
          `<li style="display:flex;align-items:flex-start;gap:12px"><span class="m-mono" style="flex-shrink:0;width:22px;text-align:right;font-size:13px;font-weight:700;color:var(--b44-gold,#ffb43d)">${String(i + 1).padStart(2, "0")}</span><span style="font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.55;color:var(--b44-mid,#c9d8e2)">${esc(step)}</span></li>`,
      )
      .join("") +
    `</ol>`;
}

function refreshAiConnect() {
  // Live wle: URL + client steps only (no Identify status line).
  if ($("mcpServerUrl")) $("mcpServerUrl").textContent = mcpServerUrl();
  if (!state.mcpClient) state.mcpClient = "claude";
  renderMcpClient(state.mcpClient);
}

function setEbayDiagBusy(busy) {
  const btn = $("btnEbayDiag");
  const label = $("ebayDiagBtnLabel");
  if (btn) {
    btn.disabled = !!busy;
    btn.classList.toggle("is-busy", !!busy);
  }
  if (label) label.textContent = busy ? "Checking eBay..." : "Run Diagnostic";
}

function showEbayDiagError(msg) {
  const err = $("ebayDiagError");
  const result = $("ebayDiagResult");
  if (result) {
    result.classList.add("hidden");
    result.innerHTML = "";
  }
  if (!err) return;
  if (!msg) {
    err.classList.add("hidden");
    err.innerHTML = "";
    return;
  }
  err.classList.remove("hidden");
  err.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#d97757" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;margin-top:2px"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg><span>${esc(msg)}</span>`;
}

/** Live yle eBay Diagnostic — Run/Checking chrome, error banner, sync + bucket cards. */
function runEbayDiagnostic() {
  const result = $("ebayDiagResult");
  showEbayDiagError("");
  if (result) {
    result.classList.add("hidden");
    result.innerHTML = "";
  }
  setEbayDiagBusy(true);
  // Local port: no server ebayDiagnostic function — honest chrome shaped like live yle.
  window.setTimeout(() => {
    setEbayDiagBusy(false);
    if (!state.ebayConnected) {
      showEbayDiagError("Diagnostic call failed — eBay isn't connected. Connect it on Channel first.");
      return;
    }
    const listed = state.items.filter((it) => itemPipeLabel(it) === "Listed").length;
    showEbayDiagError("");
    if (!result) return;
    result.classList.remove("hidden");
    const buckets = [
      { bucket: "Active", ack: "Failure", error: "eBay API not called — server credentials missing.", total_entries: null },
      { bucket: "Unsold", ack: "Failure", error: "eBay API not called — server credentials missing.", total_entries: null },
    ];
    result.innerHTML =
      `<div class="b44-ebay-diag-sync">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#7fb069" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
        <span>Synced in Coalition HUD right now: <b>${esc(String(listed))}</b> listings</span>
      </div>` +
      buckets
        .map(
          (a) => `<div class="b44-ebay-diag-bucket">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <span style="font-size:13px;font-weight:600;color:#e8e4dc">${esc(a.bucket)}</span>
          <span style="font-size:12px;color:${a.ack === "Success" ? "#7fb069" : "#d97757"}">${esc(a.ack)}</span>
        </div>
        ${a.error ? `<div style="font-size:12px;color:#d97757;margin-top:4px">${esc(a.error)}</div>` : ""}
        ${a.total_entries != null ? `<div style="font-size:12px;color:#9a9488;margin-top:4px">eBay reports <b style="color:#e8e4dc">${esc(String(a.total_entries))}</b> total in this bucket</div>` : ""}
      </div>`,
        )
        .join("");
  }, 350);
}



/* —— Live CR barcode scanner (Xre Scan BARCODE) —— */
const crState = {
  mode: "scan",
  code: "",
  draft: null,
  meta: null,
  added: 0,
  lastTitle: "",
  photoDataUrl: "",
  busy: false,
  scanner: null,
  lastDecoded: "",
};

function crEmptyDraft() {
  return { title: "", category: "other", imageUrl: "", notes: "", marketValue: 0 };
}

function crShowPane(mode) {
  crState.mode = mode;
  $("crScanPane")?.classList.toggle("hidden", mode !== "scan");
  $("crLookingPane")?.classList.toggle("hidden", mode !== "looking");
  $("crPreviewPane")?.classList.toggle("hidden", mode !== "preview");
}

function crSetCamMsg(msg) {
  const el = $("crCamMsg");
  if (!el) return;
  if (!msg) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.textContent = msg;
  el.classList.remove("hidden");
}

function crUpdateAddedBadge() {
  const el = $("crAddedCount");
  if (!el) return;
  if (crState.added > 0) {
    el.textContent = `${crState.added} added`;
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
  const last = $("crLastAdded");
  if (last) {
    if (crState.lastTitle) {
      last.textContent = `Last added: ${crState.lastTitle}`;
      last.classList.remove("hidden");
    } else {
      last.classList.add("hidden");
    }
  }
}

async function crStopScanner() {
  const s = crState.scanner;
  crState.scanner = null;
  if (!s) return;
  try {
    await s.stop();
  } catch (_) {}
  try {
    await s.clear();
  } catch (_) {}
}

async function crStartScanner() {
  await crStopScanner();
  crSetCamMsg("");
  const host = $("crScannerHost");
  if (!host) return;
  host.innerHTML = "";
  if (!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function")) {
    crSetCamMsg("Camera isn't available in this browser. Enter the barcode manually below.");
    return;
  }
  if (typeof Html5Qrcode === "undefined") {
    crSetCamMsg("Barcode scanner library missing. Enter the barcode manually below.");
    return;
  }
  const scanner = new Html5Qrcode("crScannerHost", { verbose: false });
  crState.scanner = scanner;
  const onDecode = (text) => {
    const code = String(text || "").trim();
    if (!code || crState.busy) return;
    if (code === crState.lastDecoded) return;
    crState.lastDecoded = code;
    crLookup(code);
  };
  try {
    await scanner.start(
      { facingMode: "environment" },
      { fps: 8, qrbox: { width: 240, height: 120 }, aspectRatio: 1.6 },
      onDecode,
      () => {},
    );
  } catch (err) {
    const name = err?.name || "";
    const msg = err?.message || "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      crSetCamMsg("Camera permission was blocked. Allow camera access in your browser settings, or enter the barcode manually below.");
    } else if (name === "NotFoundError" || name === "OverconstrainedError") {
      crSetCamMsg("No camera found on this device. Enter the barcode manually below.");
    } else if (name === "NotReadableError" || name === "AbortError") {
      crSetCamMsg("Camera is in use by another app. Close it and reopen the scanner, or enter the barcode manually.");
    } else if (String(msg).includes("MediaStream")) {
      crSetCamMsg("Camera couldn't start in this context. Try opening the app in a new tab, or enter the barcode manually.");
    } else {
      crSetCamMsg("Camera unavailable. Enter the barcode manually below.");
    }
  }
}

function crFillPreview(draft, meta, code) {
  crState.draft = { ...crEmptyDraft(), ...draft };
  crState.meta = meta || null;
  crState.code = code;
  crState.photoDataUrl = draft.imageUrl && String(draft.imageUrl).startsWith("data:") ? draft.imageUrl : "";
  if ($("crTitle")) $("crTitle").value = crState.draft.title || "";
  if ($("crCategory")) $("crCategory").value = crState.draft.category || "other";
  if ($("crMarket")) $("crMarket").value = String(crState.draft.marketValue || 0);
  if ($("crNotes")) $("crNotes").value = crState.draft.notes || "";
  if ($("crPreviewBarcode")) $("crPreviewBarcode").textContent = code ? `Barcode ${code}` : "";
  if ($("crPreviewBrand")) $("crPreviewBrand").textContent = meta?.brand || "";
  if ($("crPreviewConfidence")) {
    const c = meta?.confidence;
    $("crPreviewConfidence").textContent =
      typeof c === "number" && c > 0 ? `Confidence ${Math.round(c * 100)}%` : "";
  }
  const thumb = $("crPreviewThumb");
  const noImg = $("crPreviewNoImg");
  const url = crState.draft.imageUrl || "";
  if (thumb && noImg) {
    if (url) {
      thumb.src = url;
      thumb.classList.remove("hidden");
      noImg.classList.add("hidden");
    } else {
      thumb.removeAttribute("src");
      thumb.classList.add("hidden");
      noImg.classList.remove("hidden");
    }
  }
  crSyncItemPhoto();
}

function crSyncItemPhoto() {
  const img = $("crItemPhoto");
  const empty = $("crItemPhotoEmpty");
  const remove = $("btnCrRemovePhoto");
  const src = crState.photoDataUrl || crState.draft?.imageUrl || "";
  if (img && empty) {
    if (src) {
      img.src = src;
      img.classList.remove("hidden");
      empty.classList.add("hidden");
    } else {
      img.removeAttribute("src");
      img.classList.add("hidden");
      empty.classList.remove("hidden");
    }
  }
  remove?.classList.toggle("hidden", !src);
  if ($("btnCrAddPhoto")) $("btnCrAddPhoto").textContent = src ? "Replace" : "Add Photo";
}

function crReadDraftFromForm() {
  return {
    title: ($("crTitle")?.value || "").trim(),
    category: $("crCategory")?.value || "other",
    notes: ($("crNotes")?.value || "").trim(),
    marketValue: Number($("crMarket")?.value || 0) || 0,
    imageUrl: crState.photoDataUrl || crState.draft?.imageUrl || "",
  };
}

async function crLookup(code) {
  const trimmed = String(code || "").trim();
  if (!trimmed || crState.busy) return;
  crState.busy = true;
  crState.code = trimmed;
  if ($("crLookingCode")) $("crLookingCode").textContent = trimmed;
  crShowPane("looking");
  await crStopScanner();
  try {
    const res = await fetch(`/api/scouter/barcode/${encodeURIComponent(trimmed)}`);
    const result = await res.json();
    const product = result.product || null;
    const found = !!(result.found && product?.title);
    const draft = {
      title: found ? product.title : `Unknown Product (${trimmed})`,
      category: "other",
      imageUrl: product?.imageUrl || product?.image_url || "",
      notes: found ? product.description || "" : "",
      marketValue: Number(product?.marketValue || product?.market_value || 0) || 0,
    };
    const meta = {
      brand: product?.brand || "",
      confidence: found ? 0.85 : 0,
    };
    const auto = !!$("crAutoAdd")?.checked;
    if (auto) {
      await crAddItem(draft, trimmed);
      crShowPane("scan");
      crState.lastDecoded = "";
      await crStartScanner();
    } else {
      crFillPreview(draft, meta, trimmed);
      crShowPane("preview");
    }
  } catch (e) {
    setScouterStatus(`Product lookup failed: ${e.message || e}`);
    // Live CR: ht.error("Product lookup failed")
    showToast("Product lookup failed", "err");
    crShowPane("scan");
    crState.lastDecoded = "";
    await crStartScanner();
  } finally {
    crState.busy = false;
  }
}

async function crAddItem(draft, code) {
  const d = draft || crReadDraftFromForm();
  const title = (d.title || "").trim();
  // Live CR Add item uses the title as-is — no invent required-title guard toast.
  try {
    const image = d.imageUrl || crState.photoDataUrl || "";
    const photos = image ? [{ dataUrl: image, name: "barcode" }] : [];
    const item = {
      id: crypto.randomUUID(),
      title,
      category: d.category || "other",
      condition: "nm",
      listingStatus: "sorted",
      staged: false,
      photos,
      quantity: 1,
      marketValue: Number(d.marketValue) || 0,
      purchasePrice: 0,
      language: "English",
      game: "PKM",
      barcode: code || crState.code || null,
      sku: code || crState.code || null,
      notes: d.notes || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.items.unshift(item);
    saveItems();
    crState.added += 1;
    crState.lastTitle = title;
    crUpdateAddedBadge();
    setScouterStatus(`Added: ${title}`);
    // Live CR: ht.success(`Added: ${title}`)
    showToast(`Added: ${title}`, "ok");
    renderCollection();
    renderIntakeList();
    updateSitrep();
    return true;
  } catch {
    // Live CR: ht.error("Failed to add item")
    showToast("Failed to add item", "err");
    return false;
  }
}

async function openBarcodeSheet() {
  crState.mode = "scan";
  crState.code = "";
  crState.draft = crEmptyDraft();
  crState.meta = null;
  crState.busy = false;
  crState.lastDecoded = "";
  crState.photoDataUrl = "";
  if ($("crManualCode")) $("crManualCode").value = "";
  if ($("crAutoAdd")) $("crAutoAdd").checked = false;
  crUpdateAddedBadge();
  crShowPane("scan");
  $("barcodeSheet")?.classList.remove("hidden");
  setTimeout(() => crStartScanner(), 300);
}

async function closeBarcodeSheet() {
  await crStopScanner();
  $("barcodeSheet")?.classList.add("hidden");
  crShowPane("scan");
}

async function crRescan() {
  crState.draft = crEmptyDraft();
  crState.meta = null;
  crState.code = "";
  crState.photoDataUrl = "";
  crState.lastDecoded = "";
  if ($("crManualCode")) $("crManualCode").value = "";
  crShowPane("scan");
  await crStartScanner();
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

  $("scanAssistForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    submitScanAssist();
  });



  $("btnScoutPipeline")?.addEventListener("click", () => setScouterMode("pipeline"));
  $("btnScoutDemo")?.addEventListener("click", (e) => {
    e.stopPropagation();
    setScouterDemo(!state.scouterDemo);
  });
  $("btnScouterManual")?.addEventListener("click", () => openAssetSheet(null));
  $("btnScouterScan")?.addEventListener("click", () => openBarcodeSheet());
  $("btnBarcodeClose")?.addEventListener("click", () => closeBarcodeSheet());
  $("barcodeSheet")?.addEventListener("click", (e) => {
    if (e.target === $("barcodeSheet")) closeBarcodeSheet();
  });
  $("crManualForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const code = ($("crManualCode")?.value || "").trim();
    if (code) crLookup(code);
  });
  $("btnCrRescan")?.addEventListener("click", () => crRescan());
  $("btnCrDone")?.addEventListener("click", () => closeBarcodeSheet());
  $("btnCrAddItem")?.addEventListener("click", async () => {
    const ok = await crAddItem(null, crState.code);
    if (ok) await crRescan();
  });
  $("btnCrAddPhoto")?.addEventListener("click", () => $("crPhotoInput")?.click());
  $("btnCrRemovePhoto")?.addEventListener("click", () => {
    crState.photoDataUrl = "";
    if (crState.draft) crState.draft.imageUrl = "";
    crSyncItemPhoto();
    const thumb = $("crPreviewThumb");
    const noImg = $("crPreviewNoImg");
    if (thumb && noImg) {
      thumb.removeAttribute("src");
      thumb.classList.add("hidden");
      noImg.classList.remove("hidden");
    }
  });
  $("crPhotoInput")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      crState.photoDataUrl = dataUrl;
      if (crState.draft) crState.draft.imageUrl = dataUrl;
      crSyncItemPhoto();
      const thumb = $("crPreviewThumb");
      const noImg = $("crPreviewNoImg");
      if (thumb && noImg && dataUrl) {
        thumb.src = dataUrl;
        thumb.classList.remove("hidden");
        noImg.classList.add("hidden");
      }
    } catch (_) {
      setScouterStatus("Image upload failed");
      // Live CR: ht.error("Image upload failed")
      showToast("Image upload failed", "err");
    }
  });

  $("btnScoutSpaces")?.addEventListener("click", () => setScouterMode("spaces"));
  $("scouterPhotoInput")?.addEventListener("change", async (e) => {
    await intakePhotosOntoScouter(e.target.files);
    e.target.value = "";
  });
  bindScouterPhotoDrop();


  $("btnCloseReadout")?.addEventListener("click", () => closeScouterReadout());
  $("btnWriteListing")?.addEventListener("click", () => {
    if (!state.lockedItemId) return;
    openUnSheet(state.lockedItemId);
  });
  $("btnFleClose")?.addEventListener("click", () => closeFleSheet());
  $("fleSheet")?.addEventListener("click", (e) => {
    if (e.target === $("fleSheet")) closeFleSheet();
  });
  $("fleFaceFront")?.addEventListener("click", () => {
    state.fleFace = "front";
    renderFleSheet();
  });
  $("fleFaceBack")?.addEventListener("click", () => {
    state.fleFace = "back";
    renderFleSheet();
  });
  $("btnFleVerify")?.addEventListener("click", () => verifyFleRow("Approved"));
  $("btnFleSendReview")?.addEventListener("click", () => verifyFleRow("Needs Review"));
  $("btnAssetToScouter")?.addEventListener("click", () => {
    const id = state.assetEditId;
    if (!id) return;
    closeAssetSheet();
    openScouterReadout(id);
  });
  $("btnAssetDuplicate")?.addEventListener("click", () => duplicateAsset());
  $("btnAssetArchive")?.addEventListener("click", () => archiveAsset());
  $("btnAssetDelete")?.addEventListener("click", () => deleteAsset());
  $("assetMarket")?.addEventListener("input", () => updateAssetEconomics());
  $("assetPurchase")?.addEventListener("input", () => updateAssetEconomics());
  $("assetCategory")?.addEventListener("change", () => updateAssetEconomics());
  $("assetPhase")?.addEventListener("change", () => updateAssetEconomics());
  $("btnUnClose")?.addEventListener("click", () => closeUnSheet());
  $("unSheet")?.addEventListener("click", (e) => {
    if (e.target === $("unSheet")) closeUnSheet();
  });
  $("btnUnRun")?.addEventListener("click", () => runUnEngine());
  $("btnUnRetry")?.addEventListener("click", () => {
    // Live UN error TRY AGAIN → idle
    state.unPhase = "idle";
    state.unStatus = "";
    state.unDraft = null;
    renderUnSheet();
  });
  $("btnUnSave")?.addEventListener("click", () => saveUnDraft());
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
    // Live tle be(): require a built listing (draft / ready_to_list) before publish.
    const step = itemPipeLabel(it);
    const status = it.listingStatus || "";
    if (!(status === "ready_to_list" || step === "Listing Built")) {
      // Live tle be(): ht.error("No listing built yet — run the AI writer on this card first")
      state.readoutStatus = "No listing built yet — run the AI writer on this card first";
      showToast(state.readoutStatus, "err");
      openScouterReadout(it.id);
      return;
    }
    const btn = $("btnPublishEbay");
    // Live tle Publish button shows Publishing… while the request runs.
    if (btn) {
      btn.textContent = "Publishing…";
      btn.disabled = true;
    }
    // Local port: mark Listed; live ebayPublishListing needs server eBay creds.
    window.setTimeout(() => {
      it.staged = true;
      it.listingStatus = "listed";
      it.updatedAt = new Date().toISOString();
      saveItems();
      state.readoutStatus = `${it.title || "Untitled"} is live on eBay`;
      if (btn) btn.disabled = false;
      openScouterReadout(it.id);
      renderCollection();
      updateSitrep();
    }, 400);
  });
  $("btnOpenCard")?.addEventListener("click", () => {
    const it = state.items.find((x) => x.id === state.lockedItemId);
    if (!it) return;
    navigate(`/item/${it.id}`);
  });

  // Live OK /item/:id page controls
  $("btnItemBack")?.addEventListener("click", () => navigate("/inventory"));
  $("btnItemToScouter")?.addEventListener("click", () => navigate("/"));
  $("btnItemMove")?.addEventListener("click", () => {
    const panel = $("itemMovePanel");
    const opening = !!panel?.classList.contains("hidden");
    renderItemMovePanel(opening);
    if (opening) $("itemSpace")?.focus();
  });
  $("btnItemDuplicate")?.addEventListener("click", () => duplicateItemPage());
  $("btnItemArchive")?.addEventListener("click", () => archiveItemPage());
  $("btnItemDelete")?.addEventListener("click", () => deleteItemPage());
  $("btnItemAddPhotos")?.addEventListener("click", () => $("itemImages")?.click());
  $("itemImages")?.addEventListener("change", async (e) => {
    await addItemImageFiles(e.target.files);
    e.target.value = "";
  });
  $("btnItemShipManage")?.addEventListener("click", () => {
    openItemShipManage();
  });
  $("btnItemShipManageClose")?.addEventListener("click", () => closeItemShipManage());
  $("itemShipManageSheet")?.addEventListener("click", (e) => {
    if (e.target === $("itemShipManageSheet")) closeItemShipManage();
  });
  $("btnPkShipCreate")?.addEventListener("click", () => createPkShipPreset());
  $("pkShipName")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") createPkShipPreset();
  });
  $("itemTitle")?.addEventListener("change", (e) => patchItemField("title", e.target.value));
  $("itemNotes")?.addEventListener("change", (e) => patchItemField("notes", e.target.value));
  $("btnItemCollections")?.addEventListener("click", () => {
    state.itemCollectionsOpen = !state.itemCollectionsOpen;
    const it = currentItemPage();
    if (it) renderItemCollections(it);
  });
  $("ebayWarn")?.addEventListener("click", () => navigate("/settings"));
  $("itemCategory")?.addEventListener("change", (e) => patchItemField("category", e.target.value));
  $("itemPhase")?.addEventListener("change", (e) => patchItemField("listingStatus", e.target.value));
  $("itemChannel")?.addEventListener("change", (e) => patchItemField("liveChannel", e.target.value));
  $("itemSpace")?.addEventListener("change", (e) => {
    patchItemField("spaceId", e.target.value);
    renderItemMovePanel(false);
  });
  $("itemQty")?.addEventListener("change", (e) => {
    patchItemField("quantity", Number(e.target.value) || 1);
  });
  // Live zN QTY steppers + Push / Write listing with AI / Publish to eBay
  $("btnItemQtyDec")?.addEventListener("click", () => bumpItemQty(-1));
  $("btnItemQtyInc")?.addEventListener("click", () => bumpItemQty(1));
  $("btnItemPush")?.addEventListener("click", () => pushItemPhase());
  $("btnItemWriteListing")?.addEventListener("click", () => {
    const it = currentItemPage();
    if (!it) return;
    openUnSheet(it.id);
  });
  $("btnItemPublishEbay")?.addEventListener("click", () => publishItemEbay());
  const bindItemMoney = (id, key) => {
    $(id)?.addEventListener("change", (e) => {
      const n = e.target.value === "" ? 0 : Number(e.target.value);
      if (Number.isNaN(n)) return;
      patchItemField(key, n);
    });
    $(id)?.addEventListener("input", () => {
      const it = currentItemPage();
      if (!it) return;
      it.purchasePrice = Number($("itemPurchase")?.value || 0) || 0;
      it.marketValue = Number($("itemMarket")?.value || 0) || 0;
      it.lowestActive = Number($("itemLowestActive")?.value || 0) || 0;
      it.recentSold = Number($("itemRecentSold")?.value || 0) || 0;
      updateItemEconomics(it);
    });
  };
  bindItemMoney("itemPurchase", "purchasePrice");
  bindItemMoney("itemMarket", "marketValue");
  bindItemMoney("itemLowestActive", "lowestActive");
  bindItemMoney("itemRecentSold", "recentSold");
  $("itemShipPreset")?.addEventListener("change", (e) => {
    patchItemField("shippingPresetId", e.target.value);
  });

  $("btnNewCard")?.addEventListener("click", () => {
    navigate("/inventory?add=1");
  });
  $("btnAssetClose")?.addEventListener("click", () => closeAssetSheet());
  $("btnAssetCancel")?.addEventListener("click", () => closeAssetSheet());
  $("btnAssetSave")?.addEventListener("click", () => saveAssetSheet());
  // Live: label[for=assetImages] opens the picker; busy chrome via addAssetImageFiles.
  $("assetImages")?.addEventListener("change", async (e) => {
    await addAssetImageFiles(e.target.files);
    e.target.value = "";
  });
  $("assetSheet")?.addEventListener("click", (e) => {
    if (e.target === $("assetSheet")) closeAssetSheet();
  });
  $("btnConfirmCancel")?.addEventListener("click", () => closeConfirmDialog());
  $("btnConfirmOk")?.addEventListener("click", () => {
    const fn = confirmDialogOnConfirm;
    closeConfirmDialog();
    if (fn) fn();
  });
  $("confirmSheet")?.addEventListener("click", (e) => {
    if (e.target === $("confirmSheet")) closeConfirmDialog();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!$("confirmSheet")?.classList.contains("hidden")) closeConfirmDialog();
      else if (!$("fleSheet")?.classList.contains("hidden")) closeFleSheet();
      else if (!$("unSheet")?.classList.contains("hidden")) closeUnSheet();
      else if (!$("assetSheet")?.classList.contains("hidden")) closeAssetSheet();
      else if (state.fulSheetId || !$("fulSheet")?.classList.contains("hidden")) {
        // Live fle readout close is titled "Release lock (ESC)".
        closeFulSheet();
      } else if (state.intakePickId || !$("intakePickSheet")?.classList.contains("hidden")) {
        closeIntakePick();
      } else if (state.channelSheetId || !$("channelSheet")?.classList.contains("hidden")) {
        // Live SS readout close control is titled "Release lock (ESC)".
        closeChannelSheet();
      } else closeScouterReadout();
    }
  });
  $("btnNewBatch")?.addEventListener("click", () => openNewBatch());
  $("btnCancelBatch")?.addEventListener("click", () => backToIntake());
  $("btnGroupBackIntake")?.addEventListener("click", () => backToIntake());
  $("btnReviewBackIntake")?.addEventListener("click", () => backToIntake());
  $("inputGallery")?.addEventListener("change", (e) => {
    addFiles(e.target.files);
    e.target.value = "";
  });
  $("btnIdentify")?.addEventListener("click", () => runIdentify());
  $("btnStartIntake")?.addEventListener("click", () => startIntakeToGrouping());
  $("btnGroupNewBatch")?.addEventListener("click", () => openNewBatch());
  $("btnGroupIdentify")?.addEventListener("click", () => startIdentificationFromGroups());
  $("btnSwapFrontBack")?.addEventListener("click", () => swapFrontBack());
  $("btnReviewNewBatch")?.addEventListener("click", () => openNewBatch());
  $("btnReviewDhCsv")?.addEventListener("click", () => exportIntakeDoubleHoloCsv());
  $("btnReviewEbayCsv")?.addEventListener("click", () => runIntakeEbayCsv());
  $("btnEbayCsvMapClose")?.addEventListener("click", () => closeEbayCsvMapSheet());
  $("btnEbayCsvMapCancel")?.addEventListener("click", () => closeEbayCsvMapSheet());
  $("btnEbayCsvMapSave")?.addEventListener("click", () => saveEbayCsvMapAndExport());
  $("ebayCsvHeaders")?.addEventListener("input", () => renderEbayCsvMapRows());
  $("ebayCsvMapSheet")?.addEventListener("click", (e) => {
    if (e.target === $("ebayCsvMapSheet")) closeEbayCsvMapSheet();
  });
  $("btnReviewApprove")?.addEventListener("click", () => bulkReviewStatus("Approved", "Approved"));
  $("btnReviewReject")?.addEventListener("click", () => bulkReviewStatus("Rejected", "Rejected"));
  $("btnReviewFetchPrices")?.addEventListener("click", () => {
    const btn = $("btnReviewFetchPrices");
    if (btn) {
      btn.textContent = "Fetching…";
      btn.disabled = true;
    }
    window.setTimeout(() => {
      try {
        // Live Wle: Ve.functions.invoke("scanFetchPrices") — unwired on this shell.
        // Success toast when wired: "Prices fetched — estimates only, not sold comps"
        throw new Error("scanFetchPrices unwired");
      } catch {
        // Live Wle: ht.error("Pricing failed")
        state.intakeReviewStatus = "Pricing failed";
        showToast("Pricing failed", "err");
        renderIntakeReview();
      } finally {
        if (btn) {
          btn.textContent = "Fetch prices";
          btn.disabled = false;
        }
      }
    }, 400);
  });
  $("reviewMult")?.addEventListener("change", (e) => {
    state.intakeReviewMult = Number(e.target.value) || 1.3;
  });
  $("reviewFloor")?.addEventListener("change", (e) => {
    state.intakeReviewFloor = Number(e.target.value) || 1.77;
  });
  $("reviewBulkCondition")?.addEventListener("change", (e) => {
    const v = e.target.value;
    if (!v) return;
    bulkReviewCondition(v);
    e.target.value = "";
  });
  $("btnReviewDelete")?.addEventListener("click", () => bulkReviewDelete());
  $("btnReviewClear")?.addEventListener("click", () => bulkReviewClear());
  $("btnReviewRescanList")?.addEventListener("click", () => copyReviewRescanList());
  $("btnReviewPreviewFront")?.addEventListener("click", () => {
    state.reviewPreviewFace = "front";
    renderReviewPreview();
  });
  $("btnReviewPreviewBack")?.addEventListener("click", () => {
    state.reviewPreviewFace = "back";
    renderReviewPreview();
  });
  $("btnReviewSplitScreen")?.addEventListener("click", () => {
    if (state.intakeReviewFocusId) openFleSheet(state.intakeReviewFocusId);
  });

  document.querySelectorAll("[data-review-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = btn.dataset.reviewFilter;
      state.intakeReviewFilter = state.intakeReviewFilter === v ? "" : v;
      renderIntakeReview();
    });
  });
  $("groupSensitivity")?.addEventListener("input", (e) => {
    state.intakeThreshold = Number(e.target.value) || 0;
    state.groupSplitOpen = null;
    state.groupSplitPick = [];
    regroupIntake();
  });
  $("groupSkuPrefix")?.addEventListener("input", (e) => {
    state.skuPrefix = e.target.value.trim().toUpperCase();
  });
  $("batchName")?.addEventListener("input", (e) => {
    state.batchName = e.target.value;
    syncBatchChromeTitles();
  });
  $("batchGame")?.addEventListener("change", (e) => {
    state.game = e.target.value;
  });
  $("backsIncluded")?.addEventListener("change", (e) => {
    state.backsIncluded = !!e.target.checked;
    updateBatchScanChrome();
  });

  $("batchGameChips")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-game]");
    if (!btn) return;
    setBatchGame(btn.dataset.game);
  });

  $("intakeFilter")?.addEventListener("input", (e) => {
    state.filterIntake = e.target.value;
    renderIntakeList();
  });
  // Live Zc desk plane: Gre→zre Intake map at ≥1024; phone stays qle rails.
  window.addEventListener("resize", () => {
    if (state.route === "/scan-intake" || $("view-intake")?.classList.contains("active")) {
      renderIntakeList();
    }
  });
  $("btnIntakePickClose")?.addEventListener("click", () => closeIntakePick());
  $("btnIntakeBuildListing")?.addEventListener("click", () => buildIntakeListing());
  $("btnIntakeOpenCard")?.addEventListener("click", () => openIntakeCard());

  bindDropZone();
  bindSpaceCoverInput();

  $("btnSpaceUp")?.addEventListener("click", () => {
    state.spaceTrail = state.spaceTrail.slice(0, -1);
    renderSpaces();
  });
  $("spaceBreadcrumb")?.addEventListener("click", () => {
    if (!state.spaceTrail.length) return;
    state.spaceTrail = [];
    renderSpaces();
  });
  $("btnAddSpace")?.addEventListener("click", () => openSpaceCreateModal());
  $("btnSpaceCreateClose")?.addEventListener("click", () => closeSpaceCreateModal());
  $("btnSpaceCreateSave")?.addEventListener("click", () => submitSpaceCreateModal());
  $("spaceCreateName")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitSpaceCreateModal();
    if (e.key === "Escape") closeSpaceCreateModal();
  });
  $("spaceCreateSheet")?.addEventListener("click", (e) => {
    if (e.target === $("spaceCreateSheet")) closeSpaceCreateModal();
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
  $("btnChannelPrev")?.addEventListener("click", () => channelSheetStep(-1));
  $("btnChannelNext")?.addEventListener("click", () => channelSheetStep(1));
  $("btnChannelReprice")?.addEventListener("click", () => channelSheetAction("reprice"));
  $("btnChannelRelist")?.addEventListener("click", () => channelSheetAction("relist"));
  $("btnChannelEnd")?.addEventListener("click", () => channelSheetAction("end"));
  $("btnChannelRepriceGo")?.addEventListener("click", () => applyChannelReprice());
  $("btnChannelRepriceCancel")?.addEventListener("click", () => setChannelRepriceOpen(false));
  $("channelRepriceInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyChannelReprice();
    if (e.key === "Escape") setChannelRepriceOpen(false);
  });
  
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
    // Live Settings shipping preset fields only (package dims live on item PK sheet).
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
    state.showShipForm = false;
    state.showTemplateForm = false;
    state.showStorageForm = true;
    if ($("storageDefName")) $("storageDefName").value = "";
    if ($("storageDefCode")) $("storageDefCode").value = "";
    if ($("storageDefDesc")) $("storageDefDesc").value = "";
    renderSettings();
    $("storageDefName")?.focus();
  });
  $("btnStorageDefCancel")?.addEventListener("click", () => {
    resetStorageDefForm();
    renderSettings();
  });
  $("btnStorageDefSave")?.addEventListener("click", () => {
    const name = ($("storageDefName")?.value || "").trim();
    if (!name) return;
    const code = ($("storageDefCode")?.value || "").trim();
    const description = ($("storageDefDesc")?.value || "").trim();
    loadSettingsLocal();
    state.storageDefs.unshift({
      id: crypto.randomUUID(),
      name,
      code,
      location_code: code,
      description,
    });
    saveSettingsLocal();
    resetStorageDefForm();
    renderSettings();
  });
  $("storageDefName")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("btnStorageDefSave")?.click();
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
      // Live Agent Connect Copy: catch is empty — button stays Copy.
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
    // Live channel $(): invoke ebaySyncListings — unwired → ht.error("Request failed")
    setChannelStatus("Sync needs live eBay credentials on the server — nothing pulled.");
    showToast("Request failed", "err");
  });
  $("btnChannelVariation")?.addEventListener("click", () => {
    if (!state.ebayConnected) {
      setChannelStatus("Connect eBay before Variation mode.");
      return;
    }
    if (state.channelVariationMode) exitChannelVariationMode();
    else {
      state.channelVariationMode = true;
      state.channelVariationSelected = [];
      closeChannelSheet();
    }
    renderChannel();
  });
  $("btnChannelVariationCancel")?.addEventListener("click", () => {
    exitChannelVariationMode();
    renderChannel();
  });
  $("btnChannelCreateVariation")?.addEventListener("click", () => {
    if (state.channelVariationSelected.length < 2) return;
    setChannelStatus(
      "Create variation needs the live eBay variation API on the server — selection chrome only in this shell.",
    );
  });
  $("btnChannelPhotos")?.addEventListener("click", () => {
    if (!state.ebayConnected) {
      setChannelStatus("Connect eBay before Photos.");
      return;
    }
    // Live channel $(): ebayFetchListingImages — unwired → ht.error("Request failed")
    setChannelStatus("Photos sync needs live eBay credentials on the server.");
    showToast("Request failed", "err");
  });
  $("btnChannelToken")?.addEventListener("click", () => {
    if (!state.ebayConnected) {
      setChannelStatus("Connect eBay before Token refresh.");
      return;
    }
    // Live channel $(): ebayAuth refresh — unwired → ht.error("Request failed")
    setChannelStatus("Token refresh needs live eBay credentials on the server.");
    showToast("Request failed", "err");
  });
  $("btnChannelPolicies")?.addEventListener("click", () => {
    if (!state.ebayConnected) {
      setChannelStatus("Connect eBay before Policies.");
      return;
    }
    // Live channel $(): ebayGetPolicies — unwired → ht.error("Request failed")
    setChannelStatus("Policies load needs live eBay credentials on the server.");
    showToast("Request failed", "err");
  });
  $("btnFulSheetClose")?.addEventListener("click", () => closeFulSheet());
  $("btnFulAdvance")?.addEventListener("click", () => {
    if (state.fulSheetId) advanceShipment(state.fulSheetId);
  });
}

loadItems();
loadCollections();
loadSettingsLocal();
bind();
setIntakeMode("list");
setSettingsTab(state.settingsTab || "templates");
renderSettings();
navigate((location.hash || "#/scan-intake").replace(/^#/, "") || "/scan-intake");
