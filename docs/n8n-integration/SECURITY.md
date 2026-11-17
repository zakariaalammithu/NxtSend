# Security — NxtSend × n8n

## Threat model

- **Stolen API key / token:** scoped, expirable, revocable.
  A read-only key cannot write; a revoked key fails
  immediately. Keys are stored as hashes only, so a database
  read can never yield a usable key.
- **Stolen webhook secret:** per-subscription, so one leaked
  secret affects one subscription. It is never returned by any
  endpoint, so it cannot leak through the settings or admin
  panels. Rotate by unsubscribing and re-subscribing.
- **Replayed webhook:** `X-NxtSend-Timestamp` lets the receiver
  reject stale deliveries; the HMAC binds the payload to the
  secret.
- **Cross-platform token reuse:** RFC 8707 resource binding — a
  token issued for `/api/integrations/n8n` does not validate for
  `/api/mcp*` or `/api/integrations/zapier`, and vice versa.
- **Scope escalation:** a requested scope outside `n8n.read` /
  `n8n.write` is refused at issue time, never silently widened.
  Write endpoints enforce `n8n.write`.

## What is stored, and how

| Material | Storage |
|---|---|
| API keys | Hash only; plaintext shown exactly once at creation, never logged, never stored |
| OAuth tokens / codes | SHA-256 hashes only (migration 023 tables) |
| Webhook secrets | Per-subscription, generated server-side, never returned |
| Audit entries | Action names + resource labels + plain-language details only — no token, code, secret, key-hash or message-body material |

## RLS

The OAuth tables (migrations 023 + 024 + 026) and the n8n
tables (migrations 028–029) have RLS enabled with **zero
policies** — only the service role can read or write them; the
browser cannot reach them at all. The settings and admin panels
read through session/service-role API routes that select safe
columns only.

## What the admin API never returns

- Key hashes or key values (only counts)
- Per-subscription HMAC secrets
- Webhook payloads (they can contain lead data)
- Token values of any kind

## The LinkedIn boundary

There is no LinkedIn-send action, trigger, or endpoint. No
authorized LinkedIn provider exists, and the official LinkedIn
API exposes no connection-request/DM endpoints to standard
developers. Email inbox replies through n8n are covered by the
`n8n.write` tier and need no per-send approval. Any workflow
that claims to send LinkedIn messages through NxtSend is
misconfigured or misrepresenting the integration — report it.

## Demo Mode

Demo Mode refuses the whole n8n surface (OAuth 503/400, REST
API 503). The demo persona is never served to n8n.

## Secrets hygiene

- Never put an API key, client secret, or webhook secret in a
  workflow's static text, a shared template, or a screenshot.
  Use n8n credentials (encrypted at rest in n8n) for keys and
  OAuth secrets.
- Never commit `.env.local`, n8n credential exports, or the DCR
  response. The DCR `client_secret` is shown once — store it in
  n8n and delete the copy.
- `N8N_INTEGRATION_ENABLED` / `N8N_API_BASE_URL` are not secrets.
  There is deliberately **no** `N8N_API_KEY` and **no**
  `N8N_OAUTH_CLIENT_SECRET` env var.
