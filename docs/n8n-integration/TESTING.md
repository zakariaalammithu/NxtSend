# Testing — NxtSend × n8n

## What was tested in this work (settings UI + admin + docs)

Repo at commit `2e555a6` plus uncommitted work from all four
parallel workers (the tree was shared and changing while this
work ran — test totals below are therefore snapshots with
timestamps, not a stable baseline; re-run before quoting them
in a release note).

| Check | Result |
|---|---|
| `npx vitest run src/lib/integrations-center/__tests__/center.test.ts src/lib/__tests__/config-status.test.ts` | **67 passed (67)** — includes 5 new n8n tests (status grant-only rule, registry entry, env helpers, verify demo-mode + config guard) |
| Full `npm test` (latest run, 2026-11-18 ~19:00 +06) | **16 failed / 1,647 passed (1,663 total, 143 files)** — all 16 failures in Worker B's files (`n8n-oauth.test.ts` 13, `rest-auth.test.ts` 3); **none in this worker's files**. The failure set changed on every run while the four workers landed code (10 → 24 → 6 → 16); re-run before quoting. |
| `npm run build` (latest run, coordinator pass 2026-11-18 ~19:08 +06) | **PASS** — compiled + type-check clean; the new `v1/accounts/[id]` and `v1/accounts/[id]/status` routes are in the build output. (Earlier the same day it failed on Worker C's `test/helpers.ts:24` jest-global error; Worker C fixed it with `import { jest } from '@jest/globals'`.) |
| Node package `npm run build` / `npm test` | **Build PASSES; tests 126/126, 5 suites** (coordinator pass 2026-11-18). |

New n8n tests mirror the Zapier tests in the same file:

- **Status grant-only rule:** demo → "Demo Mode"; no URL →
  "Configuration Required"; disabled → "Not Connected"; enabled
  + URL, no grant → "Connected but Not Verified"; a Zapier or
  Muse grant does **not** connect n8n; a real n8n grant →
  "Connected and Verified"; unknown grant count never invents a
  grant.
- **Registry entry:** adapter kind, Automation category, N8N env
  vars present, `N8N_API_KEY` / `N8N_OAUTH_CLIENT_SECRET`
  absent, `verifySupported: false`, `docsUrl: null`,
  "Not published on npm / not verified by n8n" in
  `notImplementedNote`, "~24h" + "shown exactly once" in
  troubleshooting.
- **Env helpers:** enabled by default, flag parsing (`false` /
  `0` off), URL precedence `N8N_API_BASE_URL` →
  `NEXT_PUBLIC_APP_URL` → request origin.
- **Verify:** demo mode → "Demo Mode", no fetch called;
  configured-but-no-grant → "Connected but Not Verified", no
  fetch called; disabled → "Not Connected".
- **Registry ↔ `.env.example` consistency:** the existing test
  passes — every env var named in the registry exists in
  `.env.example` (the new N8N vars were added to both).
- **Config catalogue parity:** `src/lib/__tests__/config-status.test.ts`
  passes — the catalogue matches `.env.example` exactly.

## What is still PENDING (not tested here)

| Item | Why pending |
|---|---|
| Server REST API routes (`/api/integrations/n8n/v1/*`, health, api-keys, webhooks) | **LANDED:** all v1 routes + health + api-keys (Worker A) and webhook subscribe/unsubscribe/subscriptions + session subscriptions routes (Worker B). The two `accounts/:id` routes landed in the coordinator reconciliation pass. |
| OAuth extension (n8n scopes, grants-by-origin branch, DCR for n8n) | **LANDED (Worker B):** `n8n.*` scopes with descriptions, grants-by-origin `n8n` branch, 10-min refresh grace for n8n + Zapier, platform-detection order (see [API_AUTHENTICATION.md](API_AUTHENTICATION.md)) |
| Node package build / lint / test (`integrations/n8n-nodes-nxtsend/`) | **PASS (coordinator pass 2026-11-18):** `npm run build` → "Build successful"; `npm test` → **126/126 passed, 5 suites** (was 120/120 before the follow-up-body fix, the `conversation.created` polling-only event, and the new `getConversations` dropdown); `npm run lint` → 0 problems. |
| Live smoke test against a deployed site (health, key create/list/revoke, auth/test, one webhook delivery) | Needs a deployed site + live Supabase + migrations 028/029 applied |
| **Local-n8n load test** | **PENDING — no Docker in this environment.** The node has not been loaded into a real n8n instance anywhere in this work. Do not claim it loads until someone runs it in n8n. |
| One live run per node operation (trigger/action/search) | Needs the published-or-local node + a real n8n instance |
| Cron retry tick (failed delivery → retry → dead) | Needs a live outbox + the daily 06:00 cron |
| OAuth grant flow inside n8n | Needs Worker B's extension + a real n8n instance |

## Smoke test (run after deploy)

1. `GET /api/integrations/n8n/health` → `{mode, n8nEnabled, version}`.
2. Settings → Integrations → n8n → create an API key → copy it
   once → list shows it (prefix only) → revoke it → list shows
   Revoked.
3. `GET /api/integrations/n8n/v1/auth/test` with the key → 200
   with user/workspace/scopes; with a revoked key → 401.
4. OAuth: DCR → connect from n8n → grant appears on the
   settings page → revoke → n8n calls fail.
5. Webhook: activate a webhook-trigger workflow → create a lead
   → workflow executes → subscription + delivery visible on the
   settings page.
6. Admin panel: grants / key counts / subscriptions / deliveries
   all show real numbers, not "unknown".
