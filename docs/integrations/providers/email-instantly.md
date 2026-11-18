# Instantly — NxtSend email-outreach integration

> Status: **partially live / config-ready** (see the table below). Verified
> against the official docs on 2026-11-19. No live calls were made while
> building this adapter — no credentials exist in this workspace — and
> nothing here claims a live connection.

- Provider docs: https://developer.instantly.ai/
- Base URL: `https://api.instantly.ai/api/v2`
- Auth: Bearer API key in the `Authorization` header
- Adapter: `src/lib/integrations/providers/email-outreach/instantly/adapter.ts`
- Config: `src/lib/integrations/providers/email-outreach/instantly/config.ts`
- Panel: `src/components/integrations/email-outreach/InstantlyPanel.tsx` (not wired into any page yet)

## Auth setup

1. In Instantly: Settings > Integrations > API Keys > Create API Key, Version 2 (v1 keys do not work on v2 endpoints). Give the key only the scopes it needs (campaigns:read, leads:create at minimum). API access needs the Growth plan or above.
2. Store the key as the workspace's Instantly credential (encrypted in integration_connections). Never paste it into code, logs, or chat.
3. Verify with the adapter's connection test (GET /workspaces/current) before any send.

## What syncs

| Direction | Operation | Status | Endpoint |
|---|---|---|---|
| NxtSend → Instantly | Send qualified leads to an email campaign | Live (mock-tested) | `POST /leads/add` |
| Instantly → NxtSend | Campaign status | Live (mock-tested) | `GET /campaigns` (list + find) |
| Instantly → NxtSend | Replies | Config-ready | — |
| Instantly → NxtSend | Bounced / unsubscribed | Config-ready | — |

Verified endpoints:

| Method | Path | Note |
|---|---|---|
| `GET` | `/workspaces/current` | Connection test — returns the current workspace. |
| `GET` | `/campaigns` | List campaigns. |
| `POST` | `/campaigns` | Create a campaign (draft; sends nothing on its own). Not called by the adapter — listed for the operator. |
| `POST` | `/leads/add` | Add up to 1,000 leads to a campaign or list (campaign_id or list_id; each lead needs an email). |
| `POST` | `/leads` | Create a single lead. Not called by the adapter — listed for the operator. |
| `GET` | `/leads/list` | List leads. Not called by the adapter — listed for the operator. |

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

- `INSTANTLY_API_KEY` — Instantly API v2 key (Settings > Integrations > API Keys, Version 2; Growth plan or above). Sent as a Bearer token.

Credentials are read from the encrypted `integration_connections` store
(Stage 1 engine), not from `process.env`. The names above are the
conventional operator-facing names for the credential that seeds a
connection. Never commit a key, and never log one.

## What is config-ready vs pending

- Sync replies — no Instantly reply-read endpoint was verified against developer.instantly.ai.
- Sync bounced / unsubscribed — no Instantly bounce or unsubscribe endpoint was verified.

## Capabilities

- List campaigns (GET /campaigns) — verified
- Add up to 1,000 leads to a campaign in one call (POST /leads/add) with an idempotency key, so a retried batch does not duplicate leads — verified
- Suppression-checked export — a suppressed lead is never sent
- Campaign status is read from the campaign list (no separate status endpoint is used)
- Reply sync: NOT implemented — no reply endpoint verified (config-ready)
- Bounce / unsubscribe sync: NOT implemented — no endpoint verified (config-ready)

## Limitations

- Reply and bounce/unsubscribe sync are config-ready stubs (see above) — NxtSend cannot yet read Instantly replies or bounces.
- Adding leads to a campaign does not start the campaign; starting/pausing is done in Instantly itself.

## Files

- `src/lib/integrations/providers/email-outreach/instantly/config.ts`
- `src/lib/integrations/providers/email-outreach/instantly/adapter.ts`
- `src/lib/integrations/providers/email-outreach/instantly/__tests__/adapter.test.ts`
- `src/components/integrations/email-outreach/InstantlyPanel.tsx`
