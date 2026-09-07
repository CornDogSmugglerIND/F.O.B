(() => {
  const LS_KEY = "scouter-items-v1";
  const CHECK_KEY = "coalition-hud-checks-v1";
  const MAX_PHOTOS = 8;

  const CATEGORIES = [
    { value: "pokemon_sealed", label: "Pokemon Sealed" },
    { value: "graded_slabs", label: "Graded Slabs" },
    { value: "raw_cards", label: "Raw Cards" },
    { value: "sports_cards", label: "Sports Cards" },
    { value: "other", label: "Other" },
  ];

  const FEATURE_CHECKS = [
    { id: "nav_tabs", label: "Bottom tabs switch and never trap you" },
    { id: "camera_multi", label: "Camera can add more than one photo" },
    { id: "gallery_multi", label: "Gallery can add multiple photos" },
    { id: "remove_photo", label: "Can remove a photo before save" },
    { id: "save_rail", label: "Save to rail stores the item" },
    { id: "rail_browse", label: "Rail shows saved items" },
    { id: "rail_delete", label: "Can delete an item from rail" },
    { id: "export", label: "Export backup downloads JSON" },
    { id: "listing_copy", label: "Listing copy page opens" },
    { id: "listing_draft", label: "Listing draft builds from rail item" },
  ];

  const TITLES = {
    home: "H.U.D",
    scan: "Scan",
    rail: "Rail",
    list: "List",
    more: "More",
  };

  const state = {
    panel: "home",
    photos: [],
    qty: 1,
    category: "other",
    checks: loadChecks(),
  };

  const $ = (id) => document.getElementById(id);
  const toastEl = $("toast");

  function toast(msg, type = "ok") {
    toastEl.textContent = msg;
    toastEl.className = `toast show ${type}`;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove("show"), 2800);
  }

  function loadItems() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveItems(items) {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  }

  function loadChecks() {
    try {
      return JSON.parse(localStorage.getItem(CHECK_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveChecks() {
    localStorage.setItem(CHECK_KEY, JSON.stringify(state.checks));
  }

  function uid() {
    return `hud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function go(panel) {
    state.panel = panel;
    document.querySelectorAll(".hud-panel").forEach((el) => {
      el.classList.toggle("active", el.dataset.panel === panel);
    });
    document.querySelectorAll(".hud-tab").forEach((el) => {
      el.classList.toggle("active", el.dataset.go === panel);
    });
    $("hudTitle").textContent = TITLES[panel] || "H.U.D";
    history.replaceState(null, "", `#${panel}`);
    if (panel === "home") renderHome();
    if (panel === "rail") renderRail();
    if (panel === "list") renderList();
    if (panel === "more") renderMore();
    window.scrollTo(0, 0);
  }

  function renderHome() {
    const items = loadItems();
    const photos = items.reduce((n, it) => n + (it.photos?.length || 0), 0);
    const ok = FEATURE_CHECKS.filter((c) => state.checks[c.id] === "ok").length;
    $("statItems").textContent = String(items.length).padStart(2, "0");
    $("statPhotos").textContent = String(photos).padStart(2, "0");
    $("statReady").textContent = String(ok).padStart(2, "0");
    $("homeChecks").innerHTML = FEATURE_CHECKS.map((c) => {
      const v = state.checks[c.id] || "todo";
      const mark = v === "ok" ? "OK" : v === "bad" ? "NO" : "··";
      return `<li class="${v}"><span class="mark">${mark}</span><span>${c.label}</span></li>`;
    }).join("");
  }

  function renderCats() {
    $("scanCats").innerHTML = CATEGORIES.map(
      (c) =>
        `<button type="button" class="chip${state.category === c.value ? " on" : ""}" data-cat="${c.value}">${c.label}</button>`,
    ).join("");
  }

  function renderPhotos() {
    $("scanPhotoCount").textContent = `${state.photos.length} / ${MAX_PHOTOS}`;
    $("scanPhotoGrid").innerHTML = state.photos
      .map(
        (p, i) => `
      <div class="photo-thumb">
        <img src="${p.dataUrl}" alt="" />
        <button type="button" data-rm="${i}" aria-label="Remove">×</button>
      </div>`,
      )
      .join("");
  }

  async function addFiles(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    const room = MAX_PHOTOS - state.photos.length;
    if (room <= 0) {
      toast("Photo limit reached", "err");
      return;
    }
    const slice = files.slice(0, room);
    $("scanStatus").textContent = "Compressing photos…";
    $("scanStatus").className = "status-strip busy";
    try {
      const compressed = window.ScouterImage
        ? await window.ScouterImage.compressPhotos(slice)
        : slice;
      for (const file of compressed) {
        const dataUrl = window.ScouterImage
          ? await window.ScouterImage.fileToDataUrl(file)
          : await readAsDataUrl(file);
        state.photos.push({ id: uid(), dataUrl, name: file.name });
      }
      renderPhotos();
      $("scanStatus").textContent = `${state.photos.length} photo(s) ready`;
      $("scanStatus").className = "status-strip ok";
      toast(`Added ${slice.length} photo(s)`);
    } catch (e) {
      $("scanStatus").textContent = e.message || "Photo failed";
      $("scanStatus").className = "status-strip err";
      toast(e.message || "Photo failed", "err");
    }
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error("Could not read photo"));
      r.readAsDataURL(file);
    });
  }

  async function lookupBarcode() {
    const code = $("scanBarcode").value.trim();
    if (!code) {
      toast("Enter a barcode", "err");
      return;
    }
    $("scanStatus").textContent = "Looking up…";
    $("scanStatus").className = "status-strip busy";
    try {
      const res = await fetch(`/api/scouter/barcode/${encodeURIComponent(code)}`);
      const data = await res.json();
      if (data?.title && !$("scanTitle").value.trim()) {
        $("scanTitle").value = data.title;
      }
      $("scanStatus").textContent = data?.title ? `Found: ${data.title}` : "No catalog hit — title manually";
      $("scanStatus").className = "status-strip ok";
    } catch {
      $("scanStatus").textContent = "Lookup offline — keep going";
      $("scanStatus").className = "status-strip";
    }
  }

  function saveScan() {
    if (!state.photos.length) {
      toast("Add at least one photo", "err");
      return;
    }
    const title = $("scanTitle").value.trim() || "Untitled intake";
    const item = {
      id: uid(),
      title,
      barcode: $("scanBarcode").value.trim() || null,
      qty: state.qty,
      category: state.category,
      notes: $("scanNotes").value.trim() || null,
      photos: state.photos.map((p) => ({ dataUrl: p.dataUrl, name: p.name })),
      createdAt: new Date().toISOString(),
      source: "coalition-hud",
    };
    const items = loadItems();
    items.unshift(item);
    saveItems(items);
    state.photos = [];
    state.qty = 1;
    $("scanTitle").value = "";
    $("scanBarcode").value = "";
    $("scanNotes").value = "";
    $("scanQty").textContent = "1";
    renderPhotos();
    toast("Saved to rail");
    go("rail");
  }

  function renderRail() {
    const q = ($("railSearch").value || "").trim().toLowerCase();
    let items = loadItems();
    if (q) {
      items = items.filter((it) =>
        [it.title, it.barcode, it.notes, it.category].join(" ").toLowerCase().includes(q),
      );
    }
    if (!items.length) {
      $("railRoot").innerHTML = `<div class="empty">Rail is empty. Scan something in.</div>`;
      return;
    }
    $("railRoot").innerHTML = items
      .map((it) => {
        const src = it.photos?.[0]?.dataUrl || "";
        return `
        <div class="v-panel v-cut-sm rail-item" data-id="${it.id}">
          ${src ? `<img src="${src}" alt="" />` : `<div style="width:64px;height:64px;background:#111;border-radius:8px"></div>`}
          <div>
            <div class="t">${escapeHtml(it.title || "Untitled")}</div>
            <div class="s">qty ${it.qty || 1} · ${escapeHtml(it.category || "other")}${it.barcode ? ` · ${escapeHtml(it.barcode)}` : ""}</div>
          </div>
          <button type="button" class="m-btn" data-del="${it.id}">Del</button>
        </div>`;
      })
      .join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function exportBackup() {
    const payload = {
      app: "coalition-hud",
      version: 1,
      exportedAt: new Date().toISOString(),
      items: loadItems(),
      checks: state.checks,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coalition-hud-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Backup exported");
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        const incoming = Array.isArray(parsed) ? parsed : parsed.items;
        if (!Array.isArray(incoming)) throw new Error("Bad backup file");
        const map = new Map(loadItems().map((it) => [it.id, it]));
        let added = 0;
        for (const it of incoming) {
          if (it?.id && !map.has(it.id)) {
            map.set(it.id, it);
            added += 1;
          }
        }
        saveItems([...map.values()]);
        renderRail();
        renderHome();
        toast(`Imported ${added} new`);
      } catch (e) {
        toast(e.message || "Import failed", "err");
      }
    };
    reader.readAsText(file);
  }

  function renderList() {
    const items = loadItems();
    $("listPick").innerHTML =
      `<option value="">Pick an intake item…</option>` +
      items
        .map((it) => `<option value="${it.id}">${escapeHtml(it.title || "Untitled")}</option>`)
        .join("");
    $("listChecks").innerHTML = [
      { id: "listing_copy", label: "Listing copy page" },
      { id: "listing_draft", label: "Draft from rail" },
      { id: "ebay_engine", label: "Full eBay engine (coming)" },
      { id: "triple_threat", label: "Triple Threat hooks (coming)" },
    ]
      .map((c) => {
        const v = c.id.startsWith("ebay") || c.id.startsWith("triple") ? "todo" : state.checks[c.id] || "todo";
        const mark = v === "ok" ? "OK" : "··";
        return `<li class="${v}"><span class="mark">${mark}</span><span>${c.label}</span></li>`;
      })
      .join("");
  }

  function buildDraft() {
    const id = $("listPick").value;
    const item = loadItems().find((it) => it.id === id);
    if (!item) {
      toast("Pick an item first", "err");
      return;
    }
    const title = [item.title, item.qty > 1 ? `x${item.qty}` : "", item.barcode ? `#${item.barcode}` : ""]
      .filter(Boolean)
      .join(" ")
      .trim();
    const body = [
      item.title || "Item",
      item.notes ? `Notes: ${item.notes}` : null,
      item.category ? `Category: ${item.category}` : null,
      "Ships from Menomonie WI",
      "See photos for condition.",
    ]
      .filter(Boolean)
      .join("\n");
    $("listDraftOut").textContent = `TITLE\n${title}\n\nDESCRIPTION\n${body}`;
    state.checks.listing_draft = "ok";
    saveChecks();
    toast("Draft ready");
  }

  function renderMore() {
    $("moreChecks").innerHTML = FEATURE_CHECKS.map((c) => {
      const v = state.checks[c.id] || "todo";
      const mark = v === "ok" ? "OK" : v === "bad" ? "NO" : "TAP";
      return `<li class="${v}" data-check="${c.id}"><span class="mark">${mark}</span><span>${c.label}</span></li>`;
    }).join("");
  }

  function cycleCheck(id) {
    const cur = state.checks[id] || "todo";
    state.checks[id] = cur === "todo" ? "ok" : cur === "ok" ? "bad" : "todo";
    saveChecks();
    renderMore();
    renderHome();
  }

  function bind() {
    document.querySelectorAll("[data-go]").forEach((el) => {
      el.addEventListener("click", () => go(el.dataset.go));
    });

    $("scanCamera").addEventListener("click", () => $("scanCamInput").click());
    $("scanGallery").addEventListener("click", () => $("scanGalInput").click());
    $("scanCamInput").addEventListener("change", (e) => {
      addFiles(e.target.files);
      e.target.value = "";
    });
    $("scanGalInput").addEventListener("change", (e) => {
      addFiles(e.target.files);
      e.target.value = "";
    });
    $("scanPhotoGrid").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-rm]");
      if (!btn) return;
      state.photos.splice(Number(btn.dataset.rm), 1);
      renderPhotos();
    });
    $("scanQtyMinus").addEventListener("click", () => {
      state.qty = Math.max(1, state.qty - 1);
      $("scanQty").textContent = String(state.qty);
    });
    $("scanQtyPlus").addEventListener("click", () => {
      state.qty += 1;
      $("scanQty").textContent = String(state.qty);
    });
    $("scanCats").addEventListener("click", (e) => {
      const chip = e.target.closest("[data-cat]");
      if (!chip) return;
      state.category = chip.dataset.cat;
      renderCats();
    });
    $("scanLookup").addEventListener("click", lookupBarcode);
    $("scanSave").addEventListener("click", saveScan);

    $("railSearch").addEventListener("input", renderRail);
    $("railExport").addEventListener("click", exportBackup);
    $("railImport").addEventListener("click", () => $("railImportFile").click());
    $("railImportFile").addEventListener("change", (e) => {
      if (e.target.files?.[0]) importBackup(e.target.files[0]);
      e.target.value = "";
    });
    $("railRoot").addEventListener("click", (e) => {
      const del = e.target.closest("[data-del]");
      if (!del) return;
      const next = loadItems().filter((it) => it.id !== del.dataset.del);
      saveItems(next);
      renderRail();
      renderHome();
      toast("Deleted");
    });

    $("listDraft").addEventListener("click", buildDraft);
    $("listCopyDraft").addEventListener("click", async () => {
      const text = $("listDraftOut").textContent || "";
      try {
        await navigator.clipboard.writeText(text);
        toast("Draft copied");
      } catch {
        prompt("Copy draft:", text);
      }
    });

    $("moreChecks").addEventListener("click", (e) => {
      const row = e.target.closest("[data-check]");
      if (!row) return;
      cycleCheck(row.dataset.check);
    });
    $("moreExport").addEventListener("click", exportBackup);
    $("moreClear").addEventListener("click", () => {
      if (!confirm("Clear all local rail items?")) return;
      saveItems([]);
      renderHome();
      toast("Rail cleared");
    });
  }

  function boot() {
    renderCats();
    renderPhotos();
    bind();
    const hash = (location.hash || "#home").replace("#", "");
    go(TITLES[hash] ? hash : "home");
  }

  boot();
})();
