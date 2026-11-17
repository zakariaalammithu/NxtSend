# Authentication — NxtSend × n8n

Two independent ways for n8n to authenticate. Either one works
alone; neither is required if the other is in use.

## 1. API keys (simplest; no OAuth dance)

- **Create:** Settings → Integrations → n8n → "Create a new API
  key" (name + scopes + optional expiry). The server returns the
  key **exactly once** — copy it into n8n immediately. It can
  never be shown again; a lost key must be revoked and replaced.
- **Use:** the NxtSend API credential in n8n, API-key mode. The
  key is sent as `Authorization: Bearer <apiKey>` — verified
  from the node package (`nodes/shared/constants.ts`: "Auth:
  `Authorization: Bearer <apiKey | OAuth2 access token>`";
  keys look like `nxt_live_…`). There is no `X-Api-Key`
  header.
- **Storage:** hashes only. The list endpoint never returns hashes
  or values — only `id`, `name`, `key_prefix`, `scopes`,
  `created_at`, `last_used_at`, `expires_at`, `revoked_at`.
- **Scopes:** `n8n.read` (GETs) and `n8n.write` (mutations).
  A read-only key cannot call a write endpoint (403).
- **Revocation:** immediate. The next call with a revoked key
  gets 401.
- **Expiry:** optional per key. An expired key gets 401.
- **NxtSend API keys ≠ n8n instance credentials.** The key
  authenticates n8n *to NxtSend*. Your n8n login is unrelated and
  is never entered in NxtSend.

## 2. OAuth 2.0 (shared server)

The same authorization server as Muse/ChatGPT/Claude/Zapier
(`src/lib/muse-connector/oauth/*`), extended for n8n. **Status:
LANDED — Worker B delivered the n8n extension (verified
2026-11-18):** `n8n.*` scopes in
`src/lib/muse-connector/oauth/scopes.ts`, the `n8n` branch in
`src/lib/muse-connector/grants.ts`, and the refresh grace in
`src/lib/muse-connector/oauth/tokens.ts`. The flow below quotes
Worker B's code; section references point at the exact files.

### Endpoints (shared — note the `/api/muse/oauth/*` prefix)

| Endpoint | Purpose |
|---|---|
| `GET/POST /api/muse/oauth/authorize` | Consent screen; approves or denies |
| `POST /api/muse/oauth/token` | `authorization_code` + `refresh_token` |
| `POST /api/muse/oauth/revoke` | RFC 7009 token revocation |
| `POST /api/muse/oauth/register` | RFC 7591 Dynamic Client Registration (one-time) |
| `/.well-known/oauth-protected-resource/api/integrations/n8n` | RFC 9728 protected-resource metadata |

### Scopes

| Scope | Allows (quoted from `SCOPE_DESCRIPTIONS` in `src/lib/muse-connector/oauth/scopes.ts`) |
|---|---|
| `n8n.read` | **Recommended default.** "Let n8n read your leads, campaigns, inbox conversations and usage — no changes are made." |
| `n8n.write` | "Let n8n create and change leads and draft campaigns, pause, resume or archive campaigns, enroll leads, and send email inbox replies. n8n never sends LinkedIn messages." |

There is **no `n8n.send` tier**. A scope outside these two is
refused at issue time, never silently widened.

### Dynamic Client Registration (one-time)

There is **no `N8N_OAUTH_CLIENT_SECRET` env var**. Register the
n8n client once with DCR (mirroring the Zapier registration in
`docs/zapier-integration/ZAPIER_SERVER.md` — same
`/api/muse/oauth/register` endpoint, with n8n's redirect URI):

```bash
curl -X POST https://<your-domain>/api/muse/oauth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "redirect_uris": ["https://<your-n8n-host>/rest/oauth2-credential/callback"],
    "client_name": "n8n",
    "scope": "n8n.read n8n.write",
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "token_endpoint_auth_method": "client_secret_post"
  }'
```

The response contains `client_id` + `client_secret` — shown once,
store it in n8n immediately. **Redirect URI:** n8n clients have
arbitrary instance callbacks, so the redirect URI is the n8n
instance's own callback URL (n8n's OAuth2 credential screen shows
it — typically
`https://<your-n8n-host>/rest/oauth2-credential/callback`).
Register exactly the URI n8n shows; a mismatch is refused with
"invalid redirect URI".

### Credential in n8n (OAuth2 mode)

The node package's `NxtSendOAuth2Api` credential derives the
URLs from its Base URL field (default `https://nxtsend.com`) —
the Authorization URL and Access Token URL are hidden fields
defaulting to `={{$credentials.baseUrl}}/api/muse/oauth/authorize`
and `={{$credentials.baseUrl}}/api/muse/oauth/token`, scope
defaults to `n8n.read n8n.write`, authentication is `header`
(Bearer). There is no resource parameter in the credential
defaults; resource binding (RFC 8707) is enforced server-side
on the token — a token issued for `/api/integrations/n8n` does
**not** validate for `/api/mcp*` or `/api/integrations/zapier`,
and vice versa.

### PKCE

PKCE is optional for confidential clients only; public clients
still require PKCE S256, and a stored challenge must still be
satisfied by a matching verifier. (Same rule as Zapier.)

### Refresh-token rotation and reuse grace

Quoted from Worker B's decision in
`src/lib/muse-connector/oauth/tokens.ts`
(`REFRESH_REUSE_GRACE_MS = 10 * 60 * 1000`):

> Refresh-token reuse grace window (10 minutes). n8n's and
> Zapier's OAuth2 clients auto-refresh tokens and may re-present
> a refresh token they already rotated (an auto-refresh can race
> a retry / re-run the same exchange); without a grace window that
> re-presentation would look like token theft and revoke the whole
> grant, breaking the connection on a normal retry. Within the
> window, re-presenting an already-rotated refresh token rotates
> AGAIN from the current successor instead of revoking. This
> applies ONLY to grace-platform grants (n8n.* / zapier.* scope
> or the n8n / Zapier resource) — Muse/ChatGPT/Claude keep
> strict reuse-revokes-grant. Tradeoff, stated plainly: inside
> the window a stolen refresh token could also be exchanged once
> more instead of triggering revocation. The window is short,
> the token is still single-use per rotation step, and the grant
> is revoked on any reuse outside the window.

Refresh tokens rotate on every use and expire after 60 days
(`MUSE_REFRESH_TOKEN_TTL_MS`); access tokens last 1 hour.

### OAuth platform-detection order

Quoted from Worker B's `grantOriginForClient` in
`src/lib/muse-connector/grants.ts` (client origin first, scope
prefix as fallback):

1. A Zapier redirect URI → **Zapier**.
2. The ChatGPT callback → **ChatGPT**.
3. A Claude callback → **Claude**.
4. An `n8n.*` scope → **n8n**. (n8n clients have arbitrary
   instance callbacks, so redirect URIs **cannot** identify
   them — classification is by the scope prefix fallback.)
5. A `client_id` URL: `chatgpt.com` → ChatGPT;
   `agent.meta.ai` → Muse; `claude.ai` / `claude.com` →
   Claude.
6. Anything else (e.g. loopback-only clients) → **Other**.

A client carrying the ChatGPT callback wins over Muse when both
are listed; a Zapier callback wins over Muse too. In
`summarizeGrantsByOrigin`, the same order applies per live
refresh token, and the `n8n` count is a distinct key in
`GrantsByOrigin` (alongside `muse`, `chatgpt`, `claude`,
`zapier`, `other`, `total`).

### Grant lifecycle

- A grant exists only after a completed OAuth exchange on the
  consent screen. It is the **only** thing that makes the
  Integration Center entry "Connected and Verified".
- Refresh tokens expire after 60 days (`MUSE_REFRESH_TOKEN_TTL_MS`).
- Revoking a grant (`DELETE /api/muse/grants?client_id=…` from
  the settings page) removes n8n's access immediately.
- A grant is scoped to one user and one workspace.

## Error codes

| HTTP | Meaning |
|---|---|
| 401 | Unknown, expired or revoked token/key; or token bound to another platform's resource (RFC 8707); or Demo Mode (demo refuses all n8n calls with 503 — see below) |
| 403 | Token/key scopes do not cover the call (`n8n.read` for GETs, `n8n.write` for mutations) |
| 422 | Refused by design — e.g. a LinkedIn reply (no authorized provider) |
| 503 | Demo Mode, or `TOKEN_ENCRYPTION_KEY` missing (authorize endpoint), or `N8N_INTEGRATION_ENABLED=false` |

## Demo Mode

Demo Mode refuses the whole n8n surface (OAuth 503/400, REST API
503). The demo persona is never served to n8n.
