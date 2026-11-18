"use client";

/**
 * Lemlist panel — NOT wired into any page; the coordinator wires it in.
 * Shows connection status, health, sync status, API errors + retry
 * status, and activity (sync jobs), following the N8nLivePanels pattern
 * of sections with honest copy.
 */

import EmailOutreachPanel, {
  type EmailOutreachPanelProps,
} from "./EmailOutreachPanel";
import {
  LEMLIST_CONFIG,
  LEMLIST_CONFIG_READY,
  LEMLIST_DEFINITION,
  LEMLIST_ENV_VARS,
  LEMLIST_VERIFIED_ENDPOINTS,
} from "@/lib/integrations/providers/email-outreach/lemlist/config";

export default function LemlistPanel({
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
      providerId={LEMLIST_CONFIG.providerId}
      providerName={LEMLIST_CONFIG.name}
      status={status}
      mode={mode}
      docsUrl={LEMLIST_CONFIG.docsUrl}
      envVars={LEMLIST_ENV_VARS}
      verifiedEndpoints={LEMLIST_VERIFIED_ENDPOINTS}
      configReadyNotes={LEMLIST_CONFIG_READY}
      capabilities={LEMLIST_DEFINITION.capabilities}
      syncJobs={syncJobs}
      lastError={lastError}
    />
  );
}
