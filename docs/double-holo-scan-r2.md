# Double Holo scan hosting (Cloudflare R2)

Public `PicURL`s for Double Holo **Import photos**. Your domain `corndogsmugglercoalition.com` is already on Cloudflare — use that.

## One-time Cloudflare setup (you)

1. Cloudflare dashboard → **R2** → Create bucket (example: `coalition-scans`).
2. R2 → **Manage R2 API Tokens** → Create token with Object Read & Write on that bucket. Copy **Access Key ID** + **Secret Access Key**.
3. Bucket → **Settings** → **Custom Domains** → connect `scans.corndogsmugglercoalition.com`.
4. Wait until the custom domain shows **Active**.
5. Put this in local `.env` (never commit, never paste into chat):

```bash
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=coalition-scans
R2_PUBLIC_BASE_URL=https://scans.corndogsmugglercoalition.com
R2_KEY_PREFIX=scans
```

Account ID: Cloudflare dashboard right sidebar / overview.

## Run after each scan batch

```bash
npm run scans:upload -- --dir "/path/to/Coalition H.U.D/1.INTAKE/Live Scans" --out dh-photo-import.csv
```

Dry run (no upload):

```bash
npm run scans:upload -- --dir "/path/to/Live Scans" --dry-run
```

Epson batches that are strictly front, back, front, back with no `-front` / `-back` in the name:

```bash
npm run scans:upload -- --dir "/path/to/Live Scans" --sequential
```

## CSV

Headers (exact):

`*C:Card Name,*C:Set,*C:Card Number,PicURL`

`PicURL` is `https://…/front.jpg|https://…/back.jpg`.

Filename drafts for name/set/number may need a quick edit so they match DH inventory. Prefer:

`Obsidian Flames_86_Charizard-front.jpg`  
`Obsidian Flames_86_Charizard-back.jpg`

## Then

Double Holo Vendor Hub → Import photos → upload `dh-photo-import.csv`.
