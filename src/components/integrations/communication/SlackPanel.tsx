"use client";

/**
 * Slack panel — NOT wired into any page (the coordinator wires
 * panels in). Shows the stored connection state and what the
 * provider does; never claims a live connection.
 */

import ProviderPanelShell, {
  type ProviderPanelStatus,
} from "../ProviderPanelShell";
import { SLACK_CONFIG } from "@/lib/integrations/providers/communication/slack/config";

export default function SlackPanel({
  status = "disconnected",
  configured = false,
  missing = [],
  lastSyncAt = null,
  lastError = null,
}: {
  status?: ProviderPanelStatus;
  configured?: boolean;
  missing?: string[];
  lastSyncAt?: string | null;
  lastError?: string | null;
}) {
  return (
    <ProviderPanelShell
      name={SLACK_CONFIG.name}
      tagline="Sends NxtSend alerts to Slack."
      status={status}
      configured={configured}
      missing={missing}
      capabilities={[...SLACK_CONFIG.capabilities]}
      setupSteps={[...SLACK_CONFIG.setupSteps]}
      docsUrl={SLACK_CONFIG.docsUrl}
      lastSyncAt={lastSyncAt}
      lastError={lastError}
      testId="slack-panel"
    />
  );
}
