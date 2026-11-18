# EmailBison — NxtSend email-outreach integration

> Status: **partially live / config-ready** (see the table below). Verified
> against the official docs on 2026-11-19. No live calls were made while
> building this adapter — no credentials exist in this workspace — and
> nothing here claims a live connection.

- Provider docs: https://docs.emailbison.com/
- Base URL: `https://dedi.emailbison.com`
- Auth: Bearer API key in the `Authorization` header
- Adapter: `src/lib/integrations/providers/email-outreach/emailbison/adapter.ts`
- Config: `src/lib/integrations/providers/email-outreach/emailbison/config.ts`
- Panel: `src/components/integrations/email-outreach/EmailBisonPanel.tsx` (not wired into any page yet)

## Auth setup

1. In EmailBison: Settings > Developer API > New API Token. The token is scoped to the workspace where it was created.
2. Confirm the workspace's instance host first (EmailBison is privately hosted — there is no single shared login page). Set EMAILBISON_BASE_URL when the host differs from https://dedi.emailbison.com.
3. Store the token as the workspace's EmailBison credential (encrypted in integration_connections). Verify with the connection test (GET /api/users).

## What syncs

| Direction | Operation | Status | Endpoint |
|---|---|---|---|
| NxtSend → EmailBison | Send qualified leads to an email campaign | Config-ready | — |
| EmailBison → NxtSend | Campaign status | Config-ready | — |
| EmailBison → NxtSend | Replies | Config-ready | — |
| EmailBison → NxtSend | Bounced / unsubscribed | Config-ready | — |

Verified endpoints:

| Method | Path | Note |
|---|---|---|
| `GET` | `/api/users` | Connection test — returns the authenticated user's account details. Verified against the public API reference at dedi.emailbison.com/api/reference. |

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

- `EMAILBISON_API_KEY` — EmailBison API token (Settings > Developer API > New API Token). Scoped to the workspace where it was created. Sent as a Bearer token.
- `EMAILBISON_BASE_URL` — optional base-URL override for a per-instance host.

Credentials are read from the encrypted `integration_connections` store
(Stage 1 engine), not from `process.env`. The names above are the
conventional operator-facing names for the credential that seeds a
connection. Never commit a key, and never log one.

## What is config-ready vs pending

- List campaigns — no campaign-list endpoint path was verified.
- Add leads to a campaign — the docs describe a leads endpoint plus an attach-to-campaign endpoint taking {campaign_id} and a lead_ids array, but the literal paths were not in the fetched reference text, so nothing is called.
- Sync replies — no reply endpoint verified.
- Sync bounced / unsubscribed — no bounce endpoint verified.

## Capabilities

- Connection test only (GET /api/users) — verified
- Campaign list, lead add / attach, reply and bounce sync: NOT implemented — endpoint paths were not verified against docs.emailbison.com (config-ready)
- Suppression-checked export is enforced by the shared helpers and will apply once the lead endpoints are verified

## Limitations

- Only the connection test is live. Every sync operation is a config-ready stub until its endpoint path is verified against the EmailBison API reference.

## Files

- `src/lib/integrations/providers/email-outreach/emailbison/config.ts`
- `src/lib/integrations/providers/email-outreach/emailbison/adapter.ts`
- `src/lib/integrations/providers/email-outreach/emailbison/__tests__/adapter.test.ts`
- `src/components/integrations/email-outreach/EmailBisonPanel.tsx`
