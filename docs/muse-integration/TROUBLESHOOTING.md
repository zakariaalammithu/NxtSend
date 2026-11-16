# Troubleshooting

> **Verification note.** `platform.muse.ai/docs` itself was **not
> fetchable from this environment** — requirements were verified from
> Meta Help Center-derived implementation guides and from the code in
> this repo, and **must be re-checked live before submission**.
> Submission/approval is **NOT claimed**.

## Status problems (Integration Center → Muse.ai)

| Symptom | Cause | Fix |
| --- | --- | --- |
| Status `Demo Mode` | Supabase is not configured, or the app is running in Demo Mode. | Configure Supabase and redeploy. Demo Mode refuses the Muse surface by design — this is not a bug. |
| Status `Not Connected` | `MUSE_MCP_ENABLED` is `false`. | Remove it or set it to `true` and redeploy. |
| Status `Configuration Required` | Enabled, but no public URL is set (`MUSE_MCP_PUBLIC_URL` or `NEXT_PUBLIC_APP_URL`). | Set one and redeploy. |
| Status `Connected but Not Verified` | Surface configured, **no active grant yet**. | This is correct — configuration alone is never a connection. Connect from Muse to create a grant. |
| Status stays `Connected but Not Verified` after connecting | The grant count read failed (migration 023 not applied) or the grant is for a different workspace. | Apply migration 023; check the grant was approved by a user in this workspace. |

## OAuth errors

| Symptom | Cause | Fix |
| --- | --- | --- |
| Authorize returns **503** | `TOKEN_ENCRYPTION_KEY` is missing or malformed — the authorize-state token cannot be signed. | Set it (`openssl rand -base64 32`) in Vercel and redeploy. |
| Authorize refuses the client / redirect | Unknown `client_id`, or a `redirect_uri` outside the allowlist (only `https://agent.meta.ai/api/hatch/oauth/callback` or loopback `http://localhost:*`). | Register the client via DCR first; use an allowlisted redirect URI. |
| `invalid_scope` | A requested scope is not one of `muse.read` / `muse.write` / `muse.send`. | Request only the three known scopes. An omitted scope defaults to `muse.read`. |
| Token exchange `invalid_grant` | Code expired (10 min), already used (single-use), wrong PKCE verifier, or a refresh token that was already rotated. | Start the flow again. If a rotated refresh token is presented again, the **whole grant is revoked** (reuse detection) — reconnect from Muse. |
| Token exchange `invalid_client` | Confidential client presented a wrong secret. | Public clients (the default) have no secret — do not send one. |
| Revoke always answers 200, even for unknown tokens | By design (RFC 7009). | Not an error. |

## MCP errors

| Symptom | Cause | Fix |
| --- | --- | --- |
| `POST /api/mcp` → **401** | Missing/invalid/expired/revoked access token, or Demo Mode. | Reconnect / refresh the token. Check `WWW-Authenticate` on the response. |
| `POST /api/mcp` → **503 `not_configured`** | Demo Mode, or `MUSE_MCP_ENABLED=false`. | Live mode + enabled flag required. Demo never serves the MCP server. |
| `tools/call` → scope error | The token's scopes do not include the tool's required scope. | Reconnect with the wider scope (`muse.write` / `muse.send`), or use a Read tool. |
| `tools/call` → rate limited | Over 120 req/min for that grant. | Back off. Note the limit is **in-memory per instance** and does not share across Vercel instances. |
| Long MCP calls cut off / time out | **Vercel Hobby 10s default function duration.** | The server is stateless per-request by design; keep calls short. Raising the duration needs a Pro plan. |

## Grants panel problems

| Symptom | Cause | Fix |
| --- | --- | --- |
| Grants panel shows an error in live mode | Migration 023 not applied, or the service role is not configured. | Apply migration 023; set `SUPABASE_SERVICE_ROLE_KEY`. |
| A grant shows **Inactive** | Its refresh token expired (60 days) or was revoked. | Reconnect from Muse to create a fresh grant. |
| Revoke returns 404 | No active grant exists for that client + user (already revoked/expired). | Nothing to revoke — the grant is already dead. |
| "Last used: not tracked" | Migration 023 stores no last-used time. | Expected. It is reported honestly rather than invented. |

## Admin / health problems

| Symptom | Cause | Fix |
| --- | --- | --- |
| System Health `muse-mcp` check warns "tables could not be read" | Migration 023 not applied to this project. | Apply `supabase/migrations/023_muse_oauth.sql`. |
| Admin Muse page shows grant count **Unknown** | Same as above. | Apply migration 023. |
| Admin Muse page shows 0 grants, 0 tool calls | Nobody has connected yet. | Normal before first use — not a failure. |

## Things that are NOT bugs

- The consent screen shows account/workspace as **UUIDs** (no display
  names are resolved there yet).
- `Test Connection` on the Muse.ai page never returns "Verified":
  there is no safe read-only verification call for a connector —
  proving it works needs a real Muse grant.
- The legacy muse.ai **video** platform is a different product
  (rebranded to Skiv in March 2026). If that was the intent, evaluate
  Skiv instead.
- **LinkedIn-send tools are NOT SUPPORTED**: no authorized LinkedIn
  provider exists, and the official LinkedIn API exposes no
  connection-request/DM endpoints to standard developers. A LinkedIn
  send failing with "authorized integration required" (HTTP 422) is
  the designed behaviour.
