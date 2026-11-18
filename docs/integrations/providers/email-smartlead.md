# Smartlead — NxtSend email-outreach integration

> Status: **partially live / config-ready** (see the table below). Verified
> against the official docs on 2026-11-19. No live calls were made while
> building this adapter — no credentials exist in this workspace — and
> nothing here claims a live connection.

- Provider docs: https://api.smartlead.ai/
- Base URL: `https://server.smartlead.ai/api/v1`
- Auth: API key as the `api_key` query parameter (provider's only auth method)
- Adapter: `src/lib/integrations/providers/email-outreach/smartlead/adapter.ts`
- Config: `src/lib/integrations/providers/email-outreach/smartlead/config.ts`
- Panel: `src/components/integrations/email-outreach/SmartleadPanel.tsx` (not wired into any page yet)

## Auth setup

1. In Smartlead: Settings > API Keys > Generate New API Key. API access needs the Pro plan or higher (hidden on Base / Popular). The key is shown once.
2. Store the key as the workspace's Smartlead credential (encrypted in integration_connections). Never paste it into code, logs, or chat.
3. Verify with the adapter's connection test (GET /campaigns/) before any send.

## What syncs

| Direction | Operation | Status | Endpoint |
|---|---|---|---|
| NxtSend → Smartlead | Send qualified leads to an email campaign | Live (mock-tested) | `POST /campaigns/{id}/leads` |
| Smartlead → NxtSend | Campaign status | Live (mock-tested) | `GET /campaigns/` (list + find) |
| Smartlead → NxtSend | Replies | Config-ready | — |
| Smartlead → NxtSend | Bounced / unsubscribed | Live (mock-tested) | `GET /campaigns/{id}/leads` |

Verified endpoints:

| Method | Path | Note |
|---|---|---|
| `GET` | `/campaigns/` | List campaigns (also the connection test). |
| `POST` | `/campaigns/create` | Create a campaign (draft). Not called by the adapter — listed for the operator. |
| `POST` | `/campaigns/{id}/leads` | Add up to 400 leads per call; body { lead_list: [{ email, first_name, last_name, company_name, custom_fields }] }. Response reports added_count / skipped_count. |
| `GET` | `/campaigns/{id}/leads` | List leads in a campaign, with per-lead status (STARTED / INPROGRESS / COMPLETED / STOPPED / PAUSED / BLOCKED) and email flags (is_bounced, is_replied, is_unsubscribed). |
| `GET` | `/leads/?email=` | Look up a lead by email. Not called by the adapter — listed for the operator. |
| `PATCH` | `/campaigns/{id}/leads/{lead_id}/status` | Update one lead's status. Not called by the adapter — the status value vocabulary for unsubscribing was not verified. |

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

- `SMARTLEAD_API_KEY` — Smartlead API key (Settings > API Keys). Sent as the api_key query parameter on every request — Smartlead's only auth method; it is never sent as a header.

Credentials are read from the encrypted `integration_connections` store
(Stage 1 engine), not from `process.env`. The names above are the
conventional operator-facing names for the credential that seeds a
connection. Never commit a key, and never log one.

## What is config-ready vs pending

- Sync replies — the master-inbox message endpoint path was not verified against api.smartlead.ai.
- Push an unsubscribe into Smartlead — PATCH /campaigns/{id}/leads/{lead_id}/status is verified as an endpoint, but the status value that means 'unsubscribed' was not verified, so the adapter does not call it.
- Start / pause a campaign — POST /campaigns/{id}/status exists, but the docs contradict themselves on the value (START vs ACTIVE); the adapter does not call it.

## Capabilities

- List campaigns (GET /campaigns/) — verified
- Add up to 400 leads per call (POST /campaigns/{id}/leads, { lead_list: [...] }) — verified; the official getting-started guide uses this exact body
- Suppression-checked export — a suppressed lead is never sent
- Campaign-lead status read (GET /campaigns/{id}/leads): BLOCKED / is_bounced / is_unsubscribed feed the NxtSend suppression list — verified endpoint, defensive classification
- Reply sync: NOT implemented — the master-inbox message endpoint path was not verified (config-ready)
- Campaign start / pause is NOT called by the adapter: the docs contradict themselves on the status value (START vs ACTIVE), so it stays manual until confirmed

## Limitations

- The API key travels in the URL query string (Smartlead's design) — treat provider request logs as sensitive.
- Reply sync and campaign start/pause are config-ready stubs (see above).
- BLOCKED covers both a bounce and a global block-list entry in Smartlead, so a BLOCKED lead is suppressed in NxtSend without distinguishing the cause.

## Files

- `src/lib/integrations/providers/email-outreach/smartlead/config.ts`
- `src/lib/integrations/providers/email-outreach/smartlead/adapter.ts`
- `src/lib/integrations/providers/email-outreach/smartlead/__tests__/adapter.test.ts`
- `src/components/integrations/email-outreach/SmartleadPanel.tsx`
