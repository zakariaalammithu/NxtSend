/**
 * GoHighLevel panel — thin wrapper over CrmPanelBase. NOT wired into
 * any page; the coordinator wires it in.
 */
"use client";

import { CrmPanelBase, type CrmPanelProps } from "./CrmPanelBase";
import { GOHIGHLEVEL_CONFIG } from "@/lib/integrations/providers/crm/gohighlevel/config";

export type GoHighLevelPanelProps = Omit<CrmPanelProps, "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps">;

export default function GoHighLevelPanel(props: GoHighLevelPanelProps) {
  return (
    <CrmPanelBase
      provider="gohighlevel"
      displayName="GoHighLevel"
      docsUrl={GOHIGHLEVEL_CONFIG.docsUrl}
      capabilities={[...GOHIGHLEVEL_CONFIG.capabilities]}
      setupSteps={[...GOHIGHLEVEL_CONFIG.setup]}
      {...props}
    />
  );
}
