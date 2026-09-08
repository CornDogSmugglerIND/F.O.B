#!/usr/bin/env bash
# Desk helper for Triple Threat proof (Cursor + Claude + GitHub).
# After merge: bash <(curl -fsSL https://f-o-b.vercel.app/desk-trio.sh)
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

WRONG page: Auth Configs (Cursor toolkit API key rows).
  Do NOT create anything there for this gate.

RIGHT page: Sessions (or API Keys) → copy the MCP URL
  (often https://mcp.composio.dev/...). Paste into Cursor Agents
  MCP dropdown. Never open that URL in the browser.

Opening real pages only...
EOF

OPEN "https://dashboard.composio.dev"
OPEN "https://cursor.com/agents"
OPEN "https://cursor.com/agents/bc-01a060ac-33ae-742d-85d0-f7658f3af396"

cat <<'EOF'

Clicks:

1) Composio dashboard → left sidebar → **Sessions**
   (skip Auth Configs)
   Open/create a session → copy MCP URL (mcp.composio.dev/...)
   If no MCP URL on Sessions, try sidebar **API Keys** and tell Cursor what you see.

2) cursor.com/agents → MCP dropdown at the TOP → Add server
   Paste that URL → HTTP → Save/Enable

3) Reply in this chat:

composio done
EOF
