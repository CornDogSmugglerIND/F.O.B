/** Client-side photo compression — keeps uploads under Vercel body limits. */
(function (global) {
  const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i;

  function isImageFile(file) {
    if (file.type && file.type.startsWith("image/")) return true;
    return IMAGE_EXT.test(file.name || "");
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read this image format"));
      img.src = src;
    });
  }

  async function decodeImage(file) {
    const url = URL.createObjectURL(file);
    try {
      if (typeof createImageBitmap === "function") {
        try {
          const bitmap = await createImageBitmap(file);
          return { source: bitmap, kind: "bitmap", cleanup: () => bitmap.close() };
        } catch {
          /* fall through */
        }
      }
      const img = await loadImage(url);
      return { source: img, kind: "image", cleanup: () => {} };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function drawSource(ctx, decoded, w, h) {
    if (decoded.kind === "bitmap") {
      ctx.drawImage(decoded.source, 0, 0, w, h);
      return;
    }
    ctx.drawImage(decoded.source, 0, 0, w, h);
  }

  function sourceSize(decoded) {
    if (decoded.kind === "bitmap") {
      return { width: decoded.source.width, height: decoded.source.height };
    }
    return { width: decoded.source.width, height: decoded.source.height };
  }

  /** Target ~150–400 KB per photo for Vercel's 4.5 MB body cap. */
  async function compressPhoto(file, maxEdge = 1200, quality = 0.78) {
    const decoded = await decodeImage(file);
    try {
      const { width, height } = sourceSize(decoded);
      const scale = Math.min(1, maxEdge / Math.max(width, height));
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      drawSource(ctx, decoded, w, h);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Could not compress image"))),
          "image/jpeg",
          quality,
        );
      });

      if (blob.size > 3.5 * 1024 * 1024) {
        throw new Error("Photo still too large after compression — try one at a time");
      }

      const base = (file.name || "photo").replace(/\.[^.]+$/, "") || "photo";
      return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
    } finally {
      decoded.cleanup();
    }
  }

  async function compressPhotos(files) {
    const out = [];
    for (const file of files) {
      if (!isImageFile(file)) {
        throw new Error(`"${file.name || "file"}" is not a supported image`);
      }
      try {
        out.push(await compressPhoto(file));
      } catch (err) {
        throw new Error(err.message || `Could not process "${file.name}". Try JPEG or PNG.`);
      }
    }
    return out;
  }

  global.ScouterImage = { isImageFile, compressPhoto, compressPhotos };
})(window);
