"use client";

/**
 * Reply.io panel — NOT wired into any page; the coordinator wires it in.
 * Shows connection status, health, sync status, API errors + retry
 * status, and activity (sync jobs), following the N8nLivePanels pattern
 * of sections with honest copy.
 */

import EmailOutreachPanel, {
  type EmailOutreachPanelProps,
} from "./EmailOutreachPanel";
import {
  REPLY_CONFIG,
  REPLY_CONFIG_READY,
  REPLY_DEFINITION,
  REPLY_ENV_VARS,
  REPLY_VERIFIED_ENDPOINTS,
} from "@/lib/integrations/providers/email-outreach/reply/config";

export default function ReplyPanel({
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
      providerId={REPLY_CONFIG.providerId}
      providerName={REPLY_CONFIG.name}
      status={status}
      mode={mode}
      docsUrl={REPLY_CONFIG.docsUrl}
      envVars={REPLY_ENV_VARS}
      verifiedEndpoints={REPLY_VERIFIED_ENDPOINTS}
      configReadyNotes={REPLY_CONFIG_READY}
      capabilities={REPLY_DEFINITION.capabilities}
      syncJobs={syncJobs}
      lastError={lastError}
    />
  );
}
