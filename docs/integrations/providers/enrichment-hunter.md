# Hunter.io — Lead Enrichment

Status: **Implemented** (mock-tested; live use needs a real API key).

- Adapter: `src/lib/integrations/providers/enrichment/hunter/adapter.ts`
- Config: `src/lib/integrations/providers/enrichment/hunter/config.ts`
- Tests: `src/lib/integrations/providers/enrichment/hunter/__tests__/adapter.test.ts`
- Panel: `src/components/integrations/enrichment/HunterPanel.tsx`
- Docs: https://hunter.io/api-documentation

## Auth

- Base URL: `https://api.hunter.io/v2`
- Header: `X-API-KEY: <key>` (the adapter uses the header so the key never
  lands in a URL; Hunter also accepts an `api_key` query param or Bearer).
- Env var: `HUNTER_API_KEY` — shared with the Hunter Email Verifier adapter.

## Endpoints used (verified against Hunter's official docs, 2026-11-19)

| Operation | Endpoint |
| --- | --- |
| Domain search | `GET /domain-search` (all emails at a company) |
| Email finder | `GET /email-finder` |
| People search | `GET /people/find?email=` or `?linkedin_handle=` |
| Company search | `GET /companies/find?domain=` |
| Combined search | `GET /combined/find?email=` |
| Credit balance | `GET /account` |

## Fields returned

Email, first/last name, job title, company, LinkedIn URL, email verification
status, email sources. The email finder returns a 0–100 confidence score,
converted to 0–1 and preserved on the field — the only provider in this batch
that supplies per-field confidence.

## Credit model (per Hunter docs)

- Email finder: 1 credit per found email.
- Other searches consume credits per Hunter's plan; the adapter records the
  credits it spends to the migration-030 `integration_usage` table.

## How results are stored

Known lead columns are written directly; everything else goes under
`custom_fields["enrichment_hunter"]` with confidence and `checked_at`.
Bulk enrichment runs through a Stage-1 sync job (dedupe by email).

## Pending / config-ready

- None for the implemented operations. This adapter is the
  **enrichment** one only — Hunter's email-campaign operations belong to the
  email-outreach worker, not this adapter.
