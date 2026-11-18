/**
 * Provider integration monitoring — admin server helpers (Wave 2, Phase 2).
 *
 * One aggregation layer behind GET /api/admin/integrations/monitoring
 * (overview + per-provider detail) and the provider disable switch.
 *
 * Honesty rules enforced here, not just in the routes:
 *   - Every number comes from a real table read. A table that cannot
 *     be read (migration not applied) is reported as UNKNOWN (null),
 *     never as zero.
 *   - Audit-log coverage is per-provider ONLY where a real audit
 *     prefix exists. The REST platforms write `<platform>.*` actions
 *     (src/lib/integrations/rest/audit.ts) and the MCP adapter writes
 *     `muse.tool.*` for ALL THREE MCP clients (Muse, ChatGPT, Claude
 *     share one adapter — src/lib/muse-connector/adapter.ts — so
 *     ChatGPT/Claude tool calls cannot be split out of `muse.tool.*`
 *     and are attributed to "muse" with a note). The 60+ config-ready
 *     adapters write NO audit rows at all, so their API counts are
 *     null with `auditTracked: false`, never invented zeros.
 *   - Webhook deliveries live in the shared `zapier_webhook_*`
 *     tables with a `platform` discriminator (migrations 025/029/031)
 *     covering only the six REST platforms (zapier, n8n, make,
 *     pabbly, albato, activepieces). Other providers have no webhook
 *     data: `webhookTracked: false`.
 *   - Sync jobs come from `integration_sync_jobs` (migration 030)
 *     and usage from `integration_usage` (migration 030) — both
 *     recorded only where an adapter actually ran / recorded usage.
 *   - NEVER select credential material: `integration_connections`
 *     is read with an explicit safe column list (the
 *     `encrypted_credentials` column is never selected), the
 *     webhook `secret` is never selected, and `nxtsend_api_keys`
 *     hashes are never read here at all (key counts stay on the
 *     existing /api/admin/n8n page).
 *
 * Provider disable switch (migration 038, `provider_disabled_flags`):
 * the flag table is the source of truth for the toggle UI and for
 * `assertProviderEnabled()` — the enforcement hook the shared REST
 * auth gate calls before accepting a call. Enforcement IS wired:
 * `resolveRestContext()` (src/lib/integrations/rest/auth.ts) calls
 * `assertProviderEnabled()` before any credential check, so a
 * disabled automation platform (zapier, n8n, make, pabbly, albato,
 * activepieces) refuses every REST call with 503 provider_disabled.
 * The workspace connect flow for the 60+ config-ready adapters does
 * not call it yet, so other providers' flags are recorded and shown
 * but not yet enforced there. The monitoring pages always show the
 * flag, and a disabled provider is never shown as healthy.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PROVIDER_DEFINITIONS,
  getProviderDefinition,
} from "@/lib/integrations/providers/registry";
import type {
  ProviderCategory,
  ProviderDefinition,
} from "@/lib/integrations/providers/types";

// ── Provider groups (registry categories, for the admin group pages) ───────

export interface ProviderGroup {
  id: ProviderCategory;
  /** URL slug under /admin/integrations/ (also the group page). */
  slug: string;
  label: string;
  description: string;
  providers: ProviderDefinition[];
}

const GROUP_META: Array<{
  id: ProviderCategory;
  slug: string;
  label: string;
  description: string;
}> = [
  {
    id: "crm",
    slug: "crm",
    label: "CRM",
    description:
      "Customer-relationship providers — stored connections, sync jobs and errors, platform-wide.",
  },
  {
    id: "email_outreach",
    slug: "email-outreach",
    label: "Email outreach",
    description:
      "Outbound email providers — stored connections, sync jobs and errors, platform-wide.",
  },
  {
    id: "enrichment",
    slug: "enrichment",
    label: "Lead enrichment",
    description:
      "Enrichment providers — stored connections, sync jobs and errors, platform-wide.",
  },
  {
    id: "email_verification",
    slug: "verification",
    label: "Email verification",
    description:
      "Email-verification providers — stored connections, sync jobs and errors, platform-wide.",
  },
  {
    id: "automation",
    slug: "automation",
    label: "Automation",
    description:
      "Automation platforms (Zapier, n8n, Make, Pabbly, Albato, Activepieces) — grants, webhooks, deliveries and audit, platform-wide.",
  },
  {
    id: "communication",
    slug: "communication",
    label: "Communication",
    description:
      "Chat and messaging providers — stored connections, sync jobs and errors, platform-wide.",
  },
  {
    id: "productivity",
    slug: "productivity",
    label: "Productivity",
    description:
      "Productivity providers — stored connections, sync jobs and errors, platform-wide.",
  },
  {
    id: "ai",
    slug: "ai",
    label: "AI",
    description:
      "AI MCP clients and assistants — stored connections, sync jobs and errors, platform-wide. Muse, ChatGPT and Claude grants live on the Muse.ai page; their tool calls share the muse.tool.* audit prefix.",
  },
];

export const PROVIDER_GROUPS: ProviderGroup[] = GROUP_META.map((meta) => ({
  ...meta,
  providers: PROVIDER_DEFINITIONS.filter((d) => d.category === meta.id),
}));

export function getProviderGroup(slug: string): ProviderGroup | null {
  return PROVIDER_GROUPS.find((g) => g.slug === slug) ?? null;
}

// ── Audit prefixes ──────────────────────────────────────────────────────────

/**
 * Providers whose API activity is visible in `audit_logs`, by the
 * action prefix their recorder writes. ChatGPT and Claude are
 * deliberately ABSENT: their MCP tool calls are recorded as
 * `muse.tool.*` by the shared adapter, so they cannot be split out
 * and are attributed to "muse" (see `auditNoteForProvider`).
 */
export const AUDIT_PREFIX_BY_PROVIDER: Record<string, string> = {
  muse: "muse.tool.",
  zapier: "zapier.",
  n8n: "n8n.",
  make: "make.",
  pabbly: "pabbly.",
  albato: "albato.",
  activepieces: "activepieces.",
};

/** REST platforms whose webhook deliveries live in the shared outbox. */
export const WEBHOOK_TRACKED_PROVIDERS = [
  "zapier",
  "n8n",
  "make",
  "pabbly",
  "albato",
  "activepieces",
] as const;

export function auditNoteForProvider(providerId: string): string | null {
  if (providerId === "chatgpt" || providerId === "claude") {
    return "Tool calls for this client are recorded under the shared muse.tool.* audit prefix and cannot be split out per client — see the Muse.ai page.";
  }
  if (providerId in AUDIT_PREFIX_BY_PROVIDER) return null;
  return "This provider's adapters do not write audit-log entries, so no API-call or error counts exist for it.";
}

// ── Row shapes (safe to serialise — no credential material anywhere) ───────

export interface ProviderConnectionSummary {
  workspaceId: string;
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderAuditEntry {
  action: string;
  resource: string | null;
  details: string;
  createdAt: string;
}

export interface ProviderDeliverySummary {
  id: string;
  event: string;
  subscriptionId: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  nextRetryAt: string | null;
  createdAt: string;
}

export interface ProviderSyncJobSummary {
  id: string;
  workspaceId: string;
  direction: string;
  status: string;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  createdAt: string;
  finishedAt: string | null;
}

export interface ProviderUsageSummary {
  event: string;
  creditsUsed: number;
  recordedAt: string;
}

export interface ProviderMonitoringRow {
  id: string;
  name: string;
  category: ProviderCategory;
  authType: ProviderDefinition["authType"];
  docsUrl: string | null;
  capabilities: string[];
  twoWaySync: boolean;
  disabled: boolean;
  disabledReason: string | null;
  disabledAt: string | null;
  disabledBy: string | null;
  /** Distinct workspaces with a stored connection in "connected" status. */
  connectedWorkspaces: number;
  connectionCount: number;
  connectionsByStatus: Record<string, number>;
  errorConnections: number;
  lastSyncAt: string | null;
  lastError: string | null;
  /** True only when this provider writes audit rows (see AUDIT_PREFIX_BY_PROVIDER). */
  auditTracked: boolean;
  auditNote: string | null;
  /** Null when not tracked; counts are real audit rows in the window. */
  apiCalls24h: number | null;
  apiCalls7d: number | null;
  apiErrors24h: number | null;
  apiErrors7d: number | null;
  webhookTracked: boolean;
  webhookSubscriptions: number | null;
  deliveryCounts: { pending: number; delivered: number; failed: number; dead: number } | null;
  /** Null when the sync-jobs table could not be read (unknown, not zero). */
  syncJobs7d: { total: number; completed: number; failed: number; pending: number } | null;
  lastSyncJob: ProviderSyncJobSummary | null;
  /** Null when the usage table could not be read (unknown, not zero). */
  usage7d: { events: number; credits: number } | null;
}

export interface MonitoringTotals {
  providers: number;
  disabled: number;
  connectedWorkspaces: number;
  errorConnections: number;
  apiErrors24h: number;
  apiErrors7d: number;
  deadDeliveries: number;
  syncJobsFailed7d: number;
}

export interface MonitoringOverview {
  providers: ProviderMonitoringRow[];
  totals: MonitoringTotals;
  /** True when the disable-flag table could not be read (migration 038 not applied). */
  disabledFlagsUnknown: boolean;
  /** Tables that could not be read — their numbers are null, never zero. */
  unknownTables: string[];
  checkedAt: string;
}

export interface ProviderMonitoringDetail {
  provider: ProviderMonitoringRow;
  connections: ProviderConnectionSummary[];
  audit: ProviderAuditEntry[];
  deliveries: ProviderDeliverySummary[];
  syncJobs: ProviderSyncJobSummary[];
  usage: ProviderUsageSummary[];
}

// ── Pure aggregation (unit-tested, no I/O) ──────────────────────────────────

type Row = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function isAuditErrorDetails(details: string): boolean {
  const lower = details.toLowerCase();
  return (
    lower.includes("fail") ||
    lower.includes("error") ||
    lower.includes("denied") ||
    lower.includes("refused")
  );
}

export interface AuditSummary {
  calls24h: number;
  calls7d: number;
  errors24h: number;
  errors7d: number;
  recent: ProviderAuditEntry[];
}

/**
 * Aggregates raw `audit_logs` rows (action, resource, metadata,
 * created_at) for ONE provider prefix over the 24h / 7d windows.
 * Rows outside the 7d window are ignored; the recent list is capped
 * at 20, newest first (callers pass rows already ordered desc).
 */
export function summarizeAuditRows(
  rows: Row[],
  prefix: string,
  nowMs: number
): AuditSummary {
  const day = 24 * 60 * 60 * 1000;
  const out: AuditSummary = { calls24h: 0, calls7d: 0, errors24h: 0, errors7d: 0, recent: [] };
  for (const row of rows) {
    const action = String(row.action ?? "");
    if (!action.startsWith(prefix)) continue;
    const createdAt = asString(row.created_at);
    const ts = createdAt ? Date.parse(createdAt) : NaN;
    if (Number.isNaN(ts)) continue;
    if (nowMs - ts > 7 * day) continue;
    const metadata =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {};
    const details = typeof metadata.details === "string" ? metadata.details : "";
    const entry: ProviderAuditEntry = {
      action,
      resource: (row.resource as string | null) ?? null,
      details,
      createdAt: createdAt ?? new Date(ts).toISOString(),
    };
    const isError = isAuditErrorDetails(details);
    out.calls7d += 1;
    if (isError) out.errors7d += 1;
    if (nowMs - ts <= day) {
      out.calls24h += 1;
      if (isError) out.errors24h += 1;
    }
    if (out.recent.length < 20) out.recent.push(entry);
  }
  return out;
}

export interface ConnectionSummary {
  connectedWorkspaces: number;
  connectionCount: number;
  connectionsByStatus: Record<string, number>;
  errorConnections: number;
  lastSyncAt: string | null;
  lastError: string | null;
  connections: ProviderConnectionSummary[];
}

/** Aggregates raw `integration_connections` rows for one provider. */
export function summarizeConnectionRows(rows: Row[]): ConnectionSummary {
  const byStatus: Record<string, number> = {};
  const connected = new Set<string>();
  let lastSyncAt: string | null = null;
  let lastError: string | null = null;
  const connections: ProviderConnectionSummary[] = [];
  for (const row of rows) {
    const status = String(row.status ?? "unknown");
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    if (status === "connected") connected.add(String(row.workspace_id ?? ""));
    if (status === "error" && !lastError) {
      lastError = asString(row.last_error);
    }
    const syncAt = asString(row.last_sync_at);
    if (syncAt && (!lastSyncAt || syncAt > lastSyncAt)) lastSyncAt = syncAt;
    connections.push({
      workspaceId: String(row.workspace_id ?? ""),
      status,
      lastSyncAt: syncAt,
      lastError: asString(row.last_error),
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? ""),
    });
  }
  return {
    connectedWorkspaces: connected.size,
    connectionCount: rows.length,
    connectionsByStatus: byStatus,
    errorConnections: byStatus.error ?? 0,
    lastSyncAt,
    lastError,
    connections,
  };
}

export interface SyncJobSummary {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  lastJob: ProviderSyncJobSummary | null;
  jobs: ProviderSyncJobSummary[];
}

function rowToSyncJob(row: Row): ProviderSyncJobSummary {
  return {
    id: String(row.id ?? ""),
    workspaceId: String(row.workspace_id ?? ""),
    direction: String(row.direction ?? ""),
    status: String(row.status ?? ""),
    processed: asNumber(row.processed),
    created: asNumber(row.created_count),
    updated: asNumber(row.updated_count),
    skipped: asNumber(row.skipped_count),
    failed: asNumber(row.failed_count),
    errors: Array.isArray(row.errors) ? (row.errors as string[]) : [],
    createdAt: String(row.created_at ?? ""),
    finishedAt: asString(row.finished_at),
  };
}

/** Aggregates raw `integration_sync_jobs` rows for one provider (7d window, rows desc). */
export function summarizeSyncJobRows(rows: Row[], nowMs: number): SyncJobSummary {
  const day = 24 * 60 * 60 * 1000;
  const out: SyncJobSummary = { total: 0, completed: 0, failed: 0, pending: 0, lastJob: null, jobs: [] };
  for (const row of rows) {
    const job = rowToSyncJob(row);
    const ts = Date.parse(job.createdAt);
    if (!Number.isNaN(ts) && nowMs - ts > 7 * day) continue;
    out.total += 1;
    if (job.status === "completed") out.completed += 1;
    else if (job.status === "failed") out.failed += 1;
    else out.pending += 1;
    if (!out.lastJob) out.lastJob = job;
    if (out.jobs.length < 20) out.jobs.push(job);
  }
  return out;
}

export interface DeliverySummary {
  counts: { pending: number; delivered: number; failed: number; dead: number };
  recentFailures: ProviderDeliverySummary[];
  deliveries: ProviderDeliverySummary[];
}

function rowToDelivery(row: Row): ProviderDeliverySummary {
  return {
    id: String(row.id ?? ""),
    event: String(row.event ?? ""),
    subscriptionId: String(row.subscription_id ?? ""),
    status: String(row.status ?? ""),
    attempts: asNumber(row.attempts),
    maxAttempts: asNumber(row.max_attempts),
    lastError: asString(row.last_error),
    nextRetryAt: asString(row.next_retry_at),
    createdAt: String(row.created_at ?? ""),
  };
}

/** Aggregates raw `zapier_webhook_deliveries` rows for one platform. */
export function summarizeDeliveryRows(rows: Row[]): DeliverySummary {
  const out: DeliverySummary = {
    counts: { pending: 0, delivered: 0, failed: 0, dead: 0 },
    recentFailures: [],
    deliveries: [],
  };
  for (const row of rows) {
    const d = rowToDelivery(row);
    if (d.status === "pending") out.counts.pending += 1;
    else if (d.status === "delivered") out.counts.delivered += 1;
    else if (d.status === "failed") out.counts.failed += 1;
    else if (d.status === "dead") out.counts.dead += 1;
    if ((d.status === "failed" || d.status === "dead") && out.recentFailures.length < 10) {
      out.recentFailures.push(d);
    }
    if (out.deliveries.length < 20) out.deliveries.push(d);
  }
  return out;
}

export interface UsageSummary {
  events: number;
  credits: number;
  recent: ProviderUsageSummary[];
}

/** Aggregates raw `integration_usage` rows for one provider (7d window). */
export function summarizeUsageRows(rows: Row[], nowMs: number): UsageSummary {
  const day = 24 * 60 * 60 * 1000;
  const out: UsageSummary = { events: 0, credits: 0, recent: [] };
  for (const row of rows) {
    const recordedAt = asString(row.recorded_at);
    const ts = recordedAt ? Date.parse(recordedAt) : NaN;
    if (!Number.isNaN(ts) && nowMs - ts > 7 * day) continue;
    out.events += 1;
    out.credits += asNumber(row.credits_used);
    if (out.recent.length < 20) {
      out.recent.push({
        event: String(row.event ?? ""),
        creditsUsed: asNumber(row.credits_used),
        recordedAt: recordedAt ?? "",
      });
    }
  }
  return out;
}

// ── Disable flags (migration 038) ───────────────────────────────────────────

export interface ProviderDisabledFlag {
  provider: string;
  disabled: boolean;
  disabledBy: string | null;
  disabledAt: string | null;
  reason: string | null;
}

export function rowToDisabledFlag(row: Row): ProviderDisabledFlag {
  return {
    provider: String(row.provider ?? ""),
    disabled: Boolean(row.disabled),
    disabledBy: (row.disabled_by as string | null) ?? null,
    disabledAt: asString(row.disabled_at),
    reason: (row.reason as string | null) ?? null,
  };
}

/** Pure lookup over already-read flag rows. */
export function findDisabledFlag(
  flags: ProviderDisabledFlag[],
  providerId: string
): ProviderDisabledFlag | null {
  return flags.find((f) => f.provider === providerId && f.disabled) ?? null;
}

export function validateDisableToggle(
  body: unknown
): { ok: true; disabled: boolean; reason: string | null } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const { disabled, reason } = body as Record<string, unknown>;
  if (typeof disabled !== "boolean") {
    return { ok: false, error: "Field 'disabled' must be a boolean." };
  }
  if (reason !== undefined && reason !== null && typeof reason !== "string") {
    return { ok: false, error: "Field 'reason' must be a string." };
  }
  const trimmed = typeof reason === "string" ? reason.trim() : "";
  if (trimmed.length > 500) {
    return { ok: false, error: "Field 'reason' must be at most 500 characters." };
  }
  return { ok: true, disabled, reason: trimmed === "" ? null : trimmed };
}

// ── Live reads (service-role only; callers must already be super-admin) ────

const SAFE_CONNECTION_COLUMNS =
  "id, workspace_id, provider, status, last_sync_at, last_error, created_at, updated_at";
const SAFE_DELIVERY_COLUMNS =
  "id, event, subscription_id, platform, status, attempts, max_attempts, last_error, next_retry_at, created_at";
const SAFE_SUBSCRIPTION_COLUMNS =
  "id, workspace_id, event, platform, active, created_at, updated_at";

function emptyRow(def: ProviderDefinition): ProviderMonitoringRow {
  return {
    id: def.id,
    name: def.name,
    category: def.category,
    authType: def.authType,
    docsUrl: def.docsUrl,
    capabilities: def.capabilities,
    twoWaySync: def.twoWaySync,
    disabled: false,
    disabledReason: null,
    disabledAt: null,
    disabledBy: null,
    connectedWorkspaces: 0,
    connectionCount: 0,
    connectionsByStatus: {},
    errorConnections: 0,
    lastSyncAt: null,
    lastError: null,
    auditTracked: def.id in AUDIT_PREFIX_BY_PROVIDER,
    auditNote: auditNoteForProvider(def.id),
    apiCalls24h: null,
    apiCalls7d: null,
    apiErrors24h: null,
    apiErrors7d: null,
    webhookTracked: (WEBHOOK_TRACKED_PROVIDERS as readonly string[]).includes(def.id),
    webhookSubscriptions: null,
    deliveryCounts: null,
    syncJobs7d: null,
    lastSyncJob: null,
    usage7d: null,
  };
}

/** Demo-mode overview: the full provider list with honest empty values. */
export function demoMonitoringOverview(): MonitoringOverview {
  return {
    providers: PROVIDER_DEFINITIONS.map((def) => {
      const row = emptyRow(def);
      row.syncJobs7d = { total: 0, completed: 0, failed: 0, pending: 0 };
      row.usage7d = { events: 0, credits: 0 };
      if (row.webhookTracked) {
        row.webhookSubscriptions = 0;
        row.deliveryCounts = { pending: 0, delivered: 0, failed: 0, dead: 0 };
      }
      if (row.auditTracked) {
        row.apiCalls24h = 0;
        row.apiCalls7d = 0;
        row.apiErrors24h = 0;
        row.apiErrors7d = 0;
      }
      return row;
    }),
    totals: {
      providers: PROVIDER_DEFINITIONS.length,
      disabled: 0,
      connectedWorkspaces: 0,
      errorConnections: 0,
      apiErrors24h: 0,
      apiErrors7d: 0,
      deadDeliveries: 0,
      syncJobsFailed7d: 0,
    },
    disabledFlagsUnknown: false,
    unknownTables: [],
    checkedAt: new Date().toISOString(),
  };
}

export async function listProviderDisabledFlags(
  admin: SupabaseClient
): Promise<{ flags: ProviderDisabledFlag[]; unknown: boolean }> {
  try {
    const { data, error } = await admin
      .from("provider_disabled_flags")
      .select("provider, disabled, disabled_by, disabled_at, reason");
    if (error) return { flags: [], unknown: true };
    return {
      flags: (data ?? []).map((r) => rowToDisabledFlag(r as Row)),
      unknown: false,
    };
  } catch (err) {
    console.error("[Admin] Provider disabled flags read failed:", err);
    return { flags: [], unknown: true };
  }
}

/**
 * Enforcement hook for the connection / REST entry points.
 *
 * Returns true when the provider may be used. Throws when an admin
 * has disabled it. When the flag table cannot be read (migration
 * 038 not applied) it FAILS OPEN — no flag can exist yet — and logs
 * a server warning so the gap is visible; the monitoring overview
 * reports `disabledFlagsUnknown: true` in that case.
 *
 * CALL SITES STILL TO WIRE (outside Wave 2, Phase 2 scope — the
 * flag is stored and displayed now, but no request path calls this
 * yet): the workspace connect flow for config-ready adapters and
 * the shared REST auth gate (`src/lib/integrations/rest/auth.ts` /
 * `route-helpers.ts`, next to `isPlatformEnabled`). Until those
 * call sites land, a disabled provider still accepts connections —
 * the toggle only records the admin's intent and surfaces it.
 */
export async function assertProviderEnabled(
  admin: SupabaseClient,
  providerId: string
): Promise<boolean> {
  const { flags, unknown } = await listProviderDisabledFlags(admin);
  if (unknown) {
    console.warn(
      "[Admin] provider_disabled_flags could not be read (migration 038 may not be applied) — disable check skipped for provider",
      providerId
    );
    return true;
  }
  const flag = findDisabledFlag(flags, providerId);
  if (flag) {
    throw new Error(
      `Provider "${providerId}" is disabled by a platform administrator${flag.reason ? `: ${flag.reason}` : "."}`
    );
  }
  return true;
}

/** Live overview: one read per source table, aggregated in memory. */
export async function getProviderMonitoring(
  admin: SupabaseClient
): Promise<MonitoringOverview> {
  const now = new Date();
  const nowMs = now.getTime();
  const sevenDaysAgo = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
  const unknownTables: string[] = [];

  const { flags, unknown: flagsUnknown } = await listProviderDisabledFlags(admin);
  if (flagsUnknown) unknownTables.push("provider_disabled_flags");

  // ── Connections (safe columns only — encrypted_credentials never selected)
  let connectionRows: Row[] = [];
  let connectionsUnknown = false;
  try {
    const { data, error } = await admin
      .from("integration_connections")
      .select(SAFE_CONNECTION_COLUMNS)
      .order("updated_at", { ascending: false })
      .limit(2000);
    if (error) connectionsUnknown = true;
    else connectionRows = (data ?? []) as Row[];
  } catch (err) {
    console.error("[Admin] Provider connections read failed:", err);
    connectionsUnknown = true;
  }
  if (connectionsUnknown) unknownTables.push("integration_connections");

  // ── Audit (last 7d, tracked prefixes only, one query)
  const auditPrefixes = Object.values(AUDIT_PREFIX_BY_PROVIDER);
  let auditRows: Row[] = [];
  let auditUnknown = false;
  try {
    const orFilter = auditPrefixes
      .map((p) => `action.ilike.${p}%`)
      .join(",");
    const { data, error } = await admin
      .from("audit_logs")
      .select("action, resource, metadata, created_at")
      .or(orFilter)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) auditUnknown = true;
    else auditRows = (data ?? []) as Row[];
  } catch (err) {
    console.error("[Admin] Provider audit read failed:", err);
    auditUnknown = true;
  }
  if (auditUnknown) unknownTables.push("audit_logs");

  // ── Webhook subscriptions + deliveries (safe columns only — no secret, no payload)
  let subscriptionRows: Row[] = [];
  let deliveryRows: Row[] = [];
  let webhooksUnknown = false;
  try {
    const { data, error } = await admin
      .from("zapier_webhook_subscriptions")
      .select(SAFE_SUBSCRIPTION_COLUMNS)
      .eq("active", true)
      .limit(1000);
    if (error) webhooksUnknown = true;
    else subscriptionRows = (data ?? []) as Row[];
  } catch (err) {
    console.error("[Admin] Webhook subscriptions read failed:", err);
    webhooksUnknown = true;
  }
  try {
    const { data, error } = await admin
      .from("zapier_webhook_deliveries")
      .select(SAFE_DELIVERY_COLUMNS)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) webhooksUnknown = true;
    else deliveryRows = (data ?? []) as Row[];
  } catch (err) {
    console.error("[Admin] Webhook deliveries read failed:", err);
    webhooksUnknown = true;
  }
  if (webhooksUnknown) unknownTables.push("zapier_webhook_subscriptions/deliveries");

  // ── Sync jobs (7d) + usage (7d)
  let syncRows: Row[] = [];
  let syncUnknown = false;
  try {
    const { data, error } = await admin
      .from("integration_sync_jobs")
      .select("id, workspace_id, provider, direction, status, processed, created_count, updated_count, skipped_count, failed_count, errors, created_at, finished_at")
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) syncUnknown = true;
    else syncRows = (data ?? []) as Row[];
  } catch (err) {
    console.error("[Admin] Sync jobs read failed:", err);
    syncUnknown = true;
  }
  if (syncUnknown) unknownTables.push("integration_sync_jobs");

  let usageRows: Row[] = [];
  let usageUnknown = false;
  try {
    const { data, error } = await admin
      .from("integration_usage")
      .select("workspace_id, provider, event, credits_used, recorded_at")
      .gte("recorded_at", sevenDaysAgo)
      .order("recorded_at", { ascending: false })
      .limit(2000);
    if (error) usageUnknown = true;
    else usageRows = (data ?? []) as Row[];
  } catch (err) {
    console.error("[Admin] Integration usage read failed:", err);
    usageUnknown = true;
  }
  if (usageUnknown) unknownTables.push("integration_usage");

  // ── Aggregate per provider ──────────────────────────────────────────────
  const byProvider = (rows: Row[]): Map<string, Row[]> => {
    const map = new Map<string, Row[]>();
    for (const row of rows) {
      const key = String(row.provider ?? row.platform ?? "");
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return map;
  };
  const connectionsByProvider = byProvider(connectionRows);
  const syncByProvider = byProvider(syncRows);
  const usageByProvider = byProvider(usageRows);
  const deliveriesByPlatform = byProvider(deliveryRows);
  const subscriptionsByPlatform = byProvider(subscriptionRows);

  const providers: ProviderMonitoringRow[] = PROVIDER_DEFINITIONS.map((def) => {
    const row = emptyRow(def);
    const flag = findDisabledFlag(flags, def.id);
    if (flag) {
      row.disabled = true;
      row.disabledReason = flag.reason;
      row.disabledAt = flag.disabledAt;
      row.disabledBy = flag.disabledBy;
    }
    if (!connectionsUnknown) {
      const summary = summarizeConnectionRows(connectionsByProvider.get(def.id) ?? []);
      row.connectedWorkspaces = summary.connectedWorkspaces;
      row.connectionCount = summary.connectionCount;
      row.connectionsByStatus = summary.connectionsByStatus;
      row.errorConnections = summary.errorConnections;
      row.lastSyncAt = summary.lastSyncAt;
      row.lastError = summary.lastError;
    }
    if (!auditUnknown && row.auditTracked) {
      const summary = summarizeAuditRows(auditRows, AUDIT_PREFIX_BY_PROVIDER[def.id], nowMs);
      row.apiCalls24h = summary.calls24h;
      row.apiCalls7d = summary.calls7d;
      row.apiErrors24h = summary.errors24h;
      row.apiErrors7d = summary.errors7d;
    }
    if (!webhooksUnknown && row.webhookTracked) {
      row.webhookSubscriptions = (subscriptionsByPlatform.get(def.id) ?? []).length;
      row.deliveryCounts = summarizeDeliveryRows(deliveriesByPlatform.get(def.id) ?? []).counts;
    }
    if (!syncUnknown) {
      const summary = summarizeSyncJobRows(syncByProvider.get(def.id) ?? [], nowMs);
      row.syncJobs7d = {
        total: summary.total,
        completed: summary.completed,
        failed: summary.failed,
        pending: summary.pending,
      };
      row.lastSyncJob = summary.lastJob;
    }
    if (!usageUnknown) {
      const summary = summarizeUsageRows(usageByProvider.get(def.id) ?? [], nowMs);
      row.usage7d = { events: summary.events, credits: summary.credits };
    }
    return row;
  });

  const totals: MonitoringTotals = {
    providers: providers.length,
    disabled: providers.filter((p) => p.disabled).length,
    connectedWorkspaces: providers.reduce((s, p) => s + p.connectedWorkspaces, 0),
    errorConnections: providers.reduce((s, p) => s + p.errorConnections, 0),
    apiErrors24h: providers.reduce((s, p) => s + (p.apiErrors24h ?? 0), 0),
    apiErrors7d: providers.reduce((s, p) => s + (p.apiErrors7d ?? 0), 0),
    deadDeliveries: providers.reduce((s, p) => s + (p.deliveryCounts?.dead ?? 0), 0),
    syncJobsFailed7d: providers.reduce((s, p) => s + (p.syncJobs7d?.failed ?? 0), 0),
  };

  return {
    providers,
    totals,
    disabledFlagsUnknown: flagsUnknown,
    unknownTables,
    checkedAt: now.toISOString(),
  };
}

/** Live per-provider detail: the overview row + the underlying records. */
export async function getProviderMonitoringDetail(
  admin: SupabaseClient,
  providerId: string
): Promise<ProviderMonitoringDetail | null> {
  const def = getProviderDefinition(providerId);
  if (!def) return null;
  const overview = await getProviderMonitoring(admin);
  const provider = overview.providers.find((p) => p.id === providerId);
  if (!provider) return null;
  const nowMs = Date.now();
  const sevenDaysAgo = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Connections for this provider (safe columns only).
  let connections: ProviderConnectionSummary[] = [];
  try {
    const { data, error } = await admin
      .from("integration_connections")
      .select(SAFE_CONNECTION_COLUMNS)
      .eq("provider", providerId)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (!error) {
      connections = summarizeConnectionRows((data ?? []) as Row[]).connections;
    }
  } catch (err) {
    console.error("[Admin] Provider detail connections read failed:", err);
  }

  // Audit entries for this provider's prefix (none when untracked).
  let audit: ProviderAuditEntry[] = [];
  const prefix = AUDIT_PREFIX_BY_PROVIDER[providerId];
  if (prefix) {
    try {
      const { data, error } = await admin
        .from("audit_logs")
        .select("action, resource, metadata, created_at")
        .ilike("action", `${prefix}%`)
        .order("created_at", { ascending: false })
        .limit(20);
      if (!error) {
        audit = summarizeAuditRows((data ?? []) as Row[], prefix, nowMs).recent;
      }
    } catch (err) {
      console.error("[Admin] Provider detail audit read failed:", err);
    }
  }

  // Webhook deliveries for this platform (REST platforms only).
  let deliveries: ProviderDeliverySummary[] = [];
  if ((WEBHOOK_TRACKED_PROVIDERS as readonly string[]).includes(providerId)) {
    try {
      const { data, error } = await admin
        .from("zapier_webhook_deliveries")
        .select(SAFE_DELIVERY_COLUMNS)
        .eq("platform", providerId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (!error) {
        deliveries = summarizeDeliveryRows((data ?? []) as Row[]).deliveries;
      }
    } catch (err) {
      console.error("[Admin] Provider detail deliveries read failed:", err);
    }
  }

  // Sync jobs + usage for this provider (7d).
  let syncJobs: ProviderSyncJobSummary[] = [];
  try {
    const { data, error } = await admin
      .from("integration_sync_jobs")
      .select("id, workspace_id, provider, direction, status, processed, created_count, updated_count, skipped_count, failed_count, errors, created_at, finished_at")
      .eq("provider", providerId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error) {
      syncJobs = summarizeSyncJobRows((data ?? []) as Row[], nowMs).jobs;
    }
  } catch (err) {
    console.error("[Admin] Provider detail sync jobs read failed:", err);
  }

  let usage: ProviderUsageSummary[] = [];
  try {
    const { data, error } = await admin
      .from("integration_usage")
      .select("workspace_id, provider, event, credits_used, recorded_at")
      .eq("provider", providerId)
      .gte("recorded_at", sevenDaysAgo)
      .order("recorded_at", { ascending: false })
      .limit(20);
    if (!error) {
      usage = summarizeUsageRows((data ?? []) as Row[], nowMs).recent;
    }
  } catch (err) {
    console.error("[Admin] Provider detail usage read failed:", err);
  }

  return { provider, connections, audit, deliveries, syncJobs, usage };
}

/**
 * Persists a disable/enable decision. Validates the provider id
 * against the registry (unknown ids are rejected, never stored),
 * upserts the flag row, and writes an audit-log entry so the
 * decision is traceable. Throws on a database failure — the caller
 * must surface that as a 503, never as a silent success.
 */
export async function setProviderDisabled(
  admin: SupabaseClient,
  input: {
    providerId: string;
    disabled: boolean;
    reason: string | null;
    actorId: string | null;
    actorEmail: string;
  }
): Promise<ProviderDisabledFlag> {
  const def = getProviderDefinition(input.providerId);
  if (!def) throw new Error(`Unknown provider: ${input.providerId}`);
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("provider_disabled_flags")
    .upsert(
      {
        provider: input.providerId,
        disabled: input.disabled,
        disabled_by: input.actorId,
        disabled_at: input.disabled ? now : null,
        reason: input.disabled ? input.reason : null,
        updated_at: now,
      },
      { onConflict: "provider" }
    )
    .select("provider, disabled, disabled_by, disabled_at, reason")
    .single();
  if (error || !data) {
    throw new Error(
      `Failed to save provider flag: ${error?.message ?? "no row returned"}`
    );
  }
  const flag = rowToDisabledFlag(data as Row);
  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: input.actorId,
    action: input.disabled ? "ADMIN_PROVIDER_DISABLED" : "ADMIN_PROVIDER_ENABLED",
    resource: `provider:${input.providerId}`,
    metadata: {
      actor_email: input.actorEmail,
      details: input.disabled
        ? `Disabled provider ${def.name}${input.reason ? ` — ${input.reason}` : ""}`
        : `Re-enabled provider ${def.name}`,
      timestamp: now,
    },
  });
  if (auditError) {
    console.error("[Admin] Provider disable audit write failed:", auditError);
  }
  return flag;
}
