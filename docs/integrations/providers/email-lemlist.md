# Lemlist — NxtSend email-outreach integration

> Status: **partially live / config-ready** (see the table below). Verified
> against the official docs on 2026-11-19. No live calls were made while
> building this adapter — no credentials exist in this workspace — and
> nothing here claims a live connection.

- Provider docs: https://developer.lemlist.com/
- Base URL: `https://api.lemlist.com/api`
- Auth: HTTP Basic auth (empty username, API key as password)
- Adapter: `src/lib/integrations/providers/email-outreach/lemlist/adapter.ts`
- Config: `src/lib/integrations/providers/email-outreach/lemlist/config.ts`
- Panel: `src/components/integrations/email-outreach/LemlistPanel.tsx` (not wired into any page yet)

## Auth setup

1. In Lemlist: log in at app.lemlist.com > Settings > Integrations > API Key > Generate a new API key. Copy it immediately — it is not shown again.
2. Store the key as the workspace's Lemlist credential (encrypted in integration_connections). Verify with the connection test (GET /campaigns) before any send.

## What syncs

| Direction | Operation | Status | Endpoint |
|---|---|---|---|
| NxtSend → Lemlist | Send qualified leads to an email campaign | Live (mock-tested) | `POST /campaigns/{id}/leads` |
| Lemlist → NxtSend | Campaign status | Live (mock-tested) | `GET /campaigns` (list + find) |
| Lemlist → NxtSend | Replies | Config-ready | — |
| Lemlist → NxtSend | Bounced / unsubscribed | Config-ready | — |

Verified endpoints:

| Method | Path | Note |
|---|---|---|
| `GET` | `/campaigns` | List campaigns (also the connection test). Supports page/limit or cursor pagination. |
| `GET` | `/campaigns/{campaignId}/leads` | List leads in a campaign. |
| `POST` | `/campaigns/{campaignId}/leads` | Add one lead to a campaign ({ email, firstName, ... }). |

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

- `LEMLIST_API_KEY` — Lemlist API key (Settings > Integrations > API Key). HTTP Basic auth with an empty username and the key as the password (base64 of ':<key>').

Credentials are read from the encrypted `integration_connections` store
(Stage 1 engine), not from `process.env`. The names above are the
conventional operator-facing names for the credential that seeds a
connection. Never commit a key, and never log one.

## What is config-ready vs pending

- Sync replies — no Lemlist activities endpoint path was verified.
- Sync bounced / unsubscribed — the unsubscribes resource exists in client libraries but its endpoint path was not verified against developer.lemlist.com.

## Capabilities

- List campaigns (GET /campaigns) — verified
- List / add leads in a campaign (GET /campaigns/{id}/leads, POST /campaigns/{id}/leads) — verified
- Suppression-checked export — a suppressed lead is never sent
- Campaign status is read from the campaign list (no separate single-campaign GET is used)
- Reply sync: NOT implemented — no activities endpoint verified (config-ready)
- Bounce / unsubscribe sync: NOT implemented — no unsubscribe-list endpoint path verified (config-ready)

## Limitations

- Reply and bounce/unsubscribe sync are config-ready stubs.
- Lemlist's LinkedIn steps are never used by this adapter — email only.

## Files

- `src/lib/integrations/providers/email-outreach/lemlist/config.ts`
- `src/lib/integrations/providers/email-outreach/lemlist/adapter.ts`
- `src/lib/integrations/providers/email-outreach/lemlist/__tests__/adapter.test.ts`
- `src/components/integrations/email-outreach/LemlistPanel.tsx`
