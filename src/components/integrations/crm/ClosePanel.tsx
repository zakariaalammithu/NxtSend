/**
 * Close panel — thin wrapper over CrmPanelBase. NOT wired into any
 * page; the coordinator wires it in.
 */
"use client";

import { CrmPanelBase, type CrmPanelProps } from "./CrmPanelBase";
import { CLOSE_CONFIG } from "@/lib/integrations/providers/crm/close/config";

export type ClosePanelProps = Omit<CrmPanelProps, "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps">;

export default function ClosePanel(props: ClosePanelProps) {
  return (
    <CrmPanelBase
      provider="close"
      displayName="Close"
      docsUrl={CLOSE_CONFIG.docsUrl}
      capabilities={[...CLOSE_CONFIG.capabilities]}
      setupSteps={[...CLOSE_CONFIG.setup]}
      {...props}
    />
  );
}
