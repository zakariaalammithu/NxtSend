# NxtSend × Claude.ai Integration — Final Report

**Date:** 2026-11-17
**Branch:** `main`, on top of commit `66ddb78` (plus uncommitted
implementation work from the Claude build in the same checkout)
**Status of this work:** uncommitted, unpushed — by instruction. Nothing in
this report was committed or pushed. No code, tests or config were
touched by this report; docs and this report only.

## Executive summary

The Claude.ai integration is **implemented and unit-tested** in this
codebase: the shared OAuth 2.1 server extended for Claude (PKCE S256,
DCR, CIMD with Claude Code host detection, RFC 8707 resource binding,
RFC 9207 `iss`, `client_id_metadata_document_supported: true`), a
dedicated MCP server at `/api/mcp/claude` with **54 tools**, 4
**Claude-only prompts**, a new read-only `nxtsend://account` resource,
`claude.*` scopes, a Claude Integration Center entry, an admin MCP
overview split by client origin (Muse / ChatGPT / Claude / Other /
Total), a `claude-mcp` System Health check, Claude-aware config
precedence, 12 documentation files, and a screenshots plan.

What is **not** done — and is not claimed: **no live Claude connect was
attempted from this environment**, so the full OAuth grant flow inside
Claude, the prompts surfacing, the account-resource read and the widget
render inside a live Claude client are **PENDING**. Nothing has been
**submitted to Anthropic** and no approval is claimed. LinkedIn sends are
**NOT SUPPORTED** (no tool exists).

**Test result (own runs, this session): full suite 1,477 tests passing,
0 failing, 125 files. Production build green. TypeScript: clean —
`npx tsc --noEmit` passes (the one TS2802 error found during the
docs pass was fixed by the coordinator afterwards; see
"Discrepancies found", items 1–3, now FIXED).**

## Live verification

Verified on https://nxtsend.com by read-only live checks after the
Vercel deploy of commit 2c0ae30 (deploy landed ~18:36 UTC, 2026-11-16;
curl checks + a live browser check of the settings page at ~18:39–18:40
UTC):

| Check | Result |
| --- | --- |
| Vercel deploy of 2c0ae30 | **PASS** — Claude metadata route 404'd until ~18:36 UTC, then returned JSON |
| `GET /api/mcp/health` | **PASS** — `{"mode":"demo","mcpEnabled":true,"toolCount":54,"oauthConfigured":false,"protocolVersion":"2025-06-18","version":"1.0.0"}` |
| `GET /.well-known/oauth-protected-resource/api/mcp/claude` | **PASS** — `{"resource":"https://nxtsend.com/api/mcp/claude","authorization_servers":["https://nxtsend.com"],"scopes_supported":["muse.read","muse.write","muse.send","nxtsend.read","nxtsend.write","nxtsend.send","claude.read","claude.write","claude.send"],"bearer_methods_supported":["header"]}` |
| `GET /.well-known/oauth-protected-resource?resource=https://nxtsend.com/api/mcp/claude` | **PASS** — same Claude resource + all nine scopes |
| `GET /.well-known/oauth-authorization-server` | **PASS** — issuer, authorize/token/revoke/register endpoints, `grant_types_supported: ["authorization_code","refresh_token"]`, `code_challenge_methods_supported: ["S256"]`, `client_id_metadata_document_supported: true`, all nine scopes |
| `POST /api/mcp/claude` tools/list, no token | **PASS (demo behaviour)** — 503 `not_configured`, message "Claude MCP is not available in Demo Mode. Connect Supabase and configure OAuth to enable it." (tools/list requires a token on this flavour, like Muse; the 401 + `WWW-Authenticate` path is live-mode only) |
| Integration page `/dashboard/integrations/claude` (demo) | **PASS** — renders fully: "Claude.ai (Anthropic)" heading, Demo Mode badge + banner, MCP URL `https://nxtsend.com/api/mcp/claude`, both Claude redirect URIs, `claude.*` scopes in plain words, Customize → Connectors steps, 54-tool manifest (54 rows counted, 36 Read / 14 Write / 4 Sensitive write), "Not submitted to Anthropic", no Connected/Verified state |
| Naming note (by design, not a bug) | The page's implementation details still say "Muse": the OAuth endpoints are `/api/muse/oauth/*`, code paths `src/lib/muse-connector/…`, env fallbacks `MUSE_MCP_ENABLED`/`MUSE_MCP_PUBLIC_URL`, audit actions `muse.tool.*`. One OAuth server is deliberately shared by all three platforms (Muse, ChatGPT, Claude); renaming its paths would break the two live connectors for no functional gain |
| Screenshots | **PENDING** — the live browser viewed the page but cannot save PNG files into the repo, and no Chromium/Playwright exists in this VM. None fabricated. The 12 shots listed in `audit-screenshots/claude-integration/README.md` still need capturing from a machine with a browser |
| Live OAuth grant flow inside Claude + prompts surfacing + account-resource read + widget render | **PENDING** — needs migrations 023+024 applied + `TOKEN_ENCRYPTION_KEY` set in Vercel + a live Supabase project + a real Claude account on a plan with custom connectors (Pro/Max/Team/Enterprise) |

## Status table

| Area | Status | Evidence / note |
|---|---|---|
| OAuth 2.1 server extensions for Claude (PKCE S256, DCR, CIMD, RFC 8707/9207, `client_id_metadata_document_supported`) | PASS | 33 tests in `claude-oauth.test.ts`; code re-read and confirmed |
| MCP server `/api/mcp/claude` (54 tools, no pre-auth discovery, Claude instructions, prompts, account resource) | PASS | 22 tests in `claude.test.ts` + 4 HTTP-level route tests |
| Prompts (4, Claude-only, templates, validated args) | PASS | `prompts.ts`; covered in `claude.test.ts` (incl. Muse/ChatGPT `-32601`) |
| `nxtsend://account` resource (no secrets, no plan) | PASS | Covered in `claude.test.ts`; plan deliberately omitted |
| Claude settings UI (registry, status, verify, detail page) | PASS | `claude` registry entry; status branches + verify outcomes tested |
| Admin MCP overview by client origin (Muse / ChatGPT / Claude / Other / Total) | PASS | `GET /api/admin/muse` returns `grantsByOrigin` incl. `claude`; `claude-mcp` health check |
| Config (`CLAUDE_MCP_ENABLED` / `CLAUDE_MCP_PUBLIC_URL`) | PASS | 8 precedence tests; catalogued in `.env.example`, `config-status.ts`, `check-config.mjs` |
| Docs (`docs/claude-integration/`, 12 files) | PASS | Written from the actual implementation; 54-tool table generated from the manifest |
| Screenshots | PENDING | No screenshots fabricated; `audit-screenshots/claude-integration/README.md` lists the 12 captures to take live |
| Full OAuth grant flow inside Claude | PENDING | No live Claude connect possible from this environment |
| Prompts surfacing + account resource read + widget render in live Claude | PENDING | Needs deployed site + real Claude account |
| Anthropic submission / approval | NOT CLAIMED | Nothing submitted; directory listing is a separate submission + review |
| LinkedIn-send tools | NOT SUPPORTED | No authorized provider; official LinkedIn API exposes no connection-request/DM endpoints to standard developers |
| `get_date_range_report` | BLOCKED (by design) | Structured `date_range_not_supported`, 501 — stats loaders have no date filter |
| `private_key_jwt` client auth | NOT SUPPORTED | Declared in a CIMD document → treated as public (PKCE); `client_assertion` refused `invalid_client` — JWKS fetch + RS256/ES256 verification + aud/exp/jti replay protection not implemented |
| `offline_access` scope | NOT ADDED (deliberate) | Anthropic appends it only when listed in AS metadata; refresh tokens are issued anyway |
| Full server-side idempotency ledger | BLOCKED (limitation) | Replay-dedupe only where the product already has a dedupe store; a retried `create_campaign` / `create_sequence_step` would create a second row |
| In-memory rate limiting shared across instances | BLOCKED (limitation) | 120 req/min per grant, per serverless instance — not shared; no Redis/Upstash limiter |
| `npx tsc --noEmit` | **FIXED** | One TS2802 error in the new `claude.test.ts` (spread of a `MapIterator`); fixed with `Array.from(byName.keys())` after the docs pass — re-run clean |
| 401 error text on the Claude flavor | **FIXED** | Now flavor-aware ("a valid Claude access token is required") — fixed after the docs pass |
| `claude.com` redirect variant | **Caveat** | Allowlisted but NOT confirmed in the official Anthropic doc fetched during implementation — only `claude.ai` was (see Discrepancies, item 5) |

## Project audit findings

Reading the implementation (not inventing from the brief) confirmed
every fact the docs claim, and turned up the discrepancies below.
The brief's implementation facts were verified file by file:

- **Base:** Muse (1806e2a) + ChatGPT (70416f2, e72d58e, 66ddb78)
  present; Claude adds a third flavor to the same shared handler.
  The Muse and ChatGPT flavors keep their exact prior behaviour
  (their test suites pass unchanged in count except the documented
  expectation updates).
- **Tool counts verified from the manifest:** 54 tools — Read 36,
  Write 14, Sensitive write 4. `readOnlyHint: true` for 35 tools
  (`get_conversation` is the one Read-classified exception),
  `destructiveHint: true` for exactly `delete_lead`,
  `delete_campaign`, `send_email`, `send_inbox_reply`,
  `openWorldHint: false` everywhere.
- **Scopes verified:** `claude.read/write/send` in
  `SCOPE_TIER_MAP` with the same tiers as `muse.*`/`nxtsend.*`;
  `SCOPE_DESCRIPTIONS` plain-words entries present; tier check
  (`grantHasTier`) prefix-agnostic; tiers independent.
- **Migrations verified:** no new migration, no new OAuth tables —
  023 creates the three tables, 024 adds the nullable `resource`
  column. The Claude work touches neither migration file.
- **Config verified:** `isClaudeMcpEnabled()` /
  `getClaudePublicUrl()` precedence is CLAUDE_* → MUSE_* →
  `NEXT_PUBLIC_APP_URL` → request origin, exactly as documented.
- **No `CLAUDE_OAUTH_CLIENT_SECRET`** anywhere in code, env example
  or docs — verified by search. `ANTHROPIC_API_KEY` is not required
  for the connection (only for `draftOutreachMessage`).
- **Widget verified:** `ui://widget/campaigns.html` unchanged and
  shared; the Apps SDK pattern (dual `_meta`, `window.openai` bridge
  + postMessage fallback) is the same code as the ChatGPT surface.

## Discrepancies found (implementation vs what the docs should claim)

These were found by reading the code. Items 1–3 were **FIXED by the
coordinator after the docs pass** (see the FIXED notes below); items
4–7 remain as documented — the docs state each one honestly instead
of papering over it.

1. **`npx tsc --noEmit` FAILED — one error in a new test file — FIXED.**
   `src/lib/muse-connector/__tests__/claude.test.ts(206,16): error
   TS2802: Type 'MapIterator<string>' can only be iterated through
   when using the '--downlevelIteration' flag or with a '--target'
   of 'es2015' or higher.` The line was
   `expect([...byName.keys()].some(...))`. Fixed by the coordinator
   with `Array.from(byName.keys())`; `npx tsc --noEmit` now passes
   clean and the full suite still passes (1,477 tests).
2. **401 error text is not flavor-aware — FIXED.** In
   `src/lib/muse-connector/mcp.ts` the unauthenticated response for
   every flavor read "Unauthorized: a valid Muse access token is
   required." Fixed by the coordinator: the message now uses the
   flavor label ("a valid Claude access token is required" on the
   Claude flavor), matching the already flavor-aware
   `WWW-Authenticate` header.
3. **Consent-screen comment promises a warning that is not rendered — FIXED.**
   The comment above `consentPage` in
   `src/app/api/muse/oauth/authorize/route.ts` said the screen shows
   the redirect hostname "and warns when the only registered redirect
   URIs are loopback addresses". Only the redirect-hostname line is
   actually rendered (`redirectLine`); no loopback warning exists in
   the HTML. Fixed by the coordinator: the comment now says only what
   the screen does (shows the redirect hostname).
4. **Pre-existing ChatGPT doc inaccuracy found while reading.**
   `docs/chatgpt-integration/MCP_SERVER.md` (differences table) says
   the Muse flavor's missing-scope answer is the "same structured
   reconnect prompt shape" as ChatGPT. It is not: only the ChatGPT
   flavor gets the structured reconnect prompt
   (`src/lib/muse-connector/mcp.ts`, `toolsCall` — the ChatGPT
   branch). Muse and Claude get the plain `missing_scope` error
   payload (HTTP 200 tool result, `isError: true`). Flagged here;
   the ChatGPT doc was not edited (out of scope for this task).
5. **`claude.com` callback unverified in the official doc.** Both
   `https://claude.ai/api/mcp/auth_callback` and
   `https://claude.com/api/mcp/auth_callback` are allowlisted, but
   only the `claude.ai` variant was confirmed in the Anthropic doc
   fetched during implementation (the code comment in
   `src/lib/muse-connector/oauth/clients.ts` says so explicitly).
   The docs carry this caveat and flag the variant as removable.
6. **Missing-scope message names the canonical `muse.*` scope.**
   The adapter's `TIER_SCOPE` map names `muse.write` /
   `muse.read` / `muse.send` in the error text for all flavors, so a
   Claude user is told to grant e.g. `muse.write` when the scope to
   grant is `claude.write`. The tier check itself is prefix-agnostic
   (a `claude.write` grant satisfies it), so this is wording only —
   but it is wording the user will actually see, so PERMISSIONS.md
   and TROUBLESHOOTING.md document it instead of claiming a
   `claude.*`-worded message.
7. **Pre-existing oddity, not Claude-caused:** `publicOrigin()` in
   `src/lib/muse-connector/mcp.ts` falls back to
   `https://bom.b2bgdc.com` (a ZBOM domain) when no origin can be
   determined. It predates the Claude work and affects all flavors
   equally; noted here so it is not mistaken for a Claude behaviour.

## Architecture overview

Claude calls **into** NxtSend (inverted direction). Claude discovers
the MCP resource via RFC 9728 metadata, the authorization server via
RFC 8414 metadata (which advertises
`client_id_metadata_document_supported: true`, so Claude selects CIMD
when that flag is present **and** `none` is among the token auth
methods, else DCR fallback), identifies itself with a CIMD `client_id`
URL or via DCR, completes OAuth (authorization code + PKCE S256) on
NxtSend's consent screen, then calls the MCP server at
`/api/mcp/claude` (Streamable HTTP, JSON-RPC 2.0, protocol
`2025-06-18`) with a Bearer token bound by RFC 8707 to the Claude
resource. The handler (`handleMcpRequest`, flavor `claude`) is shared
with `/api/mcp` and `/api/mcp/chatgpt`; the adapter, grant machinery
and Supabase tables are shared with the Muse and ChatGPT connectors.
The three surfaces differ only in MCP path, scope prefix
(`claude.*`), resource URL, redirect URI and (Claude only) prompts.
Demo Mode refuses the whole surface (503). Full detail:
`docs/claude-integration/ARCHITECTURE.md`.

## Files created / modified (this worker)

### Created (this worker — docs + report only)

- `docs/claude-integration/` — 12 files: README.md, ARCHITECTURE.md,
  MCP_SERVER.md, OAUTH_SETUP.md, MCP_TOOLS.md, PERMISSIONS.md,
  SECURITY.md, DATABASE.md, VERCEL_DEPLOYMENT.md, CLAUDE_SETUP.md,
  TESTING.md, TROUBLESHOOTING.md.
- `audit-screenshots/claude-integration/README.md` — no screenshots;
  lists the 12 live captures to take after deploy.
- `NxtSend_Claude_Integration_Final_Report.md` — this file.

### Created by the Claude implementation (uncommitted, in the tree — not by this worker)

- `src/app/api/mcp/claude/route.ts` + `__tests__/route.test.ts` (4 tests).
- `src/app/.well-known/oauth-protected-resource/api/mcp/claude/route.ts`
  + `__tests__/route.test.ts` (1 test).
- `src/lib/muse-connector/prompts.ts` — the 4 Claude-only prompts.
- `src/lib/muse-connector/__tests__/claude.test.ts` (22 tests),
  `claude-oauth.test.ts` (33 tests), `claude-config.test.ts` (8 tests).

### Modified by the Claude implementation (uncommitted, in the tree — not by this worker)

- `src/lib/muse-connector/mcp.ts` — third flavor `"claude"`;
  flavor-aware `WWW-Authenticate`; Claude `initialize`
  (instructions + `{tools, prompts, resources}`); `prompts/list` +
  `prompts/get` (Claude only, `-32601` elsewhere); `resources/list`
  + `resources/read` now serve the widget + `nxtsend://account`
  (grant-derived, no plan); `NXT_SEND_ACCOUNT_RESOURCE_URI`;
  `MCP_CLAUDE_SERVER_INSTRUCTIONS`.
- `src/lib/muse-connector/oauth/scopes.ts` — `CLAUDE_SCOPES`
  (`claude.read/write/send`), `CLAUDE_SCOPE_DESCRIPTIONS`,
  `SCOPE_TIER_MAP` entries, `defaultScopeForPlatform` Claude branch.
- `src/lib/muse-connector/oauth/clients.ts` — both Claude callback
  URIs (`CLAUDE_OAUTH_CALLBACK`, `CLAUDE_COM_OAUTH_CALLBACK`,
  `CLAUDE_OAUTH_CALLBACKS`); `isAllowedClaudeRedirectUri`;
  `isAllowedRedirectUriForPlatform` (platform binding);
  `validateRedirectUriForPlatform`; `clientPlatform` Claude branch.
- `src/lib/muse-connector/oauth/cimd.ts` — Claude callback in CIMD
  validation; platform detection incl. the `claude.ai` / `claude.com`
  host check (catches Claude Code's loopback-only document).
- `src/lib/muse-connector/oauth/authorize.ts` — platform-bound
  redirect validation; Claude default `resource`; Claude default
  scope; error wording "for this platform".
- `src/lib/muse-connector/oauth/config.ts` — `isClaudeMcpEnabled()`,
  `getClaudePublicUrl()` (CLAUDE_* → MUSE_* → `NEXT_PUBLIC_APP_URL`
  → request origin); `McpPlatform` gains `"claude"`;
  `MCP_RESOURCE_PATHS.claude = "/api/mcp/claude"`;
  (`canonicalMcpResources` now lists three).
- `src/lib/muse-connector/oauth/index.ts` — re-exports the Claude
  scopes, callbacks, validators and config helpers.
- `src/lib/muse-connector/oauth/state.ts` — comment only (resource
  field documentation).
- `src/lib/muse-connector/grants.ts` — `GrantOrigin` gains
  `"Claude"`; origin classification by CIMD host, Claude redirect
  URI, or `claude.*` scope fallback; `GrantsByOrigin.claude`.
- `src/app/.well-known/oauth-authorization-server/route.ts` —
  `client_id_metadata_document_supported: true`; comment updated
  (three platforms).
- `src/app/.well-known/oauth-protected-resource/route.ts` — root
  document accepts the Claude resource via `?resource=` (three
  canonical resources).
- `src/app/api/muse/oauth/authorize/route.ts` — consent screen
  platform type gains `"claude"`; redirect-hostname line added
  ("After you approve, you will be sent back to …").
- `src/lib/integrations-center/registry.ts` — new `claude` entry
  (kind `adapter`; name "Claude.ai (Anthropic)" — chosen to avoid
  duplicating the existing "Claude (Anthropic)" AI-drafting entry;
  env vars `CLAUDE_MCP_ENABLED`, `CLAUDE_MCP_PUBLIC_URL`,
  `TOKEN_ENCRYPTION_KEY`; custom-connector steps; MCP URL
  `https://nxtsend.com/api/mcp/claude`; DCR note + optional
  Advanced-settings client ID/secret fallback; both redirect URIs;
  `claude.*` scopes in plain words; "Not submitted to Anthropic";
  `docsUrl: null`).
- `src/lib/integrations-center/status.ts` — `claudeGrantsActive`
  option + `claude` status branch (Demo → Demo Mode; real grant →
  Connected and Verified; enabled without grant → Connected but Not
  Verified; Muse/ChatGPT grants never connect it).
- `src/lib/integrations-center/verify.ts` — `claude` verify case
  (demo + live): no safe read-only verification call; no outbound
  call made.
- `src/app/api/integrations/status/route.ts` — passes
  `claudeGrantsActive` (by-origin, workspace-filtered).
- `src/app/api/admin/muse/route.ts` — response adds
  `claudeMcpEnabled`, `claudePublicUrl`, `grantsByOrigin.claude`
  (demo returns labelled zeros).
- `src/app/(admin)/admin/integrations/muse-ai/page.tsx` — overview
  adds the Claude surface + "Grants by client origin" (Muse /
  ChatGPT / Claude / Other / Total); links to the Claude detail page.
- `src/lib/admin/platform-server.ts` — `getSystemHealth()` adds a
  `claude-mcp` check mirroring `chatgpt-mcp`.
- `src/app/(dashboard)/dashboard/integrations/[id]/page.tsx` —
  `ConnectorLivePanels` generalised to `muse` | `chatgpt` |
  `claude`; new `ClaudeLivePanels` (endpoints, scopes, connect
  steps, Claude grants with Revoke, activity, 54-tool manifest,
  security notes); disconnect text extended for `claude`.
- `src/components/dashboard/IntegrationCenterBits.tsx` — `claude`
  icon (`MessagesSquare`).
- `.env.example` — `CLAUDE_MCP_ENABLED=` / `CLAUDE_MCP_PUBLIC_URL=`
  with precedence comments; states no `CLAUDE_OAUTH_CLIENT_SECRET`
  exists and `ANTHROPIC_API_KEY` is NOT required for the connection.
- `src/lib/config-status.ts`, `scripts/check-config.mjs` — both new
  vars in the "integrations" group.
- Tests extended: `grants.test.ts` (+1: Claude origin
  classification), `center.test.ts` (+3: Claude status branches,
  registry entry, verify outcomes), the Muse + ChatGPT
  protected-resource route tests (expectations updated for the
  9-scope set), `chatgpt-oauth.test.ts` / `chatgpt.test.ts` (small
  updates so the shared-code changes keep passing).

Untouched as instructed: no commit, no push; original 18 Muse tools
and their classifications unchanged; the ChatGPT surface's behaviour
unchanged; billing, admin bootstrap and existing send paths untouched;
no migration file touched.

## MCP endpoint

`POST https://nxtsend.com/api/mcp/claude` — Streamable HTTP, JSON-RPC
2.0, `POST` only (`GET` → 405). **Every method needs a valid token**
— no ChatGPT-style pre-auth discovery: `initialize`, `tools/list`
and `resources/list` without a token answer 401 +
`WWW-Authenticate` naming
`/.well-known/oauth-protected-resource/api/mcp/claude`. Insufficient
scope → HTTP 200 tool result, `isError: true`, `code: missing_scope`
(the Muse-style error, not the ChatGPT reconnect prompt); demo mode →
503 "Claude MCP is not available in Demo Mode…"; rate limit 120
req/min per grant (429, `Retry-After: 60`); body cap 64 KB (413).
`initialize` returns Claude `instructions` and capabilities
`{tools, prompts, resources}`. Every tool result carries `content` +
`structuredContent`. Prompts: `prompts/list` + `prompts/get` (4
templates, text-only, validated args, `-32602` on bad args).
Resources: `ui://widget/campaigns.html` + `nxtsend://account`
(grant-derived JSON, no secrets, no plan).

## OAuth endpoints

| Endpoint | Notes |
|---|---|
| `GET/POST /api/muse/oauth/authorize` | Consent screen (client name + origin + platform + redirect hostname); approve/deny |
| `POST /api/muse/oauth/token` | `authorization_code` + `refresh_token`; rotation, reuse revokes grant |
| `POST /api/muse/oauth/revoke` | RFC 7009 |
| `POST /api/muse/oauth/register` | RFC 7591 DCR, public clients by default; cap 50, oldest never-used >24 h evicted |
| `GET /.well-known/oauth-authorization-server` | RFC 8414; S256 only; `token_endpoint_auth_methods: ["none", "client_secret_post"]` — no `private_key_jwt`; `client_id_metadata_document_supported: true` |
| `GET /.well-known/oauth-protected-resource` | RFC 9728 root metadata; `?resource=` accepts the Claude resource |
| `GET /.well-known/oauth-protected-resource/api/mcp/claude` | RFC 9728 metadata for the Claude resource |
| `GET /.well-known/oauth-protected-resource/api/mcp` | RFC 9728 metadata for the Muse resource |
| `GET /.well-known/oauth-protected-resource/api/mcp/chatgpt` | RFC 9728 metadata for the ChatGPT resource |

Redirect URIs (exact match, platform-bound): Claude
`https://claude.ai/api/mcp/auth_callback` **and**
`https://claude.com/api/mcp/auth_callback` (see the caveat — only
`claude.ai` was confirmed in the official doc); ChatGPT
`https://chatgpt.com/connector_platform_oauth_redirect`; Muse
`https://agent.meta.ai/api/hatch/oauth/callback`; loopback local-only.
Scopes: `claude.read` / `claude.write` / `claude.send` (canonical);
`muse.*` / `nxtsend.*` work as the same tiers. Tiers independent —
`send` does NOT imply `write`/`read`. RFC 8707 `resource` validated
byte-for-byte (`https://<origin>/api/mcp/claude` for Claude);
`invalid_target` on mismatch; defaults per platform. RFC 9207 `iss`
in authorize redirects and token responses. CIMD: https client_id
URL, 5 s timeout, 64 KB cap, ~5 min memory cache, ephemeral (never
persisted), DCR as fallback; Claude Code's published document
detected by host. Codes: 10 min single-use; access tokens 1 h;
refresh tokens 60 d. `offline_access` deliberately not listed in AS
metadata (refresh tokens are issued anyway).

## All 54 MCP tools

36 Read, 14 Write, 4 Sensitive write. The original 18 Muse tools are
unchanged; the 36 ChatGPT-expansion tools are unchanged for Claude.
Annotations: `readOnlyHint: true` for 35 tools, `destructiveHint:
true` for exactly `delete_lead`, `delete_campaign`, `send_email`,
`send_inbox_reply`, `openWorldHint: false` everywhere.
**Exception:** `get_conversation` is Read-classified but
`readOnlyHint: false` — opening a thread marks messages read (a real
state change, declared in the tool).

| Tool | Classification | readOnlyHint | destructiveHint |
|---|---|---|---|
| `list_leads` | Read | true | false |
| `get_lead` | Read | true | false |
| `list_campaigns` | Read | true | false |
| `get_campaign_activity` | Read | true | false |
| `list_conversations` | Read | true | false |
| `get_conversation` | Read | **false** | false |
| `get_usage_summary` | Read | true | false |
| `get_integration_statuses` | Read | true | false |
| `create_lead` | Write | false | false |
| `update_lead` | Write | false | false |
| `create_campaign` | Write | false | false |
| `pause_campaign` | Write | false | false |
| `resume_campaign` | Write | false | false |
| `archive_campaign` | Write | false | false |
| `draft_outreach_message` | Write | false | false |
| `send_email` | Sensitive write | false | true |
| `send_inbox_reply` | Sensitive write | false | true |
| `delete_lead` | Sensitive write | false | true |
| `list_linkedin_accounts` | Read | true | false |
| `get_linkedin_account` | Read | true | false |
| `get_subscription_info` | Read | true | false |
| `get_account_limits` | Read | true | false |
| `search_campaigns` | Read | true | false |
| `stop_campaign` | Write | false | false |
| `delete_campaign` | Sensitive write | false | true |
| `get_campaign_performance` | Read | true | false |
| `get_campaign_execution_status` | Read | true | false |
| `search_leads` | Read | true | false |
| `import_leads` | Write | false | false |
| `add_leads_to_campaign` | Write | false | false |
| `remove_leads_from_campaign` | Write | false | false |
| `detect_duplicate_leads` | Read | true | false |
| `get_lead_activity_history` | Read | true | false |
| `list_leads_by_campaign` | Read | true | false |
| `get_campaign_sequence` | Read | true | false |
| `create_sequence_step` | Write | false | false |
| `update_sequence_step` | Write | false | false |
| `reorder_sequence_steps` | Write | false | false |
| `get_scheduled_follow_ups` | Read | true | false |
| `get_sequence_execution_status` | Read | true | false |
| `get_pending_actions` | Read | true | false |
| `get_failed_actions` | Read | true | false |
| `get_automation_execution_report` | Read | true | false |
| `search_conversations` | Read | true | false |
| `get_message_execution_status` | Read | true | false |
| `get_failed_messages` | Read | true | false |
| `compare_campaigns` | Read | true | false |
| `get_date_range_report` | Read | true | false |
| `get_performance_summary` | Read | true | false |
| `get_usage_report` | Read | true | false |
| `get_profile` | Read | true | false |
| `search` | Read | true | false |
| `fetch` | Read | true | false |
| `render_campaigns_widget` | Read | true | false |

Descriptions, inputs and side effects for every tool are in
`docs/claude-integration/MCP_TOOLS.md` (table generated from
`src/lib/muse-connector/manifest.ts`).

Notable tools: `get_profile` (Read, `_meta: {"openai/profile": true}` —
grant identity only, no secrets; *does* return the workspace plan);
`search` + `fetch` (Read — knowledge tools); `render_campaigns_widget`
(Read — "Always call list_campaigns first…",
`_meta.ui.resourceUri` + `_meta["openai/outputTemplate"]`:
`ui://widget/campaigns.html`); `get_date_range_report` (Read — always
answers `BLOCKED` / `date_range_not_supported`, 501, by design).

## Prompts + resources

**Prompts (Claude-only, 4):** `campaign-performance-summary`
(required arg `campaign`), `lead-follow-up-draft` (required arg
`leadId`), `weekly-performance-report` (required arg `dateRange`),
`duplicate-lead-cleanup` (no args). All are templates: text-only
results, they fetch no data (they name the tools to call), and they
never send, merge or delete. Missing/blank/unknown arguments and
unknown prompt names answer `-32602`. Muse and ChatGPT answer both
prompt methods with `-32601` Method not found.

**Resources (2, token required):** `ui://widget/campaigns.html`
(shared widget, `text/html;profile=mcp-app`) and the new
`nxtsend://account` (`application/json` — `userId`, `workspaceId`,
`clientId`, `grantId`, `scopes`, `resource`; no secrets, no token
values, **no plan** — the grant carries none).

## Database changes

- **Migration 023** (`023_muse_oauth.sql`, reused): creates
  `muse_oauth_clients`, `muse_oauth_codes`, `muse_oauth_tokens` (RLS
  enabled, zero policies, service-role only). No new OAuth tables for
  Claude.
- **Migration 024** (`024_chatgpt_oauth_resource.sql`, reused): adds
  nullable `resource TEXT` to `muse_oauth_codes` and
  `muse_oauth_tokens` + index `idx_muse_oauth_tokens_resource`.
- **No new migration for Claude.** No token/code values stored
  (SHA-256 hashes only). No "last used" time stored. CIMD clients
  never persisted.

## Security notes

- Tokens/codes as SHA-256 hashes only; no token value in any query,
  log or UI. Refresh rotation + reuse detection revokes the whole grant.
- OAuth tables RLS-enabled with zero policies (service role only).
- Grants scoped to one user + one workspace + one RFC 8707 resource.
- Scope enforcement per tool call, server-side, via `grantHasTier`.
- `private_key_jwt` not supported (see status table for the exact reason).
- `offline_access` deliberately not listed in AS metadata (refresh
  tokens issued anyway).
- Redirect URIs exact-match + platform-bound; error redirects only to
  a URI exactly registered for the client and valid for its platform.
- Audit: every tool call logged as `muse.tool.<name>` (shared with
  the Muse/ChatGPT connectors); OAuth events as `MUSE_OAUTH_*`; no
  token/secret/body material in audit rows.
- Rate limiting is in-memory per instance (limitation — see status table).
- Demo Mode refuses the whole surface; the demo persona is never served
  to Claude.

## Claude UI implementation

- **Integration Center entry `claude`** (Dashboard → Integrations →
  Claude.ai (Anthropic)): custom-connector path, MCP URL, OAuth
  endpoints, both well-known metadata URLs, CIMD note, both Claude
  redirect URIs, scopes in plain words (`claude.read` recommended
  default), grants, activity, tools, security notes, "Not submitted
  to Anthropic" stated plainly. Named "Claude.ai (Anthropic)" to
  avoid duplicating the existing "Claude (Anthropic)" AI-drafting
  entry; `docsUrl` is null (no URL invented).
- **Status derivation:** Demo → Demo Mode; real Claude grant →
  Connected and Verified; enabled without grant → Connected but Not
  Verified; disabled → Not Connected. A Muse or ChatGPT grant never
  connects the Claude entry (tested).
- **Detail page:** shared `ConnectorLivePanels` machinery; Claude
  endpoints (incl. authorization-server + root + per-resource
  metadata), `claude.*` scopes with descriptions, Claude connect
  steps, Claude grants (filtered by scope prefix / CIMD origin) with
  per-scope descriptions, shared activity history (labelled as
  shared), Claude security notes (incl. `private_key_jwt`, RFC 8707
  binding and the `claude.com` callback caveat).
- **Test Connection** explains there is no safe read-only verification
  call — it makes no outbound call and never pretends.
- **Admin:** `GET /api/admin/muse` + admin page show the MCP overview
  with grants by client origin (Muse vs ChatGPT vs Claude vs Other)
  behind `resolveAdminGate()`; `getSystemHealth()` adds a
  `claude-mcp` check.
- The page **never** shows "Connected"/"Verified" without a real grant.

## Test + build results (own runs, this session)

- `npm test`: **1,477 tests passing, 0 failing, 125 files** (run
  2026-11-17 ~00:19 Dhaka). Baseline at the base commit (66ddb78)
  was 1,405 tests / 120 files; this work adds **72 tests**: 68 in 5
  new test files (`claude-config` 8, `claude-oauth` 33, `claude` 22,
  Claude MCP route 4, Claude metadata route 1) + 4 in extended
  existing files (`grants` +1, `center` +3). Reconciled exactly:
  68 + 4 = 72; 120 + 5 files = 125.
- Targeted re-run of 10 connector/integration test files:
  **183 passing** — `claude-config` (8), `claude-oauth` (33),
  `claude` (22), Claude metadata route (1), `grants` (13),
  `center` (46), `chatgpt-oauth` (43), `chatgpt` (15), and the Muse
  + ChatGPT metadata route tests (1 each). The 5th new Claude file,
  the Claude MCP route test (4 tests), was covered by the full-suite
  run, not this targeted run.
- `npm run build`: **green** (run 2026-11-17 after `rm -rf .next`;
  `/api/mcp/claude` and the Claude protected-resource metadata route
  are in the compiled route table). One transient failure was seen
  earlier on a stale `.next` directory (ENOENT renaming
  `.next/export/500.html`) — fixed by the `rm -rf .next` retry; not
  a code issue.
- `npx tsc --noEmit`: **clean** (one TS2802 error found during the docs pass, fixed afterwards — see Discrepancies, item 1).
- `npm run config:check`: lists `CLAUDE_MCP_ENABLED` /
  `CLAUDE_MCP_PUBLIC_URL` (MISSING in this dev env, as expected —
  they are optional and unset here).

## Vercel readiness

Ready to deploy as code: build green, no new dependencies, stateless
design (Vercel Hobby-safe; 10 s limit respected — every tool is a
bounded store lookup). Deploy checklist (owner steps):

1. Apply migrations 023 + 024 in Supabase (no new migration).
2. Set `TOKEN_ENCRYPTION_KEY` and `NEXT_PUBLIC_APP_URL`
   (`https://nxtsend.com`) in Vercel; redeploy.
3. Optional: `CLAUDE_MCP_ENABLED` / `CLAUDE_MCP_PUBLIC_URL` only if
   the Claude surface differs from the defaults.
4. Verify: `GET /api/mcp/health` (toolCount 54), both well-known
   metadata URLs, Integration Center Claude entry — all PENDING
   until live (see Live verification).

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Yes | Real origin; issuer + metadata + default resource URLs derive from it |
| `TOKEN_ENCRYPTION_KEY` | Yes | Base64 of 32 bytes; signs authorize-state; authorize returns 503 without it |
| `CLAUDE_MCP_ENABLED` | No | `"false"` disables the Claude MCP surface; unset → `MUSE_MCP_ENABLED`; both unset → enabled; does not gate OAuth |
| `CLAUDE_MCP_PUBLIC_URL` | No | Precedence: `CLAUDE_MCP_PUBLIC_URL` → `MUSE_MCP_PUBLIC_URL` → `NEXT_PUBLIC_APP_URL` → request origin |
| `MUSE_MCP_ENABLED` / `MUSE_MCP_PUBLIC_URL` | No | Fallbacks for the Claude vars (and the Muse surface's own vars) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Already required for live mode |

**No `CLAUDE_OAUTH_CLIENT_SECRET`** — none exists or is needed (DCR /
CIMD public clients). **No `ANTHROPIC_API_KEY` required** for the
Claude.ai integration — the MCP connection needs no Anthropic key; the
existing AI providers are reused only for message drafting via
`draftOutreachMessage`.

## Credentials still required (owner steps)

- `TOKEN_ENCRYPTION_KEY` — generate (`openssl rand -base64 32`), set in
  Vercel. Without it, authorize returns 503.
- Migrations 023 + 024 applied in Supabase.
- `NEXT_PUBLIC_APP_URL` set to the real origin.
- No other credentials. In particular: no Anthropic key, no client secret,
  no Google/Apple credential is needed for this integration.

## Claude compatibility results

- **Custom connector (add-by-URL, Level A):** the implemented path —
  Customize → Connectors → Add custom connector with
  `https://nxtsend.com/api/mcp/claude`. Works today, no submission.
  **Not verified live from this environment** (no Claude account, no
  deployed site exercised here).
- **Plan availability:** custom MCP connectors on Pro/Max (and
  Team/Enterprise) as verified during this work — **Anthropic changes
  these and the plan must be re-checked live** before promising a
  user a given plan can connect. Not verified against a real Claude
  account here.
- **Directory listing (Level B):** a separate submission + review;
  **NOT claimed**. OAuth 2.1 + MCP server (the technical
  prerequisites) exist; the submission itself has not been made.
- **Prompts in Claude:** 4 prompts implemented and unit-tested;
  surfacing inside a live Claude client is PENDING.
- **Widget in Claude:** HTML served and unit-tested; render inside a
  live Claude client is PENDING.
- **`claude.com` redirect variant:** allowlisted but unconfirmed in
  the official doc — if Claude never sends it, remove it.

## Remaining blockers / PENDING items

1. **Live Claude verification** — full grant flow + prompts surfacing
   + account-resource read + widget render + live tools/list. Needs
   the deployed site + a real Claude account on a plan with custom
   connectors. Not possible from this environment.
2. **Anthropic submission (directory listing)** — owner decision +
   process; nothing submitted.
3. **Persistent idempotency ledger** — not built (limitation,
   documented); retried `create_campaign` / `create_sequence_step`
   would duplicate.
4. **Shared rate limiter** — not built (limitation, documented);
   in-memory per-instance only.
5. **`private_key_jwt`** — deliberately not implemented (reason
   documented).
6. **LinkedIn sends** — deliberately not supported (no authorized provider).
7. **Screenshots** — none exist yet; capture list in
   `audit-screenshots/claude-integration/README.md`.

## What was deliberately left out (with reasons)

- No commit / push (instructed).
- No new OAuth tables (migration 023 tables reused; 024 only adds a column).
- No new migration for Claude.
- No separate Claude grants/activity API (the `/api/muse/grants` and
  `/api/muse/activity` routes are platform-agnostic; the UI filters by
  platform) — duplication was avoided by generalising the panels.
- No separate admin Claude page (extended the existing admin muse-ai
  page + `GET /api/admin/muse` instead of rebuilding).
- No `CLAUDE_OAUTH_CLIENT_SECRET` (public clients; DCR/CIMD).
- No `offline_access` scope (deliberate; refresh tokens issued anyway).
- No fake screenshots, no claimed live verification, no claimed approval.
- No invented Anthropic docs URL (`docsUrl: null` in the registry) and
  no claimed submission requirements (process, criteria, timeline and
  fees were not verified from a primary Anthropic source during this work).
