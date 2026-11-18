# Developer Guide

How to use the integration ecosystem as a developer — the Dashboard →
Developers pages, the API keys, the reference data, and how to add a
provider. For the API itself, see [API_DOCUMENTATION.md](./API_DOCUMENTATION.md);
for webhooks, [WEBHOOK_DOCUMENTATION.md](./WEBHOOK_DOCUMENTATION.md).

## 1. Dashboard → Developers

Path: **Dashboard → Developers** (`src/app/(dashboard)/dashboard/developers/`).

| Page | What it does |
| --- | --- |
| Developers home (`page.tsx`) | Overview of the developer surfaces: API docs, API keys, webhooks |
| API docs / reference (`reference.ts`) | The canonical in-app API reference data: endpoints, error codes, rate limits. **Client-safe by design** — it must not import server-only modules (this was the `f8dea22` build fix: the module previously pulled in server code and broke `next build`; it now pins the limits as literals `120 / 120 / 3`, asserted by `__tests__/reference.test.ts`). |
| API Keys (`api-keys/`) | Create, list, and revoke **n8n** scoped API keys |
| Webhooks (`webhooks/`) | Manage webhook subscriptions (list, create, delete) |

### 1.1 API keys — n8n only, by backend design

- Keys are created in-app only (Dashboard → Developers → API Keys).
  The full key is **shown once** at creation and never again.
- Format: `nxt_live_…`. Stored as a **SHA-256 hash only** (migration
  028, `nxtsend_api_keys` table) — the plaintext is never persisted.
- Scopes: `n8n.read` / `n8n.write` (no `.send` tier). Keys are
  expirable and revocable.
- **API keys are n8n-only by backend design.** No other platform
  accepts an API key: `resolveRestContext`
  (`src/lib/integrations/rest/auth.ts`) resolves `nxt_live_` keys only
  when `platformId === "n8n"`. Extending API keys to another platform
  needs a backend change, not a config change.
- There is no `N8N_API_KEY` env var. Keys are not in env at all.

### 1.2 The reference data (`reference.ts`)

`reference.ts` is the single source of truth for the numbers the UI
shows developers:

- REST rate limit: **120 requests/minute per token**
- MCP rate limit: **120 requests/minute per grant**
- Webhook delivery max attempts: **3**
- Route counts per platform (n8n 33 v1 routes; Zapier 26; Make/Pabbly/
  Albato/Activepieces 33 each — see
  [API_DOCUMENTATION.md](./API_DOCUMENTATION.md))

These are literals in the file, each with a comment naming the
server module it mirrors (`rest/auth.ts`, `muse-connector/mcp.ts`,
`rest/outbox.ts`), and a unit test pins them. If you change a limit
server-side, update the literal **and** the test — a mismatch fails
the suite. Do not re-import the server constants into this module:
that is exactly what broke the build in `628a825` (fixed in `f8dea22`).

## 2. Dashboard → Integrations (marketplace)

Path: **Dashboard → Integrations**
(`src/app/(dashboard)/dashboard/integrations/`).

- The marketplace page (`page.tsx`) lists all 83 Center entries with
  search, category + connected filters, and Featured / Recently added /
  Name sorting (added in `fa2199a`).
- Provider detail pages (`[id]/page.tsx`) show a Provider details
  section, field-mapping tables for the 19 adapters that publish one,
  and honest empty states for sync / usage / activity (empty until a
  real sync happens — no fake numbers).
- A provider's status is "Not Connected" until a credential is stored.
  Statuses come from `src/lib/integrations-center/status.ts`
  (`getIntegrationStatuses()`, `mapProviderState()`).
- **No Test Connection button exists for the 60+ new adapters.**
  `verify.ts` (`src/lib/integrations-center/verify.ts`) has a `case`
  only for the pre-existing ids (supabase, resend, gmail, microsoft,
  stripe, openai, anthropic, meta-model, meta-pixel, webhooks, jobs,
  linkedin, muse-ai, chatgpt, claude, zapier, n8n); every new adapter
  id falls through to the generic outcome, and the status service
  returns "Unknown integration." for ids it has no rule for (rewritten
  in the display layer). See [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md).

## 3. Admin monitoring (provider disable switch)

Path: **Admin → Integrations → Monitoring**
(`src/app/(admin)/admin/integrations/monitoring/[provider]/`,
API at `src/app/api/admin/integrations/monitoring/[provider]/`).

- Shows per-provider API counts and recent sync activity — **but the
  60+ config-ready adapters write no audit rows**, so their API counts
  show as **null, not zero**. Null means "no data", not "no usage";
  do not read it as zero calls.
- The disable endpoint
  (`.../monitoring/[provider]/disable`, migration 038) sets the
  provider disable flag. Enforcement is on the **six REST automation
  platforms only** (`resolveRestContext` → 503 `provider_disabled`);
  the connect flow for config-ready adapters is **not** yet gated.
- Audit rows for ChatGPT/Claude tool calls are recorded as
  `muse.tool.*` (shared MCP adapter) — there is **no per-client audit
  split**. Do not use the audit log to attribute calls to ChatGPT vs
  Claude vs Muse.

## 4. How to use the reference data

- **In-app:** import from `reference.ts` (client-safe) for anything
  rendered in the browser. Never import `src/lib/integrations/rest/auth.ts`,
  `src/lib/muse-connector/mcp.ts`, or `src/lib/integrations/rest/outbox.ts`
  from a client component — they are server-only.
- **In docs:** quote the numbers from `reference.ts` / this doc set,
  not from memory. If a number changes, change it in the server module,
  in `reference.ts`, in its test, and in these docs together.
- **Config parity:** `src/lib/config-status.ts` (`CONFIG_CATALOG`, 108
  vars) is the source of truth for env vars; `scripts/check-config.mjs`
  mirrors it (108 entries) so it can run offline with zero
  dependencies. Run `npm run config:check` (add `-- --live` to fail
  on missing required-for-live vars). A unit test pins the catalogue
  to `.env.example` — they must stay in sync.

## 5. How to add a provider

Follow the pattern the Milestone 2 adapters established (do not invent
a new one):

1. **Adapter** — create `src/lib/integrations/providers/<category>/<id>/`
   with `config.ts` (definition: id, name, category, authType,
   capabilities, docs URL, setup steps — honest about what is not
   verified) and `adapter.ts` (HTTP client via the shared
   `ProviderHttpClient`, import/export via the lead repository, email
   dedupe, sync jobs via `runExportSyncJob` / `finishSyncJob`).
   Email-outreach adapters **must** take an `isSuppressed` checker
   and refuse to send without one (fail closed).
2. **Tests** — add `__tests__/adapter.test.ts` mocking the provider
   HTTP layer. Mock-tested is the bar; never claim live verification
   from a mock test.
3. **Definition** — add the definition to the category's
   `definitions.ts` (or a `config.ts` exporting `*_DEFINITION` for
   categories that use that pattern, e.g. email-outreach and
   Category J). Do **not** edit `src/lib/integrations/providers/registry.ts`
   directly — the coordinator merges definitions in (except the
   5 live platforms, which are defined inline there).
4. **Center registry** — add the entry to
   `src/lib/integrations-center/registry.ts` with real auth method,
   capabilities, and setup steps, and an honest status. Do not add a
   `verify.ts` case unless you implement a real verification path —
   a missing case is honest; a fake one is not.
5. **Docs** — add `docs/integrations/providers/<category>-<id>.md`
   (operator guide) and update
   `docs/integrations/INTEGRATION_INVENTORY.md` and
   `docs/integrations/PROVIDER_SETUP.md` in the same change.
6. **Do not** claim the provider is connected, live, or verified in
   any of the above. The marketplace status stays "Not Connected"
   until a credential is stored and a real call succeeds.
