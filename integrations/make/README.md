# NxtSend Make App (skeleton)

Make custom app for **NxtSend** — leads, campaigns, inbox conversations and usage, via the NxtSend Make REST API.

> **Status: skeleton, NOT submitted to Make.** Make custom apps are built in the Make web interface or VS Code as component directories (Base / Connections / Modules) written in JSONC + IML — there is no single manifest file Make imports. The files in this directory are the **spec** for that build. Nothing here has been built in Make, imported into a Make account, or submitted for review.

## What is here

| File | What it is |
| --- | --- |
| `app.json` | App manifest skeleton: label, description, docs URL, base URL, connection + module inventory. |
| `base.json` | Base component: base URL, shared auth header, error mapping. Inherited by all modules. |
| `connections/oauth2.json` | OAuth 2.0 connection: authorize/token/revoke URLs, scopes `make.read make.write`, resource, validation call (`GET /v1/auth/test`). |
| `modules/*.json` | One spec file per module (10 actions, 4 searches, 4 triggers, 1 universal). Each maps to exactly one real v1 operation — see the `endpoint` field. |
| `scenarios/*.json` | Importable scenario blueprints (see below). |
| `README.md` | This file. |

## API contract

Base URL: `https://<your-domain>/api/integrations/make/v1/` (replace `<your-domain>` with the deployment origin, e.g. `https://nxtsend.com`). All paths under `/v1/`, `Authorization: Bearer <access token>`, `{error}` JSON on failure, Demo Mode → 503, rate limit 120 req/min per token. The server side is implemented in `src/lib/integrations/rest/api.ts` (routes under `src/app/api/integrations/make/v1/*`, documented in `docs/integrations/providers/automation-make.md`).

Auth: OAuth 2.0 authorization-code against NxtSend's shared OAuth server (`/api/muse/oauth/*`), scopes `make.read` + `make.write`. There is no `make.send` tier — Make never sends LinkedIn messages, and email inbox replies are covered by the write tier. The OAuth client comes from the one-time Dynamic Client Registration call — there is no `MAKE_OAUTH_CLIENT_SECRET` env var, and **no secret lives in this directory**.

> **Blocked:** DCR for the `make` platform is pending the coordinator extending `src/lib/muse-connector/oauth/clients.ts`. Until that lands, no `make.*` token can be issued. See `docs/integrations/providers/automation-make.md`.

## Modules

| Module file | Type | Operation |
| --- | --- | --- |
| `create-lead.json` | Action | `POST /leads` |
| `update-lead.json` | Action | `PATCH /leads/{id}` |
| `delete-lead.json` | Action | `DELETE /leads/{id}` |
| `import-leads.json` | Action | `POST /leads/import` |
| `create-campaign.json` | Action | `POST /campaigns` (DRAFT ONLY — no launch module exists) |
| `campaign-action.json` | Action | `POST /campaigns/{id}/{action}` (pause / resume / stop / archive) |
| `add-leads-to-campaign.json` | Action | `POST /campaigns/{id}/leads` |
| `send-inbox-reply.json` | Action | `POST /conversations/{id}/replies` (email only; LinkedIn refused 422) |
| `subscribe-webhook.json` | Action | `POST /webhooks/subscribe` |
| `unsubscribe-webhook.json` | Action | `POST /webhooks/unsubscribe` |
| `search-leads.json` | Search | `GET /search/leads` |
| `search-campaigns.json` | Search | `GET /search/campaigns` |
| `get-campaign-performance.json` | Search | `GET /campaigns/{id}/performance` |
| `get-usage.json` | Search | `GET /usage` |
| `trigger-new-lead.json` | Trigger (webhook) | `lead.created` |
| `trigger-lead-updated.json` | Trigger (webhook) | `lead.updated` |
| `trigger-new-reply.json` | Trigger (webhook) | `conversation.reply_created` |
| `trigger-poll-new-leads.json` | Trigger (polling) | `GET /leads` |
| `universal-api-call.json` | Action (universal) | Any `/v1/...` endpoint (relative path; required for Make review) |

Rules preserved from the API: campaigns are created DRAFT ONLY; no LinkedIn-send action exists; inbox replies need an `idempotencyKey`; lead creates dedup by email.

## Scenario blueprints

Importable JSON in Make's documented blueprint shape (`{name, flow: [{id, module, version, parameters, mapper, metadata}], metadata}`).

| File | Flow |
| --- | --- |
| `scenarios/new-lead-to-crm.json` | `gateway:CustomWebHook` (`lead.created`) → `http:ActionSendData` POST the lead to your CRM. Replace `https://crm.example.com/api/leads` and the `PASTE_YOUR_CRM_API_KEY` placeholder with your CRM. |
| `scenarios/poll-new-leads-to-sheet.json` | `http:ActionSendData` GET `/v1/leads?limit=100` → `builtin:BasicFeeder` over `{{1.data.leads}}` → `google-sheets:addRow` (Created, Email, Name, Company, Status). Set the scenario schedule after import (e.g. every 15 minutes). Replace `<your-domain>`, the `PASTE_YOUR_NXTEND_ACCESS_TOKEN` placeholder, and `PASTE_YOUR_SPREADSHEET_ID`. |

Import: Make → Scenarios → ⋮ → Import blueprint, pick the file (must be under 2 MB), then create the connections (Make webhook, HTTP OAuth 2.0 credential — move the token out of the header into the module's Credentials field before sharing) and replace the placeholders. Blueprints carry modules, settings and mapped values but not connections (`__IMTCONN__` is `null` by design).

**The blueprints were constructed from the documented blueprint shape (`http:ActionSendData` v3, `builtin:BasicFeeder` v1, `google-sheets:addRow` v2, `gateway:CustomWebHook` v1) and were NOT imported into a live Make account — treat the first import as a test.** If Make reports an unknown field on import, delete that module and rebuild it with the same mapping; the field tables above are the source of truth.

## Build the custom app in Make

1. Register the OAuth client (DCR call in `docs/integrations/providers/automation-make.md`) — blocked until the `clients.ts` extension lands.
2. In Make → Custom Apps, create the app from `app.json` + `base.json` + `connections/oauth2.json` + `modules/*.json`.
3. Test one module in a scenario (connection test: `GET /v1/auth/test`).
4. Submit for Make review separately — that submission has NOT been made and no approval is claimed.

## Tests

`src/lib/integrations/providers/automation/__tests__/make-manifest.test.ts` (mocked, no live calls): every JSON file in this directory parses; every module's `endpoint` (method + path) exists in the real v1 route tree; every blueprint parses, its flow modules are in the known set, and every NxtSend URL it calls is a real v1 endpoint. Run with `npx vitest run src/lib/integrations/providers/automation/__tests__/make-manifest.test.ts`.
