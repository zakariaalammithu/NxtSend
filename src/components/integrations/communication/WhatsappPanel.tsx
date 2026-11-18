"use client";

/**
 * WhatsApp Business Platform panel — NOT wired into any page (the coordinator wires
 * panels in). Shows the stored connection state and what the
 * provider does; never claims a live connection.
 */

import ProviderPanelShell, {
  type ProviderPanelStatus,
} from "../ProviderPanelShell";
import { WHATSAPP_CONFIG } from "@/lib/integrations/providers/communication/whatsapp/config";

export default function WhatsappPanel({
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
      name={WHATSAPP_CONFIG.name}
      tagline="Sends NxtSend alerts to WhatsApp Business Platform."
      status={status}
      configured={configured}
      missing={missing}
      capabilities={[...WHATSAPP_CONFIG.capabilities]}
      setupSteps={[...WHATSAPP_CONFIG.setupSteps]}
      docsUrl={WHATSAPP_CONFIG.docsUrl}
      lastSyncAt={lastSyncAt}
      lastError={lastError}
      testId="whatsapp-panel"
    />
  );
}
