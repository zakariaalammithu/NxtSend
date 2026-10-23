/**
 * Connected accounts repository — one interface, two backends.
 *
 * The account model (migration 011, `connected_accounts`): one record
 * per sending identity in a workspace, per channel (linkedin/email).
 * An account carries its warm-up state, its daily action limits and
 * the sender identity that fills the {my_*} template variables.
 * Migration 013 adds the provider identity + auth-health fields
 * (provider_account_id / auth_status / last_sync_at / last_error):
 * recorded by a provider integration, read tolerantly here so a
 * pre-013 database maps to the honest defaults.
 * Campaigns reference accounts via campaigns.sender_account_id /
 * email_account_id (nullable — deleting an account never breaks a
 * campaign; readers fall back to the workspace sending state).
 *
 * Honesty rules:
 * - This repository stores account records; it NEVER connects
 *   anything. Real accounts are created by an approved LinkedIn
 *   integration / the email integration (see the Integration Center);
 *   there is deliberately no "connect with password/cookies" flow.
 * - Demo backend: the localStorage demo store, seeded with two
 *   clearly-labelled demo accounts (status "demo") — the existing
 *   demo sender persona as a LinkedIn account and the demo email
 *   identity as an email account. Both start with warm-up ON and
 *   Closely's documented default daily limits.
 * - Supabase backend: the `connected_accounts` table (migration 011),
 *   workspace-scoped and RLS-enforced.
 */

import type {
  AccountAuthStatus,
  AccountChannel,
  ConnectedAccount,
  ConnectedAccountStatus,
  WarmupHistoryEntry,
  WarmupLimits,
  WarmupPreset,
  WarmupSchedule,
  WarmupStatus,
} from "@/types";
import {
  editScheduleTransition,
  emptyWarmupUsage,
  graduateTransition,
  overrideTransition,
  parseWarmupHistory,
  parseWarmupOverrides,
  parseWarmupPreset,
  parseWarmupSchedule,
  parseWarmupStatus,
  pauseTransition,
  resumeTransition,
  restartTransition,
  startTransition,
  stepTypeToWarmupAction,
  type AccountWarmupState,
  type WarmupPresetKey,
  type WarmupProgramPatch,
  type WarmupTransition,
  type WarmupUsageCounts,
} from "@/lib/linkedin/warmup";
import { countDemoLinkedInActions } from "@/lib/executor/demo-executions";
import type { TemplateVariables } from "@/lib/ai/prompt";
import { createClient } from "@/lib/supabase/client";
import { generateId } from "@/lib/utils";
import { getDataMode, type DataMode } from "./mode";
import { loadDemoCollection, saveDemoCollection } from "./demo-store";
import { DEMO_WORKSPACE_ID } from "./workspace";
import { DEFAULT_WARMUP_LIMITS } from "./audience-source";

const DEMO_ACCOUNTS_KEY = "nxtsend_demo_connected_accounts_v1";

/** Stable ids of the two seeded demo accounts. */
export const DEMO_LINKEDIN_ACCOUNT_ID = "acc_demo_linkedin";
export const DEMO_EMAIL_ACCOUNT_ID = "acc_demo_email";

export interface CreateAccountInput {
  channel: AccountChannel;
  provider: string;
  display_name: string;
  handle_or_email?: string;
  avatar_url?: string | null;
  status?: ConnectedAccountStatus;
  /** Provider-side identity + auth health (migration 013). Set by a
   *  provider integration when it creates the record; hand-created
   *  records leave them at the honest defaults (null / not_connected). */
  provider_account_id?: string | null;
  auth_status?: AccountAuthStatus;
  last_sync_at?: string | null;
  last_error?: string | null;
  warmup_enabled?: boolean;
  daily_limits?: Partial<WarmupLimits>;
  sender_first_name?: string;
  sender_last_name?: string;
  sender_job_title?: string;
  sender_company?: string;
}

export type UpdateAccountPatch = Partial<
  Pick<
    ConnectedAccount,
    | "display_name"
    | "handle_or_email"
    | "avatar_url"
    | "status"
    | "provider_account_id"
    | "auth_status"
    | "last_sync_at"
    | "last_error"
    | "warmup_enabled"
    | "daily_limits"
    | "warmup_status"
    | "warmup_preset"
    | "warmup_schedule"
    | "warmup_overrides"
    | "warmup_started_at"
    | "warmup_paused_at"
    | "warmup_paused_ms"
    | "warmup_graduated_at"
    | "warmup_history"
    | "sender_first_name"
    | "sender_last_name"
    | "sender_job_title"
    | "sender_company"
  >
>;

export interface AccountsRepository {
  readonly mode: DataMode;
  listAccounts(workspaceId: string): Promise<ConnectedAccount[]>;
  getAccount(workspaceId: string, id: string): Promise<ConnectedAccount | null>;
  createAccount(
    workspaceId: string,
    input: CreateAccountInput
  ): Promise<ConnectedAccount>;
  updateAccount(id: string, patch: UpdateAccountPatch): Promise<ConnectedAccount>;
  deleteAccount(workspaceId: string, id: string): Promise<void>;
  /**
   * Today's counted LinkedIn usage for one account (UTC day starting
   * at `dayStartIso`) — THE counter the executor's warm-up gate and
   * the Accounts panel share, so the panel can never disagree with
   * the gate. Live backend: execution rows with status 'sent'
   * attributed to the account. Demo backend: today's dispatch
   * ATTEMPTS (see countDemoLinkedInActions — demo-only semantics).
   */
  countLinkedInActionsToday(
    workspaceId: string,
    accountId: string,
    dayStartIso: string
  ): Promise<WarmupUsageCounts>;
}

// ============================================================================
// Pure derivations (unit-tested)
// ============================================================================

const LIMIT_KEYS = Object.keys(DEFAULT_WARMUP_LIMITS) as Array<
  keyof WarmupLimits
>;

/**
 * Merges stored daily limits over Closely's documented defaults.
 * Stored JSONB may be partial (or hold junk from a hand edit): any
 * missing/invalid counter falls back to its default, negatives clamp
 * to 0. This is THE derivation every surface uses — the wizard limits
 * card and the accounts page never read raw stored JSONB.
 */
export function withDefaultLimits(
  stored: Partial<WarmupLimits> | null | undefined
): WarmupLimits {
  const out = { ...DEFAULT_WARMUP_LIMITS };
  if (stored && typeof stored === "object") {
    for (const key of LIMIT_KEYS) {
      const value = stored[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        out[key] = Math.max(0, Math.floor(value));
      }
    }
  }
  return out;
}

/** The account's effective daily limits (stored values over defaults). */
export function accountLimits(account: ConnectedAccount): WarmupLimits {
  return withDefaultLimits(account.daily_limits);
}

/** The warm-up program fields of an account that has never started one. */
export function notStartedWarmupFields(): Pick<
  ConnectedAccount,
  | "warmup_status"
  | "warmup_preset"
  | "warmup_schedule"
  | "warmup_overrides"
  | "warmup_started_at"
  | "warmup_paused_at"
  | "warmup_paused_ms"
  | "warmup_graduated_at"
  | "warmup_history"
> {
  return {
    warmup_status: "not_started",
    warmup_preset: null,
    warmup_schedule: null,
    warmup_overrides: null,
    warmup_started_at: null,
    warmup_paused_at: null,
    warmup_paused_ms: 0,
    warmup_graduated_at: null,
    warmup_history: [],
  };
}

/**
 * Resolves an account record into the engine's warm-up state. Every
 * stored field is re-parsed tolerantly (hand-edited localStorage /
 * pre-020 rows degrade to an honest not_started program), and the
 * daily limits go through THE derivation above.
 */
export function warmupStateOf(account: ConnectedAccount): AccountWarmupState {
  return {
    accountId: account.id,
    displayName: account.display_name,
    enabled: account.warmup_enabled,
    status: parseWarmupStatus(account.warmup_status),
    preset: parseWarmupPreset(account.warmup_preset),
    schedule: parseWarmupSchedule(account.warmup_schedule),
    overrides: parseWarmupOverrides(account.warmup_overrides),
    startedAt:
      typeof account.warmup_started_at === "string" && account.warmup_started_at
        ? account.warmup_started_at
        : null,
    pausedAt:
      typeof account.warmup_paused_at === "string" && account.warmup_paused_at
        ? account.warmup_paused_at
        : null,
    pausedMs:
      typeof account.warmup_paused_ms === "number" &&
      Number.isFinite(account.warmup_paused_ms)
        ? Math.max(0, Math.floor(account.warmup_paused_ms))
        : 0,
    graduatedAt:
      typeof account.warmup_graduated_at === "string" &&
      account.warmup_graduated_at
        ? account.warmup_graduated_at
        : null,
    dailyLimits: accountLimits(account),
    history: parseWarmupHistory(account.warmup_history),
  };
}

/** Maps an account's sender identity onto the {my_*} template variables. */
export function accountSenderVars(
  account: ConnectedAccount
): TemplateVariables {
  return {
    myFirstName: account.sender_first_name || undefined,
    myLastName: account.sender_last_name || undefined,
    myJobTitle: account.sender_job_title || undefined,
    myCompanyName: account.sender_company || undefined,
  };
}

/** Splits a profile full name into {my_first_name}/{my_last_name} vars. */
export function profileSenderVars(
  fullName: string | null | undefined
): TemplateVariables {
  const name = (fullName ?? "").trim();
  if (!name) return {};
  const [first, ...rest] = name.split(/\s+/);
  return {
    myFirstName: first,
    ...(rest.length > 0 ? { myLastName: rest.join(" ") } : {}),
  };
}

/**
 * The sender-variable resolution chain used by the sequence drawer's
 * live preview (and mirrored by the executor): the campaign's sender
 * account identity first, then the signed-in user's profile name,
 * then nothing — the template's {my_*:fallback} syntax (or the
 * renderer's empty default) takes it from there.
 */
export function resolveSenderVars(
  account: ConnectedAccount | null | undefined,
  profileFullName?: string | null
): TemplateVariables {
  if (account) {
    const vars = accountSenderVars(account);
    if (
      vars.myFirstName ||
      vars.myLastName ||
      vars.myJobTitle ||
      vars.myCompanyName
    ) {
      return vars;
    }
  }
  return profileSenderVars(profileFullName);
}

// ============================================================================
// Demo backend
// ============================================================================

/**
 * The demo seeds: the existing demo sender persona (Alex Vance) as a
 * LinkedIn account and the demo email identity as an email account.
 * Both are flagged demo via status, start with warm-up ON and carry
 * Closely's default daily limits (5/10/20/20/20/20).
 *
 * The LinkedIn account is seeded MID-PROGRAM so the warm-up panel and
 * the executor gate have something real to show in Demo Mode: it
 * started the Conservative preset two days before the seed is first
 * created, which puts it on Day 3 of 21 (phase 1) under the engine's
 * Day-N = elapsed-active-days + 1 rule. The start instant is computed
 * at seed time (not a fixed date) so the fixture never goes stale.
 * The email account has no program (LinkedIn-only feature).
 */
export function seedDemoAccounts(): ConnectedAccount[] {
  const ts = "2024-09-15T08:30:00.000Z";
  const identity = {
    sender_first_name: "Alex",
    sender_last_name: "Vance",
    sender_job_title: "Account Executive",
    sender_company: "NxtSend",
  };
  const warmupStart = startTransition(
    "conservative",
    new Date(Date.now() - 2 * 86_400_000),
    null
  );
  const linkedinWarmup = {
    warmup_status: (warmupStart.patch.status ?? "warming") as WarmupStatus,
    warmup_preset: (warmupStart.patch.preset ?? "conservative") as WarmupPreset,
    warmup_schedule: (warmupStart.patch.schedule ?? null) as WarmupSchedule | null,
    warmup_overrides: null,
    warmup_started_at: warmupStart.patch.startedAt ?? null,
    warmup_paused_at: null,
    warmup_paused_ms: 0,
    warmup_graduated_at: null,
    warmup_history: [warmupStart.entry] as WarmupHistoryEntry[],
  };
  return [
    {
      id: DEMO_LINKEDIN_ACCOUNT_ID,
      workspace_id: DEMO_WORKSPACE_ID,
      channel: "linkedin",
      provider: "linkedin",
      display_name: "Alex Vance",
      handle_or_email: "linkedin.com/in/alex-vance",
      avatar_url: null,
      status: "demo",
      // Migration-013 health fields: the demo account RECORD is fine
      // (auth_status "ok" = the record carries no auth problem), but
      // no provider account id exists and nothing has ever synced —
      // and the LinkedIn PROVIDER itself stays "Configuration
      // Required" (see src/lib/linkedin). The UI keeps those two
      // facts separate; "ok" here never means "LinkedIn sending works".
      provider_account_id: null,
      auth_status: "ok",
      last_sync_at: null,
      last_error: null,
      warmup_enabled: true,
      daily_limits: { ...DEFAULT_WARMUP_LIMITS },
      ...linkedinWarmup,
      ...identity,
      created_at: ts,
      updated_at: ts,
    },
    {
      id: DEMO_EMAIL_ACCOUNT_ID,
      workspace_id: DEMO_WORKSPACE_ID,
      channel: "email",
      provider: "resend",
      display_name: "Demo email sender",
      handle_or_email: "demo@mail.nxtsend-demo.com",
      avatar_url: null,
      status: "demo",
      provider_account_id: null,
      auth_status: "ok",
      last_sync_at: null,
      last_error: null,
      warmup_enabled: true,
      daily_limits: { ...DEFAULT_WARMUP_LIMITS },
      ...notStartedWarmupFields(),
      ...identity,
      created_at: ts,
      updated_at: ts,
    },
  ];
}

class DemoAccountsRepository implements AccountsRepository {
  readonly mode: DataMode = "demo";

  private load(): ConnectedAccount[] {
    return loadDemoCollection<ConnectedAccount>(DEMO_ACCOUNTS_KEY, () =>
      seedDemoAccounts()
    );
  }
  private save(items: ConnectedAccount[]): void {
    saveDemoCollection(DEMO_ACCOUNTS_KEY, items);
  }

  async listAccounts(workspaceId: string): Promise<ConnectedAccount[]> {
    return this.load()
      .filter((a) => a.workspace_id === workspaceId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async getAccount(
    workspaceId: string,
    id: string
  ): Promise<ConnectedAccount | null> {
    return (
      this.load().find(
        (a) => a.id === id && a.workspace_id === workspaceId
      ) ?? null
    );
  }

  async createAccount(
    workspaceId: string,
    input: CreateAccountInput
  ): Promise<ConnectedAccount> {
    const now = new Date().toISOString();
    const account: ConnectedAccount = {
      id: `acc_demo_${generateId()}`,
      workspace_id: workspaceId,
      channel: input.channel,
      provider: input.provider,
      display_name: input.display_name,
      handle_or_email: input.handle_or_email ?? "",
      avatar_url: input.avatar_url ?? null,
      status: input.status ?? "demo",
      provider_account_id: input.provider_account_id ?? null,
      auth_status: input.auth_status ?? "not_connected",
      last_sync_at: input.last_sync_at ?? null,
      last_error: input.last_error ?? null,
      warmup_enabled: input.warmup_enabled ?? true,
      daily_limits: withDefaultLimits(input.daily_limits),
      ...notStartedWarmupFields(),
      sender_first_name: input.sender_first_name ?? "",
      sender_last_name: input.sender_last_name ?? "",
      sender_job_title: input.sender_job_title ?? "",
      sender_company: input.sender_company ?? "",
      created_at: now,
      updated_at: now,
    };
    const items = this.load();
    items.push(account);
    this.save(items);
    return account;
  }

  async updateAccount(
    id: string,
    patch: UpdateAccountPatch
  ): Promise<ConnectedAccount> {
    const items = this.load();
    const idx = items.findIndex((a) => a.id === id);
    if (idx < 0) throw new Error(`Connected account not found: ${id}`);
    const updated: ConnectedAccount = {
      ...items[idx],
      ...patch,
      ...(patch.daily_limits !== undefined
        ? { daily_limits: withDefaultLimits(patch.daily_limits) }
        : {}),
      updated_at: new Date().toISOString(),
    };
    items[idx] = updated;
    this.save(items);
    return updated;
  }

  async deleteAccount(workspaceId: string, id: string): Promise<void> {
    // Campaigns keep working: their sender_account_id / email_account_id
    // simply stop resolving (the live schema does the same via
    // ON DELETE SET NULL), and readers fall back gracefully.
    this.save(
      this.load().filter(
        (a) => !(a.id === id && a.workspace_id === workspaceId)
      )
    );
  }

  async countLinkedInActionsToday(
    _workspaceId: string,
    accountId: string,
    dayStartIso: string
  ): Promise<WarmupUsageCounts> {
    // Demo storage is single-workspace; the counter itself scopes to
    // the demo workspace + account + UTC day.
    return countDemoLinkedInActions(accountId, dayStartIso);
  }
}

// ============================================================================
// Supabase backend
// ============================================================================

type Row = Record<string, unknown>;

const AUTH_STATUSES: ReadonlySet<string> = new Set([
  "ok",
  "needs_reconnect",
  "expired",
  "error",
  "not_connected",
]);

/** Maps a raw connected_accounts row (tolerant of pre-013 columns).
 *  Exported for server-side account resolution (mailbox routing). */
export function rowToAccount(row: Row): ConnectedAccount {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    channel: (row.channel as AccountChannel) ?? "linkedin",
    provider: String(row.provider ?? ""),
    display_name: String(row.display_name ?? ""),
    handle_or_email: String(row.handle_or_email ?? ""),
    avatar_url: (row.avatar_url as string | null) ?? null,
    status: (row.status as ConnectedAccountStatus) ?? "connected",
    // Migration-013 columns — read tolerantly so a pre-013 database
    // (columns absent) still maps: no provider id, "not_connected",
    // never synced, no error. Never invent a healthier state.
    provider_account_id:
      typeof row.provider_account_id === "string" && row.provider_account_id
        ? row.provider_account_id
        : null,
    auth_status: AUTH_STATUSES.has(String(row.auth_status))
      ? (row.auth_status as AccountAuthStatus)
      : "not_connected",
    last_sync_at:
      typeof row.last_sync_at === "string" && row.last_sync_at
        ? row.last_sync_at
        : null,
    last_error:
      typeof row.last_error === "string" && row.last_error
        ? row.last_error
        : null,
    warmup_enabled: Boolean(row.warmup_enabled),
    daily_limits: withDefaultLimits(
      row.daily_limits && typeof row.daily_limits === "object"
        ? (row.daily_limits as Partial<WarmupLimits>)
        : undefined
    ),
    // Migration-020 columns — read tolerantly so a pre-020 database
    // maps to an honest not_started program (never invent one).
    warmup_status: parseWarmupStatus(row.warmup_status),
    warmup_preset: parseWarmupPreset(row.warmup_preset),
    warmup_schedule: parseWarmupSchedule(row.warmup_schedule),
    warmup_overrides: parseWarmupOverrides(row.warmup_overrides),
    warmup_started_at:
      typeof row.warmup_started_at === "string" && row.warmup_started_at
        ? row.warmup_started_at
        : null,
    warmup_paused_at:
      typeof row.warmup_paused_at === "string" && row.warmup_paused_at
        ? row.warmup_paused_at
        : null,
    warmup_paused_ms:
      typeof row.warmup_paused_ms === "number" &&
      Number.isFinite(row.warmup_paused_ms)
        ? Math.max(0, Math.floor(row.warmup_paused_ms))
        : 0,
    warmup_graduated_at:
      typeof row.warmup_graduated_at === "string" && row.warmup_graduated_at
        ? row.warmup_graduated_at
        : null,
    warmup_history: parseWarmupHistory(row.warmup_history),
    sender_first_name: String(row.sender_first_name ?? ""),
    sender_last_name: String(row.sender_last_name ?? ""),
    sender_job_title: String(row.sender_job_title ?? ""),
    sender_company: String(row.sender_company ?? ""),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

class SupabaseAccountsRepository implements AccountsRepository {
  readonly mode: DataMode = "supabase";

  private client() {
    const supabase = createClient();
    if (!supabase) {
      throw new Error(
        "Supabase client unavailable while data mode is 'supabase'"
      );
    }
    return supabase;
  }

  async listAccounts(workspaceId: string): Promise<ConnectedAccount[]> {
    const { data, error } = await this.client()
      .from("connected_accounts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });
    if (error) {
      throw new Error(`Failed to load connected accounts: ${error.message}`);
    }
    return (data ?? []).map((r) => rowToAccount(r as Row));
  }

  async getAccount(
    workspaceId: string,
    id: string
  ): Promise<ConnectedAccount | null> {
    const { data, error } = await this.client()
      .from("connected_accounts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to load connected account: ${error.message}`);
    }
    return data ? rowToAccount(data as Row) : null;
  }

  async createAccount(
    workspaceId: string,
    input: CreateAccountInput
  ): Promise<ConnectedAccount> {
    const { data, error } = await this.client()
      .from("connected_accounts")
      .insert({
        workspace_id: workspaceId,
        channel: input.channel,
        provider: input.provider,
        display_name: input.display_name,
        handle_or_email: input.handle_or_email ?? "",
        avatar_url: input.avatar_url ?? null,
        status: input.status ?? "connected",
        provider_account_id: input.provider_account_id ?? null,
        auth_status: input.auth_status ?? "not_connected",
        last_sync_at: input.last_sync_at ?? null,
        last_error: input.last_error ?? null,
        warmup_enabled: input.warmup_enabled ?? true,
        daily_limits: withDefaultLimits(input.daily_limits),
        sender_first_name: input.sender_first_name ?? "",
        sender_last_name: input.sender_last_name ?? "",
        sender_job_title: input.sender_job_title ?? "",
        sender_company: input.sender_company ?? "",
      })
      .select("*")
      .single();
    if (error) {
      throw new Error(`Failed to create connected account: ${error.message}`);
    }
    return rowToAccount(data as Row);
  }

  async updateAccount(
    id: string,
    patch: UpdateAccountPatch
  ): Promise<ConnectedAccount> {
    const dbPatch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (patch.display_name !== undefined) dbPatch.display_name = patch.display_name;
    if (patch.handle_or_email !== undefined)
      dbPatch.handle_or_email = patch.handle_or_email;
    if (patch.avatar_url !== undefined) dbPatch.avatar_url = patch.avatar_url;
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.provider_account_id !== undefined)
      dbPatch.provider_account_id = patch.provider_account_id;
    if (patch.auth_status !== undefined) dbPatch.auth_status = patch.auth_status;
    if (patch.last_sync_at !== undefined) dbPatch.last_sync_at = patch.last_sync_at;
    if (patch.last_error !== undefined) dbPatch.last_error = patch.last_error;
    if (patch.warmup_enabled !== undefined)
      dbPatch.warmup_enabled = patch.warmup_enabled;
    if (patch.daily_limits !== undefined)
      dbPatch.daily_limits = withDefaultLimits(patch.daily_limits);
    if (patch.warmup_status !== undefined)
      dbPatch.warmup_status = patch.warmup_status;
    if (patch.warmup_preset !== undefined)
      dbPatch.warmup_preset = patch.warmup_preset;
    if (patch.warmup_schedule !== undefined)
      dbPatch.warmup_schedule = patch.warmup_schedule;
    if (patch.warmup_overrides !== undefined)
      dbPatch.warmup_overrides = patch.warmup_overrides;
    if (patch.warmup_started_at !== undefined)
      dbPatch.warmup_started_at = patch.warmup_started_at;
    if (patch.warmup_paused_at !== undefined)
      dbPatch.warmup_paused_at = patch.warmup_paused_at;
    if (patch.warmup_paused_ms !== undefined)
      dbPatch.warmup_paused_ms = patch.warmup_paused_ms;
    if (patch.warmup_graduated_at !== undefined)
      dbPatch.warmup_graduated_at = patch.warmup_graduated_at;
    if (patch.warmup_history !== undefined)
      dbPatch.warmup_history = patch.warmup_history;
    if (patch.sender_first_name !== undefined)
      dbPatch.sender_first_name = patch.sender_first_name;
    if (patch.sender_last_name !== undefined)
      dbPatch.sender_last_name = patch.sender_last_name;
    if (patch.sender_job_title !== undefined)
      dbPatch.sender_job_title = patch.sender_job_title;
    if (patch.sender_company !== undefined)
      dbPatch.sender_company = patch.sender_company;
    const { data, error } = await this.client()
      .from("connected_accounts")
      .update(dbPatch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      throw new Error(`Failed to update connected account: ${error.message}`);
    }
    return rowToAccount(data as Row);
  }

  async deleteAccount(workspaceId: string, id: string): Promise<void> {
    // campaigns.sender_account_id / email_account_id are
    // ON DELETE SET NULL (migration 011): campaigns survive.
    const { error } = await this.client()
      .from("connected_accounts")
      .delete()
      .eq("id", id)
      .eq("workspace_id", workspaceId);
    if (error) {
      throw new Error(`Failed to delete connected account: ${error.message}`);
    }
  }

  async countLinkedInActionsToday(
    workspaceId: string,
    accountId: string,
    dayStartIso: string
  ): Promise<WarmupUsageCounts> {
    const counts = emptyWarmupUsage();
    try {
      const { data, error } = await this.client()
        .from("campaign_step_executions")
        .select("step_type")
        .eq("workspace_id", workspaceId)
        .eq("account_id", accountId)
        .eq("channel", "linkedin")
        .eq("status", "sent")
        .gte("created_at", dayStartIso);
      if (error || !data) return counts;
      for (const row of data as Array<{ step_type?: unknown }>) {
        const action = stepTypeToWarmupAction(
          String(row.step_type ?? "") as Parameters<
            typeof stepTypeToWarmupAction
          >[0]
        );
        if (action) counts[action] += 1;
      }
    } catch {
      // Pre-020 database (no account_id column) or any read failure:
      // report zeros rather than breaking the panel — the executor's
      // own counter applies the same posture server-side.
      return counts;
    }
    return counts;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createAccountsRepository(
  mode: DataMode = getDataMode()
): AccountsRepository {
  return mode === "supabase"
    ? new SupabaseAccountsRepository()
    : new DemoAccountsRepository();
}

// ============================================================================
// Warm-up program control helpers
// ============================================================================
//
// The Accounts panel's controls. Each helper is implemented ONCE over
// getAccount + updateAccount — the engine computes the patch and the
// history entry; the helper persists both through whichever backend
// the repository wraps, so Demo Mode and Supabase behave identically.
// A helper returns the updated account, the UNCHANGED account when the
// transition does not apply (e.g. pausing a program that is not
// warming), or null when the account does not exist.

export interface WarmupControlOptions {
  /** Acting profile id, recorded in the history entry when known. */
  by?: string | null;
  /** Injected clock (tests); defaults to now. */
  now?: Date;
}

const MAX_WARMUP_HISTORY = 50;

/**
 * Maps an engine program patch + its history entry onto an account
 * update patch (appending the entry, history capped at the latest
 * MAX_WARMUP_HISTORY). Exported for the executor stores, which
 * persist engine transitions (lazy graduation) through their own
 * write paths but must produce byte-identical account patches.
 */
export function warmupPatchToAccountPatch(
  currentHistory: WarmupHistoryEntry[],
  patch: WarmupProgramPatch,
  entry: WarmupHistoryEntry
): UpdateAccountPatch {
  const out: UpdateAccountPatch = {};
  if (patch.status !== undefined) out.warmup_status = patch.status;
  if (patch.preset !== undefined) out.warmup_preset = patch.preset;
  if (patch.schedule !== undefined) out.warmup_schedule = patch.schedule;
  if (patch.overrides !== undefined) out.warmup_overrides = patch.overrides;
  if (patch.startedAt !== undefined) out.warmup_started_at = patch.startedAt;
  if (patch.pausedAt !== undefined) out.warmup_paused_at = patch.pausedAt;
  if (patch.pausedMs !== undefined) out.warmup_paused_ms = patch.pausedMs;
  if (patch.graduatedAt !== undefined)
    out.warmup_graduated_at = patch.graduatedAt;
  out.warmup_history = [...currentHistory, entry].slice(-MAX_WARMUP_HISTORY);
  return out;
}

function patchFromTransition(
  account: ConnectedAccount,
  transition: WarmupTransition
): UpdateAccountPatch {
  return warmupPatchToAccountPatch(
    parseWarmupHistory(account.warmup_history),
    transition.patch,
    transition.entry
  );
}

async function applyWarmupTransition(
  repo: AccountsRepository,
  workspaceId: string,
  accountId: string,
  make: (state: AccountWarmupState) => WarmupTransition | null
): Promise<ConnectedAccount | null> {
  const account = await repo.getAccount(workspaceId, accountId);
  if (!account) return null;
  const transition = make(warmupStateOf(account));
  if (!transition) return account;
  return repo.updateAccount(accountId, patchFromTransition(account, transition));
}

export function startWarmup(
  repo: AccountsRepository,
  workspaceId: string,
  accountId: string,
  choice: WarmupPresetKey | WarmupSchedule,
  options: WarmupControlOptions = {}
): Promise<ConnectedAccount | null> {
  const now = options.now ?? new Date();
  return applyWarmupTransition(repo, workspaceId, accountId, () =>
    startTransition(choice, now, options.by ?? null)
  );
}

export function pauseWarmup(
  repo: AccountsRepository,
  workspaceId: string,
  accountId: string,
  options: WarmupControlOptions = {}
): Promise<ConnectedAccount | null> {
  const now = options.now ?? new Date();
  return applyWarmupTransition(repo, workspaceId, accountId, (state) =>
    pauseTransition(state, now, options.by ?? null)
  );
}

export function resumeWarmup(
  repo: AccountsRepository,
  workspaceId: string,
  accountId: string,
  options: WarmupControlOptions = {}
): Promise<ConnectedAccount | null> {
  const now = options.now ?? new Date();
  return applyWarmupTransition(repo, workspaceId, accountId, (state) =>
    resumeTransition(state, now, options.by ?? null)
  );
}

export function restartWarmup(
  repo: AccountsRepository,
  workspaceId: string,
  accountId: string,
  options: WarmupControlOptions = {}
): Promise<ConnectedAccount | null> {
  const now = options.now ?? new Date();
  return applyWarmupTransition(repo, workspaceId, accountId, (state) =>
    restartTransition(state, now, options.by ?? null)
  );
}

export function editWarmupSchedule(
  repo: AccountsRepository,
  workspaceId: string,
  accountId: string,
  schedule: WarmupSchedule,
  options: WarmupControlOptions = {}
): Promise<ConnectedAccount | null> {
  const now = options.now ?? new Date();
  return applyWarmupTransition(repo, workspaceId, accountId, (state) =>
    editScheduleTransition(state, schedule, now, options.by ?? null)
  );
}

export function setWarmupOverride(
  repo: AccountsRepository,
  workspaceId: string,
  accountId: string,
  action: keyof WarmupLimits,
  value: number | null,
  options: WarmupControlOptions = {}
): Promise<ConnectedAccount | null> {
  const now = options.now ?? new Date();
  return applyWarmupTransition(repo, workspaceId, accountId, (state) =>
    overrideTransition(state, action, value, now, options.by ?? null)
  );
}

/** Owner action: end the program now — the account counts as ready. */
export function markWarmupReady(
  repo: AccountsRepository,
  workspaceId: string,
  accountId: string,
  options: WarmupControlOptions = {}
): Promise<ConnectedAccount | null> {
  const now = options.now ?? new Date();
  return applyWarmupTransition(repo, workspaceId, accountId, (state) =>
    graduateTransition(state, now, options.by ?? null, "marked_ready")
  );
}

/**
 * System action: record a graduation the reader derived lazily (the
 * schedule elapsed). Used by the Accounts panel and the executor's
 * store so the stored status catches up with the derived one.
 */
export function recordWarmupGraduation(
  repo: AccountsRepository,
  workspaceId: string,
  accountId: string,
  options: WarmupControlOptions = {}
): Promise<ConnectedAccount | null> {
  const now = options.now ?? new Date();
  return applyWarmupTransition(repo, workspaceId, accountId, (state) =>
    graduateTransition(state, now, null, "lazy")
  );
}
