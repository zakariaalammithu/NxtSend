# Vercel Deployment — NxtSend × n8n

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `N8N_INTEGRATION_ENABLED` | No | Set to `"false"` to disable the n8n REST API surface. Unset means enabled. Does NOT gate the OAuth routes. |
| `N8N_API_BASE_URL` | No | Public origin advertised in the RFC 9728 protected-resource metadata (`/.well-known/oauth-protected-resource/api/integrations/n8n`). Only set when the n8n surface lives somewhere other than `NEXT_PUBLIC_APP_URL`. |
| `TOKEN_ENCRYPTION_KEY` | Yes (for OAuth) | AES-256 key (base64 of 32 bytes; `openssl rand -base64 32`) reused to sign the authorize-state token. Without it the authorize endpoint returns 503. Shared with Gmail/Outlook and Muse.ai. |
| `NEXT_PUBLIC_APP_URL` | Yes | Fallback public origin. Precedence: `N8N_API_BASE_URL` → `NEXT_PUBLIC_APP_URL` → request origin. |
| `CRON_SECRET` | Yes (for retries) | Protects `/api/jobs/run`; the daily 06:00 cron retries failed webhook deliveries. Already required for Zapier. |

**Deliberately absent:** `N8N_API_KEY` (user keys are generated
in-app, never in env — and NxtSend API keys ≠ n8n instance
credentials) and `N8N_OAUTH_CLIENT_SECRET` (the client is created
by one-time DCR; credentials live in n8n, not here). There is also
no global webhook signing secret — each subscription gets its own,
generated server-side.

All four variables above are in `.env.example` and catalogued in
`src/lib/config-status.ts` (parity is unit-tested).

## Migrations

Apply to the Supabase project, in order:

1. `025_zapier_webhooks.sql`, `026_oauth_pkce_optional.sql`,
   `027_leads_updated_at.sql` (Zapier — already applied for the
   Zapier surface; the n8n surface reuses the OAuth tables and
   `leads.updated_at`).
2. **`029_n8n_webhook_platform.sql`** — platform discriminator
   on the shared webhook tables. **Landed in the repo (written,
   not applied).** Apply in the Supabase SQL Editor.
3. **`028_nxtsend_api_keys.sql`** — n8n API keys (`nxtsend_api_keys` table).
   **Landed in the repo (written, not applied).** Apply in the
   Supabase SQL Editor.

Until 028/029 are applied, the admin n8n panel reports the
API-key / subscription / delivery counts as unknown (null),
never zero — and the settings page's API-key and webhook
sections report their fetch errors honestly.

## Deploy checklist

- [ ] Migrations 028 + 029 applied (verify: admin n8n panel
      shows counts, not "unknown").
- [ ] `TOKEN_ENCRYPTION_KEY` set in Vercel (verify: the OAuth
      authorize endpoint does not return 503).
- [ ] `NEXT_PUBLIC_APP_URL` set to the production origin.
- [ ] `N8N_INTEGRATION_ENABLED` left unset (enabled) unless the
      surface should be off.
- [ ] `CRON_SECRET` set and the daily 06:00 cron registered
      (verify: a failed webhook delivery is retried).
- [ ] `npm test` passes and `npm run build` succeeds (see
      [TESTING.md](TESTING.md)).
- [ ] Smoke test (see [TESTING.md](TESTING.md)): health endpoint,
      API-key create/list/revoke, auth/test with key and with an
      OAuth token, one webhook subscription + delivery.

## Rollback

- Set `N8N_INTEGRATION_ENABLED=false` and redeploy: the REST
  API refuses calls (503) while the OAuth routes stay available,
  so no grant is half-issued against a dead API. Existing API
  keys keep working only if the flag is unset — the flag gates
  the routes, not the keys table.
- Revoking all API keys and grants (admin panel + settings page)
  disconnects every n8n workflow immediately.
