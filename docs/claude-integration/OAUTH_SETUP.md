# OAuth Setup (OAuth 2.1 server)

One authorization server serves all three platforms (Muse, ChatGPT,
Claude): the same authorize / token / revoke / register endpoints,
PKCE S256 only, `authorization_code` + `refresh_token` grants, and all
three scope sets. Claude is a client of that server — NxtSend issues
the credentials; there is no client secret to configure on NxtSend's
side.

## Endpoints

| Endpoint | Notes |
|---|---|
| `GET/POST /api/muse/oauth/authorize` | Consent screen (client name + origin + platform + redirect hostname); approve/deny |
| `POST /api/muse/oauth/token` | `authorization_code` + `refresh_token`; rotation, reuse revokes grant |
| `POST /api/muse/oauth/revoke` | RFC 7009 |
| `POST /api/muse/oauth/register` | RFC 7591 DCR, public clients by default |
| `GET /.well-known/oauth-authorization-server` | RFC 8414; S256 only; `token_endpoint_auth_methods_supported: ["none", "client_secret_post"]` — no `private_key_jwt`; `client_id_metadata_document_supported: true` |
| `GET /.well-known/oauth-protected-resource` | RFC 9728 root metadata; `?resource=` accepts the Claude resource |
| `GET /.well-known/oauth-protected-resource/api/mcp/claude` | RFC 9728 metadata for the Claude resource |
| `GET /.well-known/oauth-protected-resource/api/mcp` | RFC 9728 metadata for the Muse resource |
| `GET /.well-known/oauth-protected-resource/api/mcp/chatgpt` | RFC 9728 metadata for the ChatGPT resource |

## PKCE

PKCE is **S256 only** — `code_challenge_method` must be `S256`
(`plain` is refused). The code verifier is checked at the token
endpoint; a missing or mismatched verifier refuses the exchange.
Authorization codes live **10 minutes**, are single-use, and are
stored as SHA-256 hashes (never as values).

## Dynamic Client Registration (RFC 7591)

`POST /api/muse/oauth/register` registers a client:

- Default **public** — no secret is issued. A confidential client
  (`confidential: true`) gets a secret returned exactly once, stored
  only as a SHA-256 hash.
- `client_name` required (max 200 chars); `redirect_uris` a non-empty
  array (max 10), every URI on the allowlist (see below).
- Client ids are `muse_<32 hex chars>`.
- Cap: **50 registered clients**. Past the cap, the oldest never-used
  client older than 24 h is evicted first; when no client qualifies
  for eviction the registration is refused (`too_many_clients`)
  instead of silently dropping one.

## CIMD — Client ID Metadata Documents

Claude may instead identify itself with a `client_id` that **is** an
https URL (e.g. Claude Code's published document
`https://claude.ai/oauth/claude-code-client-metadata`). The server
fetches that URL and validates the document
(`redirect_uris`, `client_name`, `grant_types` incl.
`authorization_code`, `response_types` incl. `code`,
`token_endpoint_auth_method`):

- Fetch: https only, **~5 s timeout**, **~64 KB size cap**, JSON body.
  Failures are never cached; successful documents are cached in
  memory for **~5 min** keyed by URL.
- The client is **ephemeral**: validated per request, never written
  to `muse_oauth_clients`. Its store row id is prefixed `cimd:` so it
  can never be confused with a stored client.
- DCR stays as the fallback for clients that do not serve a CIMD.
- Fail closed throughout: a non-https `client_id`, a fetch error, a
  timeout, an oversized response, bad JSON, or a document that fails
  validation all refuse the client — never a partial trust.
- Platform detection: a document listing a Claude callback is Claude;
  a document hosted on `claude.ai` / `claude.com` (or a subdomain) is
  Claude's published identity — this is what catches Claude Code,
  whose document declares only loopback redirects. A ChatGPT callback
  means ChatGPT; otherwise Muse.
- **How Claude chooses CIMD vs DCR:** the authorization-server
  metadata advertises `client_id_metadata_document_supported: true`.
  Claude selects CIMD only when that flag is present **and** `none`
  is among the token auth methods; otherwise it falls back to DCR.
  Both paths are public clients by default.

### `private_key_jwt` is NOT supported

A CIMD document declaring `private_key_jwt` is still accepted, but
the client is treated as a public client
(`token_endpoint_auth_method: "none"`) and any `client_assertion`
presented at the token endpoint is refused with `invalid_client`.
Reason: verifying JWT bearer assertions needs a JWKS fetch +
RS256/ES256 signature verification + aud / exp / jti replay checks —
a whole new trust surface — while the connector flow is a public
client with PKCE S256, which this server already enforces. A document
declaring `client_secret_basic` / `client_secret_post` **is**
refused: those methods need a secret this server never issued for a
CIMD client. `private_key_jwt` is deliberately **not** listed under
`token_endpoint_auth_methods_supported` in the AS metadata.

## Redirect URIs (exact match, platform-bound)

Allowlisted URIs:

- Claude: `https://claude.ai/api/mcp/auth_callback` and
  `https://claude.com/api/mcp/auth_callback`
- ChatGPT: `https://chatgpt.com/connector_platform_oauth_redirect`
- Muse: `https://agent.meta.ai/api/hatch/oauth/callback`
- Loopback: `http://localhost:*` / `http://127.0.0.1:*` (local
  testing, including Claude Code's ephemeral loopback port)

Anything else is refused — an open redirect via a registered client
is not possible. A redirect URI must **also** be exactly registered
for the client using it **and** valid for that client's platform
(`validateRedirectUriForPlatform`): a Muse client must NOT be able to
use a Claude callback URI and vice versa, even if the URI were
registered for it. The allowlist alone is never enough.

**Caveat — the `claude.com` callback:** the `claude.ai` callback was
verified against Anthropic's documentation
(claude.com/docs/connectors/building/authentication, fetched
2026-11-16). The `claude.com` variant was **not** confirmed in the
official doc fetched that day; it was allowlisted because Claude's
web app is served from both hosts. If Claude never sends it, remove
`CLAUDE_COM_OAUTH_CALLBACK` from
`src/lib/muse-connector/oauth/clients.ts`.

## Scopes

`claude.read` / `claude.write` / `claude.send` — the same tiers as
`muse.*` / `nxtsend.*`, with the same meaning. The prefix records
which platform the grant belongs to (so the consent screen and the
scope string round-trip honestly); authorization decisions go through
`grantHasTier`, never through a string prefix check, so a grant
holding any prefix satisfies the tier it needs. Tiers are
independent: `send` does NOT imply `write` or `read` — a grant must
hold each tier it needs.

- A requested scope must be a subset of the known scopes — anything
  else is refused with `invalid_scope`, never silently dropped or
  widened.
- When the client asks for no scope, the default is the
  least-privilege scope for its platform: `claude.read`.
- Plain-words descriptions (`SCOPE_DESCRIPTIONS`) are shown on the
  consent screen; see PERMISSIONS.md for the exact wording.

## RFC 8707 `resource` binding

The `resource` parameter must equal one of the canonical MCP resource
URLs for this origin **byte-for-byte**, else `invalid_target`. When
no resource is sent, it defaults to the canonical resource for the
client's platform (Claude → `https://<origin>/api/mcp/claude`) and is
recorded on the code, so the token is audience-bound either way. A
token bound to one MCP resource never validates for another: a token
issued for `/api/mcp` does not validate for `/api/mcp/claude`, and
vice versa.

## RFC 9207 `iss`

The authorization server issuer (the public origin, falling back to
the request origin and then `https://nxtsend.com`) is added to success
and error redirects and to token responses.

## Authorize state

The authorize request state is an HMAC-signed token
(`TOKEN_ENCRYPTION_KEY`, AES-256, base64 of 32 bytes). Without a valid
`TOKEN_ENCRYPTION_KEY` the authorize endpoint returns **503** — the
state cannot be signed. No extra key is needed for Claude.

## `offline_access` — deliberately NOT added

Anthropic appends `offline_access` to the scope request only when it
is listed in the authorization-server metadata. It is **not** listed
here, so Claude does not request it — and refresh tokens are issued
anyway (60-day lifetime, rotation on use). There is nothing to
configure; do not add it to `scopes_supported` unless Anthropic's
behaviour changes and a refresh-token grant starts depending on it.

## Lifetimes

| Credential | Lifetime |
|---|---|
| Authorization code | 10 minutes, single-use |
| Access token | 1 hour |
| Refresh token | 60 days, rotated on every use |

**Refresh rotation with reuse detection:** presenting an
already-rotated refresh token revokes the whole grant (reuse
revokes grant). See SECURITY.md.

## Consent screen

The consent screen shows the client name, the client origin, the
platform ("Claude"), the redirect URI's hostname ("After you approve,
you will be sent back to **claude.ai**."), and the requested scopes in
plain words. It warns that sending email and deleting leads always
need approval in Claude, every time, and that access can be revoked
at any time.

## No `CLAUDE_OAUTH_CLIENT_SECRET`

None exists or is needed: Claude clients register via DCR or identify
themselves with a CIMD `client_id` URL and are public by default;
NxtSend issues the credentials. Claude's Advanced-settings client
ID/secret fields are an optional fallback for pre-registered clients
only, not required for this connection.
