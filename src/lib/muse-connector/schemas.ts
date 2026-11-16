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
};

export function requiredScope(toolName: string): MuseScope | null {
  return TOOL_SCOPES[toolName] ?? null;
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
    },
    required: ["name", "channel", "steps"],
    additionalProperties: false,
  },
  pause_campaign: {
    type: "object",
    properties: { campaignId: str("Campaign id.") },
    required: ["campaignId"],
    additionalProperties: false,
  },
  resume_campaign: {
    type: "object",
    properties: { campaignId: str("Campaign id.") },
    required: ["campaignId"],
    additionalProperties: false,
  },
  archive_campaign: {
    type: "object",
    properties: { campaignId: str("Campaign id.") },
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
    properties: { leadId: str("Lead id.") },
    required: ["leadId"],
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

