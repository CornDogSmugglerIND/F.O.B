# Coalition H.U.D (F.O.B)

Mobile **Coalition H.U.D** — Base44 replacement for CornDogSmuggler.

**Open on phone:** https://f-o-b.vercel.app/hud.html

## Tabs
- **Home** — stats + feature health
- **Scan** — multi-photo camera/gallery, barcode lookup, save to rail
- **Rail** — inventory browse, delete, export/import
- **List** — listing engine entry (listing copy + draft from rail; eBay/Triple Threat next)
- **More** — tap-to-verify feature checklist + backup

Bottom tabs always stay visible so you can leave any screen.

## Dev

```bash
npm install
npm run dev
npm test
```

## Data
Items store in phone `localStorage` (`scouter-items-v1`). Export backups from Rail or More.

## Roadmap
- Full eBay listing engine tab
- Triple Threat hooks (Cursor + Claude + GitHub)
- Durable cloud sync
