# OAuth 2.1 Setup

> **Verification note.** `platform.muse.ai/docs` itself was **not
> fetchable from this environment** — requirements were verified from
> Meta Help Center-derived implementation guides and from the code in
> this repo, and **must be re-checked live before submission**.
> Submission/approval is **NOT claimed**.

## What the server is

NxtSend is an **OAuth 2.1 authorization server** for Muse:

- Flow: **authorization code + PKCE (S256 only)**. `plain` or a
  missing `code_challenge_method` is refused.
- **Dynamic Client Registration (RFC 7591)** — there is no static,
  env-configured client and no `MUSE_OAUTH_CLIENT_SECRET`. Clients
  register at `POST /api/muse/oauth/register` (rate-limited) and are
  **public by default**; a confidential client is created only when
  explicitly requested, and its secret is stored as a SHA-256 hash.
- Token lifetimes: **access 1h, refresh 60d, authorization code
  10 min** (single use).
- Refresh rotation with **reuse detection**: presenting an
  already-rotated refresh token revokes the **whole grant**.
- Revocation (RFC 7009): revoking a refresh token revokes the whole
  grant; revoking an access token revokes just that token. Unknown
  tokens still answer 200.

## Prerequisites

1. A deployed NxtSend instance with Supabase configured (live mode —
   Demo Mode refuses the whole Muse surface).
2. **Migration 023 applied** to the Supabase project:
   `supabase/migrations/023_muse_oauth.sql`. It creates
   `muse_oauth_clients`, `muse_oauth_codes`, `muse_oauth_tokens`
   (RLS enabled, zero policies, service-role only). No rows are seeded.
3. `TOKEN_ENCRYPTION_KEY` set (see below) — without it the authorize
   endpoint returns **503** (it signs the authorize-state token).

## Environment variables (real ones only)

| Variable | Required | Purpose |
| --- | --- | --- |
| `TOKEN_ENCRYPTION_KEY` | Yes | AES-256 key, base64 of 32 bytes (`openssl rand -base64 32`). **Reused** from the Gmail/Outlook mailbox OAuth — same key, same generation. Signs the authorize-state token. |
| `MUSE_MCP_ENABLED` | No | Set to `"false"` to disable the MCP surface. Unset = enabled. Does **NOT** gate the OAuth routes. |
| `MUSE_MCP_PUBLIC_URL` | No | Public origin advertised for the Muse surface when it differs from `NEXT_PUBLIC_APP_URL`. |
| `NEXT_PUBLIC_APP_URL` | (existing) | Fallback public origin for the Muse surface. |

There is **no `MUSE_OAUTH_CLIENT_SECRET`** — clients register via
DCR. Do not invent one.

## Endpoints

| Endpoint | Method | Notes |
| --- | --- | --- |
| `/api/muse/oauth/authorize` | GET / POST | GET renders the consent screen (shows account/workspace as UUIDs); POST approves or denies. |
| `/api/muse/oauth/token` | POST | `grant_type=authorization_code` or `refresh_token`. Form-encoded (JSON also accepted). |
| `/api/muse/oauth/revoke` | POST | RFC 7009. Always 200 for unknown tokens. |
| `/api/muse/oauth/register` | POST | RFC 7591 DCR, rate-limited. |
| `/.well-known/oauth-protected-resource/api/mcp` | GET | RFC 9728 protected-resource metadata. |

## Scopes

| Scope | Allows |
| --- | --- |
| `muse.read` | Read leads, campaigns, inbox, usage. **Recommended default**; the consent screen offers it, and an omitted scope defaults to it. |
| `muse.write` | Create/change leads and draft campaigns; pause/resume/archive. Never sends. |
| `muse.send` | Send email / inbox replies; permanently delete leads. Approval in Muse every time. |

A scope outside these three is refused with `invalid_scope` — never
silently dropped or widened.

## Redirect URIs (allowlist)

A registered `redirect_uri` must be either the Muse callback
`https://agent.meta.ai/api/hatch/oauth/callback` or a loopback
`http://localhost:*` URI (local testing only). Anything else is
refused at registration and at authorize time.

## Connecting as a Custom Connector (no directory approval needed)

1. In Muse, add a Custom Connector with the MCP endpoint URL:
   `https://<your-app-domain>/api/mcp`.
2. Muse registers via DCR and starts the authorize flow.
3. The user signs in on NxtSend's consent screen, picks scopes
   (`muse.read`-only recommended), and approves.
4. Muse exchanges the code (PKCE) for tokens and calls the MCP server.
5. Grants are managed per user at **Dashboard → Integration Center →
   Muse.ai → Your Muse grants** (Revoke removes all tokens for that
   client + user immediately).

## Demo Mode

Demo Mode refuses the OAuth server (authorize/token return errors,
MCP returns 503 `not_configured`). The demo persona has no user id
and must never be served to Muse. This is fail-closed by design, not
a configuration error.

## Audit

OAuth events are written to `audit_logs` **with** `workspace_id` by
`recordMuseOAuthEvent` (`src/lib/muse-connector/oauth/audit.ts`):
`MUSE_OAUTH_GRANT`, `MUSE_OAUTH_DENY`, `MUSE_OAUTH_TOKEN_EXCHANGE`,
`MUSE_OAUTH_TOKEN_REFRESH`, `MUSE_OAUTH_TOKEN_REVOKE`,
`MUSE_OAUTH_GRANT_REVOKED`, `MUSE_OAUTH_CLIENT_REGISTER`. No token,
code or secret material is ever written — only ids and outcomes.

## LinkedIn-send tools are NOT SUPPORTED

No LinkedIn-send tool exists, because no authorized LinkedIn provider
exists and the official LinkedIn API exposes no
connection-request/DM endpoints to standard developers.
