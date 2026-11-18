"use client";

/**
 * EmailBison panel — NOT wired into any page; the coordinator wires it in.
 * Shows connection status, health, sync status, API errors + retry
 * status, and activity (sync jobs), following the N8nLivePanels pattern
 * of sections with honest copy.
 */

import EmailOutreachPanel, {
  type EmailOutreachPanelProps,
} from "./EmailOutreachPanel";
import {
  EMAILBISON_CONFIG,
  EMAILBISON_CONFIG_READY,
  EMAILBISON_DEFINITION,
  EMAILBISON_ENV_VARS,
  EMAILBISON_VERIFIED_ENDPOINTS,
} from "@/lib/integrations/providers/email-outreach/emailbison/config";

export default function EmailBisonPanel({
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
      providerId={EMAILBISON_CONFIG.providerId}
      providerName={EMAILBISON_CONFIG.name}
      status={status}
      mode={mode}
      docsUrl={EMAILBISON_CONFIG.docsUrl}
      envVars={EMAILBISON_ENV_VARS}
      verifiedEndpoints={EMAILBISON_VERIFIED_ENDPOINTS}
      configReadyNotes={EMAILBISON_CONFIG_READY}
      capabilities={EMAILBISON_DEFINITION.capabilities}
      syncJobs={syncJobs}
      lastError={lastError}
    />
  );
}
