# Architecture

> **Verification note.** `platform.muse.ai/docs` itself was **not
> fetchable from this environment** — requirements were verified from
> Meta Help Center-derived implementation guides and from the code in
> this repo, and **must be re-checked live before submission**.
> Submission/approval is **NOT claimed**.

## Direction of the integration

```
Muse (Meta) ──OAuth 2.1 + MCP──▶ NxtSend (this repo)
   client                           server
```

Muse never runs inside NxtSend and NxtSend never drives a Muse
agent. Muse is an OAuth client + MCP client; NxtSend issues the
tokens and serves the tools. The user's data stays in NxtSend's
Supabase project; Muse only sees what a granted scope + an approved
tool call returns.

## Components

### OAuth 2.1 server — `src/lib/muse-connector/oauth/`

| Module | Role |
| --- | --- |
| `scopes.ts` | The three scopes (`muse.read` / `muse.write` / `muse.send`), plain-words descriptions, strict parsing (unknown scope → null → `invalid_scope`). |
| `pkce.ts` | S256 code-challenge verification only. `plain` and missing method are refused. |
| `clients.ts` | DCR validation, redirect-URI allowlist (only `https://agent.meta.ai/api/hatch/oauth/callback` or loopback `http://localhost:*`), client-secret verification. |
| `authorize.ts` | Authorize-request validation + code issuance (10-minute, single-use codes). |
| `state.ts` | Authorize-state signing/verification (needs `TOKEN_ENCRYPTION_KEY`; without it authorize returns 503). |
| `tokens.ts` | Issuance (access 1h, refresh 60d), hash-only storage (SHA-256), verification, rotation with reuse detection (reuse of a rotated refresh token revokes the whole grant), RFC 7009 revocation. |
| `store.ts` | `MuseOAuthStore` seam + in-memory store (tests) + Supabase store (service role). No token/code/secret plaintext ever reaches a store method. |
| `context.ts` | `resolveMuseContext(req)` → `{ userId, workspaceId, scopes, clientId, grantId } \| null`. `grantId` is `client_id:user_id`. Null in Demo Mode. |
| `config.ts` | `isMuseMcpEnabled` / `getMusePublicUrl`. Note: `MUSE_MCP_ENABLED` does **NOT** gate the OAuth routes. |
| `handlers.ts` | Pure token / revoke / register handlers (routes are thin wrappers). |
| `audit.ts` | `recordMuseOAuthEvent` → `audit_logs` WITH `workspace_id`. |

Routes: `src/app/api/muse/oauth/{authorize,token,revoke,register}/route.ts`
(thin wrappers), plus `src/app/.well-known/oauth-protected-resource/api/mcp/route.ts`
(RFC 9728 metadata).

**No static env-configured client exists.** Clients register only via
DCR (`POST /api/muse/oauth/register`, rate-limited, public by
default). There is no `MUSE_OAUTH_CLIENT_SECRET` env var.

### MCP server — `src/app/api/mcp/route.ts`, `src/lib/muse-connector/mcp.ts`

- `POST /api/mcp`: stateless Streamable HTTP, JSON-RPC 2.0.
  `initialize` declares protocol `2025-06-18`. `tools/list` returns
  the 18 manifest tools with classifications. `tools/call` enforces
  scopes and a **120 req/min per-grant in-memory rate limit**.
- Auth: `Authorization: Bearer <access token>`; 401 +
  `WWW-Authenticate` when missing/invalid.
- Demo Mode → **503 `not_configured`**. The demo persona is never served.
- `GET /api/mcp/health`: public, no auth — mode, `mcpEnabled`,
  tool count (18), `oauthConfigured`, protocol + server version.

### Tool adapter — `src/lib/muse-connector/adapter.ts`

The real adapter implements all 18 tools against the same
workspace-scoped data layer the dashboard uses (`src/lib/data/**`,
`src/lib/inbox/**`, `src/lib/executor/**`). `UnimplementedMuseConnectorAdapter`
is kept for tests/fallbacks. Tool input schemas + scope mapping live
in `src/lib/muse-connector/schemas.ts` (`TOOL_INPUT_SCHEMAS`,
`TOOL_SCOPES`, `requiredScope`).

### Grants — `src/lib/muse-connector/grants.ts`, `src/app/api/muse/grants/route.ts`

- `summarizeMuseGrants` groups token rows by client into grant
  summaries (client name, scopes, created, refresh expiry, active).
  "Last used" is **not stored** (migration 023 has no such column) and
  is reported as null, never invented.
- The Supabase source selects only safe columns from
  `muse_oauth_tokens` — **`token_hash` is never selected**.
- Revocation goes through the store's `revokeGrant` (all tokens for
  the client + user pair) and is audited as `MUSE_OAUTH_GRANT_REVOKED`.

### Activity — `src/app/api/muse/activity/route.ts`

Reads `audit_logs` for the caller's workspace filtered to Muse
actions (`muse.tool.*` and `MUSE_OAUTH_*`), newest 50.

### UI

- Integration Center detail page (`muse-ai`): readiness pack (kept),
  plus live panels — connection status, copyable endpoints, scopes in
  plain words, Connect-to-Muse steps, the user's grants with Revoke,
  activity history, security notes.
- Status derivation (`src/lib/integrations-center/status.ts`): Demo →
  `Demo Mode`; a real active grant → `Connected and Verified`; enabled
  + public URL, no grant → `Connected but Not Verified`; otherwise
  `Not Connected` / `Configuration Required`. Configuration alone can
  never yield `Connected`.
- Admin (`src/app/(admin)/admin/integrations/muse-ai/page.tsx` +
  `GET /api/admin/muse`, behind `resolveAdminGate()`): platform-wide
  grant count, tool-call counts, recent Muse errors. System Health
  (`getSystemHealth()`) has a `muse-mcp` check (endpoint reachable /
  grant count / migration-023 readability).

## Data model (migration 023)

| Table | Key columns |
| --- | --- |
| `muse_oauth_clients` | `client_id` (unique), `client_secret_hash` (null for public clients), `name`, `redirect_uris`, `created_at` |
| `muse_oauth_codes` | `code_hash` (PK), `client_id`, `user_id`, `workspace_id`, `scopes`, `code_challenge`, `redirect_uri`, `expires_at`, `used_at` |
| `muse_oauth_tokens` | `token_hash` (PK), `kind` (`access`/`refresh`), `client_id`, `user_id`, `workspace_id`, `scopes`, `expires_at`, `revoked_at`, `rotated_from_hash`, `created_at` |

RLS is **enabled with zero policies** on all three tables — only the
service role can read/write; the browser cannot reach them at all.
Tokens and codes are stored as **SHA-256 hashes only**.

## Request flows

**Connect (Custom Connector):** Muse → DCR register → user approves
on NxtSend's consent screen (PKCE) → code → token exchange → access
(1h) + refresh (60d) tokens → Muse calls `POST /api/mcp` with the
access token → `resolveMuseContext` verifies by hash → adapter runs
the tool workspace-scoped → audit row written.

**Refresh:** Muse presents refresh token → old one revoked, fresh
pair issued, new refresh records `rotated_from_hash`. Presenting the
old one again → reuse detected → **whole grant revoked**.

**Revoke:** user clicks Revoke in the Integration Center (or Muse
calls `/api/muse/oauth/revoke` with a refresh token) → all tokens for
that client + user revoked → audit event.

## Design constraints (deliberate)

- **Stateless per request.** Vercel Hobby's 10s default function
  duration cuts long streams, so the MCP server holds no session
  across requests.
- **In-memory rate limiting does not share across Vercel instances.**
  The 120 req/min per-grant counter is per process; two instances
  enforce independently. Do not treat it as a global cap.
- **No LinkedIn-send tool.** No authorized LinkedIn provider exists;
  the official LinkedIn API exposes no connection-request/DM
  endpoints to standard developers. See [TOOL_PERMISSIONS.md](TOOL_PERMISSIONS.md).
