# Security

> **Verification note.** `platform.muse.ai/docs` itself was **not
> fetchable from this environment** — requirements were verified from
> Meta Help Center-derived implementation guides and from the code in
> this repo, and **must be re-checked live before submission**.
> Submission/approval is **NOT claimed**.

## Threat model (what this design defends against)

| Threat | Mitigation |
| --- | --- |
| Stolen database dump yields usable tokens | Tokens/codes stored as **SHA-256 hashes only** — a read can never yield a usable token. No plaintext token is ever logged. |
| Stolen refresh token reused | Rotation on every refresh + `rotated_from_hash` reuse detection → **whole grant revoked** on reuse. |
| Cross-workspace data leak via a Muse call | Every tool call is workspace-scoped (`resolveMuseContext` → `workspaceId`); the adapter enforces it. Demo Mode returns null (fail closed). |
| Scope creep (a read token used to send) | Server-side scope enforcement per tool in `tools/call`; unknown scopes refused at authorize time. |
| Browser-side theft of OAuth material | Migration 023 tables have **RLS enabled, zero policies** — only the service role can read/write; the browser cannot reach them at all. |
| Authorization-code interception | PKCE **S256 only**; codes are 10-minute, single-use (`used_at`). |
| Open-redirect / token theft via redirect | Redirect-URI allowlist: only `https://agent.meta.ai/api/hatch/oauth/callback` or loopback `http://localhost:*`. |
| Rogue client registration | DCR is **rate-limited**; clients are public by default; confidential secrets stored as SHA-256 hashes only. |
| Accidental sends | Suppression list checked first, **fails closed**; Sensitive writes need approval in Muse **every time**. |
| Unbounded abuse of the MCP endpoint | **120 req/min per-grant in-memory rate limit** (see the caveat below). |

## Storage

- `muse_oauth_clients.client_secret_hash`: SHA-256 hex, or null for
  public clients. No plaintext secret is ever stored.
- `muse_oauth_codes.code_hash`, `muse_oauth_tokens.token_hash`:
  SHA-256 hex only.
- `TOKEN_ENCRYPTION_KEY`: AES-256 key (base64 of 32 bytes) that signs
  the authorize-state token. **Reused** from the Gmail/Outlook
  mailbox OAuth. If it is missing or malformed, authorize returns
  503 — it never falls back to an unsigned state.
- No token, code or secret material is ever written to `audit_logs`,
  server logs, or any API response. The grants API selects **no
  `token_hash` column at all**.

## Audit trail

- MCP tool calls: `recordMuseAudit` → `audit_logs` with
  `workspace_id`, action `muse.tool.<name>`, resource label, plain
  detail. Best-effort: an audit write failure is logged server-side
  and never fails the call it records.
- OAuth events: `recordMuseOAuthEvent`
  (`src/lib/muse-connector/oauth/audit.ts`) → same table, same
  `workspace_id` discipline: `MUSE_OAUTH_GRANT`, `MUSE_OAUTH_DENY`,
  `MUSE_OAUTH_TOKEN_EXCHANGE`, `MUSE_OAUTH_TOKEN_REFRESH`,
  `MUSE_OAUTH_TOKEN_REVOKE`, `MUSE_OAUTH_GRANT_REVOKED`,
  `MUSE_OAUTH_CLIENT_REGISTER`.
- Audit entries are visible to the user (Integration Center →
  activity history, newest 50) and to platform admins (Admin →
  Integrations → Muse.ai, and the admin Audit Logs page).

## Demo Mode — fail closed

Demo Mode refuses the whole Muse surface: `verifyMuseAccessToken`
returns null, `resolveMuseContext` returns null, the MCP server
answers 503 `not_configured`, and the OAuth routes refuse. The demo
persona (no user id) is never served to Muse.

## Known limitations (honest)

- **Vercel Hobby 10s default function duration** means long streams
  are cut — the design is **stateless per-request**; do not build
  long-lived MCP sessions on top of it.
- **In-memory rate limiting does not share across Vercel instances.**
  The 120 req/min per-grant counter is per process. On a multi-
  instance deployment the effective cap is higher; do not rely on it
  as a global cap. A shared store (e.g. Redis/Upstash) would be
  needed for a global limit — not implemented.
- **"Last used" is not tracked.** Migration 023 stores no last-used
  time; the grants UI says so instead of inventing one.
- **Consent screen shows account/workspace as UUIDs** (no display
  names are resolved there yet).
- **LinkedIn-send tools are NOT SUPPORTED**: no authorized LinkedIn
  provider exists, and the official LinkedIn API exposes no
  connection-request/DM endpoints to standard developers.

## What NOT to do

- Never put a token, code, secret or hash in a log, a doc, an audit
  detail, or a client response.
- Never disable RLS or add a permissive policy to the migration 023
  tables.
- Never claim a grant, a connection, or Meta approval that does not
  exist — the status derivation (`src/lib/integrations-center/status.ts`)
  only reports `Connected` when a real active grant exists.
- Never add a LinkedIn-send tool without an authorized provider.
