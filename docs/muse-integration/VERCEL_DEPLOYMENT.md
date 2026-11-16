# Vercel Deployment

> **Verification note.** `platform.muse.ai/docs` itself was **not
> fetchable from this environment** — requirements were verified from
> Meta Help Center-derived implementation guides and from the code in
> this repo, and **must be re-checked live before submission**.
> Submission/approval is **NOT claimed**.

## Environment variables

Set in **Vercel → Project → Settings → Environment Variables**,
then redeploy. Values are never displayed anywhere in the product —
only presence.

| Variable | Required | Notes |
| --- | --- | --- |
| `TOKEN_ENCRYPTION_KEY` | **Yes** | Base64 of 32 bytes: `openssl rand -base64 32`. **Reused** from the Gmail/Outlook mailbox OAuth. Without it, authorize returns 503. |
| `MUSE_MCP_ENABLED` | No | `"false"` disables the MCP surface. Unset = enabled. Does **NOT** gate the OAuth routes. |
| `MUSE_MCP_PUBLIC_URL` | No | Public origin of the Muse surface when it differs from `NEXT_PUBLIC_APP_URL`. |
| `NEXT_PUBLIC_APP_URL` | (existing) | Fallback public origin (e.g. `https://nxtsend.com`). |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | (existing) | Supabase must be configured — without it the app runs in Demo Mode and the Muse surface refuses everything. |

There is **no `MUSE_OAUTH_CLIENT_SECRET`**. Clients register via
Dynamic Client Registration; do not invent this variable.

## Deployment checklist

1. **Apply migration 023** in the Supabase SQL Editor (in order,
   after 001–022):
   `supabase/migrations/023_muse_oauth.sql`. It creates
   `muse_oauth_clients`, `muse_oauth_codes`, `muse_oauth_tokens`
   (RLS enabled, zero policies). Verify with:
   ```sql
   select table_name from information_schema.tables
   where table_name like 'muse_oauth_%';
   ```
2. Set `TOKEN_ENCRYPTION_KEY` (and `MUSE_MCP_PUBLIC_URL` if the Muse
   surface lives somewhere other than `NEXT_PUBLIC_APP_URL`).
3. Deploy (Vercel picks up the `main` branch). No build config
   changes are needed; the routes are standard Next.js App Router
   routes (`runtime = "nodejs"`, `dynamic = "force-dynamic"`).
4. Smoke-test the public surface (no auth needed):
   - `GET /api/mcp/health` → JSON with `mode`, `mcpEnabled`,
     `toolCount: 18`, `oauthConfigured`, `protocolVersion`,
     `version`.
   - `GET /.well-known/oauth-protected-resource/api/mcp` → RFC 9728
     metadata.
5. Check **Admin → System → System Health**: the `muse-mcp` check
   reports the surface state (enabled / public URL / active grant
   count / whether migration 023 is readable). A warning there means
   "not fully configured", not "broken" — zero grants is normal
   before anyone connects.
6. Connect once as a Custom Connector from Muse (see
   [OAUTH_SETUP.md](OAUTH_SETUP.md)) and confirm a grant appears in
   Dashboard → Integration Center → Muse.ai → Your Muse grants, and
   the status flips to **Connected and Verified**.

## Platform limits that affect this deployment

- **Vercel Hobby 10s default function duration**: long streams are
  cut. The MCP server is **stateless per-request** by design — each
  `POST /api/mcp` call is self-contained. If a future flow needs
  long-lived streaming, the function duration must be raised (Pro
  plan) — that is a deployment change, not a code change, and it is
  **not** done here.
- **In-memory rate limiting does not share across Vercel instances.**
  The 120 req/min per-grant limit is enforced per serverless
  instance; concurrent instances each keep their own counter. Treat
  it as abuse friction, not a global quota.
- **Cold starts**: the first MCP call after idle may be slow on
  Hobby; this is a platform property, not a bug in the connector.

## Rollback

- Set `MUSE_MCP_ENABLED=false` and redeploy to disable the MCP
  surface (the OAuth routes stay available, so existing grants keep
  working for token refresh/revoke but Muse gets no tools).
- To fully stop new grants, also remove `TOKEN_ENCRYPTION_KEY`
  (authorize then returns 503). Existing tokens keep working until
  they expire or are revoked — revoke them from the Integration
  Center or Admin page instead of relying on expiry.
- The migration creates new tables only; rolling back the code does
  not require dropping them.

## LinkedIn-send tools are NOT SUPPORTED

No LinkedIn-send tool is deployed, because no authorized LinkedIn
provider exists and the official LinkedIn API exposes no
connection-request/DM endpoints to standard developers. Deployment
does not change that.
