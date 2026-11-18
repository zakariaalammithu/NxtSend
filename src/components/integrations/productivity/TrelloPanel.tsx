"use client";

/**
 * Trello panel — NOT wired into any page (the coordinator wires
 * panels in). Shows the stored connection state and what the
 * provider does; never claims a live connection.
 */

import ProviderPanelShell, {
  type ProviderPanelStatus,
} from "../ProviderPanelShell";
import { TRELLO_CONFIG } from "@/lib/integrations/providers/productivity/trello/config";

export default function TrelloPanel({
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
      name={TRELLO_CONFIG.name}
      tagline="Syncs NxtSend leads with Trello."
      status={status}
      configured={configured}
      missing={missing}
      capabilities={[...TRELLO_CONFIG.capabilities]}
      setupSteps={[...TRELLO_CONFIG.setupSteps]}
      docsUrl={TRELLO_CONFIG.docsUrl}
      lastSyncAt={lastSyncAt}
      lastError={lastError}
      testId="trello-panel"
    />
  );
}
