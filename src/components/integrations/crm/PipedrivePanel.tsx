/**
 * Pipedrive panel — thin wrapper over CrmPanelBase. NOT wired into
 * any page; the coordinator wires it in.
 */
"use client";

import { CrmPanelBase, type CrmPanelProps } from "./CrmPanelBase";
import { PIPEDRIVE_CONFIG } from "@/lib/integrations/providers/crm/pipedrive/config";

export type PipedrivePanelProps = Omit<CrmPanelProps, "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps">;

export default function PipedrivePanel(props: PipedrivePanelProps) {
  return (
    <CrmPanelBase
      provider="pipedrive"
      displayName="Pipedrive"
      docsUrl={PIPEDRIVE_CONFIG.docsUrl}
      capabilities={[...PIPEDRIVE_CONFIG.capabilities]}
      setupSteps={[...PIPEDRIVE_CONFIG.setup]}
      {...props}
    />
  );
}
