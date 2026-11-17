# Searches — NxtSend node

Searches look things up without changing anything. They need only
the `n8n.read` scope, so a read-only credential can run all of
them. The node package is **PENDING** (Worker C); the inventory
below is the implemented REST surface from the contract.

## Searches (5)

| Search | By | Notes |
|---|---|---|
| Find Lead | Name, email, or ID | Paired with Create Lead as "Find or Create Lead". Email lookup hits the same dedup as Create Lead. |
| Find Campaign | Name, ID, or status | Paired with Create Campaign as "Find or Create Campaign". Use it to check a campaign's status before pause/resume/stop. |
| Find Conversation | Search text | Searches conversation threads. |
| Find LinkedIn Account | Search text | Read-only — accounts cannot be created from n8n. Returns connected-account records (provider identity + authorization health). |
| Get Campaign Performance | Campaign ID | Real stats via `loadCampaignStats`; `accepted` is always `null` — no data source exists, never fabricated. |

## Dynamic dropdowns (4, hidden)

Dropdowns populate the node's option lists at workflow-build time.
They are hidden operations in the node (not top-level searches).

| Dropdown | Endpoint | Notes |
|---|---|---|
| Campaigns | `GET /v1/dropdowns/campaigns` | |
| LinkedIn accounts | `GET /v1/dropdowns/accounts` | |
| Lead statuses | `GET /v1/dropdowns/lead-statuses` | |
| Sequences | `GET /v1/dropdowns/sequences?campaign_id=` | `campaign_id` is required — steps belong to a campaign. |

There is **no templates dropdown** — no message-template store
exists in the product.

## Search-or-create

- **Find or Create Lead:** run Find Lead by email first; if no
  match, Create Lead. Create Lead itself dedupes by email, so a
  race between the two steps still returns the existing lead with
  `duplicate: true` rather than creating a second record.
- **Find or Create Campaign:** run Find Campaign by name first;
  if no match, Create Campaign (draft-only — remember it does not
  launch).
