# Integration Ecosystem — Screenshot list

This directory holds screenshots evidencing the integration ecosystem
work. **No screenshots have been taken yet for Wave 2, Phase 3** —
this file is the list of what to capture, not a record of captures.
Nothing here is fabricated: an item is listed as "captured" only after
the screenshot file exists in this directory and is named below.

## What to capture (and why)

| # | Screenshot | Captures | Status |
| --- | --- | --- | --- |
| 1 | `marketplace.png` | Dashboard → Integrations marketplace: search, category + connected filters, all 83 entries | Not captured |
| 2 | `provider-detail.png` | A provider detail page: Provider details section, field-mapping table, honest empty states | Not captured |
| 3 | `developers.png` | Dashboard → Developers home: API docs, API keys, webhooks | Not captured |
| 4 | `api-keys.png` | Developers → API Keys: n8n key list (hashes only — never capture a full key value) | Not captured |
| 5 | `admin-monitoring.png` | Admin → Integrations → Monitoring: per-provider counts (note the nulls for config-ready adapters) | Not captured |
| 6 | `oauth-consent.png` | The OAuth consent screen for a platform grant (redirect hostname visible) | Not captured — needs a live grant flow |
| 7 | `live-health.png` | Live `/api/mcp/health` + `/api/integrations/n8n/health` responses on the deployed origin | Not captured — needs the deploy to land |
| 8 | `webhook-delivery.png` | A delivered webhook in the outbox / a receiver log showing the HMAC-signed envelope | Not captured — needs a live subscription |

## Rules for captures

- Never capture a full credential, token, API key, or webhook secret
  value. Key lists show hashes/metadata only.
- A screenshot of a mock test passing proves the code path, not a
  live integration — label it as such in any report that uses it.
- Items 6–8 cannot be captured until the owner applies migrations
  022–031, 036, 038, sets `TOKEN_ENCRYPTION_KEY`, and the Vercel
  deploy lands (see `../DEPLOYMENT.md`).
