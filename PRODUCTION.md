# NxtSend — Production Deployment Runbook (Vercel)

This is the **deployment** runbook: project settings, environment
variables, provider registrations, and the ordered go-live smoke
checklist. For first-time setup of each subsystem (Supabase project,
Resend domain, Stripe products, bootstrap admin, webhook signing
details) follow **SETUP.md** — this file assumes those exist and
covers getting them live on Vercel safely.

> Golden rules: secrets go in Vercel → Project → Settings →
> Environment Variables, never in git; `NEXT_PUBLIC_*` values are
> visible to every visitor — only public identifiers belong there;
> nothing in the app reports an integration as connected until its
> configuration is present AND verified (Integration Center → Test
> Connection).

---

## 1. Vercel project settings

| Setting | Value |
|---|---|
| Framework Preset | **Next.js** (auto-detected) |
| Root Directory | The folder containing this file (`nxtsend-app` if the repo root is its parent; the repo root itself when the app is at the root) |
| Node.js Version | **20.x** (Project → Settings → General → Node.js Version; the app targets Node 20 APIs) |
| Build Command | `npm run build` (default) |
| Install Command | `npm install` (default; a lockfile is committed) |
| Output Directory | default (`.next`) |

`vercel.json` at the app root registers one cron job:
`GET /api/jobs/run` at `0 6 * * *` (daily 06:00 UTC).

## 2. Environment variables — the full table

Set these in Vercel (Production environment; add to Preview too if
you want preview deployments to leave Demo Mode). **Build-time** =
baked into the client bundle at build (`NEXT_PUBLIC_*` — changing
them requires a redeploy). **Runtime** = read by server code per
request (a redeploy is still the safe way to apply changes).

Verify any of this safely (names + classification only, never
values): **Admin → System → Diagnostics** (`GET
/api/admin/config-status`) or locally with `npm run config:check`
(add `-- --live` to fail when a required variable is missing).

| Variable | When | Visibility | Where it comes from | Verify |
|---|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | build + runtime | public | Your production origin, e.g. `https://nxtsend-seven.vercel.app` or your custom domain. **No localhost in production** — billing routes refuse (503) rather than redirect a customer to localhost. | Diagnostics → core group; billing checkout reaches Stripe (test mode) |
| `NEXT_PUBLIC_DEMO_MODE` | build | public | Optional. Set to `true` to force the Demo Mode banner even when Supabase is configured (banner override only — it does not change the data mode). Leave unset in production. | Banner appears despite live Supabase config |
| `NEXT_PUBLIC_SUPABASE_URL` | build | public | Supabase → Project Settings → API → Project URL | App leaves Demo Mode (no demo banner) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | build | public | Supabase → Project Settings → API → anon key | Signup/login work |
| `SUPABASE_SERVICE_ROLE_KEY` | runtime | **server secret** | Supabase → Project Settings → API → service_role key | Admin APIs answer (not 503); jobs worker runs |
| `ADMIN_BOOTSTRAP_SECRET` | runtime | **server secret** | You generate it once (`openssl rand -base64 64`) | SETUP.md §5 — and **delete this variable after bootstrap** |
| `RESEND_API_KEY` | runtime | **server secret** | Resend → API Keys | Integration Center → Email → Test Connection |
| `EMAIL_FROM` | runtime | server | A sender on a Resend-verified domain, e.g. `NxtSend <hello@yourdomain>` | Test send arrives |
| `RESEND_WEBHOOK_SECRET` | runtime | **server secret** | Resend webhook endpoint you register in §4 (`whsec_…`) | Resend dashboard shows successful deliveries to `/api/webhooks/resend` |
| `EMAIL_REPLY_TO` | runtime | server | An address on your Resend receiving domain, e.g. `replies@reply.yourdomain` | Integration Center → Email / Resend → "Reply routing & unsubscribe" shows it; a reply to a test send lands in the Inbox |
| `UNSUBSCRIBE_SECRET` | runtime | **server secret** | You generate it (`openssl rand -base64 64`). Optional — while unset the signing key is derived from `SUPABASE_SERVICE_ROLE_KEY` | Same panel shows signing "Configured"; the footer link in a test email opens the confirmation page |
| `STRIPE_SECRET_KEY` | runtime | **server secret** | Stripe → Developers → API keys (use **test** keys first) | Integration Center → Stripe → Test Connection |
| `STRIPE_WEBHOOK_SECRET` | runtime | **server secret** | Stripe webhook endpoint you register in §4 (`whsec_…`) | Stripe dashboard → webhook attempts succeed |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | build | public | Stripe → Developers → API keys (`pk_…`) | Billing page loads without console errors |
| `STRIPE_PRICE_ID_STARTER` / `_ANNUAL`, `STRIPE_PRICE_ID_GROWTH` / `_ANNUAL`, `STRIPE_PRICE_ID_AGENCY` / `_ANNUAL` | runtime | server | Stripe → Products → each plan's Price ID (`price_…`). Create the products per SETUP.md §7 | Checkout for that plan stops returning `configuration_required` |
| `OPENAI_API_KEY` | runtime | **server secret** | OpenAI Platform → API keys | Integration Center → AI → Test Connection; AI Personalization generates a real draft |
| `OPENAI_MODEL` | runtime | server | Optional override (default `gpt-4o-mini`). Leave unset unless you need a specific model | AI Providers admin page shows the override |
| `ANTHROPIC_API_KEY` | runtime | **server secret** | Anthropic Console → API keys | Integration Center → AI → Test Connection |
| `ANTHROPIC_MODEL` | runtime | server | Optional override (default `claude-sonnet-4-5`) | Same as above |
| `MODEL_API_KEY` | runtime | **server secret** | Meta Model API key (Muse Spark models). Endpoint details per SETUP.md §9/§14 research note | Integration Center → AI → Test Connection (this is the first primary confirmation for the key) |
| `META_MODEL` | runtime | server | Optional override (default `muse-spark-1.3`) | AI Providers admin page |
| `NEXT_PUBLIC_META_PIXEL_ID` | build | public | Meta Events Manager → your Pixel ID (numeric) | Events Manager → Test Events shows PageView (consent required first — SETUP.md §8) |
| `CRON_SECRET` | runtime | **server secret** | You generate it (`openssl rand -hex 32`). Vercel Cron automatically sends it as `Authorization: Bearer …` when it exists in the project env — the value here and the one Vercel uses are the same project variable | `curl -X POST https://<domain>/api/jobs/run -H "x-cron-secret: <value>"` → 200 summary; without it → 401 |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI` | runtime | server | **Not used by any live flow.** No LinkedIn OAuth exists (no authorized provider). Leave unset; the variables are documented-demo placeholders for a future provider integration | — |
| `GOOGLE_CLIENT_ID` | runtime | server | Google Cloud Console → OAuth client (Web) — SETUP.md §15.2 | Integration Center → Gmail shows the client configured |
| `GOOGLE_CLIENT_SECRET` | runtime | **server secret** | Same OAuth client | Gmail → Connect completes the consent + profile fetch |
| `MICROSOFT_CLIENT_ID` | runtime | server | Azure → App registrations → Application (client) ID — SETUP.md §15.3 | Integration Center → Outlook (Microsoft 365) shows the client configured |
| `MICROSOFT_CLIENT_SECRET` | runtime | **server secret** | Azure → Certificates & secrets → the secret **Value** (shown once) | Outlook → Connect completes the consent + Graph /me fetch |
| `TOKEN_ENCRYPTION_KEY` | runtime | **server secret** | You generate it: `openssl rand -base64 32` (exactly 32 bytes decoded). Encrypts stored mailbox OAuth tokens (migration 014); also derives the OAuth state + fallback unsubscribe signing keys. **Rotating it invalidates every stored mailbox grant — mailboxes must reconnect** | Diagnostics → "Mailbox OAuth (Gmail / Outlook)" group; connect a mailbox and confirm `/api/oauth/connections` returns metadata with no token fields |

## 3. Supabase: migrations + post-migration checklist

In the Supabase SQL Editor, run the migrations **in numeric order**:

`001_initial_schema` → `002_security_hardening` → `003_campaign_activity`
→ `004_providers_billing_jobs` → `005_inbox` → `006_integration_verification`
→ `007_admin_settings` → `008_referrals` → `009_user_preferences`
→ `010_sequence_executor` → `011_campaign_config_step_types`
→ `012_notifications` → `013_connected_account_provider_health`
→ `014_oauth_connections` → `015_voice_notes`

Migration 015 in full: voice-note columns on `messages`
(`voice_note_path`, `voice_note_duration_sec`, `voice_note_language`,
`transcript`) and the **private** `voice-notes` Storage bucket
(10 MB cap, audio MIME types only) whose RLS policies scope objects to
the owning workspace. The app accesses it only through server routes
(service role after session + workspace checks, short-lived signed URLs
for playback) — confirm the bucket exists and stays private after
applying.

Migration 011 in full: `campaigns.config` JSONB (wizard metadata),
`step_type` enum values `like_post` / `view_profile` / `endorse_skills`,
the `connected_accounts` table (per-channel sending accounts — warm-up
state, daily limits, sender identity for the `{my_*}` variables), and
`campaigns.sender_account_id` / `email_account_id`. Until 011 is
applied, live mode cannot persist wizard metadata, the new step types
or connected accounts (Demo Mode has no such dependency).

Post-migration checklist:

- [ ] All 14 ran without errors (SQL Editor history). (014 creates
      `oauth_connections` — RLS enabled with **no** client policies by
      design; it must show "RLS enabled" with zero policies.)
- [ ] RLS is enabled on every public table (Database → Tables — no
      table shows "RLS disabled").
- [ ] Run the negative tests in SETUP.md §13 (self-promotion to
      super_admin must fail; cross-workspace reads must return
      nothing; audit-log inserts from a client must fail).
- [ ] Create the first super admin (SETUP.md §5), then **remove
      `ADMIN_BOOTSTRAP_SECRET` from Vercel and redeploy**.

## 4. Auth URLs + provider webhook registrations

### Supabase Auth (Dashboard → Authentication → URL Configuration)

- **Site URL**: your production origin (same value as
  `NEXT_PUBLIC_APP_URL`).
- **Redirect URLs** (allowlist) — add exactly these:
  - `https://<your-domain>/reset-password`
  - `https://<your-domain>/auth/callback`
  - `http://localhost:3000/reset-password` (local dev)
  - `http://localhost:3000/auth/callback` (local dev)
- Authentication → Providers → Email: decide "Confirm email" on/off;
  the app handles both (workspace is created at first sign-in when
  confirmation is on).

### Resend

- Verify your sending domain (SPF/DKIM) — sending from an unverified
  domain fails at the provider, by design.
- **Domain authentication records** (copy the exact values from the
  Resend dashboard for your domain; full guidance in SETUP.md §6):
  DKIM TXT at `resend._domainkey` with the full public key; SPF TXT
  `v=spf1 include:amazonses.com ~all` on the `send` subdomain plus its
  MX (`feedback-smtp.<region>.amazonses.com`, priority 10); DMARC TXT
  at `_dmarc` starting `v=DMARC1; p=none; rua=mailto:...`, tightened
  to `quarantine` → `reject` once aggregate reports are clean.
- **Verify in-app after DNS propagates**: Integration Center →
  Email / Resend (or Admin → Integrations → Email) → **Email
  authentication** panel → Run check — it shows real SPF/DKIM/DMARC
  verdicts for the EMAIL_FROM domain and the provider-domain match.
  Test Connection reports the same match and warns ("Configuration
  Required") when the EMAIL_FROM domain is unverified at Resend.
- **Replies**: sending alone does not deliver replies to the Inbox.
  Set **`EMAIL_REPLY_TO`** to an address on a Resend receiving domain
  (MX configured — SETUP.md §6): every outbound email (sequence steps
  and Inbox replies) carries it as Reply-To, so replies land on the
  receiving domain and reach the Inbox. While it is unset, replies go
  to EMAIL_FROM and only reach the Inbox if that domain also receives.
- **Unsubscribe**: built in (P5 Stage C) — every outbound email gets a
  signed one-click `List-Unsubscribe` header (RFC 8058) + a footer
  link at send time, pointing at the public
  `https://<NEXT_PUBLIC_APP_URL>/api/unsubscribe/<token>` endpoint
  (no auth — the HMAC token is the credential; GET shows a
  confirmation page, POST performs it). Set **`UNSUBSCRIBE_SECRET`**
  for a stable signing key; while unset, the key is derived from
  `SUPABASE_SERVICE_ROLE_KEY` (rotating that key invalidates older
  links). In production with neither set — or with
  NEXT_PUBLIC_APP_URL unset/localhost — sends omit the URL and warn
  in the send result rather than emitting an invalid link. Confirming
  an unsubscribe adds the address to the workspace suppression list
  (manage it at Dashboard → Email → Suppression list) and stops the
  lead's active enrollments.
- **Webhooks → Add endpoint**: `https://<your-domain>/api/webhooks/resend`
  — events: delivery/bounce/complaint set from SETUP.md §6, plus the
  inbound/receiving setup if you enabled reply receiving (sending
  alone does NOT deliver replies to the Inbox — SETUP.md §6 has the
  extra receiving-domain steps). Copy the signing secret into
  `RESEND_WEBHOOK_SECRET`. While the secret is unset the route
  rejects events (503) rather than trusting them.

### Stripe

- **Developers → Webhooks → Add endpoint**:
  `https://<your-domain>/api/webhooks/stripe` — events:
  `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`,
  `invoice.payment_failed`. Copy the signing secret into
  `STRIPE_WEBHOOK_SECRET`.
- Create the Customer Portal configuration (Settings → Billing →
  Customer portal) or portal sessions will fail at Stripe.
- Do the full test-mode pass (§6) before swapping in live keys.

### Mailbox OAuth callbacks (Gmail / Outlook — SETUP.md §15)

Not webhooks — OAuth **redirect URIs**, registered at the provider
and derived from `NEXT_PUBLIC_APP_URL`. They must match the deployed
origin exactly:

- **Google Cloud Console** → OAuth client (Web) → Authorized
  redirect URIs: `https://<your-domain>/api/oauth/google/callback`
- **Azure** → App registration → Web platform redirect URI:
  `https://<your-domain>/api/oauth/microsoft/callback`

If you change the production origin (custom domain), update BOTH
registrations and `NEXT_PUBLIC_APP_URL` together — a mismatch fails
the connect with `redirect_uri_mismatch` (Google) / `AADSTS50011`
(Microsoft) and stores nothing. Disconnect semantics: Gmail also
revokes at Google (best effort); Microsoft has no revocation
endpoint — token deletion + account state is the disconnect there.

## 5. Cron + worker notes

- The schedule is **daily** because the Vercel **Hobby** plan allows
  only daily cron jobs. On **Pro**, you may raise the frequency in
  `vercel.json` (e.g. hourly `0 * * * *`) for faster sequence pacing —
  step delays are measured in hours, so daily is functional,
  hourly is nicer. Nothing else changes: the worker is idempotent.
- `CRON_SECRET` must exist in the Vercel project env; Vercel Cron
  presents it automatically. Without it `/api/jobs/run` refuses
  (503) — by design, never unauthenticated.
- Manual run (debugging): `curl -X POST https://<domain>/api/jobs/run
  -H "x-cron-secret: <CRON_SECRET>"`.
- Job producers: activating a campaign enqueues that workspace's
  daily `follow_up_due` scan (`POST /api/jobs/enqueue`,
  session-gated); `usage_rollup` / `webhook_retry` jobs are enqueued
  by server code/SQL as documented in SETUP.md §10.

## 6. Go-live smoke checklist (run in this order)

1. [ ] Deploy with Supabase vars only → open the site: no Demo Mode
       banner, `/api/admin/config-status` shows core group all Set.
2. [ ] **Signup** a test account → **verify email** via the received
       link → **login** → workspace auto-created → dashboard loads.
3. [ ] Password reset round-trip from `/forgot-password`.
4. [ ] **CSV import** on Leads: import a 3-row file (1 valid, 1
       duplicate, 1 invalid) → summary shows exactly 1/1/1.
5. [ ] Create an **email campaign** with a 0-hour first email step,
       enroll the test lead, activate it.
6. [ ] Resend configured (§4): run the worker manually (§5 curl) →
       the email actually sends; `messages` shows the provider ID;
       the campaign activity shows `step_sent`; Resend's webhook
       flips the message to delivered.
7. [ ] **Inbox**: reply to the thread → provider-confirmed status,
       provider message ID shown. Add the address to the suppression
       list → next send refuses as suppressed.
8. [ ] Integration Center: **Test Connection** per integration
       (Supabase, Resend, Stripe, OpenAI/Anthropic/Meta) — each
       reports Connected **and Verified** only on a real check.
8b. [ ] **Mailbox OAuth** (if used, SETUP.md §15): connect a test
       Gmail/Outlook mailbox → it appears in Connected Accounts;
       point the test campaign's email account at it → the worker
       run sends From the mailbox address (check the received
       message's From + the `messages` row provider `gmail` /
       `microsoft` with a provider message ID); reply from the
       Inbox → also sent via the mailbox. Disconnect → tokens are
       gone (`/api/oauth/connections` returns an empty list) and
       the account shows `not_connected`.
9. [ ] **Stripe test mode**: Billing → upgrade with card
       `4242 4242 4242 4242` → plan changes ONLY after the webhook
       fires; Stripe dashboard shows the webhook delivery succeeded;
       redeliver the event → no duplicate effect.
10. [ ] Admin: suspend the test user → they are blocked at next
        login; audit log shows the action.
11. [ ] Swap Stripe **test** keys/prices for **live** ones, redeploy,
        repeat step 9's checkout with a real card at the smallest
        amount, then refund.

## 7. Custom domain

1. Vercel → Project → Settings → Domains → add your domain; follow
   the DNS records Vercel shows (A/CNAME at your registrar).
2. After the domain is verified, update **all** of these or redirects
   will strand users:
   - `NEXT_PUBLIC_APP_URL` → `https://<domain>` + redeploy;
   - Supabase Site URL + redirect allowlist (§4);
   - Resend + Stripe webhook URLs (§4) — or keep the vercel.app
     endpoints too; both reach the same app;
   - any outbound webhook (n8n/Zapier) consumers you configured.
3. Re-run §6 steps 2, 6 and 9 on the domain.

## 8. Rollback notes

- **Code**: Vercel → Deployments → pick the last good deployment →
  **Promote to Production** (instant; no rebuild). Git-side, redeploy
  the previous commit the same way.
- **Environment**: env-var changes apply on the next deployment;
  re-promoting an older deployment does NOT restore old env values —
  keep a private note of changes you make during go-live.
- **Database**: migrations are additive (new columns/tables/policies);
  rolling code back does not require rolling the schema back. Do NOT
  drop migration 010's `campaign_step_executions` while any deployed
  code references it — roll code back first, schema last, and only
  with a backup (Supabase → Database → Backups).
- **Stripe/Resend**: if a provider misbehaves, removing its keys in
  Vercel returns that feature to an honest Not Connected /
  configuration-required state on the next deploy — sends stop,
  nothing fails silently.
