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
