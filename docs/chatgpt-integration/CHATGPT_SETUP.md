# Connecting from ChatGPT

## Prerequisites

- NxtSend deployed with migrations 023 + 024 applied and
  `TOKEN_ENCRYPTION_KEY` + `NEXT_PUBLIC_APP_URL` set (see
  VERCEL_DEPLOYMENT.md).
- A ChatGPT account. See "Plan availability" below — availability
  changes often; re-check live.

## Steps

1. **Turn on Developer Mode.** In ChatGPT: **Settings → Connectors →
   Advanced → Developer mode** (on).
2. **Add the connector.** In the Connectors screen, add a connector
   with the MCP server URL:
   `https://nxtsend.com/api/mcp/chatgpt`
   (replace the origin with your deployment's public URL if it differs).
3. **Sign in on NxtSend.** ChatGPT opens NxtSend's consent screen.
   Sign in with your NxtSend account, check the client name, origin
   and platform (it must say ChatGPT), and choose the scopes.
   **Pick `nxtsend.read` only** unless ChatGPT genuinely needs to
   change or send things.
4. **Use NxtSend in ChatGPT.** Ask things like "show my campaigns" or
   "find the lead from Acme". ChatGPT lists tools without a token only
   as metadata; every real answer comes through your grant.
5. **Sensitive actions ask every time.** Sending an email, replying in
   the inbox, or deleting a lead/campaign always asks for your approval
   in ChatGPT first — it can never be set to "Always allow".
6. **Disconnect** any time from NxtSend: Dashboard → Integrations →
   ChatGPT → "Your ChatGPT grants" → Revoke grant. ChatGPT's access
   stops immediately.

## Plan availability (verified vs reported — re-check live)

- **Documented path: Business, Enterprise and Edu plans.** OpenAI
  documents custom connectors / Developer Mode for these plans, with
  workspace-admin control over which connectors are allowed.
- **Reports exist of free personal accounts also working** with
  Developer Mode, but that is not the documented path and it has not
  been verified from this environment.
- **Developer Mode is labelled high-risk by OpenAI** and its
  availability changes often. If the setting is missing in your
  ChatGPT: check that you are on a plan that offers it, and (on a
  workspace plan) that your workspace admin has not disabled custom
  connectors.
- **No live ChatGPT connect was attempted from this environment** —
  the full grant flow and the widget render inside ChatGPT are PENDING
  verification (see TESTING.md). If the connect flow fails in a way
  this document does not cover, report the exact ChatGPT error text;
  do not guess a fix.

## What ChatGPT will and will not do

- **Will:** read your leads/campaigns/inbox/usage, draft campaigns,
  create/update leads, manage sequence steps and enrollments, render
  the campaigns widget — all inside your workspace, inside the granted
  scopes.
- **Will not:** send LinkedIn connection requests or messages (no tool
  exists — NOT SUPPORTED), send email without your per-action approval,
  read another workspace, or use a token issued for the Muse connector.
- **Will not invent:** `get_date_range_report` answers "not supported"
  rather than inventing date-filtered numbers; performance tools return
  `null` for counts that do not exist rather than fabricating them.

## Troubleshooting (short version)

Full list: TROUBLESHOOTING.md. The three most common:

- **"Connector could not be added" / Developer Mode missing** — plan
  or workspace-admin restriction (see above).
- **401 on every tool call** — the grant expired, was revoked, or was
  issued for the wrong resource; reconnect from ChatGPT.
- **"Missing scope" answers** — the grant lacks the tier the tool
  needs; reconnect and grant the scope the prompt names.
