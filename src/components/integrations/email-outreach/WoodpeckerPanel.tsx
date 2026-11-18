"use client";

/**
 * Woodpecker panel — NOT wired into any page; the coordinator wires it in.
 * Shows connection status, health, sync status, API errors + retry
 * status, and activity (sync jobs), following the N8nLivePanels pattern
 * of sections with honest copy.
 */

import EmailOutreachPanel, {
  type EmailOutreachPanelProps,
} from "./EmailOutreachPanel";
import {
  WOODPECKER_CONFIG,
  WOODPECKER_CONFIG_READY,
  WOODPECKER_DEFINITION,
  WOODPECKER_ENV_VARS,
  WOODPECKER_VERIFIED_ENDPOINTS,
} from "@/lib/integrations/providers/email-outreach/woodpecker/config";

export default function WoodpeckerPanel({
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
      providerId={WOODPECKER_CONFIG.providerId}
      providerName={WOODPECKER_CONFIG.name}
      status={status}
      mode={mode}
      docsUrl={WOODPECKER_CONFIG.docsUrl}
      envVars={WOODPECKER_ENV_VARS}
      verifiedEndpoints={WOODPECKER_VERIFIED_ENDPOINTS}
      configReadyNotes={WOODPECKER_CONFIG_READY}
      capabilities={WOODPECKER_DEFINITION.capabilities}
      syncJobs={syncJobs}
      lastError={lastError}
    />
  );
}
