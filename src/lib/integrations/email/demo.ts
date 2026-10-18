import type { IntegrationStatus } from "@/types";
import type { AdapterResult, EmailAdapter } from "../types";

const DEMO_NOTICE =
  "Email provider not connected — no email was sent. Configure an email provider in Integrations settings.";

/**
 * Demo implementation of the EmailAdapter interface.
 * Logs email attempts to console with [DEMO] prefix and returns demo failure status.
 */
export class DemoEmailAdapter implements EmailAdapter {
  async sendEmail(
    to: string,
    subject: string,
    _html: string,
    from?: string
  ): Promise<AdapterResult> {
    console.info(
      `[DEMO] Outbound email simulated to: ${to} | Subject: "${subject}" | From: ${from ?? "default"}`
    );

    return {
      success: false,
      mode: "demo",
      message: DEMO_NOTICE,
    };
  }

  getStatus(): IntegrationStatus {
    return "demo";
  }
}

/**
 * Singleton instance of DemoEmailAdapter.
 */
export const demoEmailAdapter = new DemoEmailAdapter();
