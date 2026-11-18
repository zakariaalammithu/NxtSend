# OAuth Setup — the shared OAuth 2.1 server

NxtSend runs **one** OAuth 2.1 authorization server for all nine
platforms that connect to it (Muse, ChatGPT, Claude, Zapier, n8n, Make,
Pabbly, Albato, Activepieces). There is no per-platform OAuth server
and no env-configured static client anywhere: clients exist only by
Dynamic Client Registration (RFC 7591) into `muse_oauth_clients`, or —
for ChatGPT and Claude — as ephemeral CIMD clients, validated per
request and never stored.

**Status reminder:** the server is implemented and mock-tested. No live
grant flow has ever completed against real credentials, and no platform
submission is claimed. A grant flow becomes possible only after the
owner applies migrations 022–029 and sets `TOKEN_ENCRYPTION_KEY` in
Vercel (see [DEPLOYMENT.md](./DEPLOYMENT.md)).

## 1. What the server implements

| Feature | Detail | Source |
| --- | --- | --- |
| Authorization code + PKCE | PKCE **S256 only** (migration 026 made PKCE optional for one legacy path — see note below) | `src/lib/muse-connector/oauth/` |
| Dynamic Client Registration | RFC 7591 — clients register at `/api/muse/oauth/register` and are issued credentials by NxtSend | `src/lib/muse-connector/oauth/clients.ts` |
| Client metadata documents | CIMD for ChatGPT and Claude — ephemeral clients, validated per request, never stored | `src/lib/muse-connector/oauth/cimd.ts` |
| Refresh-token rotation | Every refresh rotates the token; **reuse revokes the whole grant** | `src/lib/muse-connector/oauth/tokens.ts` |
| Reuse grace window | **10 minutes**, scoped to **Zapier and n8n grants only** (`REFRESH_REUSE_GRACE_MS = 10 * 60 * 1000`). A re-presented refresh token inside the window is tolerated (concurrent retries); outside it, reuse revokes the grant. All other platforms get strict reuse-revokes-grant with no grace. | `src/lib/muse-connector/oauth/tokens.ts` |
| Revocation | RFC 7009 token revocation at `/api/muse/oauth/revoke` | |
| Resource indicators | RFC 8707 `resource` parameter — tokens are bound to the API resource they were issued for | |
| Issuer identification | RFC 9207 `iss` parameter in authorization responses | |
| Authorization-code lifetime | 10 minutes (`MUSE_CODE_TTL_MS`); authorize-state lifetime also 10 minutes | `src/lib/muse-connector/oauth/tokens.ts`, `state.ts` |
| Public clients | Claude connects as a public client (DCR or CIMD, `token_endpoint_auth_method: "none"`, PKCE S256). There is **no** `CLAUDE_OAUTH_CLIENT_SECRET` anywhere. | `src/lib/muse-connector/oauth/clients.ts` |

Note on migration 026 ("OAuth PKCE optional"): the migration name
records that PKCE was made optional for one legacy compatibility path.
The server's normal behaviour is PKCE S256; do not rely on the
optional path for new clients.

## 2. Endpoints

All under `/api/muse/oauth/` (the path is historical — the same server
serves all nine platforms):

| Endpoint | Purpose |
| --- | --- |
| `POST /api/muse/oauth/register` | Dynamic Client Registration (RFC 7591) |
| `GET /api/muse/oauth/authorize` | Authorization endpoint (user consent screen) |
| `POST /api/muse/oauth/token` | Token endpoint (authorization-code exchange, refresh, client-credentials where applicable) |
| `POST /api/muse/oauth/revoke` | RFC 7009 token revocation |

Protected-resource metadata is served from
`/.well-known/oauth-protected-resource` (per-surface variants exist,
e.g. `/.well-known/oauth-protected-resource/api/mcp`,
`/api/integrations/zapier`, `/api/integrations/n8n`).

## 3. Scopes

Scopes are platform-prefixed. A scope never implies another tier:
`.send` is a separate tier and is never implied by `.write`.

| Platform | Scopes | `.send` tier? |
| --- | --- | --- |
| Muse | `muse.read`, `muse.write`, `muse.send` | Yes — separate tier |
| ChatGPT | `nxtsend.read`, `nxtsend.write`, `nxtsend.send` | Yes — separate tier |
| Claude | `claude.read`, `claude.write`, `claude.send` | Yes — separate tier |
| Zapier | `zapier.read`, `zapier.write` | No |
| n8n | `n8n.read`, `n8n.write` | No (API keys use the same two tiers) |
| Make | `make.read`, `make.write` | No |
| Pabbly | `pabbly.read`, `pabbly.write` | No |
| Albato | `albato.read`, `albato.write` | No |
| Activepieces | `activepieces.read`, `activepieces.write` | No |

LinkedIn-send/accept is NOT SUPPORTED on any platform — there is no
scope that grants it, and `accepted` stays null everywhere.

## 4. Callback (redirect) URIs

A redirect URI must be **exactly** registered for the client using it
AND valid for that client's platform. The allowlist alone is never
enough: a Muse client must not be able to use a Claude callback URI
and vice versa, even if the URI were registered for it. Anything not
listed here is refused — an open redirect via a registered client is
not possible.

| Platform | Callback URI |
| --- | --- |
| Muse | `https://agent.meta.ai/api/hatch/oauth/callback` |
| ChatGPT | `https://chatgpt.com/connector_platform_oauth_redirect` |
| Claude | `https://claude.ai/api/mcp/auth_callback` and `https://claude.com/api/mcp/auth_callback` (the `claude.com` one is allowlisted because Claude's web app is served from both hosts; it was not confirmed in the official doc fetched 2026-11-16 — remove it if Claude stops sending it) |
| Zapier | Pattern, not a fixed URL: `https://zapier.com/dashboard/auth/oauth/return/App<digits>CLIAPI/` — the App ID is assigned at Zapier registration; copy the exact URL from the Zapier developer dashboard and register it via DCR |
| n8n | Any `https` callback (n8n instances are self-hosted or Cloud, so the host is instance-specific; e.g. Cloud: `https://<name>.app.n8n.cloud/rest/oauth2-credential/callback`). Still requires an exact match against the `redirect_uris` the client registered via DCR; the consent screen shows the redirect hostname before approval; a client of another platform cannot use an n8n URI. Localhost / private-IP callbacks are refused in production. |
| Make / Pabbly / Albato / Activepieces | Instance/platform-specific; registered via DCR the same way (see `src/lib/muse-connector/oauth/clients.ts` for the per-platform rules) |
| Local testing | Loopback `http://localhost:*` / `http://127.0.0.1:*` allowed only when the deployment is local (`NODE_ENV !== "production"`), including Claude Code's ephemeral loopback port |

## 5. Grant management

- Users can list and revoke their Muse/ChatGPT/Claude grants in the
  product (Dashboard → Developers / Integrations). Grant listings
  never expose token values.
- API keys (n8n only) are managed at Dashboard → Developers → API Keys:
  create (shown once), list, revoke, expire. See
  [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md).
- Token storage: OAuth tokens for mailbox connections are encrypted
  with `TOKEN_ENCRYPTION_KEY` (AES-256-GCM, migration 014). The
  integration OAuth grants live in the `muse_oauth_*` tables
  (migrations 023/024). If `TOKEN_ENCRYPTION_KEY` is unset or
  malformed, mailbox connect refuses before any redirect; the
  integration grant flows require the migrations applied (see
  [DEPLOYMENT.md](./DEPLOYMENT.md)).

## 6. What is NOT set up yet (owner actions)

1. Apply migrations 022–031, 036, 038 in Supabase (note the gaps:
   032–035 and 037 do not exist).
2. Set `TOKEN_ENCRYPTION_KEY` in Vercel (generate with
   `openssl rand -base64 32`).
3. For each platform, complete its submission/registration flow
   (Meta, OpenAI, Anthropic, Zapier, npm/n8n, Make, Pabbly, Albato,
   Activepieces) — none has been started, and none is claimed.
4. Run one live grant flow per platform against real credentials and
   record the result. Until that happens, every grant flow is
   "implemented, not verified".
