# ZeroBounce — Email Verification

Status: **Implemented** (mock-tested; live use needs a real API key).

- Adapter: `src/lib/integrations/providers/verification/zerobounce/adapter.ts`
- Config: `src/lib/integrations/providers/verification/zerobounce/config.ts`
- Tests: `src/lib/integrations/providers/verification/zerobounce/__tests__/adapter.test.ts`
- Panel: `src/components/integrations/verification/ZeroBouncePanel.tsx`
- Docs: https://www.zerobounce.net/docs/email-validation-api-quickstart/v2-validate-emails

## Auth

- Base URL: `https://api.zerobounce.net/v2/` (regional `api-us` / `api-eu`
  hosts also exist; the adapter uses the global host).
- The API key is passed as the `api_key` query parameter.
- Env var: `ZEROBOUNCE_API_KEY`.

## Endpoints used (verified against ZeroBounce's official docs, 2026-11-19)

| Operation | Endpoint |
| --- | --- |
| Validate one email | `GET /v2/validate?api_key=&email=&ip_address=` |
| Batch validation (up to 100) | `POST /v2/validatebatch` with `{ api_key, email_batch: [{ email_address, ip_address }] }` |
| Credit balance | `GET /v2/getcredits` |

## Classifications — preserved VERBATIM

The `status` field is stored exactly as returned (lowercase, hyphenated
where the provider hyphenates it):

`valid`, `invalid`, `catch-all`, `unknown`, `spamtrap`, `abuse`,
`do_not_mail`

Also stored verbatim: `sub_status`, `did_you_mean`, `free_email`,
`mx_found`.

## Credit model (per ZeroBounce docs)

- 1 credit per validation.
- `unknown` results cost **0 credits** (the adapter records no usage for
  them).

## Bulk verification

Bulk uses the native `validatebatch` endpoint in chunks of 100, through
one Stage-1 sync job. If a batch call fails, that chunk falls back to
single checks so no email is silently dropped.

## How results are stored

The verbatim classification + substatus are stored under
`custom_fields["email_verification_zerobounce"]`. The lead's email address
is **never changed** by verification.

## Pending / config-ready

- None for the implemented operations.
