# SmartReach — NxtSend email-outreach integration

> Status: **partially live / config-ready** (see the table below). Verified
> against the official docs on 2026-11-19. No live calls were made while
> building this adapter — no credentials exist in this workspace — and
> nothing here claims a live connection.

- Provider docs: https://help.smartreach.io/
- Base URL: `https://api.smartreach.io/api/v1`
- Auth: API key in the `X-API-Key` header
- Adapter: `src/lib/integrations/providers/email-outreach/smartreach/adapter.ts`
- Config: `src/lib/integrations/providers/email-outreach/smartreach/config.ts`
- Panel: `src/components/integrations/email-outreach/SmartReachPanel.tsx` (not wired into any page yet)

## Auth setup

1. In SmartReach: Settings > Integrations > SmartReach API > Get API Key > Generate New API Key > Confirm. (API access is not on the Email Outreach Basic / Sales Engagement Basic plans.)
2. Store the key as the workspace's SmartReach credential (encrypted in integration_connections). Verify with the connection test (GET /campaigns) before any send.

## What syncs

| Direction | Operation | Status | Endpoint |
|---|---|---|---|
| NxtSend → SmartReach | Send qualified leads to an email campaign | Partial — creates prospects; campaign assignment is config-ready | `POST /prospects`, then assignment (config-ready) |
| SmartReach → NxtSend | Campaign status | Live (mock-tested) | `GET /campaigns` (list + find) |
| SmartReach → NxtSend | Replies | Config-ready | — |
| SmartReach → NxtSend | Bounced / unsubscribed | Config-ready | — |

Verified endpoints:

| Method | Path | Note |
|---|---|---|
| `GET` | `/campaigns` | List campaigns (also the connection test). |
| `GET` | `/campaigns/{id}` | Get one campaign. |
| `GET` | `/prospects` | List prospects (paged, up to 500 per page). |
| `POST` | `/prospects` | Add a new prospect. |
| `GET` | `/prospects/{id}` | Get one prospect. |

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

- `SMARTREACH_API_KEY` — SmartReach REST API key (Settings > Integrations > SmartReach API > Get API Key > Generate New API Key). Sent in the X-API-KEY header.

Credentials are read from the encrypted `integration_connections` store
(Stage 1 engine), not from `process.env`. The names above are the
conventional operator-facing names for the credential that seeds a
connection. Never commit a key, and never log one.

## What is config-ready vs pending

- Assign prospect to campaign by email — the action is documented (Make / Ibexa modules), but the endpoint path was not verified, so the export stops after creating prospects and reports this step as config-ready.
- Add email / domain to DNC — action names documented, endpoint paths not verified.
- Sync replies — no SmartReach reply endpoint verified.
- Sync bounced / unsubscribed — no status endpoint verified.

## Capabilities

- List campaigns and get one campaign (GET /campaigns, GET /campaigns/{id}) — verified
- List / get prospects (GET /prospects, GET /prospects/{id}) — verified
- Create prospects (POST /prospects) — verified; used by the export flow
- Assign prospect to campaign: NOT implemented — the endpoint path was not verified, so sendLeadsToEmailCampaign creates prospects and then reports the assignment step as config-ready (nothing is silently enrolled)
- Add email / domain to DNC: NOT implemented — action names are documented, paths are not (config-ready)
- Reply sync: NOT implemented — no reply endpoint verified (config-ready)

## Limitations

- The export flow creates prospects but cannot yet enroll them in a campaign — the assign step is config-ready. Prospects created this way do not receive email until they are assigned in SmartReach.
- Reply and bounce sync are config-ready stubs.

## Files

- `src/lib/integrations/providers/email-outreach/smartreach/config.ts`
- `src/lib/integrations/providers/email-outreach/smartreach/adapter.ts`
- `src/lib/integrations/providers/email-outreach/smartreach/__tests__/adapter.test.ts`
- `src/components/integrations/email-outreach/SmartReachPanel.tsx`
