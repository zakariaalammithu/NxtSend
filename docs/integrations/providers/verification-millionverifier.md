# MillionVerifier — Email Verification

Status: **Implemented** (mock-tested; live use needs a real API key).

- Adapter: `src/lib/integrations/providers/verification/millionverifier/adapter.ts`
- Config: `src/lib/integrations/providers/verification/millionverifier/config.ts`
- Tests: `src/lib/integrations/providers/verification/millionverifier/__tests__/adapter.test.ts`
- Panel: `src/components/integrations/verification/MillionVerifierPanel.tsx`
- Docs: https://developer.millionverifier.com

## Auth

- Base URL: `https://api.millionverifier.com`
- The API key is passed as the `api` query parameter
  (`GET /api/v3/?api=<key>&email=&timeout=`). The key never appears in
  logs (redacted by the Stage-1 client).
- Env var: `MILLIONVERIFIER_API_KEY`.

## Endpoints used (verified against MillionVerifier's official docs, 2026-11-19)

| Operation | Endpoint |
| --- | --- |
| Verify one email | `GET /api/v3/?api=<key>&email=<email>&timeout=<2..60>` |
| Credit balance | `GET /api/v3/credits?api=<key>` |

## Classifications — preserved VERBATIM

The `result` field is stored exactly as returned; it is never normalised
into a generic verdict:

| `result` | Meaning |
| --- | --- |
| `ok` | Deliverable |
| `catch_all` | Catch-all domain |
| `unknown` | Could not be determined |
| `error` | Provider-side error (see below) |
| `disposable` | Disposable address |
| `invalid` | Undeliverable |

Also stored verbatim: `subresult`, `quality`, `free`, `role`,
`didyoumean`, `credits`.

## Auth-failure quirk (handled in the adapter)

Auth failures return **HTTP 200 with `result: "error"`** — not a 401. The
adapter throws `provider_verification_error` for that case instead of
storing `"error"` as a classification.

## Credit model (per MillionVerifier docs)

- 1 credit per verification.
- Credits never expire.
- HTTP 402 when the balance is exhausted.
- Rate limit: 160 requests/second.

## Bulk verification

The bulk file API lives on a separate host (`bulkapi.millionverifier.com`,
multipart upload) and is **not** used. Bulk runs as sequential single
checks through one Stage-1 sync job (dedupe by email; optional per-lead
persistence via the caller's `updateLead` callback).

## How results are stored

The verbatim classification + substatus are stored under
`custom_fields["email_verification_millionverifier"]`. The lead's email
address is **never changed** by verification.

## Pending / config-ready

- None for the implemented operations.
