# Apollo.io — Lead Enrichment

Status: **Implemented** (mock-tested; live use needs a real API key).

- Adapter: `src/lib/integrations/providers/enrichment/apollo/adapter.ts`
- Config: `src/lib/integrations/providers/enrichment/apollo/config.ts`
- Tests: `src/lib/integrations/providers/enrichment/apollo/__tests__/adapter.test.ts`
- Panel: `src/components/integrations/enrichment/ApolloPanel.tsx`
- Docs: https://docs.apollo.io/

## Auth

- Base URL: `https://api.apollo.io/api/v1`
- Header: `x-api-key: <key>` (NOT `Authorization: Bearer`).
- Env var: `APOLLO_API_KEY`.

## Endpoints used (verified against Apollo's official docs, 2026-11-19)

| Operation | Endpoint |
| --- | --- |
| Enrich one person | `POST /people/match` (by email, name + employer, or LinkedIn URL; reveal flags add personal emails / phone numbers) |
| Bulk enrich | `POST /people/bulk_match` (up to 10 people per call) |
| People search | `POST /mixed_people/api_search` (no credits) |
| Enrich one company | `POST /organizations/enrich` (by domain) |

## Fields returned

Email, first/last name, job title, company, LinkedIn URL, phone, location,
seniority, department, industry, company size, company domain. Every field
carries `source: "apollo"`; confidence is `null` on every field — Apollo
returns no per-field confidence score, so none is invented.

## Credit model (per Apollo docs)

- 1 credit for demographics or email.
- +8 credits if a mobile phone is returned.
- 0 credits when no credit-consuming data is found.

Usage is recorded to the migration-030 `integration_usage` table
(`apollo.people.match`, `apollo.people.bulk_match`, `apollo.organizations.enrich`).

## How results are stored

Known lead columns (email, first/last name, job title, company, LinkedIn URL)
are written directly; everything else goes under
`custom_fields["enrichment_apollo"]` with confidence and `checked_at`.
Bulk enrichment runs through a Stage-1 sync job (dedupe by email, matched →
updated, unmatched → skipped).

## Pending / config-ready

- None for the implemented operations. A live connection still needs a real
  `APOLLO_API_KEY` and a first authenticated call; nothing here claims
  "Connected" without one.
