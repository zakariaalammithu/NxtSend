# NxtSend — Full Website Audit, Bug Fix & LinkedIn Automation Report

**Repository:** https://github.com/zakariaalammithu/NxtSend
**Branch audited and delivered to:** `main`
**Base commit at audit start:** `b074299` — “fix: Node engines 20.x -> 24.x (Vercel discontinued Node 20; builds failed in 2s)”, 2026-10-23
**Audit date:** 2026-11-02
**Stack:** Next.js 14.2.35, React 18, Supabase, Stripe, Resend, Tailwind CSS
**Method:** code audit of the full checkout, production build, full test suite,
config check, and HTTP checks against the locally running production build.
Live behaviour that needs real credentials was **not** faked and is marked
BLOCKED below. No API key, credential, or secret value is included in this
report or in any commit made for it.

## 1. Executive Summary

NxtSend is a real, substantially built SaaS codebase — not a mockup. The
public site, auth flows, contact/demo submission storage, email-campaign
shell, CRM, inbox, billing scaffolding, support widget, and admin platform
are wired to real code paths with honest refusal paths where a provider is
missing. The single largest product gap is **LinkedIn automation itself**:
there is no LinkedIn OAuth flow, no LinkedIn callback route, and no vendor
adapter in the code. LinkedIn steps are deliberately recorded as `skipped`,
never sent and never simulated as sent. Claiming LinkedIn automation works
today would be false.

What this delivery does:

- Fixes the verified fake-success and validation bugs found in the audit.
- Replaces the dashboard analytics page's hard-coded mock numbers with
  aggregates computed from recorded enrollments, messages, and executions.
- Hardens the admin bootstrap endpoint and the audit-log read policy.
- Adds basic security headers and stops a bare `.env` file from being
  committable.
- Proves the app builds and passes its full test suite without production
  credentials, and documents exactly which Vercel environment variables the
  owner must still add.

What it does **not** do, and does not claim:

- It does not connect LinkedIn, send a LinkedIn message, or collect LinkedIn
  leads. That requires a LinkedIn-approved outreach provider and a new
  adapter behind `src/lib/linkedin` (see §7 and §11).
- It does not test live Supabase, Stripe, Resend, Gmail/Microsoft OAuth, or
  cron execution, because no live credentials were available in this
  environment. Those are BLOCKED, not PASS.
- It does not create new About / Features / Blog pages. Those routes do not
  exist, and no header or footer link points to them, so nothing is broken —
  but if the owner wants them, they are new pages, not fixes.

**Overall status: FIXED where code could prove it, BLOCKED where a live
provider or credential is required. This is not a 100% completion claim.**

## 2. Total pages and routes audited

| Area | Count | How counted |
|---|---|---|
| Page components (`page.tsx`) | 75 | Marketing 13, dashboard 18, admin 40, auth 4 |
| API route files (`route.ts`) | 91 | Under `src/app/api/` |
| Source files total | 556 | Under `src/` |
| Supabase migrations | 21 | `supabase/migrations/001`–`021` (021 is new in this delivery) |
| Test files | 97 | Vitest files under `src/` |

Page routes audited include every marketing page (`/`, `/pricing`,
`/contact`, `/demo`, `/support`, `/integrations`, `/academy`, `/agency`,
`/avatars`, `/developers`, `/privacy`, `/terms`, `/cookies`), auth pages
(`/login`, `/signup`, `/forgot-password`, `/reset-password`,
`/auth/callback`), dashboard pages (`/dashboard`, `/dashboard/accounts`,
`/dashboard/analytics`, `/dashboard/billing`, `/dashboard/campaigns`,
`/dashboard/campaigns/new`, `/dashboard/campaigns/[id]`,
`/dashboard/email`, `/dashboard/email/suppression`, `/dashboard/inbox`,
`/dashboard/integrations`, `/dashboard/integrations/[id]`,
`/dashboard/leads`, `/dashboard/linkedin`, `/dashboard/referral`,
`/dashboard/settings`, `/dashboard/usage`,
`/dashboard/ai-personalization`), and all 40 admin pages listed in §9.

There is **no** standalone `/about`, `/features`, `/blog`, or `/faq` route.
FAQ exists only as sections inside `/` and `/support`. This is not a broken
link: neither the header nor the footer links to those routes.

## 3. Total buttons and interactive elements checked

Tag occurrences in code (a lower bound for interactive elements; shared
components are reused across pages):

- `<button` tags: 322
- `<form` tags: 17
- `<Link` tags: 182
- `<input` tags: 146
- `<select` tags: 51

In the public/auth scope alone, auditors counted 41 buttons, 86 links, and
6 forms plus the support-widget composer, and verified every internal link
target against an existing route or anchor id — no broken internal links
were found in that scope. Across the whole app, elements were audited from
code (handler wiring, validation, and server counterpart), not by clicking
every one in a live browser, because live accounts and credentials were
unavailable. That limitation is stated here rather than hidden behind a
“tested everything” claim.

## 4. Bugs and issues identified

### HIGH

| # | Issue | Evidence |
|---|---|---|
| H1 | Forgot-password and reset-password showed a false success in demo mode (“We’ve sent instructions…”, “Password updated successfully!”) although nothing was sent or changed. | `src/app/(auth)/forgot-password/ForgotPasswordForm.tsx`, `src/app/(auth)/reset-password/ResetPasswordForm.tsx` |
| H2 | “Signups closed” can be bypassed via Google OAuth: the flag is a UI gate only, and `src/app/auth/callback/route.ts` has no `signups_open` check. Documented in code itself. | `src/app/(auth)/signup/SignupForm.tsx`, `src/app/auth/callback/route.ts` |
| H3 | Contact form: client-valid names could be rejected by the server (400). Client capped first and last name at 120 each; the server caps the combined name at 120. | `src/app/(marketing)/contact/page.tsx`, `src/lib/admin/submissions-core.ts` |
| H4 | Dashboard analytics page rendered hard-coded mock numbers (557 total outreach, 41.2% acceptance, etc.) and a decorative 7d/30d/90d toggle that did not change the data. | `src/app/(dashboard)/dashboard/analytics/page.tsx` (before this delivery) |
| H5 | Conditional sequence steps are UI-only: branches are stored in step config, but the executor never evaluates them; it records “Condition step elapsed” and advances. | `src/lib/executor/core.ts`, `src/lib/sequence.ts` |
| H6 | Admin bootstrap endpoint was a permanent super-admin mint while `ADMIN_BOOTSTRAP_SECRET` remained set: no one-time guard, no check that a super-admin already existed, audit row recorded the promoted account as the actor, and `listUsers()` was unpaginated. | `src/app/api/admin/bootstrap/route.ts` |
| H7 | `audit_logs` SELECT policy let any authenticated user read platform audit rows, because the policy allowed `workspace_id IS NULL` rows and every platform audit insert omits `workspace_id`. Credential values were never in audit rows; the leak was metadata (actor emails, actions, hub credential labels/environments/`value_last4`). | `supabase/migrations/001_initial_schema.sql:366` |

### MEDIUM

| # | Issue | Evidence |
|---|---|---|
| M1 | Demo booking form silently replaced a 1–9 character message with boilerplate, and had no client maxima while the server caps name at 120 and company at 160. | `src/components/marketing/DemoBookingForm.tsx` |
| M2 | Plan/integration choice is lost between marketing and signup: pricing CTAs go to bare `/signup` with no `?plan=`, and `/signup?integration=<slug>` is never read by the signup form. | `src/components/marketing/PricingCards.tsx`, `HomePricing.tsx`, `IntegrationsExplorer.tsx` |
| M3 | Contact success copy overstates email delivery in live mode: the visitor is told a reply is on its way, while notification is best-effort after storage and may fail or be unconfigured. Demo mode, by contrast, labels this honestly. | `src/app/(marketing)/contact/page.tsx`, `src/app/api/submissions/route.ts` |
| M4 | Demo-mode admin APIs are unauthenticated by design: with Supabase unconfigured, `resolveAdminGate()` serves and mutates the in-process demo store with no session. Contained only if a demo deployment never holds real data. | `src/lib/admin/platform-server.ts` |
| M5 | Admin page protection rests solely on middleware; the admin layout does no server role check, and middleware's error catch passes the request through. Data still flows only through gated APIs, so this is defence-in-depth, not a data leak. | `src/app/(admin)/layout.tsx`, `src/middleware.ts` |
| M6 | No granular platform-admin permissions: any `admin` equals `super_admin` except for super-admin status changes and parts of the support permission matrix. | `src/lib/admin/server-auth.ts`, `src/lib/support/permissions.ts` |
| M7 | Suspension is not enforced in middleware or the dashboard; only at login and on admin APIs. A session created before suspension stays usable until expiry/refresh. | `src/middleware.ts`, `src/app/(auth)/login/LoginForm.tsx` |
| M8 | Platform audit is best-effort (a failed audit write is logged and the mutation stands), unlike the hub's strict audit which fails the request. | `src/lib/admin/platform-server.ts` vs `src/lib/integration-hub/hub-server.ts` |
| M9 | Outbound webhook signing secret is stored as plaintext JSONB, unlike hub credentials and mailbox tokens which use AES-256-GCM. It is returned only once on first save and never in GET views. | `src/lib/webhooks/store.ts` |
| M10 | Demo LinkedIn account seed carries `auth_status: "ok"` with no provider account id, while the provider state is `configuration_required`. Pages separate the two facts, but a casual read looks “connected”. | `src/lib/data/accounts.ts` |
| M11 | Saved LinkedIn audience source (Search / Sales Navigator URL + requested count) implies future collection that does not exist; there is no collector or job. | `src/app/(dashboard)/dashboard/campaigns/new/page.tsx` |

### LOW

- Header “Product” active-state check targets `/features`, a route that does
  not exist (cosmetic).
- Contact and demo form labels are not programmatically associated
  (`htmlFor`/`id` missing); auth forms mostly are.
- Raw Supabase error text is shown on login (usually the generic “Invalid
  login credentials”, but not mapped to a safe string as the OAuth callback
  does).
- Support widget is absent from auth pages (possibly intentional).
- Bare `.env` was not gitignored (only `.env*.local` was).
- `next.config.mjs` was empty: no security headers in code.
- Hub `.or()` filter interpolates an id that is always DB-derived today
  (low risk, noted for future changes).
- `getAdminSettings()` returns defaults when the service role is missing in
  live mode instead of a 503, so the settings page can show defaults as if
  they were the live record.
- An `admin` may suspend/reactivate any other non-super admin (appears
  intentional; confirm policy).
- Support inbox is platform-global by design, not tenant-scoped; if support
  was ever meant to be per-tenant, that would be a gap — intent unverified
  from code.
- Campaigns list labelled the funnel metric “Connection sent” while its
  tooltip correctly said it counts executor-sent steps.

## 5. Bugs and issues fixed

| # | Fix | Status |
|---|---|---|
| H1 | Demo-mode forgot/reset password no longer show fake success. They now show a Demo Mode error stating authentication is not configured and nothing was sent or changed. | FIXED |
| H3 | Contact form now validates the combined first + last name against the server's 120-character cap before submission, with a clear message. | FIXED |
| H4 | Dashboard analytics page rewritten to load real campaigns and `loadCampaignStats` aggregates: total recorded sends, reply rate from recorded sends/replies, steps skipped, per-campaign performance chart and table, and channel volume from real LinkedIn/email sent counts. Hard-coded mock numbers and the decorative date-range toggle are removed; totals are labelled as all recorded activity, and LinkedIn acceptance remains “—” (no source). | FIXED |
| H6 | Bootstrap: paginated `listUsers()` lookup; one-time guard — if a super-admin already exists, a different account is refused (403) and the existing super-admin case is idempotent (200, no re-promotion); audit row now has `actor_id: null` with the target recorded in metadata, and new tests cover the guard. | FIXED |
| H7 | New migration `021_audit_logs_admin_only_select.sql` replaces the broad SELECT policy: workspace members see only their workspace's rows, platform admins/super-admins see platform rows too. This migration must be applied to the live database in order (see §12). | FIXED (code + migration; live application is BLOCKED on database access) |
| M1 | Demo booking form now caps name at 120, email at 254, and company at 160 to match the server, and carries a visible note that a blank or sub-10-character message is replaced by a standard demo-request line. | FIXED |
| M11 | Campaign wizard now states explicitly that, until a LinkedIn provider is connected, leads must be imported manually (CSV) from the Leads page. | FIXED (copy) |
| Low | Bare `.env` added to `.gitignore` (`.env.example` remains tracked). | FIXED |
| Low | Security headers added in `next.config.mjs` (nosniff, SAMEORIGIN framing, strict referrer policy, HSTS, camera/geolocation permissions policy). Microphone is intentionally not disabled because the voice-note composer uses it. No CSP was added: a CSP would need careful testing against inline assets, Supabase, and Stripe, and a wrong one would break the app. | FIXED (partial; CSP remains PENDING) |
| Low | Campaigns list funnel label corrected to “Connections sent”. | FIXED |
| H2 | Signups-closed OAuth bypass. | NOT FIXED in this delivery — see §12. Enforcing it properly requires a server-side decision (disable signups/provider in Supabase, or enforce `signups_open` in the OAuth callback and handle already-created auth users). A UI-only change would not fix it, so it is left as a documented PENDING item rather than a cosmetic fix. |
| H5 | Conditional branches not evaluated. | NOT FIXED — see §12. Evaluation needs connection-acceptance data, which has no source until a LinkedIn provider reports it. The sequence editor drawer and the executor detail already disclose that conditions are not evaluated; implementing a fake evaluation would violate the no-fake-functionality rule. |
| M2, M3, M4–M9, M10 | Documented in §4 and §12 with the exact reason each was not changed: M2 needs a product decision on plan/integration capture at signup; M3 needs a product decision on success copy vs notification reliability; M4/M5/M7 are architecture decisions with demo-mode trade-offs; M6/M8/M9 need role-model and vault-migration decisions. None was silently “fixed” by weakening a check. | PENDING (documented) |

## 6. Features successfully implemented

This delivery implements no new product feature that invents behaviour.
It completes the analytics page as a real-data page (above), completes the
bootstrap guard and audit-policy migration as security features, and
preserves everything else. The following were already implemented in the
codebase and verified from code (not newly built here):

- Campaign CRUD, pause/resume/archive/duplicate/delete, sequence builder
  UI, lead manual add + CSV import with dedupe, enrolment dedupe.
- Campaign-detail analytics from real aggregates.
- Email OAuth (Gmail/Microsoft) with real token exchange, gated on client
  credentials and `TOKEN_ENCRYPTION_KEY`.
- Inbox with email reply idempotency (a retry can never send twice).
- Stripe checkout/portal/invoice routes that refuse cleanly when
  unconfigured and apply plan changes only via the verified webhook.
- Support widget with guest cookie, escalation, and reopen flows.
- Executor at-most-once claiming (`UNIQUE (enrollment_id, step_order)`),
  warm-up gating, plan-limit deferral, and stop rules.
- Admin platform with gated APIs, hub credential vault (AES-256-GCM),
  strict hub audit, and support permission matrix.

## 7. LinkedIn automation testing results

**Status: BLOCKED — not implemented, honestly refused.**

| Check | Result |
|---|---|
| LinkedIn OAuth connect flow | BLOCKED — no `src/app/api/oauth/linkedin/*`, no callback route, no LinkedIn entry in `src/lib/oauth/config.ts` (only Google/Microsoft) |
| LinkedIn connection requests | BLOCKED — `NotConfiguredLinkedInAdapter.sendConnectionRequest` returns `ok:false, code:"provider_not_configured"`, no network call |
| LinkedIn messages | BLOCKED — same adapter refusal; executor records LinkedIn steps as `skipped`, “It was NOT sent and is not simulated as sent” |
| LinkedIn replies from inbox | BLOCKED — returns `linkedin_unavailable` (HTTP 422); composer disabled by design |
| LinkedIn lead collection from Search / Sales Navigator URL | BLOCKED — URL + requested count are saved only; no collector or job exists |
| LinkedIn account health display | PARTIAL — records exist and health shows the *recorded* state with `verifiedLive:false`; no live re-check is possible without a provider |
| Warm-up programs / daily caps | PARTIAL — program state, phases, caps, and executor gating exist, but they gate actions that cannot execute today |
| Connection acceptance tracking | BLOCKED — `accepted` is always `null` and rendered “—”; no data source exists |

The integration interface is already in place and is preserved:
`LinkedInProviderAdapter` in `src/lib/linkedin` (`types.ts`,
`not-configured.ts`, `state.ts`, `health.ts`, `activity.ts`, `warmup.ts`).
A future vendor adapter is implemented beside `not-configured.ts` and the
factory in `index.ts` starts returning it for that provider's configuration.
Setting `LINKEDIN_PROVIDER` / `LINKEDIN_PROVIDER_API_KEY` alone changes
nothing today, and setting `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` /
`LINKEDIN_REDIRECT_URI` alone connects nothing — both facts are stated in
`.env.example`, `src/lib/config-status.ts`, and the integrations registry.
No browser automation, scraping, password/cookie collection, or CAPTCHA
bypass was added or used.

## 8. Contact form and message delivery testing results

| Check | Result |
|---|---|
| Contact form → `POST /api/submissions` (source `contact`) | PASS in code — server validation, honeypot trap (fake 201 for bots, nothing stored/sent), 5 submissions per 10 minutes per IP, success only after a 201 with a reference id |
| Demo booking form → `POST /api/submissions` (source `demo`) | PASS in code — stored request, explicitly not a calendar booking; no calendar slot is reserved |
| Live email delivery of a contact notification | BLOCKED — needs `RESEND_API_KEY`, `EMAIL_FROM`, and `CONTACT_NOTIFICATION_EMAIL` in Vercel. The route is explicit that notification is best-effort after storage: a stored message with a failed/unconfigured notification is still a successful submission, and the visitor copy should not promise an email reply (see M3) |
| Live storage in Supabase vs demo store | BLOCKED — needs live Supabase env and migrations applied; in this environment the app runs in demo mode by design |
| Support widget conversations | PASS in code — real routes under `/api/support/*`; in demo mode the seeded demo store is used and live-agent availability is only claimed when config says so |
| Form submissions in the local production build | HTTP 200 for `/contact` and `/dashboard` pages was verified against the locally running production build (see §14); no form was submitted with real personal data in this audit |

## 9. Database and security audit results

- **Migrations:** 001–020 existed; 021 is added by this delivery (audit-log
  SELECT fix). All migration headers state they are review-verified only
  and were not applied to a live project from this environment — whether
  001–020 (especially 002 hardening: profile trigger/grants, audit INSERT
  restriction, integrations owner/admin policies) are actually applied to
  production cannot be verified from this checkout. If 002 was never
  applied, the profile privilege-escalation hole it fixes may still be live.
- **RLS (code-level):** enabled on all 001 tables and on admin, hub,
  support, OAuth, and billing-failure tables. `admin_settings`,
  `submissions`, `hub_*`, and `support_*` have zero client policies
  (deny-all for anon/authenticated, service-role-only via gated routes) —
  deliberate. Cross-workspace admin reads are intentional platform-admin
  behaviour after the admin gate, not an IDOR finding. Non-admin reads stay
  workspace-scoped with RLS.
- **Admin APIs:** all 47 routes under `src/app/api/admin/` were verified
  gated in live mode (direct `requireAdminApi`, or via `resolveAdminGate` /
  `resolveHubGate` / `withSupportAdmin`), except the secret-gated bootstrap
  route (see H6). Suspended admins are blocked (403) on admin APIs.
- **Webhooks:** Stripe — raw body + `constructEvent` with webhook secret,
  missing secret/signature refused, events deduplicated before applying,
  plan changes only via webhook: PASS in code. Resend — Svix HMAC-SHA256
  with timing-safe compare and 5-minute tolerance, deduplicated by
  `svix-id`: PASS in code. Outbound webhooks — session-resolved workspace,
  owner/admin writes, HTTPS-only URLs, HMAC-signed payloads, 10 s timeout:
  PASS in code, with the plaintext-secret caveat (M9).
- **Secrets:** no hardcoded secrets found in `src/` (excluding tests and
  documented placeholders); no service-role key in any `"use client"` file;
  hub credential lists never copy the encrypted value; reveal/copy refuse
  revoked credentials and demo mode, carry `Cache-Control: no-store`, and
  write the strict audit row before decryption. `.env.example` contains
  placeholders only. No `.env` or `.env.local` was tracked in the clone.
- **Input validation:** real where it matters — settings bounds, hub
  closed enums and status-change confirmation, support validators and
  64 KiB body cap, webhook emit 20 KiB payload cap. Most platform routes
  have no explicit body-size cap beyond Next.js defaults (unverified
  limit).
- **CSRF / Origin:** no Origin/Referer check or CSRF token was found on
  cookie-authenticated admin routes. Exploitability depends on Supabase
  SSR cookie attributes, which are not pinned in this codebase — marked
  UNVERIFIED, not claimed exploitable.
- **Security headers:** added in this delivery (see §5). CSP remains
  PENDING (see §12).

## 10. API integrations completed

“Completed” here means the integration code, refusal paths, and
configuration are in place and verified — not that a live provider call
succeeded (that is BLOCKED on credentials in every row below).

| Integration | Code state | Live test |
|---|---|---|
| Supabase auth + data layer | Implemented; demo-mode fallback when env missing/placeholder | BLOCKED — needs live project + migrations |
| Gmail / Microsoft OAuth | Implemented; real token exchange + profile fetch, gated on credentials + encryption key | BLOCKED — needs OAuth client ids/secrets + `TOKEN_ENCRYPTION_KEY` + registered callbacks |
| Stripe checkout / portal / webhooks | Implemented; verified webhook only applies plan changes | BLOCKED — needs secret key, webhook secret, publishable key, price ids |
| Resend email + webhooks | Implemented; contact notification + Svix-verified inbound webhook | BLOCKED — needs API key, webhook secret, from/reply-to addresses |
| AI draft / providers (OpenAI, Anthropic, Meta) | Catalogued and gated; provider code paths exist | BLOCKED — needs provider keys/models |
| Meta Pixel | Renders nothing unless pixel id + consent set | BLOCKED — needs pixel id |
| Cron worker (`/api/jobs/run`, Vercel cron 06:00 daily) | Implemented; constant-time `CRON_SECRET` check, 503 when unset | BLOCKED — needs `CRON_SECRET` and Vercel cron |
| LinkedIn provider | Interface only (`LinkedInProviderAdapter` + NotConfigured adapter) | BLOCKED — needs a procured LinkedIn-approved provider + new adapter |
| Integrations centre (HubSpot, Salesforce, etc.) | Honest statuses: several “Not implemented”, Clay via CSV import, others via outbound webhooks only | BLOCKED / NOT APPLICABLE per card — no native two-way sync is claimed |

No new third-party dependency was added by this delivery.

## 11. API keys and permissions still required

Add these in **Vercel Environment Variables** (never in code, never in
chat). The full annotated list with purposes is in `.env.example`
(41 variables; `scripts/check-config.mjs` and `src/lib/config-status.ts`
both match it exactly, 41/41 — verified by grep and by the config-status
test). The required-for-live set is:

- `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and the six
  `STRIPE_PRICE_ID_*` values (starter/growth/agency × monthly/annual)
- Email: `RESEND_API_KEY`, `EMAIL_FROM`, `CONTACT_NOTIFICATION_EMAIL`,
  `RESEND_WEBHOOK_SECRET`, `EMAIL_REPLY_TO`, `UNSUBSCRIBE_SECRET`
- OAuth mailboxes: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`,
  `TOKEN_ENCRYPTION_KEY`, plus `INTEGRATION_HUB_ENCRYPTION_KEY`
- AI (only if AI features are used): `OPENAI_API_KEY`, `OPENAI_MODEL`,
  `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `MODEL_API_KEY`, `META_MODEL`
- Meta Pixel (only if used): `NEXT_PUBLIC_META_PIXEL_ID`
- LinkedIn: **do not set these expecting a connection** —
  `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`,
  `LINKEDIN_REDIRECT_URI`, `LINKEDIN_PROVIDER`,
  `LINKEDIN_PROVIDER_API_KEY` are reserved only until a provider adapter
  is implemented. The planned callback path documented in `.env.example`
  is `/api/integrations/linkedin/callback`; it does not exist yet, so do
  not register it as a live callback until the adapter exists.

After first use, **remove `ADMIN_BOOTSTRAP_SECRET` from Vercel** — the
one-time guard in this delivery limits re-use, but removing the secret is
still the intended protection, and it is stated in the route's own success
response.

## 12. Features that could not be tested and the exact reasons

| Feature | Reason not tested |
|---|---|
| Live Supabase signup/login/Google OAuth/password-reset email | No live Supabase project or credentials in this environment; demo mode is the designed fallback |
| Live contact/demo storage + Resend notification | No `RESEND_API_KEY` / notification address; route is best-effort after storage by design |
| Live Stripe checkout/portal/webhook delivery | No Stripe keys, webhook secret, or price ids |
| Live Gmail/Microsoft token exchange | No OAuth client credentials or encryption key |
| Live cron campaign execution | No `CRON_SECRET`; Vercel cron was not run |
| LinkedIn connect/send/collect/reply/acceptance | No LinkedIn-approved provider, no vendor adapter, no callback route (see §7) |
| Live admin pages with a real admin session | No live admin account or Supabase session; in demo mode `/admin` redirects to `/dashboard?notice=admin-demo` by design |
| Live migration state / RLS in production | No database access; migration files are review-verified only |
| Rendered layout / responsive behaviour / console errors in a real browser | Browser screenshots were requested from the local production build (see §15); visual review beyond the screenshot set was not performed with a live account |
| Support-widget AI answers / human-agent availability | Needs Supabase + AI keys + an agent declaring availability |
| Live reachability of LinkedIn/Facebook profile URLs and `hello@nxtsend.com` | No live network check was performed for those owner-supplied links |
| Whether Stripe price ids in `.env.example` match `/pricing` prices | No checkout code path compares them; no live Stripe dashboard was available |

## 13. Remaining tasks and blockers

1. **BLOCKED — LinkedIn provider:** procure a LinkedIn-approved outreach
   provider (partner API), then implement its adapter behind
   `src/lib/linkedin/LinkedInProviderAdapter`, add the callback route, and
   only then register callback URLs and set provider env vars. Until then,
   every LinkedIn action stays honestly refused.
2. **BLOCKED — Live credentials:** add the §11 variables in Vercel, apply
   migrations 001–021 in order to the live Supabase project, and verify
   that migration 002 hardening is actually live.
3. **BLOCKED — Live verification:** after credentials are added, re-run
   signup/login, contact notification, Stripe checkout + webhook, Gmail/
   Microsoft OAuth, and cron execution against the deployed app, and record
   the results here.
4. **PENDING — Signups-closed enforcement (H2):** decide the enforcement
   point (Supabase signup/provider settings, or callback enforcement with
   handling for already-created auth users) and implement it server-side.
5. **PENDING — Conditional branches (H5):** evaluate branches only once a
   provider can report connection acceptance; until then the existing
   disclosure in the sequence editor and executor detail stands.
6. **PENDING — Plan/integration capture at signup (M2):** decide whether
   `?plan=` / `?integration=` should be consumed (prefill/remember) or
   removed from marketing links.
7. **PENDING — Contact success copy (M3):** decide whether live success
   copy should promise storage/admin review rather than an email reply
   when notification is best-effort.
8. **PENDING — Demo-mode admin APIs (M4), middleware defence-in-depth
   (M5), suspension enforcement (M7), platform audit strictness (M8),
   webhook secret vaulting (M9), granular admin roles (M6), demo LinkedIn
   seed status (M10):** each needs a product/architecture decision; none
   was weakened to claim a fix.
9. **PENDING — CSP header:** design and test a Content Security Policy
   against inline assets, Supabase, and Stripe before adding it.
10. **PENDING — Missing pages:** create `/about`, `/features`, `/blog`,
    and a standalone `/faq` only if the owner wants them; nothing currently
    links to them.
11. **PENDING — `ADMIN_BOOTSTRAP_SECRET` removal:** remove it from Vercel
    after the first super-admin is created (the one-time guard reduces,
    but does not replace, this step).
12. **PENDING — Old-commit secrets (separate, pre-existing):** unrelated
    to this delivery, but recorded in prior work on the Calinex repo, not
    here. No secret was found committed in this NxtSend checkout.

## 14. Build and deployment status

| Check | Result |
|---|---|
| Test suite (`npm test`, Vitest) | PASS — 97 test files, 1,129 tests passed, 0 failed (including the 16 bootstrap tests, updated and extended for the one-time guard) |
| Config check (`node scripts/check-config.mjs`) | Ran as expected in an unconfigured environment: 1 set, 40 missing of 41, with `NEXT_PUBLIC_APP_URL`, Supabase URL/anon/service keys, and `CRON_SECRET` listed as required-for-live but not validly set. This is the expected output before Vercel env vars are added — it is not a build failure |
| Production build (`npm run build`, Node 24) | PASS — exit code 0, with the full route table (75 pages, 91 API routes, middleware) |
| Local production server (`npm start`, port 3000) | PASS — pages returned HTTP 200 for `/`, `/pricing`, `/contact`, `/login`, `/signup`, `/dashboard`, `/dashboard/campaigns`, `/dashboard/analytics`, `/dashboard/linkedin`; `/admin` returned 307 (demo-mode redirect to `/dashboard?notice=admin-demo`, as designed) |
| Deployment to Vercel | NOT DONE in this delivery — the owner deploys from `main` after pushing, and adds Vercel env vars there. No Vercel project was connected to this audit environment |

## 15. Screenshot folder locations

**Status: BLOCKED — no screenshot files were captured in this delivery,
and none are fabricated to fill the folders.**

The folders below were created in the repository as the requested
structure, with a README in each explaining the block:

- `audit-screenshots/public/` — intended: home, pricing, contact, login, signup
- `audit-screenshots/user-dashboard/` — intended: dashboard, analytics, leads, inbox, billing, settings
- `audit-screenshots/admin-dashboard/` — intended: admin pages (live admin pages are BLOCKED without a real admin session in any case; see §12)
- `audit-screenshots/campaigns/` — intended: campaigns list, campaign builder
- `audit-screenshots/linkedin-automation/` — intended: LinkedIn page, accounts page (provider-not-connected state)
- `audit-screenshots/mobile/` — intended: home and dashboard at mobile width

Why they are missing: the local production build was verified running
(HTTP 200 on the pages listed in §14), but screenshot capture from this
environment was blocked — the VM's Chromium binary refuses to start
outside the browser daemon (“WebGL domain policy is required for browser
startup”), and the live-browser task opened for this purpose entered a
`needs_user` state with no tabs and did not return screenshots. The
browser host could not reach the VM-local server on port 3000. Rather
than generating mockups, the folders are left empty with this explanation.
**To complete this item after deployment:** open the deployed Vercel app,
capture the pages above (demo seed data only — no real customer or
personal data), and drop the PNG files into these folders. Pages are
therefore **not** claimed as visually verified in this delivery; the code
audit, test suite, production build, and HTTP checks in §14 still apply
to them.

---

*Status key used throughout: PASS — tested and working. FIXED — issue
found and successfully resolved. BLOCKED — requires external API
credentials, permissions, or access. PENDING — not yet completed.
NOT APPLICABLE — not relevant to the existing project.*
