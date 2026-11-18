"use client";

/**
 * Airtable panel — NOT wired into any page (the coordinator wires
 * panels in). Shows the stored connection state and what the
 * provider does; never claims a live connection.
 */

import ProviderPanelShell, {
  type ProviderPanelStatus,
} from "../ProviderPanelShell";
import { AIRTABLE_CONFIG } from "@/lib/integrations/providers/productivity/airtable/config";

export default function AirtablePanel({
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
      name={AIRTABLE_CONFIG.name}
      tagline="Syncs NxtSend leads with Airtable."
      status={status}
      configured={configured}
      missing={missing}
      capabilities={[...AIRTABLE_CONFIG.capabilities]}
      setupSteps={[...AIRTABLE_CONFIG.setupSteps]}
      docsUrl={AIRTABLE_CONFIG.docsUrl}
      lastSyncAt={lastSyncAt}
      lastError={lastError}
      testId="airtable-panel"
    />
  );
}
