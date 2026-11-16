# NxtSend × ChatGPT Integration — Final Report

**Date:** 2026-11-16
**Branch:** `main`, on top of commit `1f284e0` (plus uncommitted work from
Workers A and B in the same checkout)
**Status of this work:** uncommitted, unpushed — by instruction. Nothing in
this report was committed or pushed.

## Executive summary

The ChatGPT.com integration is **implemented and unit-tested** in this
codebase: an OAuth 2.1 server (shared with the Muse connector, extended
for ChatGPT with CIMD, RFC 8707 resource binding and RFC 9207 `iss`), a
dedicated MCP server at `/api/mcp/chatgpt` with **54 tools**, a campaigns
widget following the verified Apps SDK pattern, a ChatGPT settings UI in
the Integration Center, an admin MCP overview split by client origin,
config with ChatGPT-aware precedence, 13 documentation files, and a
screenshots plan.

What is **not** done — and is not claimed: **no live ChatGPT connect was
attempted from this environment**, so the full OAuth grant flow inside
ChatGPT and the widget render inside a live ChatGPT client are
**PENDING**. Nothing has been **submitted to OpenAI** and no approval is
claimed. LinkedIn sends are **NOT SUPPORTED** (no tool exists).

**Test result (own runs, this session): full suite 1,404 tests passing
(119 files), 0 failures at the main commit; 1,405 passing (120 files)
after the live-verification fix (commit e72d58e added 1 test for the
ChatGPT metadata route). Production build green. TypeScript clean.**

## Live verification (2026-11-16, after Vercel deployed 70416f2 + e72d58e)

Verified on https://nxtsend.com by a read-only live browser check
(~17:42–17:57 UTC) plus direct `curl` checks:

| Check | Result |
| --- | --- |
| Vercel deploy of 70416f2 | **PASS** — new build live by ~17:45 UTC (health went from toolCount 18 to 54) |
| `GET /api/mcp/health` | **PASS** — `{"mode":"demo","mcpEnabled":true,"toolCount":54,"oauthConfigured":false,"protocolVersion":"2025-06-18","version":"1.0.0"}` |
| `GET /.well-known/oauth-protected-resource` (root) | **PASS** — resource `https://nxtsend.com/api/mcp`, both scope sets (`muse.*` + `nxtsend.*`) |
| `GET /.well-known/oauth-authorization-server` | **PASS** — issuer, authorize/token/revoke/register endpoints, `code_challenge_methods_supported: ["S256"]`, `token_endpoint_auth_methods_supported: ["none","client_secret_post"]` |
| `GET /.well-known/oauth-protected-resource/api/mcp/chatgpt` | **FIXED** — was 404 on the first live check (the route file never existed; the final report's first version wrongly listed it). Fixed in commit e72d58e and re-verified live: returns `{"resource":"https://nxtsend.com/api/mcp/chatgpt","authorization_servers":["https://nxtsend.com"],"scopes_supported":[...]}` |
| `POST /api/mcp/chatgpt` tools/list, no token | **PASS (demo behaviour)** — 503 `not_configured`, message now correctly "ChatGPT MCP is not available in Demo Mode…" (was "Muse MCP…" before e72d58e). Pre-auth tools/list only applies in live mode; demo refuses the whole surface by design |
| Integration page `/dashboard/integrations/chatgpt` (demo) | **PASS** — renders fully: "Demo Mode" badge + banner, no Connected/Verified state, "Not submitted to OpenAI", MCP URL, all OAuth endpoints, `nxtsend.*` scopes in plain words, 5 Developer Mode steps, grants/activity panels with platform-neutral demo messages ("OAuth grants are unavailable in Demo Mode.", "Activity is unavailable in Demo Mode."). **FIXED**: the page now lists all 54 tools in a "Tool manifest — 54 tools" section (was counts-only on the first live check) |
| Screenshots | **PENDING** — the live browser viewed the pages but cannot save PNG files into the repo, and no Chromium/Playwright exists in this VM to capture them. None fabricated. The 10 shots listed in `audit-screenshots/chatgpt-integration/README.md` still need capturing from a machine with a browser |
| Live OAuth grant flow inside ChatGPT + widget render | **PENDING** — needs migration 023 + 024 applied + `TOKEN_ENCRYPTION_KEY` set + a live Supabase project + a real ChatGPT account with Developer Mode, none of which exist yet |

## Status table

| Area | Status | Evidence / note |
|---|---|---|
| OAuth 2.1 server (PKCE S256, DCR, CIMD, RFC 8707/9207) | PASS | Worker A; 43 tests in `chatgpt-oauth.test.ts`; code re-read and confirmed |
| MCP server `/api/mcp/chatgpt` (54 tools, discovery, 401s, reconnect prompt) | PASS | Worker B; 15 + 36 + 6 tests; route now reads `isChatGptMcpEnabled()` |
| Campaigns widget (Apps SDK pattern) | PASS (code) / PENDING (live render) | 3 widget tests; pattern verified live from developers.openai.com/apps-sdk/build/custom-ux 2026-11-16; **never rendered inside a live ChatGPT client** |
| ChatGPT settings UI (registry, status, verify, detail page) | PASS | New `chatgpt` registry entry; status branches + verify outcomes tested (see below) |
| Grants UI scope descriptions (Worker A's open item) | FIXED | Detail page now renders every granted scope with its `SCOPE_DESCRIPTIONS` description — `nxtsend.*` included, not just `muse.*` |
| Admin MCP overview by client origin | PASS | `GET /api/admin/muse` returns `grantsByOrigin` + ChatGPT surface flags; admin page renders them |
| Config (`CHATGPT_MCP_ENABLED` / `CHATGPT_MCP_PUBLIC_URL`) | PASS | 8 precedence tests; catalogued in `.env.example`, `config-status.ts`, `check-config.mjs` |
| Docs (`docs/chatgpt-integration/`, 13 files) | PASS | Written from the actual implementation; 54-tool table generated from the manifest |
| Screenshots | PENDING | No screenshots fabricated; `audit-screenshots/chatgpt-integration/README.md` lists the 10 captures to take live |
| Full OAuth grant flow inside ChatGPT | PENDING | No live ChatGPT connect possible from this environment |
| OpenAI submission / approval | NOT CLAIMED | Nothing submitted; see APP_SUBMISSION.md |
| LinkedIn-send tools | NOT SUPPORTED | No authorized provider; official LinkedIn API exposes no connection/DM endpoints to standard developers |
| `get_date_range_report` | BLOCKED (by design) | Structured `date_range_not_supported`, 501 — stats loaders have no date filter |
| `private_key_jwt` client auth | NOT SUPPORTED | Accepted in CIMD documents but treated as public (PKCE); `client_assertion` refused `invalid_client` — JWKS fetch + RS256/ES256 verification + aud/exp/jti replay protection not implemented |
| Full server-side idempotency ledger | BLOCKED (limitation) | Replay-dedupe only where the product already has a dedupe store; a retried `create_campaign` / `create_sequence_step` would create a second row |
| In-memory rate limiting shared across instances | BLOCKED (limitation) | 120 req/min per grant, per serverless instance — not shared; no Redis/Upstash limiter |

## Architecture overview

ChatGPT calls **into** NxtSend (inverted direction). ChatGPT identifies
itself with a CIMD `client_id` URL or via DCR, completes OAuth
(authorization code + PKCE S256) on NxtSend's consent screen, then calls
the MCP server at `/api/mcp/chatgpt` (Streamable HTTP, JSON-RPC 2.0,
protocol `2025-06-18`) with a Bearer token bound by RFC 8707 to the
ChatGPT resource. The handler (`handleMcpRequest`, flavor `chatgpt`) is
shared with `/api/mcp`; the adapter, grant machinery and Supabase tables
are shared with the Muse connector. The two surfaces differ only in MCP
path, scope prefix (`nxtsend.*` vs `muse.*`), resource URL and redirect
URI. Demo Mode refuses the whole surface (503). Full detail:
`docs/chatgpt-integration/ARCHITECTURE.md`.

## Files created / modified (this worker)

### Created

- `docs/chatgpt-integration/` — 13 files: README.md, ARCHITECTURE.md,
  MCP_SERVER.md, OAUTH_SETUP.md, MCP_TOOLS.md, PERMISSIONS.md,
  SECURITY.md, DATABASE.md, VERCEL_DEPLOYMENT.md, CHATGPT_SETUP.md,
  APP_SUBMISSION.md, TESTING.md, TROUBLESHOOTING.md.
- `audit-screenshots/chatgpt-integration/README.md` — no screenshots;
  lists the 10 live captures to take after deploy.
- `src/lib/muse-connector/__tests__/chatgpt-config.test.ts` — 8 tests
  (flag/URL precedence).
- `NxtSend_ChatGPT_Integration_Final_Report.md` — this file.

### Modified (this worker; Workers A and B's files listed separately in git status)

- `src/lib/muse-connector/oauth/config.ts` — `isChatGptMcpEnabled()`,
  `getChatGptPublicUrl()` (ChatGPT var wins, else MUSE_* var, else
  `NEXT_PUBLIC_APP_URL` / request origin); shared `parseEnabledFlag` /
  `parsePublicUrl` helpers; `MuseMcpEnv` extended. `isMuseMcpEnabled`
  behaviour unchanged.
- `src/lib/muse-connector/oauth/index.ts` — re-exports the two new helpers.
- `src/app/api/mcp/chatgpt/route.ts` — now reads `isChatGptMcpEnabled()`
  (was `isMuseMcpEnabled()`).
- `src/lib/muse-connector/grants.ts` — `grantOriginForClient()`,
  `summarizeGrantsByOrigin()`, `countActiveGrantsByOrigin()` (with
  workspace/user filter; scope-prefix fallback for loopback-only clients).
- `src/lib/integrations-center/registry.ts` — new `chatgpt` entry (kind
  `adapter`; env vars `CHATGPT_MCP_ENABLED`, `CHATGPT_MCP_PUBLIC_URL`,
  `TOKEN_ENCRYPTION_KEY`; Developer Mode path, MCP URL, OAuth endpoints,
  CIMD note, ChatGPT redirect URI, `nxtsend.*` scopes in plain words,
  "Not submitted to OpenAI").
- `src/lib/integrations-center/status.ts` — `chatgptGrantsActive` option
  + `chatgpt` status branch (Demo → Demo Mode; real grant → Connected
  and Verified; enabled without grant → Connected but Not Verified).
- `src/lib/integrations-center/verify.ts` — `chatgpt` verify case (demo
  + live): no safe read-only verification call; no outbound call made.
- `src/app/api/integrations/status/route.ts` — passes
  `chatgptGrantsActive` (by-origin, workspace-filtered); `museGrantsActive`
  keeps its existing query (unchanged behaviour).
- `src/app/api/admin/muse/route.ts` — response adds `grantsByOrigin`,
  `chatgptMcpEnabled`, `chatgptPublicUrl` (demo returns labelled zeros).
- `src/app/(admin)/admin/integrations/muse-ai/page.tsx` — overview adds
  the ChatGPT surface + "Grants by client origin" (Muse / ChatGPT /
  Other / Total) panels; links to the ChatGPT detail page.
- `src/lib/admin/platform-server.ts` — `getSystemHealth()` adds a
  `chatgpt-mcp` check mirroring `muse-mcp`.
- `src/app/(dashboard)/dashboard/integrations/[id]/page.tsx` —
  `MuseLivePanels` generalised into platform-parameterised
  `ConnectorLivePanels` (`muse` | `chatgpt`) with per-platform copy
  (endpoints, scopes, connect steps, security notes); new
  `ChatGptLivePanels`; grants filtered per platform (scope prefix or
  CIMD origin); **every granted scope now renders with its
  `SCOPE_DESCRIPTIONS` description** (Worker A's open item — fixed);
  disconnect text extended for `chatgpt`; activity panel notes the
  audit log is shared across both platforms.
- `src/components/dashboard/IntegrationCenterBits.tsx` — `chatgpt` icon
  (`MessageSquare`).
- `.env.example` — `CHATGPT_MCP_ENABLED=` / `CHATGPT_MCP_PUBLIC_URL=`
  with precedence comments; states no `CHATGPT_OAUTH_CLIENT_SECRET`
  exists and `OPENAI_API_KEY` is NOT required for the connection.
- `src/lib/config-status.ts`, `scripts/check-config.mjs` — both new vars
  in the "integrations" group (parity tests pass).
- Tests extended: `grants.test.ts` (+4: origin classification,
  by-origin counts), `center.test.ts` (+4: chatgpt status branches,
  registry entry, scope-description coverage, verify outcomes; plus
  `chatgpt` added to the demo-mode and registry-id assertions).

Untouched as instructed: no commit, no push; original 18 Muse tools and
their classifications unchanged; billing, admin bootstrap and existing
send paths untouched.

## MCP endpoint

`POST https://nxtsend.com/api/mcp/chatgpt` — Streamable HTTP, JSON-RPC
2.0, `POST` only (`GET` → 405). `initialize`, `tools/list` and
`resources/list` answer **without a token** (static metadata only; every
tool annotated `Requires OAuth`, `_meta.requiresOAuth: true`). Tool calls
and `resources/read` require a valid token (401 + `WWW-Authenticate`
with `resource_metadata`); insufficient scope → HTTP 200 tool result,
`isError: true`, `code: missing_scope`, `reconnect: true`; demo mode →
503; rate limit 120 req/min per grant (429, `Retry-After: 60`).
`initialize` returns `instructions` whose first 512 chars carry:
confirm IDs before mutating, LinkedIn sends NOT supported, destructive
actions need explicit confirmation, workspace-scoped data. Every tool
result carries `content` + `structuredContent`.

## OAuth endpoints

| Endpoint | Notes |
|---|---|
| `GET/POST /api/muse/oauth/authorize` | Consent screen (client name + origin + platform); approve/deny |
| `POST /api/muse/oauth/token` | `authorization_code` + `refresh_token`; rotation, reuse revokes grant |
| `POST /api/muse/oauth/revoke` | RFC 7009 |
| `POST /api/muse/oauth/register` | RFC 7591 DCR, public clients by default |
| `GET /.well-known/oauth-authorization-server` | RFC 8414; S256 only; `token_endpoint_auth_methods: ["none", "client_secret_post"]` — no `private_key_jwt` |
| `GET /.well-known/oauth-protected-resource` | RFC 9728 root metadata (both resources) |
| `GET /.well-known/oauth-protected-resource/api/mcp/chatgpt` | RFC 9728 metadata for the ChatGPT resource |
| `GET /.well-known/oauth-protected-resource/api/mcp` | RFC 9728 metadata for the Muse resource |

Redirect URIs (exact match): ChatGPT
`https://chatgpt.com/connector_platform_oauth_redirect`; Muse
`https://agent.meta.ai/api/hatch/oauth/callback`; loopback local-only.
Scopes: `nxtsend.read` / `nxtsend.write` / `nxtsend.send` (canonical);
`muse.*` work as aliases. Tiers independent — `send` does NOT imply
`write`/`read`. RFC 8707 `resource` validated byte-for-byte
(`https://<origin>/api/mcp/chatgpt` for ChatGPT); `invalid_target` on
mismatch; defaults per platform. RFC 9207 `iss` in authorize redirects
and token responses. CIMD: https client_id URL, 5 s timeout, 64 KB cap,
~5 min memory cache, ephemeral (never persisted), DCR as fallback.
Codes: 10 min single-use; access tokens 1 h; refresh tokens 60 d.

## All 54 MCP tools

36 Read, 14 Write, 4 Sensitive write. The original 18 Muse tools are
unchanged; 36 were added for ChatGPT. Annotations: `readOnlyHint: true`
for 35 tools, `destructiveHint: true` for exactly `delete_lead`,
`delete_campaign`, `send_email`, `send_inbox_reply`,
`openWorldHint: false` everywhere. **Exception:** `get_conversation`
is Read-classified but `readOnlyHint: false` — opening a thread marks
messages read (a real state change, declared in the tool).

| Tool | Classification | readOnlyHint | destructiveHint |
|---|---|---|---|
| `list_leads` | Read | true | false | List leads in the user's workspace (paginated, searchable). |
| `get_lead` | Read | true | false | Fetch one lead with its tags, list membership and activity summary. |
| `list_campaigns` | Read | true | false | List campaigns with status, channel and enrollment counts. |
| `get_campaign_activity` | Read | true | false | Read a campaign's execution/activity history. |
| `list_conversations` | Read | true | false | List inbox conversations (email/LinkedIn) with unread state. |
| `get_conversation` | Read | false | false | Read one conversation's message history. Marks the thread read, matching the product UI. |
| `get_usage_summary` | Read | true | false | Current plan, usage counters and limit headroom for the workspace. |
| `get_integration_statuses` | Read | true | false | Integration Center statuses (no secret values, presence only). |
| `create_lead` | Write | false | false | Create a lead in the workspace (deduplicated by email). |
| `update_lead` | Write | false | false | Update a lead's fields, tags or list membership. |
| `create_campaign` | Write | false | false | Create a draft campaign with sequence steps. Never activates sending by itself. |
| `pause_campaign` | Write | false | false | Pause an active campaign (stops future steps). |
| `resume_campaign` | Write | false | false | Resume a paused campaign. Actual sending additionally depends on a connected, authorized provider. |
| `archive_campaign` | Write | false | false | Archive a campaign (reversible from the dashboard). |
| `draft_outreach_message` | Write | false | false | Generate an AI draft for human review in the sequence editor. Produces text only — it cannot send anything. |
| `send_email` | Sensitive write | false | true | Send one email through the workspace's configured provider. Suppression list is checked first and fails closed. Approval required every time. |
| `send_inbox_reply` | Sensitive write | false | true | Send a reply inside an existing inbox conversation (email channel only; LinkedIn replies stay refused until an authorized provider exists). Approval required every time. |
| `delete_lead` | Sensitive write | false | true | Permanently delete a lead and its enrollments. Approval required every time. |
| `list_linkedin_accounts` | Read | true | false | List the workspace's connected LinkedIn accounts with their provider, status, warm-up state and daily limits. Use it to see which LinkedIn accounts exist and whether one is connected before talking about LinkedIn sending |
| `get_linkedin_account` | Read | true | false | Fetch one connected LinkedIn account by id: provider, handle, auth status, warm-up program and daily limits. Use it when the user asks about a specific account's health or limits. Read-only: it never changes the account. |
| `get_subscription_info` | Read | true | false | Get the workspace's subscription: plan, subscription status, current period end and what the plan is based on. Use it when the user asks what plan they are on or when it renews. Read-only: it never changes billing. |
| `get_account_limits` | Read | true | false | Get the workspace's sending limits: per-account daily LinkedIn limits (connection requests, messages, profile views) with today's counted usage, plus the workspace safety settings (daily connection cap, working hours, ra |
| `search_campaigns` | Read | true | false | Search campaigns by name, optionally filtered by status (draft, active, paused, archived). Use it to find a campaign when you only know part of its name. Returns matching campaigns with status, channel and enrollment cou |
| `stop_campaign` | Write | false | false | Stop a campaign: archives it, so no further sequence steps run. Use it when the user asks to stop or end a campaign. Reversible from the dashboard (un-archive). It never deletes the campaign or its leads. |
| `delete_campaign` | Sensitive write | false | true | Permanently delete a campaign and its sequence steps and enrollments. Use it only when the user explicitly asks to delete a campaign — it cannot be undone. Approval required every time. |
| `get_campaign_performance` | Read | true | false | Get one campaign's performance: prospects, enrollment progress, LinkedIn and email outcomes, replies, meetings booked and step-execution counts, computed from real records. Use it when the user asks how a campaign is doi |
| `get_campaign_execution_status` | Read | true | false | Get a campaign's execution status: its sequence steps, recent activity entries and the recorded step executions (sent, simulated, skipped, failed) for the campaign. Use it to check what actually ran and what was skipped. |
| `search_leads` | Read | true | false | Search leads by name, email or company (case-insensitive substring). Use it to find a lead when you only know part of a name, email or company. Returns matching leads, workspace-scoped. Read-only. |
| `import_leads` | Write | false | false | Import a batch of leads (up to 100) into the workspace. Duplicates are skipped, never created twice: an email already in the workspace or repeated inside the batch is reported as skipped. Returns how many were imported,  |
| `add_leads_to_campaign` | Write | false | false | Add leads to a campaign as pending enrollments — the leads are queued for the sequence, nothing is sent by adding them. Already-enrolled leads are skipped, not duplicated. Returns enrolled, skipped and any lead ids that  |
| `remove_leads_from_campaign` | Write | false | false | Remove leads from a campaign (drops their enrollments). The lead records themselves are kept. Use it when the user asks to take leads out of a campaign. Removing a lead that was never enrolled is a no-op. |
| `detect_duplicate_leads` | Read | true | false | Find duplicate leads in the workspace: groups sharing an email or a matching name + company, with the evidence for each group. Use it before importing or cleaning up leads. Read-only: it never merges or deletes anything. |
| `get_lead_activity_history` | Read | true | false | Get one lead's full activity history: their inbox messages and the campaign activity for every campaign they are enrolled in. Use it when the user asks what happened with a specific lead. Read-only. |
| `list_leads_by_campaign` | Read | true | false | List the leads enrolled in a campaign, with each enrollment's status and current step. Use it to see who is in a campaign and how far each lead has progressed. Read-only. |
| `get_campaign_sequence` | Read | true | false | Get a campaign's sequence steps in order: step type, delay, subject and content. Use it to show or review the steps of a campaign before editing them. Read-only. |
| `create_sequence_step` | Write | false | false | Add one step to the end of a campaign's sequence (connection request, LinkedIn message, email, wait, condition, like post, view profile or endorse skills). Email and LinkedIn-message steps need content. Creating a step n |
| `update_sequence_step` | Write | false | false | Change one sequence step in place (type, delay, subject, content). The step keeps its position. Use it to fix a step without rebuilding the whole sequence. It never sends anything. |
| `reorder_sequence_steps` | Write | false | false | Reorder a campaign's sequence steps: pass the step ids in the new order. The list must contain exactly the campaign's current steps, no more and no fewer. Use it when the user asks to move steps around. It never sends an |
| `get_scheduled_follow_ups` | Read | true | false | List scheduled follow-up replies that are still queued for the workspace (earliest due first), optionally for one conversation. These are replies waiting to be sent later — nothing here sends one. Read-only. |
| `get_sequence_execution_status` | Read | true | false | Get the execution status of a campaign's sequence: the recorded step executions grouped by step (sent, simulated, skipped, stopped, failed), with counts per step. Use it to see which steps ran and which were skipped. Rea |
| `get_pending_actions` | Read | true | false | List pending LinkedIn automation actions: enrollments still waiting on a step, and recorded executions still in progress. Use it to see what is queued. Read-only: it never triggers an action, and there is no tool that se |
| `get_failed_actions` | Read | true | false | List failed or skipped LinkedIn automation actions: recorded executions with a failed or skipped outcome, with the recorded reason. Use it to find out what went wrong or was held back by the safety gate. Read-only: it ne |
| `get_automation_execution_report` | Read | true | false | Get a per-campaign automation execution report: execution counts by outcome (sent, simulated, skipped, stopped, failed) for each campaign, plus a workspace total. Use it to summarise what the automation actually did. Rea |
| `search_conversations` | Read | true | false | Search inbox conversations by contact name, email, company or subject. Use it to find a thread when you only know who it is with. Returns matching conversations with unread state. Read-only. |
| `get_message_execution_status` | Read | true | false | Get the recorded status of one message by its id or by its idempotency key (with the conversation id): sent, simulated, failed or suppressed, with the provider message id when one exists. Use it to check whether a messag |
| `get_failed_messages` | Read | true | false | List failed or suppressed messages in the workspace, with the recorded error for each. Use it to find messages that did not go out and why. Read-only: it never retries a send. |
| `compare_campaigns` | Read | true | false | Compare two or more campaigns side by side: per-campaign performance (prospects, replies, meetings booked, executions), the aggregate across them, and each campaign's delta from the group mean. Use it when the user asks  |
| `get_date_range_report` | Read | true | false | Ask for a performance report over a date range. This is NOT supported: the stats loaders compute over all-time records and cannot filter by date, so this tool always answers with an honest not-supported result instead of |
| `get_performance_summary` | Read | true | false | Get the workspace-wide performance summary: total leads and campaigns, aggregate enrollment progress, LinkedIn and email outcomes, replies, meetings booked and execution counts across all campaigns. Use it for an overall |
| `get_usage_report` | Read | true | false | Get the workspace usage report: plan and usage counters with limit headroom, plus the account limits and safety settings that cap sending. Use it when the user asks about usage or whether they are near a limit. Read-only |
| `get_profile` | Read | true | false | Get the connected NxtSend user and workspace: the user id and workspace id the current OAuth grant belongs to, the granted scopes, and the workspace plan. Use it to confirm whose account is connected before doing anythin |
| `search` | Read | true | false | Search NxtSend as a company knowledge source: matches leads and campaigns by name, email or company and returns hits with an id, title, snippet and a link to the record in the NxtSend dashboard. Use it to find a lead or  |
| `fetch` | Read | true | false | Fetch one record by id — a lead or a campaign — and return the full record. Use it after search, when you have the id of the record you want to read in detail. Read-only. |
| `render_campaigns_widget` | Read | true | false | Render the campaign dashboard widget: a visual card list of campaigns with status and performance. Always call list_campaigns first, then pass its results here — this tool only renders, it never fetches data. It takes ca |

Descriptions, inputs and side effects for every tool are in
`docs/chatgpt-integration/MCP_TOOLS.md` (table generated from
`src/lib/muse-connector/manifest.ts`).

Notable tools: `get_profile` (Read, `_meta: {"openai/profile": true}` —
grant identity only, no secrets); `search` + `fetch` (Read — knowledge
tools returning `{id, type, title, snippet, url}` / the record);
`render_campaigns_widget` (Read — "Always call list_campaigns first…",
`_meta.ui.resourceUri` + `_meta["openai/outputTemplate"]`:
`ui://widget/campaigns.html`).

## Database changes

- **Migration 023** (`023_muse_oauth.sql`, reused): creates
  `muse_oauth_clients`, `muse_oauth_codes`, `muse_oauth_tokens` (RLS
  enabled, zero policies, service-role only). No new OAuth tables for
  ChatGPT.
- **Migration 024** (`024_chatgpt_oauth_resource.sql`, new): adds
  nullable `resource TEXT` to `muse_oauth_codes` and
  `muse_oauth_tokens` + index `idx_muse_oauth_tokens_resource`. Nullable
  on purpose (legacy rows = Muse resource); the store retries inserts
  without the column pre-migration.
- No token/code values stored (SHA-256 hashes only). No "last used"
  time stored — the UI says "not tracked", never invented. CIMD clients
  never persisted.

## Security notes

- Tokens/codes as SHA-256 hashes only; no token value in any query,
  log or UI. Refresh rotation + reuse detection revokes the whole grant.
- OAuth tables RLS-enabled with zero policies (service role only).
- Grants scoped to one user + one workspace + one RFC 8707 resource.
- Scope enforcement per tool call, server-side, via `grantHasTier`.
- `private_key_jwt` not supported (see status table for the exact reason).
- Audit: every tool call logged as `muse.tool.<name>` (shared with the
  Muse connector); OAuth events as `MUSE_OAUTH_*`; no token/secret/body
  material in audit rows.
- Rate limiting is in-memory per instance (limitation — see status table).
- Demo Mode refuses the whole surface; the demo persona is never served
  to ChatGPT.

## ChatGPT UI implementation

- **Integration Center entry `chatgpt`** (Dashboard → Integrations →
  ChatGPT): Developer Mode path, MCP URL, OAuth endpoints, both
  well-known metadata URLs, CIMD note, ChatGPT redirect URI, scopes in
  plain words (`nxtsend.read` recommended default), grants, activity,
  tools, security notes, "Not submitted to OpenAI" stated plainly.
- **Status derivation:** Demo → Demo Mode; real ChatGPT grant →
  Connected and Verified; enabled without grant → Connected but Not
  Verified; disabled → Not Connected. A Muse grant never connects the
  ChatGPT entry (tested).
- **Detail page:** shared `ConnectorLivePanels` machinery; ChatGPT
  endpoints (incl. authorization-server + root + per-resource metadata),
  `nxtsend.*` scopes with descriptions, ChatGPT connect steps,
  ChatGPT grants (filtered by scope prefix / CIMD origin) with per-scope
  descriptions, shared activity history (labelled as shared), ChatGPT
  security notes (incl. `private_key_jwt` and RFC 8707 binding).
- **Test Connection** explains there is no safe read-only verification
  call — it makes no outbound call and never pretends.
- **Admin:** `GET /api/admin/muse` + admin page show the MCP overview
  with grants by client origin (Muse vs ChatGPT vs Other) behind
  `resolveAdminGate()`; `getSystemHealth()` adds a `chatgpt-mcp` check.
- The page **never** shows "Connected"/"Verified" without a real grant.

## Test + build results (own runs, this session)

- `npm test`: **1,404 tests passing, 0 failing, 119 files** (run
  2026-11-16 ~17:28). Baseline at Worker B's finish was 1,388; Worker C
  added **16 new tests** (8 ChatGPT config, 4 grants-by-origin, 4
  Integration Center) — 1,388 + 16 = 1,404, consistent.
- Targeted re-run of the 12 connector/integration files: **236 passing**,
  including `chatgpt-oauth` (43), `chatgpt` (15), `new-tools` (36),
  `widget` (3), ChatGPT route (6), `muse-oauth` (34), `mcp` (12),
  `adapter` (18), grants (12), `chatgpt-config` (8), center (43),
  `muse-connector` (6) — the Muse integration still passes.
- `npm run build`: **green** (run twice; `/api/mcp/chatgpt` in the route
  table, no errors). `npx tsc --noEmit`: clean.
- `npm run config:check`: lists `CHATGPT_MCP_ENABLED` /
  `CHATGPT_MCP_PUBLIC_URL` (MISSING in this dev env, as expected — they
  are optional and unset here).

## Vercel readiness

Ready to deploy as code: build green, no new dependencies, stateless
design (Vercel Hobby-safe; 10 s limit respected — every tool is a
bounded store lookup). Deploy checklist (owner steps):

1. Apply migrations 023 + 024 in Supabase.
2. Set `TOKEN_ENCRYPTION_KEY` and `NEXT_PUBLIC_APP_URL`
   (`https://nxtsend.com`) in Vercel; redeploy.
3. Optional: `CHATGPT_MCP_ENABLED` / `CHATGPT_MCP_PUBLIC_URL` only if
   the ChatGPT surface differs from the defaults.
4. Verify: `GET /api/mcp/health` (toolCount 54), both well-known
   metadata URLs, Integration Center ChatGPT entry.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Yes | Real origin; issuer + metadata + default resource URLs derive from it |
| `TOKEN_ENCRYPTION_KEY` | Yes | Base64 of 32 bytes; signs authorize-state; authorize returns 503 without it |
| `CHATGPT_MCP_ENABLED` | No | `"false"` disables the ChatGPT MCP surface; unset → `MUSE_MCP_ENABLED`; both unset → enabled; does not gate OAuth |
| `CHATGPT_MCP_PUBLIC_URL` | No | Precedence: `CHATGPT_MCP_PUBLIC_URL` → `MUSE_MCP_PUBLIC_URL` → `NEXT_PUBLIC_APP_URL` → request origin |
| `MUSE_MCP_ENABLED` / `MUSE_MCP_PUBLIC_URL` | No | Fallbacks for the ChatGPT vars (and the Muse surface's own vars) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Already required for live mode |

**No `CHATGPT_OAUTH_CLIENT_SECRET`** — none exists or is needed (DCR /
CIMD public clients). **No `OPENAI_API_KEY` required** for the
ChatGPT.com integration — the MCP connection needs no OpenAI key; the
existing AI providers are reused only for message drafting via
`draftOutreachMessage`.

## Credentials still required (owner steps)

- `TOKEN_ENCRYPTION_KEY` — generate (`openssl rand -base64 32`), set in
  Vercel. Without it, authorize returns 503.
- Migrations 023 + 024 applied in Supabase.
- `NEXT_PUBLIC_APP_URL` set to the real origin.
- No other credentials. In particular: no OpenAI key, no client secret,
  no Google/Apple credential is needed for this integration.

## ChatGPT plan limitations

- Documented path: **Business / Enterprise / Edu** plans, with
  workspace-admin control over connectors.
- **Reports exist of free personal accounts also working** with
  Developer Mode — unverified reports, not the documented path.
- **Developer Mode is labelled high-risk by OpenAI and its availability
  changes often** — re-check live. If the setting is missing, check the
  plan and whether the workspace admin disabled custom connectors.
- No live ChatGPT connect was attempted from this environment, so plan
  availability was **not** verified here.

## OpenAI submission readiness

**NOT ready to claim submission, and not submitted.** What exists is
submission-shaped (pre-classified 54-tool manifest, OAuth + metadata
following the platform's public-client + PKCE model, Apps SDK widget
following the verified pattern, honest limitations declared in-product),
but before any submission the owner must:

- [ ] Verify the full OAuth grant flow inside ChatGPT live.
- [ ] Verify the widget renders inside a live ChatGPT client and capture
      the screenshots in `audit-screenshots/chatgpt-integration/README.md`.
- [ ] Verify live `tools/list` (54 tools) and `get_profile` from ChatGPT.
- [ ] Re-check OpenAI's current submission requirements live (process,
      criteria, timeline and fees were **not** verified from a primary
      OpenAI source during this work — APP_SUBMISSION.md claims none).

## Remaining blockers / PENDING items

1. **Live ChatGPT verification** — full grant flow + widget render +
   live tools/list. Needs the deployed site + a real ChatGPT account
   with Developer Mode. Not possible from this environment.
2. **OpenAI submission** — owner decision + process; nothing submitted.
3. **Persistent idempotency ledger** — not built (limitation, documented);
   retried `create_campaign` / `create_sequence_step` would duplicate.
4. **Shared rate limiter** — not built (limitation, documented);
   in-memory per-instance only.
5. **`private_key_jwt`** — deliberately not implemented (reason documented).
6. **LinkedIn sends** — deliberately not supported (no authorized provider).
7. **Screenshots** — none exist yet; capture list in
   `audit-screenshots/chatgpt-integration/README.md`.

## What was deliberately left out (with reasons)

- No commit / push (instructed).
- No new OAuth tables (migration 023 tables reused; 024 only adds a column).
- No separate ChatGPT grants/activity API (the `/api/muse/grants` and
  `/api/muse/activity` routes are platform-agnostic; the UI filters by
  platform) — duplication was avoided by generalising the panels.
- No separate admin ChatGPT page (extended the existing admin muse-ai
  page + `GET /api/admin/muse` instead of rebuilding).
- No `CHATGPT_OAUTH_CLIENT_SECRET` (public clients; DCR/CIMD).
- No fake screenshots, no claimed live verification, no claimed approval.
