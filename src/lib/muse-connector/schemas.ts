/**
 * MCP tool input schemas + scope map for the 18 manifest tools.
 *
 * The manifest (./manifest.ts) owns the classifications and must not
 * change; this module owns the machine-readable input schemas the MCP
 * `tools/list` response serves and the `tools/call` handler validates
 * against, plus the per-tool OAuth scope each tool requires.
 *
 * Scope rules (per the build spec):
 *   Read tools            -> muse.read
 *   Write tools           -> muse.write
 *   send_email / send_inbox_reply -> muse.send
 *   delete_lead           -> muse.write (Sensitive-write classification
 *                            is a Meta approval property, not a scope)
 */


import { SCOPE_TIER_MAP } from "./oauth/scopes";

export type MuseScope = "muse.read" | "muse.write" | "muse.send";

export const TOOL_SCOPES: Record<string, MuseScope> = {
  list_leads: "muse.read",
  get_lead: "muse.read",
  list_campaigns: "muse.read",
  get_campaign_activity: "muse.read",
  list_conversations: "muse.read",
  get_conversation: "muse.read",
  get_usage_summary: "muse.read",
  get_integration_statuses: "muse.read",
  create_lead: "muse.write",
  update_lead: "muse.write",
  create_campaign: "muse.write",
  pause_campaign: "muse.write",
  resume_campaign: "muse.write",
  archive_campaign: "muse.write",
  draft_outreach_message: "muse.write",
  send_email: "muse.send",
  send_inbox_reply: "muse.send",
  delete_lead: "muse.write",
  // ── ChatGPT expansion ──────────────────────────────────────────────
  // Read -> muse.read, Write -> muse.write. delete_campaign is a
  // Sensitive write like delete_lead: the classification is a Meta
  // approval property, not a scope, so it stays muse.write.
  list_linkedin_accounts: "muse.read",
  get_linkedin_account: "muse.read",
  get_subscription_info: "muse.read",
  get_account_limits: "muse.read",
  search_campaigns: "muse.read",
  stop_campaign: "muse.write",
  delete_campaign: "muse.write",
  get_campaign_performance: "muse.read",
  get_campaign_execution_status: "muse.read",
  search_leads: "muse.read",
  import_leads: "muse.write",
  add_leads_to_campaign: "muse.write",
  remove_leads_from_campaign: "muse.write",
  detect_duplicate_leads: "muse.read",
  get_lead_activity_history: "muse.read",
  list_leads_by_campaign: "muse.read",
  get_campaign_sequence: "muse.read",
  create_sequence_step: "muse.write",
  update_sequence_step: "muse.write",
  reorder_sequence_steps: "muse.write",
  get_scheduled_follow_ups: "muse.read",
  get_sequence_execution_status: "muse.read",
  get_pending_actions: "muse.read",
  get_failed_actions: "muse.read",
  get_automation_execution_report: "muse.read",
  search_conversations: "muse.read",
  get_message_execution_status: "muse.read",
  get_failed_messages: "muse.read",
  compare_campaigns: "muse.read",
  get_date_range_report: "muse.read",
  get_performance_summary: "muse.read",
  get_usage_report: "muse.read",
  get_profile: "muse.read",
  search: "muse.read",
  fetch: "muse.read",
  render_campaigns_widget: "muse.read",
};

export function requiredScope(toolName: string): MuseScope | null {
  return TOOL_SCOPES[toolName] ?? null;
}

/**
 * Permission tiers — the scope-tier seam (Worker A owns
 * SCOPE_TIER_MAP / grantHasTier in ./oauth/scopes.ts). A tool
 * requires one tier; a grant satisfies a tier when it holds ANY
 * scope mapping to that tier (muse.read / nxtsend.read -> read,
 * muse.write / nxtsend.write -> write, muse.send / nxtsend.send ->
 * send). Tiers are independent: `send` does NOT imply `write` or
 * `read`. The canonical muse.* scope for a tier is what the
 * missing-scope error names, so existing callers keep seeing the
 * scope they asked for.
 */
export type ScopeTier = "read" | "write" | "send";

export const TIER_SCOPE: Record<ScopeTier, MuseScope> = {
  read: "muse.read",
  write: "muse.write",
  send: "muse.send",
};

export function requiredTier(toolName: string): ScopeTier | null {
  const scope = requiredScope(toolName);
  if (!scope) return null;
  return SCOPE_TIER_MAP[scope] ?? null;
}

export interface ToolInputSchema {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required?: string[];
  additionalProperties?: boolean;
}

function str(description: string, extra: Record<string, unknown> = {}) {
  return { type: "string", description, ...extra };
}
function int(description: string, extra: Record<string, unknown> = {}) {
  return { type: "integer", description, ...extra };
}
function bool(description: string) {
  return { type: "boolean", description };
}
function arr(description: string, items: Record<string, unknown>) {
  return { type: "array", description, items };
}

/** JSON Schema (draft-07 subset) for every manifest tool's arguments. */
export const TOOL_INPUT_SCHEMAS: Record<string, ToolInputSchema> = {
  list_leads: {
    type: "object",
    properties: {
      query: str("Substring match against name, email or company."),
      tag: str("Only leads carrying this tag."),
      page: int("1-based page number.", { minimum: 1, default: 1 }),
      pageSize: int("Rows per page (1-100).", { minimum: 1, maximum: 100, default: 20 }),
    },
    additionalProperties: false,
  },
  get_lead: {
    type: "object",
    properties: { leadId: str("Lead id.") },
    required: ["leadId"],
    additionalProperties: false,
  },
  list_campaigns: {
    type: "object",
    properties: {
      status: str("Filter by status.", { enum: ["draft", "active", "paused", "archived"] }),
      page: int("1-based page number.", { minimum: 1, default: 1 }),
      pageSize: int("Rows per page (1-100).", { minimum: 1, maximum: 100, default: 20 }),
    },
    additionalProperties: false,
  },
  get_campaign_activity: {
    type: "object",
    properties: {
      campaignId: str("Campaign id."),
      page: int("1-based page number.", { minimum: 1, default: 1 }),
      pageSize: int("Rows per page (1-100).", { minimum: 1, maximum: 100, default: 20 }),
    },
    required: ["campaignId"],
    additionalProperties: false,
  },
  list_conversations: {
    type: "object",
    properties: {
      channel: str("Filter by channel.", { enum: ["email", "linkedin"] }),
      unreadOnly: bool("Only conversations with unread inbound messages."),
      page: int("1-based page number.", { minimum: 1, default: 1 }),
      pageSize: int("Rows per page (1-100).", { minimum: 1, maximum: 100, default: 20 }),
    },
    additionalProperties: false,
  },
  get_conversation: {
    type: "object",
    properties: { conversationId: str("Conversation id.") },
    required: ["conversationId"],
    additionalProperties: false,
  },
  get_usage_summary: { type: "object", properties: {}, additionalProperties: false },
  get_integration_statuses: { type: "object", properties: {}, additionalProperties: false },
  create_lead: {
    type: "object",
    properties: {
      email: str("Lead email address (required; deduplicated by email).", { format: "email" }),
      firstName: str("First name."),
      lastName: str("Last name."),
      company: str("Company."),
      jobTitle: str("Job title."),
      linkedinUrl: str("LinkedIn profile URL."),
      tags: arr("Tags (the list model).", { type: "string" }),
      status: str("Initial status.", {
        enum: ["new", "contacted", "replied", "qualified", "converted", "unsubscribed", "bounced"],
      }),
      idempotencyKey: str("Client idempotency key for retries; defaults to a hash of the inputs."),
    },
    required: ["email"],
    additionalProperties: false,
  },
  update_lead: {
    type: "object",
    properties: {
      leadId: str("Lead id."),
      firstName: str("First name."),
      lastName: str("Last name."),
      email: str("Email address.", { format: "email" }),
      company: str("Company."),
      jobTitle: str("Job title."),
      linkedinUrl: str("LinkedIn profile URL."),
      tags: arr("Replacement tag list.", { type: "string" }),
      status: str("Status.", {
        enum: ["new", "contacted", "replied", "qualified", "converted", "unsubscribed", "bounced"],
      }),
      idempotencyKey: str("Client idempotency key for retries; defaults to a hash of the inputs."),
    },
    required: ["leadId"],
    additionalProperties: false,
  },
  create_campaign: {
    type: "object",
    properties: {
      name: str("Campaign name."),
      channel: str("Campaign channel.", { enum: ["linkedin", "email", "mixed"] }),
      steps: arr("Sequence steps (at least one).", {
        type: "object",
        properties: {
          step_type: {
            type: "string",
            enum: ["connection_request", "linkedin_message", "email", "wait", "condition", "like_post", "view_profile", "endorse_skills"],
          },
          delay_hours: { type: "number", minimum: 0 },
          subject: { type: "string" },
          content: { type: "string" },
        },
        required: ["step_type", "delay_hours"],
        additionalProperties: false,
      }),
      description: str("Campaign description."),
      idempotencyKey: str("Client idempotency key for retries; defaults to a hash of the inputs."),
    },
    required: ["name", "channel", "steps"],
    additionalProperties: false,
  },
  pause_campaign: {
    type: "object",
    properties: {
      campaignId: str("Campaign id."),
      idempotencyKey: str("Client idempotency key for retries; defaults to a hash of the inputs."),
    },
    required: ["campaignId"],
    additionalProperties: false,
  },
  resume_campaign: {
    type: "object",
    properties: {
      campaignId: str("Campaign id."),
      idempotencyKey: str("Client idempotency key for retries; defaults to a hash of the inputs."),
    },
    required: ["campaignId"],
    additionalProperties: false,
  },
  archive_campaign: {
    type: "object",
    properties: {
      campaignId: str("Campaign id."),
      idempotencyKey: str("Client idempotency key for retries; defaults to a hash of the inputs."),
    },
    required: ["campaignId"],
    additionalProperties: false,
  },
  draft_outreach_message: {
    type: "object",
    properties: {
      channel: str("Channel the draft is for.", { enum: ["email", "linkedin"] }),
      stepType: str("Sequence step type, e.g. email, connection_request, linkedin_message."),
      campaignName: str("Campaign name for context."),
      campaignGoal: str("Campaign goal for context."),
      existingContent: str("Existing step content to improve."),
      leadFirstName: str("Lead first name for personalization."),
      leadCompany: str("Lead company for personalization."),
      leadJobTitle: str("Lead job title for personalization."),
      idempotencyKey: str("Client idempotency key for retries; defaults to a hash of the inputs."),
    },
    required: ["channel", "stepType"],
    additionalProperties: false,
  },
  send_email: {
    type: "object",
    properties: {
      to: str("Recipient email address.", { format: "email" }),
      subject: str("Email subject."),
      body: str("Plain-text email body."),
      idempotencyKey: str("Client idempotency key; defaults to a hash of the inputs."),
    },
    required: ["to", "subject", "body"],
    additionalProperties: false,
  },
  send_inbox_reply: {
    type: "object",
    properties: {
      conversationId: str("Conversation id (email channel only)."),
      body: str("Reply body."),
      subject: str("Reply subject override (defaults to Re: <thread subject>)."),
      idempotencyKey: str("Client idempotency key; defaults to a hash of the inputs."),
    },
    required: ["conversationId", "body"],
    additionalProperties: false,
  },
  delete_lead: {
    type: "object",
    properties: {
      leadId: str("Lead id."),
      idempotencyKey: str("Client idempotency key for retries; defaults to a hash of the inputs."),
    },
    required: ["leadId"],
    additionalProperties: false,
  },
  // ── ChatGPT expansion ──────────────────────────────────────────────
  list_linkedin_accounts: { type: "object", properties: {}, additionalProperties: false },
  get_linkedin_account: {
    type: "object",
    properties: { accountId: str("Connected account id.") },
    required: ["accountId"],
    additionalProperties: false,
  },
  get_subscription_info: { type: "object", properties: {}, additionalProperties: false },
  get_account_limits: { type: "object", properties: {}, additionalProperties: false },
  search_campaigns: {
    type: "object",
    properties: {
      query: str("Substring match against the campaign name."),
      status: str("Filter by status.", { enum: ["draft", "active", "paused", "archived"] }),
      page: int("1-based page number.", { minimum: 1, default: 1 }),
      pageSize: int("Rows per page (1-100).", { minimum: 1, maximum: 100, default: 20 }),
    },
    additionalProperties: false,
  },
  stop_campaign: {
    type: "object",
    properties: {
      campaignId: str("Campaign id."),
      idempotencyKey: str("Client idempotency key for retries; defaults to a hash of the inputs."),
    },
    required: ["campaignId"],
    additionalProperties: false,
  },
  delete_campaign: {
    type: "object",
    properties: {
      campaignId: str("Campaign id."),
      idempotencyKey: str("Client idempotency key for retries; defaults to a hash of the inputs."),
    },
    required: ["campaignId"],
    additionalProperties: false,
  },
  get_campaign_performance: {
    type: "object",
    properties: { campaignId: str("Campaign id.") },
    required: ["campaignId"],
    additionalProperties: false,
  },
  get_campaign_execution_status: {
    type: "object",
    properties: {
      campaignId: str("Campaign id."),
      page: int("1-based page number.", { minimum: 1, default: 1 }),
      pageSize: int("Rows per page (1-100).", { minimum: 1, maximum: 100, default: 20 }),
    },
    required: ["campaignId"],
    additionalProperties: false,
  },
  search_leads: {
    type: "object",
    properties: {
      query: str("Substring match against name, email or company."),
      page: int("1-based page number.", { minimum: 1, default: 1 }),
      pageSize: int("Rows per page (1-100).", { minimum: 1, maximum: 100, default: 20 }),
    },
    required: ["query"],
    additionalProperties: false,
  },
  import_leads: {
    type: "object",
    properties: {
      leads: arr("Leads to import (1-100).", {
        type: "object",
        properties: {
          email: { type: "string", format: "email" },
          first_name: { type: "string" },
          last_name: { type: "string" },
          company: { type: "string" },
          job_title: { type: "string" },
          linkedin_url: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["email"],
        additionalProperties: false,
      }),
      idempotencyKey: str("Client idempotency key for retries; defaults to a hash of the inputs."),
    },
    required: ["leads"],
    additionalProperties: false,
  },
  add_leads_to_campaign: {
    type: "object",
    properties: {
      campaignId: str("Campaign id."),
      leadIds: arr("Lead ids to enroll.", { type: "string" }),
      idempotencyKey: str("Client idempotency key for retries; defaults to a hash of the inputs."),
    },
    required: ["campaignId", "leadIds"],
    additionalProperties: false,
  },
  remove_leads_from_campaign: {
    type: "object",
    properties: {
      campaignId: str("Campaign id."),
      leadIds: arr("Lead ids to remove.", { type: "string" }),
      idempotencyKey: str("Client idempotency key for retries; defaults to a hash of the inputs."),
    },
    required: ["campaignId", "leadIds"],
    additionalProperties: false,
  },
  detect_duplicate_leads: { type: "object", properties: {}, additionalProperties: false },
  get_lead_activity_history: {
    type: "object",
    properties: { leadId: str("Lead id.") },
    required: ["leadId"],
    additionalProperties: false,
  },
  list_leads_by_campaign: {
    type: "object",
    properties: {
      campaignId: str("Campaign id."),
      page: int("1-based page number.", { minimum: 1, default: 1 }),
      pageSize: int("Rows per page (1-100).", { minimum: 1, maximum: 100, default: 20 }),
    },
    required: ["campaignId"],
    additionalProperties: false,
  },
  get_campaign_sequence: {
    type: "object",
    properties: { campaignId: str("Campaign id.") },
    required: ["campaignId"],
    additionalProperties: false,
  },
  create_sequence_step: {
    type: "object",
    properties: {
      campaignId: str("Campaign id."),
      stepType: str("Step type.", {
        enum: ["connection_request", "linkedin_message", "email", "wait", "condition", "like_post", "view_profile", "endorse_skills"],
      }),
      delayHours: int("Hours to wait before this step runs.", { minimum: 0, default: 0 }),
      subject: str("Step subject (email steps)."),
      content: str("Step content (required for email and linkedin_message steps)."),
      config: { type: "object", description: "Step-specific config." },
      idempotencyKey: str("Client idempotency key for retries; defaults to a hash of the inputs."),
    },
    required: ["campaignId", "stepType"],
    additionalProperties: false,
  },
  update_sequence_step: {
    type: "object",
    properties: {
      campaignId: str("Campaign id."),
      stepId: str("Sequence step id."),
      stepType: str("Step type.", {
        enum: ["connection_request", "linkedin_message", "email", "wait", "condition", "like_post", "view_profile", "endorse_skills"],
      }),
      delayHours: int("Hours to wait before this step runs.", { minimum: 0 }),
      subject: str("Step subject (email steps)."),
      content: str("Step content."),
      config: { type: "object", description: "Step-specific config." },
      idempotencyKey: str("Client idempotency key for retries; defaults to a hash of the inputs."),
    },
    required: ["campaignId", "stepId"],
    additionalProperties: false,
  },
  reorder_sequence_steps: {
    type: "object",
    properties: {
      campaignId: str("Campaign id."),
      stepIds: arr("Step ids in the new order — exactly the campaign's current steps.", { type: "string" }),
      idempotencyKey: str("Client idempotency key for retries; defaults to a hash of the inputs."),
    },
    required: ["campaignId", "stepIds"],
    additionalProperties: false,
  },
  get_scheduled_follow_ups: {
    type: "object",
    properties: {
      conversationId: str("Only follow-ups for this conversation."),
      page: int("1-based page number.", { minimum: 1, default: 1 }),
      pageSize: int("Rows per page (1-100).", { minimum: 1, maximum: 100, default: 20 }),
    },
    additionalProperties: false,
  },
  get_sequence_execution_status: {
    type: "object",
    properties: { campaignId: str("Campaign id.") },
    required: ["campaignId"],
    additionalProperties: false,
  },
  get_pending_actions: {
    type: "object",
    properties: {
      campaignId: str("Only pending actions for this campaign."),
      page: int("1-based page number.", { minimum: 1, default: 1 }),
      pageSize: int("Rows per page (1-100).", { minimum: 1, maximum: 100, default: 20 }),
    },
    additionalProperties: false,
  },
  get_failed_actions: {
    type: "object",
    properties: {
      campaignId: str("Only failed actions for this campaign."),
      page: int("1-based page number.", { minimum: 1, default: 1 }),
      pageSize: int("Rows per page (1-100).", { minimum: 1, maximum: 100, default: 20 }),
    },
    additionalProperties: false,
  },
  get_automation_execution_report: {
    type: "object",
    properties: { campaignId: str("Only this campaign's report (otherwise the whole workspace).") },
    additionalProperties: false,
  },
  search_conversations: {
    type: "object",
    properties: {
      query: str("Substring match against contact name, email, company or subject."),
      channel: str("Filter by channel.", { enum: ["email", "linkedin"] }),
      page: int("1-based page number.", { minimum: 1, default: 1 }),
      pageSize: int("Rows per page (1-100).", { minimum: 1, maximum: 100, default: 20 }),
    },
    required: ["query"],
    additionalProperties: false,
  },
  get_message_execution_status: {
    type: "object",
    properties: {
      messageId: str("Message id."),
      idempotencyKey: str("Idempotency key the message was sent with."),
      conversationId: str("Conversation id (required when looking up by idempotency key)."),
    },
    additionalProperties: false,
  },
  get_failed_messages: {
    type: "object",
    properties: {
      page: int("1-based page number.", { minimum: 1, default: 1 }),
      pageSize: int("Rows per page (1-100).", { minimum: 1, maximum: 100, default: 20 }),
    },
    additionalProperties: false,
  },
  compare_campaigns: {
    type: "object",
    properties: {
      campaignIds: arr("Campaign ids to compare (2 or more).", { type: "string" }),
    },
    required: ["campaignIds"],
    additionalProperties: false,
  },
  get_date_range_report: {
    type: "object",
    properties: {
      startDate: str("Range start (ISO date, e.g. 2026-10-01)."),
      endDate: str("Range end (ISO date, e.g. 2026-10-31)."),
    },
    required: ["startDate", "endDate"],
    additionalProperties: false,
  },
  get_performance_summary: { type: "object", properties: {}, additionalProperties: false },
  get_usage_report: { type: "object", properties: {}, additionalProperties: false },
  get_profile: { type: "object", properties: {}, additionalProperties: false },
  search: {
    type: "object",
    properties: { query: str("Search text matched against lead and campaign names, emails and companies.") },
    required: ["query"],
    additionalProperties: false,
  },
  fetch: {
    type: "object",
    properties: { id: str("Lead id or campaign id.") },
    required: ["id"],
    additionalProperties: false,
  },
  render_campaigns_widget: {
    type: "object",
    properties: {
      campaignIds: arr("Campaign ids to render, from list_campaigns.", { type: "string" }),
      campaigns: arr("Campaign summaries from list_campaigns (id, name, status, type, enrollments).", {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          status: { type: "string" },
          type: { type: "string" },
          enrollments: { type: "integer" },
        },
        required: ["id", "name"],
        additionalProperties: true,
      }),
      summary: { type: "object", description: "Optional aggregate summary (from get_campaign_performance or get_performance_summary)." },
    },
    required: ["campaignIds"],
    additionalProperties: false,
  },
};

export interface ToolValidationError {
  message: string;
  details: string[];
}

/**
 * Validates `input` against the tool's schema. Returns null when valid.
 * Checks: input is an object, required fields present, declared types,
 * enums, and string/integer bounds. Unknown properties are rejected
 * (schemas set additionalProperties: false).
 */
export function validateToolInput(
  toolName: string,
  input: unknown
): ToolValidationError | null {
  const schema = TOOL_INPUT_SCHEMAS[toolName];
  if (!schema) return { message: `Unknown tool: ${toolName}`, details: [] };
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { message: "Tool arguments must be an object.", details: [] };
  }
  const obj = input as Record<string, unknown>;
  const details: string[] = [];
  for (const req of schema.required ?? []) {
    if (obj[req] === undefined || obj[req] === null || obj[req] === "") {
      details.push(`Missing required field: ${req}`);
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    const prop = schema.properties[key];
    if (!prop) {
      details.push(`Unknown field: ${key}`);
      continue;
    }
    const expected = prop.type as string | undefined;
    if (expected === "string" && typeof value !== "string") {
      details.push(`Field ${key} must be a string.`);
    } else if (expected === "integer" && (typeof value !== "number" || !Number.isInteger(value))) {
      details.push(`Field ${key} must be an integer.`);
    } else if (expected === "number" && typeof value !== "number") {
      details.push(`Field ${key} must be a number.`);
    } else if (expected === "boolean" && typeof value !== "boolean") {
      details.push(`Field ${key} must be a boolean.`);
    } else if (expected === "array" && !Array.isArray(value)) {
      details.push(`Field ${key} must be an array.`);
    }
    if (typeof value === "string" && prop.format === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      details.push(`Field ${key} must be a valid email address.`);
    }
    if (Array.isArray(prop.enum) && !prop.enum.includes(value)) {
      details.push(`Field ${key} must be one of: ${(prop.enum as unknown[]).join(", ")}.`);
    }
    if (typeof value === "number") {
      if (typeof prop.minimum === "number" && value < prop.minimum) {
        details.push(`Field ${key} must be >= ${prop.minimum}.`);
      }
      if (typeof prop.maximum === "number" && value > prop.maximum) {
        details.push(`Field ${key} must be <= ${prop.maximum}.`);
      }
    }
    if (expected === "array" && Array.isArray(value)) {
      const itemSchema = (prop.items ?? {}) as Record<string, unknown>;
      if (itemSchema.type === "object") {
        const itemProps = (itemSchema.properties ?? {}) as Record<string, Record<string, unknown>>;
        const itemRequired = (itemSchema.required ?? []) as string[];
        value.forEach((item, i) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            details.push(`Field ${key}[${i}] must be an object.`);
            return;
          }
          const itemObj = item as Record<string, unknown>;
          for (const req of itemRequired) {
            if (itemObj[req] === undefined || itemObj[req] === null) {
              details.push(`Field ${key}[${i}] is missing required field: ${req}`);
            }
          }
          for (const [ik, iv] of Object.entries(itemObj)) {
            const iprop = itemProps[ik];
            if (!iprop) {
              details.push(`Field ${key}[${i}] has unknown field: ${ik}`);
              continue;
            }
            if (iprop.type === "string" && typeof iv !== "string") {
              details.push(`Field ${key}[${i}].${ik} must be a string.`);
            }
            if (iprop.type === "number" && typeof iv !== "number") {
              details.push(`Field ${key}[${i}].${ik} must be a number.`);
            }
            if (Array.isArray(iprop.enum) && !iprop.enum.includes(iv)) {
              details.push(`Field ${key}[${i}].${ik} must be one of: ${(iprop.enum as unknown[]).join(", ")}.`);
            }
          }
        });
      }
    }
  }
  if (details.length > 0) {
    return { message: `Invalid parameters for tool ${toolName}.`, details };
  }
  return null;
}

