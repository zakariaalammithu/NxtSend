# Claude Setup (connecting from Claude)

## The path: custom connector (works today, no submission)

Nothing has been submitted to Anthropic, and NxtSend does not appear
in Claude's connector directory. The working path is Claude's **custom
connector** flow — add-by-URL — which needs no submission:

1. In Claude, open **Customize → Connectors → Add custom connector**.
2. Name it **NxtSend**.
3. Paste the MCP endpoint URL:
   `https://nxtsend.com/api/mcp/claude`
   (replace the origin with the deployment's public URL if it is not
   `nxtsend.com`).
4. Claude registers via Dynamic Client Registration or identifies
   itself with a CIMD `client_id` URL — **no client secret to copy**.
   Clients are public by default. Claude's Advanced-settings client
   ID/secret fields are an optional fallback for pre-registered
   clients only, **not required** for this connection.
5. Sign in on NxtSend's consent screen and choose the scopes. Pick
   **`claude.read` only** unless Claude genuinely needs to change or
   send things.
6. Use NxtSend from inside Claude. Sensitive writes (sending email,
   deleting a lead or a campaign) need your approval in Claude every
   single time — they can never be set to "Always allow".

The redirect URIs Claude registers are
`https://claude.ai/api/mcp/auth_callback` and
`https://claude.com/api/mcp/auth_callback`. Both are allowlisted on
NxtSend's side; only the `claude.ai` variant was confirmed in the
official Anthropic documentation fetched during implementation (see
OAUTH_SETUP.md) — if Claude reports a redirect mismatch, check that
the deployment's public URL is the one in
`CLAUDE_MCP_PUBLIC_URL` / `NEXT_PUBLIC_APP_URL`, and that the callback
Claude is sending is one of the two allowlisted URIs.

## Plan availability

Custom MCP connectors are available on **Pro and Max plans** (and on
Team / Enterprise). That is the availability as verified during this
work — **Anthropic changes these limits, so re-check live** in
Claude's current plan documentation before promising a user that a
given plan can connect. If the custom-connector option is missing in
Claude, check the plan first, then whether the workspace admin
disabled custom connectors.

No live Claude connect was attempted from the build environment, so
plan availability was **not** verified here against a real Claude
account.

## Directory listing (Level B) — a separate submission

Two levels, in Anthropic's model:

- **Level A — add-by-URL (custom connector):** works today, no
  submission, no review. This is the path above.
- **Level B — directory listing:** the connector appears in Claude's
  directory for other users to find. That requires a submission to
  Anthropic and a review (OAuth 2.1 + the MCP server are the
  technical prerequisites, and both exist here). **Submission has not
  been made and approval is not claimed.** Before any submission the
  owner must verify the full OAuth grant flow inside Claude live,
  verify the prompts surface and the `nxtsend://account` resource
  read, verify live `tools/list` (54 tools) and `get_profile`, and
  re-check Anthropic's current submission requirements live (process,
  criteria, timeline and fees were not verified from a primary
  Anthropic source during this work).

## What Claude sees after connecting

- **54 tools** (36 Read / 14 Write / 4 Sensitive write) — see
  MCP_TOOLS.md.
- **4 prompts** — campaign performance summary, lead follow-up draft,
  weekly performance report, duplicate-lead cleanup. Prompts are
  templates: they fetch no data themselves and never send, merge or
  delete.
- **2 resources** — the campaigns widget
  (`ui://widget/campaigns.html`) and the account resource
  (`nxtsend://account`: user, workspace, client, grant, scopes,
  audience — no secrets, no plan).
- **The widget has not been rendered inside a live Claude client
  yet** — that verification is PENDING.

## Managing the connection

- **In NxtSend:** Dashboard → Integrations → Claude.ai (Anthropic).
  The page shows the MCP URL, the OAuth endpoints, the `claude.*`
  scopes in plain words, the connect steps, "Your Claude grants"
  (with Revoke), shared activity, the 54-tool manifest and security
  notes. It never shows "Connected" without a real grant.
- **Revoke:** revoking a grant removes Claude's access immediately
  (every token for that client + user). A grant also goes inactive if
  its refresh token expires (60 days) or is revoked — reconnect from
  Claude to create a fresh grant.
- **In Claude:** remove the connector from Customize → Connectors to
  stop Claude calling NxtSend; also revoke the grant in NxtSend so
  the tokens die server-side.
