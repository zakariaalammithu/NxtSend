/**
 * MillionVerifier panel — thin wrapper over VerificationPanelBase.
 * NOT wired into any page; the coordinator wires it in.
 */
"use client";

import { VerificationPanelBase, type VerificationPanelProps } from "./VerificationPanelBase";
import { MILLIONVERIFIER_CONFIG } from "@/lib/integrations/providers/verification/millionverifier/config";

export type MillionVerifierPanelProps = Omit<
  VerificationPanelProps,
  "provider" | "displayName" | "docsUrl" | "classifications" | "capabilities" | "setupSteps"
>;

const SETUP_STEPS = [
  "Create an API key at millionverifier.com.",
  "Store it as MILLIONVERIFIER_API_KEY (encrypted via the connection store).",
  "1 credit per verification; credits never expire.",
];

export default function MillionVerifierPanel(props: MillionVerifierPanelProps) {
  return (
    <VerificationPanelBase
      provider="millionverifier"
      displayName="MillionVerifier"
      docsUrl={MILLIONVERIFIER_CONFIG.docsUrl}
      classifications={[...MILLIONVERIFIER_CONFIG.classifications]}
      capabilities={[...MILLIONVERIFIER_CONFIG.capabilities]}
      setupSteps={SETUP_STEPS}
      {...props}
    />
  );
}
