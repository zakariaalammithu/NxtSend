# OAuth Setup

NxtSend is the **authorization server**. ChatGPT is a public OAuth client
(authorization code + PKCE S256). There is no pre-registered client secret
and no `CHATGPT_OAUTH_CLIENT_SECRET` — clients register themselves (DCR)
or identify themselves with a CIMD document.

## Endpoints (production origin `https://nxtsend.com`)

| Endpoint | Purpose |
|---|---|
| `GET/POST /api/muse/oauth/authorize` | Consent screen (GET) + approve/deny (POST) |
| `POST /api/muse/oauth/token` | `authorization_code` + `refresh_token` exchange |
| `POST /api/muse/oauth/revoke` | RFC 7009 token revocation |
| `POST /api/muse/oauth/register` | RFC 7591 Dynamic Client Registration (public clients by default) |
| `GET /.well-known/oauth-authorization-server` | RFC 8414 metadata (issuer, endpoints, PKCE S256 only, `token_endpoint_auth_methods: ["none", "client_secret_post"]`) |
| `GET /.well-known/oauth-protected-resource` | RFC 9728 root metadata (both MCP resources) |
| `GET /.well-known/oauth-protected-resource/api/mcp/chatgpt` | RFC 9728 metadata for the ChatGPT resource |
| `GET /.well-known/oauth-protected-resource/api/mcp` | RFC 9728 metadata for the Muse resource (still works) |

The authorize/token/revoke/register paths are shared with the Muse
connector (`/api/muse/oauth/...`) — the platform is carried by the
client (redirect URI / CIMD document / `resource` parameter), not by a
separate route set.

## Redirect URIs (exact match, no wildcards)

| Platform | Redirect URI |
|---|---|
| ChatGPT | `https://chatgpt.com/connector_platform_oauth_redirect` |
| Muse | `https://agent.meta.ai/api/hatch/oauth/callback` |
| Local testing only | Loopback `http://localhost:*` / `http://127.0.0.1:*` |

Anything else is refused — an open redirect via a registered client is
not possible. A redirect URI must also be exactly registered/documented
for the client using it; the allowlist alone is never enough.

## Flow

1. ChatGPT starts authorization with `client_id`, `redirect_uri`,
   `response_type=code`, `code_challenge` (S256) + `code_challenge_method=S256`,
   `scope` (space-separated `nxtsend.*`), optional `resource` (RFC 8707)
   and `state`.
2. NxtSend shows the consent screen: client name + origin + platform
   (ChatGPT vs Muse), requested scopes in plain words, recommended
   default `nxtsend.read`.
3. On approval, a single-use authorization code is issued (10 min,
   bound to the PKCE verifier, the client, the user, the scopes and the
   `resource`).
4. Token exchange returns an access token (1 h) + refresh token (60 d).
   Refresh tokens rotate on every use; presenting an already-rotated
   refresh token revokes the whole grant (reuse detection).
5. The token response and the authorize redirect both carry RFC 9207
   `iss` (the deployment's public origin).

## Scopes

Canonical ChatGPT scopes: `nxtsend.read`, `nxtsend.write`,
`nxtsend.send`. The Muse scopes (`muse.read` / `muse.write` /
`muse.send`) still work as aliases — same tiers, different prefix.
Tiers are **independent**: `send` does NOT imply `write` or `read`;
a grant must hold each tier it needs. An unknown scope is refused
with `invalid_scope`, never silently dropped or widened. An empty /
omitted scope defaults to read-only for the requesting platform
(`nxtsend.read` for ChatGPT, `muse.read` for Muse).

See PERMISSIONS.md for what each tier allows.

## Client identification: DCR vs CIMD

| | DCR (RFC 7591) | CIMD (OpenID Connect Core §7) |
|---|---|---|
| `client_id` | Opaque id issued by NxtSend | An https URL (e.g. `https://chatgpt.com/...`) |
| Registration | `POST /api/muse/oauth/register`; stored in `muse_oauth_clients` | None — the document is fetched per request |
| Storage | Persisted (service role only) | **Ephemeral**: validated per request, cached in memory ~5 min, never written to the database |
| Validation | Redirect URIs on the allowlist | Fetch: https only, 5 s timeout, 64 KB cap, JSON, validated shape; `redirect_uris` must be allowlisted, `grant_types` must include `authorization_code`, `response_types` must include `code` |
| Failure | Refused at registration | Fail closed — any fetch/validation problem refuses the client |

Implementation: `src/lib/muse-connector/oauth/cimd.ts`
(`fetchCimdDocument`, `validateCimdDocument`, `resolveCimdClient`).

## `private_key_jwt`: NOT supported

A CIMD document declaring
`token_endpoint_auth_method: "private_key_jwt"` is still **accepted**,
but the client is treated as a public client (`"none"`) and any
`client_assertion` presented at the token endpoint is refused with
`invalid_client`. The reason: verifying JWT bearer client assertions
needs a JWKS fetch + RS256/ES256 signature verification + `aud` / `exp` /
`jti` replay protection — a whole new trust surface — while the connector
platform's flow is a public client with PKCE S256, which this server
already enforces. The RFC 8414 metadata therefore lists only
`token_endpoint_auth_methods: ["none", "client_secret_post"]` and does
**not** declare `private_key_jwt`. A document declaring
`client_secret_basic` / `client_secret_post` is refused outright (no
secret exists for a CIMD client).

## RFC 8707 `resource` (audience binding)

ChatGPT sends `resource` naming the MCP resource it wants a token for.
It is validated **byte-for-byte per platform**:

- Muse → `https://<origin>/api/mcp`
- ChatGPT → `https://<origin>/api/mcp/chatgpt`

A mismatch is refused with `invalid_target`. When absent, the default
per platform applies. The resource is stored on codes and tokens
(migration 024) and enforced at token validation: a token issued for
one platform's resource does not validate for the other.

## Token storage and lifetimes

| Item | Lifetime | Storage |
|---|---|---|
| Authorization code | 10 min, single-use | SHA-256 hash in `muse_oauth_codes` |
| Access token | 1 h | SHA-256 hash in `muse_oauth_tokens` |
| Refresh token | 60 d, rotating | SHA-256 hash in `muse_oauth_tokens` |

A database read can never yield a usable token. No token value is ever
logged or shown in any UI. The authorize-request state is signed with
`TOKEN_ENCRYPTION_KEY` (HMAC); without that key the authorize endpoint
returns 503.

## What the owner must configure

- Migrations 023 + 024 applied (DATABASE.md).
- `TOKEN_ENCRYPTION_KEY` set (`openssl rand -base64 32`).
- `NEXT_PUBLIC_APP_URL` (or `MUSE_MCP_PUBLIC_URL` /
  `CHATGPT_MCP_PUBLIC_URL`) set to the real origin — the issuer and the
  metadata URLs derive from it.
- **No new OAuth env vars.** No client secret of any kind.
