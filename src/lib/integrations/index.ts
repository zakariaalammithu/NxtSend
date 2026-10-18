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
 * Helper to determine if an environment variable holds a realistic non-placeholder value.
 */
function isConfigured(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return (
    trimmed.length > 0 &&
    !trimmed.includes("placeholder") &&
    !trimmed.startsWith("your-") &&
    !trimmed.startsWith("sk_test_placeholder")
  );
}

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
    return "connected";
  }
}

class LiveEmailStub implements EmailAdapter {
  async sendEmail(): Promise<AdapterResult> {
    throw new NotImplementedError("Real adapter not yet configured");
  }

  getStatus(): IntegrationStatus {
    return "connected";
  }
}

class LiveStripeStub implements StripeAdapter {
  async getSubscription(): Promise<AdapterResult> {
    throw new NotImplementedError("Real adapter not yet configured");
  }

  async createCheckoutSession(): Promise<AdapterResult> {
    throw new NotImplementedError("Real adapter not yet configured");
  }

  getStatus(): IntegrationStatus {
    return "connected";
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
