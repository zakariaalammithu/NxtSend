# Zapier Integration — Testing

## What was run (this environment, 2026-11-17)

| Suite | Command | Result |
|---|---|---|
| Repo test suite (full) | `npm test` (vitest) | **131 files, 1,550 tests, all passing** (was 1,536 before this work; +9 new: 4 Integration Center status/registry/verify, 2 grants-by-origin, 3 admin health/nav; +5 coordinator pass: 3 activity-filter, 2 session-subscriptions/activity demo-refusal). The Muse/ChatGPT/Claude suites keep passing. |
| CLI package tests | `cd integrations/zapier && npx jest` | **5 suites, 60 tests, all passing** (auth, creates, definitions, errors, triggers — jest + appTester + Nock mocks; no live calls). |
| CLI validation | `npx zapier-platform validate` | **Exit 0 — 27 checks passed, 0 failed**, 0 publishing warnings, 1 general warning: D027 (consider upgrading from `zapier-platform-core` 18.6.0 to 19.3.0 — intentionally not upgraded; see below). |
| Production build | `npm run build` | **Passes** (Next.js 14.2.35). 30 Zapier route files in the build output: 29 under `api/integrations/zapier/` + 1 well-known metadata route. (The count was 29 before the coordinator pass added the session-authenticated subscriptions route.) The only lint findings are 2 pre-existing `react-hooks/exhaustive-deps` warnings in the detail page's MCP panels (not Zapier code). |

## New tests added by this work

- `src/lib/integrations-center/__tests__/center.test.ts` — Zapier
  status derivation (demo / no-URL / disabled / configured-no-grant
  / Muse-or-ChatGPT-grant-does-not-connect / real-grant-connects /
  unknown-count), registry entry (adapter kind, Automation category,
  env vars incl. no `ZAPIER_OAUTH_CLIENT_SECRET`, "Not published on
  Zapier" note, `~24h` latency in troubleshooting), verify in demo
  mode (503, nothing attempted) and live mode (configuration alone
  never verifies).
- `src/lib/muse-connector/__tests__/grants.test.ts` — Zapier
  redirect-URI classification (pattern, trailing-slash-tolerant,
  non-Zapier zapier.com path → Other), Zapier split by origin incl.
  the `zapier.*` scope fallback; existing expectations updated for
  the new `zapier: 0` field.
- `src/lib/admin/__tests__/zapier-health.test.ts` — `getSystemHealth`
  in demo mode contains a `zapier` check (warning, never claims a
  connection) alongside the muse/chatgpt/claude checks; admin nav
  lists the Zapier page.

## Server-side tests (server agent, re-verified by the full run)

Unit tests under `src/lib/integrations/zapier/__tests__/` cover the
API, outbox, emit, auth and audit modules; OAuth-extension tests
cover the Zapier scopes, redirect pattern, PKCE-optional and
refresh-grace paths. All pass in the full run above.

## How to re-run

```bash
npm test                                   # full repo suite (vitest)
npm run build                              # production build (typecheck + lint)
cd integrations/zapier
npx jest                                   # CLI package tests
npx zapier-platform validate               # CLI validation (exit 0)
npx zapier-platform build --skip-dep-install  # pushable zip (plain `build` hits EMFILE at ulimit 4096 in this sandbox)
```

## The D027 warning (intentional, not an error)

`zapier-platform validate` reports one general warning (D027):
consider upgrading from `zapier-platform-core` 18.6.0 to latest
19.3.0. It is a warning, not a failure, and does not block pushing.
The core is intentionally kept at 18.6.0 (latest 18.x per `npm view
zapier-platform-core version` at authoring time); upgrading to a new
major (19.x) is a separate owner decision, not a patch to slip in
unreviewed.

## What is still PENDING live (not tested, not claimed)

- OAuth grant flow inside Zapier (consent screen → code → token →
  refresh) against the deployed app.
- One live run per trigger/action/search.
- REST-hook delivery to a real `hooks.zapier.com` URL.
- Migrations 025–027 applied to live Supabase.
- The `zapier_webhook_retry` cron tick (daily 06:00) retrying a
  failed delivery.
- Screenshots (see `audit-screenshots/zapier-integration/README.md`).
- The `GET /v1/usage` response shape was not mapped to an output
  (no trigger/action uses it).

Do not mark any of these PASS until they have run against the live
deployment.
