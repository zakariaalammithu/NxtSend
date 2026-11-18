"use client";

/**
 * Google Drive panel — NOT wired into any page (the coordinator wires
 * panels in). Shows the stored connection state and what the
 * provider does; never claims a live connection.
 */

import ProviderPanelShell, {
  type ProviderPanelStatus,
} from "../ProviderPanelShell";
import { DRIVE_CONFIG } from "@/lib/integrations/providers/productivity/drive/config";

export default function DrivePanel({
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
      name={DRIVE_CONFIG.name}
      tagline="Syncs NxtSend leads with Google Drive."
      status={status}
      configured={configured}
      missing={missing}
      capabilities={[...DRIVE_CONFIG.capabilities]}
      setupSteps={[...DRIVE_CONFIG.setupSteps]}
      docsUrl={DRIVE_CONFIG.docsUrl}
      lastSyncAt={lastSyncAt}
      lastError={lastError}
      testId="google-drive-panel"
    />
  );
}
