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
=== Trio proof — desk steps ===
Gates Cursor will check:
  1) This cloud agent sees Composio tools  ← STILL FAIL (only blocker)
  2) Real product-map on GitHub issue #24 ← PASS

IMPORTANT: Desktop Install MCP / Cowork Triple Threat ≠ gate 1.
You must add Composio on the Cloud Agents chat (+ → MCP Servers).

Opening the tabs you need now...
EOF

OPEN "https://cursor.com/agents/bc-01a060ac-33ae-742d-85d0-f7658f3af396"
OPEN "https://app.composio.dev"
OPEN "https://connect.composio.dev/mcp"
OPEN "https://github.com/CornDogSmugglerIND/F.O.B/issues/24"
OPEN "https://f-o-b.vercel.app/trio-setup.html"

cat <<'EOF'

Do in order (gate 2 already done — skip #24 unless you want to re-read):
1) On THIS cloud agent chat page (already opened):
   + (left of prompt) → MCP Servers → Add MCP → HTTP
   URL: https://connect.composio.dev/mcp
2) app.composio.dev → AI Clients → copy API key
   Set header on that MCP: x-consumer-api-key = <that key>
   Save. Desktop Cursor Settings MCP does not count.
3) Message this Cursor agent exactly:

composio done

   (or: I'm home. Check now.)

Phone checklist: https://f-o-b.vercel.app/trio-setup.html
EOF
