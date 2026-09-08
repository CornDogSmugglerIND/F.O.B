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
  1) This cloud agent sees Composio tools
  2) Real product-map comment on GitHub issue #24

Opening the tabs you need now...
EOF

OPEN "https://cursor.com/en-US/install-mcp?name=composio&config=eyJ1cmwiOiJodHRwczovL2Nvbm5lY3QuY29tcG9zaW8uZGV2L21jcCJ9"
OPEN "https://app.composio.dev"
OPEN "https://cursor.com/agents/bc-01a060ac-33ae-742d-85d0-f7658f3af396"
OPEN "https://github.com/CornDogSmugglerIND/F.O.B/issues/24"
OPEN "https://github.com/CornDogSmugglerIND/F.O.B/settings/secrets/actions"
OPEN "https://f-o-b.vercel.app/trio-setup.html"

cat <<'EOF'

Do in order:
1) Finish Composio install / OAuth.
2) From app.composio.dev → AI Clients, copy API key.
   On Cloud Agents MCP, set header: x-consumer-api-key = <that key>
   (or + menu on cursor.com/agents → MCP Servers → Add MCP)
3) Preferred: Claude Cowork comments answers on issue #24.
   Backup: run:  claude setup-token
           add GitHub secret CLAUDE_CODE_OAUTH_TOKEN
           comment @claude on issue #24
4) Message the Cursor agent exactly:

I'm home. Check now.

Phone checklist: https://f-o-b.vercel.app/trio-setup.html
EOF
