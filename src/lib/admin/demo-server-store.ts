/**
 * Demo-mode server stores for the admin platform (Stage D).
 *
 * In Demo Mode there is no database, but admin surfaces that are driven
 * by API routes (submissions, settings, audit trail, queue, usage) still
 * need ONE consistent store per server process — the same pattern the
 * inbox repair used (Stage C). These module-level singletons provide
 * it. Everything held here is demo data: seeded sample content is
 * labelled demo in every UI, and anything a visitor creates (a contact
 * submission, a settings change) lives only for the process lifetime.
 *
 * NOTHING in this module is used when Supabase is configured — live
 * mode reads/writes the real tables through the service role.
 */

import { generateId } from "@/lib/utils";
import { MOCK_ADMIN_AUDIT_LOGS, MOCK_ADMIN_USERS } from "@/lib/db/mock/data";
import type { AuditEntry } from "./audit-core";
import type { AdminSettings } from "./settings-core";
import { DEFAULT_ADMIN_SETTINGS } from "./settings-core";
import type { Submission } from "./submissions-core";
import type { JobRecord, JobRunRecord } from "@/lib/jobs/types";
import type { UsageMetric } from "@/lib/billing/limits";

// ── Submissions ─────────────────────────────────────────────────────────────

const submissions: Submission[] = [];

export function demoListSubmissions(): Submission[] {
  return [...submissions].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function demoAddSubmission(
  input: Omit<Submission, "id" | "status" | "created_at">
): Submission {
  const record: Submission = {
    ...input,
    id: generateId(),
    status: "unread",
    created_at: new Date().toISOString(),
  };
  submissions.push(record);
  return record;
}

export function demoSetSubmissionStatus(
  id: string,
  status: Submission["status"]
): Submission | null {
  const found = submissions.find((s) => s.id === id);
  if (!found) return null;
  found.status = status;
  return found;
}

// ── Audit trail ─────────────────────────────────────────────────────────────

function seedAuditEntries(): AuditEntry[] {
  return MOCK_ADMIN_AUDIT_LOGS.map((log) => ({
    id: log.id,
    actor: log.actor,
    action: log.action,
    resource: log.resource,
    details: log.details,
    created_at: log.timestamp.replace(" ", "T") + "Z",
  }));
}

let auditEntries: AuditEntry[] | null = null;

export function demoListAuditEntries(): AuditEntry[] {
  if (!auditEntries) auditEntries = seedAuditEntries();
  return [...auditEntries].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function demoAppendAuditEntry(entry: Omit<AuditEntry, "id" | "created_at">): AuditEntry {
  if (!auditEntries) auditEntries = seedAuditEntries();
  const record: AuditEntry = {
    ...entry,
    id: generateId(),
    created_at: new Date().toISOString(),
  };
  auditEntries.push(record);
  return record;
}

// ── Settings ────────────────────────────────────────────────────────────────

let settings: AdminSettings = { ...DEFAULT_ADMIN_SETTINGS };

export function demoGetSettings(): AdminSettings {
  return { ...settings };
}

export function demoUpdateSettings(
  next: Omit<AdminSettings, "updated_at" | "updated_by">,
  updatedBy: string | null
): AdminSettings {
  settings = {
    ...next,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  };
  return { ...settings };
}

// ── Queue (jobs + runs) ─────────────────────────────────────────────────────
// Deterministic seed representing a worker that has run rollups and
// webhook retries, including one failed run (the Notifications page and
// health recency checks read the same seed, so they always agree).

const DEMO_JOBS: JobRecord[] = [
  {
    id: "job_demo_rollup",
    workspace_id: "ws_demo_001",
    type: "usage_rollup",
    payload: {},
    idempotency_key: "demo:usage_rollup:2024-10",
    status: "completed",
    attempts: 1,
    max_attempts: 3,
    run_after: "2024-10-12T06:00:00Z",
    last_error: null,
    created_at: "2024-10-12T06:00:00Z",
    updated_at: "2024-10-12T06:00:04Z",
    completed_at: "2024-10-12T06:00:04Z",
  },
  {
    id: "job_demo_retry",
    workspace_id: "ws_demo_001",
    type: "webhook_retry",
    payload: { delivery_id: "dlv_demo_001" },
    idempotency_key: "demo:webhook_retry:dlv_demo_001",
    status: "failed",
    attempts: 3,
    max_attempts: 3,
    run_after: "2024-10-12T07:30:00Z",
    last_error: "Simulated delivery endpoint returned 502 (demo).",
    created_at: "2024-10-12T07:00:00Z",
    updated_at: "2024-10-12T07:30:02Z",
    completed_at: null,
  },
  {
    id: "job_demo_followup",
    workspace_id: "ws_demo_001",
    type: "follow_up_due",
    payload: {},
    idempotency_key: "demo:follow_up_due:2024-10-13",
    status: "pending",
    attempts: 0,
    max_attempts: 3,
    run_after: "2024-10-13T06:00:00Z",
    last_error: null,
    created_at: "2024-10-12T08:00:00Z",
    updated_at: "2024-10-12T08:00:00Z",
    completed_at: null,
  },
];

const DEMO_JOB_RUNS: JobRunRecord[] = [
  {
    id: "run_demo_001",
    job_id: "job_demo_rollup",
    started_at: "2024-10-12T06:00:00Z",
    finished_at: "2024-10-12T06:00:04Z",
    status: "completed",
    message: "Rolled up usage for 1 workspace (demo).",
  },
  {
    id: "run_demo_002",
    job_id: "job_demo_retry",
    started_at: "2024-10-12T07:30:00Z",
    finished_at: "2024-10-12T07:30:02Z",
    status: "failed",
    message: "Simulated delivery endpoint returned 502 (demo).",
  },
];

export function demoListJobs(): JobRecord[] {
  return [...DEMO_JOBS];
}

export function demoListJobRuns(): JobRunRecord[] {
  return [...DEMO_JOB_RUNS].sort((a, b) => b.started_at.localeCompare(a.started_at));
}

// ── Usage (per-workspace monthly metrics) ───────────────────────────────────
// Derived from the demo admin dataset (one primary workspace per demo
// user) with fixed, deterministic quantities — demo data, labelled as
// such. One starter workspace sits over its leads limit so the
// over-limit surfacing is visible in demo.

export interface DemoUsageSeed {
  workspace_id: string;
  workspace_name: string;
  plan: (typeof MOCK_ADMIN_USERS)[number]["plan"];
  period_start: string;
  metrics: Partial<Record<UsageMetric, number>>;
}

const DEMO_USAGE_METRICS: Array<Partial<Record<UsageMetric, number>>> = [
  { leads: 1240, campaigns: 6, accounts: 3, emailsPerMonth: 18250 },
  { leads: 860, campaigns: 4, accounts: 2, emailsPerMonth: 9100 },
  { leads: 2310, campaigns: 9, accounts: 4, emailsPerMonth: 27400 },
  { leads: 640, campaigns: 2, accounts: 1, emailsPerMonth: 4200 },
  { leads: 2150, campaigns: 7, accounts: 3, emailsPerMonth: 11800 },
  { leads: 480, campaigns: 1, accounts: 1, emailsPerMonth: 2600 },
  { leads: 15200, campaigns: 22, accounts: 9, emailsPerMonth: 96400 },
  { leads: 310, campaigns: 1, accounts: 1, emailsPerMonth: 1500 },
];

export function demoUsageSeeds(): DemoUsageSeed[] {
  return MOCK_ADMIN_USERS.filter((u) => u.workspace_count > 0).map((u, i) => ({
    workspace_id: `ws_demo_for_${u.id}`,
    workspace_name: `${u.name.split(" ")[0]}'s Workspace`,
    plan: u.plan,
    period_start: "2024-10-01",
    metrics: DEMO_USAGE_METRICS[i % DEMO_USAGE_METRICS.length],
  }));
}
