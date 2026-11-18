"use client";

/**
 * Telegram Bot panel — NOT wired into any page (the coordinator wires
 * panels in). Shows the stored connection state and what the
 * provider does; never claims a live connection.
 */

import ProviderPanelShell, {
  type ProviderPanelStatus,
} from "../ProviderPanelShell";
import { TELEGRAM_CONFIG } from "@/lib/integrations/providers/communication/telegram/config";

export default function TelegramPanel({
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
      name={TELEGRAM_CONFIG.name}
      tagline="Sends NxtSend alerts to Telegram Bot."
      status={status}
      configured={configured}
      missing={missing}
      capabilities={[...TELEGRAM_CONFIG.capabilities]}
      setupSteps={[...TELEGRAM_CONFIG.setupSteps]}
      docsUrl={TELEGRAM_CONFIG.docsUrl}
      lastSyncAt={lastSyncAt}
      lastError={lastError}
      testId="telegram-panel"
    />
  );
}
