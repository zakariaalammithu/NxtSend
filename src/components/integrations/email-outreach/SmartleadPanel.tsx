"use client";

/**
 * Smartlead panel — NOT wired into any page; the coordinator wires it in.
 * Shows connection status, health, sync status, API errors + retry
 * status, and activity (sync jobs), following the N8nLivePanels pattern
 * of sections with honest copy.
 */

import EmailOutreachPanel, {
  type EmailOutreachPanelProps,
} from "./EmailOutreachPanel";
import {
  SMARTLEAD_CONFIG,
  SMARTLEAD_CONFIG_READY,
  SMARTLEAD_DEFINITION,
  SMARTLEAD_ENV_VARS,
  SMARTLEAD_VERIFIED_ENDPOINTS,
} from "@/lib/integrations/providers/email-outreach/smartlead/config";

export default function SmartleadPanel({
  status,
  mode,
  syncJobs,
  lastError,
}: {
  status: string;
  mode: string;
  syncJobs?: EmailOutreachPanelProps["syncJobs"];
  lastError?: string | null;
}) {
  return (
    <EmailOutreachPanel
      providerId={SMARTLEAD_CONFIG.providerId}
      providerName={SMARTLEAD_CONFIG.name}
      status={status}
      mode={mode}
      docsUrl={SMARTLEAD_CONFIG.docsUrl}
      envVars={SMARTLEAD_ENV_VARS}
      verifiedEndpoints={SMARTLEAD_VERIFIED_ENDPOINTS}
      configReadyNotes={SMARTLEAD_CONFIG_READY}
      capabilities={SMARTLEAD_DEFINITION.capabilities}
      syncJobs={syncJobs}
      lastError={lastError}
    />
  );
}
