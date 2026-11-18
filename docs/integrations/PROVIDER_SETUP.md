# Provider Setup

How to connect each provider. Every credential named here was read from
that provider's adapter config/definition in
`src/lib/integrations/providers/` — no credential name was invented.
Where a config names an env var, it is given; where it does not, the
credential is stored per-connection in the Integration Hub vault
(migration 016, encrypted with `INTEGRATION_HUB_ENCRYPTION_KEY`) and
entered through the Integration Center UI.

**Status reminder:** storing a credential does not make an integration
"live-verified". No provider below has been authenticated against its
real API. "Config-ready" means the adapter is implemented and
mock-tested; the first real call has not happened yet.

## How credentials are stored

- **Integration Hub vault** (default for the 64 adapters): the owner
  enters the credential in Dashboard → Integrations → provider detail
  page. It is encrypted at rest (AES-256-GCM,
  `INTEGRATION_HUB_ENCRYPTION_KEY`) and never rendered back in the UI,
  API responses, or logs.
- **Env-var seeding** (enrichment, verification, Category J adapters):
  the adapter config also names an env var (e.g. `APOLLO_API_KEY`) that
  can seed a connection. These vars are **not** in `.env.example`'s
  108 — they are adapter-level names, set only if the owner uses
  env-based seeding.
- **OAuth 2.0 providers** (HubSpot, Salesforce, Pipedrive, Zoho, Snov.io,
  ZoomInfo, Slack, Asana, Calendly, Google Sheets/Drive/Calendar):
  the owner completes the provider's OAuth flow and the resulting
  access + refresh tokens are stored as the connection credential.
  There is no in-app OAuth connect flow for the 64 adapters yet — the
  connect flow is credential entry, not a provider redirect (see
  [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md)).
- **NxtSend's own OAuth server** (Muse, ChatGPT, Claude, Zapier, n8n,
  Make, Pabbly, Albato, Activepieces): no client secret is stored in
  env. Clients register dynamically (DCR, RFC 7591) and are issued
  credentials by NxtSend. See [OAUTH_SETUP.md](./OAUTH_SETUP.md).

## 1. The 5 live platforms — no owner credential to obtain

| Provider | Auth | Owner action |
| --- | --- | --- |
| Muse (Meta) | OAuth 2.1 (NxtSend is the authorization server) | Apply migrations 023 (+024 for ChatGPT/Claude resources); set `TOKEN_ENCRYPTION_KEY`; no Meta credential needed until submission |
| ChatGPT (OpenAI) | OAuth 2.1 (DCR + CIMD) | As above; no OpenAI credential needed until submission |
| Claude (Anthropic) | OAuth 2.1 (DCR + CIMD) | As above; no Anthropic credential needed until submission |
| Zapier | OAuth 2.1 + REST API v1 | Apply migrations 025–027; publish the CLI app in the Zapier Platform (owner action, not done) |
| n8n | OAuth 2.1 or scoped API key (`nxt_live_`, created in-app) | Apply migrations 028–029; publish the community node to npm (owner action, not done) |

## 2. CRM

| Provider | Auth method | Credential to store | Where to obtain it |
| --- | --- | --- | --- |
| HubSpot | OAuth 2.0, or private-app token | OAuth tokens, or private-app access token | HubSpot account → Settings → Integrations → Private Apps (create a private app and copy its access token), or complete the OAuth flow |
| Salesforce | OAuth 2.0 (web-server flow) | Access token + refresh token + `instance_url` (`extra.instanceUrl`) | Salesforce Setup → App Manager → create a Connected App; complete the OAuth flow |
| Pipedrive | OAuth 2.0 | OAuth tokens | Pipedrive → Settings → Personal preferences → API, or create an OAuth app in the Developer Hub |
| Close | API key | Close API key | Close → Settings → API Keys |
| GoHighLevel | Bearer token | GoHighLevel API token | GoHighLevel sub-account → Settings → Business Profile / API (private integration token) |
| Zoho CRM | OAuth 2.0 | OAuth tokens | Zoho API Console → create a client; complete the OAuth flow |
| Attio | Bearer token | Attio access token | Attio → Settings → Developers → Access tokens |
| Breakcold | API key | Breakcold API key | Breakcold account → API settings |
| Monday.com | API key | Monday.com API token (v2) | Monday.com → avatar → Administration → API → copy the token |

## 3. Email outreach

| Provider | Auth method | Credential to store | Where to obtain it |
| --- | --- | --- | --- |
| Instantly | Bearer token | Instantly API key | Instantly → Settings → Integrations → API |
| Smartlead | API key as `api_key` query parameter | Smartlead API key | Smartlead → Settings → API |
| EmailBison | Bearer token | EmailBison API key | EmailBison account → API settings |
| Masterinbox | API key | Masterinbox API key | Masterinbox account → API settings (some endpoints unverified — see inventory §2.2) |
| SmartReach | API key | SmartReach API key | SmartReach → Settings → API |
| Reply.io | API key | Reply.io API key | Reply.io → Settings → API |
| Lemlist | API key | Lemlist API key | Lemlist → Settings → Integrations → API |
| Snov.io | OAuth 2.0 | Client ID + client secret | Snov.io → API / integrations settings |
| Mailshake | API key | Mailshake API key | Mailshake → Settings → API |
| Woodpecker | API key | Woodpecker API key | Woodpecker → Settings → API |

## 4. Lead enrichment

| Provider | Auth method | Credential / env var | Where to obtain it |
| --- | --- | --- | --- |
| Apollo | API key (`X-API-KEY` header) | `APOLLO_API_KEY` | Apollo → Settings → Integrations → API |
| Hunter | API key (`X-API-KEY` header) | `HUNTER_API_KEY` | Hunter → Dashboard → API |
| ZoomInfo | OAuth 2.0 | OAuth tokens | ZoomInfo admin → API access |
| ContactOut | API key | `CONTACTOUT_API_KEY` | ContactOut dashboard → API |
| SalesQL | Bearer token | `SALESQL_API_KEY` | SalesQL account → API settings |
| Snov.io | OAuth 2.0 | Client ID (`SNOV_CLIENT_ID`) + secret (`SNOV_CLIENT_SECRET`) | Snov.io → API settings |
| Dropcontact | API key | `DROPCONTACT_API_KEY` | Dropcontact → API |
| Persana | API key | `PERSANA_API_KEY` | Persana account → API settings (config-ready stub) |
| Clearbit | — | — | **BLOCKED:** standalone API deprecated post-HubSpot; do not attempt |
| Clay | API key | `CLAY_API_KEY` | Clay → Settings → API |
| Apify | API key | `APIFY_TOKEN` | Apify → Settings → Integrations → API tokens |
| RB2B | Inbound webhook | Webhook secret (`RB2B_WEBHOOK_SECRET`) | RB2B dashboard → webhook / integration settings |
| Factors.ai | API key | `FACTORS_API_KEY` | Factors.ai account → API settings (config-ready stub) |
| Trigify | — | — | **BLOCKED:** provider shut down 22 Oct 2026 |
| Weezly | — | — | **BLOCKED:** no public API exists |

## 5. Email verification

| Provider | Auth method | Credential / env var | Where to obtain it |
| --- | --- | --- | --- |
| MillionVerifier | API key | `MILLIONVERIFIER_API_KEY` | MillionVerifier → API |
| ZeroBounce | API key (`api_key` query parameter) | `ZEROBOUNCE_API_KEY` | ZeroBounce → Dashboard → API |
| NeverBounce | API key | `NEVERBOUNCE_API_KEY` | NeverBounce → Dashboard → API |
| Bouncer | API key | `BOUNCER_API_KEY` | Bouncer → API |
| Hunter Verifier | API key | `HUNTER_API_KEY` (shared with Hunter enrichment) | Hunter → Dashboard → API |

## 6. Automation platforms

| Provider | Auth method | Credential to store | Where to obtain it |
| --- | --- | --- | --- |
| Make | OAuth 2.0 (NxtSend is the authorization server) | None — Make registers via DCR against NxtSend | N/A (owner must submit the Make app; not done) |
| Pabbly Connect | OAuth 2.0 (NxtSend is the authorization server) | None — DCR | N/A (not submitted) |
| Albato | OAuth 2.0 (NxtSend is the authorization server) | None — DCR | N/A (not submitted) |
| Activepieces | OAuth 2.0 (NxtSend is the authorization server) | None — DCR | N/A (not submitted) |

## 7. Communication

| Provider | Auth method | Credential to store | Where to obtain it |
| --- | --- | --- | --- |
| Slack | OAuth 2.0 | Bot token (+ channel ID); incoming-webhook URL also accepted | Slack API → create an app → OAuth & Permissions → install to workspace |
| Microsoft Teams | Incoming webhook | Webhook URL | Teams channel → … → Connectors/Workflows → Incoming Webhook |
| Discord | Channel webhook | Webhook URL | Discord channel → Edit Channel → Integrations → Webhooks |
| Telegram | Bearer token | Bot token | Telegram → @BotFather → create a bot |
| WhatsApp Business | Bearer token | WhatsApp Business access token (+ phone number ID) | Meta for Developers → WhatsApp app → API Setup |

## 8. Productivity

| Provider | Auth method | Credential to store | Where to obtain it |
| --- | --- | --- | --- |
| Google Sheets | OAuth 2.0 | OAuth tokens (Sheets scope) | Google Cloud Console → OAuth client; stored Gmail-only grants must re-connect to add the Sheets scope |
| Google Drive | OAuth 2.0 | OAuth tokens (`drive.file` scope) | Google Cloud Console → OAuth client |
| Google Calendar | OAuth 2.0 | OAuth tokens (`calendar.events` scope) | Google Cloud Console → OAuth client |
| Airtable | API key | Personal access token + base ID + table ID | Airtable → Account → Developer Hub → Personal access tokens |
| Notion | API key | Internal integration secret + database ID | Notion → Settings → Connections → Develop your own integrations; share the database with the integration |
| Monday.com | API key | API token (v2) | Monday.com → Administration → API |
| Asana | OAuth 2.0 | OAuth tokens | Asana → Developer Console → create an app |
| Trello | API key | API key (+ token) | Trello → https://trello.com/app-key |
| ClickUp | API key | Personal API token | ClickUp → Settings → Apps → API |
| Jira | API key | API token (+ site URL, account email) | Atlassian → Account → Security → API tokens |
| Linear | API key | Personal API key | Linear → Settings → API |
| Calendly | OAuth 2.0 | OAuth tokens | Calendly → Integrations → API & Webhooks → OAuth app |

## 9. AI MCP clients (guides only)

| Client | Auth method | Credential to store | Where to obtain it |
| --- | --- | --- | --- |
| Gemini | OAuth 2.0 (NxtSend is the authorization server) | None — the client registers via DCR | Follow `providers/mcp-client-gemini.md` |
| Cursor | OAuth 2.0 (NxtSend is the authorization server) | None — DCR | Follow `providers/mcp-client-cursor.md` |
| Claude Code | OAuth 2.0 (NxtSend is the authorization server) | None — DCR | Follow `providers/mcp-client-claude-code.md` |

## 10. Category J

| Provider | Auth method | Credential / env var | Where to obtain it |
| --- | --- | --- | --- |
| GetLeads | API key (`X-API-Key` header) | `GETLEADS_API_KEY` | GetLeads account → API settings |
| Cornersight | API key (`X-API-Key` header) | `CORNERSIGHT_API_KEY` | Cornersight account → API settings |
| HotHawk | Bearer token | `HOTHAWK_API_KEY` | HotHawk account → API settings |

No operator guides exist yet for these three; setup steps reference
the official provider docs only.
