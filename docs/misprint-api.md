# Misprint Seller API — confirmed contract

Probed live by A.R.I. on 2026-10-12 against Sawyer's real account using
validation-only calls (empty bodies, fake IDs, ineligible product IDs).
Nothing was created, modified, or deleted. Verified again by successful
read pulls (17 listings, orders).

## Base + auth (confirmed)

- Base: `https://www.misprint.com/api/v1`
- Headers on EVERY call:
  - `Authorization: Bearer <MISPRINT_API_KEY>`
  - `X-User-Id: <MISPRINT_SELLER_ID>`
  - `Accept: application/json`
  - `Content-Type: application/json` (calls with a body)
- No other auth headers. `X-API-Key` / `X-Seller-Id` do NOT work.
- Error shape: `{"success": false, "error": "...", "code": "...", "requestId": "..."}`

## Read inventory (confirmed, live data)

`GET /seller/inventory?page=1&limit=100`

Response: JSON object, results in `data` array. One real row:

```json
{
  "listing_id": "065a54ea-f808-49e2-a588-e6e0b3a3ca2d",
  "product_id": 714386,
  "title": "ME: 30th Celebration Classic Collection Lugia 149",
  "card_image_url": "https://tcgplayer-cdn.tcgplayer.com/product/714386_in_1000x1000.jpg",
  "grading_authority": "Ungraded",
  "grading_scale_value": "NM",
  "price": 320.81,
  "quantity": 1,
  "quantity_remaining": 0,
  "status": "completed",
  "created_at": "2026-09-23T03:44:34.016Z",
  "image_urls": ["https://...supabase.co/.../listings/product-images/...jpg"],
  "set_name": "ME: 30th Celebration Classic Collection",
  "cardnumber": "149",
  "tcgp_variant": "Holofoil",
  "misprint_id": 100118598,
  "misprint_variant_id": 10155619,
  "language": "english"
}
```

## Read orders (confirmed, live data)

`GET /seller/orders?page=1&limit=100` — same `data` array shape.

## Create listing (confirmed endpoint + fields)

`POST /seller/inventory`

Empty body returns HTTP 400:

```json
{"success": false, "error": "Invalid request data", "code": "VALIDATION_ERROR",
 "details": {"product_id": ["Required"], "grading_authority": ["Required"],
             "grading_scale_value": ["Required"], "price": ["Required"]}}
```

Required body fields: `product_id`, `grading_authority`,
`grading_scale_value`, `price`. Optional (from the read shape):
`quantity`, `image_urls`, `language`.

- `product_id` is the TCGplayer product ID (integer, e.g. 714386).
- `grading_authority`: e.g. `"Ungraded"`, `"PSA"`, `"CGC"`.
- `grading_scale_value`: condition for ungraded (`"NM"`, ...) or the grade.
- Products are eligibility-checked. Ineligible product returns HTTP 404:
  `{"success": false, "code": "PRODUCT_NOT_ELIGIBLE", "error": "Product (tcgp_product_id: 999999999, variant: unspecified) is not approved for listing via this API"}`

## Delist (confirmed endpoint)

`DELETE /seller/inventory` with JSON body `{"listing_id": "<uuid>"}`.

Fake ID returns HTTP 404 JSON (a real API response, not the website 404):
`{"success": false, "error": "Listing not found", "code": "NOT_FOUND"}`

Only a delete of a real listing is untested.

## Update price / quantity (NOT confirmed)

Probed and ruled out (all fake IDs / empty bodies):

- `PATCH` / `PUT` / `DELETE` on `/seller/inventory/{id}` → website 404 HTML (route does not exist)
- `PATCH` / `PUT` on `/seller/inventory` (collection) → HTTP 405
- `POST /seller/inventory/{id}/delist`, `/deactivate`, `POST /seller/inventory/{id}`, `POST /seller/inventory/delete`, `POST /seller/listings` → website 404 HTML

Open hypothesis, untested: the POST create route upserts by `product_id`
(+ variant). Test only on a throwaway listing with Sawyer's go.

## Product ID resolution

There is no Misprint-side catalog search endpoint in the confirmed set.
`product_id` IS the TCGplayer product ID — it comes back on every
inventory row, and the TCGplayer CDN image URL embeds it
(`.../product/<product_id>_in_1000x1000.jpg`). Resolve a card to its
TCGplayer product ID first, then create.
