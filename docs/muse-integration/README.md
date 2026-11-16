# NxtSend × Muse (Meta) Connector — Documentation

NxtSend exposes itself to Meta's Muse personal AI agent through the
**Muse Connector Platform**: NxtSend is the **server**, Muse is the
client. Muse calls into NxtSend's OAuth 2.1 server and hosted MCP
server on behalf of a NxtSend user. There is no public API for
driving a user's Muse agent, and this integration does not claim one.

> **Verification note (read first).** `platform.muse.ai/docs` itself
> was **not fetchable from this environment** — the requirements in
> these docs were verified from Meta Help Center-derived
> implementation guides and from the implementation in this repo, and
> **must be re-checked live before submission**. Nothing here has been
> submitted to Meta and **no approval is claimed**. Do not treat any
> statement about Meta's review process as primary-source verified.

## What is implemented

| Piece | Location |
| --- | --- |
| OAuth 2.1 server (auth code + PKCE S256, DCR, revoke, refresh rotation) | `src/lib/muse-connector/oauth/`, `src/app/api/muse/oauth/` |
| MCP server (Streamable HTTP, JSON-RPC 2.0, 18 tools) | `src/app/api/mcp/route.ts`, `src/lib/muse-connector/mcp.ts`, `src/lib/muse-connector/adapter.ts` |
| Grant management (list / revoke your grants) | `src/app/api/muse/grants/route.ts`, `src/lib/muse-connector/grants.ts` |
| Activity history (Muse audit entries for your workspace) | `src/app/api/muse/activity/route.ts` |
| Integration Center page (endpoints, scopes, grants, activity) | `src/app/(dashboard)/dashboard/integrations/[id]/page.tsx` |
| Admin overview + System Health check | `src/app/(admin)/admin/integrations/muse-ai/page.tsx`, `GET /api/admin/muse`, `getSystemHealth()` |
| Database | Migration `023_muse_oauth.sql` (`muse_oauth_clients`, `muse_oauth_codes`, `muse_oauth_tokens`) |

## Endpoints (all under the deployment's public origin)

| Endpoint | Purpose |
| --- | --- |
| `POST /api/mcp` | MCP server (Streamable HTTP). `GET /api/mcp/health` is the public health check. |
| `GET/POST /api/muse/oauth/authorize` | Consent screen (GET) + approve/deny (POST). |
| `POST /api/muse/oauth/token` | `authorization_code` + `refresh_token` exchange. |
| `POST /api/muse/oauth/revoke` | RFC 7009 revocation. |
| `POST /api/muse/oauth/register` | RFC 7591 Dynamic Client Registration (public clients by default). |
| `GET /.well-known/oauth-protected-resource/api/mcp` | RFC 9728 protected-resource metadata. |
| `GET/DELETE/POST /api/muse/grants` | List / revoke the signed-in user's grants. |
| `GET /api/muse/activity` | Workspace Muse activity (audit log, newest 50). |
| `GET /api/admin/muse` | Admin overview (grant count, tool-call counts, recent errors). |

## Scopes

- `muse.read` — read leads, campaigns, inbox, usage. **Recommended default.**
- `muse.write` — create/change leads and draft campaigns; pause/resume/archive. Never sends.
- `muse.send` — send email / inbox replies, permanently delete leads. Approval in Muse every time.

A requested scope outside these three is refused (`invalid_scope`), never silently widened. An omitted scope defaults to `muse.read`.

## Tools — 18 total

8 Read (`list_leads`, `get_lead`, `list_campaigns`,
`get_campaign_activity`, `list_conversations`, `get_conversation`,
`get_usage_summary`, `get_integration_statuses`), 7 Write
(`create_lead`, `update_lead`, `create_campaign`, `pause_campaign`,
`resume_campaign`, `archive_campaign`, `draft_outreach_message`),
3 Sensitive write (`send_email`, `send_inbox_reply` email-only,
`delete_lead`). Full list with inputs, side effects and
classifications: [MCP_TOOLS.md](MCP_TOOLS.md) and
[TOOL_PERMISSIONS.md](TOOL_PERMISSIONS.md).

## LinkedIn-send tools are NOT SUPPORTED

There is **no LinkedIn-send tool** in the manifest, by design. The
reason: **no authorized LinkedIn provider exists** for NxtSend, and
the official LinkedIn API exposes **no connection-request/DM
endpoints to standard developers**. LinkedIn campaign steps are
recorded SKIPPED by the executor and LinkedIn replies are refused
(HTTP 422) until an authorized provider is integrated. Nothing in
these docs claims otherwise.

## Platform limits that shape the design

- **Vercel Hobby 10s default function duration**: long streams are
  cut. The MCP server is therefore **stateless per request** — no
  long-lived session is held across requests.
- **In-memory rate limiting does not share across Vercel instances**:
  the 120 req/min per-grant limit lives in process memory, so two
  instances each enforce their own counter. Do not rely on it as a
  global cap.
- **Demo Mode refuses the whole Muse surface** (OAuth 400/503, MCP
  503). The demo persona is never served to Muse.

## Docs in this folder

| File | Covers |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Components, request flows, data model |
| [OAUTH_SETUP.md](OAUTH_SETUP.md) | OAuth 2.1 setup, step by step |
| [MCP_TOOLS.md](MCP_TOOLS.md) | The 18 tools, schemas, scope mapping |
| [TOOL_PERMISSIONS.md](TOOL_PERMISSIONS.md) | Classifications + approval rules |
| [SECURITY.md](SECURITY.md) | Threat model, storage, audit |
| [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md) | Env vars, deployment checklist |
| [TESTING.md](TESTING.md) | How to test, incl. real results |
| [MUSE_SUBMISSION.md](MUSE_SUBMISSION.md) | Submission path (NOT done) |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Errors and fixes |

## Test + build results (this repo, 2026-11-16)

- `npm test`: **1285 passing, 0 failing** (113 test files), including
  12 new Worker C tests (grants grouping/revocation, grants + activity
  route wrappers in Demo Mode, muse-ai status derivation).
- `npm run build` (`next build` 14.2.35): **passes**; all Muse routes
  present (`/api/mcp`, `/api/muse/grants`, `/api/muse/activity`,
  `/api/muse/oauth/*`, `/.well-known/oauth-protected-resource/api/mcp`,
  `/api/admin/muse`).
- No live Supabase deployment was exercised from this environment;
  live behaviour (real grant flow, migration 023 applied) is
  **untested against a live project** — see [TESTING.md](TESTING.md).
