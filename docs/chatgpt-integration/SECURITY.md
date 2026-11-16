# Security

## Threat model (what this surface protects against)

| Threat | Mitigation |
|---|---|
| Stolen database dump yields usable tokens | Tokens and codes stored as SHA-256 hashes only; no token value ever logged, shown in UI, or selected by any query |
| Stolen refresh token reused | Rotation on every use + reuse detection: presenting an already-rotated refresh token revokes the whole grant |
| Token used on the wrong platform | RFC 8707 `resource` binding, validated byte-for-byte; tokens are audience-bound |
| Open redirect via a registered client | Redirect URIs exact-matched against an allowlist (ChatGPT callback, Muse callback, loopback local-only) AND exactly registered for the client |
| Scope escalation | Unknown scopes refused (`invalid_scope`); tiers independent; every tool call re-checks the grant's tiers server-side |
| Cross-workspace data access | Every tool call is workspace-scoped from the validated grant; the adapter never takes a workspace id from tool input |
| `get_profile` identity spoofing | Identity comes only from the validated grant; the tool takes no identity input and returns no secrets |
| SSRF via CIMD fetch | https only, 5 s timeout, 64 KB cap, JSON-only, validated shape, ~5 min in-memory cache, fail closed |
| `private_key_jwt` assertion forgery | Not implemented: assertions refused with `invalid_client`; the method is not declared in the RFC 8414 metadata |
| Brute-force / abuse of the MCP endpoint | 120 req/min per grant, in-memory limiter (see below); 401s carry no information about which token exists |
| Demo data leaking to ChatGPT | Demo Mode refuses the whole surface (OAuth 503/400, MCP 503) |
| Fake "connected" states | The Integration Center shows "Connected" only for a real active grant; configuration alone is "Connected but Not Verified" at most, and Test Connection performs no fake verification |

## Token handling

- Authorization codes: single-use, 10 min, PKCE S256 verified.
- Access tokens: 1 h. Refresh tokens: 60 d, rotating.
- Authorize-request state: HMAC-signed with `TOKEN_ENCRYPTION_KEY`;
  the authorize endpoint returns 503 without a valid key.
- The OAuth tables (`muse_oauth_clients`, `muse_oauth_codes`,
  `muse_oauth_tokens`) have RLS enabled with **zero policies** —
  only the service role can read or write them. The browser cannot
  reach them at all.
- Revocation: RFC 7009 (`POST /api/muse/oauth/revoke`) and the grants
  panel both revoke every token for the client + user pair.

## Rate limiting — and its limitation

- **120 requests per minute per grant**, in-memory limiter, `429` +
  `Retry-After: 60` on excess. The limiter lives in the serverless
  instance's memory (`src/lib/muse-connector/mcp.ts`).
- **Limitation, stated honestly:** the limiter is **not shared across
  serverless instances**. On Vercel, concurrent instances each enforce
  their own 120/min budget, so the effective ceiling is higher than
  120/min under load. There is no persistent (Redis/Upstash) limiter
  in this build. This is acceptable for a connector used by one human
  at a time, and it must be revisited before any high-volume use.

## Audit

- Every MCP tool call is audit-logged (best-effort; an audit failure
  never changes the result) as `muse.tool.<name>` with grant id and
  outcome. OAuth grant/revoke/deny events are logged as
  `MUSE_OAUTH_*`.
- The audit stream is **shared with the Muse connector** — the
  ChatGPT detail page says so, and the admin overview reads the same
  `muse.*` / `MUSE_OAUTH*` actions.
- No token, code, secret or message-body material is ever stored in
  audit rows.

## In-memory state (what does not survive a redeploy)

- CIMD document cache (~5 min TTL, per instance).
- Rate-limiter counters (per instance).
- Nothing else: grants, tokens and codes live in Supabase.

## What is NOT in scope

- No `private_key_jwt` (see OAUTH_SETUP.md for the exact reason).
- No persistent idempotency ledger (see MCP_TOOLS.md).
- No LinkedIn-send capability (see README.md).
- No webhook/event push to ChatGPT — ChatGPT polls via MCP tools.
- The campaigns widget runs untrusted model-supplied data through an
  HTML escaper (`esc()` in `widget.ts`); the widget document loads no
  external resources.
