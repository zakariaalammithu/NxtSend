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
| Node.js Version | **24.x** (Project → Settings → General → Node.js Version; pinned via `engines` in `package.json`. Vercel discontinued Node 20.x — builds fail instantly with "Node.js Version 20.x is discontinued" if this is set to 20.x) |
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
| `CONTACT_NOTIFICATION_EMAIL` | runtime | server | The internal inbox for contact-form notifications — set it to `nxtsendai@gmail.com`. Not a secret, but server-only by posture | Submit the contact form → the notification arrives at that inbox (visitor as Reply-To); Admin → Submissions shows "Notification sent". While unset, submissions record `not_configured` |
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
| `INTEGRATION_HUB_ENCRYPTION_KEY` | runtime | **server secret** | You generate it: `openssl rand -base64 32` (exactly 32 bytes decoded). AES-256-GCM key for the Integration Hub credential vault (migration 016) — **dedicated to the Hub**, separate from `TOKEN_ENCRYPTION_KEY`. **Losing or rotating it makes every stored Hub credential undecryptable — they must all be re-entered** | Admin → Integration Hub: credential create/reveal/copy stop returning 503 (SETUP.md §16) |
| `LINKEDIN_PROVIDER` | runtime | server | **Reserved — not an active integration.** The name of a LinkedIn-approved outreach provider, if/when you procure one. Setting it connects nothing: no vendor adapter is implemented, and the value is read only for presence display in the Integration Center. Leave unset until a provider exists | — |
| `LINKEDIN_PROVIDER_API_KEY` | runtime | **server secret** | **Reserved** — the approved provider's API key, for the same future integration as `LINKEDIN_PROVIDER`. Server-only, never rendered. Leave unset until a provider exists | — |

## 3. Supabase: migrations + post-migration checklist

In the Supabase SQL Editor, run the migrations **in numeric order**:

`001_initial_schema` → `002_security_hardening` → `003_campaign_activity`
→ `004_providers_billing_jobs` → `005_inbox` → `006_integration_verification`
→ `007_admin_settings` → `008_referrals` → `009_user_preferences`
→ `010_sequence_executor` → `011_campaign_config_step_types`
→ `012_notifications` → `013_connected_account_provider_health`
→ `014_oauth_connections` → `015_voice_notes`
→ `016_integration_hub` → `017_billing_webhook_failures`
→ `018_submission_notifications` → `019_support_chat`
→ `020_linkedin_warmup`

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

Migration 016 in full: the six Integration Hub tables (`hub_*`) —
RLS enabled with **no** client policies, service-role only; it also
seeds the Hub's BRR records, checklists and templates (no credentials
— SETUP.md §16).

Migration 017 in full: `billing_webhook_failures` — the durable log
of failed Stripe webhook processing attempts (event id + type, error
summary, resolved flag). RLS enabled with **no** client policies;
written best-effort by the webhook handler *after* the exactly-once
idempotency rollback, so until 017 is applied failed events simply
leave no admin-visible row (the 500/retry behaviour is unchanged).
Surfaced in Admin → Billing → Transactions ("Webhook processing
failures").

Migration 018 in full: contact-form notification tracking columns on
`submissions` (`notification_status` / `_provider_id` / `_error` /
`_attempts` / `_sent_at` / `_recipient`) — the durable outcome of the
Resend notification for each contact-form submission. RLS posture
unchanged from 007 (enabled, no client policies).

Migration 019 in full: the eight support-chat tables (`support_*`) —
conversations, messages (monotonic `sequence_no` polling cursor,
idempotent send retries), knowledge categories + entries (answerable
only when published + enabled + indexed), saved replies, the
settings singleton, support agents, and the append-only conversation
event timeline. RLS enabled with **no** client policies on all eight;
all access is service-role through `/api/support/*` and
`/api/admin/support/*`. No SQL seed — content seeds idempotently
from the app layer on first use (SETUP.md §17). The transport is
short-interval API polling, **not** Realtime/WebSocket; admin-inbox
Realtime is a documented optional phase 2.

Migration 020 in full: the LinkedIn warm-up program columns on
`connected_accounts` (lifecycle status, preset, the resolved schedule
JSONB, per-action overrides, the pause-aware program clock,
graduation timestamp, and the append-only control history) plus
`campaign_step_executions.account_id` — the executor's claim-time
account attribution the warm-up usage counters derive from. No new
tables, no policy changes, no SQL seeding (presets live in app code
and snapshot into `warmup_schedule` when a program starts).

Post-migration checklist:

- [ ] All 20 ran without errors (SQL Editor history). (014 creates
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
- **Google Sign-In**: the provider's client ID and secret live in
  **Supabase → Authentication → Providers → Google** — they are NOT
  Vercel environment variables and never appear in app env or client
  code. They belong to a dedicated Google OAuth client whose only
  Authorized redirect URI is
  `https://<project-ref>.supabase.co/auth/v1/callback` — do not reuse
  the Gmail mailbox client (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`,
  §2/SETUP.md §15). Full owner runbook: SETUP.md §3 ("Google Sign-In
  setup").

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
  `https://<your-domain>/api/webhooks/stripe` — events (exactly the
  eight the handler acts on, `STRIPE_HANDLED_EVENT_TYPES` in
  `src/lib/billing/webhook.ts`): `checkout.session.completed`,
  `customer.subscription.created`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.payment_failed`,
  `charge.refunded`, `charge.dispute.created`,
  `charge.dispute.closed`. Copy the signing secret into
  `STRIPE_WEBHOOK_SECRET`. (What happens to any *other* event Stripe
  sends: §9.4.)
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
  only daily cron jobs. On **Pro**, raise the frequency in
  `vercel.json` — see §9.3 for the decision (5–15 minutes is what
  honours the +5/+30 min webhook-retry schedule; hourly still
  stretches it). Nothing else changes: the worker is idempotent.
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
11. [ ] Swap Stripe **test** keys/prices for **live** ones (the
        ordered swap sequence is §9.2 — all six price IDs and the
        webhook signing secret change together), redeploy, repeat
        step 9's checkout with a real card at the smallest amount,
        then refund.

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

## 9. Environment strategy — Production vs Preview vs Development

The same variables exist in every environment; **which values**
they hold is a safety decision, not a convenience one.

> **Hard rule: NEVER put live Stripe keys (`sk_live_…`) or the
> production Supabase project in Preview.** A preview deployment
> with live keys takes real payments and writes to production data
> from an unreviewed build.

### 9.1 Per-environment checklist

| Variable group | Production | Preview | Development (local) |
|---|---|---|---|
| Stripe `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, 6× `STRIPE_PRICE_ID_*` | **Live** keys + **live** price IDs (after the §9.2 swap pass) | **Test** keys (`sk_test_…`) + **test** price IDs + the test endpoint's signing secret — or omit entirely (billing then shows honest not-configured states) | `.env.local`, **test** keys only |
| Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) | The production project | A **separate** staging project — or omit entirely and let previews run in **Demo Mode** | `.env.local`; a local/staging project, never the production service-role key for routine work |
| `NEXT_PUBLIC_APP_URL` | The production origin | The preview origin. Billing routes refuse a mismatched/localhost origin rather than redirecting wrongly, so checkout on a preview whose URL differs from this value will refuse — expected, not a bug | `http://localhost:3000` |
| Provider keys (Resend, OpenAI/Anthropic/Meta, Google/Microsoft OAuth) | Real keys for the providers you use | Test/dedicated keys, or omit (each integration degrades to its honest not-configured state) | `.env.local`, test keys |
| Vault keys (`TOKEN_ENCRYPTION_KEY`, `INTEGRATION_HUB_ENCRYPTION_KEY`) | Production values; back them up with the other production secrets | **Different** values from Production (a preview must never be able to decrypt production vault data) — or omit and leave the vaults inert | Any locally generated value |
| `CRON_SECRET` | Set (required for the worker) | Optional — set a different value if you want preview job runs | Optional in `.env.local` |
| `ADMIN_BOOTSTRAP_SECRET` | Only during the §3 bootstrap, then **deleted** | Never needed | Never needed |

Mechanics: server secrets are read at **runtime**; `NEXT_PUBLIC_*`
values are baked in at **build time** — changing any of them takes
effect on the next deployment either way (§2).

### 9.2 Stripe test → live swap checklist (ordered)

Do the full pass in **test mode first** (steps 1–7), verify, then
repeat the same sequence with live values (step 8). Do not skip
straight to live.

1. [ ] **Products + Prices (test mode).** Stripe Dashboard (test
       mode) → Products: create the three sold plans from the app
       catalog (`src/lib/billing/plans.ts`) — Starter, Growth,
       Agency — each with a **monthly** and an **annual** Price
       (six prices total). The Free plan is never sold and has **no**
       Stripe price — do not create one. Copy the six Price IDs
       into: `STRIPE_PRICE_ID_STARTER`, `STRIPE_PRICE_ID_STARTER_ANNUAL`,
       `STRIPE_PRICE_ID_GROWTH`, `STRIPE_PRICE_ID_GROWTH_ANNUAL`,
       `STRIPE_PRICE_ID_AGENCY`, `STRIPE_PRICE_ID_AGENCY_ANNUAL`.
2. [ ] **Keys.** Vercel (target environment) → set `STRIPE_SECRET_KEY`
       (`sk_test_…`) from Developers → API keys. Redeploy.
3. [ ] **Webhook endpoint.** Developers → Webhooks → Add endpoint:
       `https://<your-domain>/api/webhooks/stripe`, with exactly
       the **eight handled events**: `checkout.session.completed`,
       `customer.subscription.created`,
       `customer.subscription.updated`,
       `customer.subscription.deleted`, `invoice.payment_failed`,
       `charge.refunded`, `charge.dispute.created`,
       `charge.dispute.closed`. Copy that endpoint's signing secret
       into `STRIPE_WEBHOOK_SECRET`. Redeploy. (While the secret is
       unset the route rejects events with 503 — never accepts
       unverified ones.)
4. [ ] **Customer Portal.** Settings → Billing → Customer portal →
       activate it (payment-method updates, invoices, cancellation)
       — portal sessions fail at Stripe until this exists.
5. [ ] **Test checkout.** Sign in → Dashboard → Billing → pick a
       plan → pay with card `4242 4242 4242 4242` (any future date /
       CVC). Then verify all four:
       - Stripe Dashboard shows the webhook deliveries succeeded;
       - the workspace's `subscriptions` row exists with the Stripe
         customer/subscription IDs and status `active`;
       - the Billing page shows the paid plan (entitlement resolves
         from the subscription, not from the checkout redirect);
       - after the first paid invoice, **Billing History** on the
         same page lists it (read live from Stripe).
6. [ ] **Duplicate-delivery test.** Developers → Webhooks → the
       `customer.subscription.updated` event → **Resend** (or
       `stripe events resend <evt_…>`). The endpoint answers
       `{duplicate: true}` and nothing changes a second time — no
       double effect, by design (event IDs are recorded before
       effects apply).
7. [ ] **Cancel via Portal.** Billing → Manage Billing (Stripe
       Portal) → cancel. Verify: the plan stays in force until the
       paid-through date; once the period ends and Stripe deletes
       the subscription, the workspace's entitlement falls back to
       the **Free** plan (Billing page shows the downgrade notice;
       quotas drop to Free). A failed renewal instead lands in
       `past_due`: the paid plan continues only until the
       paid-through date, then falls back the same way.
8. [ ] **Go live — repeat 1–7 with live values.** Create the
       products/prices again in **live mode** (test and live Price
       IDs are different objects), register a **separate live
       webhook endpoint** (its signing secret is different too),
       activate the Portal in live mode, and swap **all** of:
       `STRIPE_SECRET_KEY` (`sk_live_…`), `STRIPE_WEBHOOK_SECRET`,
       and **all six** `STRIPE_PRICE_ID_*` — together, in one
       change. Swapping only some leaves checkout pointing at test
       prices with a live key (Stripe rejects the mismatch). Finish
       with §6 step 11: one real checkout at the smallest amount,
       then refund it (the refund arrives as `charge.refunded` and
       shows in Admin → Billing → Transactions).

### 9.3 Cron-frequency decision

`vercel.json` currently registers **one** cron — `GET
/api/jobs/run`, daily 06:00 UTC — because the Vercel **Hobby** plan
allows only daily crons. Everything deferred runs through that one
route, so on a daily cadence:

- outbound-webhook retries (scheduled **+5 min**, then **+30 min**,
  max 3 attempts) fire on the *next daily run* instead — up to
  ~24 h late;
- sequence follow-up steps (`follow_up_due`) due during the day
  wait for the next run — step delays stretch to **≤ 24 h**;
- `usage_rollup` is a day stale (display-only impact).

**Decision:** on **Pro**, raise `/api/jobs/run` in `vercel.json` to
every **5–15 minutes** (e.g. `*/10 * * * *`) — that is the cadence
the retry schedule was written for. The worker is idempotent and
drains all due jobs per run, so nothing else changes. If you stay
on Hobby, the alternative is an **external scheduler** (cron-job.org,
a GitHub Actions schedule, etc.) POSTing
`https://<your-domain>/api/jobs/run` with header
`x-cron-secret: <CRON_SECRET>` every 5–15 minutes — the route
accepts that today; the daily Vercel cron then remains as a
backstop. Either way, keep the total cron count within your plan's
limit.

### 9.4 Stripe events the app does not act on

The webhook verifies the signature of **every** delivery; event
types outside the eight handled ones (§9.2 step 3) are then recorded
in `billing_events` with action `recorded_no_action` and
acknowledged — no state changes. Common examples you may see if
you enable extra events in Stripe:

- `invoice.payment_succeeded` — safe to ignore: a successful
  renewal also fires `customer.subscription.updated` carrying the
  new period end and `active` status, which is what entitlement
  resolution reads. (Its counterpart `invoice.payment_failed`
  **is** handled — that is the dunning signal.)
- `payment_intent.*`, `charge.succeeded` — payment-attempt noise;
  no app state keys off them.
- `checkout.session.expired` / `checkout.session.async_payment_failed`
  — an abandoned checkout changes nothing: plans mutate only via
  subscription events, and at most a plan-less customer row remains.

Registering "all events" in Stripe is harmless but only adds
no-action rows; the eight in §9.2 are sufficient. If a webhook
event ever *fails processing* (a handled event whose effects
throw), the endpoint returns 500 so Stripe retries, and the attempt
is logged in `billing_webhook_failures` (migration 017) — visible
in Admin → Billing → Transactions under "Webhook processing
failures", and marked resolved when a redelivery succeeds.
