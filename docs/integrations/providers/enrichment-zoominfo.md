# ZoomInfo — Lead Enrichment

Status: **Implemented with an unverified endpoint set** (mock-tested;
live use needs real OAuth credentials AND confirmation of the GTM API paths).

- Adapter: `src/lib/integrations/providers/enrichment/zoominfo/adapter.ts`
- Config: `src/lib/integrations/providers/enrichment/zoominfo/config.ts`
- Tests: `src/lib/integrations/providers/enrichment/zoominfo/__tests__/adapter.test.ts`
- Panel: `src/components/integrations/enrichment/ZoomInfoPanel.tsx`
- Docs: https://docs.gtm.ai/docs/overview

## Auth

- New GTM API base URL: `https://api.zoominfo.com/gtm` (docs at docs.gtm.ai).
- OAuth 2.0 — Authorization Code + PKCE or Client Credentials.
- Env vars: `ZOOMINFO_ACCESS_TOKEN` (caller-supplied Bearer token, used
  today), `ZOOMINFO_CLIENT_ID` / `ZOOMINFO_CLIENT_SECRET` (pending — the
  token exchange is not wired yet).

## Endpoints used — ⚠️ UNVERIFIED PATHS

ZoomInfo is migrating from its legacy Enterprise API
(base `https://api.zoominfo.com`, being deprecated) to the new GTM API.
The legacy paths are documented in ZoomInfo's own guides:

| Operation | Legacy path (what the adapter calls today) |
| --- | --- |
| Search contacts | `/search/contact` |
| Enrich contacts | `/enrich/contact` |
| Search companies | `/search/company` |
| Enrich companies | `/enrich/company` |

The **exact GTM API paths were NOT confirmed** from the public docs, so the
adapter calls the legacy paths with a caller-supplied Bearer token and the
config flags `gtmPathsVerified: false`. Do not treat this as a verified live
integration until the GTM paths are confirmed against docs.gtm.ai and the
adapter is pointed at them.

## Fields returned

Email, first/last name, job title, company, LinkedIn URL, phone, location,
industry, company size. Confidence is `null` — ZoomInfo returns no per-field
confidence score.

## Credit model (per ZoomInfo docs)

- Search / lookup: free.
- 1 data credit per newly enriched record.
- Enrich up to 25 records per call.

ZoomInfo has **no standalone email-verification endpoint** — verification
must come from another provider in this batch.

## How results are stored

Known lead columns are written directly; everything else goes under
`custom_fields["enrichment_zoominfo"]` with confidence and `checked_at`.
Bulk enrichment runs through a Stage-1 sync job (dedupe by email).

## Pending / config-ready

1. Confirm the GTM API paths and switch the adapter to them.
2. Wire the Client Credentials token exchange (`ZOOMINFO_CLIENT_ID` /
   `ZOOMINFO_CLIENT_SECRET`) so the adapter can mint its own token.
3. First authenticated live call.
