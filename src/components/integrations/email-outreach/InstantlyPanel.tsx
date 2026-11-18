"use client";

/**
 * Instantly panel — NOT wired into any page; the coordinator wires it in.
 * Shows connection status, health, sync status, API errors + retry
 * status, and activity (sync jobs), following the N8nLivePanels pattern
 * of sections with honest copy.
 */

import EmailOutreachPanel, {
  type EmailOutreachPanelProps,
} from "./EmailOutreachPanel";
import {
  INSTANTLY_CONFIG,
  INSTANTLY_CONFIG_READY,
  INSTANTLY_DEFINITION,
  INSTANTLY_ENV_VARS,
  INSTANTLY_VERIFIED_ENDPOINTS,
} from "@/lib/integrations/providers/email-outreach/instantly/config";

export default function InstantlyPanel({
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
      providerId={INSTANTLY_CONFIG.providerId}
      providerName={INSTANTLY_CONFIG.name}
      status={status}
      mode={mode}
      docsUrl={INSTANTLY_CONFIG.docsUrl}
      envVars={INSTANTLY_ENV_VARS}
      verifiedEndpoints={INSTANTLY_VERIFIED_ENDPOINTS}
      configReadyNotes={INSTANTLY_CONFIG_READY}
      capabilities={INSTANTLY_DEFINITION.capabilities}
      syncJobs={syncJobs}
      lastError={lastError}
    />
  );
}
