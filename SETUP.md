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

Do not skip or reorder — later migrations depend on earlier helpers
(`is_workspace_member`, `is_workspace_admin`).

## 3. Configure authentication

In Supabase **Authentication → URL Configuration**:

- **Site URL**: your production URL (e.g. `https://nxtsend-seven.vercel.app`,
  later your custom domain).
- **Redirect URLs**: add `https://<your-domain>/reset-password` and the
  local dev equivalent `http://localhost:3000/reset-password`.

In **Authentication → Providers → Email**: decide whether "Confirm
email" is on. The app handles both (with confirmation on, the workspace
is created at first sign-in instead of at signup).

## 4. Environment variables — full table

Copy `.env.example` to `.env.local` for local development; in
production set the same variables in **Vercel → Project → Settings →
Environment Variables**. Placeholders from `.env.example` are detected
and treated as *not configured*.

| Variable | Required | Used for |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Yes | Absolute base URL for links/redirects (checkout success/cancel, password reset) |
| `NODE_ENV` | — | `production` in production |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes (live mode) | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes (live mode) | Supabase anon key (public, RLS-protected) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (live mode) | ⚠️ Server-only. Admin API, webhooks, jobs, billing — bypasses RLS |
| `ADMIN_BOOTSTRAP_SECRET` | One-time only | Promoting the first super admin (§5). **Remove after use** |
| `RESEND_API_KEY` | For email | Resend sending key (server-only) |
| `EMAIL_FROM` | For email | Verified sender, e.g. `NxtSend <hello@yourdomain.com>` |
| `RESEND_WEBHOOK_SECRET` | For email events | Svix signing secret for `/api/webhooks/resend`; while unset the route rejects events with 503 |
| `STRIPE_SECRET_KEY` | For billing | Stripe secret key (server-only) |
| `STRIPE_WEBHOOK_SECRET` | For billing | Signing secret for `/api/webhooks/stripe`; while unset the route rejects events with 503 |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Optional | Stripe publishable key (public; reserved for future client-side Stripe.js use) |
| `STRIPE_PRICE_ID_STARTER` / `_ANNUAL` | For checkout | Stripe Price IDs per plan (§7) |
| `STRIPE_PRICE_ID_GROWTH` / `_ANNUAL` | For checkout | " |
| `STRIPE_PRICE_ID_AGENCY` / `_ANNUAL` | For checkout | " |
| `NEXT_PUBLIC_META_PIXEL_ID` | Optional | Meta Pixel ID (public identifier, not a secret) — §8 |
| `OPENAI_API_KEY` | Optional | AI drafting via OpenAI (server-only) |
| `OPENAI_MODEL` | Optional | Override (default `gpt-4o-mini`) |
| `ANTHROPIC_API_KEY` | Optional | AI drafting via Claude (server-only) |
| `ANTHROPIC_MODEL` | Optional | Override (default `claude-sonnet-4-5`) |
| `MODEL_API_KEY` | Optional | AI drafting via Meta Model API / Muse Spark (server-only) — §9, §14 |
| `META_MODEL` | Optional | Override (default `muse-spark-1.3`) |
| `CRON_SECRET` | For jobs | Protects `/api/jobs/run`; while unset the worker refuses (503). Generate: `openssl rand -hex 32` |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` / `LINKEDIN_REDIRECT_URI` | — | Reserved. **No authorized LinkedIn provider is integrated yet** — LinkedIn actions stay in Demo Mode regardless (see §11) |

## 5. Create the first Super Admin (bootstrap)

1. Set `ADMIN_BOOTSTRAP_SECRET` to a long random value in the
   environment (local `.env.local` or Vercel), and restart/redeploy.
2. Sign up in the app with the email that should become super admin.
3. Promote it:
   ```bash
   curl -X POST https://<your-domain>/api/admin/bootstrap \
     -H "Content-Type: application/json" \
     -d '{"secret": "<ADMIN_BOOTSTRAP_SECRET>", "email": "<the-signup-email>"}'
   ```
   The route is rate-limited (5 attempts / 10 min / IP), compares the
   secret in constant time, and writes an audit-log entry.
4. **Remove `ADMIN_BOOTSTRAP_SECRET` from the environment** and
   redeploy. The endpoint stays armed while the variable exists.
5. Verify: sign in and open `/admin` — it should load (in Demo Mode
   `/admin` redirects away by design; a super admin only exists in live
   mode).

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
2. **Make replies land on the receiving domain.** Point the
   reply-to of your campaigns (or the sending address itself) at an
   address on the receiving domain. Replies addressed to a
   sending-only domain never reach Resend.
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
   endpoint `https://<your-domain>/api/webhooks/stripe`, events:
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.payment_failed`. Copy the signing secret →
   `STRIPE_WEBHOOK_SECRET`.
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
- **Sequence execution** (actually sending LinkedIn/email steps):
  persistence, lifecycle and activity logs are real; execution arrives
  with the providers above.

## 12. Deploy to Vercel

> The step-by-step deployment runbook (project settings, the full
> env table with build-vs-runtime split, webhook registrations,
> cron notes, custom domain, go-live smoke checklist, rollback) is
> **PRODUCTION.md** at the app root. The short version:

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
