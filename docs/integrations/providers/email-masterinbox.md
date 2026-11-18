# Master Inbox — NxtSend email-outreach integration

> Status: **partially live / config-ready** (see the table below). Verified
> against the official docs on 2026-11-19. No live calls were made while
> building this adapter — no credentials exist in this workspace — and
> nothing here claims a live connection.

- Provider docs: https://masterinbox.com/api
- Base URL: `https://api.masterinbox.com`
- Auth: Bearer API key in the `Authorization` header
- Adapter: `src/lib/integrations/providers/email-outreach/masterinbox/adapter.ts`
- Config: `src/lib/integrations/providers/email-outreach/masterinbox/config.ts`
- Panel: `src/components/integrations/email-outreach/MasterinboxPanel.tsx` (not wired into any page yet)

## Auth setup

1. In Master Inbox: Settings > APIs > Create new key. Keep the key out of client-side code; if one leaks, delete it and create another.
2. Before any live call: confirm one read endpoint (e.g. the reply list) against the public OpenAPI reference at app.masterinbox.com/api-docs.html, then implement the connection test against it.
3. Store the key as the workspace's Master Inbox credential (encrypted in integration_connections).

## What syncs

| Direction | Operation | Status | Endpoint |
|---|---|---|---|
| NxtSend → Master Inbox | Send qualified leads to an email campaign | Not applicable (inbox, not a sequencer) | — |
| Master Inbox → NxtSend | Campaign status | Config-ready | — |
| Master Inbox → NxtSend | Replies | Config-ready | — |
| Master Inbox → NxtSend | Bounced / unsubscribed | Config-ready | — |

Verified endpoints:

| Method | Path | Note |
|---|---|---|
| — | — | No endpoint verified yet. |

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

- `MASTERINBOX_API_KEY` — Master Inbox API key (Settings > APIs > Create new key). Per-account, named, revocable. Header scheme not verified — see the adapter notes; no live call is made until a read endpoint is verified.
- `MASTERINBOX_BASE_URL` — optional base-URL override for a per-instance host.

Credentials are read from the encrypted `integration_connections` store
(Stage 1 engine), not from `process.env`. The names above are the
conventional operator-facing names for the credential that seeds a
connection. Never commit a key, and never log one.

## What is config-ready vs pending

- Connection test — no read endpoint path was verified against the public OpenAPI reference at app.masterinbox.com/api-docs.html.
- Sync replies — the reply-list endpoint path was not verified (Master Inbox reports 215 endpoints in 30 groups; the exact paths were not in the fetched docs).
- Sync bounced / unsubscribed — no endpoint verified.
- Send leads to a campaign — Master Inbox is an inbox, not a sequencer; there is no send operation to implement.

## Capabilities

- Unified-inbox aggregator for replies from Instantly, Smartlead, EmailBison, Reply.io, Lemlist and others — NxtSend does NOT send campaigns through Master Inbox
- Connection test, reply sync, bounce sync: NOT implemented — no endpoint path was verified against the public OpenAPI reference (config-ready)
- Suppression-checked export is enforced by the shared helpers and will apply to any future write operation

## Limitations

- Nothing in this adapter is live yet — every operation is a config-ready stub. This is deliberate: no endpoint path was verified.
- Master Inbox does not send campaigns, so there will never be a send-leads operation for this provider.

## Files

- `src/lib/integrations/providers/email-outreach/masterinbox/config.ts`
- `src/lib/integrations/providers/email-outreach/masterinbox/adapter.ts`
- `src/lib/integrations/providers/email-outreach/masterinbox/__tests__/adapter.test.ts`
- `src/components/integrations/email-outreach/MasterinboxPanel.tsx`
