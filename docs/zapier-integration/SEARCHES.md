# Zapier Integration — Searches + Dynamic Dropdowns

## Searches (5)

All searches return actual matches, empty array when none. Auth:
Bearer token + `zapier.read` tier.

| Search | Key | Endpoint | Inputs |
|---|---|---|---|
| Find Lead | `find_lead` | `GET /v1/search/leads` | `q` / `email` / `id` |
| Find Campaign | `find_campaign` | `GET /v1/search/campaigns` | `q` / `id` / `status` |
| Find Conversation | `find_conversation` | `GET /v1/search/conversations` | `q` |
| Find LinkedIn Account | `find_account` | `GET /v1/search/accounts` | `q` |
| Get Campaign Performance | `get_campaign_performance` | `GET /v1/campaigns/:id/performance` | `campaignId` |

### Find or Create (search-or-creates)

- **Find or Create Lead**: Find Lead → Create Lead.
- **Find or Create Campaign**: Find Campaign → Create Campaign.

### Get Campaign Performance

Real stats via `loadCampaignStats`. `stats.linkedin.accepted` is
always `null` — no data source exists; never fabricated.

## Dynamic dropdowns (4 hidden triggers)

| Dropdown | Key | Endpoint |
|---|---|---|
| Campaigns | `list_campaigns` | `GET /v1/dropdowns/campaigns` |
| LinkedIn accounts | `list_accounts` | `GET /v1/dropdowns/accounts` |
| Lead statuses | `list_lead_statuses` | `GET /v1/dropdowns/lead-statuses` |
| Sequences | `list_sequences` | `GET /v1/dropdowns/sequences?campaign_id=` |

Rules:

- Powered by hidden triggers (`list_*`) against
  `GET /v1/dropdowns/*`, workspace-scoped by the token.
- A dropdown that is empty or errors returns `[]` (never breaks the
  editor); the user can type a value instead.
- ID pickers on actions (Update Lead, Send Reply, …) use the
  recent-items polling triggers (`new_lead`, `new_campaign`,
  `new_conversation`) — Zapier's style check (D005) only accepts
  **trigger** keys in `dynamic:`, not search keys, so the searches
  are not used as dropdown sources even though they exist.
- **Sequences are per-campaign**: `GET /v1/dropdowns/sequences?campaign_id=`
  requires a campaign id (steps belong to a campaign — there is no
  workspace-wide sequence list). The dropdown passes the campaign id
  from the Zap's input when one is selected; without one it is empty.
- **No templates dropdown**: `GET /v1/dropdowns/templates` does not
  exist — there is no message-template store in the product (prompt
  snippets are AI-drafting prompts, not outreach templates).
  Omitted, not faked.
