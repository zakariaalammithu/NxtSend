"use client";

/**
 * Linear panel — NOT wired into any page (the coordinator wires
 * panels in). Shows the stored connection state and what the
 * provider does; never claims a live connection.
 */

import ProviderPanelShell, {
  type ProviderPanelStatus,
} from "../ProviderPanelShell";
import { LINEAR_CONFIG } from "@/lib/integrations/providers/productivity/linear/config";

export default function LinearPanel({
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
      name={LINEAR_CONFIG.name}
      tagline="Syncs NxtSend leads with Linear."
      status={status}
      configured={configured}
      missing={missing}
      capabilities={[...LINEAR_CONFIG.capabilities]}
      setupSteps={[...LINEAR_CONFIG.setupSteps]}
      docsUrl={LINEAR_CONFIG.docsUrl}
      lastSyncAt={lastSyncAt}
      lastError={lastError}
      testId="linear-panel"
    />
  );
}
