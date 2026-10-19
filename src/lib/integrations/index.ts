import type { IntegrationStatus } from "@/types";
import type {
  AdapterResult,
  EmailAdapter,
  LinkedInAdapter,
  StripeAdapter,
} from "./types";
import { demoLinkedInAdapter } from "./linkedin/demo";
import { demoEmailAdapter } from "./email/demo";
import { demoStripeAdapter } from "./stripe/demo";

export * from "./types";
export { demoLinkedInAdapter } from "./linkedin/demo";
export { demoEmailAdapter } from "./email/demo";
export { demoStripeAdapter } from "./stripe/demo";

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

class LiveLinkedInStub implements LinkedInAdapter {
  async sendConnectionRequest(): Promise<AdapterResult> {
    throw new NotImplementedError("Real adapter not yet configured");
  }

  async sendMessage(): Promise<AdapterResult> {
    throw new NotImplementedError("Real adapter not yet configured");
  }

  async getConversations(): Promise<AdapterResult> {
    throw new NotImplementedError("Real adapter not yet configured");
  }

  getStatus(): IntegrationStatus {
    // Stage 2c honesty fix (was F10): this stub is only constructed
    // when LinkedIn env vars exist, but every action throws — no
    // authorized provider is integrated yet, so reporting "connected"
    // would be false. "error" is the honest state until a real
    // provider adapter replaces this stub.
    return "error";
  }
}

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
 * Returns the active LinkedInAdapter instance.
 * Defaults safely to DemoLinkedInAdapter unless valid LinkedIn API credentials are provided.
 *
 * @returns LinkedInAdapter implementation.
 */
export function getLinkedInAdapter(): LinkedInAdapter {
  const isLinkedInConfigured =
    isConfigured(process.env.LINKEDIN_CLIENT_ID) ||
    isConfigured(process.env.LINKEDIN_ACCESS_TOKEN) ||
    isConfigured(process.env.UNIPHORE_API_KEY);

  if (isLinkedInConfigured) {
    return new LiveLinkedInStub();
  }

  return demoLinkedInAdapter;
}

/**
 * Returns the active EmailAdapter instance.
 * Defaults safely to DemoEmailAdapter unless valid Resend or SMTP credentials are provided.
 *
 * @returns EmailAdapter implementation.
 */
export function getEmailAdapter(): EmailAdapter {
  const isEmailConfigured =
    isConfigured(process.env.RESEND_API_KEY) ||
    isConfigured(process.env.EMAIL_SERVER_HOST);

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
