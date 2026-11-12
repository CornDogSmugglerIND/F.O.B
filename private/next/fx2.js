/* F.O.B effects 2 (Nov 11): the store's tactile layer, in the app.
   - item photo in any sheet: drag/hover to tilt with real glare, press and hold to magnify, Flip when there's a back photo
   - phones: cards glint as they cross the middle of the screen (no hover on a phone)
   - every list deals its cards in when a tab opens
   - slabs (PSA/BGS/CGC/SGC) get an acrylic case sheen */
(function () {
  if (window.__fobFX === false) return;
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var coarse = matchMedia("(pointer:coarse)").matches;
  var SLAB = /\b(psa|bgs|cgc|sgc|beckett|tag)\s*\d/i;
  var big = function (u) { return u ? String(u).replace(/s-l\d+\./, "s-l1600.") : u; };
  function items() { try { return JSON.parse(localStorage.getItem("coalition-items-v4") || "[]"); } catch (e) { return []; } }
  function photosFor(src) {
    if (!src) return [];
    var list = items();
    for (var i = 0; i < list.length; i++) { var ph = list[i].photos || []; for (var k = 0; k < ph.length; k++) { var u = ph[k].dataUrl || ph[k].url; if (u && (u === src || (src.length > 60 && u.slice(-60) === src.slice(-60)))) return { it: list[i], urls: ph.map(function (p) { return p.dataUrl || p.url; }).filter(Boolean), at: k }; } }
    return [];
  }

  /* ---------- 1. the photo in your hand ---------- */
  var lp = document.createElement("div"); lp.className = "fx2-loupe"; lp.setAttribute("aria-hidden", "true");
  function enhance(core) {
    if (core.__fx2) return; var img = $("img", core); if (!img) return; core.__fx2 = 1;
    var focus = core.classList.contains("fc-zoom"); /* the focus card already tilts with the mouse, zooms on click and has thumbnails */
    core.classList.add("fx2-hold");
    if (!focus) { var shine = document.createElement("span"); shine.className = "fx2-shine"; core.appendChild(shine); }
    var info = photosFor(img.getAttribute("src")), back = null, flipped = false;
    var title = (core.closest(".sheet,ion-modal,.sheet-in,[role=dialog]") || document).querySelector("h2");
    if (title && SLAB.test(title.textContent)) core.classList.add("fx2-slab");
    if (!focus && info.urls && info.urls.length > 1) {
      var bsrc = info.urls[(info.at + 1) % info.urls.length];
      back = document.createElement("img"); back.className = "fx2-back"; back.alt = "Back"; back.src = bsrc; back.draggable = false; core.appendChild(back);
      img.classList.add("fx2-front");
      var fb = document.createElement("button"); fb.type = "button"; fb.className = "fx2-flip"; fb.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/></svg><span>Flip</span>';
      core.parentElement.appendChild(fb);
      fb.addEventListener("click", function (e) { e.stopPropagation(); flipped = !flipped; core.classList.add("fx2-flipping"); setTimeout(function () { core.classList.remove("fx2-flipping"); }, 720); core.classList.toggle("fx2-flipped", flipped); fb.querySelector("span").textContent = flipped ? "Front" : "Flip"; paint(); });
    }
    var rx = 0, ry = 0, trx = 0, tryy = 0, gx = 50, gy = 30, raf = 0, active = false, loupe = false, holdT = 0, sx = 0, sy = 0, moved = false;
    function paint() { if (!raf) raf = requestAnimationFrame(loop); }
    function loop() { raf = 0; rx += (trx - rx) * .18; ry += (tryy - ry) * .18;
      if (!focus || active || rx || ry) core.style.transform = Math.abs(rx) + Math.abs(ry) < .05 && !flipped ? "" : "perspective(1000px) rotateY(" + ((flipped ? 180 : 0) + ry) + "deg) rotateX(" + rx + "deg)";
      core.style.setProperty("--gx", gx + "%"); core.style.setProperty("--gy", gy + "%"); core.style.setProperty("--fxt", Math.min(1, (Math.abs(rx) + Math.abs(ry)) / 14).toFixed(3));
      if (Math.abs(trx - rx) > .05 || Math.abs(tryy - ry) > .05) raf = requestAnimationFrame(loop); }
    function aim(x, y) { var r = core.getBoundingClientRect(), px = (x - r.left) / r.width, py = (y - r.top) / r.height; tryy = (px - .5) * 24; trx = (.5 - py) * 20; gx = px * 100; gy = py * 100; paint(); }
    function rest() { trx = 0; tryy = 0; gx = 50; gy = 30; paint(); }
    function fit(im) { var r = im.getBoundingClientRect(), nw = im.naturalWidth || 1, nh = im.naturalHeight || 1, s = Math.min(r.width / nw, r.height / nh), w = nw * s, h = nh * s; return { l: r.left + (r.width - w) / 2, t: r.top + (r.height - h) / 2, w: w, h: h }; }
    function showL(x, y) { var im = flipped && back ? back : img, f = fit(im), Z = 2.6, S = lp.offsetWidth || 150, px = Math.max(0, Math.min(1, (x - f.l) / f.w)), py = Math.max(0, Math.min(1, (y - f.t) / f.h));
      lp.style.backgroundImage = 'url("' + big(im.currentSrc || im.src) + '")'; lp.style.backgroundSize = f.w * Z + "px " + f.h * Z + "px";
      lp.style.backgroundPosition = -(px * f.w * Z - S / 2) + "px " + -(py * f.h * Z - S / 2) + "px";
      lp.style.transform = "translate(" + (x - S / 2) + "px," + (y - S / 2 - (coarse ? S * .85 : 0)) + "px)"; }
    function startL(x, y) { if (!lp.isConnected) document.body.appendChild(lp); loupe = true; rest(); lp.classList.add("on"); core.classList.add("fx2-louping"); showL(x, y); try { navigator.vibrate && navigator.vibrate(10); } catch (e) {} }
    function endL() { loupe = false; lp.classList.remove("on"); core.classList.remove("fx2-louping"); }
    var stopClick = false;
    core.addEventListener("click", function (e) { if (stopClick) { e.stopPropagation(); e.preventDefault(); stopClick = false; } }, true);
    core.addEventListener("touchstart", function (e) { var t = e.touches[0]; sx = t.clientX; sy = t.clientY; moved = false; active = true; clearTimeout(holdT); holdT = setTimeout(function () { if (!moved) startL(sx, sy); }, 320); }, { passive: true });
    core.addEventListener("touchmove", function (e) { var t = e.touches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (loupe) { if (e.cancelable) e.preventDefault(); showL(t.clientX, t.clientY); return; }
      if (!moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) { moved = true; clearTimeout(holdT); if (Math.abs(dy) > Math.abs(dx) * 1.4) { active = false; rest(); return; } }
      if (active && moved) { if (e.cancelable) e.preventDefault(); stopClick = true; aim(t.clientX, t.clientY); } }, { passive: false });
    var tEnd = function () { clearTimeout(holdT); active = false; if (loupe) { endL(); stopClick = true; } rest(); };
    core.addEventListener("touchend", tEnd); core.addEventListener("touchcancel", tEnd);
    core.addEventListener("mousemove", function (e) { if (loupe) { showL(e.clientX, e.clientY); return; } if (!focus) aim(e.clientX, e.clientY); });
    core.addEventListener("mouseleave", function () { clearTimeout(holdT); if (loupe) endL(); if (!focus) rest(); });
    core.addEventListener("mousedown", function (e) { if (e.button) return; clearTimeout(holdT); holdT = setTimeout(function () { startL(e.clientX, e.clientY); }, 280); });
    addEventListener("mouseup", function () { clearTimeout(holdT); if (loupe) { endL(); stopClick = true; rest(); } });
    if (!focus && !core.parentElement.querySelector(".fx2-tip")) { var tip = document.createElement("small"); tip.className = "fx2-tip"; tip.textContent = coarse ? "Drag to tilt · hold to magnify" : "Move to tilt · hold the mouse to magnify"; core.parentElement.appendChild(tip); }
  }

  /* ---------- 2. phones: glint as cards pass mid-screen ---------- */
  var glintIO = coarse && "IntersectionObserver" in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { e.target.classList.toggle("fx2-glint", e.isIntersecting); }); }, { rootMargin: "-42% 0px -42% 0px" }) : null;

  /* ---------- 3. deal the cards in when a list renders ---------- */
  var CARDS = ".bd-t,.vb-pk,.wh-ti,.co-card,.tile,.vs-box,.vc-slab,.sc-pkg";
  var dealQ = null;
  function deal(root) {
    var list = $$(CARDS, root).filter(function (c) { return !c.__dealt; });
    var k = 0; list.forEach(function (c) { c.__dealt = 1; var r = c.getBoundingClientRect(); if (r.top > innerHeight + 40 || r.bottom < -40) return; c.style.setProperty("--di", Math.min(k++, 14)); c.classList.add("fx2-deal"); setTimeout(function () { c.classList.remove("fx2-deal"); }, 1400); });
  }

  /* ---------- 4. slabs everywhere ---------- */
  function slabs(root) { $$(".bd-t,.vb-pk,.co-card,.tile", root).forEach(function (c) { if (c.__slab) return; c.__slab = 1; var t = c.getAttribute("aria-label") || c.textContent || ""; if (SLAB.test(t)) { var a = c.querySelector(".bd-art,.vb-card,.co-img,img"); if (a) (a.tagName === "IMG" ? a.parentElement : a).classList.add("fx2-slab"); } }); }

  function scan(root) {
    $$(".lk-core,.fc-zoom.it-card", root).forEach(enhance);
    if (glintIO) $$(".bd-art,.vb-card,.co-img,.wh-ti img,.tile img", root).forEach(function (el) { if (!el.__gl) { el.__gl = 1; glintIO.observe(el); } });
    slabs(root);
  }
  function start() {
    scan(document);
    var q = 0;
    new MutationObserver(function (ms) {
      if (q) return; q = requestAnimationFrame(function () { q = 0; scan(document); deal(document.getElementById("main") || document); var sh = $$("ion-modal,.sheet"); sh.forEach(function (s) { deal(s); }); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
