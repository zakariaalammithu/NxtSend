# SalesQL — Lead Enrichment

Status: **Implemented** (mock-tested; live use needs a real API key).
Company enrichment is config-ready only (endpoint unverified).

- Adapter: `src/lib/integrations/providers/enrichment/salesql/adapter.ts`
- Config: `src/lib/integrations/providers/enrichment/salesql/config.ts`
- Tests: `src/lib/integrations/providers/enrichment/salesql/__tests__/adapter.test.ts`
- Panel: `src/components/integrations/enrichment/SalesQlPanel.tsx`
- Docs: https://salesql.com/api

## Auth

- Base URL: `https://api-public.salesql.com/v1`
- Header: `Authorization: Bearer <key>`.
- Env var: `SALESQL_API_KEY`.

## Endpoints used (verified against SalesQL's official API docs, 2026-11-19)

| Operation | Endpoint |
| --- | --- |
| Enrich a person | `GET /persons/enrich?linkedin_url=` or `?email=` or `?first_name=&last_name=&company=` |

Response shape: `full_name`, `title`, `emails: [{ email, status }]`,
`phones: [{ phone, type, is_valid }]`. Email `status` (e.g. `"Valid"`) and
phone `is_valid` are preserved verbatim on the returned fields.

## Credit model (per SalesQL docs)

- 1 credit per matched person.
- A 404 means the person is not in the database and **costs no credit** —
  the adapter returns an unmatched result (0 credits) instead of throwing.

## How results are stored

Known lead columns are written directly; everything else goes under
`custom_fields["enrichment_salesql"]` with confidence and `checked_at`.
Bulk enrichment runs through a Stage-1 sync job (dedupe by email).

## Pending / config-ready

- **Bulk endpoint**: SalesQL documents `POST /enrich/bulk` (×100) on
  salesql.com/api, but the request schema could not be verified, so bulk
  runs as sequential single calls. Wire the native bulk endpoint once its
  schema is confirmed.
- **Company enrichment**: no company-enrichment endpoint path could be
  verified, so `enrichCompany` throws `provider_endpoint_unverified`
  rather than guessing a path.
