# Screenshots — Muse Integration

No screenshots are included in this folder, deliberately.

Screenshots of this integration can only be captured **live from the
deployed site after Vercel deploys**. The live browser cannot reach a
local development server, and no screenshot in this folder has been
fabricated, mocked, or taken from another deployment. Do not add a
placeholder image here and present it as a real capture.

## Screenshots to capture (after deploy)

Capture each of the following from the deployed site, in live
(Supabase) mode, and save the files in this folder:

1. `01-integration-center-muse-ai.png` — Dashboard → Integration
   Center → Muse.ai detail page, top: header badge showing the live
   status and the "Live connection status" panel.
2. `02-endpoints.png` — the "Endpoints — this deployment" panel with
   the MCP endpoint URL visible.
3. `03-scopes.png` — the "Scopes" panel showing `muse.read` marked
   as the recommended default.
4. `04-grants-empty.png` — "Your Muse grants" with no grants
   (before connecting).
5. `05-consent-screen.png` — the OAuth consent screen at
   `/api/muse/oauth/authorize` (account/workspace shown as UUIDs).
6. `06-grants-active.png` — "Your Muse grants" after a successful
   Custom Connector connection, showing one Active grant.
7. `07-activity.png` — the "Integration activity history" panel with
   at least one `muse.tool.*` or `MUSE_OAUTH_*` entry.
8. `08-admin-muse-ai.png` — Admin → Integrations → Muse.ai, with the
   live overview (grant count, tool-call counts, recent errors).
9. `09-system-health-muse.png` — Admin → System → System Health,
   showing the `muse-mcp` check.
10. `10-mcp-health.png` — `GET /api/mcp/health` JSON response
    (`toolCount: 18`, `oauthConfigured: true`).

## Rules for captures

- Capture against the real deployed URL, never localhost, and never
  edit a screenshot to change a status, count, or URL.
- Do not include any token, code, secret, or hash in a screenshot.
  The grants panel never shows token values; if a capture
  accidentally includes one, delete it and re-capture.
- If a capture shows a status that contradicts these docs (e.g.
  "Connected" with no grant), treat the code as wrong, not the
  screenshot — file it as a bug.
