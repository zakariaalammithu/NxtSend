# Factors.ai — Lead Enrichment

Status: **Config-ready only — NOT IMPLEMENTED.** The API reference has
not been verified, so no endpoint is called.

- Adapter: `src/lib/integrations/providers/enrichment/factors/adapter.ts`
- Config: `src/lib/integrations/providers/enrichment/factors/config.ts`
- Tests: `src/lib/integrations/providers/enrichment/factors/__tests__/adapter.test.ts`
- Panel: `src/components/integrations/enrichment/FactorsPanel.tsx`
- Help center: https://help.factors.ai/en/

## What was verified

Factors.ai's help center lists a "Factors API" article, but the endpoint
paths, base URL, and auth method could not be verified from public docs as
of 2026-11-19. The adapter therefore implements nothing: every operation
throws `provider_endpoint_unverified`.

## Not to be confused with

**Factori.ai** (factori.ai) is a different company — an identity/fraud
API at `api.factori.ai`. It is not Factors.ai and must not be wired in as
if it were.

## Auth (reserved, unverified)

- Env var: `FACTORS_API_KEY` (reserved for when the API is documented).
- No base URL or auth method is asserted anywhere in code or docs.

## What is needed to implement

1. The official Factors.ai API reference (base URL, auth, endpoint paths,
   request/response shapes, credit model) — from Factors.ai directly or
   its published developer docs.
2. Wire the verified endpoints into the adapter, following the Apollo /
   Hunter adapter pattern.
3. Replace the stub tests with mocked-endpoint tests.

## Hard rule applied

No endpoint URL was guessed. The adapter refuses rather than inventing a
path, and the panel and definitions file say "config-ready only" so the UI
never claims a working Factors.ai connection.
