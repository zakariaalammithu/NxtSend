/**
 * MCP prompts for the Claude flavor (`/api/mcp/claude`).
 *
 * Prompts are TEMPLATES, not data fetches: a prompt result is text
 * only, and a prompt that needs workspace data says so in its
 * message — it tells the model which tools to call to fetch the data
 * (e.g. get_campaign_performance) instead of inventing numbers.
 * No prompt ever triggers a send, a merge, or a delete: the
 * follow-up prompt produces a draft for human review, and the
 * cleanup prompt lists duplicates for review only.
 *
 * Decision (documented): prompts are Claude-only. The Muse flavor
 * keeps its exact prior behaviour (no prompts capability, and
 * prompts/list + prompts/get answer "method not found"), and the
 * ChatGPT flavor does not advertise them either — Claude is the
 * surface whose client surfaces prompts to the user. Resources,
 * by contrast, are shared: resources/list + resources/read work on
 * every flavor that already has them (see ./mcp.ts).
 *
 * Arguments are validated: every required argument must be present
 * and a non-empty string, and unknown argument names are refused
 * (-32602). Nothing here touches the network or the database.
 */

export interface McpPromptArgument {
  name: string;
  description: string;
  required: boolean;
}

export interface McpPrompt {
  name: string;
  description: string;
  arguments: McpPromptArgument[];
}

export const NXTSEND_MCP_PROMPTS: McpPrompt[] = [
  {
    name: "campaign-performance-summary",
    description:
      "Summarise the performance of one campaign by name or id. Template only: it fetches no data itself — the model must call get_campaign_performance (and search_campaigns to resolve a name to an id) and summarise the real results.",
    arguments: [
      {
        name: "campaign",
        description: "Campaign name or id to summarise.",
        required: true,
      },
    ],
  },
  {
    name: "lead-follow-up-draft",
    description:
      "Draft a follow-up message for one lead by id, for human review. Template only: it fetches no data itself — the model must call get_lead first. The draft is never sent; sending needs the user's explicit approval and the send_email / send_inbox_reply tools.",
    arguments: [
      {
        name: "leadId",
        description: "Id of the lead to draft a follow-up for.",
        required: true,
      },
    ],
  },
  {
    name: "weekly-performance-report",
    description:
      "Summarise workspace performance for a date-range label. Template only: it fetches no data itself — the model must call get_performance_summary and get_usage_summary for the range and summarise the real results.",
    arguments: [
      {
        name: "dateRange",
        description:
          'Date-range label, e.g. "2026-11-09 to 2026-11-15" or "last week".',
        required: true,
      },
    ],
  },
  {
    name: "duplicate-lead-cleanup",
    description:
      "List duplicate lead groups for review. Template only: it fetches no data itself — the model must call detect_duplicate_leads and list the groups. It never merges or deletes anything; any cleanup needs the user's explicit approval per lead.",
    arguments: [],
  },
];

/** The public list shape returned by prompts/list. */
export function listMcpPrompts(): McpPrompt[] {
  return NXTSEND_MCP_PROMPTS.map((prompt) => ({
    name: prompt.name,
    description: prompt.description,
    arguments: prompt.arguments.map((arg) => ({ ...arg })),
  }));
}

export type GetMcpPromptResult =
  | { ok: true; description: string; messages: Array<{ role: "user"; content: { type: "text"; text: string } }> }
  | { ok: false; message: string };

function renderPromptText(prompt: McpPrompt, args: Record<string, string>): string {
  switch (prompt.name) {
    case "campaign-performance-summary":
      return (
        `Summarise the performance of the NxtSend campaign "${args.campaign}". ` +
        `First resolve the campaign: if "${args.campaign}" is a name, call search_campaigns to find its id, then call get_campaign_performance with that id. ` +
        `Summarise the real results only — opens, clicks, replies, sends and failures as returned by the tools. Do not invent numbers. ` +
        `If the campaign cannot be found, say so and stop. Do not change, pause or delete anything.`
      );
    case "lead-follow-up-draft":
      return (
        `Draft a short follow-up message for the NxtSend lead with id "${args.leadId}". ` +
        `First call get_lead with that id and use the lead's real name, company and recent activity (get_lead_activity_history) to personalise it. ` +
        `This is a DRAFT for the user to review — never send it. Do not call send_email or send_inbox_reply. ` +
        `If the lead cannot be found, say so and stop.`
      );
    case "weekly-performance-report":
      return (
        `Write a short weekly performance summary for the NxtSend workspace covering ${args.dateRange}. ` +
        `Call get_performance_summary and get_usage_summary for that range and summarise the real results only — campaigns sent, replies, usage and any failures. ` +
        `Do not invent numbers. Keep it to the highlights plus anything that needs the user's attention. Do not change anything.`
      );
    case "duplicate-lead-cleanup":
      return (
        `List the duplicate lead groups in this NxtSend workspace for review. ` +
        `Call detect_duplicate_leads and list each group with the lead ids, names and emails involved. ` +
        `Do not merge or delete anything — this is a review list only. If the user wants a cleanup, ask them to confirm each group first.`
      );
    default:
      return prompt.description;
  }
}

/**
 * Resolves a prompts/get request: validates the prompt name and its
 * arguments, then renders the template message. Returns an error
 * message (caller maps it to -32602) for an unknown prompt, a
 * missing/empty required argument, or an unknown argument name.
 */
export function getMcpPrompt(
  name: unknown,
  args: unknown
): GetMcpPromptResult {
  if (typeof name !== "string" || !name) {
    return { ok: false, message: "Invalid params: prompts/get requires a prompt name." };
  }
  const prompt = NXTSEND_MCP_PROMPTS.find((p) => p.name === name);
  if (!prompt) {
    return { ok: false, message: `Unknown prompt: ${name}.` };
  }
  if (args !== undefined && (typeof args !== "object" || args === null || Array.isArray(args))) {
    return { ok: false, message: "Invalid params: arguments must be an object." };
  }
  const provided = (args ?? {}) as Record<string, unknown>;
  const known = new Set(prompt.arguments.map((a) => a.name));
  for (const key of Object.keys(provided)) {
    if (!known.has(key)) {
      return { ok: false, message: `Unknown argument: ${key}.` };
    }
  }
  const values: Record<string, string> = {};
  for (const arg of prompt.arguments) {
    const value = provided[arg.name];
    if (arg.required) {
      if (typeof value !== "string" || value.trim().length === 0) {
        return {
          ok: false,
          message: `Invalid params: argument "${arg.name}" is required and must be a non-empty string.`,
        };
      }
      values[arg.name] = value.trim();
    } else if (value !== undefined) {
      if (typeof value !== "string" || value.trim().length === 0) {
        return {
          ok: false,
          message: `Invalid params: argument "${arg.name}" must be a non-empty string.`,
        };
      }
      values[arg.name] = value.trim();
    }
  }
  return {
    ok: true,
    description: prompt.description,
    messages: [{ role: "user", content: { type: "text", text: renderPromptText(prompt, values) } }],
  };
}
