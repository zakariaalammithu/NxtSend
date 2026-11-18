# Integration providers — engine contract

Shared engine for every provider adapter. Provider workers build
against this module; they do not re-implement it.

## File layout

```
src/lib/integrations/providers/
  types.ts        — shared types (ProviderDefinition, ProviderError, SyncResult, …)
  client.ts       — ProviderHttpClient, the ONLY HTTP client adapters may use
  registry.ts     — PROVIDER_DEFINITIONS + getProviderDefinition + listProvidersByCategory
  connections.ts  — integration_connections helpers (encrypted credentials)
  sync.ts         — integration_sync_jobs helpers + dedupeLeadsByEmail
  health.ts       — checkProviderHealth (stored-state only, no live calls)
  <provider>/     — one folder per provider worker:
    adapter.ts    — the provider's operations, built on ProviderHttpClient
    config.ts     — base URL, auth type, scopes, field mappings
    __tests__/    — adapter tests (mocked fetch only — no real network)
```

## How to use ProviderHttpClient

```ts
import { ProviderHttpClient } from "@/lib/integrations/providers/client";

const client = new ProviderHttpClient({
  baseUrl: "https://api.example.com/v1",
  getAuthHeaders: async () => {
    const cred = await getDecryptedProviderCredential(store, workspaceId, "example");
    return cred?.apiKey ? { Authorization: `Bearer ${cred.apiKey}` } : {};
  },
  // timeoutMs defaults to 10_000; maxRetries defaults to 2 (3 attempts total).
});

const leads = await client.request<Lead[]>({ method: "GET", path: "/leads" });
```

Behaviour: 10s default timeout; retries ONLY on 429/502/503/504
with exponential backoff (max 3 attempts); non-2xx becomes a
`ProviderError` (`provider_http_<status>` / `provider_timeout` /
`provider_network`). Auth-header values are redacted from every
error message — never log a raw error body.

## How to register a ProviderDefinition

Append one entry to `PROVIDER_DEFINITIONS` in `registry.ts`:

```ts
{
  id: "hubspot",
  name: "HubSpot",
  category: "crm",
  authType: "oauth2",
  docsUrl: "https://developers.hubspot.com/",
  capabilities: ["…honest, verifiable capabilities only…"],
  twoWaySync: true,
  scopes: ["crm.objects.contacts.read", "crm.objects.contacts.write"],
}
```

Do NOT edit `src/lib/integrations-center/registry.ts` — the
coordinator merges these definitions into it later.

## Credentials

- Store credentials ONLY through `upsertProviderConnection` — it
  encrypts with the existing `encryptToken` (AES-256-GCM,
  TOKEN_ENCRYPTION_KEY). Never store plaintext, never log a
  credential, never return one from a route.
- `getProviderConnection` / `listProviderConnections` return the
  public shape only (no credential, encrypted or otherwise).
- `getDecryptedProviderCredential` is **server-only**: adapters
  use it to build auth headers; it must never feed a route
  response.
- Tables are RLS-enabled with zero policies (service-role only),
  same as migrations 023/025/028.

## Rules for provider workers

1. **Unverified endpoints must be marked, never guessed.** If a
   provider endpoint has not been verified against the provider's
   own docs (or a live check), mark it `UNVERIFIED` in the adapter
   and in the definition's capabilities — do not invent a URL,
   field name or response shape.
2. **Never claim a provider is connected without a verified
   check.** A stored row is not proof; `checkProviderHealth`
   reads stored state only and says so.
3. **No LinkedIn-send/accept anywhere.** No adapter may send a
   LinkedIn connection request or DM — the official API exposes
   no such endpoints to standard developers.
4. **No new MCP tools.** The MCP surface is `manifest.ts`
   (do not touch it).
5. **Demo mode is never a real user.** Integration surfaces
   refuse demo workspaces with 503, same as the Zapier/n8n
   surfaces.
6. **Tests use mocked fetch only.** No real network calls in unit
   tests; use the in-memory stores (`createMemory…Store`) for
   connection/sync tests.
7. **No secrets in code or logs.** No API keys, tokens or
   passwords in source, fixtures or test output.
