/**
 * Notification templates — pure event → message builders shared by
 * every communication adapter (Slack, Teams, Discord, Telegram,
 * WhatsApp) and by the Gmail / Outlook alert paths.
 *
 * These are TEXT ONLY. They never send anything and never touch a
 * credential: an adapter takes the built message and delivers it
 * through its own provider API, then returns a delivery result.
 *
 * Alert types map onto the real NxtSend events where one exists
 * (see src/lib/integrations/rest/events.ts):
 *   lead.created            → new-lead alert
 *   conversation.reply_created → new-reply alert
 *   campaign.status_changed → campaign-status alert
 *   lead.interested         → interested-lead alert (derived from a
 *                             lead update that marks a lead
 *                             interested; there is no separate
 *                             webhook event for it)
 *   daily.report            → scheduled daily digest (not a webhook
 *                             event — produced by a scheduled job)
 *   sync.error              → adapter / sync failure alert
 *
 * Nothing here claims LinkedIn activity: there is no LinkedIn send
 * in the product, so no template mentions one.
 */

export type NotificationEventType =
  | "lead.created"
  | "conversation.reply_created"
  | "lead.interested"
  | "campaign.status_changed"
  | "daily.report"
  | "sync.error";

export const NOTIFICATION_EVENT_TYPES: readonly NotificationEventType[] = [
  "lead.created",
  "conversation.reply_created",
  "lead.interested",
  "campaign.status_changed",
  "daily.report",
  "sync.error",
];

export interface NotificationEventInput {
  type: NotificationEventType;
  /** Workspace display name, when known. */
  workspaceName?: string;
  leadName?: string;
  leadEmail?: string;
  leadCompany?: string;
  leadJobTitle?: string;
  campaignName?: string;
  /** New campaign status, e.g. "paused" / "resumed" / "archived". */
  campaignStatus?: string;
  /** Short excerpt of the reply, for the new-reply alert. */
  replySnippet?: string;
  /** Human-readable error, for the error alert. */
  errorMessage?: string;
  /** Provider / job that failed, for the error alert. */
  errorSource?: string;
  /** Daily-report counts. */
  stats?: {
    newLeads?: number;
    replies?: number;
    interestedLeads?: number;
    activeCampaigns?: number;
  };
  /** Optional link back into the NxtSend app. */
  appUrl?: string;
}

export interface NotificationMessage {
  /** Short subject / heading line. */
  title: string;
  /** Plain-text body. No markdown — adapters format for their provider. */
  text: string;
}

function leadLine(input: NotificationEventInput): string {
  const parts = [input.leadName, input.leadJobTitle, input.leadCompany]
    .filter((p) => p && p.trim().length > 0)
    .join(" · ");
  const email = input.leadEmail ? ` (${input.leadEmail})` : "";
  return parts ? `${parts}${email}` : email.trim() || "A lead";
}

function workspaceLine(input: NotificationEventInput): string {
  return input.workspaceName ? `Workspace: ${input.workspaceName}` : "";
}

function withAppUrl(text: string, input: NotificationEventInput): string {
  return input.appUrl ? `${text}\nOpen NxtSend: ${input.appUrl}` : text;
}

/**
 * Builds the title + plain-text body for one alert. Pure function —
 * safe to call anywhere, including tests. Returns null only when
 * the event type is unknown (callers should never pass one).
 */
export function buildNotificationMessage(
  input: NotificationEventInput
): NotificationMessage | null {
  const ws = workspaceLine(input);
  switch (input.type) {
    case "lead.created": {
      const title = `New lead: ${input.leadName ?? "unknown"}`;
      const lines = [`New lead added to NxtSend: ${leadLine(input)}.`];
      if (ws) lines.push(ws);
      return { title, text: withAppUrl(lines.join("\n"), input) };
    }
    case "conversation.reply_created": {
      const title = `New reply from ${input.leadName ?? "a lead"}`;
      const lines = [`${leadLine(input)} replied.`];
      if (input.replySnippet) lines.push(`"${input.replySnippet}"`);
      if (ws) lines.push(ws);
      return { title, text: withAppUrl(lines.join("\n"), input) };
    }
    case "lead.interested": {
      const title = `Interested lead: ${input.leadName ?? "unknown"}`;
      const lines = [
        `${leadLine(input)} is now marked interested — follow up soon.`,
      ];
      if (ws) lines.push(ws);
      return { title, text: withAppUrl(lines.join("\n"), input) };
    }
    case "campaign.status_changed": {
      const status = input.campaignStatus ?? "changed";
      const title = `Campaign ${status}: ${input.campaignName ?? "unknown"}`;
      const lines = [
        `Campaign "${input.campaignName ?? "unknown"}" is now ${status}.`,
      ];
      if (ws) lines.push(ws);
      return { title, text: withAppUrl(lines.join("\n"), input) };
    }
    case "daily.report": {
      const s = input.stats ?? {};
      const title = "NxtSend daily report";
      const lines = [
        "Your NxtSend daily summary:",
        `• New leads: ${s.newLeads ?? 0}`,
        `• Replies: ${s.replies ?? 0}`,
        `• Interested leads: ${s.interestedLeads ?? 0}`,
        `• Active campaigns: ${s.activeCampaigns ?? 0}`,
      ];
      if (ws) lines.push(ws);
      return { title, text: withAppUrl(lines.join("\n"), input) };
    }
    case "sync.error": {
      const source = input.errorSource ?? "NxtSend";
      const title = `Sync error: ${source}`;
      const lines = [
        `${source} reported an error:`,
        input.errorMessage ?? "Unknown error.",
      ];
      if (ws) lines.push(ws);
      return { title, text: withAppUrl(lines.join("\n"), input) };
    }
    default:
      return null;
  }
}

/** Human label for an alert type, for settings UI. */
export function notificationEventLabel(type: NotificationEventType): string {
  switch (type) {
    case "lead.created":
      return "New lead";
    case "conversation.reply_created":
      return "New reply";
    case "lead.interested":
      return "Interested lead";
    case "campaign.status_changed":
      return "Campaign status change";
    case "daily.report":
      return "Daily report";
    case "sync.error":
      return "Sync / delivery error";
  }
}
