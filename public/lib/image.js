/** Client-side photo compression — keeps uploads under Vercel body limits. */
(function (global) {
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read this image format"));
      img.src = src;
    });
  }

  async function compressPhoto(file, maxEdge = 1600, quality = 0.82) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Could not compress image"))),
          "image/jpeg",
          quality,
        );
      });

      const base = (file.name || "photo").replace(/\.[^.]+$/, "") || "photo";
      return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function compressPhotos(files) {
    const out = [];
    for (const file of files) {
      try {
        out.push(await compressPhoto(file));
      } catch {
        throw new Error(`Could not process "${file.name}". Try JPEG or PNG.`);
      }
    }
    return out;
  }

  global.ScouterImage = { compressPhoto, compressPhotos };
})(window);
