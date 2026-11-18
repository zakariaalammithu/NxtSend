"use client";

/**
 * Snov.io panel — NOT wired into any page; the coordinator wires it in.
 * Shows connection status, health, sync status, API errors + retry
 * status, and activity (sync jobs), following the N8nLivePanels pattern
 * of sections with honest copy.
 */

import EmailOutreachPanel, {
  type EmailOutreachPanelProps,
} from "./EmailOutreachPanel";
import {
  SNOV_CONFIG,
  SNOV_CONFIG_READY,
  SNOV_DEFINITION,
  SNOV_ENV_VARS,
  SNOV_VERIFIED_ENDPOINTS,
} from "@/lib/integrations/providers/email-outreach/snov/config";

export default function SnovPanel({
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
      providerId={SNOV_CONFIG.providerId}
      providerName={SNOV_CONFIG.name}
      status={status}
      mode={mode}
      docsUrl={SNOV_CONFIG.docsUrl}
      envVars={SNOV_ENV_VARS}
      verifiedEndpoints={SNOV_VERIFIED_ENDPOINTS}
      configReadyNotes={SNOV_CONFIG_READY}
      capabilities={SNOV_DEFINITION.capabilities}
      syncJobs={syncJobs}
      lastError={lastError}
    />
  );
}
