# NxtSend — Setup Guide

This is the setup document referenced by `supabase/migrations/001_initial_schema.sql`.
Follow it top to bottom for a first production deployment. Everything in
the app is **honest about its state**: a feature only reports
"Connected" when its credentials are actually configured, and nothing
sends, charges, or tracks until the steps below are done.

> **Demo Mode:** with no Supabase env vars set, the app runs in Demo
> Mode — dashboards show clearly-labelled demo data, provider routes
> refuse with `503` + a state field, and nothing external is ever
> called. Demo Mode is for evaluation, not production.

---

## 1. Create the Supabase project

1. Go to [app.supabase.com](https://app.supabase.com) → **New project**.
   Pick a name (e.g. `nxtsend`), a strong database password (store it in
   a password manager — it is not used by the app, only by you), and the
   region closest to your users.
2. Wait for provisioning, then open **Settings → API** and note:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role secret** → `SUPABASE_SERVICE_ROLE_KEY`
     (⚠️ server-only — never put it in client code, a `NEXT_PUBLIC_`
     variable, or a commit.)

## 2. Run the migrations (in order)

Open **SQL Editor** in the Supabase dashboard and run each file from
`supabase/migrations/` **in this order**, one at a time:

| # | File | Contents |
|---|------|----------|
| 1 | `001_initial_schema.sql` | Core tables (profiles, workspaces, campaigns, leads, messages, integrations, subscriptions, suppression_list, audit_logs), enums, RLS |
| 2 | `002_security_hardening.sql` | RLS fixes (profile role-escalation closed, enrollments policies, audit-insert lockdown, integrations config restricted to workspace admins), `profiles.status` |
| 3 | `003_campaign_activity.sql` | `campaign_activity` table + append-only RLS |
| 4 | `004_providers_billing_jobs.sql` | `billing_events`, `email_events`, `webhook_deliveries`, `jobs`, `job_runs`, `usage_records`; message/subscription provider columns |
| 5 | `005_inbox.sql` | `conversations` table + RLS; `messages.conversation_id` / `read_at` / `idempotency_key` / `error`; reply-idempotency + provider-message dedupe indexes; backfill grouping legacy lead messages into conversations |
| 6 | `006_integration_verification.sql` | `integrations.last_verified_at` / `last_verification_status` / `last_verification_message` — Integration Center Test Connection records (§14) |
| 7 | `007_admin_settings.sql` | `admin_settings` singleton + `submissions` table (admin APIs are the only access path) |
| 8 | `008_referrals.sql` | `referrals` table (capture records; rewards are NOT configured — see the Referral page) |
| 9 | `009_user_preferences.sql` | `user_preferences` table (profile bio + notification preferences) |
| 10 | `010_sequence_executor.sql` | `campaign_enrollments.last_step_at` + `campaign_step_executions` (the sequence executor's at-most-once claim + attempt log) |
| 11 | `011_campaign_config_step_types.sql` | `campaigns.config` JSONB (wizard description / audience source / warm-up limits persist live) + `step_type` enum values `like_post` / `view_profile` / `endorse_skills` (LinkedIn touch steps — recorded skipped by the executor, like all LinkedIn steps) + `connected_accounts` table (per-channel sending accounts: warm-up state, `daily_limits` JSONB, sender identity fields behind the `{my_*}` template variables; workspace RLS) + `campaigns.sender_account_id` / `campaigns.email_account_id` (nullable, ON DELETE SET NULL) |
| 12 | `012_notifications.sql` | `notifications` table (in-app notifications with read state; workspace RLS — members read/mark-read, creation is service-role only). Powers the dashboard bell and reply-arrival notifications created by inbound ingestion (P5 Stage D) |
| 13 | `013_connected_account_provider_health.sql` | `connected_accounts` gains provider identity + auth health: `provider_account_id`, `auth_status` (`ok` / `needs_reconnect` / `expired` / `error` / `not_connected`, backfilled `ok` for rows already marked `connected`), `last_sync_at`, `last_error`. Powers the account health + reconnect surfaces; written only by a provider integration (P5 Stage F) |
| 14 | `014_oauth_connections.sql` | `oauth_connections` table (P5 Stage G): the encrypted OAuth token vault for connected Gmail / Outlook mailboxes — workspace + `connected_accounts` FKs (CASCADE), provider CHECK (`google` / `microsoft`), mailbox address, scopes, `access_token_enc` / `refresh_token_enc` (AES-256-GCM ciphertext only), token expiry, grant status. **RLS enabled with NO client policies — service-role only by construction**; the UI reads metadata through guarded API routes that never return token fields |
| 15 | `015_voice_notes.sql` | Voice notes (P6 Stage C): `messages` gains `voice_note_path` / `voice_note_duration_sec` / `voice_note_language` / `transcript`, plus the **private** Supabase Storage bucket `voice-notes` (public = false, 10 MB cap, audio MIME allowlist) with storage RLS policies scoping objects to workspaces the caller belongs to (first path segment = workspace id). Audio bytes live in the bucket, never in the table; playback goes through a server route using short-lived signed URLs. A voice note is delivered as an **email attachment only** — there is no LinkedIn voice-note delivery |
| 16 | `016_integration_hub.sql` | Integration Hub (P7): `hub_integrations`, `hub_credentials`, `hub_test_accounts`, `hub_checklist_items`, `hub_checklist_state`, `hub_documents`. Credential values exist ONLY as AES-256-GCM ciphertext (`value_enc`, keyed by `INTEGRATION_HUB_ENCRYPTION_KEY`) — no plaintext column exists. **RLS enabled with NO client policies on all six tables — service-role only**, behind the admin gate. Seeds the six BRR records (Muse connector `in_review`, the other five `configuring`), their checklists/documents and 8 Hub-global templates — all idempotent (`ON CONFLICT DO NOTHING`), and **no credentials and no test accounts**. See §16 |
| 17 | `017_billing_webhook_failures.sql` | Billing webhook failure log (P9): `billing_webhook_failures` — one row per FAILED Stripe webhook processing attempt (event id + type, error summary truncated to 500 chars, `resolved` flag set when a redelivery of the same event later succeeds; rows are never deleted). **RLS enabled with NO client policies — service-role only.** Written best-effort by the webhook handler AFTER its exactly-once idempotency rollback, so until 017 is applied failed events leave no admin-visible row (the 500/retry behaviour is unchanged). Surfaced in Admin → Billing → Transactions ("Webhook processing failures") |
| 18 | `018_submission_notifications.sql` | Contact-form notification tracking (P10): `submissions` gains `notification_status` (`pending`/`sent`/`failed`/`not_configured`/`simulated`, CHECK-constrained, NULL = not applicable), `notification_provider_id`, `notification_error` (sanitised, ≤500 chars), `notification_attempts`, `notification_sent_at`, `notification_recipient` — the durable outcome of the Resend notification sent to `CONTACT_NOTIFICATION_EMAIL` for each contact-form submission. RLS posture unchanged from 007 (enabled, no client policies — service-role only). Surfaced in Admin → Submissions with a retry action |
| 19 | `019_support_chat.sql` | Website support chat (P10): `support_conversations`, `support_messages` (monotonic `sequence_no` polling cursor; partial-unique `client_message_id` for idempotent send retries), `support_knowledge_categories`, `support_knowledge` (app-maintained `search_text`/`content_hash`/`indexed_at` — an entry is answerable only when published + enabled + indexed, in an enabled category), `support_saved_replies`, `support_settings` (singleton), `support_agents`, `support_conversation_events` (append-only timeline). **RLS enabled with NO client policies on all eight tables — service-role only**, behind `/api/support/*` (session or guest-token-hash authorisation) and `/api/admin/support/*` (admin gate + support permission matrix). No content is seeded by SQL — the KB/settings/replies seed idempotently from the app layer on first use. See §17 |

Do not skip or reorder — later migrations depend on earlier helpers
(`is_workspace_member`, `is_workspace_admin`).

## 3. Configure authentication

In Supabase **Authentication → URL Configuration**:

- **Site URL**: your production URL (e.g. `https://nxtsend-seven.vercel.app`,
  later your custom domain).
- **Redirect URLs**: add `https://<your-domain>/reset-password` and
  `https://<your-domain>/auth/callback` (the OAuth landing for Google
  Sign-In, below), plus the local dev equivalents
  `http://localhost:3000/reset-password` and
  `http://localhost:3000/auth/callback`.

In **Authentication → Providers → Email**: decide whether "Confirm
email" is on. The app handles both (with confirmation on, the workspace
is created at first sign-in instead of at signup).

### Google Sign-In setup ("Continue with Google")

The login and signup pages carry a "Continue with Google" button that
runs Supabase Auth's Google provider (authorization code + PKCE; the
app never handles Google tokens). **No app environment variables are
involved**: the Google client secret lives in the Supabase dashboard,
never in Vercel env or client code. Configuration is entirely
owner-side, in two dashboards:

> ⚠️ Use a **separate** Google OAuth client for sign-in. The
> `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` env vars belong to the
> *Gmail mailbox* integration (§15) with a different callback
> (`/api/oauth/google/callback`) and Gmail scopes — do **not** reuse
> that client here.

**A. Google Cloud Console** (the same Cloud project as §15 is fine):

1. **APIs & Services → OAuth consent screen**: user type *External*;
   app name "NxtSend"; support + developer contact emails; homepage,
   privacy and terms URLs on the production domain. Supabase's Google
   provider needs only the identity scopes (`openid`, `email`,
   `profile`) — not the Gmail scopes.
2. If the consent screen stays in **Testing**, only listed test users
   can sign in — **Publish** it for public sign-up (or add test users
   while testing).
3. **Credentials → Create credentials → OAuth client ID → Web
   application**, name e.g. "NxtSend Supabase Auth".
4. **Authorized redirect URI** — exactly one, the *Supabase* callback
   (copy the exact value from Supabase → Authentication → Providers →
   Google): `https://<project-ref>.supabase.co/auth/v1/callback`.
   Do **not** put the app's `/auth/callback` here — Google talks to
   Supabase; Supabase redirects to the app afterwards.
5. Keep the new client's ID and secret for step B. The secret is
   entered into Supabase only — never into Vercel, `.env.local`, or
   chat.

**B. Supabase Dashboard**:

1. **Authentication → Providers → Google**: enable it and paste the
   client ID + client secret from step A. Leave "Skip nonce check"
   **off** for the web flow.
2. **Authentication → URL Configuration**: **Site URL** = the deployed
   production origin (same as `NEXT_PUBLIC_APP_URL`); **Redirect
   URLs** must include `https://<your-domain>/auth/callback` and
   `http://localhost:3000/auth/callback` (see above).
3. Leave the Email provider enabled — password sign-in keeps working
   alongside Google.

**Verify** (after the steps above): sign in with a brand-new Google
account → you land on the dashboard with a profile whose role is
`user` (Google sign-up can never grant admin — roles come only from
`profiles`, set by bootstrap/admin action) and one default workspace.
Cancel at Google's consent screen → the login page shows "Google
sign-in was cancelled" and password login still works. Visit
`/dashboard/billing` while logged out → after Google sign-in you land
back on `/dashboard/billing`, not `/dashboard`.

Notes: whether a Google sign-in with the same email as an existing
password account links to that account is **Supabase project
behaviour**, not app code — the app never merges profiles by email.
Exercise it once in a staging project before enabling in production
and note the observed behaviour. The signup page's "signups closed"
flag also disables its Google button, but that flag is a UI gate, not
a hard server-side block (Supabase creates the auth user during the
OAuth round-trip); for a hard stop, disable signups or the Google
provider in Supabase.

## 4. Environment variables — full table

Copy `.env.example` to `.env.local` for local development; in
production set the same variables in **Vercel → Project → Settings →
Environment Variables**. Placeholders from `.env.example` are detected
and treated as *not configured*.

| Variable | Required | Used for |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Yes | Absolute base URL for links/redirects (checkout success/cancel, password reset) |
| `NODE_ENV` | — | `production` in production |
| `NEXT_PUBLIC_DEMO_MODE` | Optional | Set to `true` to force the Demo Mode banner even when Supabase is configured (banner override only — it does not switch the data mode) |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes (live mode) | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes (live mode) | Supabase anon key (public, RLS-protected) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (live mode) | ⚠️ Server-only. Admin API, webhooks, jobs, billing — bypasses RLS |
| `ADMIN_BOOTSTRAP_SECRET` | One-time only | Promoting the first super admin (§5). **Remove after use** |
| `RESEND_API_KEY` | For email | Resend sending key (server-only) |
| `EMAIL_FROM` | For email | Verified sender, e.g. `NxtSend <hello@yourdomain.com>` |
| `CONTACT_NOTIFICATION_EMAIL` | For contact notifications | Internal inbox receiving contact-form notification email — the owner's is `nxtsendai@gmail.com`. Sent from `EMAIL_FROM` via Resend with the visitor as Reply-To; while unset, contact submissions are still stored but record notification `not_configured` |
| `RESEND_WEBHOOK_SECRET` | For email events | Svix signing secret for `/api/webhooks/resend`; while unset the route rejects events with 503 |
| `STRIPE_SECRET_KEY` | For billing | Stripe secret key (server-only) |
| `STRIPE_WEBHOOK_SECRET` | For billing | Signing secret for `/api/webhooks/stripe`; while unset the route rejects events with 503 |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Optional | Stripe publishable key (public; reserved for future client-side Stripe.js use) |
| `STRIPE_PRICE_ID_STARTER` / `_ANNUAL` | For checkout | Stripe Price IDs per plan (§7) |
| `STRIPE_PRICE_ID_GROWTH` / `_ANNUAL` | For checkout | " |
| `STRIPE_PRICE_ID_AGENCY` / `_ANNUAL` | For checkout | " |
| `NEXT_PUBLIC_META_PIXEL_ID` | Optional | Meta Pixel ID (public identifier, not a secret) — §8 |
| `OPENAI_API_KEY` | Optional | AI drafting via OpenAI (server-only); also enables **Whisper transcription** of recorded voice notes (`/api/voice/transcribe`) — without it, voice dictation falls back to the browser's built-in speech recognition where available |
| `OPENAI_MODEL` | Optional | Override (default `gpt-4o-mini`) |
| `ANTHROPIC_API_KEY` | Optional | AI drafting via Claude (server-only) |
| `ANTHROPIC_MODEL` | Optional | Override (default `claude-sonnet-4-5`) |
| `MODEL_API_KEY` | Optional | AI drafting via Meta Model API / Muse Spark (server-only) — §9, §14 |
| `META_MODEL` | Optional | Override (default `muse-spark-1.3`) |
| `CRON_SECRET` | For jobs | Protects `/api/jobs/run`; while unset the worker refuses (503). Generate: `openssl rand -hex 32` |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` / `LINKEDIN_REDIRECT_URI` | — | Reserved. **No authorized LinkedIn provider is integrated yet** — LinkedIn actions stay in Demo Mode regardless (see §11) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | For Gmail mailboxes | Google Cloud OAuth 2.0 Web client (server-only secret) — §15. Callback: `<NEXT_PUBLIC_APP_URL>/api/oauth/google/callback` |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | For Outlook mailboxes | Azure app registration (server-only secret value) — §15. Callback: `<NEXT_PUBLIC_APP_URL>/api/oauth/microsoft/callback` |
| `TOKEN_ENCRYPTION_KEY` | For mailbox OAuth | ⚠️ Server-only. AES-256-GCM key for the OAuth token vault (migration 014) — exactly 32 bytes, base64. Generate: `openssl rand -base64 32`. Also derives the OAuth state + fallback unsubscribe signing keys. **Rotating it invalidates every stored grant — mailboxes must reconnect** |
| `INTEGRATION_HUB_ENCRYPTION_KEY` | For the Integration Hub vault | ⚠️ Server-only. AES-256-GCM key for the Integration Hub credential vault (migration 016) — exactly 32 bytes, base64, DEDICATED to the Hub (not shared with the mailbox vault). Generate: `openssl rand -base64 32`. **Losing or rotating it makes every stored Hub credential undecryptable — they must all be re-entered** — §16 |
| `INSTANTLY_API_KEY` | Optional | Instantly API v2 key (`accounts:read` scope) for **read-only** email warm-up status (server-only). Warm-up itself runs on Instantly's network; while unset, warm-up reads return "Unavailable" — never simulated |
| `LINKEDIN_PROVIDER` / `LINKEDIN_PROVIDER_API_KEY` | — | Reserved for a future LinkedIn provider integration. **Setting them connects nothing** — no vendor adapter is implemented; the values are read only for presence display in the Integration Center |

## 5. Create the first Super Admin (bootstrap)

The owner's initial admin account is **mithusquare@gmail.com**. Admin
privilege is **never** granted by the email address alone: the email
only selects an *existing* account, and the one-time
`ADMIN_BOOTSTRAP_SECRET` is the actual capability. Run these steps in
order, exactly once, at go-live:

1. **Create the Supabase project and apply ALL migrations 001–019 in
   order** (§1–§2 above), and finish the auth URL configuration (§3).
   The bootstrap writes to `profiles` and `audit_logs`, which only
   exist after the migrations.
2. **Sign up in the app** (the normal `/signup` page) with
   **mithusquare@gmail.com** and complete any email confirmation, so
   the account and its `profiles` row exist. Bootstrap cannot create
   the account — it only promotes an existing one.
3. **Set `ADMIN_BOOTSTRAP_SECRET`** in **Vercel → Project → Settings →
   Environment Variables** to a long random value (e.g.
   `openssl rand -hex 32`) and redeploy. Do not commit it anywhere and
   do not reuse any other secret for it.
4. **Promote the account** (from your own machine, replacing the
   domain, secret and — only if different — email):
   ```bash
   curl -X POST https://<your-domain>/api/admin/bootstrap \
     -H "Content-Type: application/json" \
     -d '{"secret": "<ADMIN_BOOTSTRAP_SECRET>", "email": "mithusquare@gmail.com"}'
   ```
   Expected response: `{"success": true, ...}`. The route is
   rate-limited (5 attempts / 10 min / IP), compares the secret in
   constant time, and refuses to run in Demo Mode. Common failures:
   `403` = secret not set (or still the placeholder); `401` = wrong
   secret; `404` = no account has signed up with that email yet
   (repeat step 2); `503` = Supabase env vars not configured.
5. **Remove `ADMIN_BOOTSTRAP_SECRET` from the Vercel environment** and
   redeploy. The endpoint stays armed for as long as the variable
   exists — removing it is part of the procedure, not an optional
   tidy-up.
6. **Verify**: sign in as mithusquare@gmail.com and open `/admin` — it
   should load the admin console (in Demo Mode `/admin` redirects away
   by design; a super admin only exists in live mode). Then open the
   admin **Audit Logs** page and confirm an `ADMIN_BOOTSTRAP` entry
   exists for the promotion.

**Adding more admins later:** repeat this same procedure for each new
admin — they sign up first, you set a *fresh* `ADMIN_BOOTSTRAP_SECRET`,
POST with their email, then remove the secret again. (The role-change
dialog on the admin Users page is currently local-state only and does
**not** persist role changes, so do not rely on it for granting admin.)

Never grant admin by editing `user_metadata` — roles come only from the
`profiles` table and can only be changed via the service role.

## 6. Email (Resend)

1. Create an account at [resend.com](https://resend.com), add and
   verify your sending domain (SPF/DKIM DNS records as Resend shows).
2. Create an API key → `RESEND_API_KEY`. Set `EMAIL_FROM` to an address
   on the verified domain.
3. Register the webhook: Resend dashboard → **Webhooks** → endpoint
   `https://<your-domain>/api/webhooks/resend`, events: `email.sent`,
   `email.delivered`, `email.bounced`, `email.complained`,
   `email.delivery_delayed`, `email.opened`, `email.clicked`.
   Copy the signing secret (`whsec_...`) → `RESEND_WEBHOOK_SECRET`.
4. Behaviour to expect (by design):
   - Every send checks the workspace `suppression_list` **first**; a
     suppressed recipient is refused, and if the check cannot run the
     send is refused (fail closed).
   - A send reports success only when Resend returns a message ID;
     delivery/bounce state arrives via the signed webhook and updates
     the `messages` row. Bounces/complaints auto-suppress the address.
   - Until keys exist, sends return a labelled simulated/not-configured
     result — nothing is ever silently "sent".

### Receiving replies (Inbox) — extra setup, sending alone is NOT enough

Sending capability does **not** give you an inbox. Resend only delivers
inbound mail for a **receiving domain**, and the webhook carries
metadata only — NxtSend fetches the body from the Receiving API and
files it into the matching conversation. To enable real replies:

1. **Set up receiving** in the Resend dashboard → **Receiving**:
   either use your account's Resend-managed `<id>.resend.app` address,
   or enable receiving on a verified domain and add the **MX record**
   Resend shows to that domain's DNS. Without one of these, no inbound
   mail exists and no `email.received` events are ever sent.
2. **Make replies land on the receiving domain.** Set
   **`EMAIL_REPLY_TO`** to an address on the receiving domain. The
   sequence executor and the Inbox reply service pass it as the
   Reply-To on every outbound email (P5 Stage C), so replies are
   addressed to the receiving domain and flow back into the Inbox.
   While `EMAIL_REPLY_TO` is unset, no Reply-To is set and replies go
   to the `EMAIL_FROM` address — the Inbox then only works if the From
   domain itself is also a receiving domain. The Resend integration
   page shows the current routing ("Reply routing & unsubscribe"
   panel) and warns while it is unset.
3. **Subscribe the webhook to inbound:** the same endpoint
   (`https://<your-domain>/api/webhooks/resend`, same
   `RESEND_WEBHOOK_SECRET`) must also be subscribed to the
   **`email.received`** event. The handler verifies the Svix signature
   exactly like delivery events; unverified requests are rejected.
4. **`RESEND_API_KEY` is required server-side** — after a verified
   `email.received` event, NxtSend calls
   `GET /emails/receiving/{id}` with it to fetch the message body and
   headers. If that fetch fails, the endpoint answers 502 *without*
   recording the event, so Resend redelivers instead of the mail being
   lost.
5. **Routing rules (by design):** an inbound email joins a conversation
   by threading headers, then by contact + normalized subject, then by
   contact alone; a sender who is a lead gets a new conversation. If
   the sender is unknown, or matches leads/conversations in more than
   one workspace, the event is logged in `email_events` but **not**
   filed anywhere — the system never guesses a tenant.
6. **Verify:** send a test email from an address that belongs to a lead
   to your receiving address; it should appear in Dashboard → Inbox as
   an unread conversation within seconds. LinkedIn conversations remain
   read-only until an authorized LinkedIn provider is connected —
   there is no equivalent inbound path for LinkedIn today.

### Domain authentication & deliverability (SPF / DKIM / DMARC)

Authentication is what lets receiving servers trust that mail from
your domain really came through your provider. It is a prerequisite
for reliable delivery — it is **not** a guarantee of inbox placement,
and nothing in this app will ever claim one: placement also depends
on sender reputation, list quality and engagement history.

**Records to add** (always copy the exact values from the Resend
dashboard for YOUR domain — they are account-specific):

1. **DKIM** — a TXT record at host `resend._domainkey` on your domain
   containing the public key Resend shows (`v=DKIM1; k=rsa; p=...`).
   Publish the full value; a truncated key silently fails.
2. **SPF** — Resend publishes its SPF on the `send` subdomain: a TXT
   record `v=spf1 include:amazonses.com ~all` at host `send`, plus the
   MX record Resend shows there (`feedback-smtp.<region>.amazonses.com`,
   priority 10) for bounce handling. If you also send from the root
   domain with another provider, that provider's SPF lives on the root
   — never publish two `v=spf1` records on the same name; merge them
   into one instead.
3. **DMARC** — a TXT record at host `_dmarc`:
   `v=DMARC1; p=none; rua=mailto:dmarc-reports@yourdomain.com`.
   Start at `p=none` (monitor only), read the aggregate reports for a
   few weeks, then tighten to `p=quarantine` and finally `p=reject`.
   DMARC only "sees" your mail once SPF or DKIM aligns with the
   EMAIL_FROM domain — which is exactly what Resend's records above
   provide.

**Verify in the app:** Integration Center → **Email / Resend** (or
Admin → Integrations → Email) → the **Email authentication** panel →
**Run check**. It performs real public-DNS lookups for the EMAIL_FROM
domain (or any domain you type) and shows the SPF/DKIM/DMARC verdicts
with the actual records found, plus whether the EMAIL_FROM domain is
verified at Resend. The **Test Connection** button now reports the
same provider match: if the EMAIL_FROM domain is unverified or missing
at Resend, the result is a "Configuration Required" warning, because
Resend rejects sends from unverified domains. DNS changes can take a
while to propagate — if a record you just added shows "not found",
wait and re-run rather than adding duplicates.

**Replies and the receiving domain:** the Inbox only receives mail
addressed to a Resend **receiving** domain (see "Receiving replies"
above — it needs its own MX setup). Set `EMAIL_REPLY_TO` to an
address on that receiving domain (step 2 above): every outbound email
then carries it as Reply-To, so replies reliably reach the Inbox
regardless of which domain you send from. While it is unset, replies
go to the `EMAIL_FROM` address — fine only when the From domain is
itself a receiving domain.

**Unsubscribe (built in, P5 Stage C):** every outbound email —
campaign steps and Inbox replies — carries, added at send time by the
adapter (stored templates are never modified):

- a `List-Unsubscribe` header with the one-click HTTPS URL (plus a
  `mailto:` to `EMAIL_REPLY_TO` when set) and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058), and
- a visible unsubscribe line in the footer (text and HTML versions).

The URL is `https://<NEXT_PUBLIC_APP_URL>/api/unsubscribe/<token>`,
where the token is a stateless HMAC-SHA256 signature over the
workspace + recipient — no database lookup, no account needed to
unsubscribe. Signing key resolution: **`UNSUBSCRIBE_SECRET`** when
set; otherwise the key is **derived from `SUPABASE_SERVICE_ROLE_KEY`**
(links keep working, but rotating the service-role key invalidates
older links — set the dedicated secret for a stable key). Fail-safe
by design: in production with **neither** secret available, or with
`NEXT_PUBLIC_APP_URL` unset/localhost, sends omit the URL and the
send result says so — an invalid unsubscribe link is never emitted.
Clicking the link opens a confirmation page (GET never unsubscribes —
mail scanners prefetch links); confirming, or the mail client's
one-click POST, adds the address to the workspace suppression list
with reason `unsubscribed` and stops the lead's active sequence
enrollments. Manage the list at **Dashboard → Email → Suppression
list** (or Integration Center → Email / Resend → "Reply routing &
unsubscribe"): add or remove addresses — removing one re-enables
sending to it, so removal asks for confirmation.

**Bounce/complaint hygiene:** already automatic — the signed Resend
webhook feeds `email_events`, bounces and complaints add the address
to the suppression list, and every send checks suppression first
(fail closed). There is intentionally **no built-in warm-up feature**:
warm-up services that generate artificial engagement manipulate
filters and can damage a domain; if you warm a new domain, use a
reputable provider's own programme and ramp sending volume gradually.

**While composing:** the sequence email editor and the Inbox reply
composer show dismissible "deliverability hints" (ALL-CAPS subjects,
link-heavy text, known URL shorteners, spam-associated phrasing).
They are heuristics only — they never block a send and are not a spam
score. (There is no "missing unsubscribe" hint: the real unsubscribe
footer + headers are appended at send time — see "Unsubscribe" above.)

## 7. Billing (Stripe)

1. In the Stripe Dashboard create **Products + Prices** matching the
   app's plan catalog (`src/lib/billing/plans.ts` — the in-app prices:
   Starter $49/mo, Growth $149/mo, Agency $299/mo; annual prices are
   your decision). Paste each Price ID into the matching
   `STRIPE_PRICE_ID_*` variables.
   ⚠️ Note: the marketing site sells a per-seat model ($49/seat, Agency
   from $499). The two models are not yet reconciled — that is a
   product decision; this guide does not silently change either.
2. Set `STRIPE_SECRET_KEY`.
3. Register the webhook: Stripe dashboard → **Developers → Webhooks** →
   endpoint `https://<your-domain>/api/webhooks/stripe`, events (the
   eight the handler acts on — `STRIPE_HANDLED_EVENT_TYPES` in
   `src/lib/billing/webhook.ts`): `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_failed`,
   `charge.refunded`, `charge.dispute.created`,
   `charge.dispute.closed`. Copy the signing secret →
   `STRIPE_WEBHOOK_SECRET`. (Refunds/disputes are record-only: they
   land in Admin → Billing → Transactions and never mutate a
   subscription. Any other event Stripe sends is recorded as a
   no-action — PRODUCTION.md §9.4. The full ordered test→live swap
   sequence is PRODUCTION.md §9.2.)
4. In **Settings → Billing → Customer portal**, enable the portal
   (payment-method updates, invoices, cancellation).
5. Behaviour to expect:
   - `POST /api/billing/checkout` creates a Checkout session. **Creating
     a session never changes a plan.** Plans change only when a
     signature-verified webhook event arrives.
   - Webhook processing is idempotent: event IDs are recorded in
     `billing_events` before effects apply; redeliveries are no-ops.
   - Until keys exist, checkout/portal refuse with 503 +
     `state: "not_configured"` (or `"demo"`), and no charge of any kind
     is possible.

## 8. Meta Pixel

1. Meta Events Manager → create a Pixel → copy its numeric ID →
   `NEXT_PUBLIC_META_PIXEL_ID`.
2. **Consent behaviour (read carefully):** the app has no cookie-consent
   banner yet. The pixel loader therefore fires **only after** a
   visitor's consent is recorded as `localStorage["nxtsend_cookie_consent"]
   = "accepted"` (a banner can set this and dispatch the
   `nxtsend:consent-granted` window event). Until then — and whenever
   the ID is unset — the loader renders nothing and makes zero network
   calls. The pixel never fires on `/dashboard` or `/admin`.
3. Events: `PageView` (once per route), `CompleteRegistration` (after a
   successful signup). `Lead`, `StartTrial`, `Subscribe` helpers exist
   in `src/components/analytics/MetaPixel.tsx` (`trackPixelEvent`) for
   wiring at real conversion points. No PII is sent.
4. **Verification:** Events Manager → your Pixel → **Test Events**:
   with consent granted in your browser, load the site and confirm
   PageView arrives; complete a signup and confirm
   CompleteRegistration. Use the Meta Pixel Helper extension to check
   for duplicate PageViews (route-change dedupe is built in).

## 9. AI drafting (optional)

Set `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` **or** `MODEL_API_KEY`
(server-only). The campaign sequence editor's **Draft with AI**
button (`POST /api/ai/draft`, login required in live mode) returns a
draft into the editor for mandatory human review — it never sends
anything. With no key, the button shows the honest "AI not configured"
state; in Demo Mode it inserts a clearly labelled local sample (not
AI output). Provider selection order when several keys exist:
**OpenAI → Anthropic → Meta Model API**. `MODEL_API_KEY` is Meta's
Model API key (Bearer) for the OpenAI-compatible inference API at
`api.meta.ai/v1` (Muse Spark models; default model `muse-spark-1.3`,
override with `META_MODEL`). Endpoint details for the Meta API are
documented via secondary sources quoting Meta's developer docs —
Meta's developer portal could not be fetched directly during the
2026-10-19 research — so use the Integration Center's Test Connection
(§14) as the first primary confirmation for your key.

## 10. Outbound webhooks (n8n / Zapier) + background jobs

**Webhooks:** Dashboard → **Integrations → Outbound Webhooks** section:
paste your endpoint (e.g. an n8n Webhook node URL or a Zapier "Catch
Hook" URL), choose events (`lead.created`, `campaign.created`,
`campaign.status_changed`), save. A signing secret is generated
server-side and **shown once** — store it in your receiver.

- Payload: `{ id, type, created_at, workspace_id, data }` as JSON.
- Headers: `X-NxtSend-Event`, `X-NxtSend-Timestamp`, and
  `X-NxtSend-Signature: t=<unix>,v1=<hex>` where `v1` is
  `HMAC-SHA256(secret, "<unix>.<raw body>")` in hex.
- Deliveries are logged (`webhook_deliveries` / the settings section);
  failures retry with backoff (5 min, 30 min, max 3 attempts) via the
  jobs worker. Zapier catch hooks can't verify signatures — treat the
  URL itself as a secret there; n8n can verify via a Code node.

**Jobs:** `vercel.json` registers a daily cron (`0 6 * * *`) against
`/api/jobs/run`. Set `CRON_SECRET` in Vercel — Cron then authenticates
automatically with a Bearer header. Job types: `usage_rollup` (real —
monthly per-workspace usage into `usage_records`, over-limit metrics
flagged in the run log), `webhook_retry` (real — retries due failed
deliveries), `follow_up_due` (**real since Round-2 Stage F** — the
sequence executor in `src/lib/executor` advances due enrollments:
email steps are sent through the Resend adapter with suppression
checks and plan-limit enforcement, LinkedIn steps are recorded as
skipped because no authorized provider exists, and enrollments stop
on reply/bounce/unsubscribe; see migration 010 and PRODUCTION.md §5).
Activating a campaign enqueues the workspace's daily scan via
`POST /api/jobs/enqueue`; in Demo Mode the same engine runs in-app
from the campaign page ("Run due steps now").

⚠️ **Vercel plan limits:** on the **Hobby** plan, Cron Jobs are limited
in count and frequency (daily is the safe setting, as shipped). More
frequent schedules (e.g. hourly `0 * * * *`) require a **Pro** plan —
edit `vercel.json` only if your plan allows it, or the deployment will
reject the cron. Job rows are enqueued by server code/SQL (there is no
producer UI yet); an empty queue is a normal state.

## 11. What is intentionally NOT live yet

- **LinkedIn automation:** no authorized provider is integrated.
  LinkedIn's official API does not support this automation class, and
  this project does not implement credential-based or evasion
  techniques. Connection/messaging stays in Demo Mode until an
  authorized provider is contracted and its adapter replaces the stub.
- **Muse.ai:** deep-researched 2026-10-19 — see §14 and the appendix.
  muse.ai is Meta's Muse agent; there is **no public API for driving
  the agent**, so there is nothing to "connect". The supported path is
  the Muse Connector Platform (NxtSend hosts an API/MCP surface and
  submits it for Meta's review) — the Integration Center's Muse.ai
  page carries the pre-classified tool manifest and the readiness
  checklist. **Not implemented, and not fakeable.**
- **Sequence execution:** IMPLEMENTED for email (this bullet replaces
  an older, stale note). The executor (migration 010) claims due
  steps with at-most-once semantics and really sends **email** steps
  through the Resend adapter — or, since P5 Stage G, through the
  campaign's selected Gmail / Outlook mailbox when one is
  OAuth-connected (§15) — suppression check first (fail closed),
  plan limits enforced, and stop rules honoured (a reply, bounce,
  complaint or unsubscribe stops the contact's sequence). **LinkedIn
  steps are recorded as `skipped`** with an explicit reason, because
  no authorized LinkedIn provider is integrated (see the first
  bullet). "If connected" condition branches are stored in the step
  configuration but are **not evaluated** by the executor yet — a
  condition step is recorded as elapsed with that stated in its
  detail. Nothing about LinkedIn delivery is simulated or claimed.

## 12. Deploy to Vercel

> The step-by-step deployment runbook (project settings, the full
> env table with build-vs-runtime split, webhook registrations,
> cron notes, custom domain, go-live smoke checklist, rollback) is
> **PRODUCTION.md** at the app root. See especially **PRODUCTION.md
> §9** for the Production-vs-Preview-vs-Development variable
> strategy (never live Stripe keys or the production Supabase in
> Preview) and the ordered Stripe test→live swap checklist. The
> short version:

1. Push the repo to GitHub (the project's established flow).
2. Vercel → **Add New Project** → import the repo. Framework preset:
   **Next.js**. Root directory: the app folder (repo root if the app is
   at the root).
3. Add all env vars from §4 (Production environment).
4. Deploy. Vercel redeploys automatically on every push to the
   connected branch. `vercel.json` at the app root registers the cron.

## 13. First-live-verification checklist

Run through this once, in order, after §§1–7 (from the Stage 2a/2b
verification plans — do not skip the negative tests):

**Auth & RLS**
- [ ] Sign up with email confirmation ON → no workspace yet; verify
      email; sign in → workspace auto-created.
- [ ] As a normal user, from the browser console:
      `supabase.from('profiles').update({role:'super_admin'})` on your
      own row → **must fail**.
- [ ] As a normal user: insert into `audit_logs` → **must fail**;
      read another workspace's rows → **must return nothing**.
- [ ] As a plain workspace member: read `integrations.config` of your
      workspace → **must fail**; the `integrations_status` view still
      shows provider/status.
- [ ] Suspend a user from the admin panel → they are signed out at next
      login with a suspension message; admin API rejects their calls.
- [ ] Log out → you stay logged out (no bounce back to /dashboard).

**Email**
- [ ] Send a test email via the provider → Resend dashboard shows it;
      `messages` row has the Resend ID; delivery webhook flips it to
      `delivered`.
- [ ] Add your address to the suppression list → send → refused as
      `suppressed`.
- [ ] Trigger a bounce (invalid recipient) → webhook adds the address
      to the suppression list automatically.

**Billing (use Stripe test mode first)**
- [ ] Checkout with card `4242 4242 4242 4242` → plan updates **only
      after** the webhook fires; `billing_events` contains the event.
- [ ] Redeliver the same webhook event from the Stripe dashboard →
      no duplicate effect (response says `duplicate: true`).
- [ ] Cancel via the customer portal → subscription shows `canceled`
      after `customer.subscription.deleted`.

**Webhooks & jobs**
- [ ] Save a webhook URL (use a request-bin first) → import a lead →
      signed delivery arrives; verify the HMAC manually.
- [ ] `curl -X POST https://<domain>/api/jobs/run -H "x-cron-secret: <CRON_SECRET>"`
      → 200 summary. Without the header → 401. Unset the secret →
      503.
- [ ] Enqueue a `usage_rollup` job (SQL insert into `jobs` with a
      unique `idempotency_key`) → run the worker → `usage_records`
      populated; run again → no double execution.

---

## 14. Integration Center

**Dashboard → Integrations** is the Integration Center: a hub listing
every integration with its live status, and a detail page per
integration (setup steps, required env vars with presence indicators,
webhook registration, troubleshooting, and **Test Connection**).

Data sources (all server-side; the browser never sees a secret value,
only presence booleans):

- `GET /api/integrations/status` — registry + derived statuses.
  Session required in live mode; demo mode returns the demo states.
- `POST /api/integrations/[id]/verify` — Test Connection. Live mode
  requires a workspace **owner/admin**. Performs ONE safe read-only
  verification call; real attempts are recorded on the workspace's
  `integrations` row (migration 006) so the result survives reloads.
- `GET /api/oauth/connections` — mailbox OAuth **metadata only**
  (provider, mailbox address, grant status, token expiry, scopes;
  never token fields), plus per-provider configuration booleans.
  `POST /api/oauth/connections/disconnect` disconnects (owner/admin
  in live mode). `GET /api/oauth/google|microsoft/connect` +
  `/callback` run the OAuth flows themselves (§15).

**Status vocabulary (exact):** `Connected and Verified` ·
`Connected but Not Verified` · `Configuration Required` ·
`Not Connected` · `Demo Mode` · `Error` ·
`Unsupported / No Documented API`. **A status claims "Verified" only
from an actual successful verification call** (this session, or the
stored last-verification success) — key presence alone maps to
"Connected but Not Verified", and a stored verification stops applying
the moment its configuration is removed.

| Integration | Env vars | Verification procedure | Webhook to register |
|---|---|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Test Connection calls `GET <project>/auth/v1/health` with the anon key | — |
| Resend | `RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET` | Test Connection lists domains via the Resend SDK (read-only) | `https://<your-domain>/api/webhooks/resend` — delivery events (+ `email.received` for inbox replies, §6) |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_ID_*` | Test Connection retrieves the Stripe account (read-only) | `https://<your-domain>/api/webhooks/stripe` — `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed` (§7) |
| OpenAI | `OPENAI_API_KEY`, `OPENAI_MODEL` | Test Connection: `GET https://api.openai.com/v1/models` | — |
| Anthropic | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Test Connection: `GET https://api.anthropic.com/v1/models` | — |
| Meta Model API | `MODEL_API_KEY`, `META_MODEL` | Test Connection: `GET https://api.meta.ai/v1/models` (Bearer) — endpoint details are **secondary-sourced** (§9); a success here is the first primary confirmation | — |
| Meta Pixel | `NEXT_PUBLIC_META_PIXEL_ID` | **No server verification exists.** Verify in Meta Events Manager → Test Events with consent granted (§8) — the detail page says exactly this instead of pretending | — |
| Outbound Webhooks | none (subscription is per-workspace, in the app) | Test Connection dispatches a signed `nxtsend.test` event through the delivery pipeline (Demo Mode: simulated, logged, never actually sent) | Your receiver URL (n8n Webhook node / Zapier Catch Hook), configured in the hub's Webhooks section (§10) |
| Background Jobs | `CRON_SECRET` | No remote check — smoke-test `POST /api/jobs/run` with `Authorization: Bearer <CRON_SECRET>` (§10) | — |
| LinkedIn | `LINKEDIN_CLIENT_ID/SECRET/REDIRECT_URI` (reserved, inert) | Nothing to verify: no authorized provider is integrated; LinkedIn stays in Demo Mode (§11) | — |
| Gmail | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` | Test Connection re-fetches the Google userinfo + Gmail profile with the stored grant (refreshing the access token when needed) and confirms it still describes the connected mailbox (§15). "Connected and Verified" comes from the stored grant — created only by a completed OAuth exchange + profile fetch; env presence alone is never a connection | Redirect URI (not a webhook): `<NEXT_PUBLIC_APP_URL>/api/oauth/google/callback` registered in Google Cloud Console (§15.2) |
| Outlook (Microsoft 365) | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` | Test Connection re-fetches Graph `/me` with the stored grant (refreshing when needed) and confirms the connected mailbox (§15) | Redirect URI (not a webhook): `<NEXT_PUBLIC_APP_URL>/api/oauth/microsoft/callback` registered in Azure (§15.3) |
| Muse.ai | none | Nothing to verify: **no documented public API exists for the Muse agent** — see below | — |
| Google Sheets / CRM / Email verification | none | Not implemented yet — the detail pages state what implementation requires | — |

**Muse.ai (Meta Muse) — the full picture.** muse.ai today is Meta
Platforms' personal AI agent (the legacy muse.ai video platform
rebranded to **Skiv** in March 2026). Researched 2026-10-19 against
Meta's official pages: there is **no public API for driving a user's
Muse agent, no connector webhooks, and no connector SDK**. Two real
paths exist:

1. **Muse Connector Platform** (`muse.ai/platform`, guidelines at
   `muse.ai/platform/docs`) — the direction is inverted: NxtSend
   exposes its own API or hosted MCP server, submits it, and passes
   Meta's functional/security/legal review + end-to-end QA to appear
   in Muse's connector directory. Auth = API key or OAuth (PKCE)
   issued by NxtSend. No fee/revenue share/timeline is published; no
   paid Muse plan is required to submit. The Muse.ai detail page in
   the Integration Center renders the **pre-classified tool manifest**
   (Read / Write / Sensitive write, per the guidelines) and the
   **submission readiness checklist** (live surface, business
   verification, data-processing questionnaire, credentials + tool
   docs, test account, 3-stage review, terms obligations). Fallback
   available today: publish a public API/OpenAPI spec or hosted MCP
   server and Muse users can add NxtSend as a **Custom Connector**
   without directory approval.
2. **Meta Model API** — a normal inference API for Muse Spark models
   (see the Meta Model API integration + §9). It does not expose the
   agent, its memory, or its connectors.

**What to obtain from Muse.ai / Meta:** for path 1, nothing is
"obtained" from Meta in advance — you build the surface, create the
submission with a work email, complete business verification and the
data-processing questionnaire, provide integration credentials + a
test account, and pass review. **Files that change when the surface
is built/approved:** `src/lib/muse-connector/adapter.ts` (the hosted
handler), `src/lib/muse-connector/manifest.ts` (final tool JSON
Schemas), the `muse-ai` entry's status source in
`src/lib/integrations-center/`, and this section. No env var exists
for Muse.ai today, deliberately — inventing one would imply a
credential Meta never issues to us.

**Troubleshooting (Center-wide):**

- Everything shows Demo Mode → Supabase env vars are missing or still
  placeholders; the whole app is in demo mode (§1–§4).
- "Configuration Required" → exactly part of a required set is set;
  the detail page's env checklist shows which variable is missing.
- Verification returns 401/403 from a provider → the key is invalid,
  revoked, or scoped to another operation; rotate it at the provider
  and update Vercel.
- A previously-verified integration drops back after redeploy → its
  env configuration changed/removed; stored verifications only apply
  while the configuration they verified is still present.
- Verify returns 403 in the app → the caller is a workspace member,
  not an owner/admin; verification is admin-gated in live mode.

## 15. Mailbox OAuth — Gmail & Outlook (Microsoft 365)

Workspaces can connect a real Gmail / Google Workspace or Outlook /
Microsoft 365 mailbox by OAuth and send campaign email + inbox
replies **from that mailbox**. This is real authorization-code OAuth
against Google / the Microsoft identity platform — NxtSend never
asks for a mailbox password or an app password, and no "Connected"
state exists until the provider consent, code exchange and profile
fetch have ALL succeeded.

How it behaves once connected:

- The mailbox appears as an email account in **Connected Accounts**
  and in the Integration Center (**Gmail** / **Outlook (Microsoft
  365)**) with its recorded health (`ok` / `needs_reconnect` / …).
- A campaign whose **email account** is that mailbox sends its email
  steps through the mailbox (Gmail API / Microsoft Graph), From =
  the mailbox address. Inbox replies route the same way when the
  conversation's campaign used the mailbox (or when it is the
  workspace's only OAuth mailbox). Resend remains the default for
  every other campaign.
- A selected mailbox that is disconnected / expired /
  `needs_reconnect` makes the send **fail honestly** — the executor
  never silently falls back to Resend, because that would change
  the From identity the campaign selected.
- Suppression checks and the Stage-C unsubscribe headers + footer
  apply to mailbox sends exactly as they do to Resend sends.
- Access tokens refresh automatically; a failed refresh marks the
  mailbox `needs_reconnect` and sends stop until it is reconnected.
- Tokens are stored **AES-256-GCM encrypted** (migration 014,
  service-role-only table). No API route or UI ever returns token
  material — only metadata (mailbox address, status, token expiry).
- Disconnect deletes the stored tokens and marks the account
  disconnected. For Gmail it also revokes the grant at Google (best
  effort, reported in the result). **Microsoft provides no
  revocation endpoint** for this flow — also remove the app's
  consent in the Microsoft account if you want the grant gone there.
- Note on Microsoft message IDs: Graph's `POST /me/sendMail` returns
  202 with **no** message id, and NxtSend records `sent` only with a
  provider id — so the adapter creates the message first
  (`POST /me/messages`, which returns the provider-assigned id) and
  then sends it (`POST /me/messages/{id}/send`). The recorded id is
  always the real provider-assigned one; nothing is invented.

Demo Mode: mailbox connection is **disabled** — the panels explain
what live setup is required. Nothing can be connected or faked in
Demo Mode.

### 15.1 Generate the token encryption key

```bash
openssl rand -base64 32
```

Set the output as `TOKEN_ENCRYPTION_KEY` (Vercel → Project →
Settings → Environment Variables, server-side). It must decode to
exactly 32 bytes; a missing/malformed key makes mailbox connection
fail closed with a configuration error. **Rotating the key
invalidates all stored grants** (they can no longer be decrypted) —
every connected mailbox must reconnect afterwards.

### 15.2 Google Cloud Console — Gmail OAuth app

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
   → create (or pick) a project for NxtSend.
2. **APIs & Services → Library** → enable the **Gmail API**.
3. **APIs & Services → OAuth consent screen**: user type
   **External**; fill in the app name (NxtSend), support email and
   developer contact. Add the scopes NxtSend requests:
   `openid`, `email`, `profile`,
   `https://www.googleapis.com/auth/gmail.send`,
   `https://www.googleapis.com/auth/gmail.readonly`.
   While the app is in **Testing** publishing status, add every
   mailbox owner as a **test user** (grants for test users expire
   after 7 days — publish the app, completing Google's verification
   for the restricted Gmail scopes, for durable production use).
4. **APIs & Services → Credentials → Create credentials → OAuth
   client ID** → application type **Web application**. Under
   **Authorized redirect URIs** add EXACTLY:

   ```
   <NEXT_PUBLIC_APP_URL>/api/oauth/google/callback
   ```

   e.g. `https://nxtsend-seven.vercel.app/api/oauth/google/callback`
   for the current deployment — it must match the deployed
   `NEXT_PUBLIC_APP_URL` character for character (a mismatch is the
   `redirect_uri_mismatch` error).
5. Copy the **Client ID** → `GOOGLE_CLIENT_ID` and the **Client
   secret** → `GOOGLE_CLIENT_SECRET` in Vercel.

### 15.3 Azure — Outlook / Microsoft 365 app registration

1. Go to [portal.azure.com](https://portal.azure.com) → **Microsoft
   Entra ID → App registrations → New registration**. Name it
   NxtSend; supported account types: **Accounts in any
   organizational directory and personal Microsoft accounts** (this
   matches the `common` tenant the flow uses).
2. **Redirect URI**: platform **Web**, value EXACTLY:

   ```
   <NEXT_PUBLIC_APP_URL>/api/oauth/microsoft/callback
   ```
3. **API permissions → Add a permission → Microsoft Graph →
   Delegated permissions**: `User.Read`, `Mail.Send`, `Mail.Read`,
   `offline_access` (plus `openid` / `profile` / `email`, added by
   the flow itself). Organizational tenants may require admin
   consent for these.
4. **Certificates & secrets → New client secret** — copy the secret
   **Value** (shown once) → `MICROSOFT_CLIENT_SECRET`; the
   **Application (client) ID** from the Overview page →
   `MICROSOFT_CLIENT_ID` in Vercel.

### 15.4 Vercel env checklist (mailbox OAuth)

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
TOKEN_ENCRYPTION_KEY=<output of openssl rand -base64 32>
NEXT_PUBLIC_APP_URL=https://<your deployed origin>   (already set for billing)
```

Redeploy after setting them, open **Dashboard → Integrations →
Gmail** (or **Outlook (Microsoft 365)**), and use **Connect** in the
Connected mailbox panel. You consent on the provider's own screen;
on success you land back on Connected Accounts with a confirmation
notice, and the mailbox is selectable as a campaign's email
account. Use **Test Connection** any time to re-validate the stored
grant against the provider.

## 16. Integration Hub (BRR) — credential vault

The Integration Hub (admin → Integrations → **Integration Hub**,
`/admin/integration-hub`) is the operator's
record for an external integration: its workflow status, documentation,
submission/compliance checklists, reviewer test accounts, and the
credentials needed to configure it. Its data lives in the six `hub_*`
tables (migration **016**, applied in order after 015 — see the §2
table). All six tables are service-role-only (RLS on, zero client
policies); every Hub API route sits behind the admin gate.

### 16.1 The vault key

Credential values are stored ONLY as AES-256-GCM ciphertext
(`hub_credentials.value_enc`), encrypted with a key that is dedicated
to the Hub — it is NOT the mailbox OAuth key:

```bash
openssl rand -base64 32
```

Set the output as `INTEGRATION_HUB_ENCRYPTION_KEY` (server-only; never
`NEXT_PUBLIC_`). Rules that follow from the design:

- **Losing or rotating this key means re-entering every Hub
  credential.** Stored values become undecryptable; there is no
  recovery and no dual-key decrypt. Back the key up wherever you keep
  the other production secrets.
- While the key is unset or malformed, credential create / reveal /
  copy refuse with **503 (fail closed)**. Integration records,
  checklists, documents and test accounts keep working.
- Values are never returned by list/get endpoints (metadata + last 4
  characters only), never written to the audit log, and never included
  in a Copy Integration Package unless an admin explicitly lists that
  credential for export.
- Reveal and copy are **strict-audited**: the `HUB_CREDENTIAL_REVEAL` /
  `HUB_CREDENTIAL_COPY` audit row is written BEFORE the value is
  decrypted; if the audit write fails, the request fails and no value
  is returned. Test-account passwords are vault credentials too (kind
  `test_account_password`) — a test-account record only references
  one, it never holds a password.
- An integration's status can be set to `approved` / `live` only via
  an explicit confirmed status change — never as a side effect of
  saving configuration or credentials.

### 16.2 Demo Mode behaviour

In Demo Mode the Hub is explorable with labelled fixtures, but the
vault is inert by design:

- Credential rows are **metadata-only shells** (no value, no last-4).
- Credential **create / update / delete are disabled** (503), and
  reveal / copy return nothing ("demo mode — nothing stored"). There
  is no write path for a demo secret, so a value typed in Demo Mode
  can never come back later as if it had been saved.
- Demo copy packages carry a `DEMO — NOT REAL CREDENTIALS` banner and
  never include values.
- `INTEGRATION_HUB_ENCRYPTION_KEY` is not required in Demo Mode.

### 16.3 What you must enter manually

The Hub ships with documentation, checklists and **empty credential
shells only** — no real values are seeded, and none can be generated
for you. After go-live (Supabase connected + migration 016 applied +
`INTEGRATION_HUB_ENCRYPTION_KEY` set), enter these yourself in
**admin → Integration Hub → the record → Credentials**:

1. **Muse OAuth Client ID + Client Secret** (record: *BRR Muse
   Connector*, environment `production`) — from the BRR OAuth app
   "BizReviewRadar Muse Connector". The secret was issued once by
   BRR; if it is lost, rotate it in BRR — it cannot be recovered from
   the Hub.
2. **BRR test API key** (`brr_test_…`, record: *BRR REST API*,
   environment `test`). Note: `brr_live_` keys are currently REFUSED
   by BRR's API auth layer (demo phase) — a stored live key will not
   authenticate until BRR enables live keys.
3. **Zapier API key** (record: *BRR Zapier*, environment `test`) —
   the BRR Zapier app is private/invite-only and uses the BRR test
   key for auth.
4. **BRR webhook signing secret** (record: *BRR Webhooks*,
   environment `production`) — from the BRR webhook endpoint
   configuration.
5. **Confirm the redirect URI on the Meta side**: the Hub records
   `https://agent.meta.ai/api/hatch/oauth/callback` as
   *recorded, unverified* (it appears nowhere in the BRR repo). Verify
   it against the current Meta Credentials Integration setup and
   update the record's verification status only from what Meta's
   interface actually shows.
6. **Reviewer/test account**: create the dedicated BRR reviewer
   account yourself and confirm it carries the `api_demo`
   entitlement — without that entitlement the reviewer cannot use the
   API/Muse surfaces. Then record the account under the Muse
   record's Test accounts (its password, if stored, goes in the vault
   as a `test_account_password` credential — never in the account
   record itself).

Nothing on the BRR side is changed by the Hub: BRR's production flags
(`muse_mcp_enabled`, `oauth_authcode_enabled`, plus the
`MUSE_CONNECTOR_PUBLIC_ORIGIN` env) stay exactly as they are until
you change them in BRR under separate authorisation.

## 17. Support Chat (website assistant + live support)

The support chat is the floating **NxtSend Support** widget on the
marketing site (visitor UI is P10 Stage F; this section covers the
backend that ships in Stage E) plus the Admin → Support surfaces
(inbox, knowledge base, saved replies, chat settings). It is a
separate system from both the workspace Inbox (prospect
conversations, migration 005) and Admin → Submissions (one-way form
enquiries).

### 17.1 Tables & activation

Migration **019** creates eight tables — `support_conversations`,
`support_messages`, `support_knowledge_categories`,
`support_knowledge`, `support_saved_replies`, `support_settings`,
`support_agents`, `support_conversation_events` — all with **RLS
enabled and zero client policies**. Every read and write runs
through the service role from gated API routes; nothing is reachable
by direct PostgREST access. Activation at go-live is simply part of
the normal migration sequence: apply 019 in order after 018 (§2).
There is **no SQL seed**: on first use the app layer idempotently
seeds the settings singleton, 8 knowledge categories, 30 knowledge
entries (each traced to real site content — support guides,
/developers, `marketing-prices.ts`, /contact, legal pages) and 6
saved replies, using `ON CONFLICT (slug) DO NOTHING` semantics so
re-runs and restarts never overwrite admin edits.

Until a Supabase project exists, the same APIs run against the
labelled in-process demo store (Demo Mode), with the same content as
fixtures plus a few clearly-labelled demo conversations.

### 17.2 Who can do what

- **Visitors (guests)** — see §17.4 for the token model.
- **Registered users** — authorised by their session; the thread is
  bound to their profile. Suspended users cannot post.
- **Support agents ("Sub-Admins")** — an `admin` profile ALSO needs
  an **enabled row in `support_agents`**. An admin login alone does
  not grant customer-chat access. Enabled agents can work the inbox,
  reply, claim unassigned conversations, and manage the knowledge
  base and saved replies.
- **Super admin** — everything, plus the only role that can change
  **Chat Settings** and assign conversations to *other* agents.
  Agents claim unassigned conversations for themselves; replying to
  an unassigned conversation claims it automatically (event-logged).
- Admin mutations are mirrored into `audit_logs` (`SUPPORT_*`
  actions) and appended to the per-conversation event timeline.

### 17.3 Settings semantics (Admin → Support → Chat Settings)

Every field of the `support_settings` singleton drives real
behaviour — there are no decorative toggles:

| Setting | Effect when changed |
|---|---|
| `ai_kb_enabled` | Off → the assistant never answers from the knowledge base; visitors get the fallback copy + escalation path |
| `ai_enhancement_enabled` | Off (default) → answers are purely deterministic KB matches. On → a grounded AI layer may rephrase/select among the top KB candidates when the matcher is unsure. Requires a configured AI provider (below); the guard rejects any completion that invents a price, URL or policy claim not present in the KB sources |
| `live_support_enabled` | Off → escalation is blocked and the widget shows the offline/contact path |
| `allow_user_escalation` | Off → visitors cannot request a human; the fallback copy points at `support_email` |
| `display_name`, `greeting`, `welcome_message`, `offline_message`, `closing_message` | The exact copy visitors see (assistant name, first message, no-agent-available text, message appended when a conversation is resolved) |
| `support_email` | The public fallback address shown by the widget (default `hello@nxtsend.com`) |

Matching bands (deterministic, test-pinned): score **≥ 75** answers
directly; **55–74** answers only when there is a clear leader
(margin ≥ 10 over the runner-up, or the runner-up scores < 40);
below that the visitor gets the fallback message and an escalation
offer. Questions about the asker's *own* account ("my invoice",
"my campaign"…) are never answered from the KB or the AI layer —
the assistant has no account-data tools and points to the dashboard
or a person instead.

The optional AI layer uses the **existing** AI provider keys
(`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`, §9) — no new variables. It
never runs in Demo Mode, never runs when no key is configured, and
nothing labels the widget "AI-powered" unless it is genuinely
configured; the public config endpoint reports
`ai_enhancement: "configured" | "not_configured"` truthfully. Note
for the Privacy Policy: enabling the enhancement sends the visitor's
question + KB snippets to the provider (never names, emails or
account data).

### 17.4 Guest-token security model

Guests have no Supabase identity, so a guest conversation is
authorised by a bearer token instead:

- On creation the server generates a 256-bit random token, stores
  **only its SHA-256 hash** on the conversation row, and returns the
  raw token exactly once — as an **HttpOnly cookie scoped to
  `/api/support`** (`SameSite=Lax`, `Secure` in production, 30-day
  expiry, also stored as `guest_token_expires_at`).
- The raw token never appears in a response body, a URL, a log line
  or analytics. **A conversation ID alone never authorises** — every
  visitor read/write re-checks the cookie hash (or session
  ownership); unknown and unauthorised conversations are
  indistinguishable (404).
- There is **no silent merge** of a guest thread into a user account
  by email: a typed guest email is display data, not identity proof.
  Known limitation (by design for v1): a guest who loses the cookie
  (new browser, cleared cookies) cannot recover the thread — the
  escalation flow therefore encourages leaving an email address.

### 17.5 Transport — honest description

The widget and the admin inbox use **short-interval API polling**
behind a transport interface, reconciled by the monotonic
`support_messages.sequence_no`: near-real-time (visitor replies
appear within one poll interval), but **not WebSocket and not
Supabase Realtime**. Guests cannot be authorised for Realtime
(they have no Supabase identity and this app issues no custom
Realtime JWTs), and conversation IDs must never become bearer
secrets for a public channel. **Optional phase 2:** enable Supabase
Realtime for the *admin inbox only* (narrow admin SELECT policies +
publication entries for `support_conversations`/`support_messages`,
with the polling path as fallback). Presence and typing indicators
are not implemented — the only availability signal is an agent's
**declared** availability toggle in `support_agents`, and the
widget claims "live support available" only when live support is
enabled **and** at least one eligible agent has declared
`available`.

### 17.6 Content & privacy rules

- All bodies are **plain text** end to end (validated, length-capped,
  control characters stripped; nothing is stored or rendered as
  HTML). Internal agent notes are a separate message kind and are
  **never** included in visitor-side responses.
- Send retries are safe: a client-supplied `client_message_id` is
  idempotent per conversation (partial-unique index).
- Logs record IDs, statuses and scores — never message bodies, guest
  tokens or provider payloads.
- Retention: no period is invented here. Set one with legal before
  live launch; `pii_redacted_at` + `ON DELETE SET NULL` foreign keys
  provide the future redaction path.

## Appendix — Muse.ai research note (2026-10-18)

> Superseded in detail by the deep research of 2026-10-19 and by §14
> above (the short version: muse.ai is Meta's Muse agent; the Meta
> Model API *does* exist and is now integrated as an AI provider; the
> agent itself has no API — the Connector Platform is the path). Kept
> for the record.

The brief asked for a Muse.ai integration "only using documented
interfaces that are genuinely available". Research findings:

- No product called Muse.ai with a documented public API **for
  integrating a third-party SaaS** (the capability the brief describes)
  could be verified. Search results conflate several unrelated
  products named "Muse" (including Meta's consumer AI agent at
  muse.ai and its separate *Meta Model API* for LLM inference at
  `api.meta.ai`, which is an inference API for Meta's own models — not
  an integration surface for this platform, and not verified from
  first-party documentation in this environment).
- **Decision: no documented public API — not implemented.** No adapter,
  no env var, and no UI was created for it, rather than inventing one.
  If the owner can point to the specific Muse.ai product and its
  official API documentation, the adapter pattern in `src/lib/ai/` /
  `src/lib/email/` can be followed to add it safely.
