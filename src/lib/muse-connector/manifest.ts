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
 */

export type MuseToolClassification = "Read" | "Write" | "Sensitive write";

export interface MuseToolDescriptor {
  name: string;
  classification: MuseToolClassification;
  description: string;
  /** Human summary of inputs (full JSON schemas are written at build time). */
  inputs: string;
  sideEffects: string;
}

export const MUSE_CONNECTOR_MANIFEST_STATUS =
  "draft — pre-classified for a future submission; not submitted, not approved" as const;

export const NXTSEND_TOOL_MANIFEST: MuseToolDescriptor[] = [
  // ── Read ──────────────────────────────────────────────────────────────
  {
    name: "list_leads",
    classification: "Read",
    description: "List leads in the user's workspace (paginated, searchable).",
    inputs: "query?, list/tag filters, page",
    sideEffects: "None.",
  },
  {
    name: "get_lead",
    classification: "Read",
    description: "Fetch one lead with its tags, list membership and activity summary.",
    inputs: "leadId",
    sideEffects: "None.",
  },
  {
    name: "list_campaigns",
    classification: "Read",
    description: "List campaigns with status, channel and enrollment counts.",
    inputs: "status filter?, page",
    sideEffects: "None.",
  },
  {
    name: "get_campaign_activity",
    classification: "Read",
    description: "Read a campaign's execution/activity history.",
    inputs: "campaignId, page",
    sideEffects: "None.",
  },
  {
    name: "list_conversations",
    classification: "Read",
    description: "List inbox conversations (email/LinkedIn) with unread state.",
    inputs: "channel filter?, unreadOnly?, page",
    sideEffects: "None. (Opening a conversation marks it read — that behaviour belongs to get_conversation and is declared there.)",
  },
  {
    name: "get_conversation",
    classification: "Read",
    description: "Read one conversation's message history. Marks the thread read, matching the product UI.",
    inputs: "conversationId",
    sideEffects: "Marks inbound messages in the thread as read (read_at) — a visible state change the user already gets from opening the thread in NxtSend.",
  },
  {
    name: "get_usage_summary",
    classification: "Read",
    description: "Current plan, usage counters and limit headroom for the workspace.",
    inputs: "—",
    sideEffects: "None.",
  },
  {
    name: "get_integration_statuses",
    classification: "Read",
    description: "Integration Center statuses (no secret values, presence only).",
    inputs: "—",
    sideEffects: "None.",
  },
  // ── Write ─────────────────────────────────────────────────────────────
  {
    name: "create_lead",
    classification: "Write",
    description: "Create a lead in the workspace (deduplicated by email).",
    inputs: "email, name?, company?, jobTitle?, tags?",
    sideEffects: "Creates a lead row; may emit the lead.created webhook.",
  },
  {
    name: "update_lead",
    classification: "Write",
    description: "Update a lead's fields, tags or list membership.",
    inputs: "leadId, fields",
    sideEffects: "Modifies the lead row.",
  },
  {
    name: "create_campaign",
    classification: "Write",
    description: "Create a draft campaign with sequence steps. Never activates sending by itself.",
    inputs: "name, channel, steps[]",
    sideEffects: "Creates a campaign in draft status; may emit campaign.created.",
  },
  {
    name: "pause_campaign",
    classification: "Write",
    description: "Pause an active campaign (stops future steps).",
    inputs: "campaignId",
    sideEffects: "Status change; may emit campaign.status_changed.",
  },
  {
    name: "resume_campaign",
    classification: "Write",
    description: "Resume a paused campaign. Actual sending additionally depends on a connected, authorized provider.",
    inputs: "campaignId",
    sideEffects: "Status change; may emit campaign.status_changed.",
  },
  {
    name: "archive_campaign",
    classification: "Write",
    description: "Archive a campaign (reversible from the dashboard).",
    inputs: "campaignId",
    sideEffects: "Status change; may emit campaign.status_changed.",
  },
  {
    name: "draft_outreach_message",
    classification: "Write",
    description: "Generate an AI draft for human review in the sequence editor. Produces text only — it cannot send anything.",
    inputs: "channel, stepType, campaign context, lead fields",
    sideEffects: "Consumes AI provider quota; stores nothing unless the user saves the draft in the editor.",
  },
  // ── Sensitive write ───────────────────────────────────────────────────
  {
    name: "send_email",
    classification: "Sensitive write",
    description:
      "Send one email through the workspace's configured provider. Suppression list is checked first and fails closed. Approval required every time.",
    inputs: "to, subject, body, workspace context",
    sideEffects: "An email leaves the workspace's sending domain. Irreversible.",
  },
  {
    name: "send_inbox_reply",
    classification: "Sensitive write",
    description:
      "Send a reply inside an existing inbox conversation (email channel only; LinkedIn replies stay refused until an authorized provider exists). Approval required every time.",
    inputs: "conversationId, body, idempotencyKey",
    sideEffects: "An email is sent and recorded with its provider message ID. Irreversible.",
  },
  {
    name: "delete_lead",
    classification: "Sensitive write",
    description: "Permanently delete a lead and its enrollments. Approval required every time.",
    inputs: "leadId",
    sideEffects: "Data destruction — not recoverable from the product UI.",
  },
];
