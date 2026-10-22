/**
 * Admin platform service (server-only) — Round-2 Stage D.
 *
 * One service layer behind every /api/admin/* route added in this
 * stage. Each function branches on the data mode:
 *   - "demo": serves the labelled in-process demo stores
 *     (src/lib/admin/demo-server-store.ts) — no database exists.
 *   - "supabase": reads/writes the real tables through the SERVICE
 *     ROLE client, after the caller passed the admin gate.
 *
 * Tenant-isolation note: these are PLATFORM-admin surfaces. Live-mode
 * reads deliberately span workspaces (that is what an admin console
 * is), they run only after requireAdminApi() verified the caller's
 * profile role server-side, and every cross-workspace row is labelled
 * with its workspace in the UI. User-facing (non-admin) reads never
 * use this module.
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { getDataMode, type DataMode } from "@/lib/data/mode";
import { isConfiguredValue } from "@/lib/env";
import { requireAdminApi, type AdminCaller } from "./server-auth";
import {
  demoAddSubmission,
  demoAppendAuditEntry,
  demoGetSettings,
  demoListAuditEntries,
  demoListJobRuns,
  demoListJobs,
  demoListSubmissions,
  demoSetSubmissionStatus,
  demoUpdateSettings,
  demoUsageSeeds,
} from "./demo-server-store";
import {
  filterAuditEntries,
  shapeAuditRow,
  type AuditEntry,
  type AuditFilters,
} from "./audit-core";
import {
  DEFAULT_ADMIN_SETTINGS,
  diffSettings,
  toPublicSettings,
  validateSettingsUpdate,
  type AdminSettings,
  type PublicSettings,
} from "./settings-core";
import type { Submission } from "./submissions-core";
import { buildUsageRow, type WorkspaceUsageRow } from "./usage-core";
import {
  mergeNotifications,
  type AdminNotification,
} from "./notifications-core";
import {
  aggregateHealth,
  type HealthCheck,
  type HealthSummary,
} from "./health-core";
import { getIntegrationStatuses } from "@/lib/integrations-center/status";
import { getEmailState } from "@/lib/email/state";
import { getBillingState } from "@/lib/billing/state";
import { PLAN_CATALOG } from "@/lib/billing/plans";
import { MOCK_ADMIN_SUBSCRIPTIONS, MOCK_CAMPAIGNS, MOCK_LEADS } from "@/lib/db/mock/data";
import type { JobRecord, JobRunRecord } from "@/lib/jobs/types";
import type { Campaign, Lead, PlanType } from "@/types";

// ── Gate ────────────────────────────────────────────────────────────────────

export type AdminGate =
  | { mode: "demo"; caller: null }
  | { mode: "supabase"; caller: AdminCaller }
  | { response: NextResponse };

/**
 * The Stage-D gate, mirroring /api/integrations/status semantics:
 * Demo Mode has no sessions by design, so admin APIs serve the demo
 * stores; live mode defers to requireAdminApi() (503/401/403 ladder).
 */
export async function resolveAdminGate(): Promise<AdminGate> {
  if (getDataMode() === "demo") return { mode: "demo", caller: null };
  const gate = await requireAdminApi();
  if ("response" in gate) return { response: gate.response };
  return { mode: "supabase", caller: gate.caller };
}

export function adminClientOr503(): SupabaseClient | NextResponse {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Service role is not configured on the server." },
      { status: 503 }
    );
  }
  return admin;
}

// ── Env presence (names + booleans ONLY — values never leave the server) ────

export interface EnvPresence {
  name: string;
  present: boolean;
  visibility: "public" | "server";
  purpose: string;
}

const ENV_CATALOG: Array<Omit<EnvPresence, "present">> = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", visibility: "public", purpose: "Supabase project URL (database + auth)" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", visibility: "public", purpose: "Supabase anon key (RLS-scoped client access)" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", visibility: "server", purpose: "Supabase service role (admin APIs, webhooks, jobs) — bypasses RLS" },
  { name: "NEXT_PUBLIC_APP_URL", visibility: "public", purpose: "Public app URL for auth redirects and Stripe return URLs" },
  { name: "ADMIN_BOOTSTRAP_SECRET", visibility: "server", purpose: "One-time super-admin bootstrap (remove after use)" },
  { name: "RESEND_API_KEY", visibility: "server", purpose: "Resend email sending" },
  { name: "RESEND_WEBHOOK_SECRET", visibility: "server", purpose: "Verifies Resend webhook signatures" },
  { name: "STRIPE_SECRET_KEY", visibility: "server", purpose: "Stripe API (checkout, portal)" },
  { name: "STRIPE_WEBHOOK_SECRET", visibility: "server", purpose: "Verifies Stripe webhook signatures" },
  { name: "OPENAI_API_KEY", visibility: "server", purpose: "OpenAI models for AI drafting" },
  { name: "ANTHROPIC_API_KEY", visibility: "server", purpose: "Anthropic Claude models for AI drafting" },
  { name: "MODEL_API_KEY", visibility: "server", purpose: "Meta Model API (Muse Spark) for AI drafting" },
  { name: "NEXT_PUBLIC_META_PIXEL_ID", visibility: "public", purpose: "Meta Pixel ID (marketing analytics, consent-gated)" },
  { name: "CRON_SECRET", visibility: "server", purpose: "Authenticates the background-jobs worker endpoint" },
  { name: "INTEGRATION_HUB_ENCRYPTION_KEY", visibility: "server", purpose: "Integration Hub credential vault key (migration 016)" },
];

export function getEnvPresence(): EnvPresence[] {
  return ENV_CATALOG.map((entry) => ({
    ...entry,
    present: isConfiguredValue(process.env[entry.name]),
  }));
}

// ── Audit ───────────────────────────────────────────────────────────────────

export async function recordAdminAudit(input: {
  mode: DataMode;
  actorId: string | null;
  actorEmail: string;
  action: string;
  resource: string;
  details: string;
}): Promise<void> {
  if (input.mode === "demo") {
    demoAppendAuditEntry({
      actor: input.actorEmail,
      action: input.action,
      resource: input.resource,
      details: input.details,
    });
    return;
  }
  const admin = createAdminClient();
  if (!admin) return;
  const { error } = await admin.from("audit_logs").insert({
    actor_id: input.actorId,
    action: input.action,
    resource: input.resource,
    metadata: {
      actor_email: input.actorEmail,
      details: input.details,
      timestamp: new Date().toISOString(),
    },
  });
  if (error) {
    // The mutation already committed; surface loudly in server logs
    // rather than failing the request after the fact (same policy as
    // the Stage-2b reference mutation).
    console.error("[Admin] Audit log write failed:", error);
  }
}

export async function listAuditEntries(
  mode: DataMode,
  filters: AuditFilters
): Promise<AuditEntry[]> {
  if (mode === "demo") {
    return filterAuditEntries(demoListAuditEntries(), filters);
  }
  const admin = adminClientOr503();
  if (admin instanceof NextResponse) throw new Error("Service role is not configured.");
  const { data, error } = await admin
    .from("audit_logs")
    .select("id, actor_id, action, resource, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(`Failed to load audit logs: ${error.message}`);
  const entries = (data ?? []).map((row) =>
    shapeAuditRow(row as Record<string, unknown>)
  );
  return filterAuditEntries(entries, filters);
}

// ── Submissions ─────────────────────────────────────────────────────────────

export async function createSubmissionRecord(input: {
  source: Submission["source"];
  name: string;
  email: string;
  company: string | null;
  subject: string | null;
  message: string;
  meta: Record<string, unknown>;
}): Promise<{ id: string; mode: DataMode }> {
  const mode = getDataMode();
  if (mode === "demo") {
    const record = demoAddSubmission(input);
    return { id: record.id, mode };
  }
  const admin = createAdminClient();
  if (!admin) throw new Error("Service role is not configured.");
  const { data, error } = await admin
    .from("submissions")
    .insert({
      source: input.source,
      name: input.name,
      email: input.email,
      company: input.company,
      subject: input.subject,
      message: input.message,
      meta: input.meta,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Failed to store submission: ${error?.message ?? "no row"}`);
  }
  return { id: String(data.id), mode };
}

export async function listSubmissions(mode: DataMode): Promise<Submission[]> {
  if (mode === "demo") return demoListSubmissions();
  const admin = adminClientOr503();
  if (admin instanceof NextResponse) throw new Error("Service role is not configured.");
  const { data, error } = await admin
    .from("submissions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Failed to load submissions: ${error.message}`);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      source: r.source === "demo" ? "demo" : "contact",
      name: String(r.name ?? ""),
      email: String(r.email ?? ""),
      company: (r.company as string | null) ?? null,
      subject: (r.subject as string | null) ?? null,
      message: String(r.message ?? ""),
      meta: (r.meta as Record<string, unknown>) ?? {},
      status: r.status === "read" ? "read" : "unread",
      created_at: String(r.created_at),
    } satisfies Submission;
  });
}

export async function setSubmissionStatus(
  mode: DataMode,
  id: string,
  status: Submission["status"]
): Promise<boolean> {
  if (mode === "demo") return demoSetSubmissionStatus(id, status) !== null;
  const admin = adminClientOr503();
  if (admin instanceof NextResponse) return false;
  const { error } = await admin.from("submissions").update({ status }).eq("id", id);
  return !error;
}

// ── Settings ────────────────────────────────────────────────────────────────

function rowToSettings(row: Record<string, unknown>): AdminSettings {
  return {
    site_name: String(row.site_name ?? DEFAULT_ADMIN_SETTINGS.site_name),
    support_email: String(row.support_email ?? DEFAULT_ADMIN_SETTINGS.support_email),
    demo_banner_enabled: row.demo_banner_enabled !== false,
    signups_open: row.signups_open !== false,
    default_daily_connections: Number(
      row.default_daily_connections ?? DEFAULT_ADMIN_SETTINGS.default_daily_connections
    ),
    default_daily_messages: Number(
      row.default_daily_messages ?? DEFAULT_ADMIN_SETTINGS.default_daily_messages
    ),
    updated_at: (row.updated_at as string | null) ?? null,
    updated_by: (row.updated_by as string | null) ?? null,
  };
}

export async function getAdminSettings(mode: DataMode): Promise<AdminSettings> {
  if (mode === "demo") return demoGetSettings();
  const admin = createAdminClient();
  if (!admin) return { ...DEFAULT_ADMIN_SETTINGS };
  const { data } = await admin
    .from("admin_settings")
    .select("*")
    .eq("id", "global")
    .maybeSingle();
  if (!data) return { ...DEFAULT_ADMIN_SETTINGS };
  return rowToSettings(data as Record<string, unknown>);
}

export async function getPublicSettings(): Promise<PublicSettings & { mode: DataMode }> {
  const mode = getDataMode();
  const settings = await getAdminSettings(mode);
  return { ...toPublicSettings(settings), mode };
}

export async function updateAdminSettings(input: {
  mode: DataMode;
  body: Record<string, unknown>;
  actorId: string | null;
  actorEmail: string;
}): Promise<
  | { ok: true; settings: AdminSettings; changed: string[] }
  | { ok: false; errors: Record<string, string> }
> {
  const current = await getAdminSettings(input.mode);
  const validation = validateSettingsUpdate(input.body, current);
  if (!validation.ok) return { ok: false, errors: validation.errors };

  const diff = diffSettings(current, validation.value);
  const changed = Object.keys(diff);
  if (changed.length === 0) {
    return { ok: true, settings: current, changed: [] };
  }

  let saved: AdminSettings;
  if (input.mode === "demo") {
    saved = demoUpdateSettings(validation.value, input.actorId);
  } else {
    const admin = createAdminClient();
    if (!admin) throw new Error("Service role is not configured.");
    const { data, error } = await admin
      .from("admin_settings")
      .upsert({
        id: "global",
        ...validation.value,
        updated_by: input.actorId,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error || !data) {
      throw new Error(`Failed to save settings: ${error?.message ?? "no row"}`);
    }
    saved = rowToSettings(data as Record<string, unknown>);
  }

  await recordAdminAudit({
    mode: input.mode,
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    action: "SETTINGS_UPDATE",
    resource: "settings:global",
    details: `Updated platform settings: ${changed.join(", ")}`,
  });

  return { ok: true, settings: saved, changed };
}

// ── Queue & Workers ─────────────────────────────────────────────────────────

export interface QueueOverview {
  mode: DataMode;
  cronConfigured: boolean;
  counts: Record<string, number>;
  jobs: JobRecord[];
  recentRuns: Array<JobRunRecord & { job_type: string | null }>;
  lastRunAt: string | null;
}

export async function getQueueOverview(mode: DataMode): Promise<QueueOverview> {
  const cronConfigured = isConfiguredValue(process.env.CRON_SECRET);
  if (mode === "demo") {
    const jobs = demoListJobs();
    const runs = demoListJobRuns();
    const counts: Record<string, number> = {};
    for (const j of jobs) counts[j.status] = (counts[j.status] ?? 0) + 1;
    const typeById = new Map(jobs.map((j) => [j.id, j.type]));
    return {
      mode,
      cronConfigured,
      counts,
      jobs,
      recentRuns: runs.map((r) => ({ ...r, job_type: typeById.get(r.job_id) ?? null })),
      lastRunAt: runs[0]?.started_at ?? null,
    };
  }
  const admin = adminClientOr503();
  if (admin instanceof NextResponse) throw new Error("Service role is not configured.");

  const { data: jobRows, error: jobsError } = await admin
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (jobsError) throw new Error(`Failed to load jobs: ${jobsError.message}`);
  const jobs: JobRecord[] = (jobRows ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      workspace_id: (r.workspace_id as string | null) ?? null,
      type: String(r.type),
      payload: (r.payload as Record<string, unknown>) ?? {},
      idempotency_key: String(r.idempotency_key),
      status: r.status as JobRecord["status"],
      attempts: Number(r.attempts ?? 0),
      max_attempts: Number(r.max_attempts ?? 3),
      run_after: String(r.run_after),
      last_error: (r.last_error as string | null) ?? null,
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
      completed_at: (r.completed_at as string | null) ?? null,
    };
  });
  const counts: Record<string, number> = {};
  for (const j of jobs) counts[j.status] = (counts[j.status] ?? 0) + 1;

  const { data: runRows } = await admin
    .from("job_runs")
    .select("*, jobs(type)")
    .order("started_at", { ascending: false })
    .limit(20);
  const recentRuns = (runRows ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const job = r.jobs as { type?: string } | null;
    return {
      id: String(r.id),
      job_id: String(r.job_id),
      started_at: String(r.started_at),
      finished_at: (r.finished_at as string | null) ?? null,
      status: r.status as JobRunRecord["status"],
      message: String(r.message ?? ""),
      job_type: job?.type ?? null,
    };
  });

  return {
    mode,
    cronConfigured,
    counts,
    jobs,
    recentRuns,
    lastRunAt: recentRuns[0]?.started_at ?? null,
  };
}

// ── Usage & Credits ─────────────────────────────────────────────────────────

export async function getUsageOverview(mode: DataMode): Promise<WorkspaceUsageRow[]> {
  if (mode === "demo") {
    return demoUsageSeeds().map((seed) =>
      buildUsageRow({
        workspace_id: seed.workspace_id,
        workspace_name: seed.workspace_name,
        plan: seed.plan as PlanType,
        period_start: seed.period_start,
        metrics: seed.metrics,
      })
    );
  }
  const admin = adminClientOr503();
  if (admin instanceof NextResponse) throw new Error("Service role is not configured.");

  const { data: usageRows, error } = await admin
    .from("usage_records")
    .select("workspace_id, metric, period_start, quantity")
    .order("period_start", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`Failed to load usage records: ${error.message}`);

  const { data: workspaces } = await admin.from("workspaces").select("id, name, plan");
  const wsById = new Map(
    (workspaces ?? []).map((w) => {
      const r = w as Record<string, unknown>;
      return [String(r.id), { name: String(r.name ?? "Workspace"), plan: (r.plan as PlanType) ?? "free" }];
    })
  );

  // Keep only the latest period per workspace, accumulating its metrics.
  const latestPeriod = new Map<string, string>();
  for (const row of usageRows ?? []) {
    const r = row as Record<string, unknown>;
    const ws = String(r.workspace_id);
    const period = String(r.period_start);
    if (!latestPeriod.has(ws) || period > (latestPeriod.get(ws) as string)) {
      latestPeriod.set(ws, period);
    }
  }
  const metricsByWs = new Map<string, WorkspaceUsageRow["metrics"]>();
  for (const row of usageRows ?? []) {
    const r = row as Record<string, unknown>;
    const ws = String(r.workspace_id);
    if (String(r.period_start) !== latestPeriod.get(ws)) continue;
    const metrics = metricsByWs.get(ws) ?? {};
    metrics[String(r.metric) as keyof WorkspaceUsageRow["metrics"]] = Number(r.quantity ?? 0);
    metricsByWs.set(ws, metrics);
  }

  return Array.from(latestPeriod.entries()).map(([wsId, period]) => {
    const ws = wsById.get(wsId);
    return buildUsageRow({
      workspace_id: wsId,
      workspace_name: ws?.name ?? "Unknown workspace",
      plan: ws?.plan ?? "free",
      period_start: period,
      metrics: metricsByWs.get(wsId) ?? {},
    });
  });
}

// ── Billing (transactions / subscriptions / revenue) ────────────────────────

export interface BillingTransaction {
  id: string;
  provider: string;
  event_type: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  processed_at: string;
}

export interface BillingSubscriptionRow {
  id: string;
  workspace_name: string;
  owner_email: string | null;
  plan: PlanType;
  status: string;
  /** True only when a Stripe subscription id is attached (webhook-maintained). */
  stripe_linked: boolean;
  current_period_end: string | null;
}

export interface BillingOverview {
  mode: DataMode;
  stripeState: string;
  transactions: BillingTransaction[];
  subscriptions: BillingSubscriptionRow[];
  revenue: {
    /** Sum of plan prices for Stripe-linked active/trialing subscriptions. */
    mrr_usd: number;
    verified_subscriptions: number;
    note: string;
  };
}

export async function getBillingOverview(mode: DataMode): Promise<BillingOverview> {
  const stripeState = getBillingState();

  if (mode === "demo") {
    return {
      mode,
      stripeState,
      transactions: [],
      subscriptions: MOCK_ADMIN_SUBSCRIPTIONS.map((s) => ({
        id: s.id,
        workspace_name: s.workspaceName,
        owner_email: s.userEmail,
        plan: s.plan,
        status: s.status,
        stripe_linked: false,
        current_period_end: null,
      })),
      revenue: {
        mrr_usd: 0,
        verified_subscriptions: 0,
        note: "Demo Mode: no verified payments exist. Revenue is derived only from Stripe-linked subscription records, so nothing is counted here.",
      },
    };
  }

  const admin = adminClientOr503();
  if (admin instanceof NextResponse) throw new Error("Service role is not configured.");

  const { data: eventRows, error: eventsError } = await admin
    .from("billing_events")
    .select("event_id, provider, event_type, payload, processed_at")
    .order("processed_at", { ascending: false })
    .limit(100);
  if (eventsError) throw new Error(`Failed to load billing events: ${eventsError.message}`);

  const transactions: BillingTransaction[] = (eventRows ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const payload = (r.payload as Record<string, unknown>) ?? {};
    const data = (payload.data as Record<string, unknown>) ?? {};
    const object = (data.object as Record<string, unknown>) ?? {};
    const amountRaw = object.amount_total ?? object.amount_paid ?? object.amount;
    return {
      id: String(r.event_id),
      provider: String(r.provider ?? "stripe"),
      event_type: String(r.event_type),
      amount: typeof amountRaw === "number" ? amountRaw / 100 : null,
      currency: typeof object.currency === "string" ? object.currency : null,
      status: typeof object.status === "string" ? object.status : null,
      processed_at: String(r.processed_at),
    };
  });

  const { data: subRows } = await admin
    .from("subscriptions")
    .select("id, workspace_id, plan, status, stripe_subscription_id, current_period_end, workspaces(name, owner_id)")
    .order("created_at", { ascending: false })
    .limit(200);

  const ownerIds = Array.from(
    new Set(
      (subRows ?? [])
        .map((row) => {
          const ws = (row as Record<string, unknown>).workspaces as { owner_id?: string } | null;
          return ws?.owner_id;
        })
        .filter(Boolean)
    )
  ) as string[];
  const emailByOwner = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email")
      .in("id", ownerIds);
    for (const p of profiles ?? []) {
      const r = p as Record<string, unknown>;
      emailByOwner.set(String(r.id), String(r.email ?? ""));
    }
  }

  const subscriptions: BillingSubscriptionRow[] = (subRows ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const ws = r.workspaces as { name?: string; owner_id?: string } | null;
    return {
      id: String(r.id),
      workspace_name: ws?.name ?? "Unknown workspace",
      owner_email: ws?.owner_id ? (emailByOwner.get(ws.owner_id) ?? null) : null,
      plan: (r.plan as PlanType) ?? "free",
      status: String(r.status ?? "trialing"),
      stripe_linked: Boolean(r.stripe_subscription_id),
      current_period_end: (r.current_period_end as string | null) ?? null,
    };
  });

  const verified = subscriptions.filter(
    (s) => s.stripe_linked && (s.status === "active" || s.status === "trialing")
  );
  const mrr = verified.reduce(
    (sum, s) => sum + (PLAN_CATALOG[s.plan]?.monthlyPriceUsd ?? 0),
    0
  );

  return {
    mode,
    stripeState,
    transactions,
    subscriptions,
    revenue: {
      mrr_usd: mrr,
      verified_subscriptions: verified.length,
      note: "Derived from subscription records maintained by signature-verified Stripe webhooks. Subscriptions without a Stripe subscription id are never counted.",
    },
  };
}

// ── Cross-workspace campaigns / leads (platform-admin inspection) ──────────

export interface AdminCampaignRow extends Campaign {
  workspace_name: string;
}
export interface AdminLeadRow extends Lead {
  workspace_name: string;
}

const DEMO_WORKSPACE_NAME = "Alex Vance's Workspace (Demo)";

export async function listAdminCampaigns(mode: DataMode): Promise<AdminCampaignRow[]> {
  if (mode === "demo") {
    return MOCK_CAMPAIGNS.map((c) => ({ ...c, workspace_name: DEMO_WORKSPACE_NAME }));
  }
  const admin = adminClientOr503();
  if (admin instanceof NextResponse) throw new Error("Service role is not configured.");
  const { data, error } = await admin
    .from("campaigns")
    .select("*, workspaces(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Failed to load campaigns: ${error.message}`);
  return (data ?? []).map((row) => {
    const { workspaces, ...campaign } = row as Record<string, unknown> & {
      workspaces: { name?: string } | null;
    };
    return {
      ...(campaign as unknown as Campaign),
      workspace_name: workspaces?.name ?? "Unknown workspace",
    };
  });
}

export async function listAdminLeads(mode: DataMode): Promise<AdminLeadRow[]> {
  if (mode === "demo") {
    return MOCK_LEADS.map((l) => ({ ...l, workspace_name: DEMO_WORKSPACE_NAME }));
  }
  const admin = adminClientOr503();
  if (admin instanceof NextResponse) throw new Error("Service role is not configured.");
  const { data, error } = await admin
    .from("leads")
    .select("*, workspaces(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Failed to load leads: ${error.message}`);
  return (data ?? []).map((row) => {
    const { workspaces, ...lead } = row as Record<string, unknown> & {
      workspaces: { name?: string } | null;
    };
    return {
      ...(lead as unknown as Lead),
      workspace_name: workspaces?.name ?? "Unknown workspace",
    };
  });
}

export interface CrmSummary {
  totalLeads: number;
  workspaceCount: number;
  tags: Array<{ tag: string; count: number }>;
  perWorkspace: Array<{ workspace_name: string; leads: number }>;
  perStatus: Array<{ status: string; count: number }>;
}

export function summarizeCrm(leads: AdminLeadRow[]): CrmSummary {
  const tagCounts = new Map<string, number>();
  const wsCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  for (const lead of leads) {
    wsCounts.set(lead.workspace_name, (wsCounts.get(lead.workspace_name) ?? 0) + 1);
    statusCounts.set(lead.status, (statusCounts.get(lead.status) ?? 0) + 1);
    for (const tag of lead.tags ?? []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const byCountDesc = (a: { count: number }, b: { count: number }) => b.count - a.count;
  return {
    totalLeads: leads.length,
    workspaceCount: wsCounts.size,
    tags: Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort(byCountDesc),
    perWorkspace: Array.from(wsCounts.entries())
      .map(([workspace_name, count]) => ({ workspace_name, leads: count }))
      .sort((a, b) => b.leads - a.leads),
    perStatus: Array.from(statusCounts.entries())
      .map(([status, count]) => ({ status, count }))
      .sort(byCountDesc),
  };
}

// ── Notifications (derived) ─────────────────────────────────────────────────

export async function getAdminNotifications(mode: DataMode): Promise<AdminNotification[]> {
  const groups: AdminNotification[][] = [];

  const audit = await listAuditEntries(mode, {}).catch(() => [] as AuditEntry[]);
  groups.push(
    audit.slice(0, 10).map((entry) => ({
      id: `audit:${entry.id}`,
      source: "audit" as const,
      severity: "info" as const,
      title: entry.action,
      detail: `${entry.actor} — ${entry.details || entry.resource || ""}`,
      created_at: entry.created_at,
    }))
  );

  if (mode === "demo") {
    const runs = demoListJobRuns().filter((r) => r.status === "failed");
    groups.push(
      runs.map((run) => ({
        id: `jobs:${run.id}`,
        source: "jobs" as const,
        severity: "critical" as const,
        title: "Job run failed",
        detail: run.message,
        created_at: run.started_at,
      }))
    );
    return mergeNotifications(groups);
  }

  const admin = adminClientOr503();
  if (!(admin instanceof NextResponse)) {
    const { data: failedRuns } = await admin
      .from("job_runs")
      .select("id, started_at, message, jobs(type)")
      .eq("status", "failed")
      .order("started_at", { ascending: false })
      .limit(10);
    groups.push(
      (failedRuns ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        const job = r.jobs as { type?: string } | null;
        return {
          id: `jobs:${String(r.id)}`,
          source: "jobs" as const,
          severity: "critical" as const,
          title: `Job run failed${job?.type ? ` (${job.type})` : ""}`,
          detail: String(r.message ?? ""),
          created_at: String(r.started_at),
        };
      })
    );

    const { data: failedDeliveries } = await admin
      .from("webhook_deliveries")
      .select("id, event_type, last_error, created_at")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(10);
    groups.push(
      (failedDeliveries ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: `webhooks:${String(r.id)}`,
          source: "webhooks" as const,
          severity: "warning" as const,
          title: `Webhook delivery failed (${String(r.event_type)})`,
          detail: String(r.last_error ?? "Delivery failed"),
          created_at: String(r.created_at),
        };
      })
    );
  }

  return mergeNotifications(groups);
}

// ── System Health ───────────────────────────────────────────────────────────

export async function getSystemHealth(mode: DataMode): Promise<HealthSummary> {
  const checks: HealthCheck[] = [];
  const statuses = getIntegrationStatuses({});
  const byId = new Map(statuses.map((s) => [s.descriptor.id, s]));

  if (mode === "demo") {
    checks.push({
      id: "database",
      label: "Database (Supabase)",
      status: "fail",
      required: true,
      message: "Not configured — the app is running in Demo Mode with no Supabase project connected.",
    });
  } else {
    const admin = createAdminClient();
    let dbOk = false;
    let dbMessage = "Service role client is not configured.";
    if (admin) {
      const { error } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true });
      dbOk = !error;
      dbMessage = error
        ? `Database probe failed: ${error.message}`
        : "Database reachable via the service role.";
    }
    checks.push({
      id: "database",
      label: "Database (Supabase)",
      status: dbOk ? "ok" : "fail",
      required: true,
      message: dbMessage,
    });
  }

  const supabaseStatus = byId.get("supabase");
  checks.push({
    id: "supabase-config",
    label: "Supabase configuration",
    status:
      mode === "supabase" ? "ok" : "fail",
    required: true,
    message:
      mode === "supabase"
        ? "Supabase URL and keys are configured."
        : (supabaseStatus?.statusMessage ?? "Supabase is not configured."),
  });

  const errorIntegrations = statuses.filter((s) => s.status === "Error");
  const verifiedCount = statuses.filter(
    (s) => s.status === "Connected and Verified"
  ).length;
  checks.push({
    id: "integrations",
    label: "Integrations",
    status: errorIntegrations.length > 0 ? "warning" : verifiedCount > 0 ? "ok" : "warning",
    required: false,
    message:
      errorIntegrations.length > 0
        ? `${errorIntegrations.length} integration(s) report an error state.`
        : verifiedCount > 0
          ? `${verifiedCount} integration(s) verified.`
          : "No integration has been verified yet (key presence alone never counts as verified).",
  });

  const emailState = getEmailState();
  checks.push({
    id: "email",
    label: "Email provider (Resend)",
    status: emailState === "connected" ? "ok" : "warning",
    required: false,
    message:
      emailState === "connected"
        ? "Resend API key is configured."
        : `Email sending is in "${emailState}" state — no live email can be sent.`,
  });

  const billingState = getBillingState();
  checks.push({
    id: "billing",
    label: "Billing (Stripe)",
    status: billingState === "connected" ? "ok" : "warning",
    required: false,
    message:
      billingState === "connected"
        ? "Stripe keys are configured."
        : `Stripe is in "${billingState}" state — checkout and portal refuse requests.`,
  });

  const queue = await getQueueOverview(mode).catch(() => null);
  const cronConfigured = isConfiguredValue(process.env.CRON_SECRET);
  checks.push({
    id: "jobs",
    label: "Background jobs worker",
    status: !cronConfigured ? "warning" : queue?.lastRunAt ? "ok" : "warning",
    required: false,
    message: !cronConfigured
      ? "CRON_SECRET is not set — /api/jobs/run refuses to run rather than run unauthenticated."
      : queue?.lastRunAt
        ? `Last recorded job run: ${queue.lastRunAt}.`
        : "Worker is configured but no job runs are recorded yet.",
  });

  const env = getEnvPresence();
  const missingServerSecrets = env.filter(
    (e) => e.visibility === "server" && !e.present
  ).length;
  checks.push({
    id: "env",
    label: "Environment configuration",
    status: missingServerSecrets === 0 ? "ok" : "warning",
    required: false,
    message:
      missingServerSecrets === 0
        ? "All catalogued server environment variables are present."
        : `${missingServerSecrets} server environment variable(s) are not set (see Configure Secrets for the list). Presence only — values are never displayed.`,
  });

  return aggregateHealth(checks);
}
