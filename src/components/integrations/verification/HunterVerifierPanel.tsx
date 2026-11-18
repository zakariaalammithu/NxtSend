/**
 * Hunter Email Verifier panel — thin wrapper over
 * VerificationPanelBase. Shares HUNTER_API_KEY with the Hunter.io
 * enrichment adapter. NOT wired into any page; the coordinator
 * wires it in.
 */
"use client";

import { VerificationPanelBase, type VerificationPanelProps } from "./VerificationPanelBase";
import { HUNTER_VERIFIER_CONFIG } from "@/lib/integrations/providers/verification/hunter-verifier/config";

export type HunterVerifierPanelProps = Omit<
  VerificationPanelProps,
  "provider" | "displayName" | "docsUrl" | "classifications" | "capabilities" | "setupSteps"
>;

const SETUP_STEPS = [
  "Create an API key at hunter.io (dashboard → API).",
  "Store it as HUNTER_API_KEY — the same key powers the Hunter.io enrichment adapter.",
  "1 verification credit per check; 10 requests/sec.",
];

export default function HunterVerifierPanel(props: HunterVerifierPanelProps) {
  return (
    <VerificationPanelBase
      provider="hunter-verifier"
      displayName="Hunter Email Verifier"
      docsUrl={HUNTER_VERIFIER_CONFIG.docsUrl}
      classifications={[...HUNTER_VERIFIER_CONFIG.classifications]}
      capabilities={[...HUNTER_VERIFIER_CONFIG.capabilities]}
      setupSteps={SETUP_STEPS}
      {...props}
    />
  );
}
