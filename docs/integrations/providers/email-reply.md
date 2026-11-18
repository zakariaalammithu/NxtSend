# Reply.io — NxtSend email-outreach integration

> Status: **partially live / config-ready** (see the table below). Verified
> against the official docs on 2026-11-19. No live calls were made while
> building this adapter — no credentials exist in this workspace — and
> nothing here claims a live connection.

- Provider docs: https://docs.reply.io
- Base URL: `https://api.reply.io`
- Auth: API key in the `X-API-Key` header
- Adapter: `src/lib/integrations/providers/email-outreach/reply/adapter.ts`
- Config: `src/lib/integrations/providers/email-outreach/reply/config.ts`
- Panel: `src/components/integrations/email-outreach/ReplyPanel.tsx` (not wired into any page yet)

## Auth setup

1. In Reply.io: Settings > API Key. Create a key with only the scopes the integration needs (Contacts at minimum).
2. Store the key as the workspace's Reply.io credential (encrypted in integration_connections). Verify with the connection test before any send.

## What syncs

| Direction | Operation | Status | Endpoint |
|---|---|---|---|
| NxtSend → Reply.io | Send qualified leads to an email campaign | Live (mock-tested) | `POST /v1/people` |
| Reply.io → NxtSend | Campaign status | Config-ready | — |
| Reply.io → NxtSend | Replies | Config-ready | — |
| Reply.io → NxtSend | Bounced / unsubscribed | Config-ready | — |

Verified endpoints:

| Method | Path | Note |
|---|---|---|
| `POST` | `/v1/people` | Upsert a contact by email (creates or updates; supports linkedInUrl). Verified via the Reply.io destination docs. |
| `POST` | `/v1/people/{email}` | Update an existing contact by email. Verified via the same source. |

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

- `REPLY_API_KEY` — Reply.io API key (Settings > API Key). Scoped per key; send it in the X-Api-Key header (Authorization: Bearer <key> also accepted).

Credentials are read from the encrypted `integration_connections` store
(Stage 1 engine), not from `process.env`. The names above are the
conventional operator-facing names for the credential that seeds a
connection. Never commit a key, and never log one.

## What is config-ready vs pending

- Connection test — GET /v1/people is a collection GET inferred from the verified POST /v1/people resource; it is flagged UNVERIFIED in the adapter and must be confirmed against docs.reply.io before it is relied on.
- List sequences / sync campaign status — no v3 sequence endpoint path was verified.
- Sync replies — no v3 inbox endpoint path was verified.
- Sync bounced / unsubscribed — no v3 endpoint path was verified.

## Capabilities

- Upsert contacts (POST /v1/people — email is the unique identifier; linkedInUrl is a supported field) — verified
- Suppression-checked export — a suppressed lead is never sent
- Sequence / campaign status, reply and bounce sync: NOT implemented — v3 endpoint paths were not verified (config-ready)
- Campaign push on upsert: the campaign id is passed in the upsert body, but that field name was NOT verified — confirm at docs.reply.io before relying on enrollment

## Limitations

- Sequence status, reply and bounce sync are config-ready stubs — v3 paths were not verified.
- Campaign enrollment via the upsert body field is unverified (see above).
- Reply.io sequences are multichannel (email, LinkedIn, calls, SMS, WhatsApp). NxtSend uses the email side only and never triggers LinkedIn steps.

## Files

- `src/lib/integrations/providers/email-outreach/reply/config.ts`
- `src/lib/integrations/providers/email-outreach/reply/adapter.ts`
- `src/lib/integrations/providers/email-outreach/reply/__tests__/adapter.test.ts`
- `src/components/integrations/email-outreach/ReplyPanel.tsx`
