"use client";

/**
 * Calendly panel — NOT wired into any page (the coordinator wires
 * panels in). Shows the stored connection state and what the
 * provider does; never claims a live connection.
 */

import ProviderPanelShell, {
  type ProviderPanelStatus,
} from "../ProviderPanelShell";
import { CALENDLY_CONFIG } from "@/lib/integrations/providers/productivity/calendly/config";

export default function CalendlyPanel({
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
      name={CALENDLY_CONFIG.name}
      tagline="Syncs NxtSend leads with Calendly."
      status={status}
      configured={configured}
      missing={missing}
      capabilities={[...CALENDLY_CONFIG.capabilities]}
      setupSteps={[...CALENDLY_CONFIG.setupSteps]}
      docsUrl={CALENDLY_CONFIG.docsUrl}
      lastSyncAt={lastSyncAt}
      lastError={lastError}
      testId="calendly-panel"
    />
  );
}
