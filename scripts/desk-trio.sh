#!/usr/bin/env bash
# Triple Threat — truthful wire status (Cursor + Claude Code Action + GitHub).
# After merge: bash <(curl -fsSL https://f-o-b.vercel.app/desk-trio.sh)
set -euo pipefail

cat <<'EOF'
=== Triple Threat — what was broken ===

Cowork does NOT auto-wake on GitHub comments.
TRIO_OK only happened when Sawyer told Cowork at the desk to reply.

Cursor @claude pings fire Claude Code Action, but they failed:
  401 User does not have write access
because Composio posts as CornDogSmugglerCoalition7 (read-only).
continue-on-error hid the failure as "success".

=== Fix ===

PR: cursor/trio-wire-fix-f396
- GITHUB_TOKEN for issue writes
- allowed_non_write_users: CornDogSmugglerCoalition7
- real failures visible

After that merges to main: Cursor @claude on #24 → Action replies
(as github-actions[bot] when using the workflow token).

Desktop Cowork is still fine for design talk — it is not the auto wire.

Status page: https://f-o-b.vercel.app/trio-setup.html
Issue: https://github.com/CornDogSmugglerIND/F.O.B/issues/24
EOF
