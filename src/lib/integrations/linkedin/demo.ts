import type { IntegrationStatus, Lead } from "@/types";
import type { AdapterResult, LinkedInAdapter } from "../types";

const DEMO_NOTICE =
  "LinkedIn not connected — this is demo data. Connect a LinkedIn account in Integrations settings to enable live outreach.";

/**
 * Demo mock implementation of the LinkedInAdapter interface.
 * Returns safe mock responses without initiating external API requests.
 */
export class DemoLinkedInAdapter implements LinkedInAdapter {
  async sendConnectionRequest(_lead: Lead): Promise<AdapterResult> {
    void _lead; // demo adapter: parameter kept for the LinkedInAdapter interface
    return {
      success: false,
      mode: "demo",
      message: DEMO_NOTICE,
    };
  }

  async sendMessage(_lead: Lead, _message: string): Promise<AdapterResult> {
    void _lead;
    void _message;
    return {
      success: false,
      mode: "demo",
      message: DEMO_NOTICE,
    };
  }

  async getConversations(): Promise<AdapterResult> {
    return {
      success: false,
      mode: "demo",
      message: DEMO_NOTICE,
      data: [],
    };
  }

  getStatus(): IntegrationStatus {
    return "demo";
  }
}

/**
 * Singleton instance of the DemoLinkedInAdapter.
 */
export const demoLinkedInAdapter = new DemoLinkedInAdapter();
