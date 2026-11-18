# NxtSend Activepieces Piece (skeleton)

TypeScript piece for **NxtSend** — leads, campaigns, inbox conversations and usage, via the NxtSend Activepieces REST API. Built with `@activepieces/pieces-framework` 0.32.0.

> **Status: build-verified, NOT installed, NOT submitted.** The piece source follows the documented Activepieces piece structure (`createPiece` + `PieceAuth.OAuth2` + `createAction` + `createTrigger`; see https://www.activepieces.com/docs/build-pieces/building-pieces/start-building), and it **compiles clean (tsc) and constructs at runtime against `@activepieces/pieces-framework` 0.32.0** (verified 2026-11-19: 17 actions, 9 triggers, OAuth2 auth). It has not been installed in any Activepieces instance or contributed to the Activepieces repository. Run the build below to re-verify.

## What is here

| File | What it is |
| --- | --- |
| `package.json` | Package `@nxtsend/piece-nxtsend` 0.1.0. Framework 0.32.0 (verified to exist on npm). |
| `src/index.ts` | `createPiece({ displayName: "NxtSend", auth, actions, triggers })`. |
| `src/auth.ts` | `PieceAuth.OAuth2` — authorize/token URLs, scopes `activepieces.read` / `activepieces.write`, connection label via `GET /v1/auth/test`. |
| `src/lib/common.ts` | `nxtsendRequest` — one authenticated call to `/api/integrations/activepieces/v1/...` (Bearer token). |
| `src/lib/actions/*.ts` | 17 actions, one per v1 write/read operation + a Custom API Call. |
| `src/lib/triggers/*.ts` | 8 webhook triggers (one per event) + 1 polling trigger (new leads). |
| `tsconfig.json` | Strict TypeScript build to `dist/`. |

## API contract

Base URL: `https://nxtsend.com` by default (`NXTEND_API_BASE_URL` in `src/lib/common.ts` — point it at your deployment). All paths under `/api/integrations/activepieces/v1/`, `Authorization: Bearer <access token>`, `{error}` JSON on failure, Demo Mode → 503, rate limit 120 req/min per token. The server side is implemented in `src/lib/integrations/rest/api.ts` (routes under `src/app/api/integrations/activepieces/v1/*`, documented in `docs/integrations/providers/automation-activepieces.md`).

Auth: OAuth 2.0 authorization-code against NxtSend's shared OAuth server (`/api/muse/oauth/*`), scopes `activepieces.read` + `activepieces.write`. There is no `activepieces.send` tier — the piece never sends LinkedIn messages. The OAuth client comes from the one-time Dynamic Client Registration call; there is no `ACTIVEPIECES_OAUTH_CLIENT_SECRET` env var, and **no secret lives in this directory**.

> **Blocked:** DCR for the `activepieces` platform is pending the coordinator extending `src/lib/muse-connector/oauth/clients.ts`. Until that lands, no `activepieces.*` token can be issued. See `docs/integrations/providers/automation-activepieces.md`.

## Actions (17)

| Action | Operation |
| --- | --- |
| Create Lead | `POST /leads` |
| Update Lead | `PATCH /leads/{id}` |
| Delete Lead | `DELETE /leads/{id}` |
| Import Leads | `POST /leads/import` |
| Create Campaign (Draft) | `POST /campaigns` (DRAFT ONLY — no launch action exists) |
| Update Campaign | `PATCH /campaigns/{id}` |
| Pause / Resume / Stop / Archive Campaign | `POST /campaigns/{id}/{action}` |
| Add Leads to Campaign | `POST /campaigns/{id}/leads` |
| Remove Lead from Campaign | `DELETE /campaigns/{id}/leads/{leadId}` |
| Send Inbox Reply (Email) | `POST /conversations/{id}/replies` (email only; LinkedIn refused 422; `idempotencyKey` required) |
| Schedule Follow-up Reply | `POST /campaigns/{id}/follow-ups` |
| Get Campaign Performance | `GET /campaigns/{id}/performance` |
| Get Usage | `GET /usage` |
| Search Leads | `GET /search/leads` |
| Search Campaigns | `GET /search/campaigns` |
| Subscribe Webhook | `POST /webhooks/subscribe` |
| Custom API Call | Any `/v1/...` endpoint |

## Triggers (9)

| Trigger | How it works |
| --- | --- |
| New Lead / Lead Updated / Lead Added to Campaign / Lead Removed from Campaign / Campaign Created / Campaign Status Changed / New Inbox Reply / Subscription Changed | `TriggerStrategy.WEBHOOK`: `onEnable` subscribes the flow's webhook URL via `POST /v1/webhooks/subscribe`, `onDisable` unsubscribes, `run` returns the webhook payload. |
| New Lead (Polling) | `TriggerStrategy.POLLING`: polls `GET /v1/leads?after=<last run>` on the flow schedule. |

Rules preserved from the API: campaigns are created DRAFT ONLY; no LinkedIn-send action exists; inbox replies need an `idempotencyKey`; lead creates dedup by email.

## Build & install

```bash
cd integrations/activepieces
npm install
npm run build
```

- **Self-hosted:** copy the built piece into your Activepieces `pieces/` directory (or install the `.tgz` via the admin piece catalogue) and restart.
- **Cloud:** upload the built `.tgz` as a private piece (Platform Admin → Catalogue → Pieces → Install Private Piece).

Then add the NxtSend piece to a flow, connect it (OAuth consent screen — pick `activepieces.read` unless the flow needs to write), and build from the triggers/actions above. Contributing the piece to the Activepieces repository is a separate step the owner must do; the private-piece path above works without it. (Build verification 2026-11-19: `npm install` + `tsc` clean against framework 0.32.0, and the built piece constructs with 17 actions / 9 triggers / OAuth2 auth. Two framework details the source gets right that the public docs get wrong or omit: the action/trigger context exposes props as `propsValue`, not `props`; and `PieceAuth.OAuth2` in 0.32.0 has no `getConnectionIdentifier` property — the connection label is Activepieces' default.)

## No-piece path

Use Activepieces' built-in **HTTP Request** piece (Bearer token auth) for API calls and the **Webhook** trigger for events, with the same endpoints and subscribe call as above.

## Tests

`src/lib/integrations/providers/automation/__tests__/activepieces-piece.test.ts` (mocked, no live calls): every action/trigger file in this package parses as TypeScript-shaped source and its operation (method + path, or webhook event) exists in the real v1 route tree / event registry. Run with `npx vitest run src/lib/integrations/providers/automation/__tests__/activepieces-piece.test.ts`. It does not compile the piece — `npm run build` here does that.
