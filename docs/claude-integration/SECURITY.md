# Security

## Threat model

NxtSend is the authorization server **and** the resource server, and
Claude is an untrusted public client. The model assumes:

- Claude (and any code running in the user's Claude session) may
  present any token it holds; the server must never trust a token's
  claims without validating it against the grant store.
- Redirect URIs are attacker-controlled input until proven otherwise:
  only exact matches against the allowlist, bound to the client's
  platform, are usable.
- CIMD documents are fetched from the open internet: untrusted JSON,
  fetched with a timeout and a size cap, validated strictly, never
  persisted.
- The demo persona must never be served to an external client.

## Token storage

- Access tokens, refresh tokens and authorization codes are stored
  **only as SHA-256 hashes** (`hashToken`) in `muse_oauth_tokens` /
  `muse_oauth_codes`. No token or code value appears in any query,
  log, audit row or UI.
- Client secrets (confidential DCR clients only) are stored only as
  SHA-256 hashes; the plaintext secret is returned exactly once, at
  registration.
- CIMD clients are **never persisted**: the ephemeral row lives only
  for the request (`id` prefixed `cimd:`).
- No "last used" time is stored — the UI says "not tracked", never
  invented.

## Rotation and revocation

- Refresh tokens rotate on every use; the new token records
  `rotated_from_hash`. Presenting an already-rotated refresh token
  is reuse: **the whole grant is revoked**.
- Access tokens live 1 hour; refresh tokens 60 days; authorization
  codes 10 minutes, single-use.
- Revocation (`POST /api/muse/oauth/revoke`, RFC 7009) revokes the
  presented token and, for a refresh token, its grant.
- Revoking a grant from the Integration Center removes Claude's
  access immediately (every token for that client + user).

## Scope and resource binding

- Scope enforcement is per tool call, server-side, via `grantHasTier`
  (prefix-agnostic tier check). A grant cannot escalate: requesting a
  wider scope than granted is refused at the tool, not widened.
- Every token is bound by RFC 8707 to exactly one MCP resource
  (`https://<origin>/api/mcp/claude` for Claude). A token issued for
  `/api/mcp` or `/api/mcp/chatgpt` does not validate for
  `/api/mcp/claude`, and vice versa.
- Grants are scoped to one user + one workspace + one resource. The
  adapter always resolves the workspace from the grant, never from
  tool input. `get_profile` reads identity from the validated grant
  only — it never takes an identity from its input.

## Consent screen

The consent screen shows the client name, the client origin, the
platform ("Claude"), the redirect URI's hostname, and the requested
scopes in plain words — before any code is issued. The authorize
request state is HMAC-signed with `TOKEN_ENCRYPTION_KEY`; without
that key the authorize endpoint returns 503. Authorization codes are
issued only after the signed-in user approves on that screen.

## Redirect security

- Exact-match allowlist only (both Claude callbacks, the ChatGPT and
  Muse callbacks, loopback). Anything else is refused.
- Platform binding (`validateRedirectUriForPlatform`): a Muse client
  cannot use a Claude callback URI and vice versa, even if the URI
  were registered for the client.
- Error redirects go only to a redirect URI that is exactly
  registered for the client **and** valid for its platform; otherwise
  the error is shown on a NxtSend error page, never redirected.

## CIMD security

- https only, ~5 s timeout, ~64 KB cap, JSON only; failures fail
  closed and are never cached. Successful documents are cached in
  memory for ~5 min.
- `private_key_jwt` is not implemented: a document declaring it is
  treated as public and any `client_assertion` is refused
  `invalid_client`. `client_secret_basic` / `client_secret_post`
  documents are refused outright.
- The CIMD document's `redirect_uris` must all be allowlisted, and
  the resolved platform (Claude vs ChatGPT vs Muse) follows the
  document's redirect URIs and the `client_id` host — never the
  document's self-declared name.

## Audit

- Every MCP tool call is logged as `muse.tool.<name>` (shared with
  the Muse/ChatGPT connectors); OAuth events as `MUSE_OAUTH_*`.
- No token/secret/body material is written into audit rows.
- The Integration Center activity panel shows MCP tool calls and
  OAuth grant/revoke events for the workspace (newest first, up to
  50). The audit log is shared across all three platforms and is
  labelled as shared in the UI.

## Rate limiting — known limitation

**120 requests/min per grant, in-memory, per serverless instance.**
The limiter (`createRateLimiter`) lives in the handler process; on
Vercel it does **not** share state across instances, so it is a
best-effort brake, not a distributed guarantee. A persistent limiter
(e.g. Redis/Upstash) is future work. Exceeding the limit answers 429
with `Retry-After: 60`. The 64 KB request-body cap (413 over it) is
enforced at the route before the handler runs.

## Demo Mode

Demo Mode refuses the whole surface (503 `not_configured`) before any
auth check. The demo persona is never served to Claude, and no demo
data ever leaks through a tool, a prompt or a resource.

## What is deliberately NOT implemented (security-relevant)

- `private_key_jwt` client authentication — not implemented (see
  OAUTH_SETUP.md for the exact reason).
- `offline_access` scope — deliberately not added; refresh tokens are
  issued anyway (see OAUTH_SETUP.md).
- Persistent rate limiting — in-memory only (above).
- Persistent idempotency ledger — replay-dedupe only where the
  product already has a dedupe store; a retried `create_campaign` /
  `create_sequence_step` would create a second row.
- No fake "Connected"/"Verified" states: the Integration Center shows
  "Connected and Verified" only when a real, active Claude grant
  exists; configuration alone is "Connected but Not Verified" at
  most, and a Muse or ChatGPT grant never connects the Claude entry.
