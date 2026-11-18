/**
 * Bouncer panel — thin wrapper over VerificationPanelBase.
 * NOT wired into any page; the coordinator wires it in.
 */
"use client";

import { VerificationPanelBase, type VerificationPanelProps } from "./VerificationPanelBase";
import { BOUNCER_CONFIG } from "@/lib/integrations/providers/verification/bouncer/config";

export type BouncerPanelProps = Omit<
  VerificationPanelProps,
  "provider" | "displayName" | "docsUrl" | "classifications" | "capabilities" | "setupSteps"
>;

const SETUP_STEPS = [
  "Create an API key at usebouncer.com.",
  "Store it as BOUNCER_API_KEY (encrypted via the connection store).",
  "1 credit per verification.",
];

export default function BouncerPanel(props: BouncerPanelProps) {
  return (
    <VerificationPanelBase
      provider="bouncer"
      displayName="Bouncer"
      docsUrl={BOUNCER_CONFIG.docsUrl}
      classifications={[...BOUNCER_CONFIG.classifications]}
      capabilities={[...BOUNCER_CONFIG.capabilities]}
      setupSteps={SETUP_STEPS}
      {...props}
    />
  );
}
