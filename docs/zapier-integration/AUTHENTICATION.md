# Zapier Integration — Authentication (OAuth 2.0)

Zapier authenticates against NxtSend's **shared OAuth 2.0 server**
(`src/lib/muse-connector/oauth/`) — the same server the
Muse/ChatGPT/Claude connectors use, extended for Zapier. There is no
separate Zapier auth server.

## The flow

1. The owner registers the Zapier client **once** via Dynamic Client
   Registration (below). The response contains `client_id` +
   `client_secret` (**shown once** — store it in the Zapier developer
   dashboard immediately).
2. In the Zapier app settings, the owner enters:
   - Authorization URL: `https://<your-domain>/api/muse/oauth/authorize`
   - Token URL: `https://<your-domain>/api/muse/oauth/token`
   - Scopes: `zapier.read zapier.write` (or `zapier.read` for
     read-only Zaps)
   - Resource (RFC 8707): `https://<your-domain>/api/integrations/zapier`
3. A Zapier user connects an account in the editor: Zapier redirects
   to NxtSend's consent screen, the user signs in and chooses scopes,
   NxtSend issues an authorization code, Zapier exchanges it for
   access + refresh tokens.
4. Zapier calls the REST API with `Authorization: Bearer <token>`.
   The CLI's `beforeRequest` injects the header (the core does not do
   this automatically for OAuth2). A 401 triggers the core's
   auto-refresh (refresh token + retry) before `afterResponse` runs.

## Client registration (one-time DCR)

Copy the **OAuth Redirect URL** from the Zapier developer dashboard
first — it looks like
`https://zapier.com/dashboard/auth/oauth/return/App1234567CLIAPI/`.
The App ID is assigned at registration and **may change after
publish/beta**, in which case re-register with the new URL. Then:

```bash
curl -X POST https://<your-domain>/api/muse/oauth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "client_name": "Zapier",
    "redirect_uris": ["https://zapier.com/dashboard/auth/oauth/return/App1234567CLIAPI/"],
    "token_endpoint_auth_method": "client_secret_post"
  }'
```

There are **no hardcoded credentials and no env client vars**: no
`ZAPIER_OAUTH_CLIENT_SECRET` exists or is needed. The client's
credentials live in the Zapier developer dashboard, not in this
app's env.

## Redirect URI pattern

Pattern-validated, not hardcoded — host must be `zapier.com`, path
must match `/dashboard/auth/oauth/return/App<digits>CLIAPI/`
(trailing slash tolerated). Implemented in
`isZapierRedirectUri` (`src/lib/muse-connector/oauth/clients.ts`),
threaded through `isAllowedOAuthRedirectUri`, per-platform checks,
`clientPlatform` and DCR error strings.

## Scopes

| Scope | Tier | What it allows |
|---|---|---|
| `zapier.read` | read | Read leads, campaigns, inbox conversations and usage — no changes. Recommended default. |
| `zapier.write` | write | Create/change leads, draft campaigns, pause/resume/archive campaigns, enroll leads, send email inbox replies. |

There is **no `zapier.send` tier**: Zapier never sends LinkedIn
messages (no provider exists), and email inbox replies sent through
the Zapier API are covered by the write tier, documented as such. A
requested scope outside these two is refused, never silently
widened. The consent screen offers `zapier.read` as the recommended
default.

## PKCE — optional for confidential clients only

Zapier's standard OAuth2 client sends no PKCE (its canonical CLI
example has no `code_challenge` field), so requiring PKCE would make
the integration unusable. A confidential client authenticates the
code exchange with its `client_secret` — the same authentication
OAuth 2.0 relied on before PKCE — and the code is still single-use,
10-minute, redirect-bound and audience-bound. **Public clients still
require PKCE S256**; a stored challenge must still be satisfied by a
matching verifier. Migration 026 relaxes
`muse_oauth_codes.code_challenge` to nullable (non-destructive).

## Refresh rotation + Zapier grace

Refresh tokens rotate on every use. Zapier may re-present a refresh
token it already rotated (its auto-refresh can race a retry).
Without a grace window that looks like token theft and revokes the
whole grant, breaking the connection on a routine retry. So: a
Zapier grant re-presenting an already-rotated refresh token **within
10 minutes of the rotation** rotates again from the live successor
instead of revoking. Outside the window, or for Muse/ChatGPT/Claude
grants, reuse still revokes the grant.

Tradeoff, stated plainly: inside the window a stolen Zapier refresh
token could also be exchanged once more instead of triggering
revocation. The window is short, the token is still single-use per
rotation step — accepted because the alternative breaks Zapier
connections in normal use.

## Resource binding (RFC 8707)

The Zapier resource is `https://<origin>/api/integrations/zapier`,
validated byte-for-byte like the MCP resources. A token issued for
it never verifies for `/api/mcp*` and vice versa.
Protected-resource metadata:
`/.well-known/oauth-protected-resource/api/integrations/zapier`
(and `?resource=` on the root document).

## Token lifecycle

- Authorization codes: single-use, 10-minute, redirect-bound,
  audience-bound.
- Access tokens: Bearer, resource-bound, scope-enforced per route.
- Refresh tokens: rotate on every use; 60-day expiry (same as the
  MCP grants); revocation via RFC 7009 (`/api/muse/oauth/revoke`)
  or by revoking the grant from the Settings detail page / admin
  panel (revokes every token for the client + user pair).
- Tokens and codes are stored as SHA-256 hashes only — a database
  read can never yield a usable token, and no token value is ever
  logged or shown in the UI.

## Audit

Zapier API mutations log `zapier.*` actions
(`src/lib/integrations/zapier/audit.ts`). OAuth-server-level events
keep their `MUSE_OAUTH_*` names — they describe the shared
authorization server, not the calling platform.

## Errors

| Situation | Response |
|---|---|
| Demo Mode | 503 `Zapier is not available in Demo Mode…` |
| Unknown / expired / revoked token | 401 |
| Insufficient scope | 403 `{error, code}` |
| Rate limit (120 req/min per token) | 429 |
| LinkedIn reply attempt | 422 (refused by design) |
