# Scouter

Portable **mobile intake scanner** for your reseller workflow — built in F.O.B, outside Base44.

Scan barcodes, add photos, set quantity, and browse your collection by category. Visor/HUD theme aligned with Coalition Command Core.

## Requirements

- Node.js >= 20
- npm
- Phone browser with camera (HTTPS in production for camera access)

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm test
```

Add to your phone home screen for a full-screen PWA experience.

## Features (v1)

### Capture
- **Multiple photos** — camera or gallery
- **Barcode scan** — camera scanner or manual entry
- **Product identify** — free UPC catalog lookup (best-effort)
- **Quantity** — default 1, editable
- **Category** — Pokemon Sealed, Graded Slabs, Raw Cards, Sports Cards, Other

### Collection
- Items grouped by **category hub**
- Holo-style cards with photo, title, qty, barcode
- Tap a card for detail / delete

## API

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/health` | Health check |
| GET | `/api/scouter/items` | List all scans |
| POST | `/api/scouter/items` | Create scan |
| PATCH | `/api/scouter/items/:id` | Update scan |
| DELETE | `/api/scouter/items/:id` | Delete scan |
| POST | `/api/scouter/items/:id/photos` | Upload photos (`photos` field) |
| POST | `/api/scouter/items/:id/identify` | Barcode lookup + merge |
| GET | `/api/scouter/barcode/:code` | Lookup only |

Data stored under `data/` (JSON + uploaded photos).

## Roadmap

- Sync to Coalition desktop intake
- Market prices / auto-pricing hooks
- Push to Double Holo, Shopify, eBay

## Cloud Agent environment

See [`.cursor/environment.json`](.cursor/environment.json).
