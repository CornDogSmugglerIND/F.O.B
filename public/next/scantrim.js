/* Scanner-page trim: when the scanner sends the whole feeder page (card small on gray/white),
   find the card by its edges and cut it out. Leaves the photo alone if it isn't sure. */
export function trimScan(src) {
  return new Promise((res) => {
    const im = new Image(); im.crossOrigin = "anonymous";
    im.onload = () => {
      try {
        const W0 = im.naturalWidth, H0 = im.naturalHeight, k = Math.min(1, 360 / Math.max(W0, H0));
        const w = Math.max(8, Math.round(W0 * k)), h = Math.max(8, Math.round(H0 * k));
        const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(im, 0, 0, w, h);
        const d = g.getImageData(0, 0, w, h).data, L = new Float32Array(w * h);
        for (let i = 0; i < w * h; i++) L[i] = d[i * 4] * .299 + d[i * 4 + 1] * .587 + d[i * 4 + 2] * .114;
        const E = new Uint8Array(w * h), T = 28;
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; const gx = Math.abs(L[i + 1] - L[i - 1]), gy = Math.abs(L[i + w] - L[i - w]); if (gx + gy > T) E[i] = 1; }
        const rowN = new Array(h).fill(0), colN = new Array(w).fill(0);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (E[y * w + x]) { rowN[y]++; colN[x]++; }
        /* full-width / full-height lines are the paper edge or the feeder seam, not the card */
        const badRow = rowN.map((n) => n > w * .8), badCol = colN.map((n) => n > h * .8);
        const m = Math.round(Math.min(w, h) * .02);
        let x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (let y = m; y < h - m; y++) { if (badRow[y]) continue; for (let x = m; x < w - m; x++) { if (badCol[x] || !E[y * w + x]) continue; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
        if (x1 < 0) return res(src);
        /* trim stray specks: shrink each side until that edge line holds a real share of edge pixels */
        const dens = (ax, ay, bx, by) => { let n = 0; for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) n += E[y * w + x]; return n; };
        while (x1 - x0 > 10 && dens(x0, y0, x0 + 1, y1) < (y1 - y0) * .04) x0++;
        while (x1 - x0 > 10 && dens(x1 - 1, y0, x1, y1) < (y1 - y0) * .04) x1--;
        while (y1 - y0 > 10 && dens(x0, y0, x1, y0 + 1) < (x1 - x0) * .04) y0++;
        while (y1 - y0 > 10 && dens(x0, y1 - 1, x1, y1) < (x1 - x0) * .04) y1--;
        const bw = x1 - x0, bh = y1 - y0, area = bw * bh / (w * h), r = bw / bh;
        const cardish = (r >= .55 && r <= .9) || (r >= 1.15 && r <= 1.85);
        if (!cardish || area < .08 || area > .9) return res(src);
        const pad = Math.round(Math.max(bw, bh) * .025);
        const sx = Math.max(0, (x0 - pad) / k), sy = Math.max(0, (y0 - pad) / k), sw = Math.min(W0 - sx, (bw + pad * 2) / k), sh = Math.min(H0 - sy, (bh + pad * 2) / k);
        const o = document.createElement("canvas"); o.width = Math.round(sw); o.height = Math.round(sh);
        o.getContext("2d").drawImage(im, sx, sy, sw, sh, 0, 0, o.width, o.height);
        res(o.toDataURL("image/jpeg", .92));
      } catch { res(src); }
    };
    im.onerror = () => res(src); im.src = src;
  });
}
