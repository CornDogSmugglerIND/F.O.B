/**
 * Path 1 UPC lookup — Command #55:
 * retail UPC first (UPCitemdb or equivalent); Open*Facts stays a weak fallback only.
 * No eBay image search. Honest miss → caller offers Manual and keeps photos.
 */

const SOURCES = [
  {
    name: "upcitemdb",
    async fetch(barcode) {
      const res = await fetch(
        `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
        {
          headers: { Accept: "application/json", "User-Agent": "F.O.B-Scouter/0.1" },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!res.ok) return null;
      const data = await res.json();
      const item = data?.items?.[0];
      if (!item?.title) return null;
      return {
        title: item.title,
        brand: item.brand || item.publisher || null,
        description: item.description || item.category || null,
        lookupSource: "upcitemdb",
      };
    },
  },
  {
    name: "go-upc",
    async fetch(barcode) {
      // Public product page JSON mirror used as secondary retail UPC source (no Sawyer key).
      const res = await fetch(`https://go-upc.com/api/v1/code/${encodeURIComponent(barcode)}`, {
        headers: { Accept: "application/json", "User-Agent": "F.O.B-Scouter/0.1" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const product = data?.product;
      if (!product?.name && !product?.title) return null;
      return {
        title: product.name || product.title,
        brand: product.brand || product.manufacturer || null,
        description: product.description || product.category || null,
        lookupSource: "go-upc",
      };
    },
  },
  // Weak fallbacks — groceries/beauty heavy; wrong coverage for sealed TCG / electronics / toys.
  {
    name: "openproductfacts",
    async fetch(barcode) {
      const res = await fetch(
        `https://world.openproductfacts.org/api/v2/product/${barcode}.json`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!res.ok) return null;
      const data = await res.json();
      const product = data?.product;
      if (!product || data.status !== 1) return null;
      const title = product.product_name || product.generic_name || null;
      if (!title) return null;
      return {
        title,
        brand: product.brands || null,
        description: product.quantity || null,
        lookupSource: "openproductfacts",
      };
    },
  },
  {
    name: "openfoodfacts",
    async fetch(barcode) {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const product = data?.product;
      if (!product || data.status !== 1) return null;
      const title = product.product_name || product.generic_name || null;
      if (!title) return null;
      return {
        title,
        brand: product.brands || null,
        description: product.quantity || null,
        lookupSource: "openfoodfacts",
      };
    },
  },
  {
    name: "openbeautyfacts",
    async fetch(barcode) {
      const res = await fetch(
        `https://world.openbeautyfacts.org/api/v2/product/${barcode}.json`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!res.ok) return null;
      const data = await res.json();
      const product = data?.product;
      if (!product || data.status !== 1) return null;
      const title = product.product_name || product.generic_name || null;
      if (!title) return null;
      return {
        title,
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
      const product = await source.fetch(normalized);
      if (product?.title) {
        return { found: true, barcode: normalized, product };
      }
    } catch {
      // try next source
    }
  }

  return { found: false, barcode: normalized, product: null };
}
