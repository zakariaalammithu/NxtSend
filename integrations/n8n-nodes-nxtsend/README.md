# n8n-nodes-nxtsend

> **Status: NOT published on npm and NOT verified by n8n.** This package is
> developed inside the NxtSend repository (`integrations/n8n-nodes-nxtsend`)
> and has not been submitted to npm or to n8n's community-node verification.
> Install it from a local checkout (see below) until it is published.

This is an n8n community node for [NxtSend](https://nxtsend.com) — LinkedIn
outreach automation. It lets you work with NxtSend leads, campaigns,
sequences, conversations and analytics from your n8n workflows, and trigger
workflows on NxtSend events.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/n8n-community-license/) workflow automation platform.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Trigger](#trigger) · [Workflows](#workflows) · [Compatibility](#compatibility) · [Usage](#usage) · [Limitations](#limitations) · [Resources](#resources) · [Version history](#version-history)

## Installation

Once published, install from inside n8n: **Settings → Community Nodes →
Install**, then enter `n8n-nodes-nxtsend`.

Until then, install from a local checkout:

```sh
cd integrations/n8n-nodes-nxtsend
npm install
npm run build
# then in your n8n instance:
# Settings → Community Nodes → Install → n8n-nodes-nxtsend
# (or copy the built package into n8n's custom nodes directory)
```

## Credentials

Two credential types are supported. Both resolve to the same NxtSend
workspace; attach whichever you have.

### NxtSend API (API key)

1. In NxtSend, go to **Settings → Integrations → n8n** and create an API key
   (it looks like `nxt_live_…`).
2. In n8n, create a **NxtSend API** credential with:
   - **Base URL**: `https://nxtsend.com` (change only if you self-host NxtSend)
   - **API Key**: the key from step 1.
3. Use **Test** — it calls `GET /auth/test` and shows the workspace and
   user the key belongs to.

### NxtSend OAuth2 API

1. In n8n, create a **NxtSend OAuth2 API** credential with:
   - **Base URL**: `https://nxtsend.com` (change only if you self-host NxtSend)
   - The authorization URL (`{baseUrl}/api/muse/oauth/authorize`), token URL
     (`{baseUrl}/api/muse/oauth/token`) and scope (`n8n.read n8n.write`)
     are derived automatically.
2. Connect your NxtSend account through the OAuth flow and test the
   credential (same `GET /auth/test` endpoint).

Keys and tokens are stored in n8n's encrypted credential storage. Never paste
a key into a workflow, a sticky note, or a code field.

## Operations

**NxtSend** node (`n8n-nodes-nxtsend.nxtSend`). All requests go to
`{baseUrl}/api/integrations/n8n/v1`. "Contact" is not a separate entity in
NxtSend — contact operations map 1:1 to Lead operations, so use the Lead
resource.

| Resource | Operation | Endpoint |
|---|---|---|
| Lead | Create | `POST /leads` |
| Lead | Get | `GET /leads/:id` |
| Lead | Get Many | `GET /leads?limit&after` |
| Lead | Update | `PATCH /leads/:id` |
| Lead | Delete | `DELETE /leads/:id` |
| Lead | Search | `GET /search/leads?q&status` |
| Lead | Import | `POST /leads/import` (max 100 leads) |
| Lead | Add to Campaign | `POST /campaigns/:campaignId/leads` |
| Lead | Remove from Campaign | `DELETE /campaigns/:campaignId/leads/:id` |
| Lead | Update Status | `PATCH /leads/:id` (`{status}`) |
| Campaign | Create | `POST /campaigns` — **draft-only** (see below) |
| Campaign | Get | `GET /campaigns/:id` |
| Campaign | Get Many | `GET /campaigns` |
| Campaign | Update | `PATCH /campaigns/:id` |
| Campaign | Pause / Resume / Stop / Archive | `POST /campaigns/:id/pause\|resume\|stop\|archive` |
| Campaign | Add Leads | `POST /campaigns/:id/leads` |
| Campaign | Get Performance | `GET /campaigns/:id/performance` |
| Sequence | Get Sequence | `GET /campaigns/:id/sequence` |
| Sequence | Replace Steps | `POST /campaigns/:id/steps` (full replace) |
| Sequence | Get Scheduled Follow-Ups | `GET /campaigns/:id/follow-ups` |
| Sequence | Schedule Follow-Up | `POST /campaigns/:id/follow-ups` |
| Sequence | Cancel Follow-Up | `DELETE /campaigns/:id/follow-ups/:followUpId` |
| Sequence | Get Execution Status | `GET /campaigns/:id/execution-status` |
| LinkedIn Account | Get / Get Many / Get Status | `GET /accounts[/:id[/status]]` — **read-only** |
| Conversation | Get | `GET /conversations/:id` |
| Conversation | Get Many | `GET /conversations?search&channel&unreadOnly&limit&offset` |
| Conversation | Search | `GET /search/conversations?q` |
| Conversation | Get Replies | `GET /conversations/:id` (replies on the conversation) |
| Conversation | Send Reply | `POST /conversations/:id/replies` — **email-only** |
| Analytics | Get Campaign Statistics | `GET /campaigns/:id/performance` |
| Analytics | Get Lead Statistics | `GET /usage` + `GET /leads` (counts from live data only) |
| Analytics | Get Account Activity | `GET /usage` |
| Analytics | Compare Campaigns | `GET /campaigns/:id/performance` × 2 |
| Analytics | Get Usage Report | `GET /usage` |

Notes:

- **Campaign Create is draft-only.** There is no launch endpoint; launch a
  campaign from the NxtSend dashboard.
- **Performance `accepted` is always `null`** in the API. The node surfaces
  it as `null` and never invents a value.
- **LinkedIn accounts are read-only.** There are no LinkedIn send,
  connect-request or DM operations anywhere in this package.
- **Send Reply is email-only.** A LinkedIn conversation returns HTTP 422
  (`linkedin_unavailable`); the node surfaces that error honestly.
- **Send Reply idempotency:** if you leave *Idempotency Key* empty, a random
  key is generated per execution so a retried run does not send twice.
- Campaign, account, status and sequence dropdowns are loaded live from
  `/dropdowns/*`. If a dropdown is empty, the API call failed — check the
  credential and try again.

## Trigger

**NxtSend Trigger** node (`n8n-nodes-nxtsend.nxtSendTrigger`), two modes:

- **Webhook (default):** NxtSend pushes events to n8n as they happen.
  Activating the workflow subscribes (`POST /webhooks/subscribe`);
  deactivating unsubscribes (`POST /webhooks/unsubscribe`). Needs a
  reachable n8n URL. Each run emits the event payload's `data` plus `event`
  and `eventId` fields.
- **Polling:** n8n polls the matching list endpoint and emits only new
  records (deduped by id, ordered by `created_at`/`updated_at`). The first
  poll emits nothing — it only establishes a cursor, so activating the
  workflow does not replay history.

Events (9): `lead.created`, `lead.updated`, `lead.added_to_campaign`,
`lead.removed_from_campaign`, `campaign.created`, `campaign.status_changed`,
`conversation.reply_created`, `subscription.changed`, plus
`conversation.created` — **polling-only** (NxtSend emits no webhook event
for a new conversation; activating the Trigger in webhook mode with this
event refuses loudly).

There is **no LinkedIn-connection-accepted event** — NxtSend does not emit
one, so no template or trigger is offered for it.

## Workflows

Twelve importable templates live in `workflows/` (import via n8n's
**Workflows → … → Import from File**). Each has a Sticky Note explaining
setup; replace `YOUR_CAMPAIGN_ID` / `YOUR_SPREADSHEET_ID` and connect
credentials before activating.

1. Google Sheets row → Create Lead
2. New Lead (trigger, polling) → Google Sheets
3. CRM contact (Webhook trigger) → Add to Campaign
4. Campaign status changed (trigger) → Slack
5. New Conversation (trigger) → Slack/Email notification
6. Campaign status changed → Email alert on failed
7. Schedule trigger → Weekly Campaign Report → Email
8. Form submission (Webhook) → Import Lead
9. New Lead → HTTP Request to an AI personalization endpoint (**placeholder**
   — the AI step must be configured by the user; the NxtSend node has no
   AI-draft operation)
10. Campaign status changed → Google Sheets update
11. New Lead → Slack notification
12. Schedule → Update Campaign Status (Pause Campaign)

Skipped on purpose: any LinkedIn-reply or connection-accepted template —
there is no event source or send operation for those.

## Compatibility

- Built with `@n8n/node-cli` **0.57.3** and `n8n-workflow` **2.48.2**
  (the versions the scaffold installed), TypeScript 5.9.2, Node ≥ 20.
- n8n **1.x / 2.x / 3.x** per `@n8n/node-cli` 0.57.x.
- Tested with Jest (126 tests, `npm test`). Loading the nodes into a live
  n8n instance has **not** been verified in this environment (no
  Docker/Podman/n8n available here) — see [Limitations](#limitations).

## Usage

- The node is a regular workflow node, **not** an AI tool
  (`usableAsTool` is intentionally unset).
- List operations return one output item per record; single-object responses
  return one item with the API's JSON. Errors surface as `NodeApiError`
  carrying the API's error body (e.g. demo workspaces answer HTTP 503).
- Use *Continue On Fail* in the node settings if a failed item should not
  stop the whole execution.
- Development: `npm run build` (tsc + asset copy), `npm run lint`,
  `npm test`. `npm run dev` starts a local n8n instance — it needs
  Docker/Podman and is not available in this environment.

## Limitations

- **Not published, not verified:** this package is not on npm and has not
  been through n8n's community-node verification or any n8n Cloud checks.
- **No live n8n load test yet:** the nodes build, lint and pass unit tests
  with mocked HTTP, but have not been loaded into a running n8n instance
  (no Docker/Podman in the build environment).
- **Server-side API is landed:** the node codes against the
  `/api/integrations/n8n/v1` contract and the server matches it —
  including `GET /accounts/:id` and `GET /accounts/:id/status`
  (added in the coordinator reconciliation pass) and the
  follow-up schedule body `{conversation_id, body, scheduled_at}`.
- Demo workspaces answer **503** on every endpoint; the node surfaces that
  as an error, it does not fake success.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [NxtSend repository](https://github.com/zakariaalammithu/NxtSend)
- [Creating nodes — programmatic style](https://docs.n8n.io/integrations/creating-nodes/build/programmatic-style-node/)

## Version history

- **0.1.0** — Initial release: NxtSend + NxtSend Trigger nodes, API-key and
  OAuth2 credentials, 12 workflow templates.
