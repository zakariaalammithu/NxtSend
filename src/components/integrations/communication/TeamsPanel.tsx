"use client";

/**
 * Microsoft Teams panel — NOT wired into any page (the coordinator wires
 * panels in). Shows the stored connection state and what the
 * provider does; never claims a live connection.
 */

import ProviderPanelShell, {
  type ProviderPanelStatus,
} from "../ProviderPanelShell";
import { TEAMS_CONFIG } from "@/lib/integrations/providers/communication/teams/config";

export default function TeamsPanel({
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
      name={TEAMS_CONFIG.name}
      tagline="Sends NxtSend alerts to Microsoft Teams."
      status={status}
      configured={configured}
      missing={missing}
      capabilities={[...TEAMS_CONFIG.capabilities]}
      setupSteps={[...TEAMS_CONFIG.setupSteps]}
      docsUrl={TEAMS_CONFIG.docsUrl}
      lastSyncAt={lastSyncAt}
      lastError={lastError}
      testId="teams-panel"
    />
  );
}
