# MCP Tools (54)

Source of truth: `src/lib/muse-connector/manifest.ts`
(`NXTSEND_TOOL_MANIFEST`). The table below is generated from that
manifest — if this document and the manifest ever disagree, the
manifest wins.

## Counts

- **54 tools total: 36 Read, 14 Write, 4 Sensitive write.**
- The original 18 Muse tools are unchanged (names and classifications
  byte-identical); 36 tools were added for the ChatGPT expansion.
- Annotations on `tools/list`: `readOnlyHint: true` for 35 tools,
  `destructiveHint: true` for exactly 4 tools (`delete_lead`,
  `delete_campaign`, `send_email`, `send_inbox_reply`),
  `openWorldHint: false` on all 54.
- **One deliberate exception:** `get_conversation` is classified Read
  but has `readOnlyHint: false`, because opening a thread marks its
  inbound messages read — a real state change, declared in the tool's
  description and side effects. Keep it; do not "fix" it to `true`.
- Every tool result carries both `content` and `structuredContent`.
- `get_profile` carries `_meta: { "openai/profile": true }`.
- `render_campaigns_widget` carries `_meta.ui.resourceUri` and
  `_meta["openai/outputTemplate"]` (`ui://widget/campaigns.html`).
- `search` and `fetch` are the ChatGPT knowledge tools: `search` over
  leads + campaigns returns `{id, type, title, snippet, url}`; `fetch`
  by id returns the record.

## Classification rules

- **Read** — retrieves data, no state change (except the documented
  `get_conversation` read-marking).
- **Write** — creates or changes state, never sends anything out of the
  workspace.
- **Sensitive write** — irreversible or consequential (sending email,
  permanent deletion). Approval is required in ChatGPT **every time**;
  it can never be set to "Always allow".

## Scope mapping

| Classification | Required scope tier |
|---|---|
| Read | `nxtsend.read` (or `muse.read`) |
| Write | `nxtsend.write` (or `muse.write`) |
| Sensitive write | `nxtsend.send` (or `muse.send`) |

Tiers are independent — `send` does not imply `write` or `read`. A
call whose grant lacks the tier gets a structured reconnect prompt
(HTTP 200 tool result, `isError: true`, `code: missing_scope`,
`reconnect: true`).

## The full list

| Tool | Classification | readOnlyHint | destructiveHint | Description |
|---|---|---|---|---|
| `list_leads` | Read | true | false | List leads in the user's workspace (paginated, searchable). |
| `get_lead` | Read | true | false | Fetch one lead with its tags, list membership and activity summary. |
| `list_campaigns` | Read | true | false | List campaigns with status, channel and enrollment counts. |
| `get_campaign_activity` | Read | true | false | Read a campaign's execution/activity history. |
| `list_conversations` | Read | true | false | List inbox conversations (email/LinkedIn) with unread state. |
| `get_conversation` | Read | false | false | Read one conversation's message history. Marks the thread read, matching the product UI. |
| `get_usage_summary` | Read | true | false | Current plan, usage counters and limit headroom for the workspace. |
| `get_integration_statuses` | Read | true | false | Integration Center statuses (no secret values, presence only). |
| `create_lead` | Write | false | false | Create a lead in the workspace (deduplicated by email). |
| `update_lead` | Write | false | false | Update a lead's fields, tags or list membership. |
| `create_campaign` | Write | false | false | Create a draft campaign with sequence steps. Never activates sending by itself. |
| `pause_campaign` | Write | false | false | Pause an active campaign (stops future steps). |
| `resume_campaign` | Write | false | false | Resume a paused campaign. Actual sending additionally depends on a connected, authorized provider. |
| `archive_campaign` | Write | false | false | Archive a campaign (reversible from the dashboard). |
| `draft_outreach_message` | Write | false | false | Generate an AI draft for human review in the sequence editor. Produces text only — it cannot send anything. |
| `send_email` | Sensitive write | false | true | Send one email through the workspace's configured provider. Suppression list is checked first and fails closed. Approval required every time. |
| `send_inbox_reply` | Sensitive write | false | true | Send a reply inside an existing inbox conversation (email channel only; LinkedIn replies stay refused until an authorized provider exists). Approval required every time. |
| `delete_lead` | Sensitive write | false | true | Permanently delete a lead and its enrollments. Approval required every time. |
| `list_linkedin_accounts` | Read | true | false | List the workspace's connected LinkedIn accounts with their provider, status, warm-up state and daily limits. Use it to see which LinkedIn accounts exist and whether one is connected before talking about LinkedIn sending |
| `get_linkedin_account` | Read | true | false | Fetch one connected LinkedIn account by id: provider, handle, auth status, warm-up program and daily limits. Use it when the user asks about a specific account's health or limits. Read-only: it never changes the account. |
| `get_subscription_info` | Read | true | false | Get the workspace's subscription: plan, subscription status, current period end and what the plan is based on. Use it when the user asks what plan they are on or when it renews. Read-only: it never changes billing. |
| `get_account_limits` | Read | true | false | Get the workspace's sending limits: per-account daily LinkedIn limits (connection requests, messages, profile views) with today's counted usage, plus the workspace safety settings (daily connection cap, working hours, ra |
| `search_campaigns` | Read | true | false | Search campaigns by name, optionally filtered by status (draft, active, paused, archived). Use it to find a campaign when you only know part of its name. Returns matching campaigns with status, channel and enrollment cou |
| `stop_campaign` | Write | false | false | Stop a campaign: archives it, so no further sequence steps run. Use it when the user asks to stop or end a campaign. Reversible from the dashboard (un-archive). It never deletes the campaign or its leads. |
| `delete_campaign` | Sensitive write | false | true | Permanently delete a campaign and its sequence steps and enrollments. Use it only when the user explicitly asks to delete a campaign — it cannot be undone. Approval required every time. |
| `get_campaign_performance` | Read | true | false | Get one campaign's performance: prospects, enrollment progress, LinkedIn and email outcomes, replies, meetings booked and step-execution counts, computed from real records. Use it when the user asks how a campaign is doi |
| `get_campaign_execution_status` | Read | true | false | Get a campaign's execution status: its sequence steps, recent activity entries and the recorded step executions (sent, simulated, skipped, failed) for the campaign. Use it to check what actually ran and what was skipped. |
| `search_leads` | Read | true | false | Search leads by name, email or company (case-insensitive substring). Use it to find a lead when you only know part of a name, email or company. Returns matching leads, workspace-scoped. Read-only. |
| `import_leads` | Write | false | false | Import a batch of leads (up to 100) into the workspace. Duplicates are skipped, never created twice: an email already in the workspace or repeated inside the batch is reported as skipped. Returns how many were imported,  |
| `add_leads_to_campaign` | Write | false | false | Add leads to a campaign as pending enrollments — the leads are queued for the sequence, nothing is sent by adding them. Already-enrolled leads are skipped, not duplicated. Returns enrolled, skipped and any lead ids that  |
| `remove_leads_from_campaign` | Write | false | false | Remove leads from a campaign (drops their enrollments). The lead records themselves are kept. Use it when the user asks to take leads out of a campaign. Removing a lead that was never enrolled is a no-op. |
| `detect_duplicate_leads` | Read | true | false | Find duplicate leads in the workspace: groups sharing an email or a matching name + company, with the evidence for each group. Use it before importing or cleaning up leads. Read-only: it never merges or deletes anything. |
| `get_lead_activity_history` | Read | true | false | Get one lead's full activity history: their inbox messages and the campaign activity for every campaign they are enrolled in. Use it when the user asks what happened with a specific lead. Read-only. |
| `list_leads_by_campaign` | Read | true | false | List the leads enrolled in a campaign, with each enrollment's status and current step. Use it to see who is in a campaign and how far each lead has progressed. Read-only. |
| `get_campaign_sequence` | Read | true | false | Get a campaign's sequence steps in order: step type, delay, subject and content. Use it to show or review the steps of a campaign before editing them. Read-only. |
| `create_sequence_step` | Write | false | false | Add one step to the end of a campaign's sequence (connection request, LinkedIn message, email, wait, condition, like post, view profile or endorse skills). Email and LinkedIn-message steps need content. Creating a step n |
| `update_sequence_step` | Write | false | false | Change one sequence step in place (type, delay, subject, content). The step keeps its position. Use it to fix a step without rebuilding the whole sequence. It never sends anything. |
| `reorder_sequence_steps` | Write | false | false | Reorder a campaign's sequence steps: pass the step ids in the new order. The list must contain exactly the campaign's current steps, no more and no fewer. Use it when the user asks to move steps around. It never sends an |
| `get_scheduled_follow_ups` | Read | true | false | List scheduled follow-up replies that are still queued for the workspace (earliest due first), optionally for one conversation. These are replies waiting to be sent later — nothing here sends one. Read-only. |
| `get_sequence_execution_status` | Read | true | false | Get the execution status of a campaign's sequence: the recorded step executions grouped by step (sent, simulated, skipped, stopped, failed), with counts per step. Use it to see which steps ran and which were skipped. Rea |
| `get_pending_actions` | Read | true | false | List pending LinkedIn automation actions: enrollments still waiting on a step, and recorded executions still in progress. Use it to see what is queued. Read-only: it never triggers an action, and there is no tool that se |
| `get_failed_actions` | Read | true | false | List failed or skipped LinkedIn automation actions: recorded executions with a failed or skipped outcome, with the recorded reason. Use it to find out what went wrong or was held back by the safety gate. Read-only: it ne |
| `get_automation_execution_report` | Read | true | false | Get a per-campaign automation execution report: execution counts by outcome (sent, simulated, skipped, stopped, failed) for each campaign, plus a workspace total. Use it to summarise what the automation actually did. Rea |
| `search_conversations` | Read | true | false | Search inbox conversations by contact name, email, company or subject. Use it to find a thread when you only know who it is with. Returns matching conversations with unread state. Read-only. |
| `get_message_execution_status` | Read | true | false | Get the recorded status of one message by its id or by its idempotency key (with the conversation id): sent, simulated, failed or suppressed, with the provider message id when one exists. Use it to check whether a messag |
| `get_failed_messages` | Read | true | false | List failed or suppressed messages in the workspace, with the recorded error for each. Use it to find messages that did not go out and why. Read-only: it never retries a send. |
| `compare_campaigns` | Read | true | false | Compare two or more campaigns side by side: per-campaign performance (prospects, replies, meetings booked, executions), the aggregate across them, and each campaign's delta from the group mean. Use it when the user asks  |
| `get_date_range_report` | Read | true | false | Ask for a performance report over a date range. This is NOT supported: the stats loaders compute over all-time records and cannot filter by date, so this tool always answers with an honest not-supported result instead of |
| `get_performance_summary` | Read | true | false | Get the workspace-wide performance summary: total leads and campaigns, aggregate enrollment progress, LinkedIn and email outcomes, replies, meetings booked and execution counts across all campaigns. Use it for an overall |
| `get_usage_report` | Read | true | false | Get the workspace usage report: plan and usage counters with limit headroom, plus the account limits and safety settings that cap sending. Use it when the user asks about usage or whether they are near a limit. Read-only |
| `get_profile` | Read | true | false | Get the connected NxtSend user and workspace: the user id and workspace id the current OAuth grant belongs to, the granted scopes, and the workspace plan. Use it to confirm whose account is connected before doing anythin |
| `search` | Read | true | false | Search NxtSend as a company knowledge source: matches leads and campaigns by name, email or company and returns hits with an id, title, snippet and a link to the record in the NxtSend dashboard. Use it to find a lead or  |
| `fetch` | Read | true | false | Fetch one record by id — a lead or a campaign — and return the full record. Use it after search, when you have the id of the record you want to read in detail. Read-only. |
| `render_campaigns_widget` | Read | true | false | Render the campaign dashboard widget: a visual card list of campaigns with status and performance. Always call list_campaigns first, then pass its results here — this tool only renders, it never fetches data. It takes ca |

## Known limitations (honest, not bugs)

### `get_date_range_report` — BLOCKED, by design

The tool is listed, classified Read, and always answers with a
structured not-supported result (`code: date_range_not_supported`,
501-style): the stats loaders compute over all-time records and cannot
filter by date. It never invents date-filtered numbers. Use
`get_performance_summary` for the workspace-wide all-time summary.

### Idempotency — partial

Full server-side replay-dedupe exists only where the product already
has a dedupe store:

- Sends: message `idempotency_key` (`send_email`, `send_inbox_reply`,
  `get_message_execution_status` can look a message up by it).
- `create_lead` / `import_leads`: deduplicated by email.
- Enrollments: existing-enrollment skip (`add_leads_to_campaign`).

A retried `create_campaign` or `create_sequence_step` **would create a
second row** — no persistent idempotency ledger exists. Callers should
confirm IDs before mutating (the MCP `initialize` instructions say so
in their first 512 characters) and should check with `list_campaigns` /
`get_campaign_sequence` before re-issuing a create.

### No LinkedIn-send tools — NOT SUPPORTED

There is no tool that sends a LinkedIn connection request or message,
and none will be added on this architecture: no authorized LinkedIn
provider exists, and the official LinkedIn API exposes no
connection-request/DM endpoints to standard developers. LinkedIn steps
in a sequence are recorded as **skipped** by the executor, never as
sent. The Read tools `list_linkedin_accounts`, `get_linkedin_account`,
`get_account_limits`, `get_pending_actions`, `get_failed_actions` and
`get_automation_execution_report` report LinkedIn state honestly.

### `get_campaign_performance` — nulls, never invented numbers

Unavailable event counts are returned as `null`, never fabricated.
