"use client";

/**
 * Monday.com panel — NOT wired into any page (the coordinator wires
 * panels in). Shows the stored connection state and what the
 * provider does; never claims a live connection.
 */

import ProviderPanelShell, {
  type ProviderPanelStatus,
} from "../ProviderPanelShell";
import { MONDAY_CONFIG } from "@/lib/integrations/providers/productivity/monday/config";

export default function MondayPanel({
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
      name={MONDAY_CONFIG.name}
      tagline="Syncs NxtSend leads with Monday.com."
      status={status}
      configured={configured}
      missing={missing}
      capabilities={[...MONDAY_CONFIG.capabilities]}
      setupSteps={[...MONDAY_CONFIG.setupSteps]}
      docsUrl={MONDAY_CONFIG.docsUrl}
      lastSyncAt={lastSyncAt}
      lastError={lastError}
      testId="monday-panel"
    />
  );
}
