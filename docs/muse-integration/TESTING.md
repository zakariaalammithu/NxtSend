# Testing

> **Verification note.** `platform.muse.ai/docs` itself was **not
> fetchable from this environment** — requirements were verified from
> Meta Help Center-derived implementation guides and from the code in
> this repo, and **must be re-checked live before submission**.
> Submission/approval is **NOT claimed**.

## Real results (this repo, 2026-11-16)

- `npm test` (Vitest): **1285 passing, 0 failing, 113 test files.**
  Baseline before Worker C was 1272 passing; the +13 are Worker C's
  tests (12 new + 1 added muse-ai status case — see below).
- `npm run build` (Next.js 14.2.35): **passes**. All Muse routes are
  present in the build output: `/api/mcp`, `/api/mcp/health`,
  `/api/muse/grants`, `/api/muse/activity`,
  `/api/muse/oauth/{authorize,token,revoke,register}`,
  `/.well-known/oauth-protected-resource/api/mcp`, `/api/admin/muse`,
  `/admin/integrations/muse-ai`.
- **No live Supabase deployment was exercised from this environment.**
  Everything below that needs a live project is marked as such and is
  **not** claimed as passing.

## What the unit tests cover (Worker C additions)

| Test file | Tests | Covers |
| --- | --- | --- |
| `src/lib/muse-connector/__tests__/grants.test.ts` | 8 | Grant grouping by client, scope union, active = live refresh token, expired/revoked → inactive (still listed), unknown client falls back to `client_id`, `lastUsedAt` always null, revocation through the store, unknown grant → `grant_not_found`. |
| `src/app/api/muse/grants/__tests__/route.test.ts` | 3 | GET / DELETE / POST refuse in Demo Mode (503) before any store is touched. |
| `src/app/api/muse/activity/__tests__/route.test.ts` | 1 | GET refuses in Demo Mode (503). |
| `src/lib/integrations-center/__tests__/center.test.ts` | +1 case (39 total in file) | muse-ai status derivation: no URL → `Configuration Required`; disabled → `Not Connected`; enabled + URL, no grant → `Connected but Not Verified`; active grant → `Connected and Verified`; unknown grant count → never invents a grant. Also updated the demo + verify expectations from the old "Unsupported" label. |

Pre-existing coverage (Workers A + B, still passing): PKCE S256-only,
authorize validation, single-use expiring codes, refresh rotation
with reuse-revokes-grant, RFC 7009 revoke (unknown token still 200),
DCR validation + rate limit, fail-closed demo rule, MCP
`tools/list`/`tools/call` scope enforcement + rate limit, 401 +
`WWW-Authenticate`, demo → 503.

## How to run

```bash
npm test          # full suite (Vitest)
npm run build     # production build (type-check + lint included)
npx vitest run src/lib/muse-connector/__tests__/grants.test.ts
npx vitest run src/app/api/muse/grants/__tests__/route.test.ts
```

## Manual / live checks (NOT yet done — do these after deploy)

These need a deployed instance with migration 023 applied; none of
them has been run against a live project from this environment:

1. `GET /api/mcp/health` → `toolCount: 18`, `oauthConfigured: true`.
2. `GET /.well-known/oauth-protected-resource/api/mcp` → RFC 9728 metadata.
3. DCR register a test client → authorize in a browser → approve
   with `muse.read` only → exchange the code → call `tools/list`
   with the access token → 18 tools.
4. Call a Read tool (`get_usage_summary`) → 200; call a Write tool
   with the read-only token → refused (scope enforcement).
5. Refresh the token → old refresh token presented again → whole
   grant revoked (reuse detection).
6. Revoke the grant from Dashboard → Integration Center → Muse.ai →
   Your Muse grants → the token stops working (401) and the grant
   shows Inactive.
7. Admin → System → System Health → `muse-mcp` check shows the grant
   count; Admin → Integrations → Muse.ai shows the tool-call counts.
8. Confirm Demo Mode still refuses (deploy a demo-mode instance or
   unset Supabase): MCP → 503, authorize → error.

## Things deliberately NOT tested live

- Meta's submission portal and review (submission not made).
- Real Muse (Meta) client behaviour against this server — only the
  protocol surface (OAuth 2.1 + MCP JSON-RPC) is tested; an actual
  Muse session against the deployment is a live check for the owner.
- LinkedIn-send flows: there is no LinkedIn-send tool to test —
  **NOT SUPPORTED** (no authorized LinkedIn provider; the official
  LinkedIn API exposes no connection-request/DM endpoints to standard
  developers).

## Flaky-step policy

A flaky step is retried once before being reported. In this work the
full suite passed on the first run (1285/1285); the build failed
once on a TypeScript `for...of`-over-`Map` target error in
`grants.ts`, was fixed with `forEach`, and then passed.
