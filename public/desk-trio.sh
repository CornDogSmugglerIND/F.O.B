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

Goal: prove Cursor + Claude + GitHub can talk.
Gate 2 DONE (Claude already answered GitHub #24).
Gate 1 BLOCKED: THIS cloud agent still cannot see Composio tools.

What went wrong earlier:
  https://connect.composio.dev/mcp is NOT a website.
  Opening it in Safari/Chrome shows junk / query-looking text.
  Do NOT paste that URL into a browser address bar.
  Paste it only into Cursor's "Add MCP → HTTP → URL" field.

Opening only real pages now (no MCP endpoint)...
EOF

OPEN "https://cursor.com/agents/bc-01a060ac-33ae-742d-85d0-f7658f3af396"
OPEN "https://app.composio.dev"
OPEN "https://f-o-b.vercel.app/trio-setup.html"

cat <<'EOF'

Do these clicks (nothing else):

1) Browser tab that just opened: cursor.com/agents/... 
   Sign in as Sawyer if asked.
   You should see THIS chat: Cursor+Claude+GitHub

2) On that page, find the message box at the bottom.
   Click the + button to the LEFT of that box.
   Choose: MCP Servers → Add MCP → HTTP

3) In the Add MCP form (this is where the URL goes — NOT Safari):
   Name: composio
   URL:  https://connect.composio.dev/mcp
   Header name:  x-consumer-api-key
   Header value: (from the app.composio.dev tab → AI Clients → copy key)
   Save / Connect

4) Come back to that same chat and type exactly:

composio done

If you do not see a + next to the prompt, tell me what you DO see
(screenshot description is fine). Do not open random Install links.
EOF
