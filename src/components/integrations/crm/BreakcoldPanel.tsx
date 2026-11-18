/**
 * Breakcold panel — thin wrapper over CrmPanelBase. NOT wired into
 * any page; the coordinator wires it in.
 */
"use client";

import { CrmPanelBase, type CrmPanelProps } from "./CrmPanelBase";
import { BREAKCOLD_CONFIG } from "@/lib/integrations/providers/crm/breakcold/config";

export type BreakcoldPanelProps = Omit<CrmPanelProps, "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps">;

export default function BreakcoldPanel(props: BreakcoldPanelProps) {
  return (
    <CrmPanelBase
      provider="breakcold"
      displayName="Breakcold"
      docsUrl={BREAKCOLD_CONFIG.docsUrl}
      capabilities={[...BREAKCOLD_CONFIG.capabilities]}
      setupSteps={[...BREAKCOLD_CONFIG.setup]}
      {...props}
    />
  );
}
