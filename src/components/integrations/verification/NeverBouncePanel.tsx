/**
 * NeverBounce panel — thin wrapper over VerificationPanelBase.
 * NOT wired into any page; the coordinator wires it in.
 */
"use client";

import { VerificationPanelBase, type VerificationPanelProps } from "./VerificationPanelBase";
import { NEVERBOUNCE_CONFIG } from "@/lib/integrations/providers/verification/neverbounce/config";

export type NeverBouncePanelProps = Omit<
  VerificationPanelProps,
  "provider" | "displayName" | "docsUrl" | "classifications" | "capabilities" | "setupSteps"
>;

const SETUP_STEPS = [
  "Create a v4 API key at neverbounce.com (starts with secret_...; v3 keys do not work with v4).",
  "Store it as NEVERBOUNCE_API_KEY (encrypted via the connection store).",
  "Bulk verification runs as sequential single checks; do not use single checks to clean an existing list one-by-one (provider guidance: account-lock risk).",
];

export default function NeverBouncePanel(props: NeverBouncePanelProps) {
  return (
    <VerificationPanelBase
      provider="neverbounce"
      displayName="NeverBounce"
      docsUrl={NEVERBOUNCE_CONFIG.docsUrl}
      classifications={[...NEVERBOUNCE_CONFIG.classifications]}
      capabilities={[...NEVERBOUNCE_CONFIG.capabilities]}
      setupSteps={SETUP_STEPS}
      {...props}
    />
  );
}
