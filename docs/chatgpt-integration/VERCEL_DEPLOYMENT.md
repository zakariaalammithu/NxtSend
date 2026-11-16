# Vercel Deployment

## Checklist (owner steps)

1. **Apply migrations 023 + 024** in the Supabase project (see
   DATABASE.md). Until 023 is applied the OAuth tables cannot be read
   and every grant count reports "unknown".
2. **Set the env vars** in Vercel → Project → Settings → Environment
   Variables (Production), then redeploy:

   | Variable | Required | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_APP_URL` | Yes | The real origin, e.g. `https://nxtsend.com`. The issuer, the metadata URLs and the default resource URLs all derive from it. |
   | `TOKEN_ENCRYPTION_KEY` | Yes | Base64 of 32 bytes (`openssl rand -base64 32`). Signs the authorize-request state; without it the authorize endpoint returns 503. Shared with Gmail/Outlook mailbox tokens. |
   | `SUPABASE_SERVICE_ROLE_KEY` | Yes | Already required for live mode generally. |
   | `CHATGPT_MCP_ENABLED` | No | Set to `"false"` to disable the ChatGPT MCP surface. Unset → the `MUSE_MCP_ENABLED` value applies; both unset → enabled. Does **not** gate the OAuth routes. |
   | `CHATGPT_MCP_PUBLIC_URL` | No | Only when the ChatGPT surface lives somewhere other than `MUSE_MCP_PUBLIC_URL` / `NEXT_PUBLIC_APP_URL`. Precedence: `CHATGPT_MCP_PUBLIC_URL` → `MUSE_MCP_PUBLIC_URL` → `NEXT_PUBLIC_APP_URL` → request origin. |
   | `MUSE_MCP_ENABLED` / `MUSE_MCP_PUBLIC_URL` | No | Fallbacks for the two ChatGPT vars above (and the Muse surface's own vars). |

3. **No new OAuth env vars.** There is no `CHATGPT_OAUTH_CLIENT_SECRET`
   and none is needed (DCR / CIMD public clients).
4. **`OPENAI_API_KEY` is NOT required** for the ChatGPT.com integration.
   It is needed only if you want AI message drafting
   (`draft_outreach_message`); the MCP connection itself needs no
   OpenAI key. The existing AI providers (OpenAI / Anthropic / Meta)
   are reused only for drafting.
5. **Verify after deploy** (see TESTING.md): `GET /api/mcp/health`
   (tool count 54), the two well-known metadata URLs, and the
   Integration Center ChatGPT entry showing "Connected but Not
   Verified" (configuration, not a connection) until a real grant exists.

## Vercel Hobby plan notes

- **Stateless design.** The MCP server is plain request/response
  (Streamable HTTP, no websockets, no long-lived connections), so it
  fits the Hobby plan's serverless model.
- **10 s function limit.** Every tool is a bounded store lookup, not a
  long job; nothing in the ChatGPT surface starts background work.
- **Cold starts.** The first call after idle may be slow; the OAuth
  flow and ChatGPT's retries tolerate this, but a first connect attempt
  immediately after a deploy can time out — retry once.
- **In-memory rate limiting is per instance** (SECURITY.md): on Hobby,
  concurrent instances each enforce their own 120/min budget.
- **CIMD cache is per instance** (~5 min TTL); a redeploy clears it,
  which is safe (documents are re-fetched).
- **Cron / jobs are unrelated** to this surface; the daily jobs worker
  (`/api/jobs/run`, `CRON_SECRET`) is not needed for ChatGPT.

## Configuration check

```bash
npm run config:check          # prints SET / PLACEHOLDER / MISSING per var, values never printed
npm run config:check -- --live  # exits 1 when a required-for-live var is missing/placeholder
```

`CHATGPT_MCP_ENABLED` and `CHATGPT_MCP_PUBLIC_URL` are catalogued in
`src/lib/config-status.ts` and `scripts/check-config.mjs` (group
"integrations"), pinned to `.env.example` by unit tests — the catalogue
cannot silently drift from the example file.

## Rollback / disable

- Set `CHATGPT_MCP_ENABLED=false` and redeploy: the ChatGPT MCP route
  returns 503 `not_configured`; the OAuth routes stay up, so existing
  grants fail at the resource instead of being half-issued.
- Revoking all grants (Admin → Integrations → Muse.ai, "Grants by
  client origin", or each user's grants panel) removes ChatGPT access
  immediately without a redeploy.
