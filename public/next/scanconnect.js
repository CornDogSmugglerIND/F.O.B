/* Connect scanner: F.O.B <-> the F.O.B Scan desktop app (desktop/mac).
   Scouter's Photo inbox shows a scanner strip: Connect (download + 6-digit code), then Scan.
   Pages go scanner -> F.O.B Scan -> server -> this inbox, live while the scanner runs. */
import { pullScans } from "./scanlink.js?v=2";

const DUPLEX_KEY = "fob-scan-duplex";
const DL_MAC = "/api/scanner/download/mac";
let devs = null, last = 0, timer = null, watching = false, api = null;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const duplex = () => { try { return localStorage.getItem(DUPLEX_KEY) === "1"; } catch { return false; } };

async function load(force) {
  if (!force && devs && Date.now() - last < 4000) return devs;
  try { const r = await fetch("/api/scanner/devices", { cache: "no-store" }); const d = await r.json(); devs = d.ok ? d.devices : (devs || []); }
  catch { devs = devs || []; }
  last = Date.now(); return devs;
}
const best = () => (devs || []).find((d) => d.online && d.scanners?.length) || (devs || []).find((d) => d.online) || (devs || [])[0];

function stripHtml() {
  const d = best();
  if (!devs) return `<div class="ss"><span class="ss-dot"></span><b>Scanner</b><small>Checking…</small></div>`;
  if (!d) return `<div class="ss"><span class="ss-dot"></span><b>No scanner connected</b><small>Scan cards straight into this inbox</small><button type="button" class="sc-qa go" data-ss="connect">Connect scanner</button></div>`;
  const sc = d.scanners?.[0], st = d.state || {}, scanning = d.online && st.status === "scanning";
  const where = !d.online ? `${esc(d.name)} is offline. Open F.O.B Scan on it.` : !sc ? `F.O.B Scan is running on ${esc(d.name)}, but no scanner is on. Turn it on.` : `${esc(sc.name)} · ${esc(sc.via)} · ${esc(d.name)}`;
  const cls = !d.online ? "off" : !sc ? "warn" : scanning ? "busy" : "on";
  return `<div class="ss ${cls}"><span class="ss-dot"></span><div class="ss-t"><b>${scanning ? `Scanning… ${st.sent || 0} in` : !d.online || !sc ? "Scanner not ready" : "Scanner ready"}</b><small>${where}</small>${st.message && d.online && !scanning && /fail|Couldn|Load cards|No scanner|didn't/.test(st.message) ? `<small class="ss-err">${esc(st.message)}</small>` : ""}</div>
    ${d.online && sc && !scanning ? `<div class="ss-per" role="radiogroup" aria-label="Sides">${[[0, "Fronts"], [1, "Front + back"]].map(([v, l]) => `<button type="button" role="radio" class="bt-pb${+duplex() === v ? " on" : ""}" data-ssd="${v}" aria-checked="${+duplex() === v}">${l}</button>`).join("")}</div><button type="button" class="sc-qa go ss-go" data-ss="scan">Scan</button>` : ""}
    ${scanning ? `<button type="button" class="sc-qa" data-ss="stop">Stop</button>` : ""}
    <button type="button" class="ss-more" data-ss="manage" aria-label="Scanner settings">⋯</button></div>`;
}

export async function paintScanBar(el, a) {
  api = a || api; if (!el) return;
  el.innerHTML = stripHtml(); wire(el);
  await load(); if (el.isConnected) { el.innerHTML = stripHtml(); wire(el); }
  watch();
}
function repaint() { document.querySelectorAll("#scScan").forEach((el) => { el.innerHTML = stripHtml(); wire(el); }); }

/* keep the strip live while it's on screen; faster while scanning, and pull scans in as they land */
function watch() {
  if (watching) return; watching = true;
  const tick = async () => {
    const el = document.querySelector("#scScan");
    if (!el) { watching = false; return; }
    if (!document.hidden) {
      const wasScanning = best()?.state?.status === "scanning";
      await load(true); repaint();
      const nowScanning = best()?.state?.status === "scanning";
      if (nowScanning || wasScanning) await pullScans({ toast: nowScanning ? null : api?.toast });
    }
    timer = setTimeout(tick, best()?.state?.status === "scanning" ? 3000 : 15000);
  };
  clearTimeout(timer); timer = setTimeout(tick, 3000);
}

function wire(el) {
  el.querySelectorAll("[data-ssd]").forEach((b) => b.addEventListener("click", () => { try { localStorage.setItem(DUPLEX_KEY, b.dataset.ssd); localStorage.setItem("fob-batch-per", b.dataset.ssd === "1" ? "2" : "1"); } catch { /* ignore */ } repaint(); }));
  el.querySelector('[data-ss="connect"]')?.addEventListener("click", connectSheet);
  el.querySelector('[data-ss="manage"]')?.addEventListener("click", manageSheet);
  el.querySelector('[data-ss="scan"]')?.addEventListener("click", async (e) => {
    const b = e.currentTarget, d = best(); b.disabled = true; b.textContent = "Starting…";
    try { localStorage.setItem("fob-batch-per", duplex() ? "2" : "1"); } catch { /* ignore */ }
    const r = await fetch("/api/scanner/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device: d.id, duplex: duplex() }) }).then((x) => x.json()).catch(() => ({ ok: false, error: "No connection." }));
    if (!r.ok) { api?.toast?.(r.error || "Couldn't start the scanner."); repaint(); return; }
    api?.toast?.("Scanner starting. Cards drop into the inbox as they scan.");
    d.state = { ...(d.state || {}), status: "scanning", sent: 0 }; repaint(); clearTimeout(timer); watching = false; watch();
  });
  el.querySelector('[data-ss="stop"]')?.addEventListener("click", () => fetch("/api/scanner/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device: best()?.id }) }));
}

async function connectSheet() {
  const f = window.__fob, before = new Set((devs || []).map((d) => d.id));
  const s = f.openSheet(`<div class="ssx"><h2>Connect your scanner</h2>
    <ol class="ssx-steps">
      <li><b>Get F.O.B Scan</b> on the computer your scanner plugs into.<div class="ssx-dl"><a class="btn go" href="${DL_MAC}" download>Download for Mac</a><span class="ssx-soon">Windows: coming soon</span></div><small>Open the zip, drag <b>F.O.B Scan</b> to Applications, open it.</small></li>
      <li><b>Type this code</b> into F.O.B Scan:<div class="ssx-code" id="ssxCode">······</div><small id="ssxExp">Getting a code…</small></li>
      <li><b>Done.</b> <span id="ssxWait">This page updates by itself when it connects.</span></li>
    </ol>
    <div class="co-znav bl-act"><button type="button" class="btn" data-close>Close</button></div></div>`);
  const r = await fetch("/api/scanner/pair", { method: "POST" }).then((x) => x.json()).catch(() => ({ ok: false }));
  if (!r.ok) { s.querySelector("#ssxExp").textContent = r.error || "Couldn't get a code. Try again."; return; }
  s.querySelector("#ssxCode").textContent = `${r.code.slice(0, 3)} ${r.code.slice(3)}`;
  s.querySelector("#ssxExp").textContent = "Good for 10 minutes.";
  const poll = async () => {
    if (!s.isConnected) return;
    await load(true); const fresh = (devs || []).find((d) => !before.has(d.id));
    if (fresh) {
      s.querySelector("#ssxWait").innerHTML = `✅ Connected to <b>${esc(fresh.name)}</b>${fresh.scanners?.[0] ? ` with <b>${esc(fresh.scanners[0].name)}</b>` : ""}. Load cards and press Scan.`;
      s.querySelector("#ssxCode").classList.add("ok"); repaint(); setTimeout(() => s.isConnected && f.closeSheet(), 2500); return;
    }
    setTimeout(poll, 2500);
  };
  setTimeout(poll, 2500);
}

async function manageSheet() {
  const f = window.__fob; await load(true);
  const s = f.openSheet(`<div class="ssx"><h2>Scanner computers</h2>
    ${(devs || []).length ? (devs || []).map((d) => `<div class="ssx-dev"><span class="ss-dot ${d.online ? "on" : "off"}"></span><div><b>${esc(d.name)}</b><small>${d.online ? (d.scanners || []).map((x) => `${esc(x.name)} (${esc(x.via)})`).join(", ") || "No scanner on" : "Offline"}</small></div><button type="button" class="btn" data-forget="${esc(d.id)}">Remove</button></div>`).join("") : `<p class="sub">None yet.</p>`}
    <div class="co-znav bl-act"><button type="button" class="btn" data-close>Close</button><button type="button" class="btn go" id="ssxAdd">Connect another</button></div></div>`);
  s.querySelectorAll("[data-forget]").forEach((b) => b.addEventListener("click", async () => { await fetch("/api/scanner/forget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device: b.dataset.forget }) }); await load(true); repaint(); f.closeSheet(); }));
  s.querySelector("#ssxAdd").addEventListener("click", () => { f.closeSheet(); setTimeout(connectSheet, 200); });
}
