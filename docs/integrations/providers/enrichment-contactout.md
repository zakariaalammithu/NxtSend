# ContactOut — Lead Enrichment

Status: **Implemented** (mock-tested; live use needs a real API key).

- Adapter: `src/lib/integrations/providers/enrichment/contactout/adapter.ts`
- Config: `src/lib/integrations/providers/enrichment/contactout/config.ts`
- Tests: `src/lib/integrations/providers/enrichment/contactout/__tests__/adapter.test.ts`
- Panel: `src/components/integrations/enrichment/ContactOutPanel.tsx`
- Docs: https://contactout.com/api_docs/

## Auth

- Base URL: `https://api.contactout.com`
- Header: literally `token: <key>` (not `Authorization`).
- Env var: `CONTACTOUT_API_KEY`.

## Endpoints used (verified against ContactOut's official API reference, 2026-11-19)

| Operation | Endpoint |
| --- | --- |
| Enrich from LinkedIn profile | `GET /v1/linkedin/enrich?profile=` |
| Enrich a person | `POST /v1/people/enrich` (with `include`) |
| LinkedIn lookup with phone | `GET /v1/people/linkedin?profile=&include_phone=true` |

## Fields returned

Email, first/last name, job title, company, LinkedIn URL, phone, location.
Confidence is `null` — ContactOut returns no per-field confidence score.

## Credit model (per ContactOut docs)

- 1 search credit per found profile.
- +1 credit for an email, +1 for a phone.
- The adapter records 3 credits for a fully enriched person (search + email +
  phone) to the migration-030 `integration_usage` table.

## How results are stored

Known lead columns are written directly; everything else goes under
`custom_fields["enrichment_contactout"]` with confidence and `checked_at`.
Bulk enrichment runs through a Stage-1 sync job (dedupe by email).

## Deliberately not implemented

- **Company enrichment**: ContactOut's API reference has no
  company-enrichment endpoint, so `enrichCompany` throws
  `provider_operation_unsupported` rather than guessing a path.
