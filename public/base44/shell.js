/** Base44 route shell — nav + Intake/Scouter from live silky bundle (Zle/Mle/tle). */
const LS_KEY = "scouter-items-v1";
const ROUTES = {
  "/": { id: "view-command", brand: "COMMAND" },
  "/inventory": { id: "view-inventory", brand: "SCOUTER" },
  "/item": { id: "view-item", brand: "ASSET" },
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
  filterScouter: "",
  filterSpaces: "",
  spaceTrail: [],
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

/** Live fle carrier code → readout label (cle). */
const CARRIER_LABELS = {
  usps_standard_envelope: "eBay Std Envelope",
  double_holo_envelope: "Double Holo Envelope",
  fedex_ground: "FedEx Ground",
  fedex_ground_economy: "FedEx Ground Economy",
  other: "Other",
};

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
  setScouterStatus(state.scouterDemo ? "Demo inventory — LIVE data untouched" : "");
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
  const empty = `<div class="b44-copy-soft" style="font-size:12px;padding:8px 4px">Empty</div>`;
  const body = cards
    ? (useTiles ? `<div class="b44-scout-group-rail">${cards}${more}</div>` : cards)
    : empty;
  return `<section class="b44-scout-group" data-drop-key="${esc(group.key)}" data-drop-kind="${esc(group.kind)}" style="--phase:${esc(phaseColor)}">
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
  } else {
    const next = key === "__unfiled__" ? "" : key;
    if ((it.spaceId || "") === next) return;
    it.spaceId = next;
    const name =
      key === "__unfiled__"
        ? "Unfiled"
        : state.spaces.find((s) => s.id === key)?.name || "Space";
    setScouterStatus(`Filed into ${name}`);
  }
  it.updatedAt = new Date().toISOString();
  saveItems();
  renderCollection();
  renderSpaces();
  updateSitrep();
  if (state.lockedItemId === it.id) openScouterReadout(it.id);
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

/** Live tle photo drop → Intake cards on the scouter. */
async function intakePhotosOntoScouter(fileList) {
  const files = [...(fileList || [])].filter((f) => f.type?.startsWith("image/"));
  if (!files.length) {
    setScouterStatus("No photos — drop image files onto the scouter.");
    return;
  }
  setScouterStatus(`Uploading ${files.length} photo${files.length === 1 ? "" : "s"}…`);
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
  }
  if (!created.length) {
    setScouterStatus("No photos uploaded — check the file and try again.");
    return;
  }
  state.items = [...created, ...state.items];
  saveItems();
  setScouterStatus(`${created.length} card${created.length === 1 ? "" : "s"} on the scouter`);
  renderCollection();
  renderIntakeList();
  updateSitrep();
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Live tle Export — Listing Built + Listed → doubleholo-style CSV. */
function exportScouterCsv() {
  const rows = state.items.filter((it) =>
    ["ready_to_list", "listed"].includes(it.listingStatus) || itemPipeLabel(it) === "Listing Built" || itemPipeLabel(it) === "Listed",
  );
  if (!rows.length) {
    setScouterStatus("Nothing to export — move cards to Listing Built or Listed first.");
    return;
  }
  const condMap = {
    raw: "NM",
    nm: "NM",
    lp: "LP",
    mp: "MP",
    hp: "HP",
    damaged: "DMG",
    new: "NM",
    used: "LP",
    graded: "NM",
  };
  const headers = [
    "Card Name",
    "Number",
    "Set",
    "Condition",
    "Quantity",
    "SKU",
    "Language",
    "Variation",
    "Graded",
    "Grade",
    "Grading Company",
    "Acquisition Price",
  ];
  const lines = [headers.join(",")].concat(
    rows.map((it) =>
      [
        it.title || "",
        it.cardNumber || it.card_number || "",
        it.setName || it.set_name || "",
        condMap[it.condition] || "NM",
        it.quantity || 1,
        it.sku || it.barcode || "",
        it.language || "English",
        it.variation || "",
        it.gradingCompany || it.grading_company ? "Yes" : "",
        it.grade || "",
        it.gradingCompany || it.grading_company || "",
        it.purchasePrice || it.purchase_price || "",
      ]
        .map(csvEscape)
        .join(","),
    ),
  );
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `doubleholo-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  setScouterStatus(`Exported ${rows.length}`);
}

function bindScouterPhotoDrop() {
  const glass = $("scouterGlass");
  if (!glass || glass.dataset.dropBound === "1") return;
  glass.dataset.dropBound = "1";
  glass.addEventListener("dragover", (e) => {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    glass.classList.add("b44-photo-drop");
  });
  glass.addEventListener("dragleave", () => glass.classList.remove("b44-photo-drop"));
  glass.addEventListener("drop", (e) => {
    glass.classList.remove("b44-photo-drop");
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
  if (!name) return;
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
  $("intakeIdentifying")?.classList.toggle("hidden", mode !== "identifying");
  $("intakeReview")?.classList.toggle("hidden", mode !== "review");
}

/** Live df + FR — Intake map hubs (qle / Xle). */

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

function closeIntakePick() {
  state.intakePickId = null;
  state.intakePickHubKey = null;
  state.intakePickStatus = "";
  $("intakePickSheet")?.classList.add("hidden");
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
}

function buildIntakeListing() {
  const it = state.items.find((x) => x.id === state.intakePickId);
  if (!it) return;
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
  root.innerHTML = hubs.map(intakeHubSectionHtml).join("");
  root.querySelectorAll("[data-intake-pick]").forEach((btn) => {
    btn.addEventListener("click", () => openIntakePick(btn.dataset.intakePick, btn.dataset.intakeHub));
  });
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
  const q = state.filterScouter.trim().toLowerCase();
  const rows = source.filter((it) => {
    if (it.archived) return false;
    if (it.listingStatus === "sold" || it.listingStatus === "error") return false;
    if (!q) return true;
    const hay = `${it.title || ""} ${it.barcode || ""} ${it.sku || ""} ${it.game || ""}`.toLowerCase();
    return hay.includes(q);
  });
  const intakeN = source.filter((it) => !it.archived && itemPipeLabel(it) === "Intake").length;
  const builtN = source.filter((it) => !it.archived && itemPipeLabel(it) === "Listing Built").length;
  const listedN = source.filter((it) => !it.archived && itemPipeLabel(it) === "Listed").length;
  loadSpaces();
  const onMap = source.filter((it) => !it.archived && !!it.spaceId).length;
  const spaceRoots = state.spaces.filter((s) => !(s.parentId || s.parent_id)).length;
  const value = source
    .filter((it) => !it.archived && it.listingStatus !== "sold" && it.listingStatus !== "error")
    .reduce((sum, it) => sum + (Number(it.marketValue) || 0) * (Number(it.quantity) || 1), 0);
  if ($("scoutStepIntake")) $("scoutStepIntake").textContent = pad2(intakeN);
  if ($("scoutStepBuilt")) $("scoutStepBuilt").textContent = pad2(builtN);
  if ($("scoutStepListed")) $("scoutStepListed").textContent = pad2(listedN);
  if ($("scoutSpaceCount")) $("scoutSpaceCount").textContent = pad2(spaceRoots);
  if ($("scoutOnMap")) $("scoutOnMap").textContent = pad2(onMap);
  if ($("scouterCount")) $("scouterCount").textContent = pad2(rows.length);
  if ($("scouterValue")) $("scouterValue").textContent = money(value);
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
  state.items = state.items.filter((x) => x.id !== id);
  saveItems();
  if ($("assetSheetStatus")) $("assetSheetStatus").textContent = "Item deleted";
  closeAssetSheet();
  closeScouterReadout();
  renderCollection();
  updateSitrep();
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

function updateItemEconomics(it) {
  const market = Number(it?.marketValue || 0);
  const cost = Number(it?.purchasePrice || 0);
  const profit = market - cost;
  if ($("itemEconMarket")) $("itemEconMarket").textContent = itemMoney(market);
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
  renderItemShipSummary(it);
  setItemPageStatus(state.itemPageStatus);
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

  html += `<button type="button" class="m-btn" data-item-move="" style="width:100%;margin-top:8px">Clear location</button>`;
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
      setItemPageStatus(next ? "Location updated" : "Location cleared");
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
        return `<div class="v-panel v-cut-sm p-3" style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div style="flex:1;min-width:0">
            <div class="v-readout v-emit-white" style="font-size:14px">${esc(s.name)}</div>
            <div class="b44-copy-soft" style="font-size:12px;margin-top:2px">${esc(pkg)}${esc(weight)}${esc(dims)}</div>
          </div>
          <button type="button" class="m-btn" data-pk-del-ship="${esc(s.id)}" title="Delete">×</button>
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
  const name = ($("pkShipName")?.value || "").trim();
  if (!name) {
    if ($("itemShipManageStatus")) $("itemShipManageStatus").textContent = "Name is required";
    return;
  }
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
  if (state.settingsTab === "shipping") renderSettings();
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
  if (!confirm("This permanently deletes the item. This cannot be undone.")) return;
  state.items = state.items.filter((x) => x.id !== id);
  saveItems();
  state.itemPageId = null;
  state.itemPhotos = [];
  renderCollection();
  updateSitrep();
  navigate("/");
}


function setBatchGame(code) {
  const hit = INTAKE_GAMES.find((g) => g.code === code) || INTAKE_GAMES[0];
  state.game = hit.code;
  if ($("batchGame")) $("batchGame").value = hit.code;
  document.querySelectorAll("#batchGameChips [data-game]").forEach((btn) => {
    btn.classList.toggle("m-chip-on", btn.dataset.game === hit.code);
  });
  if (!state.skuPrefix || INTAKE_GAMES.some((g) => g.code === state.skuPrefix)) {
    // keep manual prefix unless it still looks like a default game code
  }
  if (!($("batchSkuPrefix")?.dataset.touched === "1")) {
    state.skuPrefix = hit.code === "PKM" ? "PKM" : hit.code;
    if ($("batchSkuPrefix")) $("batchSkuPrefix").value = state.skuPrefix;
  }
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
}

function swapFrontBack() {
  state.intakeScans = state.intakeScans.map((s) => ({ ...s, isFront: !s.isFront }));
  state.groupSplitOpen = null;
  state.groupSplitPick = [];
  regroupIntake();
  setStatus("Front ↔ back swapped");
}

async function startIntakeToGrouping() {
  const photos = state.draftPhotos;
  if (!photos.length) {
    setStatus("Need photos first");
    return;
  }
  if (state.backsIncluded && photos.length % 2 !== 0) {
    setStatus(`Odd file count (${photos.length}) — front/back pairing would misalign. Add or remove a scan.`);
    $("batchOddWarn")?.classList.remove("hidden");
    return;
  }
  setIntakeMode("identifying");
  setIdentifyProgress("Hashing", 0, photos.length);
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
    setIdentifyProgress("Hashing", z + 1, photos.length);
  }
  setIdentifyProgress("Deduping", 1, 1);
  state.intakeScans = scans;
  state.intakeThreshold = 5;
  state.groupSplitOpen = null;
  state.groupSplitPick = [];
  regroupIntake();
  const cards = scans.filter((s) => s.isFront).length;
  setIntakeMode("grouping");
  setStatus(`${cards} cards → ${state.intakeGroups.length} unique`);
}

async function startIdentificationFromGroups() {
  const groups = state.intakeGroups;
  if (!groups.length) {
    setStatus("No groups to identify");
    return;
  }
  setIntakeMode("identifying");
  const total = groups.length;
  let done = 0;
  const prefix = (state.skuPrefix || "").trim().toUpperCase();
  const scanCount = state.intakeScans.length;
  const rows = [];
  for (const g of groups) {
    setIdentifyProgress("Identifying", done, total);
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
      message = `Identify failed: ${e.message}`;
      confidence = "Failed";
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
    setIdentifyProgress("Identifying", done, total);
  }
  state.intakeReviewRows = rows;
  state.intakeScanCount = scanCount;
  state.intakeReviewFilter = "";
  state.intakeReviewSelected = [];
  state.intakeExportSummary = null;
  state.intakeReviewStatus = "Identification complete";
  setIntakeMode("review");
  renderIntakeReview();
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
  if ($("reviewSummary")) {
    $("reviewSummary").textContent = `${state.intakeScanCount || 0} scans → ${rows.length} rows · ${counts.High} High · ${counts.Medium} Medium · ${counts.Low} Low · ${counts.Failed} Failed`;
  }
  if ($("reviewStatus")) $("reviewStatus").textContent = state.intakeReviewStatus || "";
  const sum = state.intakeExportSummary;
  const sumEl = $("reviewExportSummary");
  if (sumEl) {
    if (sum) {
      sumEl.classList.remove("hidden");
      sumEl.innerHTML = `<div class="v-label" style="color:var(--b44-cyan,#2bd9c0)">EXPORT SUMMARY</div>
        <div style="margin-top:4px;font-size:12px;color:var(--b44-mid,#c9d8e2)">Exported ${sum.exported} rows · ${sum.held} held back (Not High: ${sum.reasons["Not High confidence"]}, Not approved: ${sum.reasons["Not approved"]}, Rejected: ${sum.reasons.Rejected}).</div>`;
    } else sumEl.classList.add("hidden");
  }
  const body = $("reviewTableBody");
  if (!body) return;
  if (!visible.length) {
    body.innerHTML = `<tr><td colspan="10" class="b44-review-empty">Nothing in this category</td></tr>`;
    return;
  }
  body.innerHTML = visible
    .map((r) => {
      const edge =
        r.confidence === "Low" || r.confidence === "Failed"
          ? "bad"
          : r.confidence === "Medium"
            ? "gold"
            : "";
      const checked = state.intakeReviewSelected.includes(r.id) ? "checked" : "";
      return `<tr class="b44-review-row ${edge}" data-row-id="${esc(r.id)}">
        <td><input type="checkbox" data-rev-sel="${esc(r.id)}" ${checked} /></td>
        <td class="b44-review-thumb"><button type="button" class="b44-review-open" data-open-fle="${esc(r.id)}" title="Open scan">${r.photos?.[0]?.dataUrl ? `<img src="${r.photos[0].dataUrl}" alt="" />` : "Open"}</button></td>
        <td><input class="b44-review-input" data-rev-field="card_name" data-id="${esc(r.id)}" value="${esc(r.card_name)}" /></td>
        <td><input class="b44-review-input" data-rev-field="number" data-id="${esc(r.id)}" value="${esc(r.number)}" style="width:56px" /></td>
        <td><input class="b44-review-input" data-rev-field="set" data-id="${esc(r.id)}" value="${esc(r.set)}" /></td>
        <td>
          <select class="b44-review-input" data-rev-field="condition" data-id="${esc(r.id)}">
            ${["NM", "LP", "MP", "HP", "DMG"].map((c) => `<option value="${c}" ${r.condition === c ? "selected" : ""}>${c}</option>`).join("")}
          </select>
        </td>
        <td>${esc(r.quantity)}</td>
        <td><input class="b44-review-input" data-rev-field="sku" data-id="${esc(r.id)}" value="${esc(r.sku)}" style="width:88px" /></td>
        <td><span class="b44-conf b44-conf-${esc(r.confidence)}">${esc(r.confidence)}</span></td>
        <td>
          <select class="b44-review-input" data-rev-field="status" data-id="${esc(r.id)}">
            ${["Identified", "Needs Review", "Approved", "Rejected"].map((s) => `<option value="${s}" ${r.status === s ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </td>
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
    });
  });
  body.querySelectorAll("[data-rev-field]").forEach((el) => {
    const apply = () => {
      const row = state.intakeReviewRows.find((x) => x.id === el.dataset.id);
      if (!row) return;
      row[el.dataset.revField] = el.value;
      if (el.dataset.revField === "status" || el.dataset.revField === "confidence") renderIntakeReview();
    };
    el.addEventListener("change", apply);
    el.addEventListener("blur", apply);
  });
}

function bulkReviewStatus(status, msg) {
  const ids = state.intakeReviewSelected;
  if (!ids.length) {
    state.intakeReviewStatus = "Select rows first";
    renderIntakeReview();
    return;
  }
  state.intakeReviewRows.forEach((r) => {
    if (ids.includes(r.id)) r.status = status;
  });
  state.intakeReviewSelected = [];
  state.intakeReviewStatus = msg;
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
  state.intakeExportSummary = { exported: ready.length, held, reasons };
  state.intakeReviewStatus = `Exported ${ready.length}`;
  renderIntakeReview();
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
  };
  state.intakeReviewStatus = `Exported ${ready.length} eBay CSV`;
  renderIntakeReview();
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

function stageReviewToScouter() {
  const ready = state.intakeReviewRows.filter((r) => r.status !== "Rejected");
  if (!ready.length) {
    state.intakeReviewStatus = "No rows to stage";
    renderIntakeReview();
    return;
  }
  for (const r of ready) {
    state.items.unshift({
      id: r.id,
      title: r.card_name,
      barcode: null,
      quantity: r.quantity || 1,
      category: state.category,
      game: state.game,
      batchName: state.batchName || null,
      skuPrefix: state.skuPrefix || null,
      sku: r.sku || null,
      cardNumber: r.number || null,
      setName: r.set || null,
      variation: r.variation || null,
      condition: (r.condition || "NM").toLowerCase() === "nm" ? "nm" : (r.condition || "nm").toLowerCase(),
      language: r.language || "English",
      staged: true,
      listingStatus: "sorted",
      photos: r.photos || [],
      createdAt: new Date().toISOString(),
    });
  }
  saveItems();
  resetDraft();
  setIntakeMode("list");
  navigate("/inventory");
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
        state.flePickId = btn.dataset.fleCand;
        renderFleSheet();
      });
    });
  }
}

function applyFlePick() {
  const row = state.intakeReviewRows.find((r) => r.id === state.fleRowId);
  if (!row) return;
  const pick = (row.catalog_candidates || []).find((c) => c.id === state.flePickId);
  if (!pick) {
    state.intakeReviewStatus = "No candidate to apply";
    closeFleSheet();
    renderIntakeReview();
    return;
  }
  row.card_name = pick.name || row.card_name;
  row.number = pick.number || row.number;
  row.set = pick.set || row.set;
  row.set_code = pick.set_code || row.set_code;
  row.confidence = "High";
  row.status = "Approved";
  state.intakeReviewStatus = "Candidate applied → High";
  closeFleSheet();
  renderIntakeReview();
}

/** Live Ble verify actions from candidate sheet. */
function verifyFleRow(status) {
  const row = state.intakeReviewRows.find((r) => r.id === state.fleRowId);
  if (!row) return;
  row.status = status;
  if (status === "Approved" && row.confidence !== "High") {
    // Keep confidence; verify is status-only like live F()
  }
  state.intakeReviewStatus = status === "Approved" ? "Verified — approved" : "Sent to review";
  closeFleSheet();
  renderIntakeReview();
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
  if ($("unPhotoCount")) {
    const n = (it.photos || []).length;
    $("unPhotoCount").textContent = `${n} PHOTO${n === 1 ? "" : "S"}`;
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
      $("unShipSku").textContent = `SHIP · ${d.shipping_method || "Standard"} · SKU · ${d.sku || "—"}`;
    }
    if ($("unPriceBasis")) $("unPriceBasis").textContent = d.ai_price_basis ? `⊕ ${d.ai_price_basis}` : "";
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
  state.unStatus = "AI engine failed — check item data. Listing engine isn't connected on this device.";
  renderUnSheet();
}

function saveUnDraft() {
  const it = state.items.find((x) => x.id === state.unItemId);
  const d = state.unDraft;
  if (!it || !d) {
    state.unStatus = "Failed to save draft";
    renderUnSheet();
    return;
  }
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

function setIdentifyProgress(stage, done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  if ($("identifyStage")) $("identifyStage").textContent = `${String(stage || "IDENTIFYING").toUpperCase()}…`;
  if ($("identifyPct")) $("identifyPct").textContent = total ? `${done} / ${total}` : `${pct}%`;
  if ($("identifyBar")) $("identifyBar").style.width = `${pct}%`;
}

async function addFiles(fileList) {
  const isImage = window.ScouterImage?.isImageFile ?? ((f) => f.type?.startsWith("image/"));
  const incoming = [...(fileList || [])].filter(isImage).slice(0, 40 - state.draftPhotos.length);
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
    skuPrefix: (state.skuPrefix || "").trim().toUpperCase() || null,
    sku: state.barcode || null,
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
  state.skuPrefix = "ITM";
  state.intakeScans = [];
  state.intakeGroups = [];
  state.intakeThreshold = 5;
  state.groupSplitOpen = null;
  state.groupSplitPick = [];
  state.intakeReviewRows = [];
  state.intakeReviewFilter = "";
  state.intakeReviewSelected = [];
  state.intakeScanCount = 0;
  state.intakeReviewStatus = "";
  state.intakeExportSummary = null;
  if ($("manualTitle")) $("manualTitle").value = "";
  if ($("barcodeInput")) $("barcodeInput").value = "";
  if ($("batchName")) $("batchName").value = "";
  if ($("batchSkuPrefix")) {
    $("batchSkuPrefix").value = "";
    delete $("batchSkuPrefix").dataset.touched;
  }
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
  if ($("batchTitle")) $("batchTitle").textContent = state.batchName;
  if ($("batchSkuPrefix")) {
    $("batchSkuPrefix").value = "PKM";
    delete $("batchSkuPrefix").dataset.touched;
  }
  if ($("backsIncluded")) $("backsIncluded").checked = true;
  setBatchGame("PKM");
  setIntakeMode("batch");
  updateBatchScanChrome();
  setStatus("Drop a folder of scans · or click to browse");
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
    // Live Spaces map empty (root or nested): Empty location + bin/shelf/tote hint.
    if (label) label.textContent = "Empty location";
    if (p) p.textContent = "Add a bin, shelf or tote to start mapping your shelves.";
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

/** Live nle hub defs (a_): Active/On market · Ended/Off market. */
const CHANNEL_HUBS = [
  { key: "fresh", label: "Active", sub: "On market", core: "#2BD9C0", hi: "#8FF6E8" },
  { key: "ended", label: "Ended", sub: "Off market", core: "#8FA3AD", hi: "#FFFFFF" },
];

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
  return `<button type="button" class="b44-scout-tile-card b44-channel-tile" data-open-listing="${esc(it.id)}" style="--phase:${esc(core)};--phase-hi:${esc(hi)}">
    <div class="b44-scout-tile-img" style="box-shadow:inset 0 0 0 1px color-mix(in srgb, ${esc(core)} 40%, transparent)">${img}<span class="b44-scout-tile-badge" style="color:${esc(hi)}">${age}D</span></div>
    <div class="b44-scout-tile-title">${esc(it.title || "Untitled")}</div>
    <div class="b44-scout-tile-sub" style="color:${esc(hi)}">${esc(price)}</div>
  </button>`;
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
  const hub = channelHubKey(it);
  const ended = hub === "ended";
  const age = channelAgeDays(it);
  const hubLabel = ended ? "ENDED" : itemPipeLabel(it) === "Listed" ? "ACTIVE" : "BUILT";
  if ($("channelSheetEyebrow")) {
    $("channelSheetEyebrow").textContent = ended
      ? `${hubLabel} · OFF MARKET`
      : `${hubLabel} · ${age}D ON MARKET`;
  }
  const sku = it.barcode || it.sku || "NO SKU";
  if ($("channelSheetSku")) $("channelSheetSku").textContent = sku;
  if ($("channelSheetTitle")) $("channelSheetTitle").textContent = it.title || "Untitled";
  const price = Number(it.marketValue ?? it.price) || 0;
  if ($("channelSheetPrice")) $("channelSheetPrice").textContent = money(price);
  if ($("channelSheetStatus")) $("channelSheetStatus").textContent = state.channelSheetStatus || "";
  const ebayId = channelEbayId(it);
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
  $("btnChannelReprice")?.classList.toggle("hidden", ended);
  $("btnChannelEnd")?.classList.toggle("hidden", ended);
  $("btnChannelRelist")?.classList.toggle("hidden", !ended);
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
    openChannelSheet(it.id);
    setChannelRepriceOpen(true);
    return;
  }
  // Honest local port: update local value; live eBay reprice needs server creds.
  it.marketValue = next;
  it.price = next;
  it.updatedAt = new Date().toISOString();
  saveItems();
  state.channelSheetStatus =
    `Local price set to ${money(next)}. Live eBay reprice needs server credentials.`;
  setChannelRepriceOpen(false);
  openChannelSheet(it.id);
  renderChannel();
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
    it.listingStatus = "listed";
    it.channelStatus = "active";
    it.pushedAt = new Date().toISOString();
    it.updatedAt = new Date().toISOString();
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
    it.updatedAt = new Date().toISOString();
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

    // Live nle: Channel empty only when connected with no listings (or filter miss).
    // Offline + empty shows Connect alone — no empty panel.
    const showEmpty =
      state.channelTab === "live" &&
      connected &&
      (allHubItems.length === 0 || (q && pool.length === 0));
    if (empty) {
      empty.classList.toggle("hidden", !showEmpty);
      const label = empty.querySelector(".v-label");
      const p = empty.querySelector("p");
      if (label) label.textContent = "Channel empty";
      if (p) {
        p.textContent = q
          ? "No listings match this filter."
          : "Run a sync to pull your live listings.";
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
        row.addEventListener("click", () => openChannelSheet(row.dataset.openListing));
      });
    } else {
      list.innerHTML = "";
    }
  }
  if (state.channelSheetId) openChannelSheet(state.channelSheetId);
  else closeChannelSheet();

  // Fulfilment stage counters + grouped rows (live fle/ld)
  const ships = activeShipments();
  const counts = Object.fromEntries(SHIP_STAGES.map((s) => [s.key, 0]));
  for (const sh of ships) {
    if (counts[sh.status] != null) counts[sh.status] += 1;
  }
  if ($("fulReady")) $("fulReady").textContent = pad2(counts.ready_to_ship);
  if ($("fulDropped")) $("fulDropped").textContent = pad2(counts.dropped_off);
  if ($("fulTransit")) $("fulTransit").textContent = pad2(counts.in_transit);
  if ($("fulOut")) $("fulOut").textContent = pad2(counts.out_for_delivery);
  if ($("fulDelivered")) $("fulDelivered").textContent = pad2(counts.delivered);
  const awaiting = ships.filter((s) => s.status !== "delivered").length;
  if ($("fulPayout")) $("fulPayout").textContent = pad2(awaiting);

  const fulList = $("fulList");
  const fulEmpty = $("fulEmpty");
  if (fulList) {
    if (fulEmpty) {
      fulEmpty.classList.toggle("hidden", ships.length > 0);
      const p = fulEmpty.querySelector("p");
      if (p) {
        p.textContent =
          "Packages appear here once an order is created from Listings or eBay Sync.";
      }
    }
    const chunks = [];
    for (const stage of SHIP_STAGES) {
      const rows = ships.filter((sh) => sh.status === stage.key);
      if (!rows.length) continue;
      chunks.push(
        `<div class="v-label" style="font-size:9px;margin:12px 0 6px;color:var(--b44-gold,#ffb43d)">STEP ${stage.n} · ${esc(stage.label)} · ${pad2(rows.length)}</div>`,
      );
      for (const sh of rows) {
        const next = nextShipStage(sh.status);
        const price = Number(sh.salePrice ?? sh.sale_price);
        const priceBit = Number.isFinite(price) && price > 0 ? money(price) : "—";
        const carrier = carrierLabel(sh.carrier);
        let advance;
        if (sh.status === "delivered") {
          const payout = sh.payoutReleaseAt || sh.payout_release_date
            ? new Date(sh.payoutReleaseAt || sh.payout_release_date).toLocaleDateString("en-US", {
                month: "short",
                day: "2-digit",
              })
            : "—";
          advance = `<span class="v-label">PAYOUT EST. ${esc(payout)}</span>`;
        } else if (next) {
          // Live fle advance control labels the next stage only (not "Advance to …").
          advance = `<button type="button" class="m-btn m-btn-primary" data-advance-ship="${esc(sh.id)}">${esc(shipStageLabel(next))}</button>`;
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
  if ($("shipPackageType")) $("shipPackageType").value = "bubble_mailer";
  if ($("shipWeight")) $("shipWeight").value = "0";
  if ($("shipLength")) $("shipLength").value = "0";
  if ($("shipWidth")) $("shipWidth").value = "0";
  if ($("shipHeight")) $("shipHeight").value = "0";
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
  const pkg = packageTypeLabel(s.package_type || s.packageType || "bubble_mailer");
  const dims =
    s.length || s.width || s.height
      ? `${s.length || 0}×${s.width || 0}×${s.height || 0}in`
      : "";
  if (state.editingShipId === s.id) {
    const pkgOpts = PACKAGE_TYPES.map(
      (p) =>
        `<option value="${esc(p.value)}" ${(s.package_type || s.packageType || "bubble_mailer") === p.value ? "selected" : ""}>${esc(p.label)}</option>`,
    ).join("");
    return `<div class="v-panel v-cut-sm p-4" data-edit-ship="${esc(s.id)}">
      <label class="v-label" style="display:block;margin-bottom:6px;font-size:9px">Name</label>
      <input class="b44-input" data-edit-ship-name value="${esc(s.name)}" />
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">
        <div><label class="v-label" style="display:block;margin-bottom:6px;font-size:9px">Package type</label>
        <select class="b44-input" data-edit-ship-package>${pkgOpts}</select></div>
        <div><label class="v-label" style="display:block;margin-bottom:6px;font-size:9px">Weight (oz)</label>
        <input class="b44-input" type="number" step="0.1" data-edit-ship-weight value="${esc(String(s.weight ?? 0))}" /></div>
        <div><label class="v-label" style="display:block;margin-bottom:6px;font-size:9px">Length (in)</label>
        <input class="b44-input" type="number" step="0.1" data-edit-ship-length value="${esc(String(s.length ?? 0))}" /></div>
        <div><label class="v-label" style="display:block;margin-bottom:6px;font-size:9px">Width (in)</label>
        <input class="b44-input" type="number" step="0.1" data-edit-ship-width value="${esc(String(s.width ?? 0))}" /></div>
        <div><label class="v-label" style="display:block;margin-bottom:6px;font-size:9px">Height (in)</label>
        <input class="b44-input" type="number" step="0.1" data-edit-ship-height value="${esc(String(s.height ?? 0))}" /></div>
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
  const weight = s.weight ? ` · ${s.weight}oz` : "";
  const dimBit = dims ? ` · ${dims}` : "";
  return `<div class="v-panel v-cut-sm p-4">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">${chip || "<span></span>"}
      <button type="button" class="m-btn" data-del-ship="${esc(s.id)}" title="Delete">×</button>
    </div>
    <div class="v-readout v-emit-white" style="font-size:15px;margin-top:8px">${esc(s.name)}</div>
    <div class="b44-copy-soft" style="margin-top:6px;font-size:13px">${esc(pkg)}${esc(weight)}${esc(dimBit)}</div>
    <div class="b44-copy-soft" style="margin-top:4px;font-size:12px">${esc(s.carrier || "—")}${esc(service)} · $${esc(String(s.cost ?? 0))}${esc(handle)}</div>
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
        const package_type = card.querySelector("[data-edit-ship-package]")?.value || "bubble_mailer";
        const weight = Number(card.querySelector("[data-edit-ship-weight]")?.value || 0);
        const length = Number(card.querySelector("[data-edit-ship-length]")?.value || 0);
        const width = Number(card.querySelector("[data-edit-ship-width]")?.value || 0);
        const height = Number(card.querySelector("[data-edit-ship-height]")?.value || 0);
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
                package_type,
                weight,
                length,
                width,
                height,
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
          const codeChip = code
            ? `<div class="v-label" style="display:inline-block;margin-top:6px;padding:2px 8px;border:1px solid rgba(255,255,255,0.12);font-size:11px">${esc(code)}</div>`
            : "";
          const descBit = desc
            ? `<p class="b44-copy-soft" style="margin-top:8px;font-size:13px;line-height:1.4">${esc(desc)}</p>`
            : "";
          return `<div class="v-panel v-cut-sm p-4">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div class="v-label" style="font-size:9px">LOCATION</div>
              <button type="button" class="m-btn" data-del-storage-def="${esc(d.id)}" title="Delete">×</button>
            </div>
            <div class="v-readout v-emit-white" style="font-size:15px;margin-top:8px">${esc(d.name)}</div>
            ${codeChip}
            ${descBit}
            <div class="b44-copy-soft" style="margin-top:12px;font-size:13px">${pad2(count)} items</div>
          </div>`;
        })
        .join("");
      dRoot.style.display = "grid";
      dRoot.style.gridTemplateColumns = "repeat(auto-fill,minmax(220px,1fr))";
      dRoot.style.gap = "12px";
    }
    if (dEmpty) {
      dEmpty.classList.toggle("hidden", state.storageDefs.length > 0);
      dEmpty.textContent =
        "No storage locations yet. Add warehouses, shelves, or totes to organize inventory.";
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
  if (!title) {
    setScouterStatus("Title is required.");
    return false;
  }
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
  renderCollection();
  renderIntakeList();
  updateSitrep();
  return true;
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
    }
  });

  $("btnScoutSpaces")?.addEventListener("click", () => setScouterMode("spaces"));
  $("btnScouterExport")?.addEventListener("click", () => exportScouterCsv());
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
  $("btnFleApply")?.addEventListener("click", () => applyFlePick());
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
      if (!$("fleSheet")?.classList.contains("hidden")) closeFleSheet();
      else if (!$("unSheet")?.classList.contains("hidden")) closeUnSheet();
      else if (!$("assetSheet")?.classList.contains("hidden")) closeAssetSheet();
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
  $("btnStartIntake")?.addEventListener("click", () => startIntakeToGrouping());
  $("btnGroupNewBatch")?.addEventListener("click", () => openNewBatch());
  $("btnGroupIdentify")?.addEventListener("click", () => startIdentificationFromGroups());
  $("btnSwapFrontBack")?.addEventListener("click", () => swapFrontBack());
  $("btnReviewNewBatch")?.addEventListener("click", () => openNewBatch());
  $("btnReviewStage")?.addEventListener("click", () => stageReviewToScouter());
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
    state.intakeReviewStatus =
      "Fetch prices needs live scanFetchPrices — not wired on this device. Internet-sourced prices are estimates, not verified sold comps.";
    renderIntakeReview();
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
    if ($("batchSkuPrefix")) {
      $("batchSkuPrefix").value = state.skuPrefix;
      $("batchSkuPrefix").dataset.touched = "1";
    }
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
    updateBatchScanChrome();
  });

  $("batchGameChips")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-game]");
    if (!btn) return;
    setBatchGame(btn.dataset.game);
  });
  $("batchSkuPrefix")?.addEventListener("input", (e) => {
    e.target.dataset.touched = "1";
    state.skuPrefix = e.target.value.trim().toUpperCase();
  });

  $("intakeFilter")?.addEventListener("input", (e) => {
    state.filterIntake = e.target.value;
    renderIntakeList();
  });
  $("btnIntakePickClose")?.addEventListener("click", () => closeIntakePick());
  $("btnIntakeBuildListing")?.addEventListener("click", () => buildIntakeListing());
  $("btnIntakeOpenCard")?.addEventListener("click", () => openIntakeCard());
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
    if ($("shipPackageType")) $("shipPackageType").value = "bubble_mailer";
    if ($("shipWeight")) $("shipWeight").value = "0";
    if ($("shipLength")) $("shipLength").value = "0";
    if ($("shipWidth")) $("shipWidth").value = "0";
    if ($("shipHeight")) $("shipHeight").value = "0";
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
    const package_type = $("shipPackageType")?.value || "bubble_mailer";
    const weight = Number($("shipWeight")?.value || 0);
    const length = Number($("shipLength")?.value || 0);
    const width = Number($("shipWidth")?.value || 0);
    const height = Number($("shipHeight")?.value || 0);
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
      package_type,
      weight,
      length,
      width,
      height,
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
