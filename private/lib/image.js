/** Client-side photo compression + data URLs for reliable phone uploads. */
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
      img.onerror = () => reject(new Error("Could not read this image"));
      img.src = src;
    });
  }

  async function compressPhoto(file, maxEdge = 960, quality = 0.72) {
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
      if (!isImageFile(file)) {
        throw new Error(`"${file.name || "file"}" is not a supported image`);
      }
      out.push(await compressPhoto(file));
    }
    return out;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read photo"));
      reader.readAsDataURL(file);
    });
  }

  global.ScouterImage = { isImageFile, compressPhoto, compressPhotos, fileToDataUrl };
})(window);
