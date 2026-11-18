# NxtSend Integration Ecosystem — Final Report

**Date:** 2026-11-19
**Base commit:** `f8dea22` (main, Wave 2 complete)
**Author:** Wave 2, Phase 3 (documentation + verification)
**Companion docs:** `docs/integrations/` (12 documents — see §12)

> **Headline, honestly:** the ecosystem is **built and mock-tested,
> not live**. 69 provider definitions exist, 64 adapters are
> config-ready, 5 platforms have full backends — and **no provider has
> been live-verified against real credentials**. No platform submission
> or publication is claimed. Nothing in this report marks an
> integration as fully live. The remaining work is almost entirely
> owner-side: apply migrations, set two encryption keys, confirm the
> Vercel deploy lands, provide credentials, and run one live check per
> platform.

## 1. Totals

| Measure | Count | How verified |
| --- | --- | --- |
| Integration Center entries audited | 83 | grep `id:` in `src/lib/integrations-center/registry.ts` |
| Provider definitions audited | 69 | registry composition: 5 live + 61 Milestone 2 + 3 Category J |
| Providers available (defined) | 69 | as above |
| Config-ready adapters (new in Wave 2) | 64 | 61 Milestone 2 + 3 Category J |
| Live-platform backends (new/expanded in Wave 2) | 5 | Zapier, n8n, Muse, ChatGPT, Claude |
| Providers improved (registry/status/docs) | 83 | Center registry grew 20 → 83 (`fa2199a`); provider registry grew 5 → 69 |
| Providers newly added in Wave 2 | 64 | the adapters above |
| Providers evaluated and NOT implemented | 7 | Saava, Jungler, Cargo, Alysio, IntentStream, Twain, Loopster |
| Providers blocked (no usable API) | 3 | Clearbit, Trigify, Weezly |
| Webhook events | 8 | `WEBHOOK_EVENT_TYPES`, `src/lib/integrations/rest/events.ts` |
| MCP tools per server | 54 | shared manifest (`/api/mcp`, `/api/mcp/chatgpt`, `/api/mcp/claude`) — see the Muse 18-vs-54 discrepancy, §9 |
| v1 REST routes | 33 each (n8n/Make/Pabbly/Albato/Activepieces); 26 (Zapier) | route-file counts under `src/app/api/integrations/<platform>/v1/` |
| Per-provider operator guides | 63 | `docs/integrations/providers/*.md` |
| Documentation files in this set | 12 + this report + screenshot list | `docs/integrations/*.md`, `audit-screenshots/integration-ecosystem/README.md` |
| Migrations in Wave 2 scope | 12 files exist (022–031, 036, 038); 032–035 and 037 missing | `ls supabase/migrations/` |
| Env vars | 108 | `.env.example` = `CONFIG_CATALOG` = `scripts/check-config.mjs` |
| Tests passing (re-run for this report) | 2,293 repo + 126 n8n package | `npm test`, `npx jest` in `integrations/n8n-nodes-nxtsend/` |

## 2. Provider-by-provider status

Status key — **PASS**: the check ran and exited 0 (used only for
test/build rows in §7, not for providers). **MOCK TESTED**: backend
implemented and its tests pass against stubbed provider calls; no
live call made. **CREDENTIALS REQUIRED**: mock-tested adapter that
cannot do anything until the owner stores a real credential.
**PROVIDER BLOCKED**: no usable public API, or the provider shut
down. **NOT IMPLEMENTED**: evaluated and deliberately not built.

### 2.1 The 5 live platforms — MOCK TESTED

| Provider | Status | Notes |
| --- | --- | --- |
| Zapier | MOCK TESTED | OAuth 2.1 + REST v1 (26 routes) + CLI app (5 polling triggers, 8 instant, 12 actions, 5 searches) + webhooks. Not published; live grant flow not verified. |
| n8n | MOCK TESTED | OAuth 2.1 + API keys + REST v1 (33 routes) + community node v0.1.0 + webhooks. Not published on npm; not verified by n8n; live grant flow not verified. |
| Muse (Meta) | MOCK TESTED | OAuth 2.1 + MCP `/api/mcp`. Registry says 18 tools; code serves 54 (see §9). Not submitted to Meta. |
| ChatGPT (OpenAI) | MOCK TESTED | OAuth 2.1 (DCR + CIMD) + MCP `/api/mcp/chatgpt`, 54 tools. Not submitted to OpenAI; widget render pending. |
| Claude (Anthropic) | MOCK TESTED | OAuth 2.1 (DCR + CIMD) + MCP `/api/mcp/claude`, 54 tools + 4 prompts + read-only resource. Not submitted to Anthropic. |

### 2.2 CRM (9) — CREDENTIALS REQUIRED

| Provider | Status | Notes |
| --- | --- | --- |
| HubSpot | CREDENTIALS REQUIRED | OAuth 2.0 / private-app token |
| Salesforce | CREDENTIALS REQUIRED | OAuth 2.0; `instance_url` stored with credential |
| Pipedrive | CREDENTIALS REQUIRED | OAuth 2.0 |
| Close | CREDENTIALS REQUIRED | API key |
| GoHighLevel | CREDENTIALS REQUIRED | Bearer token |
| Zoho CRM | CREDENTIALS REQUIRED | OAuth 2.0 |
| Attio | CREDENTIALS REQUIRED | Bearer token |
| Breakcold | CREDENTIALS REQUIRED | API key |
| Monday.com | CREDENTIALS REQUIRED | API key (merged CRM + productivity entry) |

### 2.3 Email outreach (10) — CREDENTIALS REQUIRED

| Provider | Status | Notes |
| --- | --- | --- |
| Instantly | CREDENTIALS REQUIRED | Bearer token; suppression-respecting |
| Smartlead | CREDENTIALS REQUIRED | API key (`api_key` query param); max 400 leads/call |
| EmailBison | CREDENTIALS REQUIRED | Bearer token |
| Masterinbox | CREDENTIALS REQUIRED | API key; some endpoints unverified |
| SmartReach | CREDENTIALS REQUIRED | API key |
| Reply.io | CREDENTIALS REQUIRED | API key |
| Lemlist | CREDENTIALS REQUIRED | API key |
| Snov.io | CREDENTIALS REQUIRED | OAuth 2.0 (merged outreach + enrichment entry) |
| Mailshake | CREDENTIALS REQUIRED | API key |
| Woodpecker | CREDENTIALS REQUIRED | API key |

### 2.4 Lead enrichment (15)

| Provider | Status | Notes |
| --- | --- | --- |
| Apollo | CREDENTIALS REQUIRED | API key (`X-API-KEY`) |
| Hunter | CREDENTIALS REQUIRED | API key (`X-API-KEY`) |
| ZoomInfo | CREDENTIALS REQUIRED | OAuth 2.0 |
| ContactOut | CREDENTIALS REQUIRED | API key |
| SalesQL | CREDENTIALS REQUIRED | Bearer token |
| Snov.io | CREDENTIALS REQUIRED | OAuth 2.0 (enrichment side of merged entry) |
| Dropcontact | CREDENTIALS REQUIRED | API key |
| Persana | CREDENTIALS REQUIRED | API key; config-ready stub — verify before relying on it |
| Clearbit | PROVIDER BLOCKED | Standalone API deprecated post-HubSpot |
| Clay | CREDENTIALS REQUIRED | API key |
| Apify | CREDENTIALS REQUIRED | API key (`APIFY_TOKEN`) |
| RB2B | CREDENTIALS REQUIRED | Inbound webhook secret |
| Factors.ai | CREDENTIALS REQUIRED | API key; config-ready stub — verify before relying on it |
| Trigify | PROVIDER BLOCKED | Shut down 22 Oct 2026 |
| Weezly | PROVIDER BLOCKED | No public API exists |

### 2.5 Email verification (5) — CREDENTIALS REQUIRED

| Provider | Status | Notes |
| --- | --- | --- |
| MillionVerifier | CREDENTIALS REQUIRED | API key |
| ZeroBounce | CREDENTIALS REQUIRED | API key (`api_key` query param) |
| NeverBounce | CREDENTIALS REQUIRED | API key |
| Bouncer | CREDENTIALS REQUIRED | API key |
| Hunter Verifier | CREDENTIALS REQUIRED | API key (shares `HUNTER_API_KEY`) |

### 2.6 Automation platforms (4) — MOCK TESTED

| Provider | Status | Notes |
| --- | --- | --- |
| Make | MOCK TESTED | OAuth 2.1 + REST v1 (33 routes) + app manifest + scenario blueprints. Not submitted. |
| Pabbly Connect | MOCK TESTED | OAuth 2.1 + REST v1 (33 routes). Not submitted. |
| Albato | MOCK TESTED | OAuth 2.1 + REST v1 (33 routes). Not submitted. |
| Activepieces | MOCK TESTED | OAuth 2.1 + REST v1 (33 routes) + piece (`tsc` clean). Not submitted. |

### 2.7 Communication (5) — CREDENTIALS REQUIRED

| Provider | Status | Notes |
| --- | --- | --- |
| Slack | CREDENTIALS REQUIRED | OAuth 2.0 (bot token / incoming webhook) |
| Microsoft Teams | CREDENTIALS REQUIRED | Incoming-webhook URL |
| Discord | CREDENTIALS REQUIRED | Channel webhook URL |
| Telegram | CREDENTIALS REQUIRED | Bot token |
| WhatsApp Business | CREDENTIALS REQUIRED | Bearer token |

### 2.8 Productivity (12) — CREDENTIALS REQUIRED

| Provider | Status | Notes |
| --- | --- | --- |
| Google Sheets | CREDENTIALS REQUIRED | OAuth 2.0 (Sheets scope; Gmail-only grants must re-connect) |
| Google Drive | CREDENTIALS REQUIRED | OAuth 2.0 (`drive.file` scope) |
| Google Calendar | CREDENTIALS REQUIRED | OAuth 2.0 (`calendar.events` scope) |
| Airtable | CREDENTIALS REQUIRED | API key + base/table IDs |
| Notion | CREDENTIALS REQUIRED | Internal integration secret + database ID |
| Monday.com | CREDENTIALS REQUIRED | API key (productivity side of merged entry) |
| Asana | CREDENTIALS REQUIRED | OAuth 2.0 |
| Trello | CREDENTIALS REQUIRED | API key |
| ClickUp | CREDENTIALS REQUIRED | API key |
| Jira | CREDENTIALS REQUIRED | API key |
| Linear | CREDENTIALS REQUIRED | API key |
| Calendly | CREDENTIALS REQUIRED | OAuth 2.0 |

### 2.9 AI MCP clients (3) — CREDENTIALS REQUIRED (guides only)

| Provider | Status | Notes |
| --- | --- | --- |
| Gemini | CREDENTIALS REQUIRED | Guide only; connects to existing MCP servers via DCR. No new server built. |
| Cursor | CREDENTIALS REQUIRED | Guide only; as above. |
| Claude Code | CREDENTIALS REQUIRED | Guide only; as above. |

### 2.10 Category J (3) — CREDENTIALS REQUIRED

| Provider | Status | Notes |
| --- | --- | --- |
| GetLeads | CREDENTIALS REQUIRED | API key; fair-use response shape unread (credit balance returns null); no operator guide yet |
| Cornersight | CREDENTIALS REQUIRED | API key; no operator guide yet |
| HotHawk | CREDENTIALS REQUIRED | Bearer token; enrolment + creation request bodies unverified; no operator guide yet |

### 2.11 Evaluated, NOT IMPLEMENTED (7)

| Provider | Status | Reason |
| --- | --- | --- |
| Saava | NOT IMPLEMENTED | No public API / no fit (per `fa2199a` evaluation) |
| Jungler | NOT IMPLEMENTED | No public API / no fit (per `fa2199a` evaluation) |
| Cargo | NOT IMPLEMENTED | No public API / no fit (per `fa2199a` evaluation) |
| Alysio | NOT IMPLEMENTED | No public API / no fit (per `fa2199a` evaluation) |
| IntentStream | NOT IMPLEMENTED | No public API / no fit (per `fa2199a` evaluation) |
| Twain | NOT IMPLEMENTED | Docs are JavaScript-rendered and unverifiable |
| Loopster | NOT IMPLEMENTED | API base host unverified |

Not duplicated (already covered): Masterinbox and SmartReach already
had adapters (§2.3).

**Table totals:** 69 definitions (5 + 9 + 10 + 15 + 5 + 4 + 5 + 12 +
3 + 3, counting the two merged entries once each) + 7 not implemented
= 76 rows. Of the 69: 9 MOCK TESTED (5 platforms + 4 automation),
57 CREDENTIALS REQUIRED, 3 PROVIDER BLOCKED.

## 3. What Wave 2 built (by commit)

| Commit | Change | Size |
| --- | --- | --- |
| `0e63d4a` | Centralized integration engine + inventory (stages 0–1): engine tables, provider types, Center registry groundwork | 13 files, +1,916 |
| `f9c8327` | CRM, email outreach, enrichment, verification, comms + productivity adapters + Make/Pabbly/Albato/Activepieces automation platforms; migration 031; migration 036 (notification preferences) | 553 files, +42,920 |
| `340a9ac` | Root `tsconfig.json` excludes `integrations/`; root ESLint ignores `integrations/**`; 5 stale `src` test type errors fixed | 5 files |
| `fa2199a` | Marketplace (search/filter/sort, provider detail pages) + Category J adapters (GetLeads, Cornersight, HotHawk); registries 5→69 / 20→83 | 18 files, +4,594 |
| `628a825` | Developer platform (Developers pages, API docs, API keys, webhooks), admin provider monitoring + disable switch (migration 038) | 37 files, +5,860 |
| `f8dea22` | Build fix: `developers/reference.ts` made client-safe (literals 120/120/3 pinned by test); corrects the `628a825` build claim | 2 files |

Total across the six commits: ≈55,300 insertions (per-commit stats;
files overlap between commits, so file counts do not sum cleanly).
Prior platform work this builds on (not Wave 2): Zapier app
(`e342e1a`), n8n node (`cdc7252` + `fee6221`), Claude MCP
(`2c0ae30`), ChatGPT MCP, Muse MCP — each with its own final report
in the repo root (`NxtSend_{Muse,ChatGPT,Claude,Zapier,n8n}_Integration_Final_Report.md`).

**Process incident:** `628a825` was pushed while `npm run build` was
failing — a piped `grep` in the verification command masked the
non-zero exit code. Fixed in `f8dea22`. Lesson, now a rule: verify
build exit codes directly, never through a pipe.

## 4. Database changes

- **New tables (migrations 022–031, 036, 038):** Flow AI features
  (022); Muse OAuth `muse_oauth_clients/codes/tokens` (023); ChatGPT
  OAuth resource (024); Zapier webhook subscriptions + deliveries
  (025); leads `updated_at` (027); n8n API keys `nxtsend_api_keys`
  (028); n8n webhook platform (029); integration engine
  `integration_connections`, `integration_sync_jobs`,
  `integration_usage` (030); automation platforms (031); notification
  preferences (036); provider disable flags
  `provider_disabled_flags` (038).
- **RLS:** the Wave 2 tables have RLS **enabled with zero policies**
  (default-deny for client roles); they are reachable only through
  the service-role server code. Migration 022 is the exception (12
  policies).
- **Gaps:** migrations **032–035 and 037 do not exist**. The owner
  applies 022–031, 036, 038. Any apply script expecting one file per
  number 022–038 will fail on the gaps.
- No migration in Wave 2 alters a pre-existing product table except
  027 (adds `updated_at` to leads).

## 5. Frontend changes

- **Marketplace** (`dashboard/integrations/`): search, category +
  connected filters, Featured / Recently added / Name sorting;
  provider detail pages with a Provider details section,
  field-mapping tables (19 adapters), and honest empty states for
  sync / usage / activity.
- **Developers** (`dashboard/developers/`): home, API reference
  (`reference.ts` — client-safe, literals 120/120/3), API Keys
  (n8n-only), Webhooks.
- **Admin monitoring** (`admin/integrations/monitoring/[provider]/`):
  per-provider API counts + disable switch (migration 038).
- **Status display:** new adapter ids show a generic status — the
  status service returns "Unknown integration." for ids it has no
  rule for, rewritten in the display layer. No Test Connection button
  exists for the 60+ new adapters.

## 6. Backend changes

- **Shared REST layer** (`src/lib/integrations/rest/`): one
  implementation serving six platforms; auth (`resolveRestContext`),
  120/min-per-token rate limiting (in-memory, per process),
  `demo_mode` 503, `provider_disabled` 503, webhook outbox
  (HMAC, dedup, 3 attempts, 5m→30m backoff, 410 deactivation).
- **Shared OAuth 2.1 server** (`src/lib/muse-connector/oauth/`):
  PKCE S256, DCR (RFC 7591), CIMD, refresh rotation with
  reuse-revokes-grant (10-min grace for Zapier/n8n grants only),
  RFC 7009 revocation, RFC 8707 resource, RFC 9207 issuer.
  Endpoints under `/api/muse/oauth/`.
- **MCP servers** (`/api/mcp`, `/api/mcp/chatgpt`, `/api/mcp/claude`):
  one shared adapter, 54 tools each, per-grant scope enforcement.
- **Provider framework** (`src/lib/integrations/providers/`):
  adapter pattern + definitions registry (69) + sync jobs +
  suppression-respecting email outreach + field mappings.
- **Native platform artefacts:** Zapier CLI app, n8n community node
  (`n8n-nodes-nxtsend` v0.1.0, 12 workflow templates), Make manifest
  + blueprints, Activepieces piece.
- **Webhooks:** 8 events, shared envelope, outbox + daily 06:00 cron
  retry (`/api/jobs/run`).

## 7. Test + build results (re-run for this report)

| Check | Result |
| --- | --- |
| Repo suite (`npm test`) | **PASS — 2,293 passing, 0 failing** (224 files). Observed by the author; matches the coordinator's verified 2,293. |
| n8n package (`npx jest`) | **PASS — 126/126** (5 suites). Observed by the author. |
| `npx tsc --noEmit` | **PASS — clean, exit 0.** Observed by the author. |
| `npm run build` | **PASS — exit 0.** Re-run directly by the author (no pipe). |
| `npm run config:check` | Exit 0; 108 vars; 1 set / 107 missing in this sandbox (expected). |
| Config parity | `.env.example` 108 = `CONFIG_CATALOG` 108 = `check-config.mjs` 108. |

**MOCK TESTED / PASS distinction:** PASS above means the command
exited 0. Every provider is at best MOCK TESTED — its tests stub the
provider HTTP layer. No live provider call, grant flow, or webhook
delivery has ever succeeded. Full detail:
`docs/integrations/TESTING_REPORT.md`.

## 8. Deployment status

- **The deploy has landed — re-checked 2026-11-18 ~21:30 +06.**
  Homepage build ID is now `BAaomykL5AuHSrZJB-y9C` (was the stale
  `SRCeQ_zoG-67TWwPomTCn` at the ~07:25 +06 check). n8n health,
  Make health, Zapier health and MCP health all return **200**
  (n8n: `{"mode":"demo","n8nEnabled":true}`; MCP: 54 tools, demo
  mode). n8n and Make well-known metadata return 200; the root
  metadata lists all 21 OAuth scopes (muse/nxtsend/claude ×3,
  zapier/n8n/make/pabbly/albato/activepieces ×2). The dashboard
  Developers page renders live with Phase 2 content (API keys,
  webhook subscriptions, Make/Pabbly references).
- **One item NOT confirmed in this check:** the marketplace page
  (`/dashboard/integrations`) returned HTTP 200 on the same new
  build ID, but the 83 provider cards were not visible in the
  fetched/crawled snapshot — the page showed the Integration Center
  intro + Outbound Webhooks section with "Loading…" (the cards
  render after a client-side status fetch). A rendered-browser
  check of the marketplace page is still needed; do not claim the
  cards render live until that check is done.
- The earlier lag (pre-n8n build served for ~20 h) resolved
  without any code change — the cause remains unknown. The owner
  need no longer check Vercel → Deployments for the missing n8n
  deploy, but a deploy that takes ~20 h to land is worth watching
  on the next push.

## 9. Security notes

- **Encryption:** AES-256-GCM throughout — mailbox OAuth tokens
  (`TOKEN_ENCRYPTION_KEY`, migration 014), Hub vault credentials
  (`INTEGRATION_HUB_ENCRYPTION_KEY`, migration 016, dedicated key).
  n8n API keys stored as SHA-256 hashes only, shown once.
- **Never exposed:** credential values, token values, token hashes,
  and webhook secrets are never rendered in the UI, returned by any
  API, or written to logs. `check-config.mjs` prints classifications,
  never values.
- **Isolation:** RLS workspace scoping; REST tokens resolve to one
  workspace only; service role is server-only.
- **Audit gaps (honest):** ChatGPT/Claude calls are all logged as
  `muse.tool.*` (no per-client split); the 60+ config-ready adapters
  write no audit rows (admin counts show null, not zero).
- **Kill-switch:** provider disable flag enforced on the six REST
  automation platforms only; the config-ready connect flow is not
  yet gated.
- Full detail: `docs/integrations/SECURITY.md`.

## 10. Env vars

- **108 variables** in `.env.example`, with `CONFIG_CATALOG` and
  `scripts/check-config.mjs` in parity (all three counted at 108).
- Integration-critical: `TOKEN_ENCRYPTION_KEY`,
  `INTEGRATION_HUB_ENCRYPTION_KEY`, `CRON_SECRET`,
  `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` (+ Supabase pair).
- No `*_OAUTH_CLIENT_SECRET` exists for any of the nine platforms
  (DCR-issued); no `N8N_API_KEY` env var (keys created in-app).
- Full list: `docs/integrations/DEPLOYMENT.md` §2 and
  `docs/integrations/CREDENTIAL_CHECKLIST.md`.

## 11. Credentials still required

Everything in `docs/integrations/CREDENTIAL_CHECKLIST.md` — in short:
the two encryption keys + `CRON_SECRET` + Supabase keys (platform);
one credential per adapter the owner actually wants to use (57
config-ready adapters + 3 Category J); nothing for the 9 platforms
themselves (DCR-issued) except their submissions/publications. Do not
obtain Clearbit, Trigify, or Weezly credentials — blocked.

## 12. Approvals required (owner decisions)

1. **Apply migrations 022–031, 036, 038** in Supabase (note the gaps
   032–035, 037) and set `TOKEN_ENCRYPTION_KEY` /
   `INTEGRATION_HUB_ENCRYPTION_KEY` / `CRON_SECRET` in Vercel.
2. **Rendered-browser check of the marketplace page**
   (`/dashboard/integrations`) — the deploy itself has landed
   (§8), but the 83 provider cards were not visible in the
   fetched/crawled snapshot and need a live rendered check.
3. **Run one live grant flow per platform** (9 platforms) and record
   the results — this is what turns MOCK TESTED into verified.
4. **Submit / publish** each platform artefact: Meta (Muse), OpenAI
   (ChatGPT), Anthropic (Claude), Zapier app, n8n node on npm, Make
   app, Pabbly, Albato, Activepieces piece. None has been started.
5. **Provide credentials** for each adapter the owner wants live
   (checklist §11), starting with the ones tied to real workflows.
6. **Decide the Muse 18-vs-54 tool discrepancy** (§9, item 1): the
   registry text or the served manifest must change before any Meta
   submission.
7. **Decide on the known gaps** in §13 (Test Connection for new
   adapters, sync-jobs visibility, disable-flag gating, per-client
   audit split) — fix, or record as accepted limitations.

## 13. Remaining blockers

- Owner has not applied migrations 022–031, 036, 038.
- Owner has not set `TOKEN_ENCRYPTION_KEY` (blocks every grant flow).
- Vercel deploy lag RESOLVED 2026-11-18 ~21:30 +06 (build ID
  `BAaomykL5AuHSrZJB-y9C`; cause unknown). Marketplace provider
  cards not yet confirmed in a rendered browser (see §8).
- No platform submission/publication started.
- No live credential stored for any of the 64 adapters.
- No Test Connection path for the 60+ new adapters.
- Sync-job results (including skipped counts) have no UI/API surface.
- Provider disable flag does not gate the config-ready connect flow.
- No persistent idempotency ledger (retried `create_campaign` may
  duplicate).
- Category J operator guides do not exist; HotHawk request bodies and
  GetLeads fair-use shape are unverified.

## 14. Known discrepancies found during documentation (not hidden)

1. **Muse serves 54 tools, not 18.** The registry capability text
   says 18; `adapter.listTools()` returns the full 54-tool manifest
   with no slicing (Stage 0 audit finding). The registry text is
   stale; fix before any Meta submission.
2. **Migration gaps.** "022–038" is not contiguous: 032–035 and 037
   have no files. The owner applies 022–031, 036, 038.
3. **Skipped-lead count wording.** The brief for this doc set said
   the count is "not surfaced in any sync-job result". Inspection of
   `finishSyncJob` (`src/lib/integrations/providers/sync.ts`) shows
   it **is** persisted (`skipped_count`) and returned in the
   `SyncResult`. The real gap is narrower: no UI/API surface lists
   sync jobs. Recorded accurately in the inventory and limitations
   docs.
4. **`628a825` build incident** (see §3): pushed while the build was
   failing; fixed in `f8dea22`.

## 15. Documents delivered in this phase

| File | Lines | Contents |
| --- | --- | --- |
| `docs/integrations/README.md` | 90 | Ecosystem map, live vs config-ready, doc index |
| `docs/integrations/INTEGRATION_INVENTORY.md` | 287 | Every provider + Category J table + migrations + contradictions (rewritten in place at `f8dea22`) |
| `docs/integrations/PROVIDER_SETUP.md` | 162 | Per-provider auth + credential + where to obtain |
| `docs/integrations/OAUTH_SETUP.md` | 120 | Shared OAuth 2.1 server, scopes, endpoints, callbacks |
| `docs/integrations/API_DOCUMENTATION.md` | 205 | v1 routes, MCP, auth, errors, rate limits |
| `docs/integrations/WEBHOOK_DOCUMENTATION.md` | 119 | 8 events, HMAC, outbox + retry |
| `docs/integrations/DEVELOPER_GUIDE.md` | 146 | Developers pages, API keys, reference data, adding a provider |
| `docs/integrations/TESTING_REPORT.md` | 112 | What was run, MOCK TESTED / PASS, gaps |
| `docs/integrations/SECURITY.md` | 102 | Encryption, RLS, what is never exposed |
| `docs/integrations/DEPLOYMENT.md` | 133 | Vercel, env, migrations, cron, honest deploy status |
| `docs/integrations/CREDENTIAL_CHECKLIST.md` | 139 | Every credential still needed |
| `docs/integrations/KNOWN_LIMITATIONS.md` | 165 | Every limitation, with code pointers |
| `NxtSend_Integration_Ecosystem_Final_Report.md` | 419 | This file |
| `audit-screenshots/integration-ecosystem/README.md` | 30 | Screenshot list only — no screenshots fabricated |

Total: 2,229 lines across the 14 files.
