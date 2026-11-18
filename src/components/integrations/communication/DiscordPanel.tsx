"use client";

/**
 * Discord panel — NOT wired into any page (the coordinator wires
 * panels in). Shows the stored connection state and what the
 * provider does; never claims a live connection.
 */

import ProviderPanelShell, {
  type ProviderPanelStatus,
} from "../ProviderPanelShell";
import { DISCORD_CONFIG } from "@/lib/integrations/providers/communication/discord/config";

export default function DiscordPanel({
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
      name={DISCORD_CONFIG.name}
      tagline="Sends NxtSend alerts to Discord."
      status={status}
      configured={configured}
      missing={missing}
      capabilities={[...DISCORD_CONFIG.capabilities]}
      setupSteps={[...DISCORD_CONFIG.setupSteps]}
      docsUrl={DISCORD_CONFIG.docsUrl}
      lastSyncAt={lastSyncAt}
      lastError={lastError}
      testId="discord-panel"
    />
  );
}
