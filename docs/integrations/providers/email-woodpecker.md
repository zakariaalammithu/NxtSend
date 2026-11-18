# Woodpecker — NxtSend email-outreach integration

> Status: **partially live / config-ready** (see the table below). Verified
> against the official docs on 2026-11-19. No live calls were made while
> building this adapter — no credentials exist in this workspace — and
> nothing here claims a live connection.

- Provider docs: https://developers.woodpecker.co/
- Base URL: `https://api.woodpecker.co/rest`
- Auth: API key in the `X-API-Key` header
- Adapter: `src/lib/integrations/providers/email-outreach/woodpecker/adapter.ts`
- Config: `src/lib/integrations/providers/email-outreach/woodpecker/config.ts`
- Panel: `src/components/integrations/email-outreach/WoodpeckerPanel.tsx` (not wired into any page yet)

## Auth setup

1. In Woodpecker: log in at app.woodpecker.co > Marketplace > Integrations > API keys > Create a key. Keys are user-specific — each user only sees their own.
2. Store the key as the workspace's Woodpecker credential (encrypted in integration_connections). Verify with the connection test (GET /v1/me) before any send.

## What syncs

| Direction | Operation | Status | Endpoint |
|---|---|---|---|
| NxtSend → Woodpecker | Send qualified leads to an email campaign | Live (mock-tested) | `POST /v1/add_prospects_campaign` |
| Woodpecker → NxtSend | Campaign status | Live (mock-tested) | `GET /v1/campaigns` (list + find) |
| Woodpecker → NxtSend | Replies | Config-ready | — |
| Woodpecker → NxtSend | Bounced / unsubscribed | Live (mock-tested) | `GET /v1/prospects` |

Verified endpoints:

| Method | Path | Note |
|---|---|---|
| `GET` | `/v1/me` | Connection test — returns the authenticated user. |
| `GET` | `/v1/prospects` | Search / list prospects (search={field}={value}, campaigns_details=true). |
| `POST` | `/v1/add_prospects_list` | Add prospects to the global prospect list (up to 20,000 per request). Not called by the adapter — the campaign variant is used instead. |
| `POST` | `/v1/add_prospects_campaign` | Add prospects to a campaign prospect list ({ campaign: { campaign_id }, prospects: [{ email, first_name, last_name, company, ... }] }, up to 20,000 per request). Prospects whose global status is not ACTIVE are rejected unless force is used — the adapter does not force. |
| `POST` | `/v2/campaigns` | Create a campaign (v2). Not called by the adapter — listed for the operator. |

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

- `WOODPECKER_API_KEY` — Woodpecker API key (Marketplace > Integrations > API keys > Create a key). User-specific. Sent in the x-api-key header.

Credentials are read from the encrypted `integration_connections` store
(Stage 1 engine), not from `process.env`. The names above are the
conventional operator-facing names for the credential that seeds a
connection. Never commit a key, and never log one.

## What is config-ready vs pending

- Sync replies — no Woodpecker reply endpoint was verified against developers.woodpecker.co.

## Capabilities

- Connection test (GET /v1/me) — verified
- List / search prospects (GET /v1/prospects, campaigns_details=true) — verified
- Add prospects to a campaign (POST /v1/add_prospects_campaign, { campaign: { campaign_id }, prospects: [...] }, up to 20,000 per request) — verified against the official docs
- Suppression-checked export — a suppressed lead is never sent
- Prospect statuses ACTIVE / BLACKLIST / BOUNCED / INVALID / REPLIED are the verified vocabulary; BOUNCED and BLACKLIST feed the NxtSend suppression list
- Reply sync: NOT implemented — no reply endpoint verified (config-ready)

## Limitations

- Reply sync is a config-ready stub.
- Prospects whose global status is not ACTIVE are rejected by the campaign-add endpoint unless forced; the adapter never forces, so a previously bounced / replied prospect is skipped with an error, not re-enrolled.
- Woodpecker campaigns can include LinkedIn steps; NxtSend never triggers them — email only.

## Files

- `src/lib/integrations/providers/email-outreach/woodpecker/config.ts`
- `src/lib/integrations/providers/email-outreach/woodpecker/adapter.ts`
- `src/lib/integrations/providers/email-outreach/woodpecker/__tests__/adapter.test.ts`
- `src/components/integrations/email-outreach/WoodpeckerPanel.tsx`
