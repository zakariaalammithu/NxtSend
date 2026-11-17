# NxtSend × n8n Integration

NxtSend is the **server** in this integration: n8n calls **into**
NxtSend (REST API + webhook triggers) on behalf of a signed-in
NxtSend user, authenticated either with OAuth 2.0 (the shared
authorization server) or with a scoped API key created in-app. The
community node package `n8n-nodes-nxtsend` in
`integrations/n8n-nodes-nxtsend/` is the client; the REST API,
API-key management, OAuth extension and webhook outbox in
`src/lib/integrations/n8n/` + `src/app/api/integrations/n8n/` are
the server.

**Status: settings UI + admin + docs implemented; server and node
package PARTIALLY landed at the time of writing (2026-11-18
evening, verified by reading the workers' code in this repo).**
- **Worker B (OAuth + webhooks) — LANDED:** `n8n.*` scopes in
  `src/lib/muse-connector/oauth/scopes.ts` (with descriptions),
  the grants-by-origin `n8n` branch in `grants.ts`, the
  10-minute refresh-reuse grace for n8n + Zapier grants in
  `oauth/tokens.ts`, webhook subscribe/unsubscribe/subscriptions
  routes under `/api/integrations/n8n/webhooks/*`, the session
  subscriptions route, the shared `rest/config.ts` adapter
  (`N8N_PLATFORM`), and migration 029 (platform discriminator
  on the shared webhook tables — written, not applied).
- **Worker A (server REST API + API keys) — LANDED:** the full
  v1 surface under `src/app/api/integrations/n8n/v1/*`, the
  public `/api/integrations/n8n/health`, the session
  `/api/integrations/n8n/api-keys` routes, the shared REST layer
  in `src/lib/integrations/rest/*`, the API-key system in
  `src/lib/integrations/n8n/api-keys.ts`, and migration 028
  (`supabase/migrations/028_nxtsend_api_keys.sql`, table
  `nxtsend_api_keys`).
- **Worker C (node package) — LANDED:** credentials
  (`NxtSendApi`, `NxtSendOAuth2Api`), node properties and the
  shared operation/endpoint map, the main node file, the
  Trigger node file, 5 test suites (126 tests, all passing),
  and the 12 workflow templates in `workflows/` (validated by
  `test/workflows.test.ts`). Package `npm run build` passes and
  `npm test` passes 126/126 (verified in the coordinator pass
  2026-11-18, after the follow-up-body and trigger fixes).
Nothing here has been verified live against a deployed site or
a real n8n instance. The node package has NOT been published on
npm and is NOT verified by n8n. See [TESTING.md](TESTING.md) and
[PUBLISHING.md](PUBLISHING.md) for what is still pending.

## What you get

| Surface | Inventory |
|---|---|
| OAuth 2.0 (shared server, extended) | Scopes `n8n.read` + `n8n.write` only (no `.send`); resource `https://<origin>/api/integrations/n8n`; DCR-registered client; PKCE optional for confidential clients only; **10-minute refresh-token reuse grace for n8n + Zapier grants** (quoted from `oauth/tokens.ts` — see [API_AUTHENTICATION.md](API_AUTHENTICATION.md)) |
| API keys (in-app) | Scoped (`n8n.read` / `n8n.write`), expirable, revocable; created on Settings → Integrations → n8n; value shown exactly once; stored as hashes only |
| REST API v1 (`/api/integrations/n8n/v1/*`) | Leads, campaigns (draft-only), sequences, conversations (email-only replies), accounts, usage, searches, dropdowns — plus a public health endpoint, API-key routes and webhook routes — **all landed** |
| Webhooks (Trigger node) | 9 events (8 webhook + `conversation.created` polling-only), per-subscription HMAC secrets, outbox with best-effort immediate delivery + daily 06:00 cron retry (max 3 attempts, then `dead`) — **server routes landed; migration 029 written, not applied** |
| Community node (`integrations/n8n-nodes-nxtsend/`) | NxtSend node (actions + searches) + NxtSend Trigger (webhook + polling), v0.1.0, 12 workflow templates — **LANDED: build passes, tests 126/126** (Worker C + coordinator fixes) |
| Settings UI + admin | Integration Center entry (grant-only "Connected" for OAuth; API-key signal reported separately), detail page with live grants / API keys / endpoints / trigger-action inventory, admin panel with grants / key counts / subscriptions / delivery failures |

## Docs in this folder

| File | Covers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System diagram, components, data flow, files changed |
| [API_AUTHENTICATION.md](API_AUTHENTICATION.md) | OAuth flow, API keys, scopes, DCR registration, PKCE + rotation decisions, token lifecycle |
| [NODE_CREDENTIALS.md](NODE_CREDENTIALS.md) | The NxtSend API credential in n8n (API key vs OAuth2), fields, testing |
| [TRIGGERS.md](TRIGGERS.md) | 5 polling + 8 webhook triggers, dedup, latency |
| [ACTIONS.md](ACTIONS.md) | 12 actions, transition rules, idempotency, limits |
| [SEARCHES.md](SEARCHES.md) | 5 searches, search-or-creates, dropdowns |
| [WEBHOOKS.md](WEBHOOKS.md) | Webhook subscriptions, events, signing, delivery + retry, latency honesty |
| [API_REFERENCE.md](API_REFERENCE.md) | Every endpoint: method, auth, inputs, outputs, errors |
| [SECURITY.md](SECURITY.md) | Threat model, token/key storage, secrets, RLS, LinkedIn boundary |
| [DATABASE.md](DATABASE.md) | Migrations 028 + 029, tables, RLS, what is never selected |
| [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md) | Env vars, migrations, deploy checklist |
| [N8N_SETUP.md](N8N_SETUP.md) | Installing the node, creating the credential, first workflow |
| [WORKFLOW_TEMPLATES.md](WORKFLOW_TEMPLATES.md) | The 12 templates, what each does, skipped LinkedIn templates |
| [TESTING.md](TESTING.md) | What was tested here, what is still PENDING (live, load test) |
| [PUBLISHING.md](PUBLISHING.md) | npm metadata, name availability, verification submission, owner steps |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Every known failure mode and what to do about it |

## The three hard boundaries

1. **No LinkedIn send.** No authorized LinkedIn provider exists, and
   the official LinkedIn API exposes no connection-request/DM
   endpoints to standard developers. n8n can read LinkedIn accounts
   and send email replies only.
2. **No campaign launch.** Campaigns created from n8n are drafts.
   Launch them from the NxtSend dashboard.
3. **No draft endpoint.** No draft concept exists in the product, so
   there is no endpoint for one.

## "Contact" means "Lead"

n8n's node vocabulary talks about Contacts; NxtSend's API talks
about Leads. They are the same record: every Contact operation in
the node maps to a Lead endpoint (`/v1/leads/*`). There is no
separate Contact resource.
