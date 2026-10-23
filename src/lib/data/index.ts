/**
 * Data layer entry point.
 *
 * Pages and components should import repositories from here instead of
 * touching mock data or Supabase tables directly:
 *
 *   const leadsRepo = getLeadsRepository();
 *   const leads = await leadsRepo.listLeads(workspaceId);
 *
 * `repo.mode` tells the UI whether it is showing demo data ("demo") or
 * live database data ("supabase") so demo labelling stays honest.
 */

import { getDataMode } from "./mode";
import { createLeadsRepository, type LeadsRepository } from "./leads";
import { createCampaignsRepository, type CampaignsRepository } from "./campaigns";
import {
  createIntegrationsRepository,
  type IntegrationsRepository,
} from "./integrations";
import { createAdminRepository, type AdminRepository } from "./admin";
import {
  createAccountsRepository,
  type AccountsRepository,
} from "./accounts";
import { createInboxRepository, type InboxRepository } from "./inbox";
import { createUsageRepository, type UsageRepository } from "./usage";
import type { SupabaseClient } from "@supabase/supabase-js";

export { getDataMode, isSupabaseConfigured } from "./mode";
export type { DataMode } from "./mode";
export { resolveWorkspaceId, DEMO_WORKSPACE_ID, DEMO_USER_ID } from "./workspace";
export type { LeadsRepository, CreateLeadInput } from "./leads";
export type {
  CampaignsRepository,
  CampaignStepDraft,
  CreateCampaignInput,
  ActivityEntry,
  EnrollmentRecord,
} from "./campaigns";
export type { IntegrationsRepository } from "./integrations";
export type {
  AccountsRepository,
  CreateAccountInput,
  UpdateAccountPatch,
} from "./accounts";
export {
  DEMO_LINKEDIN_ACCOUNT_ID,
  DEMO_EMAIL_ACCOUNT_ID,
  accountLimits,
  accountSenderVars,
  profileSenderVars,
  resolveSenderVars,
  withDefaultLimits,
  warmupStateOf,
  notStartedWarmupFields,
  warmupPatchToAccountPatch,
  startWarmup,
  pauseWarmup,
  resumeWarmup,
  restartWarmup,
  editWarmupSchedule,
  setWarmupOverride,
  markWarmupReady,
  recordWarmupGraduation,
} from "./accounts";
export type { WarmupControlOptions } from "./accounts";
export type {
  AdminRepository,
  AdminUserRecord,
  AdminOverview,
  AdminUserStatus,
} from "./admin";
export type {
  InboxRepository,
  InboxConversation,
  InboxMessage,
  ConversationSummary,
  ListConversationsOptions,
  InsertMessageInput,
} from "./inbox";
export type { UsageRepository, WorkspaceUsage, UsageSource } from "./usage";
export {
  listMessageHistory,
  classifyMessage,
  type HistoryMessage,
  type MessageVerification,
} from "./message-history";
export {
  loadCampaignStats,
  loadCampaignExecutions,
  computeCampaignStats,
  aggregateCampaignStats,
  countEmailEvents,
  type CampaignStats,
  type CampaignStatsDeps,
  type CampaignStatsSource,
  type EmailEventCounts,
} from "./campaign-stats";

let leadsRepo: LeadsRepository | null = null;
let campaignsRepo: CampaignsRepository | null = null;
let accountsRepo: AccountsRepository | null = null;
let integrationsRepo: IntegrationsRepository | null = null;
let adminRepo: AdminRepository | null = null;
let demoInboxRepo: InboxRepository | null = null;
let usageRepo: UsageRepository | null = null;

export function getUsageRepository(): UsageRepository {
  if (!usageRepo) usageRepo = createUsageRepository(getDataMode());
  return usageRepo;
}

export function getLeadsRepository(): LeadsRepository {
  if (!leadsRepo) leadsRepo = createLeadsRepository(getDataMode());
  return leadsRepo;
}

export function getCampaignsRepository(): CampaignsRepository {
  if (!campaignsRepo) campaignsRepo = createCampaignsRepository(getDataMode());
  return campaignsRepo;
}

export function getAccountsRepository(): AccountsRepository {
  if (!accountsRepo) accountsRepo = createAccountsRepository(getDataMode());
  return accountsRepo;
}

export function getIntegrationsRepository(): IntegrationsRepository {
  if (!integrationsRepo) integrationsRepo = createIntegrationsRepository(getDataMode());
  return integrationsRepo;
}

export function getAdminRepository(): AdminRepository {
  if (!adminRepo) adminRepo = createAdminRepository(getDataMode());
  return adminRepo;
}

/**
 * Inbox repository. In Supabase mode the repository is bound to the
 * caller's client (API routes pass the session client so RLS applies),
 * so a fresh instance is created per call; the demo backend is a
 * singleton over the shared demo store.
 */
export function getInboxRepository(client?: SupabaseClient | null): InboxRepository {
  const mode = getDataMode();
  if (mode === "supabase") return createInboxRepository(mode, client);
  if (!demoInboxRepo) demoInboxRepo = createInboxRepository(mode);
  return demoInboxRepo;
}
