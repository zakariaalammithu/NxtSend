# Testing Report — NxtSend Integration Ecosystem (Wave 2)

Base commit: `f8dea22` (main). Date: 2026-11-19.
All runs below were performed by the documentation author on the tree
at `f8dea22` (except where a row says "coordinator-verified"), in this
sandbox, with no live credentials and no network calls to any provider.

## 1. Results summary

| Check | Command | Result |
| --- | --- | --- |
| Repo test suite | `npm test` (vitest run) | **2,293 passing, 0 failing** — 224 test files, 224 passed. Duration ~146 s. Exit 0. |
| n8n node package tests | `npx jest` in `integrations/n8n-nodes-nxtsend/` | **126 passing, 0 failing** — 5 test suites. Exit 0. |
| Type check | `npx tsc --noEmit` | **Clean, exit 0.** |
| Production build | `npm run build` | **Exit 0.** (Re-run by the documentation author; also coordinator-verified for Wave 2.) |
| Config parity | `npm run config:check` | Exit 0. 108 variables in the catalogue; 1 set / 0 placeholder / 107 missing in this sandbox (expected — no credentials exist here). Required-for-live missing: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`. |
| Config catalogue parity | grep counts | `.env.example` = 108 non-comment lines; `CONFIG_CATALOG` (`src/lib/config-status.ts`) = 108 entries; `scripts/check-config.mjs` CATALOG = 108 entries. All three agree. |

## 2. What PASS means here — and what it does not

### MOCK TESTED vs PASS

- **PASS** (used in this report and the final report) means: the
  command ran and exited 0. The repo suite, the n8n package suite,
  the type check, and the build are PASS.
- **MOCK TESTED** (used for providers and adapters) means: the
  adapter's unit tests pass against a **stubbed provider HTTP layer**.
  A mock test proves the adapter builds the request the provider's
  docs describe and handles the documented response shapes. It does
  **not** prove the provider accepts the request, that the credential
  works, or that the data lands where it should.
- No provider in this ecosystem has any result better than MOCK
  TESTED. **No provider has been live-verified against real
  credentials.** Any doc that implies otherwise is wrong.

### What the suite covers (and does not)

- Covered: OAuth server flows (authorize/token/revoke/DCR/CIMD,
  refresh rotation, reuse grace), REST auth + rate limiting + the
  provider-disabled flag, webhook outbox (signing, retries, 410),
  the shared REST routes for all six platforms, the MCP adapter's
  tool routing (including the 501 `date_range_not_supported` path),
  the 64 adapters' request building and response parsing, the
  marketplace registry counts (66→69 / 80→83 assertions), the
  developers reference literals (120 / 120 / 3), sync-job counting,
  and the config catalogue parity test.
- Not covered by any test: a live call to any provider; a live grant
  flow against the deployed site; a live webhook delivery to a real
  subscriber URL; the Vercel deploy itself.

## 3. Counts verified by inspection (not by tests)

These were verified by the author with grep/wc/ls on the tree, not by
the test suite:

- Integration Center entries: **83** (`id:` occurrences in
  `src/lib/integrations-center/registry.ts`).
- Provider definitions: **69** = 5 live + 61 Milestone 2 + 3
  Category J (registry composition verified in
  `src/lib/integrations/providers/registry.ts`).
- Per-provider operator guides: **63** files in
  `docs/integrations/providers/`.
- REST route files: Zapier 29, n8n 41, Make/Pabbly/Albato/Activepieces
  35 each; v1 routes: Zapier 26, the other five 33 each.
- Migrations on disk: **33 files** (001–031, 036, 038). **032–035 and
  037 are missing** — see §4.
- Webhook events: **8** (`WEBHOOK_EVENT_TYPES` in
  `src/lib/integrations/rest/events.ts`).

## 4. Failures, gaps, and corrections found while verifying

1. **Migration number gaps.** The brief said "migrations 022–038".
   Files 032, 033, 034, 035, and 037 do not exist. The owner must
   apply 022–031, 036, and 038. This is recorded in the inventory
   (§7) and the deployment doc (§3), not silently smoothed over.
2. **Skipped-lead count wording.** The brief said the skipped count
   is "NOT surfaced in any sync-job result". Inspection of
   `src/lib/integrations/providers/sync.ts` (`finishSyncJob`) shows
   the count **is** persisted as `skipped_count` on the job row and
   returned in the `SyncResult`. The real gap is narrower: no UI page
   or API route lists sync jobs, so an operator cannot see it without
   querying the database. Recorded accurately in the inventory (§2.2)
   and [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md) §6.
3. **Muse tool count.** The provider registry says 18 tools; the
   Stage 0 audit found the adapter serves the full 54-tool manifest
   with no slicing. Recorded as a discrepancy, not resolved by
   editing the registry (documentation-only phase).
4. **`628a825` build incident.** That commit was pushed while
   `npm run build` was failing (a piped grep masked the exit code).
   Fixed in `f8dea22`. The build was re-run directly for this report
   (exit 0, no pipe).
5. **No live verification exists.** The 2026-11-18 live check found
   the deployed site still serving the pre-n8n build; no live grant
   flow, webhook delivery, or provider call has ever succeeded. See
   [DEPLOYMENT.md](./DEPLOYMENT.md).

## 5. What remains to be tested (owner / next phase)

1. Apply migrations 022–031, 036, 038; set `TOKEN_ENCRYPTION_KEY`;
   confirm the Vercel deploy lands (see deployment doc §0).
2. One live grant flow per platform (9 platforms) against real
   credentials; record PASS/FAIL per platform.
3. One live API call per config-ready adapter the owner actually
   uses, with a real credential; record the result per provider.
4. One live webhook delivery to a real subscriber URL; verify the
   HMAC signature and the envelope.
5. Publish/submit each platform artefact and record the outcome
   (Zapier app, n8n node on npm, Make app, Activepieces piece, Meta /
   OpenAI / Anthropic submissions).
6. Add a Test Connection path for the 60+ new adapters (or record a
   decision not to), and a sync-jobs listing surface so the skipped
   count is operator-visible.
