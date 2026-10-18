import type { IntegrationStatus, Lead, PlanType } from "@/types";

/**
 * Standardized result returned by integration adapter operations.
 */
export interface AdapterResult {
  success: boolean;
  mode: "live" | "demo";
  message: string;
  data?: unknown;
}

/**
 * Interface contract for LinkedIn messaging and connection actions.
 */
export interface LinkedInAdapter {
  sendConnectionRequest(lead: Lead): Promise<AdapterResult>;
  sendMessage(lead: Lead, message: string): Promise<AdapterResult>;
  getConversations(): Promise<AdapterResult>;
  getStatus(): Promise<IntegrationStatus> | IntegrationStatus;
}

/**
 * Interface contract for transactional and cold email outreach providers.
 */
export interface EmailAdapter {
  sendEmail(
    to: string,
    subject: string,
    html: string,
    from?: string
  ): Promise<AdapterResult>;
  getStatus(): Promise<IntegrationStatus> | IntegrationStatus;
}

/**
 * Interface contract for Stripe payment and subscription operations.
 */
export interface StripeAdapter {
  getSubscription(workspaceId: string): Promise<AdapterResult>;
  createCheckoutSession(
    plan: PlanType,
    workspaceId: string
  ): Promise<AdapterResult>;
  getStatus(): Promise<IntegrationStatus> | IntegrationStatus;
}
