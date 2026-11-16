# Vercel Deployment

## Deploy checklist (owner steps)

1. **Apply migrations 023 + 024 in Supabase** (see DATABASE.md).
   No new migration is needed for Claude.
2. **Set in Vercel (Production):**
   - `TOKEN_ENCRYPTION_KEY` — required. Base64 of 32 bytes:
     `openssl rand -base64 32`. Signs the authorize-request state;
     without it the authorize endpoint returns 503.
   - `NEXT_PUBLIC_APP_URL=https://nxtsend.com` — required. The real
     origin; the issuer, the metadata documents and the default
     resource URLs derive from it.
   - `CLAUDE_MCP_ENABLED` / `CLAUDE_MCP_PUBLIC_URL` — optional, only
     when the Claude surface differs from the defaults (see below).
3. **Redeploy.** Verify with the checks below.
4. **Connect from Claude** (see CLAUDE_SETUP.md) and confirm a grant
   appears in Dashboard → Integrations → Claude.ai (Anthropic).

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Yes | Real origin; issuer + metadata + default resource URLs derive from it |
| `TOKEN_ENCRYPTION_KEY` | Yes | Base64 of 32 bytes; signs authorize-state; authorize returns 503 without it |
| `CLAUDE_MCP_ENABLED` | No | `"false"` disables the Claude MCP surface; unset → `MUSE_MCP_ENABLED`; both unset → enabled; does **not** gate the OAuth routes |
| `CLAUDE_MCP_PUBLIC_URL` | No | Precedence: `CLAUDE_MCP_PUBLIC_URL` → `MUSE_MCP_PUBLIC_URL` → `NEXT_PUBLIC_APP_URL` → request origin |
| `MUSE_MCP_ENABLED` / `MUSE_MCP_PUBLIC_URL` | No | Fallbacks for the Claude vars (and the Muse surface's own vars) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Already required for live mode |

**No `CLAUDE_OAUTH_CLIENT_SECRET`** — none exists or is needed (DCR /
CIMD public clients). **No `ANTHROPIC_API_KEY` required** for the
Claude.ai connection — the MCP connection needs no Anthropic key; the
existing AI providers are reused only for message drafting via
`draftOutreachMessage`.

Both new vars are catalogued in `.env.example`,
`src/lib/config-status.ts` and `scripts/check-config.mjs`
(`npm run config:check` lists them; MISSING in a dev env is expected
— they are optional and unset there).

## Verification after deploy

| Check | Expected |
|---|---|
| `GET /api/mcp/health` | `{"mode":"live","mcpEnabled":true,"toolCount":54,"oauthConfigured":true,"protocolVersion":"2025-06-18","version":"1.0.0"}` (values depend on the deployment; `toolCount` must be 54) |
| `GET /.well-known/oauth-protected-resource/api/mcp/claude` | `{"resource":"https://nxtsend.com/api/mcp/claude","authorization_servers":["https://nxtsend.com"],"scopes_supported":[...9 scopes...],"bearer_methods_supported":["header"]}` |
| `GET /.well-known/oauth-protected-resource?resource=https://nxtsend.com/api/mcp/claude` | Same Claude resource in the root document |
| `GET /.well-known/oauth-authorization-server` | Issuer `https://nxtsend.com`; `code_challenge_methods_supported: ["S256"]`; `token_endpoint_auth_methods_supported: ["none","client_secret_post"]`; `client_id_metadata_document_supported: true`; all 9 scopes |
| `POST /api/mcp/claude` without a token | **401** + `WWW-Authenticate` naming `/.well-known/oauth-protected-resource/api/mcp/claude` |
| `POST /api/mcp/claude` with a valid Claude token, `initialize` | `protocolVersion "2025-06-18"`, capabilities `{tools, prompts, resources}`, Claude `instructions` |
| Dashboard → Integrations → Claude.ai (Anthropic) | Renders; "Connected but Not Verified" before any grant, "Connected and Verified" after one |
| Admin → Integrations → Muse.ai | "Grants by client origin" shows Muse / ChatGPT / Claude / Other / Total; `claude-mcp` check in System Health |

**None of the live checks above has been run from the build
environment** — they are PENDING until the deploy is live and a real
Claude account connects (see the final report).

## Vercel Hobby-plan notes

- Stateless design (Vercel Hobby-safe; 10 s limit respected — every
  tool is a bounded store lookup; no server-side session, no sticky
  state).
- The only in-process state is the per-instance rate limiter (120
  req/min per grant — not shared across instances; see SECURITY.md)
  and the CIMD document cache (~5 min, in-memory).
- The MCP route is Node.js runtime, `force-dynamic`. The build
  compiles `/api/mcp/claude` and the Claude protected-resource
  metadata route (verified in the local production build).
- If the deployment ever serves the MCP surface from a different
  origin than the app, set `CLAUDE_MCP_PUBLIC_URL` to that origin —
  the metadata documents advertise it, and the RFC 8707 resource
  URLs follow it.
