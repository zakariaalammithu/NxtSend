"use client";

/**
 * Jira panel — NOT wired into any page (the coordinator wires
 * panels in). Shows the stored connection state and what the
 * provider does; never claims a live connection.
 */

import ProviderPanelShell, {
  type ProviderPanelStatus,
} from "../ProviderPanelShell";
import { JIRA_CONFIG } from "@/lib/integrations/providers/productivity/jira/config";

export default function JiraPanel({
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
      name={JIRA_CONFIG.name}
      tagline="Syncs NxtSend leads with Jira."
      status={status}
      configured={configured}
      missing={missing}
      capabilities={[...JIRA_CONFIG.capabilities]}
      setupSteps={[...JIRA_CONFIG.setupSteps]}
      docsUrl={JIRA_CONFIG.docsUrl}
      lastSyncAt={lastSyncAt}
      lastError={lastError}
      testId="jira-panel"
    />
  );
}
