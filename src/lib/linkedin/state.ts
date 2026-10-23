/**
 * LinkedIn provider state derivation — from actual env presence only
 * (same rules as src/lib/email/state.ts).
 *
 * The reserved provider variables are:
 *   LINKEDIN_PROVIDER          the approved provider's name/key
 *   LINKEDIN_PROVIDER_API_KEY  that provider's API key (server-only)
 *
 * Honesty rule that makes this different from the other adapters:
 * even when both variables hold plausible values, the state stays
 * "configuration_required" — because no vendor adapter is implemented
 * behind the seam yet, credentials alone connect nothing. The state
 * becomes "connected" only when a real adapter exists AND verifies
 * against the provider. The message wording distinguishes the two
 * cases so an operator who already bought a provider account is told
 * exactly what is missing (the adapter), not sent back to buy again.
 */

import { isConfiguredValue, type ProviderState } from "@/lib/env";
import { getDataMode, type DataMode } from "@/lib/data/mode";

export interface LinkedInEnv {
  LINKEDIN_PROVIDER?: string;
  LINKEDIN_PROVIDER_API_KEY?: string;
}

function envFromProcess(): LinkedInEnv {
  return {
    LINKEDIN_PROVIDER: process.env.LINKEDIN_PROVIDER,
    LINKEDIN_PROVIDER_API_KEY: process.env.LINKEDIN_PROVIDER_API_KEY,
  };
}

/**
 * True when the operator has supplied BOTH reserved provider
 * variables with plausible (non-placeholder) values. This says
 * credentials EXIST — it never says LinkedIn is connected.
 */
export function isLinkedInCredentialsPresent(
  env: LinkedInEnv = envFromProcess()
): boolean {
  return (
    isConfiguredValue(env.LINKEDIN_PROVIDER) &&
    isConfiguredValue(env.LINKEDIN_PROVIDER_API_KEY)
  );
}

export function getLinkedInProviderState(
  env: LinkedInEnv = envFromProcess(),
  mode: DataMode = getDataMode()
): ProviderState {
  void env; // credentials never change the state in this build (below)
  if (mode === "demo") return "demo";
  // Deliberately never "connected" in this build: no vendor adapter
  // is implemented behind the seam (see ./types.ts). A future adapter
  // replaces this derivation with its own verified state.
  return "configuration_required";
}

export interface LinkedInProviderDescription {
  state: ProviderState;
  /** True when plausible provider credentials are present. */
  credentialsPresent: boolean;
  /** The name the operator gave the provider, when set. */
  providerName: string | null;
  message: string;
}

/** The one wording every surface (adapter, Integration Center status
 *  + verify, LinkedIn page) uses for the provider state. */
export function describeLinkedInProvider(
  env: LinkedInEnv = envFromProcess(),
  mode: DataMode = getDataMode()
): LinkedInProviderDescription {
  const state = getLinkedInProviderState(env, mode);
  const credentialsPresent = isLinkedInCredentialsPresent(env);
  const providerName = isConfiguredValue(env.LINKEDIN_PROVIDER)
    ? (env.LINKEDIN_PROVIDER as string).trim()
    : null;

  if (state === "demo") {
    return {
      state,
      credentialsPresent,
      providerName,
      message:
        "Demo Mode: LinkedIn accounts, campaigns and inbox threads are simulated and labelled. Sending is refused by design — no LinkedIn provider is connected.",
    };
  }
  if (credentialsPresent) {
    return {
      state,
      credentialsPresent,
      providerName,
      message:
        `Provider credentials for "${providerName}" are present, but no adapter for an approved LinkedIn provider is implemented yet — credentials alone connect nothing, so LinkedIn sending stays unavailable. Implementing the provider's adapter behind src/lib/linkedin is the remaining step.`,
    };
  }
  return {
    state,
    credentialsPresent,
    providerName,
    message:
      "Configuration Required — approved provider required: LinkedIn's official API does not support outreach automation and no compliant provider is integrated. Procure an account with a LinkedIn-approved outreach provider (partner API), then set LINKEDIN_PROVIDER and LINKEDIN_PROVIDER_API_KEY and implement its adapter behind src/lib/linkedin.",
  };
}
