# Snov.io — NxtSend email-outreach integration

> Status: **partially live / config-ready** (see the table below). Verified
> against the official docs on 2026-11-19. No live calls were made while
> building this adapter — no credentials exist in this workspace — and
> nothing here claims a live connection.

- Provider docs: https://snov.io/api
- Base URL: `https://api.snov.io`
- Auth: Bearer API key in the `Authorization` header
- Adapter: `src/lib/integrations/providers/email-outreach/snov/adapter.ts`
- Config: `src/lib/integrations/providers/email-outreach/snov/config.ts`
- Panel: `src/components/integrations/email-outreach/SnovPanel.tsx` (not wired into any page yet)

## Auth setup

1. In Snov.io: Profile icon > Account > API. Copy the API User ID and the API Secret.
2. Store the User ID as the credential's apiKey and the Secret as extra.client_secret (both encrypted in integration_connections). The adapter exchanges them for a 1-hour token on demand; the secret is never logged.
3. Verify with the connection test (GET /v1/get-user-campaigns) before any send.

## What syncs

| Direction | Operation | Status | Endpoint |
|---|---|---|---|
| NxtSend → Snov.io | Send qualified leads to an email campaign | Config-ready | — |
| Snov.io → NxtSend | Campaign status | Live (mock-tested) | `GET /v1/get-user-campaigns` (list + find) |
| Snov.io → NxtSend | Replies | Config-ready | — |
| Snov.io → NxtSend | Bounced / unsubscribed | Config-ready | — |

Verified endpoints:

| Method | Path | Note |
|---|---|---|
| `POST` | `/v1/oauth/access_token` | Client-credentials exchange (grant_type=client_credentials, client_id, client_secret; form-encoded). Returns access_token, 1-hour lifetime. |
| `GET` | `/v1/get-user-campaigns` | List the account's campaigns (also the connection test). |

## Suppression handling

- Every send goes through `qualifyLeads` (shared helper): leads are
  deduplicated by email first, then checked against the workspace
  suppression list. A suppressed lead is never sent; a lead with no
  email is skipped; a suppression-check failure skips that lead
  (fail closed) and records the reason on the sync job.
- Sending without a suppression checker throws before any provider call.
- Where the provider reports bounces / unsubscribes back, the adapter
  surfaces them via `syncBouncesAndUnsubscribes` and calls the
  `onSuppressed` hook so the caller can add them to the NxtSend
  suppression list with `addSuppression`.
- Nothing in this adapter sends email on its own: adding leads to a
  provider campaign only enrolls them; the provider sends on its own
  schedule and only under the operator's configured campaign settings.

## Environment variables

- `SNOV_API_USER_ID` — Snov.io API User ID (Account > API). Exchanged with SNOV_API_SECRET for a 1-hour Bearer access token (POST /v1/oauth/access_token, client_credentials grant).
- `SNOV_API_SECRET` — Snov.io API Secret, stored as `extra.client_secret` on the credential.

Credentials are read from the encrypted `integration_connections` store
(Stage 1 engine), not from `process.env`. The names above are the
conventional operator-facing names for the credential that seeds a
connection. Never commit a key, and never log one.

## What is config-ready vs pending

- Add prospects to a campaign — the endpoint path was not verified against snov.io/api or the Snov.io knowledge base, so the export throws instead of calling a guessed URL.
- Sync replies — no Snov.io reply endpoint verified.
- Sync bounced / unsubscribed — no Snov.io campaign-stats / bounce endpoint path verified.

## Capabilities

- OAuth client-credentials token exchange (POST /v1/oauth/access_token, 1-hour token) — verified; token is cached in memory and refreshed on expiry
- List campaigns (GET /v1/get-user-campaigns) — verified (also the connection test)
- Suppression-checked export is enforced by the shared helpers and will apply once the add-to-campaign endpoint is verified
- Add prospects to a campaign: NOT implemented — the endpoint path was not verified (config-ready)
- Reply / bounce sync: NOT implemented — no endpoint verified (config-ready)
- Note: Snov.io is primarily a finder / verifier plus drip campaigns; the enrichment APIs (domain search, email finder, LinkedIn-profile enrichment) belong to the enrichment stage, not this one

## Limitations

- Only auth + campaign listing are live. Adding prospects to a campaign, reply sync and bounce sync are config-ready stubs.
- Snov.io drip campaigns can include LinkedIn steps; NxtSend never triggers them — email only.

## Files

- `src/lib/integrations/providers/email-outreach/snov/config.ts`
- `src/lib/integrations/providers/email-outreach/snov/adapter.ts`
- `src/lib/integrations/providers/email-outreach/snov/__tests__/adapter.test.ts`
- `src/components/integrations/email-outreach/SnovPanel.tsx`
