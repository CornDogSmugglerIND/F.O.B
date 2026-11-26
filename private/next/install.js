/* ---------- Install + update (Nov 26) ----------
   The service worker is what makes this open like an app. This file is the
   two bits of it the person actually sees: an offer to install it, and the
   guarantee that a new build never hides behind an old one. */
(() => {
  if (!("serviceWorker" in navigator)) return;

  /* A new worker taking over means a new build is live. Reload once, right
     then, so what is on screen is always what was pushed. The flag stops the
     reload from looping if anything ever goes wrong. */
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return; reloading = true;
    if (navigator.serviceWorker.controller) location.reload();
  });

  addEventListener("load", async () => {
    let reg;
    try { reg = await navigator.serviceWorker.register("sw.js", { scope: "./", updateViaCache: "none" }); }
    catch { return; }  /* gated, private window, or http - the app still works */
    /* check for a new build when he comes back to it */
    addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
    setInterval(() => reg.update().catch(() => {}), 10 * 60 * 1000);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing; if (!w) return;
      w.addEventListener("statechange", () => {
        if (w.state === "installed" && navigator.serviceWorker.controller) w.postMessage("skipWaiting");
      });
    });
  });

  /* ---- the offer to install ----
     Android fires beforeinstallprompt and the browser does the work. iOS never
     has, and never will, so Safari gets told where the button is instead. It
     is asked once; "Not now" is remembered and never asked again. */
  const KEY = "coalition-install-asked";
  const asked = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return true; } };
  const mark = () => { try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ } };
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

  function card(body, onYes) {
    const el = document.createElement("div");
    el.className = "inst";
    el.innerHTML = `<div class="inst-b"><img src="img/icon-192.png?v=3" alt="" class="inst-i">
      <div class="inst-t"><b>Put Coalition on your home screen</b><span>${body}</span></div>
      <div class="inst-a">${onYes ? '<button type="button" class="inst-y">Install</button>' : ""}
      <button type="button" class="inst-n">${onYes ? "Not now" : "Got it"}</button></div></div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("on"));
    const shut = () => { mark(); el.classList.remove("on"); setTimeout(() => el.remove(), 260); };
    el.querySelector(".inst-n").addEventListener("click", shut);
    el.querySelector(".inst-y")?.addEventListener("click", async () => { shut(); await onYes(); });
  }

  let deferred = null;
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); deferred = e;
    if (asked() || standalone()) return;
    setTimeout(() => card("Opens full screen, starts instantly, and keeps working when the signal does not.",
      async () => { deferred.prompt(); deferred = null; }), 2500);
  });

  addEventListener("load", () => {
    if (asked() || standalone() || deferred) return;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (!ios) return;
    setTimeout(() => { if (!asked() && !standalone()) card("Tap Share, then <b>Add to Home Screen</b>. It opens full screen with no browser bar.", null); }, 3000);
  });
})();
