# Bouncer — Email Verification

Status: **Implemented** (mock-tested; live use needs a real API key).
Batch verification is sequential single checks (batch result-retrieval
path unverified).

- Adapter: `src/lib/integrations/providers/verification/bouncer/adapter.ts`
- Config: `src/lib/integrations/providers/verification/bouncer/config.ts`
- Tests: `src/lib/integrations/providers/verification/bouncer/__tests__/adapter.test.ts`
- Panel: `src/components/integrations/verification/BouncerPanel.tsx`
- Docs: https://www.usebouncer.com/api-documentation/

## Auth

- Base URL: `https://api.usebouncer.com`
- Header: `x-api-key: <key>`.
- Env var: `BOUNCER_API_KEY`.

## Endpoints used (verified against Bouncer's official docs, 2026-11-19)

| Operation | Endpoint |
| --- | --- |
| Verify one email | `GET /v1.1/email/verify?email=` |
| Credit balance | `GET /v1.1/credits` |

## Classifications — preserved VERBATIM

The `status` field is stored exactly as returned:

`deliverable`, `risky`, `undeliverable`, `unknown`

Also stored verbatim: `reason` (e.g. `low_quality`, `accepted_email`),
`score`, and the domain/account flags (strings `yes` / `no` /
`unknown`).

## Credit model (per Bouncer docs)

- 1 credit per verification.
- HTTP 402 when credits are exhausted.

## Bulk verification

`POST /v1.1/email/verify/batch` exists, but its result-retrieval path
could not be verified, so bulk runs as sequential single checks through
one Stage-1 sync job. Wire the native batch endpoint once its retrieval
flow is confirmed.

## How results are stored

The verbatim classification + reason are stored under
`custom_fields["email_verification_bouncer"]`. The lead's email address
is **never changed** by verification.

## Pending / config-ready

- Native batch verification (result-retrieval path unverified).
