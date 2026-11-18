# Persana AI — Lead Enrichment

Status: **Config-ready only — NOT IMPLEMENTED.** No public API reference
could be found, so no endpoint is called.

- Adapter: `src/lib/integrations/providers/enrichment/persana/adapter.ts`
- Config: `src/lib/integrations/providers/enrichment/persana/config.ts`
- Tests: `src/lib/integrations/providers/enrichment/persana/__tests__/adapter.test.ts`
- Panel: `src/components/integrations/enrichment/PersanaPanel.tsx`
- Marketing page: https://persana.ai/full-contact-api

## What was verified

Persana's marketing page claims a "Full Contact API", but no public API
reference (base URL, auth method, endpoint paths) could be found in
Persana's public docs as of 2026-11-19. The adapter therefore implements
nothing: every operation throws `provider_endpoint_unverified`.

## Auth (reserved, unverified)

- Env var: `PERSANA_API_KEY` (reserved for when the API is documented).
- No base URL or auth method is asserted anywhere in code or docs.

## What is needed to implement

1. The official Persana API reference (base URL, auth, endpoint paths,
   request/response shapes, credit model) — from Persana directly or its
   published developer docs.
2. Wire the verified endpoints into the adapter, following the Apollo /
   Hunter adapter pattern (ProviderHttpClient, confidence + source on
   every field, usage recording, sync-job bulk).
3. Replace the stub tests with mocked-endpoint tests.

## Hard rule applied

No endpoint URL was guessed. The adapter refuses rather than inventing a
path, and the panel and definitions file say "config-ready only" so the UI
never claims a working Persana connection.
