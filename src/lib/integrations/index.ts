import type { IntegrationStatus } from "@/types";
import type {
  AdapterResult,
  EmailAdapter,
  StripeAdapter,
} from "./types";
import { demoEmailAdapter } from "./email/demo";
import { demoStripeAdapter } from "./stripe/demo";

export * from "./types";
export { demoEmailAdapter } from "./email/demo";
export { demoStripeAdapter } from "./stripe/demo";

// NOTE (P5 Stage F): the legacy LinkedIn adapter that lived here —
// a demo class, a throwing live stub, and a caller-less factory —
// has been RETIRED. There is exactly ONE LinkedIn seam now:
// LinkedInProviderAdapter in src/lib/linkedin (createLinkedInAdapter).
// Nothing in this legacy module speaks for LinkedIn anymore.

/**
 * Error thrown when a production adapter method is called before its external client is wired.
 */
export class NotImplementedError extends Error {
  constructor(message = "Real adapter not yet configured") {
    super(message);
    this.name = "NotImplementedError";
  }
}

/**
 * Shared env check (src/lib/env.ts) — separates "operator supplied a
 * value" from the .env.example placeholders.
 */
import { isConfiguredValue as isConfigured } from "@/lib/env";
import { getEmailState } from "@/lib/email/state";
import { getBillingState } from "@/lib/billing/state";

// ----------------------------------------------------------------------------
// Production Adapter Stubs
// ----------------------------------------------------------------------------

class LiveEmailStub implements EmailAdapter {
  async sendEmail(): Promise<AdapterResult> {
    return {
      success: false,
      mode: "live",
      message:
        "This legacy adapter has no workspace context, so the mandatory suppression check cannot run. Use the workspace-scoped provider in src/lib/email (getEmailProvider().sendEmail) instead. No email was sent.",
    };
  }

  getStatus(): IntegrationStatus {
    const state = getEmailState();
    if (state === "connected") return "connected";
    if (state === "demo") return "demo";
    if (state === "error") return "error";
    return "disconnected";
  }
}

class LiveStripeStub implements StripeAdapter {
  async getSubscription(): Promise<AdapterResult> {
    return {
      success: false,
      mode: "live",
      message:
        "Subscription state is managed by the verified Stripe webhook (src/lib/billing). Read the subscriptions table / billing routes instead. Nothing was fabricated.",
    };
  }

  async createCheckoutSession(): Promise<AdapterResult> {
    return {
      success: false,
      mode: "live",
      message:
        "Checkout requires an authenticated request context. Use POST /api/billing/checkout (src/lib/billing). No session was created.",
    };
  }

  getStatus(): IntegrationStatus {
    const state = getBillingState();
    if (state === "connected") return "connected";
    if (state === "demo") return "demo";
    if (state === "error") return "error";
    return "disconnected";
  }
}

// ----------------------------------------------------------------------------
// Adapter Factory Functions
// ----------------------------------------------------------------------------

/**
 * Returns the active EmailAdapter instance.
 * Defaults safely to DemoEmailAdapter unless a Resend key is present
 * (the stub itself refuses to send — real sending is workspace-scoped
 * in src/lib/email). NOTE: this legacy factory currently has no
 * callers. The former EMAIL_SERVER_HOST (SMTP) read was removed in
 * P5: no SMTP transport exists in the codebase; sending is
 * Resend-only.
 *
 * @returns EmailAdapter implementation.
 */
export function getEmailAdapter(): EmailAdapter {
  const isEmailConfigured = isConfigured(process.env.RESEND_API_KEY);

  if (isEmailConfigured) {
    return new LiveEmailStub();
  }

  return demoEmailAdapter;
}

/**
 * Returns the active StripeAdapter instance.
 * Defaults safely to DemoStripeAdapter unless valid Stripe API keys are configured.
 *
 * @returns StripeAdapter implementation.
 */
export function getStripeAdapter(): StripeAdapter {
  const isStripeConfigured = isConfigured(process.env.STRIPE_SECRET_KEY);

  if (isStripeConfigured) {
    return new LiveStripeStub();
  }

  return demoStripeAdapter;
}
