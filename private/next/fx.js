/* F.O.B effects layer (Oct 23). Classic script, loads before everything.
   Sawyer wants effects ON even with Reduce Motion on his Mac. Toggle: localStorage "fob-fx" = "off". */
(function () {
  var FX = true; try { FX = localStorage.getItem("fob-fx") !== "off"; } catch (e) {}
  window.__fobFX = FX;
  if (!FX) return;
  var root = document.documentElement; root.classList.add("fx");

  /* 1. Reduce Motion no longer switches effects off */
  var mm = window.matchMedia.bind(window);
  window.matchMedia = function (q) {
    if (/prefers-reduced-motion/.test(q)) { var r = mm("(min-width:0px)"); var want = /no-preference/.test(q); return { matches: want, media: q, onchange: null, addListener: function () {}, removeListener: function () {}, addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () { return false; } }; }
    return mm(q);
  };
  function fixSheets() {
    for (var i = 0; i < document.styleSheets.length; i++) {
      var s = document.styleSheets[i], rules; try { rules = s.cssRules; } catch (e) { continue; }
      if (!rules) continue;
      for (var j = 0; j < rules.length; j++) {
        var r = rules[j]; if (!r.media || !r.media.mediaText) continue;
        var t = r.media.mediaText;
        if (/prefers-reduced-motion:\s*no-preference/.test(t)) r.media.mediaText = t.replace(/\(prefers-reduced-motion:\s*no-preference\)/g, "(min-width:0px)");
        else if (/prefers-reduced-motion:\s*reduce/.test(t)) r.media.mediaText = "not all";
      }
    }
  }

  /* 2. Living background: drifting smoke light + holo dust, parallax with pointer / tilt */
  var cv, cx, W, H, DPR, parts = [], blobs = [], px = 0, py = 0, tx = 0, ty = 0, last = 0, running = true;
  function initBg() {
    cv = document.createElement("canvas"); cv.id = "fxbg"; cv.setAttribute("aria-hidden", "true");
    document.body.prepend(cv); cx = cv.getContext("2d"); size();
    for (var i = 0; i < 55; i++) parts.push({ x: Math.random(), y: Math.random(), z: .3 + Math.random() * .7, v: .00004 + Math.random() * .00012, o: Math.random() < .18 });
    blobs = [{ x: .18, y: .78, r: .55, c: "60,220,170", a: .13, s: .00005 }, { x: .86, y: .28, r: .5, c: "232,146,74", a: .09, s: .00007 }, { x: .55, y: .55, r: .7, c: "40,160,140", a: .07, s: .00004 }];
    addEventListener("resize", size);
    addEventListener("pointermove", function (e) { tx = e.clientX / innerWidth - .5; ty = e.clientY / innerHeight - .5; }, { passive: true });
    addEventListener("deviceorientation", function (e) { if (e.gamma == null) return; tx = Math.max(-.5, Math.min(.5, e.gamma / 60)); ty = Math.max(-.5, Math.min(.5, (e.beta - 40) / 60)); }, { passive: true });
    document.addEventListener("visibilitychange", function () { running = !document.hidden; if (running) requestAnimationFrame(tick); });
    requestAnimationFrame(tick);
  }
  function size() { DPR = 1; W = innerWidth; H = innerHeight; cv.width = Math.round(W / 2); cv.height = Math.round(H / 2); cv.style.width = W + "px"; cv.style.height = H + "px"; }
  function tick(t) {
    if (!running) return; requestAnimationFrame(tick);
    if (t - last < 42) return; var dt = Math.min(80, t - last); last = t;
    px += (tx - px) * .06; py += (ty - py) * .06;
    cx.setTransform(.5, 0, 0, .5, 0, 0); cx.clearRect(0, 0, W, H);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i]; p.y -= p.v * dt * p.z; p.x += Math.sin((t / 4000) + i) * .00003 * dt; if (p.y < -.02) { p.y = 1.02; p.x = Math.random(); }
      var x = (p.x - px * .04 * p.z) * W, y = (p.y - py * .04 * p.z) * H, a = .25 + .45 * p.z * (.6 + .4 * Math.sin(t / 700 + i * 3));
      cx.fillStyle = p.o ? "rgba(255,178,122," + a + ")" : "rgba(125,242,180," + a + ")";
      cx.beginPath(); cx.arc(x, y, .8 + p.z * 1.8, 0, 6.283); cx.fill();
    }
  }

  /* 3. Visor: scanlines, curved vignette, sweeping scan band, corner arcs with ticks */
  function initVisor() {
    var v = document.createElement("div"); v.id = "fxvisor"; v.setAttribute("aria-hidden", "true");
    v.innerHTML = '<i class="fv-scan"></i><i class="fv-band"></i>' +
      ['tl', 'tr', 'bl', 'br'].map(function (c) { return '<svg class="fv-arc ' + c + '" viewBox="0 0 120 120"><path d="M8 112 A104 104 0 0 1 112 8" /><path class="t" d="M20 112 A92 92 0 0 1 112 20" /></svg>'; }).join("");
    document.body.appendChild(v);
  }

  /* 4. Lock-on: thin arcs close in on whatever you touch, plus a pulse where your finger landed */
  var SEL = "button,[role=button],a[href],.pc,.cx-card,.ch-tile,[data-stage],[data-goto],ion-item,.scr-card,.spx-card,.spx-fcard";
  function lockOn(e) {
    var el = e.target.closest && e.target.closest(SEL); if (!el) return;
    var r = el.getBoundingClientRect(); if (r.width < 8 || r.width > innerWidth * .9) return;
    var pad = 10, w = r.width + pad * 2, h = r.height + pad * 2;
    var d = document.createElement("div"); d.className = "fx-lock"; d.style.cssText = "left:" + (r.left - pad) + "px;top:" + (r.top - pad) + "px;width:" + w + "px;height:" + h + "px";
    var hot = !!el.closest(".hot,[data-stage=sold],[data-stage=shipped]");
    if (hot) d.classList.add("hot");
    d.innerHTML = '<b class="c tl"></b><b class="c tr"></b><b class="c bl"></b><b class="c br"></b>';
    document.body.appendChild(d);
    var p = document.createElement("div"); p.className = "fx-ping" + (hot ? " hot" : ""); p.style.left = e.clientX + "px"; p.style.top = e.clientY + "px";
    p.innerHTML = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="30"/><circle class="s" cx="50" cy="50" r="44"/></svg>';
    document.body.appendChild(p);
    setTimeout(function () { d.remove(); p.remove(); }, 720);
  }

  /* 5. Cards tilt toward the pointer with a moving glare */
  var TILT = ".pc,.cx-card,.ch-tile,.scr-card,.spx-card,.hr,.stat";
  function tilt(e) {
    if (e.pointerType !== "mouse") return;
    var el = e.target.closest && e.target.closest(TILT);
    if (tilt.cur && tilt.cur !== el) { tilt.cur.style.removeProperty("--rx"); tilt.cur.style.removeProperty("--ry"); tilt.cur.classList.remove("fx-tilt"); tilt.cur = null; }
    if (!el) return;
    var r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.classList.add("fx-tilt"); el.style.setProperty("--rx", ((.5 - y) * 10).toFixed(2) + "deg"); el.style.setProperty("--ry", ((x - .5) * 12).toFixed(2) + "deg");
    el.style.setProperty("--gx", (x * 100).toFixed(1) + "%"); el.style.setProperty("--gy", (y * 100).toFixed(1) + "%"); tilt.cur = el;
  }

  /* 6. Every screen materializes like a hologram + numbers count up */
  var MONEY = /^\$?[\d,]+(\.\d+)?$/;
  function countUp(scope) {
    scope.querySelectorAll(".hr b,#stats .stat b,.road .tc,.road .tv,.chs-big,.cx-gain,.k-num").forEach(function (b) {
      if (b.__fx) return; var txt = b.textContent.trim(); if (!MONEY.test(txt)) return; b.__fx = 1;
      var cash = txt[0] === "$", dec = (txt.split(".")[1] || "").length, end = parseFloat(txt.replace(/[$,]/g, "")); if (!end) return;
      var t0 = performance.now(), D = 700;
      (function step(n) { var k = Math.min(1, (n - t0) / D), e = 1 - Math.pow(1 - k, 3), v = end * e;
        b.textContent = (cash ? "$" : "") + v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
        if (k < 1) requestAnimationFrame(step); else b.textContent = txt; })(t0);
    });
  }
  function materialize(main) {
    var kids = Array.prototype.slice.call(main.querySelectorAll(":scope > *, .road > .stop, .chs-list > *, .ch-tile, .cx-card"), 0, 24);
    kids.forEach(function (k, n) { k.style.setProperty("--fxd", Math.min(n * 18, 260) + "ms"); k.classList.add("fx-in"); });
    countUp(main);
  }

  function watchMain() {
    var main = document.getElementById("main"); if (!main) return setTimeout(watchMain, 120);
    /* only when you actually change screens: background refreshes must not replay the effect */
    var lastV = null, q = 0;
    new MutationObserver(function () {
      var v = document.body.dataset.view || "command"; if (v === lastV) return;
      cancelAnimationFrame(q); q = requestAnimationFrame(function () { if (!main.firstElementChild) return; lastV = v; materialize(main); });
    }).observe(main, { childList: true });
    if (main.firstElementChild) { lastV = document.body.dataset.view || "command"; materialize(main); }
  }
  /* 7. Power-on sweep on launch */
  function boot() {
    var sp = document.createElement("div"); sp.id = "fxsplash"; sp.setAttribute("aria-hidden", "true");
    sp.innerHTML = '<img class="g" src="img/wm-glyph.png?v=2" alt=""><img class="w" src="img/wm-text.png" alt=""><i></i>';
    document.body.appendChild(sp); setTimeout(function () { sp.remove(); }, 1750);
    setTimeout(function () { root.classList.add("fx-boot"); setTimeout(function () { root.classList.remove("fx-boot"); }, 1300); }, 1150);
  }

  function start() {
    fixSheets(); setTimeout(fixSheets, 400); setTimeout(fixSheets, 1500);
    initBg(); initVisor(); boot(); watchMain();
    addEventListener("pointerdown", lockOn, { passive: true, capture: true });
    addEventListener("pointermove", tilt, { passive: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
