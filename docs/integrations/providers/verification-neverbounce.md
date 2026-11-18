# NeverBounce — Email Verification

Status: **Implemented** (mock-tested; live use needs a real v4 API key).

- Adapter: `src/lib/integrations/providers/verification/neverbounce/adapter.ts`
- Config: `src/lib/integrations/providers/verification/neverbounce/config.ts`
- Tests: `src/lib/integrations/providers/verification/neverbounce/__tests__/adapter.test.ts`
- Panel: `src/components/integrations/verification/NeverBouncePanel.tsx`
- Docs: https://developers.neverbounce.com/v4.0/

## Auth

- Base URL: `https://api.neverbounce.com/v4`
- The key (starts with `secret_...`) is passed as the `key` query
  parameter. **v3 credentials do NOT work with v4.**
- Env var: `NEVERBOUNCE_API_KEY`.

## Endpoints used (verified against NeverBounce's official v4 docs, 2026-11-19)

| Operation | Endpoint |
| --- | --- |
| Verify one email | `POST /v4/single/check?key=&email=` |
| Account + credits | `GET /v4/account/info` |

## Classifications — preserved VERBATIM

The `result` field is stored exactly as returned:

`valid`, `invalid`, `disposable`, `catchall`, `unknown`

Also stored verbatim: `flags`, `suggested_correction`, `credits_info`,
`address_info`.

## Credit model (per NeverBounce docs)

- 1 credit per single check (recorded to the migration-030
  `integration_usage` table as `neverbounce.single.check`).

## Bulk verification — read this before using it

The Jobs API (`/v4/jobs/create`, `/status`, `/parse`, `/search`,
`/delete`) is **form-encoded**, which the Stage-1 `ProviderHttpClient`
does not send (JSON only), so bulk runs as sequential single checks
through one Stage-1 sync job.

**Provider warning:** NeverBounce's own guidance warns against using
single checks to clean an existing list one-by-one (account-lock risk).
For list cleaning, wire the Jobs API (form-encoded client) or use
another provider in this batch (ZeroBounce's native batch, for example).

## How results are stored

The verbatim classification + flags are stored under
`custom_fields["email_verification_neverbounce"]`. The lead's email
address is **never changed** by verification.

## Pending / config-ready

- Jobs API support (needs a form-encoded request path in the client).
