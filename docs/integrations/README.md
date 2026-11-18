# NxtSend Integration Ecosystem — Documentation

> **Honest status, up front:** no provider in this ecosystem is live-verified
> against real credentials. The code is real and the test suite passes, but
> every live grant flow still needs the owner to apply migrations 022–038
> (note: 032–035 and 037 do not exist yet — see
> [DEPLOYMENT.md](./DEPLOYMENT.md)) and set `TOKEN_ENCRYPTION_KEY` in
> Vercel. No platform submission or publication is claimed (Meta, OpenAI,
> Anthropic, Zapier, npm/n8n). Nothing in these docs marks an integration
> as Connected, live, published, or verified unless a real authenticated
> check has proven it. As of this writing, none has.

## What this ecosystem is

NxtSend's integration ecosystem connects the product to the tools its users
already run — CRMs, email-outreach platforms, enrichment and verification
services, chat tools, productivity apps, automation platforms (Zapier, n8n,
Make, Pabbly, Albato, Activepieces), and AI assistants (Muse, ChatGPT,
Claude) over MCP — through one shared engine:

- **One centralized engine** (`src/lib/integrations/`): a shared REST layer,
  a shared OAuth 2.1 server, a shared webhook outbox, and a shared provider
  adapter framework. New platforms plug into the same layer instead of
  re-implementing auth, rate limiting, and webhooks.
- **69 provider definitions** (`src/lib/integrations/providers/registry.ts`):
  5 live platforms (Zapier, n8n, Muse, ChatGPT, Claude) + 61 Milestone 2
  adapters + 3 Category J adapters. See
  [INTEGRATION_INVENTORY.md](./INTEGRATION_INVENTORY.md).
- **83 Integration Center entries**
  (`src/lib/integrations-center/registry.ts`): the user-facing marketplace
  catalogue, including the providers above plus the platform's own surfaces
  (Supabase, Resend, Gmail, Stripe, OpenAI, webhooks, jobs, LinkedIn demo,
  and the generic `crm` / `email-verification` info entries).

## What is live vs config-ready

| Tier | Meaning | Count |
| --- | --- | --- |
| **Live platforms** | Full backend implemented (OAuth server, REST v1 API, MCP server and/or native app, webhooks). Mock-tested, **not** live-verified; grant flows pending owner config. | 5 — Zapier, n8n, Muse, ChatGPT, Claude |
| **Config-ready adapters** | Adapter implemented from the provider's official docs, mock-tested. Works once the owner stores a real credential; no live call has ever been made. | 61 Milestone 2 + 3 Category J = 64 |
| **Provider-blocked** | No usable public API, or the provider shut down / deprecated the API. Cannot be connected. | 3 — Clearbit, Trigify, Weezly |
| **Evaluated, not implemented** | Reviewed and deliberately not built (no public API, unverifiable, or no fit). | 7 — Saava, Jungler, Cargo, Alysio, IntentStream, Twain, Loopster |
| **Already covered** | Asked about in Category J, already had an adapter — not duplicated. | 2 — Masterinbox, SmartReach |

Detail, per provider, in [INTEGRATION_INVENTORY.md](./INTEGRATION_INVENTORY.md).

## How to navigate these docs

| Doc | For | Contents |
| --- | --- | --- |
| [INTEGRATION_INVENTORY.md](./INTEGRATION_INVENTORY.md) | Everyone | Every provider, its status, what it does, what is missing. The source of truth for "what exists". |
| [PROVIDER_SETUP.md](./PROVIDER_SETUP.md) | Owner / operator | Per-provider auth method, credential name, where to obtain it. |
| [OAUTH_SETUP.md](./OAUTH_SETUP.md) | Owner / developer | The shared OAuth 2.1 server: flows, scopes, endpoints, callback URIs. |
| [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) | Developers | The v1 REST routes, MCP servers, auth, error codes, rate limits. |
| [WEBHOOK_DOCUMENTATION.md](./WEBHOOK_DOCUMENTATION.md) | Developers | The 8 webhook events, HMAC signing, outbox + retry behaviour. |
| [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) | Developers | Dashboard → Developers pages, API keys, reference data, adding a provider. |
| [TESTING_REPORT.md](./TESTING_REPORT.md) | Reviewers | What was run, what passed, and the MOCK TESTED / PASS distinction. |
| [SECURITY.md](./SECURITY.md) | Owner / reviewers | Encryption, key hashing, RLS, isolation, audit logging, what is never exposed. |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Owner / DevOps | Vercel setup, env vars, migrations, cron, health endpoints — and the honest deploy status. |
| [CREDENTIAL_CHECKLIST.md](./CREDENTIAL_CHECKLIST.md) | Owner | Every credential still needed, required vs optional, where to get it. |
| [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md) | Everyone | Everything that does not work yet, stated plainly. Read before promising anything to a user. |

Per-provider operator guides live in
[`providers/`](./providers/) (63 files: CRM, email outreach, enrichment,
verification, communication, productivity, automation, MCP clients).
There are **no** operator guides yet for the three Category J providers
(GetLeads, Cornersight, HotHawk) — their setup steps reference the
official provider docs only (see [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md)).

## Base facts (verified 2026-11-19, base commit `f8dea22`)

- Repo suite: **2,293 tests passing** (224 files, exit 0) — re-run by the
  documentation author, not copied from a handoff.
- n8n node package (`integrations/n8n-nodes-nxtsend/`): **126/126 tests**.
- `npx tsc --noEmit`: clean. `npm run build`: exit 0 (verified in Wave 2;
  see [TESTING_REPORT.md](./TESTING_REPORT.md)).
- `.env.example`: **108 variables**; `CONFIG_CATALOG`
  (`src/lib/config-status.ts`) and `scripts/check-config.mjs` both list the
  same 108.
- Wave 2 commits: `0e63d4a`, `f9c8327`, `340a9ac`, `fa2199a`, `628a825`,
  `f8dea22` (see the
  [final report](../../NxtSend_Integration_Ecosystem_Final_Report.md)).

## The one rule for reading this ecosystem

**A definition is not a connection.** A provider definition describes what
a platform surface offers; it is not proof that anything is connected.
A status of "Not Connected" in the marketplace is the honest default until
a credential is stored and a real call succeeds. If a claim in any older
doc contradicts this set, this set wins — the older doc is stale.
