# NxtSend — Integration Inventory

- **Base commit:** `f8dea22` (main, Wave 2 complete)
- **Date of inventory:** 2026-11-19
- **Method:** source inspection of the tree at `f8dea22`, plus re-running
  the test suite (2,293 passing), the n8n package tests (126/126), and
  `npx tsc --noEmit` (clean). No live calls were made; no provider was
  authenticated against real credentials.
- **Status classes used:** LIVE = real backend code exists AND evidence of
  a successful live run was found in-repo; PARTIAL = real backend
  implemented, incomplete in some named way (config-gated, not
  submitted/published/approved, or a live step still pending); UI-ONLY =
  card/page exists with no backend; MISSING = named in docs/prompts/
  registry but no adapter/backend exists.
- **Important:** no integration is classified LIVE here. The code is real
  for most providers, but no live verification run has been performed and
  every platform grant flow is recorded as still pending live verification.
  "PARTIAL" below therefore means "implemented backend, not yet proven
  live end-to-end", not "broken".

## 0. Counts (all verified by grep/wc on the tree at `f8dea22`)

| Count | Value | Source |
| --- | --- | --- |
| Integration Center entries | 83 | `src/lib/integrations-center/registry.ts` (`id:` occurrences) |
| Provider definitions | 69 | `src/lib/integrations/providers/registry.ts` = 5 live + 61 Milestone 2 + 3 Category J |
| Milestone 2 raw definitions | 63 | CRM 9, email outreach 10, enrichment 15, verification 5, automation 4, communication 5, productivity 12, AI MCP clients 3 |
| Milestone 2 unique | 61 | 63 raw minus the 2 providers defined twice (Snov.io: email outreach + enrichment; Monday.com: CRM + productivity), merged into one entry each |
| Per-provider operator guides | 63 | `docs/integrations/providers/*.md` |
| `.env.example` variables | 108 | non-comment, non-empty lines; `CONFIG_CATALOG` and `scripts/check-config.mjs` both list the same 108 |
| Migrations on disk | 33 files | `supabase/migrations/`: 001–031, 036, 038 (see §7) |
| REST route files | Zapier 29, n8n 41, Make/Pabbly/Albato/Activepieces 35 each | `src/app/api/integrations/<platform>/` |

## 1. The 5 live platforms (PARTIAL — implemented, not live-verified)

These five have a full backend: shared OAuth 2.1 server, v1 REST API,
webhooks, and (where applicable) an MCP server or native app. None has
been live-verified; no submission or publication is claimed.

| Provider | What exists | Status | Not yet |
| --- | --- | --- | --- |
| **Zapier** | OAuth 2.1 (shared server) + REST API v1; 5 polling triggers, 8 instant (REST Hook) triggers, 12 actions, 5 searches in `integrations/zapier/` (Zapier Platform CLI app); webhooks with HMAC + outbox + cron retry | PARTIAL | Not published on Zapier; live grant flow not verified |
| **n8n** | OAuth 2.1 + scoped API keys (`nxt_live_`) + REST API v1; community node `n8n-nodes-nxtsend` v0.1.0 (NxtSend node + Trigger, 12 workflow templates); webhooks | PARTIAL | Not published on npm; not verified by n8n; live grant flow not verified |
| **Muse (Meta)** | OAuth 2.1 server + hosted MCP server at `/api/mcp` | PARTIAL | Not submitted to Meta; live grant flow not verified. **Discrepancy:** the provider registry capability text says "18 tools", but the Stage 0 audit found `adapter.listTools()` returns the full 54-tool manifest on every flavor with no slicing — the live `/api/mcp` therefore serves 54 tools (36 Read / 14 Write / 4 Sensitive), not 18. The first 18 are only the *original* Muse set. |
| **ChatGPT (OpenAI)** | OAuth 2.1 server (DCR + CIMD) + hosted MCP server at `/api/mcp/chatgpt`, 54 tools | PARTIAL | Not submitted to OpenAI; live grant flow not verified; Apps SDK widget render still pending |
| **Claude (Anthropic)** | OAuth 2.1 server (DCR + CIMD) + hosted MCP server at `/api/mcp/claude`, 54 tools + 4 text-only MCP prompts + read-only `nxtsend://account` resource | PARTIAL | Not submitted to Anthropic; live grant flow not verified |

Scopes: `muse.read/write/send`, `nxtsend.read/write/send`,
`claude.read/write/send`, `zapier.read/write`, `n8n.read/write`.
There is no `.send` tier on Zapier or n8n. LinkedIn-send/accept is
NOT SUPPORTED on any platform.

## 2. The 64 config-ready adapters (PARTIAL — mock-tested only)

Every adapter below is implemented from the provider's official docs and
mock-tested. None has made a live call. Each works once the owner stores
a real credential in the Integration Hub vault (migration 016,
`INTEGRATION_HUB_ENCRYPTION_KEY`); until then its marketplace status is
"Not Connected". Per-provider auth method and credential names are in
[PROVIDER_SETUP.md](./PROVIDER_SETUP.md); operator guides are in
[`providers/`](./providers/).

### 2.1 CRM (9)

| Provider | Auth | Notes |
| --- | --- | --- |
| HubSpot | OAuth 2.0 (private-app token also accepted) | Import/export via lead repository, email dedupe |
| Salesforce | OAuth 2.0 (web-server flow; `instance_url` stored with credential) | |
| Pipedrive | OAuth 2.0 | |
| Close | API key | |
| GoHighLevel | Bearer token | |
| Zoho CRM | OAuth 2.0 | |
| Attio | Bearer token | |
| Breakcold | API key | |
| Monday.com | API key | Merged CRM + productivity definition (one entry) |

### 2.2 Email outreach (10)

Suppression-respecting: every adapter refuses to send without a
suppression checker (`isSuppressed`), and qualifies leads into
qualified / suppressed / no-email / duplicates before sending. The
skipped count (suppressed + no-email + duplicates) is computed in the
adapter and persisted on the sync job (`integration_sync_jobs.skipped_count`,
migration 030) and returned in the `SyncResult` — but there is no UI
page or API route that lists sync jobs, so an operator cannot see it
without querying the database directly (see
[KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md)).

| Provider | Auth | Notes |
| --- | --- | --- |
| Instantly | Bearer token | |
| Smartlead | API key (`api_key` query parameter — the provider rejects header auth) | Add-leads response reports `added_count` / `skipped_count`; max 400 leads per call |
| EmailBison | Bearer token | |
| Masterinbox | API key | Some endpoints unverified against the live API (config-ready only) |
| SmartReach | API key | |
| Reply.io | API key | |
| Lemlist | API key | |
| Snov.io | OAuth 2.0 (client ID + secret) | Merged email-outreach + enrichment definition (one entry) |
| Mailshake | API key | |
| Woodpecker | API key | |

### 2.3 Lead enrichment (15)

| Provider | Auth | Status / notes |
| --- | --- | --- |
| Apollo | API key (`X-API-KEY` header) | |
| Hunter | API key (`X-API-KEY` header) | |
| ZoomInfo | OAuth 2.0 | |
| ContactOut | API key | |
| SalesQL | Bearer token | |
| Snov.io | OAuth 2.0 | Enrichment side of the merged Snov.io entry |
| Dropcontact | API key | |
| Persana | API key | **Config-ready stub** — minimal implementation, verify before relying on it |
| Clearbit | API key | **PROVIDER-BLOCKED** — standalone API deprecated after the HubSpot acquisition; cannot be connected |
| Clay | API key | |
| Apify | API key (`APIFY_TOKEN`) | |
| RB2B | Webhook (inbound webhook secret) | |
| Factors.ai | API key | **Config-ready stub** — minimal implementation, verify before relying on it |
| Trigify | API key | **PROVIDER-BLOCKED** — Trigify shut down 22 Oct 2026 |
| Weezly | API key | **PROVIDER-BLOCKED** — no public API exists |

### 2.4 Email verification (5)

| Provider | Auth | Notes |
| --- | --- | --- |
| MillionVerifier | API key | |
| ZeroBounce | API key (`api_key` query parameter) | |
| NeverBounce | API key | |
| Bouncer | API key | |
| Hunter Verifier | API key (shares `HUNTER_API_KEY`) | |

### 2.5 Automation platforms (4) — full REST surfaces

Make, Pabbly Connect, Albato, and Activepieces each have the same
shared-REST-layer v1 API as Zapier/n8n (35 route files each), OAuth 2.0
on the shared server with platform-prefixed scopes (`make.read/write`,
`pabbly.read/write`, `albato.read/write`, `activepieces.read/write` —
no `.send` tier), and webhook subscriptions. Native artefacts:
a Make app manifest + scenario blueprints in `integrations/make/`, and
an Activepieces piece in `integrations/activepieces/` (dependencies
installed, piece `tsc` clean). None is submitted to its platform;
live grant flows are not verified.

### 2.6 Communication (5)

| Provider | Auth | Notes |
| --- | --- | --- |
| Slack | OAuth 2.0 | Bot token + channel; incoming-webhook URL also accepted |
| Microsoft Teams | Webhook | Incoming-webhook URL |
| Discord | Webhook | Channel webhook URL |
| Telegram | Bearer token | Bot token |
| WhatsApp Business | Bearer token | |

### 2.7 Productivity (12)

| Provider | Auth | Notes |
| --- | --- | --- |
| Google Sheets | OAuth 2.0 | Now requests the Sheets scope via `GOOGLE_SCOPES`; stored Gmail-only grants must re-connect |
| Google Drive | OAuth 2.0 | Requests `drive.file` scope |
| Google Calendar | OAuth 2.0 | Requests `calendar.events` scope |
| Airtable | API key | Base + table IDs stored with the credential |
| Notion | API key | Internal integration secret; database must be shared with the integration |
| Monday.com | API key | Productivity side of the merged Monday.com entry |
| Asana | OAuth 2.0 | |
| Trello | API key | |
| ClickUp | API key | |
| Jira | API key | |
| Linear | API key | |
| Calendly | OAuth 2.0 | |

### 2.8 AI MCP clients (3) — guides only, no new MCP servers

Gemini, Cursor, and Claude Code have operator guides
(`providers/mcp-client-*.md`) for connecting those clients to NxtSend's
existing MCP servers. No new MCP server was built for any of them.

### 2.9 Category J (3) — implemented, mock-tested

| Provider | Auth | Notes |
| --- | --- | --- |
| GetLeads | API key (`GETLEADS_API_KEY`, `X-API-Key` header) | Fair-use response shape unread — credit-balance calls return null (see KNOWN_LIMITATIONS) |
| Cornersight | API key (`CORNERSIGHT_API_KEY`, `X-API-Key` header) | |
| HotHawk | Bearer token (`HOTHAWK_API_KEY`) | Campaign enrolment + campaign creation request bodies are **unverified** — no live call has been made |

**No Category J operator guides exist yet** under
`docs/integrations/providers/`; their setup steps reference the official
provider docs only.

## 3. Category J evaluation table — evaluated, NOT implemented (7)

Evaluated in Wave 2, Phase 1 (commit `fa2199a`). The grouped reason
recorded in that commit message is "no public API / unverifiable /
no fit". Per-provider specifics are given only where the evaluation
established them; nothing further is claimed.

| Provider | Decision | Reason |
| --- | --- | --- |
| Saava | NOT IMPLEMENTED | No public API / no fit (per `fa2199a` evaluation) |
| Jungler | NOT IMPLEMENTED | No public API / no fit (per `fa2199a` evaluation) |
| Cargo | NOT IMPLEMENTED | No public API / no fit (per `fa2199a` evaluation) |
| Alysio | NOT IMPLEMENTED | No public API / no fit (per `fa2199a` evaluation) |
| IntentStream | NOT IMPLEMENTED | No public API / no fit (per `fa2199a` evaluation) |
| Twain | NOT IMPLEMENTED | Docs are JavaScript-rendered and unverifiable |
| Loopster | NOT IMPLEMENTED | API base host unverified |

Already covered (not duplicated): **Masterinbox** and **SmartReach**
already had email-outreach adapters (§2.2).

## 4. Integration Center registry (83 entries) — what the extra 14 are

The Center registry holds the 69 provider definitions plus 14
platform-own surfaces: Supabase, Resend, Gmail, Microsoft (Outlook),
Stripe, OpenAI, Anthropic, Meta Model API, Meta Pixel, webhooks, jobs,
LinkedIn (documented demo — no vendor adapter exists), Google Sheets
(also a provider adapter), and the generic info entries `crm` and
`email-verification`. The two generic entries are **placeholders**:
`verify.ts` has no case for them (nor for any of the 60+ new adapter
ids), the status service returns "Unknown integration." for them, and
the display layer rewrites that message. See
[KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md).

## 5. What "MOCK TESTED" means here

- The repo suite (2,293 tests, 224 files) and the n8n package suite
  (126 tests, 5 files) run against mocks, fixtures, and in-memory
  stores. They prove the code paths behave as coded — they do not prove
  any provider's live API accepts the requests.
- Adapter tests stub the provider HTTP layer; a passing test means
  "the adapter builds the request the docs describe", not "the provider
  answered".
- The only live checks ever performed were read-only HTTP checks of
  NxtSend's own deployed site (health/metadata endpoints), not of any
  provider. See [TESTING_REPORT.md](./TESTING_REPORT.md) and
  [DEPLOYMENT.md](./DEPLOYMENT.md).

## 6. Env / deploy surface

- `.env.example`: 108 variables. No `*_OAUTH_CLIENT_SECRET` env var
  exists for Muse/ChatGPT/Claude/Zapier/n8n/Make/Pabbly/Albato/
  Activepieces (DCR-issued credentials); no `N8N_API_KEY` env var
  (keys are created in-app). Provider API keys for the 64 adapters are
  stored per-connection in the Integration Hub vault, not in env —
  except the enrichment/verification/Category J adapters, whose configs
  also name an env var (e.g. `APOLLO_API_KEY`, `GETLEADS_API_KEY`) as
  the seeding source. See [PROVIDER_SETUP.md](./PROVIDER_SETUP.md).
- `vercel.json`: single cron `0 6 * * *` → `/api/jobs/run`. No other crons.

## 7. Migrations (022–038 requested; what actually exists)

| Range | On disk |
| --- | --- |
| 022 Flow AI features | `022_flow_ai_features.sql` |
| 023 Muse OAuth | `023_muse_oauth.sql` |
| 024 ChatGPT OAuth resource | `024_chatgpt_oauth_resource.sql` |
| 025 Zapier webhooks | `025_zapier_webhooks.sql` |
| 026 OAuth PKCE optional | `026_oauth_pkce_optional.sql` |
| 027 Leads `updated_at` | `027_leads_updated_at.sql` |
| 028 n8n API keys | `028_nxtsend_api_keys.sql` |
| 029 n8n webhook platform | `029_n8n_webhook_platform.sql` |
| 030 Integration engine | `030_integration_engine.sql` |
| 031 Automation platforms | `031_automation_platforms.sql` |
| **032–035** | **MISSING — no files exist for these numbers** |
| 036 Notification preferences | `036_notification_preferences.sql` |
| **037** | **MISSING — no file exists for this number** |
| 038 Provider disable flags | `038_provider_disabled_flags.sql` |

The owner must apply migrations 022–031, 036, and 038. The gaps
(032–035, 037) are numbering gaps, not missing functionality that
anyone has described — but they mean "apply 022–038" is not a
contiguous instruction, and any apply script that expects a file per
number will fail on the gaps. Flagged here so the owner is not
surprised.

## 8. Known contradictions with earlier docs (resolved in favour of code)

1. **Muse serves 54 tools, not 18** (see §1). The registry capability
   text still says 18; the code serves the full manifest. Any
   submission, scope, or "do not change the first 18" work must account
   for the extra 36 already being served.
2. **The n8n deploy had not landed** on the live site as of the
   2026-11-18 ~07:25 +06 check (see [DEPLOYMENT.md](./DEPLOYMENT.md)).
   Docs written before that check that imply the n8n surface is live
   are wrong.
3. **`628a825` was pushed while `npm run build` was failing** (masked
   by a piped grep in the verification command); fixed in `f8dea22`.
   Process lesson: verify build exit codes directly, never through a
   pipe.
