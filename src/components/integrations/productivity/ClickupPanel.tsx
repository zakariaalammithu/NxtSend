"use client";

/**
 * ClickUp panel — NOT wired into any page (the coordinator wires
 * panels in). Shows the stored connection state and what the
 * provider does; never claims a live connection.
 */

import ProviderPanelShell, {
  type ProviderPanelStatus,
} from "../ProviderPanelShell";
import { CLICKUP_CONFIG } from "@/lib/integrations/providers/productivity/clickup/config";

export default function ClickupPanel({
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
      name={CLICKUP_CONFIG.name}
      tagline="Syncs NxtSend leads with ClickUp."
      status={status}
      configured={configured}
      missing={missing}
      capabilities={[...CLICKUP_CONFIG.capabilities]}
      setupSteps={[...CLICKUP_CONFIG.setupSteps]}
      docsUrl={CLICKUP_CONFIG.docsUrl}
      lastSyncAt={lastSyncAt}
      lastError={lastError}
      testId="clickup-panel"
    />
  );
}
