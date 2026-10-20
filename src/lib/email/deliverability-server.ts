/**
 * Deliverability read path (server-only) — P5 Stage D.
 *
 * `email_events` is service-role-only (migration 004), so every read
 * here runs through the admin client — but the SCOPING is enforced in
 * this module, not by the client:
 *
 * - Workspace reads derive the workspace from the caller's session
 *   context (the API route resolves it server-side via
 *   resolveCenterContext; a client-supplied workspace id is never
 *   accepted). Events are fetched ONLY for provider message IDs that
 *   belong to messages in that workspace, and the pure aggregator
 *   re-checks every event against the workspace's message links —
 *   an event whose message lives in another workspace contributes
 *   nothing, even if it were somehow returned by the query.
 * - Platform reads (admin console) deliberately span workspaces —
 *   they run only behind resolveAdminGate, and every row is labelled
 *   with its workspace.
 * - The service-role key never leaves the server: routes return
 *   aggregates, log shapes and error rows only.
 *
 * Demo mode: no provider events exist, so the loaders derive a
 * SIMULATED event set from demo message statuses (events-core) merged
 * with the demo event log (received-mail simulations, incl. unrouted
 * ones). Classification "simulated" is returned with every payload
 * and rendered by the UI — demo numbers never wear a provider label.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isConfiguredValue } from "@/lib/env";
import { getInboxRepository } from "@/lib/data";
import { DEMO_WORKSPACE_ID } from "@/lib/data/workspace";
import { listMessageHistory } from "@/lib/data/message-history";
import {
  aggregateEmailEvents,
  deriveReplySyncStatus,
  deriveSimulatedEmailData,
  shapeWebhookLog,
  type DeliverabilityAggregate,
  type DeliverabilityCounts,
  type EmailEventRecord,
  type EventsClassification,
  type MessageLink,
  type ReplySyncStatus,
  type WebhookLogEntry,
} from "./events-core";
import { listDemoEmailEvents } from "./demo-events";

export const MAX_DELIVERABILITY_DAYS = 3650;

export function clampDays(raw: string | null | undefined): number {
  const n = Number(raw ?? 30);
  if (!Number.isFinite(n) || n <= 0) return 30;
  return Math.min(Math.floor(n), MAX_DELIVERABILITY_DAYS);
}

export function sinceForDays(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// ── Shared shapes ───────────────────────────────────────────────────────────

export interface CampaignDeliverability {
  campaignId: string;
  counts: DeliverabilityCounts;
}

export interface WorkspaceDeliverability {
  classification: EventsClassification;
  days: number;
  since: string;
  totals: DeliverabilityAggregate;
  perCampaign: CampaignDeliverability[];
}

export interface SendingErrorRow {
  id: string;
  workspace_id: string;
  workspace_name: string | null;
  campaign_id: string | null;
  recipient: string | null;
  subject: string | null;
  status: string;
  error: string | null;
  sent_at: string;
}

export interface AdminWebhookLogEntry extends WebhookLogEntry {
  workspace_name: string | null;
}

export interface PlatformDeliverability {
  classification: EventsClassification;
  days: number;
  since: string;
  totals: DeliverabilityAggregate;
  webhookLog: AdminWebhookLogEntry[];
  sendingErrors: SendingErrorRow[];
  replySync: ReplySyncStatus;
}

function perCampaignFrom(
  events: EmailEventRecord[],
  links: MessageLink[],
  workspaceId: string | null
): CampaignDeliverability[] {
  const campaignIds = new Map<string, boolean>();
  for (const link of links) {
    if (workspaceId !== null && link.workspace_id !== workspaceId) continue;
    if (link.campaign_id) campaignIds.set(link.campaign_id, true);
  }
  return Array.from(campaignIds.keys()).map((campaignId) => ({
    campaignId,
    counts: aggregateEmailEvents(events, links, {
      workspaceId,
      campaignId,
    }).counts,
  }));
}

// ── Live (Supabase) loaders ─────────────────────────────────────────────────

type Row = Record<string, unknown>;

function rowToLink(row: Row): MessageLink {
  return {
    provider_message_id: String(row.provider_message_id),
    workspace_id: String(row.workspace_id),
    campaign_id: (row.campaign_id as string | null) ?? null,
    direction: String(row.direction ?? "outbound"),
    status: String(row.status ?? ""),
    is_demo: Boolean(row.is_demo),
  };
}

function rowToEvent(row: Row): EmailEventRecord {
  return {
    provider_event_id: String(row.provider_event_id),
    event_type: String(row.event_type),
    provider_message_id: (row.provider_message_id as string | null) ?? null,
    received_at: String(row.received_at),
    payload: row.payload ?? undefined,
  };
}

async function fetchEventsForMessageIds(
  admin: SupabaseClient,
  ids: string[],
  since: string
): Promise<EmailEventRecord[]> {
  const events: EmailEventRecord[] = [];
  const CHUNK = 400;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("email_events")
      .select("provider_event_id, event_type, provider_message_id, payload, received_at")
      .in("provider_message_id", chunk)
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(`Failed to read email events: ${error.message}`);
    events.push(...((data ?? []) as Row[]).map(rowToEvent));
  }
  return events;
}

async function fetchLinksForMessageIds(
  admin: SupabaseClient,
  ids: string[]
): Promise<MessageLink[]> {
  const links: MessageLink[] = [];
  const CHUNK = 400;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("messages")
      .select("provider_message_id, workspace_id, campaign_id, direction, status, is_demo")
      .in("provider_message_id", chunk);
    if (error) throw new Error(`Failed to read messages: ${error.message}`);
    links.push(...((data ?? []) as Row[]).map(rowToLink));
  }
  return links;
}

async function workspaceNames(
  admin: SupabaseClient,
  ids: string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return names;
  const { data } = await admin
    .from("workspaces")
    .select("id, name")
    .in("id", unique);
  for (const row of (data ?? []) as Row[]) {
    names.set(String(row.id), String(row.name ?? "Workspace"));
  }
  return names;
}

/**
 * Workspace-scoped deliverability. `workspaceId` MUST come from the
 * caller's server-side session context (the route does this) — never
 * from the request.
 */
export async function loadWorkspaceDeliverability(
  admin: SupabaseClient,
  workspaceId: string,
  days: number
): Promise<WorkspaceDeliverability> {
  const since = sinceForDays(days);
  const { data: msgRows, error } = await admin
    .from("messages")
    .select("provider_message_id, workspace_id, campaign_id, direction, status, is_demo")
    .eq("workspace_id", workspaceId)
    .not("provider_message_id", "is", null)
    .limit(5000);
  if (error) throw new Error(`Failed to read messages: ${error.message}`);
  const links = ((msgRows ?? []) as Row[]).map(rowToLink);
  const ids = links.map((l) => l.provider_message_id);
  const events =
    ids.length > 0 ? await fetchEventsForMessageIds(admin, ids, since) : [];
  return {
    classification: "provider",
    days,
    since,
    totals: aggregateEmailEvents(events, links, { workspaceId }),
    perCampaign: perCampaignFrom(events, links, workspaceId),
  };
}

/** Platform-wide deliverability for the admin console (admin-gated by the route). */
export async function loadPlatformDeliverability(
  admin: SupabaseClient,
  days: number
): Promise<PlatformDeliverability> {
  const since = sinceForDays(days);
  const { data: eventRows, error } = await admin
    .from("email_events")
    .select("provider_event_id, event_type, provider_message_id, payload, received_at")
    .gte("received_at", since)
    .order("received_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(`Failed to read email events: ${error.message}`);
  const events = ((eventRows ?? []) as Row[]).map(rowToEvent);

  const ids = Array.from(
    new Set(events.map((e) => e.provider_message_id).filter(Boolean))
  ) as string[];
  const links = ids.length > 0 ? await fetchLinksForMessageIds(admin, ids) : [];

  const { data: errRows } = await admin
    .from("messages")
    .select("id, workspace_id, campaign_id, lead_id, subject, status, error, sent_at")
    .or("error.not.is.null,status.eq.error")
    .order("sent_at", { ascending: false })
    .limit(50);
  const errorList = (errRows ?? []) as Row[];

  const leadIds = Array.from(
    new Set(errorList.map((r) => r.lead_id).filter(Boolean))
  ) as string[];
  const emailByLead = new Map<string, string>();
  if (leadIds.length > 0) {
    const { data: leadRows } = await admin
      .from("leads")
      .select("id, email")
      .in("id", leadIds);
    for (const row of (leadRows ?? []) as Row[]) {
      emailByLead.set(String(row.id), String(row.email ?? ""));
    }
  }

  const names = await workspaceNames(admin, [
    ...links.map((l) => l.workspace_id),
    ...errorList.map((r) => String(r.workspace_id)),
  ]);

  return {
    classification: "provider",
    days,
    since,
    totals: aggregateEmailEvents(events, links, {}),
    webhookLog: shapeWebhookLog(events, links, 50).map((entry) => ({
      ...entry,
      workspace_name: entry.workspace_id
        ? (names.get(entry.workspace_id) ?? null)
        : null,
    })),
    sendingErrors: errorList.map((r) => ({
      id: String(r.id),
      workspace_id: String(r.workspace_id),
      workspace_name: names.get(String(r.workspace_id)) ?? null,
      campaign_id: (r.campaign_id as string | null) ?? null,
      recipient: r.lead_id ? (emailByLead.get(String(r.lead_id)) ?? null) : null,
      subject: (r.subject as string | null) ?? null,
      status: String(r.status ?? ""),
      error: (r.error as string | null) ?? null,
      sent_at: String(r.sent_at),
    })),
    replySync: deriveReplySyncStatus(
      events,
      links,
      isConfiguredValue(process.env.RESEND_WEBHOOK_SECRET)
    ),
  };
}

// ── Demo loaders ────────────────────────────────────────────────────────────

interface DemoEmailData {
  events: EmailEventRecord[];
  links: MessageLink[];
  /** Recorded log entries (received simulations) with routing/detail. */
  recorded: ReturnType<typeof listDemoEmailEvents>;
  history: Awaited<ReturnType<typeof listMessageHistory>>;
}

async function loadDemoEmailData(): Promise<DemoEmailData> {
  const inbox = getInboxRepository();
  const history = await listMessageHistory(inbox, DEMO_WORKSPACE_ID, 1000);
  const derived = deriveSimulatedEmailData(history);
  const recorded = listDemoEmailEvents();
  const recordedKeys = new Set(
    recorded.map((e) => `${e.event_type}:${e.provider_message_id ?? ""}`)
  );
  const events: EmailEventRecord[] = [
    ...recorded.map((e) => ({
      provider_event_id: e.provider_event_id,
      event_type: e.event_type,
      provider_message_id: e.provider_message_id,
      received_at: e.received_at,
      payload: e.payload,
    })),
    ...derived.events.filter(
      (e) => !recordedKeys.has(`${e.event_type}:${e.provider_message_id ?? ""}`)
    ),
  ];
  return { events, links: derived.links, recorded, history };
}

export async function loadDemoWorkspaceDeliverability(
  days: number
): Promise<WorkspaceDeliverability> {
  const { events, links } = await loadDemoEmailData();
  const since = sinceForDays(days);
  return {
    classification: "simulated",
    days,
    since,
    totals: aggregateEmailEvents(events, links, {
      workspaceId: DEMO_WORKSPACE_ID,
      since,
    }),
    perCampaign: perCampaignFrom(
      events.filter((e) => e.received_at >= since),
      links,
      DEMO_WORKSPACE_ID
    ),
  };
}

export async function loadDemoPlatformDeliverability(
  days: number
): Promise<PlatformDeliverability> {
  const { events, links, recorded, history } = await loadDemoEmailData();
  const since = sinceForDays(days);
  const inWindow = events.filter((e) => e.received_at >= since);
  const recordedByKey = new Map(
    recorded.map((e) => [`${e.event_type}:${e.provider_message_id ?? ""}`, e])
  );

  const webhookLog: AdminWebhookLogEntry[] = shapeWebhookLog(inWindow, links, 50).map(
    (entry) => {
      const rec = recordedByKey.get(
        `${entry.event_type}:${entry.provider_message_id ?? ""}`
      );
      return {
        ...entry,
        // A recorded simulation knows its routing outcome even when
        // no message exists to link (the unrouted case).
        routing:
          rec?.routing ??
          (entry.routing === "linked" ? "linked" : entry.routing),
        detail: rec?.detail ?? entry.detail,
        workspace_name: entry.workspace_id ? "Alex Vance's Workspace (Demo)" : null,
      };
    }
  );

  const sendingErrors: SendingErrorRow[] = history
    .filter((m) => m.error)
    .map((m) => ({
      id: m.id,
      workspace_id: m.workspace_id,
      workspace_name: "Alex Vance's Workspace (Demo)",
      campaign_id: m.campaign_id ?? null,
      recipient: m.contact_email || null,
      subject: m.subject ?? null,
      status: m.status,
      error: m.error ?? null,
      sent_at: m.sent_at,
    }));

  return {
    classification: "simulated",
    days,
    since,
    totals: aggregateEmailEvents(inWindow, links, {}),
    webhookLog,
    sendingErrors,
    replySync: deriveReplySyncStatus(
      inWindow,
      links,
      isConfiguredValue(process.env.RESEND_WEBHOOK_SECRET)
    ),
  };
}
