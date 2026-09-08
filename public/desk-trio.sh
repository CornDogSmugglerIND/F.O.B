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

IMPORTANT (corrected):
  Cloud Agents do NOT read .cursor/mcp.json (that is desktop only).
  Do NOT use the generic connect.composio.dev/mcp URL unless Triple
  Threat shows that. Copy the Triple Threat server URL from Composio —
  it often looks like https://mcp.composio.dev/... with a key in it.
  Paste that into Cursor's MCP dropdown — never open it as a webpage.

Opening real pages only...
EOF

OPEN "https://app.composio.dev"
OPEN "https://cursor.com/agents"
OPEN "https://cursor.com/agents/bc-01a060ac-33ae-742d-85d0-f7658f3af396"

cat <<'EOF'

Clicks:

1) Composio tab (app.composio.dev)
   Find MCP servers → the one named **Triple Threat**
   Copy its server URL (mcp.composio.dev/... with key — not a Safari page)

2) Cursor Agents tab (cursor.com/agents)
   Sign in as Sawyer
   MCP dropdown at the TOP → Add server → paste that URL → HTTP → Save/Enable

3) Come back to THIS chat and type:

composio done

   (or: list your available tools)

If Triple Threat is missing in Composio, tell Cursor what MCP servers you DO see.
EOF
