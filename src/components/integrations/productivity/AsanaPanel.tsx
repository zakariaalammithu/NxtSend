"use client";

/**
 * Asana panel — NOT wired into any page (the coordinator wires
 * panels in). Shows the stored connection state and what the
 * provider does; never claims a live connection.
 */

import ProviderPanelShell, {
  type ProviderPanelStatus,
} from "../ProviderPanelShell";
import { ASANA_CONFIG } from "@/lib/integrations/providers/productivity/asana/config";

export default function AsanaPanel({
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
      name={ASANA_CONFIG.name}
      tagline="Syncs NxtSend leads with Asana."
      status={status}
      configured={configured}
      missing={missing}
      capabilities={[...ASANA_CONFIG.capabilities]}
      setupSteps={[...ASANA_CONFIG.setupSteps]}
      docsUrl={ASANA_CONFIG.docsUrl}
      lastSyncAt={lastSyncAt}
      lastError={lastError}
      testId="asana-panel"
    />
  );
}
