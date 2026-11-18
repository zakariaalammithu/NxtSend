"use client";

/**
 * Mailshake panel — NOT wired into any page; the coordinator wires it in.
 * Shows connection status, health, sync status, API errors + retry
 * status, and activity (sync jobs), following the N8nLivePanels pattern
 * of sections with honest copy.
 */

import EmailOutreachPanel, {
  type EmailOutreachPanelProps,
} from "./EmailOutreachPanel";
import {
  MAILSHAKE_CONFIG,
  MAILSHAKE_CONFIG_READY,
  MAILSHAKE_DEFINITION,
  MAILSHAKE_ENV_VARS,
  MAILSHAKE_VERIFIED_ENDPOINTS,
} from "@/lib/integrations/providers/email-outreach/mailshake/config";

export default function MailshakePanel({
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
      providerId={MAILSHAKE_CONFIG.providerId}
      providerName={MAILSHAKE_CONFIG.name}
      status={status}
      mode={mode}
      docsUrl={MAILSHAKE_CONFIG.docsUrl}
      envVars={MAILSHAKE_ENV_VARS}
      verifiedEndpoints={MAILSHAKE_VERIFIED_ENDPOINTS}
      configReadyNotes={MAILSHAKE_CONFIG_READY}
      capabilities={MAILSHAKE_DEFINITION.capabilities}
      syncJobs={syncJobs}
      lastError={lastError}
    />
  );
}
