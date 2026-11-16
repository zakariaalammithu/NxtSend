# NxtSend Zapier App

Zapier Platform CLI app for **NxtSend** — leads, campaigns, inbox
conversations and usage, via the NxtSend Zapier REST API. Plain
JavaScript (no TypeScript build step): the Zapier CLI validates and
runs `index.js` directly.

- **Package:** `nxtsend-zapier` 1.0.0 (separate from the root Next.js
  app — it must not break the root build)
- **Platform core:** `zapier-platform-core` **18.6.0** (latest 18.x
  per `npm view zapier-platform-core version`; never 18.0.2/18.0.3/
  18.0.4). Node ≥ 20 locally; Zapier runs it on Node 22 Lambda.
- **Auth:** OAuth2 authorization-code against NxtSend's shared
  OAuth server (`/api/muse/oauth/*`), scopes `zapier.read`
  + `zapier.write`. No PKCE (the Zapier client is confidential —
  see `authentication.js`).

## API contract

Base URL: `ZAPIER_APP_BASE_URL` (set in the Zapier developer
dashboard) or `https://nxtsend.com`. All paths under
`/api/integrations/zapier/v1/`, bearer token, `{error}` JSON on
failure, demo mode → 503, rate limit 120 req/min per token.
The server side is implemented in
`src/lib/integrations/zapier/api.ts` (routes under
`src/app/api/integrations/zapier/v1/*`, documented in
`docs/zapier-integration/ZAPIER_SERVER.md`) — this client was
verified against that implementation, not just the written
contract. Where the two differed, the implementation wins and
is noted below.

Field naming follows the server's records exactly: leads,
campaigns, conversations, messages and accounts are
**snake_case** (`first_name`, `job_title`, `linkedin_url`,
`contact_name`, `display_name`, `handle_or_email`); campaign
`type` is `linkedin` | `email` | `mixed` (not `channel`). Lists
return envelopes (`{leads, count}`, `{campaigns, count}`, …),
never bare arrays. Webhook `data` payloads mix conventions —
see each instant trigger.

## Triggers

### Polling (Zapier checks on your plan's interval — minutes, not instant)

| Trigger | Endpoint | Dedupe |
| --- | --- | --- |
| New Lead | `GET /v1/leads` | stable lead `id` |
| Lead Updated | `GET /v1/leads?order=updated_at_desc` | `<leadId>__<updated_at>` (original id in `lead_id`) |
| New Campaign | `GET /v1/campaigns` | stable campaign `id` |
| Campaign Status Changed | `GET /v1/campaigns` | `<campaignId>__<status>` (original id in `campaign_id`) |
| New Conversation | `GET /v1/conversations` | stable conversation `id` |

Polling returns at most the 100 newest items per poll. An update
or status change on a record outside that window is not seen by
polling — use the Instant version.

### Instant (REST Hooks — webhook delivery, best-effort immediate + cron retry, NOT instant-guaranteed)

| Trigger | Event | `data` payload (server emit) |
| --- | --- | --- |
| New Lead (Instant) | `lead.created` | `{source, leadId, email, firstName, company}` |
| Lead Updated (Instant) | `lead.updated` | `{source, leadId, changed_fields}` |
| Lead Added to Campaign (Instant) | `lead.added_to_campaign` | `{source, campaignId, leadIds, enrolled}` |
| Lead Removed From Campaign (Instant) | `lead.removed_from_campaign` | `{source, campaignId, leadId}` |
| New Campaign (Instant) | `campaign.created` | `{source, campaignId, name, status}` |
| Campaign Status Changed (Instant) | `campaign.status_changed` | `{source, campaignId, status, previous_status}` |
| New Reply (Instant) | `conversation.reply_created` | `{source, conversationId, messageId, duplicate}` |
| Subscription Changed (Instant) | `subscription.changed` | `{source, plan, status, stripeSubscriptionId, stripeCustomerId}` |

These are the only events NxtSend genuinely emits (see
`src/lib/integrations/zapier/events.ts`). Payloads are the server
envelope `{id, type, created_at, workspace_id, data}`; `id` is
the stable event id for dedup. Delivery: the mutation enqueues
and a best-effort immediate attempt is made; failures retry via
the `zapier_webhook_retry` job on the **daily 06:00 cron**
(exponential backoff, max 3 attempts, then dead) — so a failed
delivery may wait **up to ~24h** for its next retry. Do not
claim instant guaranteed delivery. A 410 from Zapier
deactivates the subscription. Zapier does **not** verify the
`X-NxtSend-Signature` / `X-NxtSend-Timestamp` signing headers —
nothing here claims it does. Unsubscribing an unknown id is
treated as already unsubscribed.

Notes: `conversation.reply_created` fires only for dashboard +
Zapier replies — MCP-tool and scheduled-reply sends do not emit
yet. `subscription.changed` is the only billing event (no
invoice/payment events).

There is **no polling version** of Lead Added/Removed, New
Reply, or Subscription Changed: no list endpoint surfaces those
events. If the server later adds an events feed (e.g.
`GET /v1/events`) or a campaign-membership list, polling
variants can be added.

## Actions (creates)

- **Create / Update Lead** — deduped by email (a duplicate
  returns the existing lead with `duplicate: true`). Only the
  server's fields are sent (`email`, `first_name`, `last_name`,
  `company`, `job_title`, `linkedin_url`, `status`, `tags`) —
  there is no `name`, `phone` or `source` on a lead.
- **Import Leads** — bulk, at most 100 rows per call;
  `{leads: [...]}` → `{created, skipped, leads}` (`skipped`
  covers invalid rows and duplicates).
- **Create Campaign** — draft only (the server refuses any
  non-draft status), **at least one sequence step is required**
  (`step_type` + `content` for email/LinkedIn-message steps;
  step types: email, linkedin_message, connection_request, wait,
  condition, like_post, view_profile, endorse_skills). **No
  natural dedup key, so a retried create can duplicate a
  draft.**
- **Update Campaign** — name / type / description only.
- **Pause / Resume / Stop / Archive Campaign** — transition
  rules apply: pause needs active, resume needs paused,
  stop/archive refuse an already-archived campaign (400).
  **Stop moves the campaign to `archived`** (there is no
  `stopped` status).
- **Add Leads to Campaign** — `{lead_ids: [...]}` →
  `{enrolled, skipped, notFound}`.
- **Remove Lead From Campaign** — DELETE; returns
  `{campaignId, leadId, removed: true}`.
- **Send Reply — email only** (LinkedIn replies are refused 422
  by the server; this action never attempts one). Returns
  `{message, duplicate}`. A client-generated `idempotencyKey`
  is sent on every call (auto UUID unless supplied), so a
  retried step replays the original reply instead of sending
  twice.

**Not implemented (deliberately):** any LinkedIn send/accept
action or trigger (no provider; `accepted` is always null);
**Create Draft** (`POST /v1/conversations/:id/drafts` — the
server confirms no draft concept exists in the product, so the
action is omitted rather than faked); date-range reporting
(`get_date_range_report`-style filtering does not exist).

## Searches

Find Lead (q / email / id), Find Campaign (q / id / status),
Find Conversation (q), Find LinkedIn Account (q), **Get
Campaign Performance** (by campaign id — real stats;
`stats.linkedin.accepted` is always null, no data source
exists). Find Lead → Create Lead and Find Campaign → Create
Campaign are paired as search-or-creates.

## Dynamic dropdowns

Campaigns, LinkedIn accounts, lead statuses, sequences —
powered by hidden triggers (`list_*`) against
`GET /v1/dropdowns/*`, workspace-scoped by the token. A dropdown
that is empty or errors returns `[]` (never breaks the editor);
the user can type a value instead. ID pickers on actions
(Update Lead, Send Reply, …) use the recent-items polling
triggers (`new_lead`, `new_campaign`, `new_conversation`) —
Zapier's style check (D005) only accepts **trigger** keys in
`dynamic:`, not search keys, so the searches are not used as
dropdown sources even though they exist.

Two server facts shape the dropdowns:

- **Sequences are per-campaign**: `GET
  /v1/dropdowns/sequences?campaign_id=` requires a campaign id
  (steps belong to a campaign — there is no workspace-wide
  sequence list). The dropdown passes the campaign id from the
  Zap's input when one is selected; without one it is empty.
- **No templates dropdown**: `GET /v1/dropdowns/templates` does
  not exist — there is no message-template store in the product
  (prompt snippets are AI-drafting prompts, not outreach
  templates). Omitted, not faked.

## Run

```bash
npm install
npx zapier-platform validate   # must pass; local only
npx zapier-platform test       # jest + appTester + Nock mocks; no live calls
npx zapier-platform build --skip-dep-install   # builds a pushable zip locally
```

`zapier-platform validate` and `test` need no Zapier account.
`build` without `--skip-dep-install` re-installs dependencies
into a temp dir and can hit `EMFILE` on machines with a low
open-file limit (4096 here) — `--skip-dep-install` avoids it.
**Do NOT run `register` / `push` / `promote`** without the owner
steps below — they need a Zapier developer account + deploy key.

## Owner steps (register / push / publish)

1. Apply Supabase migrations 025–027, then register the Zapier
   OAuth client with a one-time Dynamic Client Registration call
   (see `docs/zapier-integration/ZAPIER_SERVER.md` — the exact
   curl). The response contains `client_id` / `client_secret`
   (**shown once**).
2. In the Zapier developer dashboard, create the app and run
   `npx zapier-platform register "NxtSend"` (writes
   `.zapierapprc` — never commit it) to get the app ID.
3. Set the app environment variables in the dashboard
   (never in this repo):
   - `CLIENT_ID` / `CLIENT_SECRET` — from step 1. The redirect
     URI is the exact
     `https://zapier.com/dashboard/auth/oauth/return/AppXXXXXCLIAPI/`
     URL Zapier shows for this app — it must match the client's
     registered redirect URIs or authorization fails (the App ID
     may change after publish/beta — re-register then).
   - `ZAPIER_APP_BASE_URL` — `https://nxtsend.com` (or a staging
     origin for testing).
4. `npx zapier-platform push` to deploy a version.
5. Publishing: free review (~1 week), then 90-day Beta, then
   Public. Zapier requires a non-expiring test account for
   integration-testing@zapier.com and live Zaps with successful
   runs per trigger/action/search. **Publication is NOT claimed
   until that is done.**

## Error handling

- `beforeRequest` injects `Authorization: Bearer <access_token>`
  (the core does not do this automatically for OAuth2).
- A 401 is handled by the core's auto-refresh (refresh token +
  retry) before `afterResponse` runs — see `index.js`.
- 422 → refusal error (e.g. LinkedIn), 503 → demo-mode/disabled
  error, other 4xx/5xx → the server's `{error}` message.
  Lifecycle 400s surface the server's message (e.g. "Only an
  active campaign can be paused (current status: draft).").

## What is still unverified (needs the live server)

The server routes exist in this repo and this client is written
against their actual code (field names, envelopes, emit
payloads, transition rules) with Nock-mocked tests — but
**nothing has run against a live deployment**: the OAuth grant
flow inside Zapier, one live run per trigger/action/search, the
REST Hook end-to-end delivery to a real `hooks.zapier.com`
URL, and the cron retry tick are all still pending (no live
Supabase project and no Zapier developer account were used
from this environment). The `GET /v1/usage` response shape was
not mapped to an output (no trigger/action uses it — only the
Subscription Changed hook surfaces subscription state).
