/**
 * ZeroBounce panel — thin wrapper over VerificationPanelBase.
 * NOT wired into any page; the coordinator wires it in.
 */
"use client";

import { VerificationPanelBase, type VerificationPanelProps } from "./VerificationPanelBase";
import { ZEROBOUNCE_CONFIG } from "@/lib/integrations/providers/verification/zerobounce/config";

export type ZeroBouncePanelProps = Omit<
  VerificationPanelProps,
  "provider" | "displayName" | "docsUrl" | "classifications" | "capabilities" | "setupSteps"
>;

const SETUP_STEPS = [
  "Create an API key at zerobounce.net.",
  "Store it as ZEROBOUNCE_API_KEY (encrypted via the connection store).",
  "1 credit per validation; unknown results cost 0 credits.",
];

export default function ZeroBouncePanel(props: ZeroBouncePanelProps) {
  return (
    <VerificationPanelBase
      provider="zerobounce"
      displayName="ZeroBounce"
      docsUrl={ZEROBOUNCE_CONFIG.docsUrl}
      classifications={[...ZEROBOUNCE_CONFIG.classifications]}
      capabilities={[...ZEROBOUNCE_CONFIG.capabilities]}
      setupSteps={SETUP_STEPS}
      {...props}
    />
  );
}
