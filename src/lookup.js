const SOURCES = [
  {
    name: "openproductfacts",
    url: (barcode) => `https://world.openproductfacts.org/api/v2/product/${barcode}.json`,
    parse(data) {
      const product = data?.product;
      if (!product || data.status !== 1) return null;
      return {
        title: product.product_name || product.generic_name || null,
        brand: product.brands || null,
        description: product.quantity || null,
        lookupSource: "openproductfacts",
      };
    },
  },
  {
    name: "openfoodfacts",
    url: (barcode) => `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`,
    parse(data) {
      const product = data?.product;
      if (!product || data.status !== 1) return null;
      return {
        title: product.product_name || product.generic_name || null,
        brand: product.brands || null,
        description: product.quantity || null,
        lookupSource: "openfoodfacts",
      };
    },
  },
  {
    name: "openbeautyfacts",
    url: (barcode) => `https://world.openbeautyfacts.org/api/v2/product/${barcode}.json`,
    parse(data) {
      const product = data?.product;
      if (!product || data.status !== 1) return null;
      return {
        title: product.product_name || product.generic_name || null,
        brand: product.brands || null,
        description: product.quantity || null,
        lookupSource: "openbeautyfacts",
      };
    },
  },
];

export async function lookupBarcode(barcode) {
  const normalized = String(barcode).replace(/\D/g, "");
  if (!normalized) {
    return { found: false, barcode: normalized, product: null };
  }

  for (const source of SOURCES) {
    try {
      const res = await fetch(source.url(normalized), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const product = source.parse(data);
      if (product?.title) {
        return { found: true, barcode: normalized, product };
      }
    } catch {
      // try next source
    }
  }

  return { found: false, barcode: normalized, product: null };
}
