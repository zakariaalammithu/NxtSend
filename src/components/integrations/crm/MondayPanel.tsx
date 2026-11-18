/**
 * Monday.com panel — thin wrapper over CrmPanelBase. NOT wired into
 * any page; the coordinator wires it in.
 */
"use client";

import { CrmPanelBase, type CrmPanelProps } from "./CrmPanelBase";
import { MONDAY_CONFIG } from "@/lib/integrations/providers/crm/monday/config";

export type MondayPanelProps = Omit<CrmPanelProps, "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps">;

export default function MondayPanel(props: MondayPanelProps) {
  return (
    <CrmPanelBase
      provider="monday"
      displayName="Monday.com"
      docsUrl={MONDAY_CONFIG.docsUrl}
      capabilities={[...MONDAY_CONFIG.capabilities]}
      setupSteps={[...MONDAY_CONFIG.setup]}
      {...props}
    />
  );
}
