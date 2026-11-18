# Deployment

How to deploy the integration ecosystem, what to configure, and —
stated first, because it matters most — the honest status of the live
deployment.

## 0. Deploy status — read this first (as of the 2026-11-18 ~21:30 +06 check)

**The deploy has landed.** The homepage's build ID is now
`BAaomykL5AuHSrZJB-y9C` (it was the stale `SRCeQ_zoG-67TWwPomTCn`
at the ~07:25 +06 check, when the n8n health/metadata/auth-test
endpoints all returned 404). Re-checked ~21:30 +06: n8n, Make,
Zapier and MCP health endpoints all return 200; n8n and Make
well-known metadata return 200; the root metadata lists all 21
OAuth scopes; the dashboard Developers page renders live with the
Phase 2 content. The earlier lag (~20 h serving the pre-n8n
build) resolved without any code change — the cause remains
unknown, and a deploy that takes ~20 h to land is worth watching
on the next push.

**One item NOT confirmed in this check:** the marketplace page
(`/dashboard/integrations`) returned HTTP 200 on the same new
build ID, but the 83 provider cards were not visible in the
fetched/crawled snapshot (the page showed the Integration Center
intro + Outbound Webhooks section with "Loading…" — the cards
render after a client-side status fetch). A rendered-browser check
of the marketplace page is still needed; do not claim the cards
render live until that check is done.

This status is dated 2026-11-18 ~21:30 +06. Do not quote it as
current without re-checking.

## 1. Platform

- **Hosting:** Vercel (Next.js App Router). `vercel.json` defines a
  single cron: `0 6 * * *` → `/api/jobs/run`. No other crons.
- **Database:** Supabase (Postgres + Auth + RLS). Migrations live in
  `supabase/migrations/`.
- **Repo:** `zakariaalammithu/NxtSend`, branch `main`. Base commit for
  this doc set: `f8dea22`.

## 2. Environment variables

`.env.example` lists **108 variables**; `CONFIG_CATALOG`
(`src/lib/config-status.ts`) and `scripts/check-config.mjs` both list
the same 108. Run `npm run config:check` to print the SET /
PLACEHOLDER / MISSING matrix (values are never printed); add
`-- --live` to fail on missing required-for-live vars.

Variables the integration ecosystem specifically needs:

| Variable | Required for | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Live (all) | Production origin; auth redirects, Stripe returns, referral links |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Live (all) | Database + auth; service role is server-only |
| `TOKEN_ENCRYPTION_KEY` | Live (OAuth + mailbox) | AES-256-GCM, base64 32 bytes: `openssl rand -base64 32`. **Must be set before any grant flow can run.** Unset/malformed → mailbox connect refuses; integration grants need it too |
| `INTEGRATION_HUB_ENCRYPTION_KEY` | Live (adapters) | Dedicated AES-256-GCM key for the Hub vault; separate from `TOKEN_ENCRYPTION_KEY`. Rotating it makes stored Hub credentials undecryptable |
| `CRON_SECRET` | Live (jobs/webhooks) | Authenticates `/api/jobs/run`; the worker refuses to run while unset |
| `MUSE_MCP_ENABLED`, `MUSE_MCP_PUBLIC_URL` | Muse MCP | Unset = enabled |
| `CHATGPT_MCP_ENABLED`, `CHATGPT_MCP_PUBLIC_URL` | ChatGPT MCP | Unset = follows `MUSE_MCP_ENABLED`, then enabled |
| `CLAUDE_MCP_ENABLED`, `CLAUDE_MCP_PUBLIC_URL` | Claude MCP | Same fallback as ChatGPT |
| `ZAPIER_ENABLED`, `ZAPIER_APP_BASE_URL` | Zapier REST | Unset = enabled |
| `N8N_INTEGRATION_ENABLED`, `N8N_API_BASE_URL` | n8n REST | Unset = enabled |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email (also `subscription.changed` webhooks depend on Stripe, not Resend) | |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, 6 Price IDs | Billing + `subscription.changed` events | |
| `ADMIN_BOOTSTRAP_SECRET` | One-time only | Remove after first super-admin use |

There is **no** `*_OAUTH_CLIENT_SECRET` env var for any of the nine
platforms (DCR-issued) and **no** `N8N_API_KEY` env var (keys are
created in-app). Provider API keys for the 64 adapters are stored
per-connection in the Hub vault, not in env.

## 3. Migrations to apply

Apply in Supabase, in order. **Note the gaps: migrations 032–035 and
037 do not exist on disk.** Apply 022–031, 036, and 038:

| Migrations | Contents |
| --- | --- |
| 022 | Flow AI features |
| 023 | Muse OAuth server tables (`muse_oauth_clients/codes/tokens`, RLS enabled, no policies) |
| 024 | ChatGPT OAuth resource |
| 025 | Zapier webhooks (subscriptions + deliveries tables) |
| 026 | OAuth PKCE optional (legacy path) |
| 027 | Leads `updated_at` |
| 028 | n8n API keys (`nxtsend_api_keys`, SHA-256 hashes) |
| 029 | n8n webhook platform |
| 030 | Integration engine (`integration_connections`, `integration_sync_jobs`, `integration_usage`) |
| 031 | Automation platforms (Make/Pabbly/Albato/Activepieces) |
| 036 | Notification preferences |
| 038 | Provider disable flags (`provider_disabled_flags`) |

Migrations 001–021 are the pre-existing product schema and are assumed
already applied. Do not re-apply them blindly — check the Supabase
migration history first. Any apply script that expects a file for every
number 022–038 will fail on the gaps (032–035, 037); that is a
numbering gap, not a missing feature anyone has described.

## 4. Cron

| Schedule | Endpoint | Does |
| --- | --- | --- |
| Daily `0 6 * * *` (06:00) | `POST/GET /api/jobs/run` (Bearer `CRON_SECRET`) | Background jobs, including webhook outbox retries (a failed delivery can therefore wait up to ~24h for its next retry — see [WEBHOOK_DOCUMENTATION.md](./WEBHOOK_DOCUMENTATION.md)) |

No other crons exist. The worker refuses to run while `CRON_SECRET`
is unset.

## 5. Health endpoints

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET /api/mcp/health` | Public | MCP server health |
| `GET /api/integrations/<platform>/health` | Public | Per-platform REST health (`zapier`, `n8n`, `make`, `pabbly`, `albato`, `activepieces`) |
| `GET /api/integrations/status` | Authenticated | Integration Center status summary |
| `GET /api/integrations/<platform>/v1/auth/test` | Bearer token | Verify a token (returns grant workspace/scopes) |

The 2026-11-18 check used the n8n health/metadata/auth-test
endpoints and got 404s — that is how the deploy lag was detected.
Re-run these after every deploy as a smoke test.

## 6. Deploy checklist (owner)

1. Set all env vars in Vercel (§2), especially
   `TOKEN_ENCRYPTION_KEY`, `INTEGRATION_HUB_ENCRYPTION_KEY`, and
   `CRON_SECRET`.
2. Apply migrations 022–031, 036, 038 in Supabase (§3).
3. Deploy `main` (or the verified commit) in Vercel; confirm the
   deployment is live in Vercel → Deployments — do not assume a push
   equals a live deploy (see §0).
4. Smoke-test: hit `/api/mcp/health` and
   `/api/integrations/n8n/health` on the live origin; confirm the
   homepage build ID changed from the previous deploy.
5. Remove `ADMIN_BOOTSTRAP_SECRET` after first super-admin use.
6. Run one live grant flow per platform (Muse, ChatGPT, Claude,
   Zapier, n8n, Make, Pabbly, Albato, Activepieces) and record the
   results. Until then, nothing is live-verified.
7. Submit/publish each platform artefact (Zapier app, n8n node on
   npm, Make app, Activepieces piece, Meta/OpenAI/Anthropic
   submissions) — none has been started.
