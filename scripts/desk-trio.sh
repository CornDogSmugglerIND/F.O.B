#!/usr/bin/env bash
# Desk helper for Triple Threat proof (Cursor + Claude + GitHub).
# Run on Sawyer's desktop: bash <(curl -fsSL https://f-o-b.vercel.app/desk-trio.sh)
# Or from repo: bash scripts/desk-trio.sh
set -euo pipefail

OPEN() {
  local url="$1"
  if command -v open >/dev/null 2>&1; then
    open "$url"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 || true
  else
    echo "Open: $url"
  fi
}

cat <<'EOF'
=== Trio proof — what is going on ===

Gate 2 DONE: Claude already answered GitHub #24.
Gate 1 BLOCKED: this cloud agent still has no Composio tools.

That junk "query data" tab was connect.composio.dev/mcp —
NOT a website. Close it. Never open that URL in Safari/Chrome.
Paste it only into Cursor's Add MCP → URL field.

Opening real pages only...
EOF

OPEN "https://cursor.com/dashboard/integrations"
OPEN "https://app.composio.dev"
OPEN "https://cursor.com/agents/bc-01a060ac-33ae-742d-85d0-f7658f3af396"

cat <<'EOF'

Clicks:

1) Tab: cursor.com/dashboard/integrations
   Sign in as Sawyer.
   Add / configure MCP for Cloud Agents → HTTP
   Name: composio
   URL:  https://connect.composio.dev/mcp
   Header: x-consumer-api-key = (from app.composio.dev → Install / AI Clients)
   Enable / Save

2) Backup if Integrations page looks empty:
   Agents chat → + left of message box → MCP Servers → Add MCP → HTTP
   Same URL + same header.

3) Reply in the agents chat:

composio done

If stuck, tell Cursor what the Integrations page shows.
EOF
