# Credential Checklist

Every credential the integration ecosystem still needs from the owner.
**Status of every row below: NEEDED FROM OWNER** — nothing here has
been provided or verified. "Required" means the integration cannot
function without it; "Optional" means the integration works without
it but with reduced function (or it is only needed for a future step).

## A. Platform / infrastructure (required for any live integration)

| Credential / value | Required | Where to obtain | Status |
| --- | --- | --- | --- |
| `TOKEN_ENCRYPTION_KEY` (AES-256-GCM, base64 32 bytes) | Required | Generate: `openssl rand -base64 32`; set in Vercel | Needed |
| `INTEGRATION_HUB_ENCRYPTION_KEY` (dedicated AES-256-GCM key) | Required | Generate: `openssl rand -base64 32`; set in Vercel | Needed |
| `SUPABASE_SERVICE_ROLE_KEY` | Required | Supabase project → Settings → API | Needed (confirm set in Vercel) |
| `CRON_SECRET` | Required | Generate a random secret; set in Vercel | Needed |
| `ADMIN_BOOTSTRAP_SECRET` | One-time | Generate; remove after first super-admin use | Needed, then remove |

## B. The 5 live platforms

| Provider | Credential | Required | Where to obtain | Status |
| --- | --- | --- | --- | --- |
| Muse | None (DCR-issued by NxtSend) | — | N/A | Nothing to obtain; submission to Meta still required (owner action) |
| ChatGPT | None (DCR + CIMD) | — | N/A | Nothing to obtain; submission to OpenAI still required |
| Claude | None (DCR + CIMD, public client, no secret) | — | N/A | Nothing to obtain; submission to Anthropic still required |
| Zapier | None (DCR-issued by NxtSend) | — | N/A | Nothing to obtain; app publication in Zapier still required |
| n8n | Scoped API keys (`nxt_live_`), created in-app; or OAuth via DCR | Optional (alternative to OAuth) | Dashboard → Developers → API Keys | Creatable once deployed; none exists yet |

## C. CRM adapters (one credential per provider the owner wants to use)

| Provider | Credential | Required | Where to obtain | Status |
| --- | --- | --- | --- | --- |
| HubSpot | OAuth tokens, or private-app access token | Required | HubSpot → Private Apps / OAuth flow | Needed |
| Salesforce | OAuth tokens + `instance_url` | Required | Salesforce Connected App | Needed |
| Pipedrive | OAuth tokens | Required | Pipedrive Developer Hub / OAuth app | Needed |
| Close | API key | Required | Close → Settings → API Keys | Needed |
| GoHighLevel | API token | Required | GoHighLevel sub-account API settings | Needed |
| Zoho CRM | OAuth tokens | Required | Zoho API Console | Needed |
| Attio | Access token | Required | Attio → Settings → Developers | Needed |
| Breakcold | API key | Required | Breakcold API settings | Needed |
| Monday.com | API token (v2) | Required | Monday.com → Administration → API | Needed |

## D. Email outreach adapters

| Provider | Credential | Required | Where to obtain | Status |
| --- | --- | --- | --- | --- |
| Instantly | API key | Required | Instantly → Settings → Integrations → API | Needed |
| Smartlead | API key | Required | Smartlead → Settings → API | Needed |
| EmailBison | API key | Required | EmailBison API settings | Needed |
| Masterinbox | API key | Required | Masterinbox API settings | Needed |
| SmartReach | API key | Required | SmartReach → Settings → API | Needed |
| Reply.io | API key | Required | Reply.io → Settings → API | Needed |
| Lemlist | API key | Required | Lemlist → Settings → Integrations → API | Needed |
| Snov.io | OAuth client ID + secret | Required | Snov.io API settings | Needed |
| Mailshake | API key | Required | Mailshake → Settings → API | Needed |
| Woodpecker | API key | Required | Woodpecker → Settings → API | Needed |

## E. Enrichment adapters

| Provider | Credential | Required | Where to obtain | Status |
| --- | --- | --- | --- | --- |
| Apollo | API key (`APOLLO_API_KEY`) | Required | Apollo → Settings → Integrations → API | Needed |
| Hunter | API key (`HUNTER_API_KEY`) | Required | Hunter → Dashboard → API | Needed |
| ZoomInfo | OAuth tokens | Required | ZoomInfo admin → API access | Needed |
| ContactOut | API key (`CONTACTOUT_API_KEY`) | Required | ContactOut dashboard → API | Needed |
| SalesQL | API key (`SALESQL_API_KEY`) | Required | SalesQL API settings | Needed |
| Snov.io | OAuth client ID + secret | Required | Snov.io API settings | Needed |
| Dropcontact | API key (`DROPCONTACT_API_KEY`) | Required | Dropcontact → API | Needed |
| Persana | API key (`PERSANA_API_KEY`) | Required | Persana API settings | Needed (stub — verify first) |
| Clearbit | — | — | **BLOCKED — do not obtain** | N/A |
| Clay | API key (`CLAY_API_KEY`) | Required | Clay → Settings → API | Needed |
| Apify | API key (`APIFY_TOKEN`) | Required | Apify → Settings → API tokens | Needed |
| RB2B | Webhook secret (`RB2B_WEBHOOK_SECRET`) | Required | RB2B webhook settings | Needed |
| Factors.ai | API key (`FACTORS_API_KEY`) | Required | Factors.ai API settings | Needed (stub — verify first) |
| Trigify | — | — | **BLOCKED — provider shut down** | N/A |
| Weezly | — | — | **BLOCKED — no public API** | N/A |

## F. Email verification adapters

| Provider | Credential | Required | Where to obtain | Status |
| --- | --- | --- | --- | --- |
| MillionVerifier | API key (`MILLIONVERIFIER_API_KEY`) | Required | MillionVerifier → API | Needed |
| ZeroBounce | API key (`ZEROBOUNCE_API_KEY`) | Required | ZeroBounce → Dashboard → API | Needed |
| NeverBounce | API key (`NEVERBOUNCE_API_KEY`) | Required | NeverBounce → Dashboard → API | Needed |
| Bouncer | API key (`BOUNCER_API_KEY`) | Required | Bouncer → API | Needed |
| Hunter Verifier | API key (`HUNTER_API_KEY`, shared) | Required | Hunter → Dashboard → API | Needed |

## G. Automation platforms

| Provider | Credential | Required | Where to obtain | Status |
| --- | --- | --- | --- | --- |
| Make | None (DCR-issued by NxtSend) | — | N/A | Nothing to obtain; app submission still required |
| Pabbly Connect | None (DCR-issued) | — | N/A | Nothing to obtain; submission still required |
| Albato | None (DCR-issued) | — | N/A | Nothing to obtain; submission still required |
| Activepieces | None (DCR-issued) | — | N/A | Nothing to obtain; submission still required |

## H. Communication adapters

| Provider | Credential | Required | Where to obtain | Status |
| --- | --- | --- | --- | --- |
| Slack | Bot token (+ channel ID) or incoming-webhook URL | Required | Slack API → create an app | Needed |
| Microsoft Teams | Incoming-webhook URL | Required | Teams channel → Connectors/Workflows | Needed |
| Discord | Channel webhook URL | Required | Discord channel → Integrations → Webhooks | Needed |
| Telegram | Bot token | Required | Telegram → @BotFather | Needed |
| WhatsApp Business | Access token (+ phone number ID) | Required | Meta for Developers → WhatsApp app | Needed |

## I. Productivity adapters

| Provider | Credential | Required | Where to obtain | Status |
| --- | --- | --- | --- | --- |
| Google Sheets / Drive / Calendar | OAuth tokens (Sheets, `drive.file`, `calendar.events` scopes) | Required | Google Cloud Console → OAuth client | Needed |
| Airtable | Personal access token + base + table IDs | Required | Airtable Developer Hub | Needed |
| Notion | Internal integration secret + database ID | Required | Notion → Develop your own integrations | Needed |
| Monday.com | API token (v2) | Required | Monday.com → Administration → API | Needed |
| Asana | OAuth tokens | Required | Asana Developer Console | Needed |
| Trello | API key (+ token) | Required | https://trello.com/app-key | Needed |
| ClickUp | Personal API token | Required | ClickUp → Settings → Apps → API | Needed |
| Jira | API token (+ site URL, email) | Required | Atlassian → Account → Security → API tokens | Needed |
| Linear | Personal API key | Required | Linear → Settings → API | Needed |
| Calendly | OAuth tokens | Required | Calendly → Integrations → API & Webhooks | Needed |

## J. Category J adapters

| Provider | Credential | Required | Where to obtain | Status |
| --- | --- | --- | --- | --- |
| GetLeads | API key (`GETLEADS_API_KEY`) | Required | GetLeads API settings | Needed |
| Cornersight | API key (`CORNERSIGHT_API_KEY`) | Required | Cornersight API settings | Needed |
| HotHawk | API key (`HOTHAWK_API_KEY`) | Required | HotHawk API settings | Needed |

## K. What NOT to obtain

- Do not obtain Clearbit, Trigify, or Weezly credentials — those
  providers are blocked (see inventory §2.3).
- Do not create `*_OAUTH_CLIENT_SECRET` values for Muse, ChatGPT,
  Claude, Zapier, n8n, Make, Pabbly, Albato, or Activepieces — no
  such env var exists; clients register dynamically.
- Do not put any provider API key in `.env` unless the adapter's
  config names that env var as a seeding source (§E/§J above) — the
  normal path is per-connection storage in the Hub vault via the UI.
