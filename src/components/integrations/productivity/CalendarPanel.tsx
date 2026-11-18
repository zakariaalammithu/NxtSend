"use client";

/**
 * Google Calendar panel — NOT wired into any page (the coordinator wires
 * panels in). Shows the stored connection state and what the
 * provider does; never claims a live connection.
 */

import ProviderPanelShell, {
  type ProviderPanelStatus,
} from "../ProviderPanelShell";
import { CALENDAR_CONFIG } from "@/lib/integrations/providers/productivity/calendar/config";

export default function CalendarPanel({
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
      name={CALENDAR_CONFIG.name}
      tagline="Syncs NxtSend leads with Google Calendar."
      status={status}
      configured={configured}
      missing={missing}
      capabilities={[...CALENDAR_CONFIG.capabilities]}
      setupSteps={[...CALENDAR_CONFIG.setupSteps]}
      docsUrl={CALENDAR_CONFIG.docsUrl}
      lastSyncAt={lastSyncAt}
      lastError={lastError}
      testId="google-calendar-panel"
    />
  );
}
