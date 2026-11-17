# Troubleshooting — NxtSend × n8n

## Status / connection

- **Status "Not Connected" / "Configuration Required":**
  `N8N_INTEGRATION_ENABLED` is false, or no public URL is set
  (`N8N_API_BASE_URL` or `NEXT_PUBLIC_APP_URL`). Set one and
  redeploy.
- **Status "Connected but Not Verified" with a working API key:**
  expected. The header status reflects OAuth grants only; an
  API-key connection is reported in the API-key panel on the
  settings page ("API-key signal: at least one API key has been
  used"). Configuration or a key alone never upgrades the header.
- **"Demo Mode":** the n8n surface is unavailable in Demo Mode
  by design. Configure Supabase (live mode) and check again.

## OAuth

- **Authorize returns 503:** `TOKEN_ENCRYPTION_KEY` is missing
  or malformed — the authorize-state token cannot be signed. Set
  it (`openssl rand -base64 32`) in Vercel and redeploy.
- **"Invalid redirect URI":** the redirect URI registered by DCR
  does not exactly match what n8n sent. Re-register with the
  exact URI from n8n's OAuth2 credential screen (it is
  version-dependent).
- **A grant shows as inactive:** its refresh token expired (60
  days) or was revoked — reconnect from n8n to create a fresh
  grant.

## API calls

- **401:** the access token or API key is unknown, expired,
  revoked, bound to another platform's resource (RFC 8707), or
  the app is in Demo Mode (demo refuses all n8n tokens with 503).
- **403:** the token's/key's scopes do not cover the call
  (`n8n.read` for GETs, `n8n.write` for mutations) — reconnect
  with the wider scope or create a key with the write scope.
- **422:** refused by design — a LinkedIn reply (no authorized
  provider), or a campaign action in the wrong state (e.g. pause
  on a paused campaign). Check the campaign's status with Find
  Campaign first.
- **503:** surface disabled or Demo Mode.

## API keys

- **Key lost:** it was shown exactly once at creation and cannot
  be recovered — revoke it on the settings page and create a new
  one.
- **Key works in the test but a node fails with 401:** the key
  was revoked after the test, or it expired. Check the key's
  status on the settings page (Active/Revoked, expiry, last used).
- **"Create key failed" with no value returned:** the server
  created the key but did not return its value — revoke it and
  create a new one. (The settings panel reports this instead of
  inventing a key.)

## Webhooks

- **Deliveries are late or missing:** the immediate attempt is
  best-effort; failed deliveries retry on the daily 06:00 cron
  (5m → 30m backoff, max 3 attempts, then dead) — a failed
  delivery may wait up to ~24h for its next retry. Check n8n's
  Executions and the admin n8n panel for delivery failures. A
  410 from n8n deactivates the subscription (the workflow/webhook
  is gone) — re-activate and re-subscribe.
- **Workflow fires twice for one event:** you subscribed both
  the native Trigger node and the generic Outbound Webhooks entry
  for the same event. Use one path per event (see
  [WEBHOOKS.md](WEBHOOKS.md)).
- **Signature mismatch:** the secret was regenerated (unsubscribe
  + re-subscribe creates a new secret) — update the receiver.
  Secrets are never returned, so there is no way to "re-view"
  one.

## Node / workflows

- **Node does not appear in n8n after install:** restart n8n —
  community nodes load at startup. Then check the install
  actually succeeded (Settings → Community Nodes).
- **`n8n-nodes-nxtsend` not found when installing by name:** the
  package is NOT on npm yet. Install from the repo path until it
  is published (see [N8N_SETUP.md](N8N_SETUP.md)).
- **Create Campaign produced two drafts:** a retried create has
  no dedup key. List campaigns and delete the duplicate draft;
  retry only after checking.
- **"Campaign not launching":** by design — campaigns created
  from n8n are drafts. Launch from the NxtSend dashboard.
- **Accepted is null in performance:** by design — no data source
  exists; it is never fabricated.

## Admin panel shows "unknown"

- **Grant count unknown:** migration 023 tables could not be read.
- **API-key counts unknown:** migration 028 not applied.
- **Subscription/delivery counts unknown:** migration 029 not
  applied.
- In all three cases the panel says "unknown", never zero —
  apply the migration and reload.
