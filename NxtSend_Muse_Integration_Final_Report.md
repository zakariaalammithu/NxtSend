# NxtSend × Muse (Meta) Connector — Final Integration Report

**Date:** 2026-11-16
**Scope of this report:** Worker C — Integration UI + admin + docs +
final report for the NxtSend Meta Muse AI connector.
**Repo:** `~/workspace/nxtsend` (branch state as found; **nothing was
committed or pushed** by this worker).

> **Verification note.** `platform.muse.ai/docs` itself was **not
> fetchable from this environment** — requirements were verified from
> Meta Help Center-derived implementation guides and from the code,
> and **must be re-checked live before submission**. Nothing has been
> submitted to Meta and **no approval is claimed** anywhere in this
> report.

## Verdict

| Area | Status |
| --- | --- |
| OAuth 2.1 server (Worker A) | **PASS** — implemented, unit-tested (pre-existing) |
| MCP server + 18 tools (Worker B) | **PASS** — implemented, unit-tested (pre-existing) |
| Grants API (Worker C) | **PASS** — new, tested (see below) |
| Integration Settings UI (Worker C) | **PASS** — built, build passes; live rendering **PENDING** live deploy |
| Admin panels + System Health check (Worker C) | **PASS** — built, build passes; live data **PENDING** live deploy |
| Docs — `docs/muse-integration/` (10 files) | **PASS** — written from the actual implementation |
| Full test suite | **PASS** — 1285 passing, 0 failing |
| Production build | **PASS** — `next build` succeeds, all Muse routes present |
| Live end-to-end grant flow (real Muse client, deployed site) | **PENDING** — not run from this environment |
| Migration 023 applied to a live Supabase project | **PENDING** — owner step, not run here |
| Meta submission / approval | **NOT DONE / NOT CLAIMED** |
| LinkedIn-send tools | **NOT SUPPORTED** — by design (see below) |
| Screenshots | **PENDING** — must be captured live after deploy; none fabricated |

No item in this report is marked PASS on the basis of an untested
claim. Anything needing a live deployment is marked PENDING.

## Live verification (2026-11-16, after Vercel deployed 1806e2a)

Verified on https://nxtsend.com by a read-only live browser check
(~16:21–16:26 UTC) plus direct `curl` checks from the build machine:

| Check | Result |
| --- | --- |
| Vercel deploy of 1806e2a | **PASS** — new routes 404'd at 16:21 UTC, live by ~16:24 UTC |
| `GET /api/mcp/health` | **PASS** — `{"mode":"demo","mcpEnabled":true,"toolCount":18,"oauthConfigured":false,"protocolVersion":"2025-06-18","version":"1.0.0"}` |
| `GET /.well-known/oauth-protected-resource/api/mcp` | **PASS** — resource `https://nxtsend.com/api/mcp`, authorization server `https://nxtsend.com`, scopes `muse.read/muse.write/muse.send`, bearer via header |
| `POST /api/mcp` without token / with bogus token | **PENDING (live mode)** — the live site is in Demo Mode, so the route answers **503 `not_configured`** ("Muse MCP is not available in Demo Mode…") before reaching auth. The 401 + `WWW-Authenticate` path exists in code and is covered by unit tests (`src/app/api/mcp/__tests__/route.test.ts`, `src/lib/muse-connector/__tests__/mcp.test.ts`), but it can only be observed live once Supabase + migration 023 + `TOKEN_ENCRYPTION_KEY` are configured |
| Integration page `/dashboard/integrations/muse-ai` (demo) | **PASS** — renders fully: status badge "Demo Mode", orange "not connected" banner, MCP endpoint + all 5 OAuth endpoints with Copy buttons, 3 scopes in plain words (`muse.read` = recommended default), 4-step Connect to Muse (directory listing stated as a separate submission), grants + activity panels honestly "unavailable in Demo Mode", all 18 tools in the manifest (8 Read / 7 Write / 3 Sensitive write). No "Connected"/"Verified" state anywhere. Env vars `MUSE_MCP_ENABLED`, `MUSE_MCP_PUBLIC_URL`, `TOKEN_ENCRYPTION_KEY` all show "Not set" |
| Screenshots | **PENDING** — the live browser visually inspected the pages but cannot write PNG files into the repo, and no Chromium/Playwright exists in this VM to capture them. None fabricated. The 10 shots listed in `audit-screenshots/muse-integration/README.md` still need capturing from a machine with a browser |
| Live OAuth grant flow (real Muse client) | **PENDING** — needs migration 023 applied + `TOKEN_ENCRYPTION_KEY` set + a live Supabase project, none of which exist yet |

## What was built by Worker C

### 1. Grants API — PASS

- **New:** `src/app/api/muse/grants/route.ts` — `GET` lists the
  signed-in user's Muse OAuth grants (client name, scopes, created,
  refresh-token expiry; `lastUsedAt: null` — migration 023 stores no
  last-used time, so none is invented); `DELETE` (and `POST` alias)
  revokes one grant by `client_id` (query param or JSON body) via the
  store's `revokeGrant`, audited as `MUSE_OAUTH_GRANT_REVOKED`.
  Requires a live Supabase session (401 without one); Demo Mode
  refuses (503). **Never returns token values or hashes** — the data
  source selects no `token_hash` column.
- **New:** `src/lib/muse-connector/grants.ts` — pure grant grouping
  (`summarizeMuseGrants`), Supabase source, `listMuseGrants`,
  `revokeMuseGrant` (unknown grant → `grant_not_found`, 404), and
  `countActiveMuseGrants` (distinct client+user pairs with a live
  refresh token; null = tables unreadable, never silently zero).
- **New:** `src/app/api/muse/activity/route.ts` — `GET` returns the
  workspace's Muse audit entries (`muse.tool.*` + `MUSE_OAUTH_*`,
  newest 50). Session required; Demo Mode refuses.
- **Tests (new, 12):** `src/lib/muse-connector/__tests__/grants.test.ts`
  (8: grouping, scope union, active/inactive rules, no invented
  last-used, revocation through the memory store, unknown grant),
  `src/app/api/muse/grants/__tests__/route.test.ts` (3: GET/DELETE/
  POST refuse in Demo Mode), `src/app/api/muse/activity/__tests__/route.test.ts`
  (1: Demo Mode refusal). All pass with fake sources/stores — no DB,
  no network.

### 2. Integration Settings UI — PASS (build) / PENDING (live render)

`src/app/(dashboard)/dashboard/integrations/[id]/page.tsx` — the
existing readiness pack is **kept intact**; added for `muse-ai`
only (`MuseLivePanels`):

- **Live connection status** — the header badge now derives from the
  real state (see §3): `Connected and Verified` only when a real
  active grant exists; `Connected but Not Verified` when the surface
  is configured but no grant exists; never "Connected" from
  configuration alone.
- **Endpoints** — MCP endpoint URL (copyable, from this deployment's
  origin) plus authorize / token / revoke / register (DCR) and the
  RFC 9728 well-known metadata URL.
- **Scopes in plain words** — all three, with `muse.read` marked as
  the recommended default; the read-only option is documented.
- **Connect to Muse steps** — Custom Connector path (works now) +
  submission path at `muse.ai/platform`, stated plainly as **not
  done / not approved**.
- **Your Muse grants** — from the grants API (client name, scopes,
  created, refresh expiry, "Last used: not tracked"), with a Revoke
  button per grant.
- **Activity history** — Muse audit entries for the workspace
  (newest 50).
- **Available tools list** — kept from the manifest, not duplicated.
- **Security & privacy notes** — hashing, rotation/reuse, RLS,
  scope enforcement, approval-every-time, no LinkedIn send.
- **Disconnect section fixed** — muse-ai no longer says "nothing is
  connected"; it now explains per-grant revocation.
- Follows the page's design system (glass-card, `Section`, `Badge`,
  text-13/14).

### 3. Status derivation — PASS

- `src/lib/integrations-center/status.ts` — `muse-ai` no longer
  returns the research-only "Unsupported / No Documented API" label.
  It now derives from the real config state: Demo → `Demo Mode`; a
  real active grant (new `museGrantsActive` option) → `Connected and
  Verified`; enabled + public URL, no grant → `Connected but Not
  Verified`; otherwise `Not Connected` / `Configuration Required`.
  `configured` stays false without a grant, so a stale verification
  record can never upgrade config to Verified.
- `src/lib/integrations-center/registry.ts` — muse-ai `kind` flipped
  `unsupported` → `adapter`; env vars now list the real ones
  (`MUSE_MCP_ENABLED`, `MUSE_MCP_PUBLIC_URL`, `TOKEN_ENCRYPTION_KEY`);
  description / capabilities / setup steps / troubleshooting rewritten
  to describe the implemented surface; the note now says plainly the
  surface is implemented but **not submitted**.
- `src/lib/integrations-center/verify.ts` — Test Connection for
  muse-ai now reports the real config state and explains there is no
  safe read-only verification call (proving it works needs a real
  grant); no outbound call is made.
- `src/app/api/integrations/status/route.ts` — wires the workspace's
  active-grant count into the status derivation (null-safe when
  migration 023 is not applied).
- **Tests updated + added:** `center.test.ts` — demo expectation
  updated, verify expectation updated, and a new case covering all
  five muse-ai status branches (including "unknown grant count never
  invents a grant").

### 4. Admin — PASS (build) / PENDING (live data)

- **New:** `GET /api/admin/muse` (`src/app/api/admin/muse/route.ts`),
  behind `resolveAdminGate()`: platform-wide active grant count
  (null = unknown), MCP tool-call counts from `audit_logs`
  (`muse.tool.*`), recent Muse errors (text match over audit details
  + OAuth denies — labelled as such, since audit rows carry no
  structured error flag), 10 most recent Muse events. Demo Mode
  returns labelled zeros. No credentials or token material anywhere
  in the output.
- **Extended:** `src/app/(admin)/admin/integrations/muse-ai/page.tsx`
  — live overview (MCP enabled / public URL / active grants /
  tool-call total), tool-call counts, recent Muse errors, recent Muse
  events, plus the corrected "what the owner must obtain" copy.
- **Extended:** `getSystemHealth()` (`src/lib/admin/platform-server.ts`)
  — new optional `muse-mcp` check: Demo → warning; disabled / no
  public URL → warning; tables unreadable → warning (migration 023
  may not be applied); configured → ok with the active grant count
  (zero grants is normal, not a failure). The System Health page
  renders checks generically, so no page change was needed.

### 5. Docs — PASS (10 files, exactly)

`docs/muse-integration/`: `README.md`, `ARCHITECTURE.md`,
`OAUTH_SETUP.md`, `MCP_TOOLS.md`, `TOOL_PERMISSIONS.md`,
`SECURITY.md`, `VERCEL_DEPLOYMENT.md`, `TESTING.md`,
`MUSE_SUBMISSION.md`, `TROUBLESHOOTING.md`. Every doc states the
`platform.muse.ai/docs` non-fetchability caveat, that submission /
approval is **not** claimed, that LinkedIn-send is **not supported**
with the exact reason, the Vercel Hobby 10s stateless design, and
that in-memory rate limiting does not share across instances. All
docs reflect the actual implementation (real endpoints, real env
vars, real scopes, real 18-tool list + classifications, real test
results).

### 6. Screenshots — PENDING (by design)

`audit-screenshots/muse-integration/README.md` only. It explains
screenshots are captured live from the deployed site after Vercel
deploys (the live browser cannot reach a local server) and lists
exactly the 10 screenshots to capture. **No screenshot was
fabricated.**

## Files created / modified (Worker C only)

**Created (11):**

- `src/lib/muse-connector/grants.ts`
- `src/lib/muse-connector/__tests__/grants.test.ts`
- `src/app/api/muse/grants/route.ts`
- `src/app/api/muse/grants/__tests__/route.test.ts`
- `src/app/api/muse/activity/route.ts`
- `src/app/api/muse/activity/__tests__/route.test.ts`
- `src/app/api/admin/muse/route.ts`
- `docs/muse-integration/` (10 files — counted as one deliverable above)
- `audit-screenshots/muse-integration/README.md`
- `NxtSend_Muse_Integration_Final_Report.md` (this file)

**Modified (9):**

- `src/app/(dashboard)/dashboard/integrations/[id]/page.tsx` (live panels, disconnect fix, readiness-pack footer update)
- `src/app/(admin)/admin/integrations/muse-ai/page.tsx` (live panels)
- `src/app/api/integrations/status/route.ts` (grant-count wiring)
- `src/lib/admin/platform-server.ts` (`muse-mcp` health check)
- `src/lib/integrations-center/registry.ts` (muse-ai entry)
- `src/lib/integrations-center/status.ts` (muse-ai derivation)
- `src/lib/integrations-center/verify.ts` (muse-ai verify outcome)
- `src/lib/integrations-center/__tests__/center.test.ts` (updated + 1 new case)

**Not touched (per brief):** `src/lib/muse-connector/oauth/**`,
`src/app/api/muse/oauth/**`, `src/app/api/mcp/**`,
`src/lib/muse-connector/{adapter,mcp,schemas,audit}.ts`,
`supabase/migrations/023_muse_oauth.sql`, `.env.example`,
`src/lib/data/**`, `src/lib/inbox/**`, `src/lib/executor/**`.
No commit, no push.

## Endpoints (complete surface)

| Endpoint | Method | Auth |
| --- | --- | --- |
| `/api/mcp` | POST | Muse Bearer access token (401 + WWW-Authenticate) |
| `/api/mcp/health` | GET | Public |
| `/api/muse/oauth/authorize` | GET/POST | Signed-in user (consent screen) |
| `/api/muse/oauth/token` | POST | Client (DCR-registered) + PKCE |
| `/api/muse/oauth/revoke` | POST | Token (RFC 7009) |
| `/api/muse/oauth/register` | POST | Rate-limited DCR |
| `/.well-known/oauth-protected-resource/api/mcp` | GET | Public (RFC 9728) |
| `/api/muse/grants` | GET/DELETE/POST | Signed-in user (401 without session) |
| `/api/muse/activity` | GET | Signed-in user |
| `/api/admin/muse` | GET | Platform admin gate |
| `/api/integrations/status` | GET | Signed-in user (drives the muse-ai badge) |

## The 18 tools + classifications

- **Read (8):** `list_leads`, `get_lead`, `list_campaigns`,
  `get_campaign_activity`, `list_conversations`, `get_conversation`,
  `get_usage_summary`, `get_integration_statuses`.
- **Write (7):** `create_lead`, `update_lead`, `create_campaign`,
  `pause_campaign`, `resume_campaign`, `archive_campaign`,
  `draft_outreach_message`.
- **Sensitive write (3):** `send_email`, `send_inbox_reply`
  (email-only), `delete_lead`.

No LinkedIn-send tool exists. Full details: `docs/muse-integration/MCP_TOOLS.md`.

## Database changes

**Migration 023** (`supabase/migrations/023_muse_oauth.sql`,
pre-existing, Worker A — not modified here): creates
`muse_oauth_clients`, `muse_oauth_codes`, `muse_oauth_tokens`.
RLS enabled with **zero policies** (service-role only). Tokens/codes
stored as SHA-256 hashes only. No Worker C schema change was needed
or made. **Applying migration 023 to the live project is still
pending (owner step).**

## Security notes

- No secrets in code, logs, docs, or tool responses. No token/code/
  secret/hash is ever selected by the grants source, logged, or
  returned to the browser.
- "Connected" is only ever shown when a real active OAuth grant
  exists; configuration alone yields at most "Connected but Not
  Verified".
- Refresh rotation + reuse detection (reuse revokes the whole
  grant); PKCE S256 only; redirect-URI allowlist; DCR rate-limited;
  Demo Mode fails closed across the whole surface.
- Admin surfaces sit behind `resolveAdminGate()`; the grants/activity
  routes require a live session (401) and refuse Demo Mode (503).
- Known limits, stated in the docs: in-memory rate limit is
  per-instance; "last used" is not tracked; consent screen shows
  UUIDs; Vercel Hobby 10s cuts long streams (stateless design).

## Test + build results (own runs, 2026-11-16)

- `npm test`: **1285 passing, 0 failing** (113 test files).
  Baseline at handoff: 1272 passing. Worker C added 13 tests
  (12 new + 1 new status case) and updated 2 pre-existing
  expectations to the new intended status behaviour.
- `npm run build`: **passes** (Next.js 14.2.35). One failure on the
  first attempt — TypeScript `for...of`-over-`Map` target error in
  `grants.ts` — fixed with `forEach` and re-run green. All Muse
  routes appear in the build output.
- No live deployment, live Supabase, or real Muse client was
  exercised from this environment; those checks are PENDING below.

## Vercel readiness

Ready to deploy as code: build passes, no new build config, routes
are standard App Router routes. Deployment still needs: migration
023 applied, `TOKEN_ENCRYPTION_KEY` set, `MUSE_MCP_PUBLIC_URL` set
if the surface lives elsewhere than `NEXT_PUBLIC_APP_URL`. Then run
the live checks in `docs/muse-integration/TESTING.md` (§ "Manual /
live checks").

## Environment variables (real)

| Variable | Required | Notes |
| --- | --- | --- |
| `TOKEN_ENCRYPTION_KEY` | Yes | Reused (Gmail/Outlook); authorize returns 503 without it. |
| `MUSE_MCP_ENABLED` | No | `"false"` disables MCP only; does NOT gate OAuth routes. |
| `MUSE_MCP_PUBLIC_URL` | No | Public origin when it differs from `NEXT_PUBLIC_APP_URL`. |

No `MUSE_OAUTH_CLIENT_SECRET` exists or is needed (DCR, public
clients by default).

## Credentials still required

- `TOKEN_ENCRYPTION_KEY` must be set in Vercel (generate:
  `openssl rand -base64 32`) — without it the authorize endpoint
  returns 503.
- Supabase service-role key (pre-existing requirement) for the
  grants/admin reads.
- No Meta-issued credential is needed: Muse clients register via DCR.
- No LinkedIn provider credential exists or is requested — LinkedIn
  send is not supported.

## LinkedIn limitations

**NOT SUPPORTED.** There is no LinkedIn-send tool in the manifest,
no LinkedIn send path in the MCP server, and nothing in this work
claims one. Exact reason: **no authorized LinkedIn provider exists**
for NxtSend, and the official LinkedIn API exposes **no
connection-request/DM endpoints to standard developers**. LinkedIn
campaign steps are recorded SKIPPED and LinkedIn replies are refused
(HTTP 422) until an authorized provider is procured and its adapter
implemented behind `src/lib/linkedin`.

## Submission readiness

**Not submitted, not approved, not ready to claim.** The technical
surface is implemented and testable today as a Custom Connector
(no directory approval needed for that path). Directory listing
still needs the owner to: re-check `platform.muse.ai/docs` live,
prepare submission assets (512×512 icon, privacy policy, terms,
support contacts, example prompts), create the dedicated test
account, complete business verification + the data-processing
questionnaire, and submit at `muse.ai/platform`. See
`docs/muse-integration/MUSE_SUBMISSION.md`.

## Remaining blockers / pending items

1. **Apply migration 023** to the live Supabase project (owner).
2. **Set `TOKEN_ENCRYPTION_KEY`** in Vercel (owner).
3. **Deploy to Vercel** and run the live checks in
   `docs/muse-integration/TESTING.md` (grant flow with a real Muse
   Custom Connector, scope enforcement, refresh reuse, revoke,
   admin/health panels).
4. **Capture the 10 screenshots** listed in
   `audit-screenshots/muse-integration/README.md` from the deployed
   site.
5. **Re-check `platform.muse.ai/docs` live** before any submission.
6. **Submission itself** (owner decision + steps above) — not done.
7. Consent screen shows account/workspace as UUIDs (cosmetic;
   pre-existing).

## Deliberately left out (with reasons)

- **No live Supabase / live Muse testing** — no live project or Muse
  session was available from this environment; claiming it would be
  fabrication. Marked PENDING.
- **No screenshots** — the live browser cannot reach a local server;
  fabricated screenshots would be dishonest. README lists exactly
  what to capture after deploy.
- **No LinkedIn-send tool** — no authorized provider; adding one
  would be a false claim.
- **No `MUSE_OAUTH_CLIENT_SECRET`** — DCR public clients by design.
- **No shared (cross-instance) rate limiting** — out of scope; the
  in-memory limit and its limitation are documented instead.
- **No "last used" timestamp** — migration 023 stores none; the UI
  says "not tracked" rather than inventing one.
- **No change to the System Health page component** — it renders
  checks generically; adding the `muse-mcp` check to
  `getSystemHealth()` was sufficient.
- **No commit / push** — per the brief.
