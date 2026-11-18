# Trigify — Lead Enrichment

Status: **PROVIDER BLOCKED (shut down).** There is no endpoint to call.

- Adapter: `src/lib/integrations/providers/enrichment/trigify/adapter.ts`
- Config: `src/lib/integrations/providers/enrichment/trigify/config.ts`
- Tests: `src/lib/integrations/providers/enrichment/trigify/__tests__/adapter.test.ts`
- Panel: `src/components/integrations/enrichment/TrigifyPanel.tsx`
- Site: https://www.trigify.io/

## What happened (verified, 2026-11-19)

- Trigify announced on **23 September 2026** that its team was joining
  HubSpot.
- Standard-customer access ended **11:59pm BST, 22 October 2026**;
  accounts were not migrated.
- API access, monitoring, and signal collection all stopped.

## Adapter behaviour

Every operation throws `provider_unavailable`. The adapter never calls a
Trigify host.

## What would unblock this

Nothing short of Trigify (or its successor inside HubSpot) publishing a
new public API. Env var `TRIGIFY_API_KEY` is retained in the config only
as a defunct marker; do not collect a key for it.
