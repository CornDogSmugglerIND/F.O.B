/**
 * Shopify channel client (FOB Sync app, Dev Dashboard).
 * Auth: client credentials grant. SHOPIFY_SHOP + SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET
 * are exchanged for a 24h Admin API token; cached per warm instance.
 */
const API_VERSION = "2026-10";
const env = (k) => (process.env[k] || "").trim();
let tok = null; // { value, exp }

export function shopifyConfigured() {
  return Boolean(env("SHOPIFY_SHOP") && env("SHOPIFY_CLIENT_ID") && env("SHOPIFY_CLIENT_SECRET"));
}
const host = () => `${env("SHOPIFY_SHOP")}.myshopify.com`;

export async function getShopifyToken(fetchImpl = fetch) {
  if (tok && tok.exp > Date.now() + 60000) return tok.value;
  if (!shopifyConfigured()) throw Object.assign(new Error("Shopify isn't connected (missing SHOPIFY_* settings)."), { code: "NOT_CONFIGURED" });
  const r = await fetchImpl(`https://${host()}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: env("SHOPIFY_CLIENT_ID"), client_secret: env("SHOPIFY_CLIENT_SECRET") }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw Object.assign(new Error(`Shopify token: ${d.error_description || d.error || r.status}`), { status: r.status });
  tok = { value: d.access_token, exp: Date.now() + (Number(d.expires_in) || 3600) * 1000 };
  return tok.value;
}

export async function shopifyGql(query, variables = {}, fetchImpl = fetch) {
  const t = await getShopifyToken(fetchImpl);
  const r = await fetchImpl(`https://${host()}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": t },
    body: JSON.stringify({ query, variables }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.errors) throw Object.assign(new Error(`Shopify API: ${JSON.stringify(d.errors || r.status).slice(0, 300)}`), { status: r.status });
  return d.data;
}

/** Every product variant with sku, price, stock and the ids needed to change them. */
export async function listShopifyVariants(fetchImpl = fetch) {
  const out = [];
  let after = null;
  for (let page = 0; page < 50; page++) {
    const d = await shopifyGql(`query($after:String){ productVariants(first:250, after:$after){ pageInfo{hasNextPage endCursor} nodes{
      id sku title price inventoryQuantity
      inventoryItem{ id tracked }
      product{ id title status handle }
    } } }`, { after }, fetchImpl);
    const c = d.productVariants;
    for (const v of c.nodes) out.push({
      variantId: v.id, sku: v.sku || "", title: v.product?.title || "", variantTitle: v.title,
      price: Number(v.price), quantity: v.inventoryQuantity, inventoryItemId: v.inventoryItem?.id, tracked: v.inventoryItem?.tracked,
      productId: v.product?.id, status: v.product?.status, handle: v.product?.handle,
    });
    if (!c.pageInfo.hasNextPage) break;
    after = c.pageInfo.endCursor;
  }
  return out;
}

export async function probeShopify(fetchImpl = fetch) {
  const d = await shopifyGql(`{ shop{ name myshopifyDomain } productsCount{ count } locations(first:5){ nodes{ id name isActive } } }`, {}, fetchImpl);
  return { ok: true, shop: d.shop?.name, domain: d.shop?.myshopifyDomain, products: d.productsCount?.count, locations: d.locations?.nodes || [] };
}

/* ---------------- writes (Build 190) ---------------- */
let locId = null;
export async function shopifyLocationId(fetchImpl = fetch) {
  if (locId) return locId;
  const d = await shopifyGql(`{ locations(first:5){ nodes{ id isActive } } }`, {}, fetchImpl);
  locId = (d.locations.nodes.find((l) => l.isActive) || d.locations.nodes[0])?.id;
  return locId;
}

/** Find a variant by sku, variantId or inventoryItemId. */
export async function findShopifyVariant({ sku, variantId, inventoryItemId }, fetchImpl = fetch) {
  const sel = `id sku price inventoryQuantity inventoryItem{ id } product{ id title }`;
  if (variantId) return (await shopifyGql(`query($id:ID!){ productVariant(id:$id){ ${sel} } }`, { id: variantId }, fetchImpl)).productVariant;
  if (inventoryItemId) return (await shopifyGql(`query($id:ID!){ inventoryItem(id:$id){ variant{ ${sel} } } }`, { id: inventoryItemId }, fetchImpl)).inventoryItem?.variant;
  if (sku) {
    const d = await shopifyGql(`query($q:String!){ productVariants(first:5, query:$q){ nodes{ ${sel} } } }`, { q: `sku:"${String(sku).replace(/"/g, "")}"` }, fetchImpl);
    return d.productVariants.nodes.find((v) => v.sku === sku) || null;
  }
  return null;
}

const userErr = (e) => { if (e && e.length) throw Object.assign(new Error(e.map((x) => x.message).join("; ")), { status: 400 }); };

/** Create one product with one variant. Refuses if the sku already exists (no duplicates). */
export async function createShopifyProduct({ title, sku, price, quantity = 1, imageUrls = [], descriptionHtml = "", tags = [], productType = "Trading Card" }, fetchImpl = fetch) {
  if (!title || !sku || !(Number(price) > 0)) throw Object.assign(new Error("title, sku and price are required"), { status: 400 });
  const existing = await findShopifyVariant({ sku }, fetchImpl);
  if (existing) return { ok: true, existed: true, productId: existing.product.id, variantId: existing.id };
  const loc = await shopifyLocationId(fetchImpl);
  const input = {
    title, descriptionHtml, status: "ACTIVE", productType, tags,
    productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
    files: imageUrls.filter(Boolean).slice(0, 10).map((u) => ({ originalSource: u, contentType: "IMAGE" })),
    variants: [{
      optionValues: [{ optionName: "Title", name: "Default Title" }],
      sku, price: Number(price).toFixed(2),
      inventoryItem: { sku, tracked: true },
      inventoryQuantities: [{ locationId: loc, name: "available", quantity: Math.max(0, Math.trunc(Number(quantity) || 0)) }],
    }],
  };
  const d = await shopifyGql(`mutation($input:ProductSetInput!){ productSet(input:$input, synchronous:true){ product{ id handle variants(first:1){ nodes{ id inventoryItem{ id } } } } userErrors{ field message } } }`, { input }, fetchImpl);
  userErr(d.productSet.userErrors);
  const p = d.productSet.product, v = p.variants.nodes[0];
  const published = await publishToOnlineStore(p.id, fetchImpl);
  return { ok: true, productId: p.id, handle: p.handle, variantId: v.id, inventoryItemId: v.inventoryItem.id, published };
}

/** Publish to the Online Store channel. Needs write_publications; returns false (not an error) without it. */
export async function publishToOnlineStore(productId, fetchImpl = fetch) {
  try {
    const d = await shopifyGql(`{ publications(first:20){ nodes{ id name } } }`, {}, fetchImpl);
    const pub = d.publications.nodes.find((p) => /online store/i.test(p.name));
    if (!pub) return false;
    const r = await shopifyGql(`mutation($id:ID!,$input:[PublicationInput!]!){ publishablePublish(id:$id, input:$input){ userErrors{ message } } }`, { id: productId, input: [{ publicationId: pub.id }] }, fetchImpl);
    return !(r.publishablePublish.userErrors || []).length;
  } catch { return false; }
}

export async function setShopifyPrice({ price, ...ref }, fetchImpl = fetch) {
  if (!(Number(price) > 0)) throw Object.assign(new Error("price must be > 0"), { status: 400 });
  const v = await findShopifyVariant(ref, fetchImpl);
  if (!v) throw Object.assign(new Error("variant not found"), { status: 404 });
  const d = await shopifyGql(`mutation($p:ID!,$v:[ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId:$p, variants:$v){ productVariants{ id price } userErrors{ field message } } }`, { p: v.product.id, v: [{ id: v.id, price: Number(price).toFixed(2) }] }, fetchImpl);
  userErr(d.productVariantsBulkUpdate.userErrors);
  return { ok: true, variantId: v.id, sku: v.sku, from: Number(v.price), price: Number(price) };
}

export async function setShopifyQuantity({ quantity, ...ref }, fetchImpl = fetch) {
  const q = Math.trunc(Number(quantity));
  if (!(q >= 0)) throw Object.assign(new Error("quantity must be >= 0"), { status: 400 });
  const v = await findShopifyVariant(ref, fetchImpl);
  if (!v) throw Object.assign(new Error("variant not found"), { status: 404 });
  const loc = await shopifyLocationId(fetchImpl);
  const d = await shopifyGql(`mutation($input:InventorySetQuantitiesInput!){ inventorySetQuantities(input:$input){ inventoryAdjustmentGroup{ id } userErrors{ field message } } }`, {
    input: { name: "available", reason: "correction", referenceDocumentUri: "fob://sync", quantities: [{ inventoryItemId: v.inventoryItem.id, locationId: loc, quantity: q, changeFromQuantity: null }] },
  }, fetchImpl);
  userErr(d.inventorySetQuantities.userErrors);
  return { ok: true, variantId: v.id, sku: v.sku, from: v.inventoryQuantity, quantity: q };
}
