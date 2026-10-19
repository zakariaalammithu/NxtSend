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

export interface Campaign {
  id: string;
  workspace_id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type StepType =
  | "connection_request"
  | "linkedin_message"
  | "email"
  | "wait"
  | "condition";

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
