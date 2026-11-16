# Troubleshooting

## ChatGPT side

### Developer Mode is missing / "Connectors" has no Advanced section

- **Cause:** plan or workspace-admin restriction. Developer Mode is
  documented for Business/Enterprise/Edu plans, and a workspace admin
  can disable custom connectors. Reports exist of free personal
  accounts also working, but that is not the documented path.
- **Fix:** check your plan; on a workspace plan ask the admin whether
  custom connectors are allowed. Availability changes often — re-check
  the live ChatGPT settings before assuming a product bug.

### "Connector could not be added" / MCP URL rejected

- **Cause:** the URL is wrong, the deployment is down, or the MCP
  surface is disabled.
- **Fix:** the URL must be exactly
  `https://<your-origin>/api/mcp/chatgpt` (no trailing slash, no
  `/api/mcp` — that is the Muse endpoint). Check the deployment is up
  (`GET /api/mcp/health` → 200) and `CHATGPT_MCP_ENABLED` is not
  `false` (Vercel env, then redeploy).

### Every tool call returns 401

- **Cause:** the access token is unknown, expired, revoked, or bound
  to the other platform's resource (RFC 8707), or the app is in Demo
  Mode.
- **Fix:** reconnect from ChatGPT (revoke the old grant first from
  NxtSend → Integrations → ChatGPT → "Your ChatGPT grants"). A token
  issued for `/api/mcp` never works on `/api/mcp/chatgpt`.

### "Missing scope" / reconnect prompt on a tool call

- **Cause:** the grant lacks the tier the tool needs (e.g. a
  `nxtsend.read` grant calling a Write tool). Tiers are independent —
  `send` does not imply `write` or `read`.
- **Fix:** reconnect and grant the scope the prompt names.

### `get_date_range_report` answers "not supported"

- **Not a bug.** The stats loaders have no date filter; the tool
  answers honestly instead of inventing numbers. Use
  `get_performance_summary` (all-time).

### Widget shows "needs the ChatGPT bridge" / empty

- **Cause:** the widget rendered without the `window.openai` bridge
  (or the render tool was called without `list_campaigns` data).
- **Fix:** ask ChatGPT to list campaigns first, then render. If the
  widget never renders inside ChatGPT at all, that is the known
  PENDING item — UI verification inside a live ChatGPT client has not
  happened yet; report the exact behaviour with a screenshot.

## NxtSend side

### Status "Not Connected" / "Configuration Required"

- `CHATGPT_MCP_ENABLED` (or its `MUSE_MCP_ENABLED` fallback) is
  `false`, or no public URL is set (`CHATGPT_MCP_PUBLIC_URL`,
  `MUSE_MCP_PUBLIC_URL` or `NEXT_PUBLIC_APP_URL`). Set one and
  redeploy.

### Authorize returns 503

- `TOKEN_ENCRYPTION_KEY` is missing or malformed — the
  authorize-state token cannot be signed. Set it
  (`openssl rand -base64 32`) and redeploy.

### MCP returns 503 `not_configured` in Demo Mode

- Expected. Demo Mode refuses the whole surface; the MCP server serves
  no demo data, ever. Configure Supabase and check again in live mode.

### A grant shows as inactive

- Its refresh token expired (60 days) or was revoked. Reconnect from
  ChatGPT to create a fresh grant.

### Test Connection says "no safe read-only verification call"

- Expected, by design. Proving the connector works needs a real
  ChatGPT OAuth grant (listed in the grants panel). Configuration
  alone never counts as verified, and no outbound call is made.

### Admin "Grants by client origin" shows "Unknown"

- Migration 023 tables could not be read. Apply migrations 023 + 024
  in Supabase (DATABASE.md).

### `private_key_jwt` / `client_assertion` refused with `invalid_client`

- Expected: `private_key_jwt` is NOT supported (OAUTH_SETUP.md — the
  reason is JWKS fetch + RS256/ES256 verification + aud/exp/jti replay
  protection). The client is treated as public (PKCE); use that flow.

### CIMD client refused ("Could not fetch or validate the client metadata document")

- The `client_id` URL is not https, the fetch timed out (> 5 s), the
  document is over 64 KB, the JSON is invalid, or the document fails
  validation (redirect URIs must be allowlisted; `grant_types` must
  include `authorization_code`; `client_secret_*` auth methods are
  refused). Fix the document at the client_id URL; NxtSend caches a
  good document for ~5 min per instance.
