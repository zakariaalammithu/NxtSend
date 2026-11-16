# Zapier Integration — Security

## What is stored, and how

- **Tokens and authorization codes are stored as SHA-256 hashes
  only** — a database read can never yield a usable token, and no
  token value is ever logged or shown in the UI.
- **OAuth tables** (`muse_oauth_clients`, `muse_oauth_codes`,
  `muse_oauth_tokens`, migrations 023 + 024 + 026): RLS enabled with
  **zero policies** — only the service role can read or write them;
  the browser cannot reach them at all.
- **Webhook tables** (`zapier_webhook_subscriptions`,
  `zapier_webhook_deliveries`, migration 025): same — RLS enabled,
  zero policies, service-role only.
- **Per-subscription HMAC secrets** are generated server-side at
  subscribe time and **never returned** by any endpoint, never
  selected by the admin API, and never shown in any UI.
- **No global webhook signing secret var exists** — there is nothing
  to leak from env.
- **No OAuth client credentials in env** — the Zapier client's
  `client_id` / `client_secret` live in the Zapier developer
  dashboard only. No `ZAPIER_OAUTH_CLIENT_SECRET` env var exists.
- **Audit rows carry no token/code/secret material** — only ids and
  action outcomes. Delivery payloads are never selected by the admin
  API (they can contain lead data).

## Token lifecycle

- Authorization codes: single-use, 10-minute, redirect-bound,
  audience-bound.
- Refresh tokens rotate on every use; reuse outside the Zapier
  10-minute grace window revokes the whole grant (see
  [AUTHENTICATION.md](AUTHENTICATION.md) for the grace tradeoff,
  stated plainly).
- Revocation: RFC 7009 (`/api/muse/oauth/revoke`) or revoke the
  grant from the Settings detail page — revokes every token for the
  client + user pair immediately.
- A grant is scoped to one user and one workspace and bound to one
  resource (RFC 8707): a token issued for
  `/api/integrations/zapier` does not validate for `/api/mcp*`, and
  vice versa. API calls are workspace-scoped and scope-enforced; a
  `zapier.read` token cannot call a write endpoint.

## PKCE decision

PKCE is optional for confidential clients only (Zapier's standard
OAuth2 client sends no PKCE); public clients still require PKCE
S256, and a stored challenge must still be satisfied by a matching
verifier. A confidential client authenticates the code exchange
with its `client_secret`.

## Webhook security

- Subscribe validates https + `hooks.zapier.com` / `zapier.com`
  target URLs — events never go to an arbitrary host.
- Deliveries are HMAC-SHA256 signed
  (`X-NxtSend-Signature: t=<ts>,v1=<hex>` +
  `X-NxtSend-Timestamp`, 5-min tolerance). Honest note: Zapier does
  **not** document verifying these headers on REST Hook deliveries;
  the signature is for receivers that do verify, and for delivery-log
  integrity.
- A 410 from Zapier deactivates the subscription (the Zap is gone).

## The LinkedIn boundary

There is no LinkedIn-send action, trigger, or endpoint. No
authorized LinkedIn provider exists, and the official LinkedIn API
exposes no connection-request/DM endpoints to standard developers.
LinkedIn replies through the Zapier API are refused 422, campaign
`accepted` is always `null`, and no LinkedIn event is emitted.
Nothing in this integration scrapes, automates browsers, or uses
session cookies.

## Demo Mode

Demo Mode refuses the whole Zapier surface (OAuth 503/400, REST API
503) — the demo persona is never served to Zapier, and no demo data
is ever returned to Zapier. The health endpoint still answers (it
reports `mode: "demo"`).

## What the UI never shows

- Token values or hashes, authorization codes, client secrets,
  webhook HMAC secrets, delivery payloads. Grants are identified by
  client name + scopes only. "Last used" is reported as "not
  tracked" — migration 023 stores no last-used time, so it is never
  invented.
