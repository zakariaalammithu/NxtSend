# NxtSend × Zapier Integration — Final Report

**Date:** 2026-11-17
**Scope:** Server (OAuth extension + REST API v1 + REST Hook webhooks),
Platform CLI app, Settings UI + admin visibility, docs.
**Status: IMPLEMENTED, unit-tested, NOT verified live, NOT published.**
**Commit/push:** deliberately NOT done — all work is uncommitted in
the working tree (see "Files changed" below).

## Executive Summary

NxtSend now speaks Zapier. Zapier calls **into** NxtSend (REST API +
REST Hook webhooks) on behalf of a signed-in NxtSend user, through
the shared OAuth 2.0 server extended with `zapier.read` /
`zapier.write` scopes (no `.send` tier). The surface is complete:
28 REST routes + health + metadata, 8 webhook events with an outbox
and cron retry, a Platform CLI app (5 polling triggers, 8 instant
triggers, 12 actions, 5 searches, 4 dropdowns), a Settings UI entry
whose "Connected" state comes only from a real OAuth grant, and an
admin panel. Tests: **repo suite 1,550 passing (131 files), CLI
package 60/60, `zapier-platform validate` exit 0, production build
passes.**

What it is not: nothing has run against a live deployment, no Zapier
developer account was used from this environment, and nothing has
been submitted to Zapier. Publication is NOT claimed. LinkedIn
sending is NOT SUPPORTED (no authorized provider; the official
LinkedIn API exposes no connection-request/DM endpoints to standard
developers).

## Audit findings (verified against real code, 2026-11-17)

Every count below was verified by reading the implementation, not by
trusting summaries. Two brief claims were corrected in the course of
this work:

1. **Route count is 30, not 29.** `src/app/api/integrations/zapier/`
   holds **29** route files (health, emit, 26 × `v1/*`, plus the
   session-authenticated `subscriptions` route added in the
   coordinator pass) and the protected-resource metadata route adds
   1 more — **30 Zapier route files total**, all present in the
   production build output (`.next/server/app/...`). (The count was
   29 before the coordinator pass added the subscriptions route.)
2. **The `webhooks` registry entry was stale.** It said "NOT a native
   Zapier app (none exists or is claimed)". A native Zapier app now
   exists (implemented, not published); the entry now points to the
   Zapier entry instead.

Other findings, all confirmed in code:

- **OAuth:** scopes `zapier.read` + `zapier.write` only
  (`src/lib/muse-connector/oauth/scopes.ts`); resource
  `https://<origin>/api/integrations/zapier`; redirect pattern host
  `zapier.com`, path `/dashboard/auth/oauth/return/App<digits>CLIAPI/`
  (`isZapierRedirectUri`, trailing slash tolerated); PKCE optional
  for confidential clients only, still required for public clients
  (migration 026 makes `code_challenge` nullable); refresh rotation
  with a **10-minute reuse grace for Zapier grants only** (reuse
  outside the window, or for Muse/ChatGPT/Claude grants, still
  revokes the grant); DCR-registered client — no env client vars, no
  hardcoded credentials.
- **REST API:** auth/test, leads (list/get/create w/ email dedup /
  PATCH / import max 100), campaigns (list/get/create **DRAFT-ONLY**
  / PATCH / pause / resume / stop→archived / archive / performance
  with `accepted` always null / enroll / remove), conversations
  (list/thread/replies via `sendInboxReply`, email only, 422
  LinkedIn, idempotency replay), accounts, usage, 4 searches,
  4 dropdowns. Demo → 503; 120 req/min per token, in-memory.
- **Webhooks:** subscriptions + outbox deliveries (migration 025);
  subscribe validates https + `hooks.zapier.com` / `zapier.com`;
  per-subscription HMAC secret generated server-side, never
  returned; HMAC-SHA256 headers `X-NxtSend-Signature` +
  `X-NxtSend-Timestamp` (Zapier does not document verifying them —
  stated, not claimed); best-effort immediate attempt + retries on
  the daily 06:00 cron (5m → 30m backoff, max 3, then `dead`);
  **a failed delivery may wait up to ~24h for its next retry** —
  instant guaranteed delivery is NOT claimed; 410 deactivates a
  subscription.
- **Emission coverage:** dashboard + Zapier API + Stripe + dashboard
  replies emit. **MCP-tool mutations and scheduled-reply sends do
  not emit yet** (no seam added to the shared MCP adapter by design).
- **CLI app:** 5 polling triggers, 8 instant REST-hook triggers, 12
  actions, 5 searches, 4 hidden dropdown triggers; `zapier-platform-core`
  **18.6.0**; plain JS + JSDoc; no secrets (only
  `{{process.env.CLIENT_ID/SECRET}}` placeholders); `register` /
  `push` / `promote` NEVER run (need the owner's Zapier developer
  account).
- **Settings UI (this work):** the `zapier` registry entry, status,
  verify, detail page and admin panel were built against the real
  code paths listed in "Files changed". Two gaps were found and are
  stated honestly in the UI instead of faked (see "Remaining
  blockers").

## Architecture

Zapier (client) → NxtSend OAuth server (`/api/muse/oauth/*`) for
tokens → Zapier REST API v1 (`/api/integrations/zapier/v1/*`) for
data → NxtSend outbox → `POST https://hooks.zapier.com/...` for
events. Full diagram and component table:
`docs/zapier-integration/ARCHITECTURE.md`. Server detail:
`docs/zapier-integration/ZAPIER_SERVER.md`.

## Files changed (all Zapier work — server + CLI + UI)

`git status` at report time: **42 tracked files modified** (`git diff
--stat`: 1,537 insertions, 89 deletions) and **116 untracked files**
(excluding `integrations/zapier/node_modules/` and `build/`, which
are git-ignored). **Nothing is committed or pushed.**

### Server (server agent — read and verified, not modified by this work)

- `src/lib/muse-connector/oauth/` (additive): `scopes.ts`,
  `config.ts`, `clients.ts`, `authorize.ts`, `state.ts`, `store.ts`,
  `tokens.ts`, `handlers.ts`, `index.ts`; consent screen
  (`src/app/api/muse/oauth/authorize/route.ts`); well-known metadata
  routes (incl. the Zapier resource route).
- `src/lib/integrations/zapier/` (new, 9 files + 4 test files):
  `config.ts`, `events.ts`, `outbox.ts`, `emit.ts`, `client.ts`,
  `auth.ts`, `audit.ts`, `api.ts`, `route-helpers.ts`.
- `src/app/api/integrations/zapier/` (new, 28 route files).
- Migrations `025_zapier_webhooks.sql`, `026_oauth_pkce_optional.sql`,
  `027_leads_updated_at.sql`.
- `.env.example` (Zapier section).
- Additive seams only: `src/lib/data/leads.ts`,
  `src/lib/data/webhook-emission.ts`, `src/lib/inbox/reply.ts`,
  `src/app/api/inbox/conversations/[id]/reply/route.ts`,
  `src/lib/billing/webhook.ts`, `src/app/api/webhooks/stripe/route.ts`,
  `src/lib/jobs/`, `src/types/index.ts`, `src/lib/config-status.ts`.

### CLI app (CLI agent — read and verified, not modified by this work)

- `integrations/zapier/` (52 files excl. `node_modules/`/`build/`):
  `index.js`, `authentication.js`, `triggers/` (5 polling + 4
  hidden dropdowns), `triggers/instant/` (8), `creates/` (12),
  `searches/` (5), `lib/`, `test/` (5 suites), `package.json`,
  `README.md`.

### Settings UI + admin (this work)

Modified (14 files, `git diff --stat`: 933 insertions, 21 deletions):

| File | Change |
|---|---|
| `src/lib/integrations-center/registry.ts` | New `zapier` entry (kind `adapter`, category Automation); fixed the stale `webhooks` entry wording. |
| `src/lib/integrations-center/status.ts` | New `zapierGrantsActive` option + `zapier` case (grant-only "Connected"). |
| `src/lib/integrations-center/verify.ts` | New `zapier` case (demo + live; configuration alone never verifies). |
| `src/app/api/integrations/status/route.ts` | Wires `zapierGrantsActive` from `countActiveGrantsByOrigin().zapier`. |
| `src/app/(dashboard)/dashboard/integrations/[id]/page.tsx` | New separate `ZapierLivePanels` (health, endpoints, scopes, trigger/action/search inventory, webhook note, connect steps, grants + revoke, activity gap, security notes) + Zapier disconnect text. |
| `src/components/dashboard/IntegrationCenterBits.tsx` | `zapier: Zap` icon. |
| `src/lib/muse-connector/grants.ts` | `GrantOrigin` += `Zapier`; `grantOriginForClient` checks the Zapier redirect URI first; `GrantsByOrigin` += `zapier`; `zapier.*` scope fallback. |
| `src/lib/admin/platform-server.ts` | New `zapier` health check in `getSystemHealth()` (same shape as the MCP checks). |
| `src/app/api/admin/muse/route.ts` | Doc comment only (grants-by-origin list now includes Zapier). |
| `src/app/(admin)/admin/integrations/muse-ai/page.tsx` | Grants-by-origin table now includes Zapier (type + copy). |
| `src/lib/admin/nav.ts` | "Zapier Integration" admin nav item. |
| `.gitignore` | `integrations/zapier/node_modules/`, `build/`, `.zapierapprc`. |
| `src/lib/integrations-center/__tests__/center.test.ts` | 4 new Zapier tests. |
| `src/lib/muse-connector/__tests__/grants.test.ts` | 2 new Zapier tests; 3 existing expectations updated for the new `zapier: 0` field. |

New (this work):

| File | Contents |
|---|---|
| `src/app/api/admin/zapier/route.ts` (253 lines) | Admin Zapier overview: grants by origin, active subscriptions (secret never selected), delivery counts + recent failed/dead deliveries (payloads never selected), `zapier.*` API-call counts, recent errors/events. |
| `src/app/(admin)/admin/integrations/zapier/page.tsx` (382 lines) | Admin Zapier page (live overview, grants by origin, subscriptions, failed/dead deliveries, API-call counts, recent errors/events, owner steps). |
| `src/lib/admin/__tests__/zapier-health.test.ts` (50 lines) | Health-check + admin-nav tests. |
| `docs/zapier-integration/` (14 files, 1,381 lines) | README, ARCHITECTURE, AUTHENTICATION, TRIGGERS, ACTIONS, SEARCHES, WEBHOOKS, API_REFERENCE, SECURITY, VERCEL_DEPLOYMENT, ZAPIER_SETUP, TESTING, PUBLISHING, TROUBLESHOOTING. (Plus the server agent's `ZAPIER_SERVER.md`, kept and not counted toward the 14.) |
| `NxtSend_Zapier_Integration_Final_Report.md` | This file. |
| `audit-screenshots/zapier-integration/README.md` | 14 screenshots to capture live — no fabricated screenshots. |

`.env.example` needed **no change** from this work: `ZAPIER_ENABLED`,
`ZAPIER_APP_BASE_URL` and `TOKEN_ENCRYPTION_KEY` were already present
(with descriptions) from the server agent's work.

## Decisions made (this work)

1. **"Connected" rule: grant-only, like the MCP entries.** A real,
   active Zapier OAuth grant is the ONLY thing that yields
   "Connected and Verified" for the `zapier` entry; enabled + public
   URL with no grant is "Connected but Not Verified"; disabled is
   "Not Connected"; demo is "Demo Mode". A webhook subscription was
   NOT used as a second connection signal: subscriptions are created
   with a grant token, so a subscription cannot exist without a
   grant, and the grant count is the connection signal already
   available to the status route. Documented in `status.ts`.
2. **Separate Zapier panel, not `ConnectorLivePanels`.** That
   component is MCP-specific (fetches `/api/muse/grants` +
   `/api/muse/activity`, renders MCP endpoints from `CONNECTOR_COPY`).
   Zapier is a REST surface with its own endpoints, scopes and
   trigger/action inventory, so it gets its own `ZapierLivePanels`.
   It reuses the grants API (filtered by the `zapier.*` scope prefix
   — sufficient, because Zapier grants are resource-bound and always
   carry `zapier.*` scopes) and the public health endpoint.
3. **Grants by origin extended, not forked.** Zapier grants share
   the same `muse_oauth_tokens` table with a `zapier.*` prefix, so
   `grantOriginForClient` / `summarizeGrantsByOrigin` /
   `GrantsByOrigin` were extended with `Zapier` (redirect-URI check
   first, scope-prefix fallback) instead of building a parallel
   counting path.
4. **Two gaps stated, not faked.** See "Remaining blockers" items 1–2.
5. **Core kept at 18.6.0.** The D027 validate warning (upgrade to
   19.3.0) is intentionally not acted on — a major-version upgrade
   is a separate owner decision.
6. **`.zapierapprc` git-ignored** alongside `node_modules/` and
   `build/` (the register credential file must never be committed).
7. **Build artifacts not deleted** — `integrations/zapier/build/`
   (build.zip, source.zip) stays on disk, ignored.

## Endpoints

Base `/api/integrations/zapier/v1/*` (+ public `GET /api/integrations/zapier/health`).
Full table: `docs/zapier-integration/API_REFERENCE.md`. Summary:

| Group | Routes |
|---|---|
| Auth | `GET /v1/auth/test` |
| Leads | `GET /v1/leads`, `GET /v1/leads/:id`, `POST /v1/leads`, `PATCH /v1/leads/:id`, `POST /v1/leads/import` |
| Campaigns | `GET /v1/campaigns`, `GET /v1/campaigns/:id`, `POST /v1/campaigns` (draft-only), `PATCH /v1/campaigns/:id`, `POST /v1/campaigns/:id/pause\|resume\|stop\|archive`, `GET /v1/campaigns/:id/performance`, `POST /v1/campaigns/:id/leads`, `DELETE /v1/campaigns/:id/leads/:leadId` |
| Conversations | `GET /v1/conversations`, `GET /v1/conversations/:id`, `POST /v1/conversations/:id/replies` |
| Accounts / usage | `GET /v1/accounts`, `GET /v1/usage` |
| Search | `GET /v1/search/leads\|campaigns\|conversations\|accounts` |
| Dropdowns | `GET /v1/dropdowns/campaigns\|accounts\|lead-statuses\|sequences` |
| Webhooks | `POST /v1/webhooks/subscribe`, `POST /v1/webhooks/unsubscribe`, `GET /v1/webhooks/subscriptions` |

## Triggers / actions / searches

**Polling triggers (5):** New Lead, Lead Updated, New Campaign,
Campaign Status Changed, New Conversation — Zapier polls on the
plan's interval (minutes); max 100 newest per poll.
**Instant triggers (8):** New Lead, Lead Updated, Lead Added to
Campaign, Lead Removed From Campaign, New Campaign, Campaign Status
Changed, New Reply, Subscription Changed — REST Hooks; see the
latency note below.
**Actions (12):** Create/Update/Import Lead; Create/Update/Pause/
Resume/Stop/Archive Campaign; Add/Remove Leads to/from Campaign;
Send Reply (email only).
**Searches (5):** Find Lead/Campaign/Conversation/LinkedIn Account;
Get Campaign Performance. Find-or-Create pairings for Lead and
Campaign. **Dropdowns (4, hidden):** campaigns, accounts,
lead-statuses, sequences. No templates dropdown (no template store).
Full tables: `docs/zapier-integration/TRIGGERS.md`,
`ACTIONS.md`, `SEARCHES.md`.

## Webhook design + latency

Outbox pattern (`zapier_webhook_subscriptions` +
`zapier_webhook_deliveries`, migration 025). Mutation enqueues
synchronously (never failing the mutation) → best-effort immediate
attempt (8s timeout, HMAC-SHA256 signed) → failures retry via
`zapier_webhook_retry` on the **daily 06:00 cron** (5m → 30m backoff,
max 3 attempts, then `dead`; dead rows kept). **A failed delivery may
wait up to ~24h for its next retry — instant guaranteed delivery is
NOT claimed.** 410 deactivates the subscription; stale subscriptions
(inactive > 30 days) are removed by the job. Events with real
delivery: `lead.created`, `lead.updated` (any successful update,
`changed_fields`), `lead.added_to_campaign`,
`lead.removed_from_campaign`, `campaign.created`,
`campaign.status_changed`, `conversation.reply_created`,
`subscription.changed`.

## DB changes (migrations 025–027)

| Migration | Change |
|---|---|
| `025_zapier_webhooks.sql` | `zapier_webhook_subscriptions` + `zapier_webhook_deliveries` (RLS, zero policies, service-role only). |
| `026_oauth_pkce_optional.sql` | `muse_oauth_codes.code_challenge` NOT NULL dropped (non-destructive). |
| `027_leads_updated_at.sql` | `leads.updated_at` (backfilled from `created_at`) + BEFORE UPDATE trigger. |

Migrations 023–024 (OAuth tables + resource column) are prerequisites.

## Security notes

- Tokens/codes stored as SHA-256 hashes only; no token, code, secret
  or webhook HMAC secret is ever logged, returned, or shown in any UI.
- OAuth + webhook tables: RLS enabled, zero policies, service-role only.
- No `ZAPIER_OAUTH_CLIENT_SECRET` env var; no global webhook secret var.
- PKCE optional for confidential clients only; public clients still
  require PKCE S256. Refresh rotation + 10-min Zapier-only reuse
  grace (tradeoff stated in `AUTHENTICATION.md`).
- Resource-bound tokens (RFC 8707); workspace-scoped, scope-enforced
  calls; `zapier.read` cannot write.
- Subscribe validates https + `hooks.zapier.com` / `zapier.com` only.
- Demo Mode refuses the whole surface (503); no demo data is served.
- LinkedIn boundary: no LinkedIn-send action/trigger/endpoint;
  LinkedIn replies refused 422; `accepted` always null.
- Full notes: `docs/zapier-integration/SECURITY.md`.

## Test + build + validate results

| Check | Result | Status |
|---|---|---|
| Repo suite (`npm test`, re-run 2026-11-17) | **131 files, 1,550 tests, all passing** (was 1,536; +9 UI/admin, +5 coordinator pass: activity filter + session subscriptions route) | PASS |
| Muse/ChatGPT/Claude suites | Keep passing (included in the 1,550) | PASS |
| CLI package (`npx jest` in `integrations/zapier/`) | **5 suites, 60 tests, all passing** | PASS |
| CLI validation (`zapier-platform validate`) | **Exit 0 — 27 checks passed, 0 failed**; 1 general warning D027 (core 18.6.0 → 19.3.0, intentionally not upgraded) | PASS |
| Production build (`npm run build`) | **Passes** (Next.js 14.2.35); 30 Zapier route files in build output; only 2 pre-existing `react-hooks/exhaustive-deps` warnings in the MCP detail-page panels | PASS |
| CLI build | `zapier-platform build --skip-dep-install` produced `build.zip` (plain `build` hits EMFILE at ulimit 4096 in this sandbox) | PASS |

Two build failures were hit and fixed during this work (both in the
new UI code, both FIXED): a duplicated `ClaudeLivePanels` wrapper
introduced by an edit (removed the duplicate) and an ESLint
`prefer-const` error in the new admin route (changed `let` to
`const`). Both are fixed; the final build passes.

## Live verification

Verified on https://nxtsend.com by read-only live checks after the
Vercel deploy of commit e342e1a (deploy landed ~20:42 UTC, 2026-11-16;
curl checks + a live browser check of the settings page at ~20:47 UTC):

| Check | Result |
| --- | --- |
| Vercel deploy of e342e1a | **PASS** — Zapier health route 404'd until ~20:42 UTC, then returned JSON |
| `GET /api/integrations/zapier/health` | **PASS** — `{"mode":"demo","zapierEnabled":true,"version":"1.0.0"}` |
| `GET /.well-known/oauth-protected-resource/api/integrations/zapier` | **PASS** — `{"resource":"https://nxtsend.com/api/integrations/zapier","authorization_servers":["https://nxtsend.com"],"scopes_supported":[...all eleven scopes incl. "zapier.read","zapier.write"],"bearer_methods_supported":["header"]}` |
| `GET /api/integrations/zapier/v1/auth/test` (no token) | **PASS (demo behaviour)** — 503 `{"error":"Zapier is not available in Demo Mode. Connect a real Supabase project first — demo data is never shared with Zapier.","code":"demo_mode"}` |
| Integration page `/dashboard/integrations/zapier` (demo) | **PASS** — renders fully: "Zapier" heading, Demo Mode badge + banner, REST API base URL `https://nxtsend.com/api/integrations/zapier/v1`, `zapier.read`/`zapier.write` scopes ("there is no zapier.send tier"), 6-step Connect to Zapier, 13 triggers (5 polling + 8 REST-hook), 12 actions, 5 searches + 4 hidden dropdowns, webhook status + delivery rules, "Not published on Zapier", no Connected/Verified state |
| Naming note (by design, not a bug) | The page's OAuth endpoints are `/api/muse/oauth/*` and audit events keep `MUSE_OAUTH_*` names — one OAuth server is deliberately shared by all four platforms (Muse, ChatGPT, Claude, Zapier); renaming its paths would break the three live connectors for no functional gain |
| `zapier validate` (own run, this session) | **PASS** — re-run by the reviewer: "This project is structurally sound!", 27 checks passed, 0 failed, 1 general warning D027 (core 18.6.0 → 19.3.0, intentionally not upgraded) |
| Screenshots | **PENDING** — the live browser viewed the page but cannot save PNG files into the repo, and no Chromium/Playwright exists in this VM. None fabricated. The 14 shots listed in `audit-screenshots/zapier-integration/README.md` still need capturing from a machine with a browser |
| Live OAuth grant flow inside Zapier + one live run per trigger/action/search + REST-hook delivery to a real `hooks.zapier.com` URL | **PENDING** — needs migrations 025–027 applied + `TOKEN_ENCRYPTION_KEY` set in Vercel + a live Supabase project + the owner's Zapier developer account (`zapier register`/`push`, DCR-registered client id/secret, a non-expiring test account for `integration-testing@zapier.com`) |

## Vercel readiness

- Env vars: `ZAPIER_ENABLED` (optional, default on),
  `ZAPIER_APP_BASE_URL` (optional), `TOKEN_ENCRYPTION_KEY`
  (required, shared) — all already in `.env.example`.
- Migrations 025–027 to apply in the Supabase SQL Editor (after 023–024).
- Health check: `GET /api/integrations/zapier/health` →
  `{mode, zapierEnabled, version}`.
- Cron already registered (`0 6 * * *` → `/api/jobs/run`); no new
  cron entry needed. `CRON_SECRET` gates the worker.
- Deploy checklist: `docs/zapier-integration/VERCEL_DEPLOYMENT.md`.

## Credentials still required (exact owner steps)

1. **Zapier developer account** — create the app in the Zapier
   developer dashboard.
2. **One-time DCR call** — copy the app's exact OAuth Redirect URL
   (`https://zapier.com/dashboard/auth/oauth/return/App<digits>CLIAPI/`),
   run the curl in `docs/zapier-integration/ZAPIER_SERVER.md`
   (`POST /api/muse/oauth/register`); store the returned
   `client_id` / `client_secret` (shown once) in the Zapier dashboard.
3. **App env vars in Zapier** (never in this repo): `CLIENT_ID` /
   `CLIENT_SECRET` (from step 2), `ZAPIER_APP_BASE_URL`
   (`https://nxtsend.com`).
4. **`zapier-platform register "NxtSend"`** (writes `.zapierapprc`
   — never commit it), then `push`. Never run `register` / `push` /
   `promote` without the Zapier developer account.
5. **Publication (optional, separate):** Zapier review (~1 week) →
   90-day Beta → Public; requires a non-expiring test account for
   integration-testing@zapier.com and live Zaps with successful runs
   per trigger/action/search.

Full owner steps: `docs/zapier-integration/ZAPIER_SETUP.md`.

## Publishing status

**NOT published. NOT submitted. NOT claimed.** The surface is
implemented and testable in Zapier's developer platform; it does not
appear in Zapier's app directory. See
`docs/zapier-integration/PUBLISHING.md`.

## Remaining blockers / PENDING (not tested, not claimed)

| # | Item | Status |
|---|---|---|
| 1 | OAuth grant flow inside Zapier (consent → code → token → refresh) against the deployed app | PENDING |
| 2 | One live run per trigger/action/search | PENDING |
| 3 | REST-hook delivery to a real `hooks.zapier.com` URL | PENDING |
| 4 | Migrations 025–027 applied to live Supabase | PENDING |
| 5 | `zapier_webhook_retry` cron tick (daily 06:00) retrying a failed delivery | PENDING |
| 6 | Screenshots (14 listed in `audit-screenshots/zapier-integration/README.md`) | PENDING |
| 7 | Session-authenticated subscriptions/deliveries endpoint for the Settings detail page (`GET /api/integrations/zapier/subscriptions`) | FIXED (coordinator pass) |
| 8 | Zapier-aware activity source for the detail page (`GET /api/muse/activity?platform=zapier` returns `zapier.*` rows) | FIXED (coordinator pass) |
| 9 | MCP-tool mutations + scheduled-reply sends do not emit webhooks yet | NOT SUPPORTED (yet) |
| 10 | `GET /v1/usage` response shape not mapped to an output | NOT SUPPORTED |
| 11 | LinkedIn send/accept (any form) | NOT SUPPORTED |
| 12 | Drafts endpoint (`POST /v1/conversations/:id/drafts`); templates dropdown | NOT SUPPORTED |
| 13 | Publication on Zapier (review → Beta → Public) | NOT CLAIMED |
| 14 | `zapier-platform-core` 19.3.0 upgrade (D027 warning) | BLOCKED on an owner decision (major version) |

## Status legend

- **PASS** — verified by a run in this environment (tests/build/validate).
- **FIXED** — a defect found during this work and corrected (the two
  build failures above; the stale `webhooks` registry wording; the
  route-count correction 30 → 29).
- **PENDING** — implemented but not verified live; needs the owner
  steps / live deployment.
- **NOT SUPPORTED** — deliberately not built (no data source or no
  authorized provider exists); omitted, not faked.
- **NOT CLAIMED** — publication/approval; nothing submitted.
- **BLOCKED** — needs an owner decision (core major upgrade).
