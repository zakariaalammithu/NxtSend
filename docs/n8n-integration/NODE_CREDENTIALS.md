# Node Credentials — NxtSend API credential in n8n

The node package (`n8n-nodes-nxtsend`, **PENDING** — Worker C)
exposes one credential type: **NxtSend API**. It has two modes.
Pick one per credential; a credential holds either an API key or
an OAuth2 grant, never both.

## Mode 1: API key (recommended for most workflows)

| Field | Value |
|---|---|
| Base URL | `https://<your-domain>` — default `https://nxtsend.com` in the credential. The node appends `/api/integrations/n8n/v1`. |
| API Key | The key created on Settings → Integrations → n8n. Keys look like `nxt_live_…`. Sent as `Authorization: Bearer <apiKey>` (verified from the node package). Shown exactly once at creation — paste it here immediately. |

- **Create the key first** (Settings → Integrations → n8n →
  "Create a new API key"). Give it a name that says where it is
  used (e.g. "Production n8n — lead sync").
- **Scope the key to what the workflow needs.** `n8n.read` only
  unless the workflow changes things. A read-only key calling a
  write operation fails with 403 — that is the scope working, not
  a bug.
- **Test the credential** in n8n (the credential screen's test
  button calls `GET /api/integrations/n8n/v1/auth/test`). A green
  test means the key works. It does not mean a workflow is
  connected.
- **Rotate by revoking, not by editing.** There is no way to view
  a key again. Revoke the old one on the settings page and create
  a new one, then update the credential.

## Mode 2: OAuth2

| Field | Value |
|---|---|
| Base URL | Default `https://nxtsend.com`. The Authorization URL, Access Token URL, Scope and Auth URI Query Parameters are hidden fields derived from it — you only fill in Base URL. |
| Authorization URL | (hidden, derived) `{{Base URL}}/api/muse/oauth/authorize` |
| Token URL | (hidden, derived) `{{Base URL}}/api/muse/oauth/token` |
| Client ID / Client Secret | From the one-time DCR call (see [API_AUTHENTICATION.md](API_AUTHENTICATION.md)) — shown once, store immediately |
| Scopes | (hidden, default) `n8n.read n8n.write` — read-only use needs `n8n.read` only (the field is hidden; change it in the credential's advanced view) |
| Authentication | (hidden, default) `header` — the access token is sent as `Authorization: Bearer` |
| Resource | Not set in the credential defaults; resource binding (RFC 8707) is enforced server-side on the token |

- **Connect from inside n8n:** add a credential → sign in on
  NxtSend's consent screen → choose scopes. A grant appears in
  the grants panel on the Integration Center page only after
  that approval — until then, nothing is connected.
- **PKCE:** n8n's OAuth2 credential sends no PKCE by default in
  most versions; the server allows that for confidential clients
  only. If your n8n version sends PKCE, it must be S256.
- **Refresh:** n8n auto-refreshes using the refresh token.
  Refresh tokens rotate on every use; re-presenting an
  already-rotated token within **10 minutes** rotates again
  from the successor instead of revoking the grant (n8n +
  Zapier grace-platform rule — see
  [API_AUTHENTICATION.md](API_AUTHENTICATION.md)). If n8n
  reports the credential as expired after ~60 days, reconnect.

## Which mode to choose

| Situation | Use |
|---|---|
| One n8n instance, workflows owned by one person | API key — simpler, no consent screen, revocation is one click |
| n8n Cloud / shared instance, per-user accountability matters | OAuth2 — each user grants their own access; revoking one user does not break others |
| Workflow only reads (sync, reporting) | API key with `n8n.read` only, or OAuth2 with `n8n.read` only |
| Workflow writes (create leads, send replies) | Either mode with the `n8n.write` scope |

## Troubleshooting credentials

- **401 on test:** the key/token is unknown, expired, revoked,
  or bound to another platform's resource. For API keys: check
  the key prefix matches the one on the settings page. For
  OAuth2: reconnect.
- **403 on test or on a node operation:** the scopes do not cover
  the call. Add `n8n.write` (new key, or reconnect with the wider
  scope).
- **503 on test:** Demo Mode, or `N8N_INTEGRATION_ENABLED=false`,
  or the server has no public URL configured.
- **"Invalid redirect URI" on OAuth connect:** the redirect URI
  registered by DCR does not exactly match what n8n sent.
  Re-register with the exact URI n8n shows (it is
  version-dependent).
- **Credential test passes but a node fails:** the credential is
  fine — check the operation's inputs and the workflow's error
  output (see [TROUBLESHOOTING.md](TROUBLESHOOTING.md)).
