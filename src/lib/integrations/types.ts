import type { IntegrationStatus, PlanType } from "@/types";

/**
 * Standardized result returned by integration adapter operations.
 */
export interface AdapterResult {
  success: boolean;
  mode: "live" | "demo";
  message: string;
  data?: unknown;
}

// NOTE (P5 Stage F): there is deliberately no LinkedInAdapter in this
// legacy module anymore. The single LinkedIn seam is
// LinkedInProviderAdapter in src/lib/linkedin — the legacy interface
// that lived here (a demo class + a throwing live stub behind a
// caller-less factory) was retired so no second, divergent LinkedIn
// contract can drift back in.

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
