# MCP Tools (54)

The Claude flavor serves the **same 54 tools** as Muse and ChatGPT —
one manifest (`src/lib/muse-connector/manifest.ts`), one classification
scheme. **36 Read, 14 Write, 4 Sensitive write.** The original 18
Muse tools are unchanged; the 36 ChatGPT-expansion tools are unchanged
for Claude.

Annotations served on `tools/list`: `readOnlyHint: true` for 35 tools,
`destructiveHint: true` exactly for `delete_lead`, `delete_campaign`,
`send_email`, `send_inbox_reply`, `openWorldHint: false` everywhere
(all tools are bounded to the connected workspace).

**Exception:** `get_conversation` is classified Read but has
`readOnlyHint: false` — opening a thread marks its inbound messages
read, a real state change, declared in its description and side
effects.

Required scope (canonical name — see PERMISSIONS.md for the
`muse.*`-in-the-message caveat): Read → `muse.read` tier,
Write → `muse.write` tier, `send_email` / `send_inbox_reply` →
`muse.send` tier, `delete_lead` / `delete_campaign` → `muse.write`
tier (Sensitive-write classification is a Meta approval property, not
a scope). A `claude.*` grant satisfies the same tier.

## Read (36)

| Tool | readOnlyHint | Inputs | Description / side effects |
|---|---|---|---|
| `list_leads` | true | query?, list/tag filters, page | List leads in the workspace (paginated, searchable). None. |
| `get_lead` | true | leadId | Fetch one lead with tags, list membership and activity summary. None. |
| `list_campaigns` | true | status filter?, page | List campaigns with status, channel and enrollment counts. None. |
| `get_campaign_activity` | true | campaignId, page | Read a campaign's execution/activity history. None. |
| `list_conversations` | true | channel filter?, unreadOnly?, page | List inbox conversations (email/LinkedIn) with unread state. None. |
| `get_conversation` | **false** | conversationId | Read one conversation's message history. **Marks inbound messages in the thread as read** (read_at) — the state change the product UI already makes on opening a thread. |
| `get_usage_summary` | true | — | Current plan, usage counters and limit headroom. None. |
| `get_integration_statuses` | true | — | Integration Center statuses (no secret values, presence only). None. |
| `list_linkedin_accounts` | true | — | Connected LinkedIn accounts: provider, status, warm-up state, daily limits. Never connects or sends. None. |
| `get_linkedin_account` | true | accountId | One connected LinkedIn account by id. Never changes it. None. |
| `get_subscription_info` | true | — | Workspace subscription: plan, status, current period end. Never changes billing. None. |
| `get_account_limits` | true | — | Sending limits: per-account daily LinkedIn limits with today's counted usage, plus workspace safety settings. Never changes a limit. None. |
| `search_campaigns` | true | query?, status?, page | Search campaigns by name, optionally filtered by status. None. |
| `get_campaign_performance` | true | campaignId | One campaign's performance from real records. Unavailable event counts are null, never invented. None. |
| `get_campaign_execution_status` | true | campaignId, page | Sequence steps, recent activity, recorded step executions. LinkedIn steps show as skipped, never as sent. None. |
| `search_leads` | true | query, page | Search leads by name, email or company (case-insensitive substring). None. |
| `detect_duplicate_leads` | true | — | Duplicate lead groups (shared email or matching name + company) with evidence. Never merges or deletes. None. |
| `get_lead_activity_history` | true | leadId | One lead's full activity history: inbox messages + campaign activity. None. |
| `list_leads_by_campaign` | true | campaignId, page | Leads enrolled in a campaign, with enrollment status and current step. None. |
| `get_campaign_sequence` | true | campaignId | A campaign's sequence steps in order. None. |
| `get_scheduled_follow_ups` | true | conversationId? | Scheduled follow-up replies still queued (earliest due first). Nothing here sends one. None. |
| `get_sequence_execution_status` | true | campaignId | Recorded step executions grouped by step (sent, simulated, skipped, stopped, failed). None. |
| `get_pending_actions` | true | campaignId?, page | Pending LinkedIn automation actions. Never triggers an action; no tool sends a LinkedIn connection request or message. None. |
| `get_failed_actions` | true | campaignId?, page | Failed or skipped LinkedIn automation actions with the recorded reason. Never retries. None. |
| `get_automation_execution_report` | true | campaignId? | Per-campaign execution counts by outcome + workspace total. LinkedIn sends are never reported as sent. None. |
| `search_conversations` | true | query, channel?, page | Search inbox conversations by contact name, email, company or subject. None. |
| `get_message_execution_status` | true | messageId?, idempotencyKey?, conversationId? | Recorded status of one message (sent, simulated, failed, suppressed) with provider message id when one exists. A simulated message means no email was sent. None. |
| `get_failed_messages` | true | page | Failed or suppressed messages with the recorded error. Never retries. None. |
| `compare_campaigns` | true | campaignIds[] (2+) | Compare two or more campaigns side by side + aggregate + deltas from the group mean. None. |
| `get_date_range_report` | true | startDate, endDate | **NOT supported (by design):** the stats loaders compute over all-time records and cannot filter by date, so this tool always answers `BLOCKED` / `date_range_not_supported` (501) instead of inventing date-filtered numbers. Use `get_performance_summary`. None. |
| `get_performance_summary` | true | — | Workspace-wide performance summary. All-time numbers, never date-filtered. None. |
| `get_usage_report` | true | — | Plan and usage counters with limit headroom, plus account limits and safety settings. None. |
| `get_profile` | true | — | Connected NxtSend user and workspace: user id, workspace id, granted scopes, workspace plan. Reads identity from the validated grant only; never returns secrets. `_meta: {"openai/profile": true}`. None. |
| `search` | true | query | Search NxtSend as a knowledge source: leads and campaigns by name/email/company; hits with id, title, snippet and dashboard link. None. |
| `fetch` | true | id | Fetch one record by id — a lead or a campaign — full record. None. |
| `render_campaigns_widget` | true | campaignIds[], campaigns[] | Render the campaign dashboard widget. Always call `list_campaigns` first — this tool only renders, it never fetches data. `_meta.ui.resourceUri` + `_meta["openai/outputTemplate"]`: `ui://widget/campaigns.html`. None. |

## Write (14)

| Tool | Inputs | Description / side effects |
|---|---|---|
| `create_lead` | email, name?, company?, jobTitle?, tags? | Create a lead (deduplicated by email). Creates a lead row; may emit `lead.created`. |
| `update_lead` | leadId, fields | Update a lead's fields, tags or list membership. Modifies the lead row. |
| `create_campaign` | name, channel, steps[] | Create a **draft** campaign with sequence steps. Never activates sending by itself. |
| `pause_campaign` | campaignId | Pause an active campaign (stops future steps). Status change; may emit `campaign.status_changed`. |
| `resume_campaign` | campaignId | Resume a paused campaign. Actual sending additionally depends on a connected, authorized provider. Status change. |
| `archive_campaign` | campaignId | Archive a campaign (reversible from the dashboard). Status change. |
| `draft_outreach_message` | channel, stepType, campaign context, lead fields | Generate an AI draft for human review. Produces text only — it cannot send anything. Consumes AI provider quota; stores nothing unless the user saves the draft. |
| `stop_campaign` | campaignId | Stop a campaign: archives it, so no further sequence steps run. Reversible (un-archive). Never deletes the campaign or its leads. |
| `import_leads` | leads[] (up to 100; email required) | Import a batch of leads. Duplicates are skipped, never created twice. Never sends anything to the imported leads. |
| `add_leads_to_campaign` | campaignId, leadIds[] | Add leads as pending enrollments — queued for the sequence, nothing is sent by adding them. Already-enrolled leads are skipped. |
| `remove_leads_from_campaign` | campaignId, leadIds[] | Remove leads from a campaign (drops enrollments). Lead records are kept. |
| `create_sequence_step` | campaignId, stepType, delayHours, subject?, content?, config? | Add one step to the end of a campaign's sequence. Creating a step never activates sending — LinkedIn steps are recorded as skipped until an authorized provider exists. |
| `update_sequence_step` | campaignId, stepId, stepType?, delayHours?, subject?, content?, config? | Change one sequence step in place. Never sends anything. |
| `reorder_sequence_steps` | campaignId, stepIds[] | Reorder steps; the list must contain exactly the campaign's current steps. Never sends anything. |

## Sensitive write (4) — approval required every time, never "Always allow"

| Tool | Inputs | Description / side effects |
|---|---|---|
| `send_email` | to, subject, body, workspace context | Send one email through the workspace's configured provider. Suppression list is checked first and fails closed. **An email leaves the sending domain. Irreversible.** |
| `send_inbox_reply` | conversationId, body, idempotencyKey | Send a reply inside an existing inbox conversation (email channel only; LinkedIn replies stay refused until an authorized provider exists). **An email is sent and recorded with its provider message ID. Irreversible.** |
| `delete_lead` | leadId | Permanently delete a lead and its enrollments. **Data destruction — not recoverable from the product UI.** |
| `delete_campaign` | campaignId | Permanently delete a campaign and its sequence steps and enrollments. Only when the user explicitly asks — it cannot be undone. **Data destruction.** |

## What does NOT exist

- **No LinkedIn-send tool exists anywhere in this manifest and none is
  added.** There is no tool that sends a LinkedIn connection request or
  message, because no authorized LinkedIn provider exists and the
  official LinkedIn API exposes no connection-request/DM endpoints to
  standard developers. LinkedIn steps in sequences are recorded as
  skipped by the executor; the read tools report that honestly.
- **No persistent idempotency ledger.** Replay-dedupe exists only
  where the product already has a dedupe store (e.g. `send_inbox_reply`
  by idempotency key, lead import by email); a retried
  `create_campaign` / `create_sequence_step` would create a second row.
- **`get_date_range_report` is a deliberate non-tool** (see the Read
  table): it answers `BLOCKED`, it never invents numbers.
