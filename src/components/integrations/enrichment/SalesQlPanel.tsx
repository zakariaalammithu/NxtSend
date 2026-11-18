/**
 * SalesQL enrichment panel — thin wrapper over EnrichmentPanelBase.
 * NOT wired into any page; the coordinator wires it in.
 */
"use client";

import { EnrichmentPanelBase, type EnrichmentPanelProps } from "./EnrichmentPanelBase";
import { SALESQL_CONFIG } from "@/lib/integrations/providers/enrichment/salesql/config";

export type SalesQlPanelProps = Omit<
  EnrichmentPanelProps,
  "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps"
>;

const SETUP_STEPS = [
  "Create an API key at salesql.com.",
  "Store it as SALESQL_API_KEY (encrypted via the connection store).",
  "A 404 means the person is not in the database and costs no credit.",
];

export default function SalesQlPanel(props: SalesQlPanelProps) {
  return (
    <EnrichmentPanelBase
      provider="salesql"
      displayName="SalesQL"
      docsUrl={SALESQL_CONFIG.docsUrl}
      capabilities={[...SALESQL_CONFIG.capabilities]}
      setupSteps={SETUP_STEPS}
      {...props}
    />
  );
}
