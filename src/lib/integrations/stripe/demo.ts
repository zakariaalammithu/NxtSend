import type { IntegrationStatus, PlanType } from "@/types";
import type { AdapterResult, StripeAdapter } from "../types";

const DEMO_CHECKOUT_NOTICE =
  "Stripe not configured — no payment will be processed. Add Stripe credentials to enable billing.";

/**
 * Demo implementation of StripeAdapter interface.
 * Returns mock subscription data and prevents actual payment sessions.
 */
export class DemoStripeAdapter implements StripeAdapter {
  async getSubscription(workspaceId: string): Promise<AdapterResult> {
    return {
      success: true,
      mode: "demo",
      message: "Mock subscription active for demo environment.",
      data: {
        id: "sub_demo_free",
        workspace_id: workspaceId,
        plan: "free" as PlanType,
        status: "active",
        is_demo: true,
        current_period_end: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString(),
        created_at: new Date().toISOString(),
      },
    };
  }

  async createCheckoutSession(
    _plan: PlanType,
    _workspaceId: string
  ): Promise<AdapterResult> {
    void _plan; // demo adapter: parameters kept for the StripeAdapter interface
    void _workspaceId;
    return {
      success: false,
      mode: "demo",
      message: DEMO_CHECKOUT_NOTICE,
    };
  }

  getStatus(): IntegrationStatus {
    return "demo";
  }
}

/**
 * Singleton instance of DemoStripeAdapter.
 */
export const demoStripeAdapter = new DemoStripeAdapter();
