/**
 * NxtSend tool manifest for a future Muse (Meta) Connector submission —
 * PRE-CLASSIFIED DRAFT, not submitted anywhere.
 *
 * Classification scheme is Meta's, from the official Connector
 * guidelines (https://muse.ai/platform/docs §3, researched
 * 2026-10-19):
 *   Read            retrieves data, no state change
 *   Write           creates/changes/deletes, acts on the user's behalf
 *   Sensitive write irreversible or consequential (sending email,
 *                   purchases…) — approval is required EVERY time and
 *                   can never be set to "Always allow"
 * Reads/Writes default to "Ask on first use". A tool combining reads
 * and writes is a Write; a send/share/publish/payment must never be
 * hidden inside a "read".
 *
 * The tools below are NxtSend's real product surface (leads, campaigns,
 * inbox, usage, billing) — the same operations the dashboard and API
 * already expose. Approval at review covers ONLY the tools listed and
 * approved here.
 *
 * The first 18 tools are the original Muse manifest — their names,
 * classifications, descriptions, inputs and side effects must not
 * change. The tools appended after them (ChatGPT expansion) reuse the
 * same classification scheme. Every tool also carries MCP
 * `annotations` (the MCP layer: readOnlyHint / destructiveHint /
 * openWorldHint) — annotations never override the classification,
 * which stays the permission layer. `openWorldHint` is false for all
 * tools: every tool is bounded to the connected workspace.
 *
 * No LinkedIn-send tool exists anywhere in this manifest and none is
 * added: LinkedIn connection requests and messages are NOT SUPPORTED.
 */

export type MuseToolClassification = "Read" | "Write" | "Sensitive write";

export interface MuseToolAnnotations {
  /** True only when the tool cannot change any state. */
  readOnlyHint: boolean;
  /** True for delete/send/launch — irreversible or consequential. */
  destructiveHint: boolean;
  /** Always false here: every tool is bounded to the workspace. */
  openWorldHint: boolean;
}

export interface MuseToolDescriptor {
  name: string;
  classification: MuseToolClassification;
  description: string;
  /** Human summary of inputs (full JSON schemas are written at build time). */
  inputs: string;
  sideEffects: string;
  /** MCP-layer annotations, served on the tools/list object. */
  annotations?: MuseToolAnnotations;
  /**
   * MCP `_meta` for the tool, served on the tools/list object.
   * Used for the profile tool (`openai/profile`) and the widget
   * render tool (`ui.resourceUri` + `openai/outputTemplate`).
   */
  _meta?: Record<string, unknown>;
}

export const MUSE_CONNECTOR_MANIFEST_STATUS =
  "draft — pre-classified for a future submission; not submitted, not approved" as const;

export const CAMPAIGNS_WIDGET_RESOURCE_URI = "ui://widget/campaigns.html";

const READ_ONLY: MuseToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};
const WRITE: MuseToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
};
const DESTRUCTIVE: MuseToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
};

export const NXTSEND_TOOL_MANIFEST: MuseToolDescriptor[] = [
  // ── Read ──────────────────────────────────────────────────────────────
  {
    name: "list_leads",
    classification: "Read",
    description: "List leads in the user's workspace (paginated, searchable).",
    inputs: "query?, list/tag filters, page",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "get_lead",
    classification: "Read",
    description: "Fetch one lead with its tags, list membership and activity summary.",
    inputs: "leadId",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "list_campaigns",
    classification: "Read",
    description: "List campaigns with status, channel and enrollment counts.",
    inputs: "status filter?, page",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "get_campaign_activity",
    classification: "Read",
    description: "Read a campaign's execution/activity history.",
    inputs: "campaignId, page",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "list_conversations",
    classification: "Read",
    description: "List inbox conversations (email/LinkedIn) with unread state.",
    inputs: "channel filter?, unreadOnly?, page",
    sideEffects: "None. (Opening a conversation marks it read — that behaviour belongs to get_conversation and is declared there.)",
    annotations: READ_ONLY,
  },
  {
    name: "get_conversation",
    classification: "Read",
    description: "Read one conversation's message history. Marks the thread read, matching the product UI.",
    inputs: "conversationId",
    sideEffects: "Marks inbound messages in the thread as read (read_at) — a visible state change the user already gets from opening the thread in NxtSend.",
    // readOnlyHint is false here on purpose: opening the thread marks
    // inbound messages read, which IS a state change (see sideEffects).
    annotations: WRITE,
  },
  {
    name: "get_usage_summary",
    classification: "Read",
    description: "Current plan, usage counters and limit headroom for the workspace.",
    inputs: "—",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "get_integration_statuses",
    classification: "Read",
    description: "Integration Center statuses (no secret values, presence only).",
    inputs: "—",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  // ── Write ─────────────────────────────────────────────────────────────
  {
    name: "create_lead",
    classification: "Write",
    description: "Create a lead in the workspace (deduplicated by email).",
    inputs: "email, name?, company?, jobTitle?, tags?",
    sideEffects: "Creates a lead row; may emit the lead.created webhook.",
    annotations: WRITE,
  },
  {
    name: "update_lead",
    classification: "Write",
    description: "Update a lead's fields, tags or list membership.",
    inputs: "leadId, fields",
    sideEffects: "Modifies the lead row.",
    annotations: WRITE,
  },
  {
    name: "create_campaign",
    classification: "Write",
    description: "Create a draft campaign with sequence steps. Never activates sending by itself.",
    inputs: "name, channel, steps[]",
    sideEffects: "Creates a campaign in draft status; may emit campaign.created.",
    annotations: WRITE,
  },
  {
    name: "pause_campaign",
    classification: "Write",
    description: "Pause an active campaign (stops future steps).",
    inputs: "campaignId",
    sideEffects: "Status change; may emit campaign.status_changed.",
    annotations: WRITE,
  },
  {
    name: "resume_campaign",
    classification: "Write",
    description: "Resume a paused campaign. Actual sending additionally depends on a connected, authorized provider.",
    inputs: "campaignId",
    sideEffects: "Status change; may emit campaign.status_changed.",
    annotations: WRITE,
  },
  {
    name: "archive_campaign",
    classification: "Write",
    description: "Archive a campaign (reversible from the dashboard).",
    inputs: "campaignId",
    sideEffects: "Status change; may emit campaign.status_changed.",
    annotations: WRITE,
  },
  {
    name: "draft_outreach_message",
    classification: "Write",
    description: "Generate an AI draft for human review in the sequence editor. Produces text only — it cannot send anything.",
    inputs: "channel, stepType, campaign context, lead fields",
    sideEffects: "Consumes AI provider quota; stores nothing unless the user saves the draft in the editor.",
    annotations: WRITE,
  },
  // ── Sensitive write ───────────────────────────────────────────────────
  {
    name: "send_email",
    classification: "Sensitive write",
    description:
      "Send one email through the workspace's configured provider. Suppression list is checked first and fails closed. Approval required every time.",
    inputs: "to, subject, body, workspace context",
    sideEffects: "An email leaves the workspace's sending domain. Irreversible.",
    annotations: DESTRUCTIVE,
  },
  {
    name: "send_inbox_reply",
    classification: "Sensitive write",
    description:
      "Send a reply inside an existing inbox conversation (email channel only; LinkedIn replies stay refused until an authorized provider exists). Approval required every time.",
    inputs: "conversationId, body, idempotencyKey",
    sideEffects: "An email is sent and recorded with its provider message ID. Irreversible.",
    annotations: DESTRUCTIVE,
  },
  {
    name: "delete_lead",
    classification: "Sensitive write",
    description: "Permanently delete a lead and its enrollments. Approval required every time.",
    inputs: "leadId",
    sideEffects: "Data destruction — not recoverable from the product UI.",
    annotations: DESTRUCTIVE,
  },

  // ══════════════════════════════════════════════════════════════════════
  // ChatGPT expansion — additive only; the 18 tools above are untouched.
  // Descriptions are written for natural-language use: action-oriented,
  // when to use, what it returns, what it never does.
  // ══════════════════════════════════════════════════════════════════════

  // ── Account (Read) ────────────────────────────────────────────────────
  {
    name: "list_linkedin_accounts",
    classification: "Read",
    description:
      "List the workspace's connected LinkedIn accounts with their provider, status, warm-up state and daily limits. Use it to see which LinkedIn accounts exist and whether one is connected before talking about LinkedIn sending. Read-only: it never connects, disconnects or changes an account, and it never sends LinkedIn messages.",
    inputs: "—",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "get_linkedin_account",
    classification: "Read",
    description:
      "Fetch one connected LinkedIn account by id: provider, handle, auth status, warm-up program and daily limits. Use it when the user asks about a specific account's health or limits. Read-only: it never changes the account.",
    inputs: "accountId",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "get_subscription_info",
    classification: "Read",
    description:
      "Get the workspace's subscription: plan, subscription status, current period end and what the plan is based on. Use it when the user asks what plan they are on or when it renews. Read-only: it never changes billing.",
    inputs: "—",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "get_account_limits",
    classification: "Read",
    description:
      "Get the workspace's sending limits: per-account daily LinkedIn limits (connection requests, messages, profile views) with today's counted usage, plus the workspace safety settings (daily connection cap, working hours, ramp-up switch). Use it before planning any outreach volume. Read-only: it never changes a limit.",
    inputs: "—",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },

  // ── Campaign (Read / Write) ───────────────────────────────────────────
  {
    name: "search_campaigns",
    classification: "Read",
    description:
      "Search campaigns by name, optionally filtered by status (draft, active, paused, archived). Use it to find a campaign when you only know part of its name. Returns matching campaigns with status, channel and enrollment counts. Read-only.",
    inputs: "query?, status?, page",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "stop_campaign",
    classification: "Write",
    description:
      "Stop a campaign: archives it, so no further sequence steps run. Use it when the user asks to stop or end a campaign. Reversible from the dashboard (un-archive). It never deletes the campaign or its leads.",
    inputs: "campaignId",
    sideEffects: "Status change to archived; may emit campaign.status_changed.",
    annotations: WRITE,
  },
  {
    name: "delete_campaign",
    classification: "Sensitive write",
    description:
      "Permanently delete a campaign and its sequence steps and enrollments. Use it only when the user explicitly asks to delete a campaign — it cannot be undone. Approval required every time.",
    inputs: "campaignId",
    sideEffects: "Data destruction — the campaign, its steps and its enrollments are removed.",
    annotations: DESTRUCTIVE,
  },
  {
    name: "get_campaign_performance",
    classification: "Read",
    description:
      "Get one campaign's performance: prospects, enrollment progress, LinkedIn and email outcomes, replies, meetings booked and step-execution counts, computed from real records. Use it when the user asks how a campaign is doing. Read-only: unavailable event counts are null, never invented.",
    inputs: "campaignId",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "get_campaign_execution_status",
    classification: "Read",
    description:
      "Get a campaign's execution status: its sequence steps, recent activity entries and the recorded step executions (sent, simulated, skipped, failed) for the campaign. Use it to check what actually ran and what was skipped. Read-only: LinkedIn steps show as skipped, never as sent.",
    inputs: "campaignId, page",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },

  // ── Leads (Read / Write) ──────────────────────────────────────────────
  {
    name: "search_leads",
    classification: "Read",
    description:
      "Search leads by name, email or company (case-insensitive substring). Use it to find a lead when you only know part of a name, email or company. Returns matching leads, workspace-scoped. Read-only.",
    inputs: "query, page",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "import_leads",
    classification: "Write",
    description:
      "Import a batch of leads (up to 100) into the workspace. Duplicates are skipped, never created twice: an email already in the workspace or repeated inside the batch is reported as skipped. Returns how many were imported, skipped and why. It never sends anything to the imported leads.",
    inputs: "leads[] (email required; firstName?, lastName?, company?, jobTitle?, linkedinUrl?, tags?)",
    sideEffects: "Creates lead rows for the new emails; may emit lead.created webhooks.",
    annotations: WRITE,
  },
  {
    name: "add_leads_to_campaign",
    classification: "Write",
    description:
      "Add leads to a campaign as pending enrollments — the leads are queued for the sequence, nothing is sent by adding them. Already-enrolled leads are skipped, not duplicated. Returns enrolled, skipped and any lead ids that do not exist. Use it when the user asks to put leads into a campaign.",
    inputs: "campaignId, leadIds[]",
    sideEffects: "Creates pending enrollment records; no step executes at enroll time.",
    annotations: WRITE,
  },
  {
    name: "remove_leads_from_campaign",
    classification: "Write",
    description:
      "Remove leads from a campaign (drops their enrollments). The lead records themselves are kept. Use it when the user asks to take leads out of a campaign. Removing a lead that was never enrolled is a no-op.",
    inputs: "campaignId, leadIds[]",
    sideEffects: "Deletes enrollment records; lead rows are untouched.",
    annotations: WRITE,
  },
  {
    name: "detect_duplicate_leads",
    classification: "Read",
    description:
      "Find duplicate leads in the workspace: groups sharing an email or a matching name + company, with the evidence for each group. Use it before importing or cleaning up leads. Read-only: it never merges or deletes anything.",
    inputs: "—",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "get_lead_activity_history",
    classification: "Read",
    description:
      "Get one lead's full activity history: their inbox messages and the campaign activity for every campaign they are enrolled in. Use it when the user asks what happened with a specific lead. Read-only.",
    inputs: "leadId",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "list_leads_by_campaign",
    classification: "Read",
    description:
      "List the leads enrolled in a campaign, with each enrollment's status and current step. Use it to see who is in a campaign and how far each lead has progressed. Read-only.",
    inputs: "campaignId, page",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },

  // ── Sequences (Read / Write) ──────────────────────────────────────────
  {
    name: "get_campaign_sequence",
    classification: "Read",
    description:
      "Get a campaign's sequence steps in order: step type, delay, subject and content. Use it to show or review the steps of a campaign before editing them. Read-only.",
    inputs: "campaignId",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "create_sequence_step",
    classification: "Write",
    description:
      "Add one step to the end of a campaign's sequence (connection request, LinkedIn message, email, wait, condition, like post, view profile or endorse skills). Email and LinkedIn-message steps need content. Creating a step never activates sending — LinkedIn steps are recorded as skipped by the executor until an authorized provider exists.",
    inputs: "campaignId, stepType, delayHours, subject?, content?, config?",
    sideEffects: "Appends a step to the campaign's sequence.",
    annotations: WRITE,
  },
  {
    name: "update_sequence_step",
    classification: "Write",
    description:
      "Change one sequence step in place (type, delay, subject, content). The step keeps its position. Use it to fix a step without rebuilding the whole sequence. It never sends anything.",
    inputs: "campaignId, stepId, stepType?, delayHours?, subject?, content?, config?",
    sideEffects: "Modifies one step of the campaign's sequence.",
    annotations: WRITE,
  },
  {
    name: "reorder_sequence_steps",
    classification: "Write",
    description:
      "Reorder a campaign's sequence steps: pass the step ids in the new order. The list must contain exactly the campaign's current steps, no more and no fewer. Use it when the user asks to move steps around. It never sends anything.",
    inputs: "campaignId, stepIds[]",
    sideEffects: "Replaces the campaign's step order.",
    annotations: WRITE,
  },
  {
    name: "get_scheduled_follow_ups",
    classification: "Read",
    description:
      "List scheduled follow-up replies that are still queued for the workspace (earliest due first), optionally for one conversation. These are replies waiting to be sent later — nothing here sends one. Read-only.",
    inputs: "conversationId?",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "get_sequence_execution_status",
    classification: "Read",
    description:
      "Get the execution status of a campaign's sequence: the recorded step executions grouped by step (sent, simulated, skipped, stopped, failed), with counts per step. Use it to see which steps ran and which were skipped. Read-only: skipped LinkedIn steps are reported honestly, never as sent.",
    inputs: "campaignId",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },

  // ── LinkedIn automation (READ-ONLY — sends are NOT SUPPORTED) ────────
  {
    name: "get_pending_actions",
    classification: "Read",
    description:
      "List pending LinkedIn automation actions: enrollments still waiting on a step, and recorded executions still in progress. Use it to see what is queued. Read-only: it never triggers an action, and there is no tool that sends a LinkedIn connection request or message.",
    inputs: "campaignId?, page",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "get_failed_actions",
    classification: "Read",
    description:
      "List failed or skipped LinkedIn automation actions: recorded executions with a failed or skipped outcome, with the recorded reason. Use it to find out what went wrong or was held back by the safety gate. Read-only: it never retries anything.",
    inputs: "campaignId?, page",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "get_automation_execution_report",
    classification: "Read",
    description:
      "Get a per-campaign automation execution report: execution counts by outcome (sent, simulated, skipped, stopped, failed) for each campaign, plus a workspace total. Use it to summarise what the automation actually did. Read-only: LinkedIn sends are never reported as sent — they are skipped until an authorized provider exists.",
    inputs: "campaignId?",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },

  // ── Inbox (Read) ──────────────────────────────────────────────────────
  {
    name: "search_conversations",
    classification: "Read",
    description:
      "Search inbox conversations by contact name, email, company or subject. Use it to find a thread when you only know who it is with. Returns matching conversations with unread state. Read-only.",
    inputs: "query, channel?, page",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "get_message_execution_status",
    classification: "Read",
    description:
      "Get the recorded status of one message by its id or by its idempotency key (with the conversation id): sent, simulated, failed or suppressed, with the provider message id when one exists. Use it to check whether a message actually went out. Read-only: a simulated message means no email was sent.",
    inputs: "messageId?, idempotencyKey?, conversationId?",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "get_failed_messages",
    classification: "Read",
    description:
      "List failed or suppressed messages in the workspace, with the recorded error for each. Use it to find messages that did not go out and why. Read-only: it never retries a send.",
    inputs: "page",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },

  // ── Analytics (Read) ──────────────────────────────────────────────────
  {
    name: "compare_campaigns",
    classification: "Read",
    description:
      "Compare two or more campaigns side by side: per-campaign performance (prospects, replies, meetings booked, executions), the aggregate across them, and each campaign's delta from the group mean. Use it when the user asks which campaign performed better. Read-only.",
    inputs: "campaignIds[] (2 or more)",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "get_date_range_report",
    classification: "Read",
    description:
      "Ask for a performance report over a date range. This is NOT supported: the stats loaders compute over all-time records and cannot filter by date, so this tool always answers with an honest not-supported result instead of inventing date-filtered numbers. Use get_performance_summary for the workspace-wide all-time summary.",
    inputs: "startDate, endDate",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "get_performance_summary",
    classification: "Read",
    description:
      "Get the workspace-wide performance summary: total leads and campaigns, aggregate enrollment progress, LinkedIn and email outcomes, replies, meetings booked and execution counts across all campaigns. Use it for an overall 'how are we doing' answer. Read-only: all-time numbers, never date-filtered.",
    inputs: "—",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "get_usage_report",
    classification: "Read",
    description:
      "Get the workspace usage report: plan and usage counters with limit headroom, plus the account limits and safety settings that cap sending. Use it when the user asks about usage or whether they are near a limit. Read-only.",
    inputs: "—",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },

  // ── Profile / knowledge / UI (Read) ───────────────────────────────────
  {
    name: "get_profile",
    classification: "Read",
    description:
      "Get the connected NxtSend user and workspace: the user id and workspace id the current OAuth grant belongs to, the granted scopes, and the workspace plan. Use it to confirm whose account is connected before doing anything else. It reads the identity from the validated grant only — it never takes an identity from its input, and it never returns secrets.",
    inputs: "—",
    sideEffects: "None.",
    annotations: READ_ONLY,
    _meta: { "openai/profile": true },
  },
  {
    name: "search",
    classification: "Read",
    description:
      "Search NxtSend as a company knowledge source: matches leads and campaigns by name, email or company and returns hits with an id, title, snippet and a link to the record in the NxtSend dashboard. Use it to find a lead or campaign by name when you do not know which kind of record it is. Read-only.",
    inputs: "query",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "fetch",
    classification: "Read",
    description:
      "Fetch one record by id — a lead or a campaign — and return the full record. Use it after search, when you have the id of the record you want to read in detail. Read-only.",
    inputs: "id",
    sideEffects: "None.",
    annotations: READ_ONLY,
  },
  {
    name: "render_campaigns_widget",
    classification: "Read",
    description:
      "Render the campaign dashboard widget: a visual card list of campaigns with status and performance. Always call list_campaigns first, then pass its results here — this tool only renders, it never fetches data. It takes campaign ids plus the campaign summaries from list_campaigns (or get_campaign_performance). Read-only: it only renders.",
    inputs: "campaignIds[], campaigns[] (id, name, status, type, enrollments?)",
    sideEffects: "None.",
    annotations: READ_ONLY,
    _meta: {
      ui: { resourceUri: CAMPAIGNS_WIDGET_RESOURCE_URI },
      "openai/outputTemplate": CAMPAIGNS_WIDGET_RESOURCE_URI,
    },
  },
];
