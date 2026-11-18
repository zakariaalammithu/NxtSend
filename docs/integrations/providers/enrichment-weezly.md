# Weezly — Lead Enrichment

Status: **NOT IMPLEMENTED.** No public developer API could be found, so
no endpoint is called.

- Adapter: `src/lib/integrations/providers/enrichment/weezly/adapter.ts`
- Config: `src/lib/integrations/providers/enrichment/weezly/config.ts`
- Tests: `src/lib/integrations/providers/enrichment/weezly/__tests__/adapter.test.ts`
- Panel: `src/components/integrations/enrichment/WeezlyPanel.tsx`
- Site: https://weezly.com/

## What Weezly is (per its public site)

A sales platform with a 300M+ B2B contact database, LinkedIn/email
outreach, AI video, a unified inbox, and pipeline management. None of
that is exposed through a public developer API that could be found as of
2026-11-19.

## Adapter behaviour

Every operation throws `provider_endpoint_unverified`. The adapter never
calls a Weezly host and never guesses an endpoint.

## Auth (reserved, unverified)

- Env var: `WEEZLY_API_KEY` (reserved for when/if a public API appears).
- No base URL or auth method is asserted anywhere in code or docs.

## What is needed to implement

1. A public Weezly developer API reference (base URL, auth, endpoint
   paths, request/response shapes, credit model).
2. Wire the verified endpoints into the adapter, following the Apollo /
   Hunter adapter pattern.
3. Replace the stub tests with mocked-endpoint tests.
