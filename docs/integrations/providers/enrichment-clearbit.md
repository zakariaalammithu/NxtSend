# Clearbit / HubSpot Data Enrichment — Lead Enrichment

Status: **PROVIDER BLOCKED.** The standalone Clearbit API is deprecated;
there is no endpoint to call.

- Adapter: `src/lib/integrations/providers/enrichment/clearbit/adapter.ts`
- Config: `src/lib/integrations/providers/enrichment/clearbit/config.ts`
- Tests: `src/lib/integrations/providers/enrichment/clearbit/__tests__/adapter.test.ts`
- Panel: `src/components/integrations/enrichment/ClearbitPanel.tsx`
- Docs URL: none (no standalone API docs exist any more).

## What happened (verified, 2026-11-19)

- HubSpot acquired Clearbit; the acquisition completed **4 December 2023**.
- The standalone Clearbit API was deprecated and is no longer sold to new
  customers.
- Clearbit's free tools were shut down across April–December 2025.
- Enrichment now exists only **inside paid HubSpot** (Breeze Intelligence /
  data enrichment) operating on HubSpot records — there is no standalone
  endpoint NxtSend could call.

## Adapter behaviour

Every operation throws `provider_unavailable`. The adapter never calls a
Clearbit host.

## Legacy endpoints (historical reference only — DO NOT CALL)

- `person.clearbit.com/v2/combined/find?email=`
- `company.clearbit.com/v2/companies/find?domain=`

These are recorded only so a future reader knows what the old API looked
like; they are not wired into any code path.

## What would unblock this

A HubSpot integration that performs enrichment inside HubSpot itself — that
is a HubSpot CRM feature, not a Clearbit adapter, and belongs to the CRM
worker, not this partition. Env var `CLEARBIT_API_KEY` is retained in the
config only as a legacy marker.
