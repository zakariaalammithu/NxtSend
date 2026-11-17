# n8n integration — server core

The n8n REST API (`/api/integrations/n8n/v1/*`) is the same
implementation as the Zapier REST API, parameterised by platform:
one set of functions in `src/lib/integrations/rest/api.ts`
(`rest*`), thin route files per platform, auth that accepts
either an OAuth 2.0 access token (scopes `n8n.read` /
`n8n.write`, resource `/api/integrations/n8n`) or a scoped API
key (`nxt_live_…`, see `api-keys.ts`).

## What n8n gets that Zapier does not

- `DELETE /v1/leads/:id` — permanently deletes a lead (write
  tier). The Zapier routes do not expose it.
- `GET /v1/campaigns/:id/sequence` — the campaign's steps.
- `POST /v1/campaigns/:id/steps` — replace the whole sequence.
- `GET/POST /v1/campaigns/:id/follow-ups` and
  `DELETE /v1/campaigns/:id/follow-ups/:followUpId` — scheduled
  follow-up replies (schedule / list upcoming / cancel).
- `GET /v1/campaigns/:id/execution-status` — per-campaign
  execution summary from the real execution records.

## Deliberately NOT here

- **Contact is NOT a separate entity.** There are no contacts
  routes: in NxtSend a contact IS a lead. Contact operations
  map to Lead operations (`/v1/leads*` — create, read, update,
  delete, import, search).
- **No campaign launch.** Campaigns are created draft-only via
  the API (there is no server-side launch validation to reuse —
  launch checks live in the dashboard wizard). Launch a draft
  from the dashboard, then pause / resume / archive it from n8n.
- **No draft endpoint.** There is no draft concept in the
  product beyond a draft campaign (see above).
- **No date-range report.** No endpoint exists for it, and none
  is faked with a 501: the data source does not exist (same rule
  as the MCP adapters — `accepted` in campaign performance is
  always null, never fabricated).
- **No LinkedIn send.** n8n never sends LinkedIn messages or
  connection requests: no authorized LinkedIn provider exists,
  and the official LinkedIn API exposes no such endpoints to
  standard developers. Inbox replies are email-only (LinkedIn
  conversations are refused 422).

## Follow-ups are workspace-scoped, not campaign-scoped

A scheduled reply carries a `conversation_id` but no
`campaign_id`, and conversations carry no campaign link either,
so the follow-up routes cannot filter by campaign. The
campaign segment of
`/v1/campaigns/:id/follow-ups*` only verifies the campaign
exists (404 otherwise); listing returns the workspace's
upcoming follow-ups. Scheduling stores a row and sends
NOTHING immediately — the worker sends due rows.

## API keys

Created in-app (Settings → Integrations → n8n) or via
`POST /api/integrations/n8n/api-keys` (session auth). The key
value is returned exactly once, at creation; only its SHA-256
hash is stored (migration 028). Keys are scoped
(`n8n.read` / `n8n.write` — tiers are independent, like OAuth:
write does NOT imply read), expirable and revocable. Demo Mode
refuses API keys and the whole n8n surface (503).

## Webhooks

`POST /v1/webhooks/subscribe` (`{event, target_url}`),
`POST /v1/webhooks/unsubscribe` (`{id}`),
`GET /v1/webhooks/subscriptions`. Events are the same 8 as
Zapier (see `src/lib/integrations/rest/events.ts`) and fan out
to every platform's subscriptions. Target URLs must be https
on a public host (localhost / private IPs refused; http
loopback is allowed only on a local deployment) and must not
be a Zapier hook URL. The non-v1 webhook routes
(`/api/integrations/n8n/webhooks/*`, session-authenticated
management + test + retry) are Worker B's; the v1 subscribe
routes here are the API-facing ones.

## Env vars

`N8N_INTEGRATION_ENABLED` (unset = enabled; `false` disables
the REST surface, OAuth stays available),
`N8N_API_BASE_URL` (public origin; else `NEXT_PUBLIC_APP_URL`,
else the request origin). There is no `N8N_API_KEY` and no
`N8N_OAUTH_CLIENT_SECRET`: keys are generated in-app, and the
OAuth client is created by Dynamic Client Registration.
