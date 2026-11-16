# Zapier Integration — Actions (Creates)

12 actions, all verified against the real server implementation
(`src/lib/integrations/zapier/api.ts`). Auth: Bearer token +
`zapier.write` tier (mutations) — a `zapier.read`-only token gets
403.

## Leads

| Action | Key | Endpoint | Behaviour |
|---|---|---|---|
| Create Lead | `create_lead` | `POST /v1/leads` | Deduped by email — a duplicate returns the existing lead with `duplicate: true`. Only the server's fields are sent (`email`, `first_name`, `last_name`, `company`, `job_title`, `linkedin_url`, `status`, `tags`) — there is no `name`, `phone` or `source` on a lead. |
| Update Lead | `update_lead` | `PATCH /v1/leads/:id` | Includes status; emits `lead.updated` with `changed_fields`. |
| Import Leads | `import_leads` | `POST /v1/leads/import` | Bulk, at most 100 rows per call; `{leads: [...]}` → `{created, skipped, leads}` (`skipped` covers invalid rows and duplicates). |

## Campaigns

| Action | Key | Endpoint | Behaviour |
|---|---|---|---|
| Create Campaign | `create_campaign` | `POST /v1/campaigns` | **Draft only** — the server refuses any non-draft status. **At least one sequence step is required** (`step_type` + `content` for email/LinkedIn-message steps; step types: email, linkedin_message, connection_request, wait, condition, like_post, view_profile, endorse_skills). **No natural dedup key, so a retried create can duplicate a draft.** Launch from the dashboard, then pause/resume from Zapier. |
| Update Campaign | `update_campaign` | `PATCH /v1/campaigns/:id` | Name / type / description only. A `status` in the body follows the action transition rules. |
| Pause Campaign | `pause_campaign` | `POST /v1/campaigns/:id/pause` | Needs an active campaign (400 otherwise). |
| Resume Campaign | `resume_campaign` | `POST /v1/campaigns/:id/resume` | Needs a paused campaign (400 otherwise). |
| Stop Campaign | `stop_campaign` | `POST /v1/campaigns/:id/stop` | **Moves the campaign to `archived`** — there is no `stopped` status. Refuses an already-archived campaign. |
| Archive Campaign | `archive_campaign` | `POST /v1/campaigns/:id/archive` | Refuses an already-archived campaign. |
| Add Leads to Campaign | `add_leads_to_campaign` | `POST /v1/campaigns/:id/leads` | `{lead_ids: [...]}` → `{enrolled, skipped, notFound}`. |
| Remove Lead From Campaign | `remove_lead_from_campaign` | `DELETE /v1/campaigns/:id/leads/:leadId` | Removes the enrollment; the lead record is kept. Returns `{campaignId, leadId, removed: true}`. |

Transition rules follow the MCP adapter's `requiredFrom` rules
(pause needs active, resume needs paused, stop/archive refuse
already-archived). Lifecycle 400s surface the server's message
(e.g. "Only an active campaign can be paused (current status:
draft).").

## Conversations

| Action | Key | Endpoint | Behaviour |
|---|---|---|---|
| Send Reply | `send_reply` | `POST /v1/conversations/:id/replies` | **Email only** (LinkedIn replies are refused 422 by the server; this action never attempts one). Returns `{message, duplicate}`. A client-generated `idempotencyKey` is sent on every call (auto UUID unless supplied), so a retried step replays the original reply instead of sending twice. |

## Not implemented (deliberately)

- **Any LinkedIn send/accept action** — no provider; `accepted`
  is always null.
- **Create Draft** (`POST /v1/conversations/:id/drafts`) — the
  server confirms no draft concept exists in the product, so the
  action is omitted rather than faked. Drafting is a UI/AI feature
  (`draftOutreachMessage`), not a stored draft.
- **Date-range reporting** (`get_date_range_report`-style
  filtering does not exist in the stats loaders).
