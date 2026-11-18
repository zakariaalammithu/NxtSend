"use client";

/**
 * Notion panel — NOT wired into any page (the coordinator wires
 * panels in). Shows the stored connection state and what the
 * provider does; never claims a live connection.
 */

import ProviderPanelShell, {
  type ProviderPanelStatus,
} from "../ProviderPanelShell";
import { NOTION_CONFIG } from "@/lib/integrations/providers/productivity/notion/config";

export default function NotionPanel({
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
      name={NOTION_CONFIG.name}
      tagline="Syncs NxtSend leads with Notion."
      status={status}
      configured={configured}
      missing={missing}
      capabilities={[...NOTION_CONFIG.capabilities]}
      setupSteps={[...NOTION_CONFIG.setupSteps]}
      docsUrl={NOTION_CONFIG.docsUrl}
      lastSyncAt={lastSyncAt}
      lastError={lastError}
      testId="notion-panel"
    />
  );
}
