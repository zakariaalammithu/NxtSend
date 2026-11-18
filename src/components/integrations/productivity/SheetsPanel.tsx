"use client";

/**
 * Google Sheets panel — NOT wired into any page (the coordinator wires
 * panels in). Shows the stored connection state and what the
 * provider does; never claims a live connection.
 */

import ProviderPanelShell, {
  type ProviderPanelStatus,
} from "../ProviderPanelShell";
import { SHEETS_CONFIG } from "@/lib/integrations/providers/productivity/sheets/config";

export default function SheetsPanel({
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
      name={SHEETS_CONFIG.name}
      tagline="Syncs NxtSend leads with Google Sheets."
      status={status}
      configured={configured}
      missing={missing}
      capabilities={[...SHEETS_CONFIG.capabilities]}
      setupSteps={[...SHEETS_CONFIG.setupSteps]}
      docsUrl={SHEETS_CONFIG.docsUrl}
      lastSyncAt={lastSyncAt}
      lastError={lastError}
      testId="google-sheets-panel"
    />
  );
}
