/**
 * Attio panel — thin wrapper over CrmPanelBase. NOT wired into any
 * page; the coordinator wires it in.
 */
"use client";

import { CrmPanelBase, type CrmPanelProps } from "./CrmPanelBase";
import { ATTIO_CONFIG } from "@/lib/integrations/providers/crm/attio/config";

export type AttioPanelProps = Omit<CrmPanelProps, "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps">;

export default function AttioPanel(props: AttioPanelProps) {
  return (
    <CrmPanelBase
      provider="attio"
      displayName="Attio"
      docsUrl={ATTIO_CONFIG.docsUrl}
      capabilities={[...ATTIO_CONFIG.capabilities]}
      setupSteps={[...ATTIO_CONFIG.setup]}
      {...props}
    />
  );
}
