/**
 * Email-event aggregation core (pure) — P5 Stage D.
 *
 * `email_events` (migration 004) is the provider webhook log: every
 * Resend delivery is recorded there by the Svix-verified webhook
 * handler. The table is service-role-only and — critically — carries
 * NO workspace_id. An event is therefore attributed to a workspace
 * ONLY through its `provider_message_id`, resolved against the
 * `messages` table: an event counts for a workspace exactly when a
 * message in that workspace carries the same provider message ID.
 * Events that resolve to another workspace, or to no message at all,
 * are NEVER counted in a workspace aggregate (the scoping rule the
 * unit tests pin). Unrouted `email.received` events resolve to no
 * workspace by definition — they surface only in the platform-admin
 * webhook log.
 *
 * Counting semantics (one definition, used by every surface):
 *   sent       distinct outbound-linked messages with an email.sent
 *              event (the provider accepted the send).
 *   delivered  distinct messages with email.delivered — an
 *              email.opened / email.clicked event also proves
 *              delivery and counts here.
 *   bounced    distinct messages with email.bounced.
 *   complained distinct messages with email.complained.
 *   opened     email.opened EVENTS, de-duplicated by provider event
 *              id (the same semantics campaign-stats' countEmailEvents
 *              has always used, so the numbers agree across pages).
 *   clicked    email.clicked EVENTS, de-duplicated by event id.
 *   received   distinct messages with an email.received event.
 *
 * Rates are computed only from these real counts; a zero denominator
 * yields null ("no data"), never an invented percentage.
 *
 * Classification: a live aggregate is "provider" (real webhook
 * events). The demo aggregate is "simulated" — deriveSimulatedEmailData
 * below synthesises events from demo message STATUSES (a demo message
 * recorded "opened" implies the simulated event chain that would have
 * produced that status). Simulated events are labelled end-to-end and
 * are never merged with provider events.
 */

export type EventsClassification = "provider" | "simulated";

export interface EmailEventRecord {
  provider_event_id: string;
  event_type: string;
  provider_message_id: string | null;
  received_at: string;
  /** Raw provider payload (admin log detail extraction only). */
  payload?: unknown;
}

/**
 * The message an event's provider_message_id resolves to. Built from
 * the `messages` table (live) or from demo messages (derived sets).
 */
export interface MessageLink {
  provider_message_id: string;
  workspace_id: string;
  campaign_id: string | null;
  direction: string;
  status: string;
  is_demo: boolean;
}

export interface DeliverabilityCounts {
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  opened: number;
  clicked: number;
  received: number;
}

export interface DeliverabilityRates {
  /** delivered / sent */
  deliveryRate: number | null;
  /** bounced / sent */
  bounceRate: number | null;
  /** complained / sent */
  complaintRate: number | null;
  /** opened (events) / delivered */
  openRate: number | null;
  /** clicked (events) / delivered */
  clickRate: number | null;
}

export interface DeliverabilityAggregate {
  counts: DeliverabilityCounts;
  rates: DeliverabilityRates;
  /** Events seen in scope (after dedupe), for "based on N events". */
  eventCount: number;
}

export interface EventScope {
  /** null = platform scope (no workspace filter; admin only). */
  workspaceId?: string | null;
  campaignId?: string | null;
  /** ISO timestamp; events older than this are excluded. */
  since?: string | null;
}

const SEND_LIFECYCLE = new Set([
  "email.sent",
  "email.delivered",
  "email.bounced",
  "email.complained",
  "email.opened",
  "email.clicked",
  "email.delivery_delayed",
]);

export function emptyCounts(): DeliverabilityCounts {
  return {
    sent: 0,
    delivered: 0,
    bounced: 0,
    complained: 0,
    opened: 0,
    clicked: 0,
    received: 0,
  };
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

export function computeRates(counts: DeliverabilityCounts): DeliverabilityRates {
  return {
    deliveryRate: rate(counts.delivered, counts.sent),
    bounceRate: rate(counts.bounced, counts.sent),
    complaintRate: rate(counts.complained, counts.sent),
    openRate: rate(counts.opened, counts.delivered),
    clickRate: rate(counts.clicked, counts.delivered),
  };
}

/**
 * Aggregates events under a scope. In a workspace/campaign scope an
 * event counts ONLY when its provider_message_id resolves (via
 * `links`) to a message inside that scope — this is the tenant
 * isolation rule, and it is why an event whose message lives in
 * another workspace contributes nothing here. An event with NO
 * provider message id can never be aggregated at any scope (nothing
 * to attribute or dedupe it against); it exists for the webhook log.
 */
export function aggregateEmailEvents(
  events: EmailEventRecord[],
  links: MessageLink[],
  scope: EventScope = {}
): DeliverabilityAggregate {
  const linkById = new Map<string, MessageLink>();
  for (const link of links) {
    if (!linkById.has(link.provider_message_id)) {
      linkById.set(link.provider_message_id, link);
    }
  }

  const inScope = (evt: EmailEventRecord): MessageLink | null | undefined => {
    if (!evt.provider_message_id) return undefined;
    const link = linkById.get(evt.provider_message_id);
    if (scope.workspaceId == null && scope.campaignId == null) {
      // Platform scope: every event counts; the link (when present)
      // only attributes it.
      return link ?? null;
    }
    if (!link) return undefined;
    if (scope.workspaceId != null && link.workspace_id !== scope.workspaceId) {
      return undefined;
    }
    if (scope.campaignId != null && link.campaign_id !== scope.campaignId) {
      return undefined;
    }
    return link;
  };

  const seenEventIds = new Set<string>();
  const sentMsgs = new Set<string>();
  const deliveredMsgs = new Set<string>();
  const bouncedMsgs = new Set<string>();
  const complainedMsgs = new Set<string>();
  const receivedMsgs = new Set<string>();
  let opened = 0;
  let clicked = 0;
  let eventCount = 0;

  for (const evt of events) {
    if (scope.since && evt.received_at < scope.since) continue;
    if (seenEventIds.has(evt.provider_event_id)) continue;
    const link = inScope(evt);
    if (link === undefined) continue;
    seenEventIds.add(evt.provider_event_id);
    eventCount++;

    const pmid = evt.provider_message_id;
    switch (evt.event_type) {
      case "email.sent":
        if (pmid) sentMsgs.add(pmid);
        break;
      case "email.delivered":
        if (pmid) deliveredMsgs.add(pmid);
        break;
      case "email.opened":
        opened++;
        if (pmid) deliveredMsgs.add(pmid); // an open proves delivery
        break;
      case "email.clicked":
        clicked++;
        if (pmid) deliveredMsgs.add(pmid);
        break;
      case "email.bounced":
        if (pmid) bouncedMsgs.add(pmid);
        break;
      case "email.complained":
        if (pmid) complainedMsgs.add(pmid);
        break;
      case "email.received":
        if (pmid) receivedMsgs.add(pmid);
        break;
      default:
        break; // delivery_delayed etc.: counted in eventCount only
    }
    // A message with any lifecycle event but no explicit email.sent
    // (providers occasionally drop one) still proves the send was
    // accepted — count it as sent so rates stay sane.
    if (pmid && SEND_LIFECYCLE.has(evt.event_type) && evt.event_type !== "email.sent") {
      if (link && link.direction === "outbound") sentMsgs.add(pmid);
    }
  }

  const counts: DeliverabilityCounts = {
    sent: sentMsgs.size,
    delivered: deliveredMsgs.size,
    bounced: bouncedMsgs.size,
    complained: complainedMsgs.size,
    opened,
    clicked,
    received: receivedMsgs.size,
  };
  return { counts, rates: computeRates(counts), eventCount };
}

// ── Admin webhook log ───────────────────────────────────────────────────────

export type WebhookRouting =
  /** email.received that was filed into a conversation. */
  | "routed"
  /** email.received that matched no conversation/lead (or an ambiguous tenant). */
  | "unrouted"
  /** Non-received event whose message was found. */
  | "linked"
  /** Non-received event with no matching message record. */
  | "unmatched";

export interface WebhookLogEntry {
  id: string;
  event_type: string;
  received_at: string;
  provider_message_id: string | null;
  workspace_id: string | null;
  routing: WebhookRouting;
  /** Human detail from the payload (from / to / subject), when present. */
  detail: string | null;
}

function payloadDetail(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as Record<string, unknown>).data;
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof d.from === "string" && d.from) parts.push(`from ${d.from}`);
  const to = d.to;
  const toText = Array.isArray(to) ? to.filter((t) => typeof t === "string").join(", ") : typeof to === "string" ? to : "";
  if (toText) parts.push(`to ${toText}`);
  if (typeof d.subject === "string" && d.subject) parts.push(`“${d.subject}”`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Shapes raw events into the admin inbound-webhook log, newest first.
 * `routedIds` (optional) is the set of provider message IDs that were
 * filed as inbound messages — an email.received event whose ID is in
 * the links (as an inbound message) is "routed"; one without is
 * "unrouted" and finally visible.
 */
export function shapeWebhookLog(
  events: EmailEventRecord[],
  links: MessageLink[],
  limit = 50
): WebhookLogEntry[] {
  const linkById = new Map<string, MessageLink>();
  for (const link of links) {
    if (!linkById.has(link.provider_message_id)) {
      linkById.set(link.provider_message_id, link);
    }
  }
  const sorted = [...events].sort((a, b) =>
    b.received_at.localeCompare(a.received_at)
  );
  const seen = new Set<string>();
  const out: WebhookLogEntry[] = [];
  for (const evt of sorted) {
    if (seen.has(evt.provider_event_id)) continue;
    seen.add(evt.provider_event_id);
    const link = evt.provider_message_id
      ? (linkById.get(evt.provider_message_id) ?? null)
      : null;
    let routing: WebhookRouting;
    if (evt.event_type === "email.received") {
      routing = link && link.direction === "inbound" ? "routed" : "unrouted";
    } else {
      routing = link ? "linked" : "unmatched";
    }
    out.push({
      id: evt.provider_event_id,
      event_type: evt.event_type,
      received_at: evt.received_at,
      provider_message_id: evt.provider_message_id,
      workspace_id: link?.workspace_id ?? null,
      routing,
      detail: payloadDetail(evt.payload),
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ── Reply sync status ───────────────────────────────────────────────────────

export interface ReplySyncStatus {
  webhookSecretConfigured: boolean;
  /** Newest event of any type, or null when the log is empty. */
  lastEventAt: string | null;
  /** Newest email.received event, or null when none was ever recorded. */
  lastInboundAt: string | null;
  lastInboundRouting: "routed" | "unrouted" | null;
  /**
   * no_events — no inbound event has ever been recorded;
   * receiving — an inbound event arrived within the recent window;
   * quiet     — inbound events exist but none recently.
   * Deliberately NEVER "healthy": recency of events cannot prove the
   * receiving domain, MX and webhook are all correctly configured.
   */
  status: "no_events" | "receiving" | "quiet";
  message: string;
}

const RECEIVING_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function deriveReplySyncStatus(
  events: EmailEventRecord[],
  links: MessageLink[],
  webhookSecretConfigured: boolean,
  now: Date = new Date()
): ReplySyncStatus {
  const linkById = new Map(links.map((l) => [l.provider_message_id, l]));
  let lastEventAt: string | null = null;
  let lastInboundAt: string | null = null;
  let lastInboundRouting: "routed" | "unrouted" | null = null;

  const sorted = [...events].sort((a, b) =>
    b.received_at.localeCompare(a.received_at)
  );
  for (const evt of sorted) {
    if (!lastEventAt) lastEventAt = evt.received_at;
    if (evt.event_type === "email.received" && !lastInboundAt) {
      lastInboundAt = evt.received_at;
      const link = evt.provider_message_id
        ? linkById.get(evt.provider_message_id)
        : undefined;
      lastInboundRouting =
        link && link.direction === "inbound" ? "routed" : "unrouted";
    }
    if (lastEventAt && lastInboundAt) break;
  }

  if (!lastInboundAt) {
    return {
      webhookSecretConfigured,
      lastEventAt,
      lastInboundAt: null,
      lastInboundRouting: null,
      status: "no_events",
      message:
        "No inbound events recorded yet. No reply email has reached the webhook — check that the receiving domain's MX points at the provider and that the email.received webhook is enabled.",
    };
  }
  const age = now.getTime() - new Date(lastInboundAt).getTime();
  if (age <= RECEIVING_WINDOW_MS) {
    return {
      webhookSecretConfigured,
      lastEventAt,
      lastInboundAt,
      lastInboundRouting,
      status: "receiving",
      message: `Inbound mail is arriving — the most recent email.received event was ${lastInboundRouting === "routed" ? "filed into a conversation" : "recorded but could not be routed to a conversation"}.`,
    };
  }
  return {
    webhookSecretConfigured,
    lastEventAt,
    lastInboundAt,
    lastInboundRouting,
    status: "quiet",
    message:
      "No inbound events recently. If replies are expected, check the receiving domain, its MX record and the provider webhook configuration.",
  };
}

// ── Demo derivation ─────────────────────────────────────────────────────────

/** The message shape the demo derivation needs (InboxMessage-compatible). */
export interface DemoEventSourceMessage {
  id: string;
  workspace_id: string;
  campaign_id?: string | null;
  channel: string;
  direction: string;
  status: string;
  sent_at: string;
  is_demo: boolean;
  provider_message_id?: string | null;
}

/** Simulated provider message ID for a demo message that has none. */
export function demoProviderMessageId(messageId: string): string {
  return `demo-pm-${messageId}`;
}

/** Outbound status → the simulated provider-event chain that produces it. */
const OUTBOUND_STATUS_EVENTS: Record<string, string[]> = {
  queued: ["email.sent"],
  sent: ["email.sent"],
  simulated: ["email.sent"],
  delivered: ["email.sent", "email.delivered"],
  opened: ["email.sent", "email.delivered", "email.opened"],
  clicked: ["email.sent", "email.delivered", "email.opened", "email.clicked"],
  bounced: ["email.sent", "email.bounced"],
  complained: ["email.sent", "email.delivered", "email.complained"],
  delivery_delayed: ["email.sent", "email.delivery_delayed"],
};

/**
 * Derives a SIMULATED event set from demo messages. Every derived
 * event is keyed to its message (synthetic provider ID when the demo
 * message has none), and the returned links map those IDs back to the
 * messages — so the exact same aggregation + scoping code runs on
 * demo data, with classification "simulated" attached by the caller.
 * Failed/suppressed sends produce NO provider events (the provider
 * never accepted them); they surface as sending errors / failed
 * counts elsewhere, exactly like live.
 */
export function deriveSimulatedEmailData(messages: DemoEventSourceMessage[]): {
  events: EmailEventRecord[];
  links: MessageLink[];
} {
  const events: EmailEventRecord[] = [];
  const links: MessageLink[] = [];
  for (const m of messages) {
    if (m.channel !== "email") continue;
    const pmid = m.provider_message_id ?? demoProviderMessageId(m.id);
    links.push({
      provider_message_id: pmid,
      workspace_id: m.workspace_id,
      campaign_id: m.campaign_id ?? null,
      direction: m.direction,
      status: m.status,
      is_demo: true,
    });
    if (m.direction === "inbound") {
      events.push({
        provider_event_id: `demo-ev-${m.id}-received`,
        event_type: "email.received",
        provider_message_id: pmid,
        received_at: m.sent_at,
      });
      continue;
    }
    const chain = OUTBOUND_STATUS_EVENTS[m.status] ?? [];
    chain.forEach((eventType, i) => {
      events.push({
        provider_event_id: `demo-ev-${m.id}-${i}-${eventType}`,
        event_type: eventType,
        provider_message_id: pmid,
        received_at: m.sent_at,
      });
    });
  }
  return { events, links };
}
