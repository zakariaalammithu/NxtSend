# Mailshake — NxtSend email-outreach integration

> Status: **partially live / config-ready** (see the table below). Verified
> against the official docs on 2026-11-19. No live calls were made while
> building this adapter — no credentials exist in this workspace — and
> nothing here claims a live connection.

- Provider docs: https://api-docs.mailshake.com/
- Base URL: `https://api.mailshake.com/2017-04-01`
- Auth: HTTP Basic auth (empty username, API key as password)
- Adapter: `src/lib/integrations/providers/email-outreach/mailshake/adapter.ts`
- Config: `src/lib/integrations/providers/email-outreach/mailshake/config.ts`
- Panel: `src/components/integrations/email-outreach/MailshakePanel.tsx` (not wired into any page yet)

## Auth setup

1. In Mailshake: Extensions > API > Create API Key.
2. Store the key as the workspace's Mailshake credential (encrypted in integration_connections). Verify with the connection test (GET /me) before any send.
3. A campaign created via the API cannot be sent until the user finishes the wizard in Mailshake's UI — add recipients only to campaigns that are ready.

## What syncs

| Direction | Operation | Status | Endpoint |
|---|---|---|---|
| NxtSend → Mailshake | Send qualified leads to an email campaign | Live (mock-tested) | `POST /recipients/add` |
| Mailshake → NxtSend | Campaign status | Live (mock-tested) | `POST /campaigns/list` (list + find) |
| Mailshake → NxtSend | Replies | Config-ready | — |
| Mailshake → NxtSend | Bounced / unsubscribed | Live (mock-tested) | `POST /recipients/list` |

Verified endpoints:

| Method | Path | Note |
|---|---|---|
| `GET` | `/me` | Connection test — returns the authenticated user. |
| `POST` | `/campaigns/list` | List campaigns (optional search filter). |
| `POST` | `/recipients/list` | List recipients in a campaign (paginated). |
| `POST` | `/recipients/add` | Add recipients to a campaign ({ campaignID, addAsNewList, listOfEmails }). |
| `POST` | `/recipients/unsubscribe` | Unsubscribe recipients ({ emailAddresses: comma-separated }). |
| `POST` | `/leads/create` | Create leads from email addresses in a campaign. Not called by the adapter — listed for the operator. |

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

- `MAILSHAKE_API_KEY` — Mailshake API key (Extensions > API > Create API Key). HTTP Basic auth with the key as the username (curl -u 'key:'). A query-string apiKey is also accepted by Mailshake; the adapter uses Basic auth.

Credentials are read from the encrypted `integration_connections` store
(Stage 1 engine), not from `process.env`. The names above are the
conventional operator-facing names for the credential that seeds a
connection. Never commit a key, and never log one.

## What is config-ready vs pending

- Sync replies — no Mailshake reply endpoint was verified against api-docs.mailshake.com.

## Capabilities

- Connection test (GET /me) — verified
- List campaigns (POST /campaigns/list) — verified
- List recipients (POST /recipients/list) — verified; used for the defensive bounce / unsubscribe read
- Add recipients to a campaign (POST /recipients/add, listOfEmails) — verified
- Unsubscribe recipients (POST /recipients/unsubscribe) — verified (available for pushing suppressions out)
- Suppression-checked export — a suppressed lead is never sent
- Reply sync: NOT implemented — no reply endpoint verified (config-ready)

## Limitations

- Reply sync is a config-ready stub.
- Recipient add carries email addresses only; personalisation fields are not sent by the verified call.
- The bounce read is defensive: only exact 'bounced' / 'unsubscribed' statuses count (vocabulary unverified).

## Files

- `src/lib/integrations/providers/email-outreach/mailshake/config.ts`
- `src/lib/integrations/providers/email-outreach/mailshake/adapter.ts`
- `src/lib/integrations/providers/email-outreach/mailshake/__tests__/adapter.test.ts`
- `src/components/integrations/email-outreach/MailshakePanel.tsx`
