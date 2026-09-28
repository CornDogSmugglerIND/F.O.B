/* Coalition H.U.D — photo carousel.
 * Self-contained, zero dependencies, vanilla JS. Mobile-first (390x844).
 * Exposes window.HUD_carousel = { renderInto(el, photos), patchOpenSheet(itemGetter) }.
 * Companion styles live in public/features/carousel.css.
 */
(function () {
  "use strict";

  var SWIPE_MIN_PX = 40;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* Normalize whatever the app hands us into [{ id, dataUrl }]. */
  function normPhotos(photos) {
    if (!Array.isArray(photos)) return [];
    return photos
      .filter(function (p) { return p && p.dataUrl; })
      .map(function (p) {
        return { id: p.id || "", dataUrl: String(p.dataUrl) };
      });
  }

  /* Tear down a previous carousel instance on this element so
   * re-renders never stack listeners or duplicate markup. */
  function teardown(el) {
    if (!el) return;
    var prev = el._hudCarousel;
    if (prev && prev.keyHandler) {
      document.removeEventListener("keydown", prev.keyHandler);
    }
    el._hudCarousel = null;
    el.innerHTML = "";
  }

  function emptyHtml() {
    return (
      '<div class="phcar phcar-empty" role="img" aria-label="No photos">' +
        '<div class="phcar-empty-frame">' +
          '<span class="phcar-empty-corner tl"></span>' +
          '<span class="phcar-empty-corner tr"></span>' +
          '<span class="phcar-empty-corner bl"></span>' +
          '<span class="phcar-empty-corner br"></span>' +
          '<span class="phcar-empty-label">NO PHOTO</span>' +
        "</div>" +
      "</div>"
    );
  }

  function chevron(dir) {
    /* dir: "l" | "r" */
    var d = dir === "l" ? "M14.5 5.5 8 12l6.5 6.5" : "M9.5 5.5 16 12l-6.5 6.5";
    return (
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" ' +
      'stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true"><path d="' + d + '"/></svg>'
    );
  }

  function renderInto(el, photos) {
    if (!el) return;
    teardown(el);

    var list = normPhotos(photos);
    if (list.length === 0) {
      el.innerHTML = emptyHtml();
      return;
    }

    var n = list.length;
    var single = n === 1;

    var slides = list.map(function (p, i) {
      return (
        '<div class="phcar-slide" aria-hidden="' + (i === 0 ? "false" : "true") + '">' +
          '<img src="' + esc(p.dataUrl) + '" alt="Photo ' + (i + 1) + " of " + n + '"' +
          ' draggable="false"' +
          (i === 0 ? "" : ' loading="lazy"') + " />" +
        "</div>"
      );
    }).join("");

    var dots = single ? "" : '<div class="phcar-dots" role="tablist" aria-label="Photo selector">' +
      list.map(function (p, i) {
        return (
          '<button type="button" class="phcar-dot' + (i === 0 ? " is-on" : "") + '"' +
          ' role="tab" aria-selected="' + (i === 0 ? "true" : "false") + '"' +
          ' aria-label="Go to photo ' + (i + 1) + '" data-i="' + i + '"></button>'
        );
      }).join("") +
      "</div>";

    var arrows = single ? "" :
      '<button type="button" class="phcar-arrow phcar-prev" aria-label="Previous photo">' + chevron("l") + "</button>" +
      '<button type="button" class="phcar-arrow phcar-next" aria-label="Next photo">' + chevron("r") + "</button>";

    var counter = single ? "" :
      '<div class="phcar-counter" aria-hidden="true"><span class="phcar-cur">1</span><span class="phcar-sep">/</span><span>' + n + "</span></div>";

    el.innerHTML =
      '<div class="phcar' + (single ? " phcar-single" : "") + '" role="region" aria-roledescription="carousel" aria-label="Item photos">' +
        '<div class="phcar-viewport">' +
          '<div class="phcar-track">' + slides + "</div>" +
          arrows +
          counter +
        "</div>" +
        dots +
      "</div>";

    var root = el.querySelector(".phcar");
    var track = el.querySelector(".phcar-track");
    var viewport = el.querySelector(".phcar-viewport");
    var curEl = el.querySelector(".phcar-cur");
    var dotsEl = el.querySelector(".phcar-dots");
    var dotEls = Array.prototype.slice.call(el.querySelectorAll(".phcar-dot"));
    var index = 0;

    /* Keep the active dot visible in the scrollable dots strip (20+ photos).
     * Manual scrollLeft math — scrollIntoView could yank the page vertically. */
    function centerDot() {
      if (!dotsEl || !dotEls[index]) return;
      var dr = dotsEl.getBoundingClientRect();
      var r = dotEls[index].getBoundingClientRect();
      if (dr.width === 0) return;
      dotsEl.scrollLeft += (r.left - dr.left) - (dr.width - r.width) / 2;
    }

    function show(i) {
      index = ((i % n) + n) % n;
      track.style.transform = "translateX(-" + index * 100 + "%)";
      if (curEl) curEl.textContent = String(index + 1);
      dotEls.forEach(function (d, k) {
        var on = k === index;
        d.classList.toggle("is-on", on);
        d.setAttribute("aria-selected", on ? "true" : "false");
      });
      var slideEls = track.children;
      for (var s = 0; s < slideEls.length; s++) {
        slideEls[s].setAttribute("aria-hidden", s === index ? "false" : "true");
      }
      centerDot();
    }

    function next() { show(index + 1); }
    function prev() { show(index - 1); }

    if (!single) {
      el.querySelector(".phcar-prev").addEventListener("click", function (e) { e.stopPropagation(); prev(); });
      el.querySelector(".phcar-next").addEventListener("click", function (e) { e.stopPropagation(); next(); });
      dotEls.forEach(function (d) {
        d.addEventListener("click", function (e) {
          e.stopPropagation();
          show(parseInt(d.getAttribute("data-i"), 10) || 0);
        });
      });

      /* Swipe: horizontal-dominant gesture with delta-X over threshold. */
      var tX = 0, tY = 0, tracking = false;
      viewport.addEventListener("touchstart", function (e) {
        if (!e.touches || e.touches.length !== 1) { tracking = false; return; }
        tX = e.touches[0].clientX;
        tY = e.touches[0].clientY;
        tracking = true;
      }, { passive: true });
      viewport.addEventListener("touchend", function (e) {
        if (!tracking) return;
        tracking = false;
        var t = e.changedTouches && e.changedTouches[0];
        if (!t) return;
        var dx = t.clientX - tX;
        var dy = t.clientY - tY;
        if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) next(); else prev();
        }
      }, { passive: true });

      /* Keyboard arrows (desktop). Removed on next renderInto via teardown.
       * Ignored while typing in a field so caret movement isn't hijacked. */
      var keyHandler = function (e) {
        if (!document.body.contains(root)) return;
        var t = e.target;
        var tag = t && t.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          (t && t.isContentEditable)
        ) {
          return;
        }
        if (e.key === "ArrowRight") { next(); }
        else if (e.key === "ArrowLeft") { prev(); }
        else return;
        e.preventDefault();
      };
      document.addEventListener("keydown", keyHandler);
      el._hudCarousel = { keyHandler: keyHandler, show: show, count: n };
    }

    show(0);
  }

  /* Optional hook for non-module pages where openSheet is a true global.
   * NOTE: coalition.js loads as an ES module, so its openSheet is
   * module-private and cannot be patched from outside. In the H.U.D. app,
   * use the 1-line change in coalition.js openSheet() instead (see
   * public/features/INTEGRATION.md). This hook is kept for any future
   * non-module context: pass an itemGetter(id) that returns the item so the
   * carousel gets the full photos array. */
  function patchOpenSheet(itemGetter) {
    if (typeof window.openSheet !== "function") {
      if (window.console && window.console.warn) {
        window.console.warn(
          "[HUD_carousel] patchOpenSheet: window.openSheet is not a global " +
          "(coalition.js is an ES module). Apply the snippet in " +
          "public/features/INTEGRATION.md instead."
        );
      }
      return false;
    }
    if (typeof window.HUD_carousel.openSheetPatched === "undefined") {
      var orig = window.openSheet;
      window.openSheet = function (id) {
        var r = orig.apply(this, arguments);
        try {
          var item = typeof itemGetter === "function" ? itemGetter(id) : null;
          var host = document.getElementById("sheetMedia");
          if (host) window.HUD_carousel.renderInto(host, (item && item.photos) || []);
        } catch (err) { /* never break the sheet */ }
        return r;
      };
      window.HUD_carousel.openSheetPatched = true;
    }
    return true;
  }

  window.HUD_carousel = {
    renderInto: renderInto,
    patchOpenSheet: patchOpenSheet,
  };
})();
