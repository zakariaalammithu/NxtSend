# Snov.io — Lead Enrichment

Status: **Implemented** (mock-tested; live use needs real OAuth credentials).

- Adapter: `src/lib/integrations/providers/enrichment/snov/adapter.ts`
- Config: `src/lib/integrations/providers/enrichment/snov/config.ts`
- Tests: `src/lib/integrations/providers/enrichment/snov/__tests__/adapter.test.ts`
- Panel: `src/components/integrations/enrichment/SnovPanel.tsx`
- Docs: https://snov.io/api

## Auth

- Base URL: `https://api.snov.io`
- OAuth 2.0 Client Credentials: `POST /v1/oauth/access_token` with
  `grant_type=client_credentials`; the token lasts 1 hour. The adapter
  exchanges credentials automatically and caches the token until 30
  seconds before expiry.
- Env vars: `SNOV_CLIENT_ID` + `SNOV_CLIENT_SECRET`.

## Endpoints used (verified against Snov.io's official API docs, 2026-11-19)

All v2 operations are **async tasks**: POST a `/start` endpoint to get a
`task_hash`, then poll the matching `/result/{task_hash}` endpoint.

| Operation | Endpoints |
| --- | --- |
| Domain search | `POST /v2/domain-search/start` → `GET /v2/domain-search/result/{task_hash}` |
| Email finder by name + domain | `POST /v2/emails-by-domain-by-name/start` (up to 10) → result |
| Company lookup by name | `POST /v2/company-domain-by-name/start` → result |
| LinkedIn profile lookup | `POST /v2/li-profiles-by-urls/start` → result |
| Email verification | `POST /v2/email-verification/start` → result |

Polling: 5-second interval, up to 12 attempts by default (injectable in
tests). The adapter's `findEmail` uses the emails-by-domain-by-name task.

## Fields returned

Email, first/last name, job title, company, email verification status.
Confidence is `null` — Snov.io returns no per-field confidence score.

## Credit model (per Snov.io docs)

- 1 credit per POST start.
- 1 credit per prospect with an email.
- Verification: 1 credit per valid/invalid result, 0 for unknown.
- Rate limit: 60 calls/minute.

Usage is recorded to the migration-030 `integration_usage` table.

## How results are stored

Known lead columns are written directly; everything else goes under
`custom_fields["enrichment_snov"]` with confidence and `checked_at`.
Bulk enrichment runs through a Stage-1 sync job (dedupe by email).

## Pending / config-ready

- None for the implemented operations. This adapter is the
  **enrichment** one only — Snov.io's email-campaign operations belong to
  the email-outreach worker, not this adapter.
