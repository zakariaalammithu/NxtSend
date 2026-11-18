# Dropcontact — Lead Enrichment

Status: **Implemented** (mock-tested; live use needs a real API key).

- Adapter: `src/lib/integrations/providers/enrichment/dropcontact/adapter.ts`
- Config: `src/lib/integrations/providers/enrichment/dropcontact/config.ts`
- Tests: `src/lib/integrations/providers/enrichment/dropcontact/__tests__/adapter.test.ts`
- Panel: `src/components/integrations/enrichment/DropcontactPanel.tsx`
- Docs: https://developer.dropcontact.com/

## Auth

- Base URL: `https://api.dropcontact.com/v1`
- Header: `X-Access-Token: <key>`.
- Env var: `DROPCONTACT_API_KEY`.

## Endpoints used (verified against Dropcontact's official API docs, 2026-11-19)

Dropcontact has a single async endpoint:

| Operation | Endpoint |
| --- | --- |
| Submit a batch | `POST /v1/enrich/all` with `{ data: [...] }` (up to 250 contacts) → `{ request_id, credits_left }` |
| Poll for results | `GET /v1/enrich/all/{request_id}` → `{ success, data: [...] }`, or `success: false, reason: "Request not ready yet, try again in 30 seconds"` |

Polling: 30-second interval, up to 20 attempts by default (injectable in
tests).

## Fields returned

Email (with `qualification`, e.g. `nominative@pro`), first/last name,
full name, civility, LinkedIn URL, location, company, website, country,
SIREN, industry, employee count. Confidence is `null` — Dropcontact
returns no per-field confidence score; the email qualification is preserved
verbatim as its own field.

## Credit model (per Dropcontact docs)

- Credits are charged **only on success** (a verified email returned).
- `credits_left` is returned on every response.
- An empty batch is the documented zero-cost balance probe.

Usage is recorded to the migration-030 `integration_usage` table
(`dropcontact.enrich.all`, 1 credit per verified email).

## How results are stored

Known lead columns are written directly; everything else goes under
`custom_fields["enrichment_dropcontact"]` with confidence and `checked_at`.
Bulk enrichment runs through a Stage-1 sync job (dedupe by email). A
name-only record (no email, phone, or company data) counts as unmatched.

## Pending / config-ready

- None for the implemented operations.
