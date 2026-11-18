"use client";

/**
 * SmartReach panel — NOT wired into any page; the coordinator wires it in.
 * Shows connection status, health, sync status, API errors + retry
 * status, and activity (sync jobs), following the N8nLivePanels pattern
 * of sections with honest copy.
 */

import EmailOutreachPanel, {
  type EmailOutreachPanelProps,
} from "./EmailOutreachPanel";
import {
  SMARTREACH_CONFIG,
  SMARTREACH_CONFIG_READY,
  SMARTREACH_DEFINITION,
  SMARTREACH_ENV_VARS,
  SMARTREACH_VERIFIED_ENDPOINTS,
} from "@/lib/integrations/providers/email-outreach/smartreach/config";

export default function SmartReachPanel({
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
      providerId={SMARTREACH_CONFIG.providerId}
      providerName={SMARTREACH_CONFIG.name}
      status={status}
      mode={mode}
      docsUrl={SMARTREACH_CONFIG.docsUrl}
      envVars={SMARTREACH_ENV_VARS}
      verifiedEndpoints={SMARTREACH_VERIFIED_ENDPOINTS}
      configReadyNotes={SMARTREACH_CONFIG_READY}
      capabilities={SMARTREACH_DEFINITION.capabilities}
      syncJobs={syncJobs}
      lastError={lastError}
    />
  );
}
