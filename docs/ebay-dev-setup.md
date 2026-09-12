# eBay Developer keys → F.O.B env

Identify/listing engine work in this repo already expects these exact names
(see `.env.example`, `src/channels/ebay.js`, `src/channels/config.js`). Copy
names only — never paste real values into chat, commits, or this file.

```bash
EBAY_CLIENT_ID=
EBAY_CLIENT_SECRET=
EBAY_DEV_ID=
EBAY_RU_NAME=
EBAY_REFRESH_TOKEN=
EBAY_ACCESS_TOKEN=
EBAY_SELLER_ID=
EBAY_ENV=production
EBAY_MARKETPLACE_ID=EBAY_US
EBAY_FULFILLMENT_POLICY_ID=
EBAY_PAYMENT_POLICY_ID=
EBAY_RETURN_POLICY_ID=
EBAY_MERCHANT_LOCATION_KEY=
```

## Where these values come from (you)

1. **eBay Developer Portal** (developer.ebay.com) → **My Account → Application Keys**,
   for whichever app is already registered there. That page has Client ID
   (App ID), Client Secret (Cert ID), and Dev ID for both Sandbox and
   Production — pick Production. RuName lives under **User Tokens** for the
   same app.
2. `EBAY_REFRESH_TOKEN` / `EBAY_ACCESS_TOKEN` come from running eBay's OAuth
   user-consent flow once for that app, not from the Application Keys page
   directly.
3. `EBAY_SELLER_ID` is your eBay username. The three policy IDs
   (`EBAY_FULFILLMENT_POLICY_ID`, `EBAY_PAYMENT_POLICY_ID`,
   `EBAY_RETURN_POLICY_ID`) and `EBAY_MERCHANT_LOCATION_KEY` come from
   **Seller Hub → Business Policies** / Account API — needed to publish
   offers, not just to authenticate.

If a copy of these already exists somewhere from the Base44 build (its own
secrets vault, a notes doc, 1Password) that's the fastest path — this repo
has no record of where that copy lives, so confirm the values still match
Production before reusing them.

## Get them into F.O.B

- **Local dev:** paste into `.env` (already gitignored).
- **Vercel:** Project → Settings → Environment Variables → add each name/value
  for Production (and Preview if you want Identify testable on branch
  deploys).
- **Cursor Cloud secrets:** Cursor → Cloud Agents → this repo → Secrets → add
  each name/value there so background agents can read them without you
  pasting keys into chat again.

## Verify

`src/channels/config.js` → `getChannelStatuses()` reports `configured: true`
for `ebay` once `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_REFRESH_TOKEN`,
and `EBAY_SELLER_ID` are all present — check that (e.g. via the More tab
feature checklist) before wiring Identify to real calls.
