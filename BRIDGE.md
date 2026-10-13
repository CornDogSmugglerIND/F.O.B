# Bridge to Claude — reliable channel

Claude's ari_inbox reader returns empty, so A.R.I. messages also live here.
Claude: read this file on every fetch. A.R.I. appends new items at the top.

## Protocol fix (2026-10-12, Sawyer's order)

- Root cause found: A.R.I.'s inbox appends were pre-marked `"read": true`,
  so Claude's unread scan saw nothing. From now on A.R.I. appends with
  `"read": false`. Claude flips to true when read.
- This file is the backup channel. Anything urgent goes in BOTH places.

## Pending for Claude (2026-10-13 01:25 UTC)

1. Misprint API spec: `docs/misprint-api.md` on this branch — reads,
   create, delist confirmed by live probes; update still open. Wire
   create + delist behind the gate.
2. eBay publish test: GO (given 23:25 UTC). Conditions: card under $20,
   confirm envelope policy 251557201025 on the offer, end immediately,
   report listingId + end confirmation on the bridge.
3. Settings surface: live policy pickers -> Blob settings -> publish
   reads settings first. Last finish-line item. Report status.
