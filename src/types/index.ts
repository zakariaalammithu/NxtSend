/**
 * NxtSend SaaS Application Core TypeScript Definitions
 * Covers authentication, workspaces, campaigns, leads, integrations, and UI models.
 */

// ============================================================================
// User & Auth Types
// ============================================================================

export type UserRole = "super_admin" | "admin" | "user";

export interface Profile {
  id: string;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
  role: UserRole;
  /** Account status (migration 002). Absent on rows read before 002. */
  status?: "active" | "suspended";
  created_at: string;
}

// ============================================================================
// Workspace & Membership Types
// ============================================================================

export type PlanType = "free" | "starter" | "growth" | "agency";

export interface Workspace {
  id: string;
  owner_id: string;
  name: string;
  plan: PlanType;
  created_at: string;
}

export type WorkspaceMemberRole = "owner" | "admin" | "member";

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: WorkspaceMemberRole;
}

// ============================================================================
// Campaign & Step Types
// ============================================================================

export type CampaignType = "linkedin" | "email" | "mixed";

export type CampaignStatus = "draft" | "active" | "paused" | "archived";

/**
 * Where a campaign's audience came from (wizard Step 2). CSV sources
 * carry the import provenance; LinkedIn sources carry the definition the
 * user entered — collecting people from them starts only when an
 * authorized LinkedIn provider is connected (no provider exists yet, so
 * a saved LinkedIn source never produces invented leads).
 */
export type AudienceSourceType =
  | "csv"
  | "my_network"
  | "linkedin_search"
  | "post_engagement"
  | "event_attendees"
  | "group_members";

export interface CampaignAudienceSource {
  type: AudienceSourceType;
  /** LinkedIn sources: the URL the user pasted. */
  url?: string;
  /** LinkedIn sources: how many people the user asked to collect. */
  requested_count?: number;
  /** CSV sources: the file the audience was imported from. */
  file_name?: string;
  /** CSV sources: people imported from this source so far. */
  imported_count?: number;
}

/** Default daily warm-up limits for a LinkedIn account (wizard Step 1). */
export interface WarmupLimits {
  connection_requests: number;
  messages: number;
  profile_views: number;
  like_post: number;
  endorse_skills: number;
  find_email: number;
}

export type AccountChannel = "linkedin" | "email";

export type ConnectedAccountStatus =
  | "connected"
  | "demo"
  | "error"
  | "disconnected";

/**
 * Last recorded authorization state of an account AT its provider
 * (migration 013, `connected_accounts.auth_status`). Written only by
 * a provider integration when it connects, syncs, or learns the
 * authorization died — a recorded state, never a live claim:
 *   "ok"               the provider last reported the account authorized
 *   "needs_reconnect"  the provider asks for re-authorization
 *   "expired"          the grant/token expired
 *   "error"            the provider reported an error (see last_error)
 *   "not_connected"    nothing has authorized this record (the default)
 */
export type AccountAuthStatus =
  | "ok"
  | "needs_reconnect"
  | "expired"
  | "error"
  | "not_connected";

/**
 * A connected sending account (migration 011, `connected_accounts`).
 * One row per channel identity a workspace sends from: it carries the
 * warm-up state, the per-account daily limits and the sender identity
 * that fills the {my_*} template variables. In Demo Mode the demo
 * backend seeds two clearly-labelled demo accounts (status "demo").
 */
export interface ConnectedAccount {
  id: string;
  workspace_id: string;
  channel: AccountChannel;
  /** e.g. "linkedin" (approved provider) or "resend" for email. */
  provider: string;
  display_name: string;
  /** LinkedIn profile slug/URL or the sending email address. */
  handle_or_email: string;
  avatar_url: string | null;
  status: ConnectedAccountStatus;
  /**
   * Provider identity + auth health (migration 013). All four are
   * provider-integration facts: `provider_account_id` is the id the
   * provider's API knows the account by; `auth_status` is the last
   * recorded authorization state; `last_sync_at` / `last_error` are
   * the last sync time and the provider's last error text (verbatim).
   * Hand-created and demo records carry nulls + "not_connected"
   * (the demo LinkedIn seed is the one exception — see accounts.ts).
   */
  provider_account_id: string | null;
  auth_status: AccountAuthStatus;
  last_sync_at: string | null;
  last_error: string | null;
  warmup_enabled: boolean;
  daily_limits: WarmupLimits;
  sender_first_name: string;
  sender_last_name: string;
  sender_job_title: string;
  sender_company: string;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  workspace_id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  /**
   * Wizard metadata. Persisted by the demo repository on the record,
   * and by the Supabase repository in the `campaigns.config` JSONB
   * column (migration 011; `rowToCampaign` reads them back out of
   * the `config` object).
   */
  description?: string;
  audience_source?: CampaignAudienceSource | null;
  warmup_limits?: WarmupLimits;
  /**
   * Connected accounts this campaign sends from (migration 011,
   * `campaigns.sender_account_id` / `email_account_id`). Nullable:
   * deleting an account nulls the reference (ON DELETE SET NULL) and
   * readers fall back to the workspace's general sending state.
   */
  sender_account_id?: string | null;
  email_account_id?: string | null;
}

export type StepType =
  | "connection_request"
  | "linkedin_message"
  | "email"
  | "wait"
  | "condition"
  // Closely-style LinkedIn touch steps (P4 Stage 3). Postgres enum
  // values added by migration 011. Like every LinkedIn step, the
  // executor records them SKIPPED — no authorized LinkedIn provider.
  | "like_post"
  | "view_profile"
  | "endorse_skills";

export interface CampaignStep {
  id: string;
  campaign_id: string;
  step_order: number;
  step_type: StepType;
  delay_hours: number;
  subject?: string;
  content?: string;
  config: Record<string, unknown>;
}

// ============================================================================
// Lead & Enrollment Types
// ============================================================================

export type LeadStatus =
  | "new"
  | "contacted"
  | "replied"
  | "converted"
  | "unresponsive"
  | string;

export interface Lead {
  id: string;
  workspace_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  linkedin_url?: string;
  company?: string;
  job_title?: string;
  status: LeadStatus;
  tags: string[];
  custom_fields: Record<string, unknown>;
  created_at: string;
}

export type EnrollmentStatus =
  | "pending"
  | "active"
  | "completed"
  | "stopped"
  | "error";

export interface CampaignEnrollment {
  id: string;
  campaign_id: string;
  lead_id: string;
  status: EnrollmentStatus;
  current_step: number;
  enrolled_at: string;
}

// ============================================================================
// Messaging & Communication Types
// ============================================================================

export type MessageChannel = "linkedin" | "email";

export type MessageDirection = "outbound" | "inbound";

export type MessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "replied"
  | "failed"
  | string;

export interface Message {
  id: string;
  workspace_id: string;
  lead_id: string;
  campaign_id?: string;
  channel: MessageChannel;
  direction: MessageDirection;
  subject?: string;
  content: string;
  status: MessageStatus;
  is_demo: boolean;
  sent_at: string;
}

// ============================================================================
// Integration Types
// ============================================================================

export type IntegrationStatus = "connected" | "disconnected" | "error" | "demo";

export interface Integration {
  id: string;
  workspace_id: string;
  provider: string;
  status: IntegrationStatus;
  config: Record<string, unknown>;
  updated_at: string;
}

// ============================================================================
// Billing & Subscription Types
// ============================================================================

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | string;

export interface Subscription {
  id: string;
  workspace_id: string;
  plan: PlanType;
  status: SubscriptionStatus;
  stripe_subscription_id?: string;
  current_period_end?: string;
  created_at: string;
}

// ============================================================================
// Audit & Compliance Types
// ============================================================================

export interface AuditLog {
  id: string;
  workspace_id?: string;
  actor_id?: string;
  action: string;
  resource?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ============================================================================
// Integration Adapter Result
// ============================================================================

export interface AdapterResult {
  success: boolean;
  mode: "live" | "demo";
  message: string;
  data?: unknown;
}

// ============================================================================
// Navigation & Dashboard UI Types
// ============================================================================

export interface NavItem {
  label: string;
  href: string;
  icon?: string;
  children?: NavItem[];
}

export interface DashboardStat {
  label: string;
  value: string | number;
  change?: number;
  changeType?: "up" | "down";
  icon?: string;
}
