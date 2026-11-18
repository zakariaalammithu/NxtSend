# Hunter Email Verifier — Email Verification

Status: **Implemented** (mock-tested; live use needs a real API key).

- Adapter: `src/lib/integrations/providers/verification/hunter-verifier/adapter.ts`
- Config: `src/lib/integrations/providers/verification/hunter-verifier/config.ts`
- Tests: `src/lib/integrations/providers/verification/hunter-verifier/__tests__/adapter.test.ts`
- Panel: `src/components/integrations/verification/HunterVerifierPanel.tsx`
- Docs: https://hunter.io/api-documentation

## Auth

- Base URL: `https://api.hunter.io/v2`
- Header: `X-API-KEY: <key>` (the adapter uses the header so the key never
  lands in a URL).
- Env var: `HUNTER_API_KEY` — **shared with the Hunter.io enrichment
  adapter**.

## Endpoints used (verified against Hunter's official docs, 2026-11-19)

| Operation | Endpoint |
| --- | --- |
| Verify one email | `GET /email-verifier?email=` |
| Remaining verifications | `GET /account` |

## Classifications — preserved VERBATIM

`data.status` is stored exactly as returned:

`deliverable`, `undeliverable`, `risky`, `unknown`

Also stored verbatim: `data.score`, `regexp`, `gibberish`, `disposable`,
`webmail`, `mx_records`, `smtp_server`, `smtp_check`, `accept_all`,
`block`, `sources`.

## Credit model (per Hunter docs)

- 1 verification credit per check.
- Rate limits: verifier 10 requests/second, 300 requests/minute.

## Bulk verification

Hunter has no bulk verifier endpoint, so bulk runs as sequential single
checks through one Stage-1 sync job (dedupe by email; optional per-lead
persistence via the caller's `updateLead` callback).

## How results are stored

The verbatim classification is stored under
`custom_fields["email_verification_hunter"]`. The lead's email address is
**never changed** by verification.

## Pending / config-ready

- None for the implemented operations. This adapter is the
  **verification** one only — Hunter's email-campaign operations belong
  to the email-outreach worker, not this adapter.
