"use client";

/**
 * Master Inbox panel — NOT wired into any page; the coordinator wires it in.
 * Shows connection status, health, sync status, API errors + retry
 * status, and activity (sync jobs), following the N8nLivePanels pattern
 * of sections with honest copy.
 */

import EmailOutreachPanel, {
  type EmailOutreachPanelProps,
} from "./EmailOutreachPanel";
import {
  MASTERINBOX_CONFIG,
  MASTERINBOX_CONFIG_READY,
  MASTERINBOX_DEFINITION,
  MASTERINBOX_ENV_VARS,
  MASTERINBOX_VERIFIED_ENDPOINTS,
} from "@/lib/integrations/providers/email-outreach/masterinbox/config";

export default function MasterinboxPanel({
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
      providerId={MASTERINBOX_CONFIG.providerId}
      providerName={MASTERINBOX_CONFIG.name}
      status={status}
      mode={mode}
      docsUrl={MASTERINBOX_CONFIG.docsUrl}
      envVars={MASTERINBOX_ENV_VARS}
      verifiedEndpoints={MASTERINBOX_VERIFIED_ENDPOINTS}
      configReadyNotes={MASTERINBOX_CONFIG_READY}
      capabilities={MASTERINBOX_DEFINITION.capabilities}
      syncJobs={syncJobs}
      lastError={lastError}
    />
  );
}
