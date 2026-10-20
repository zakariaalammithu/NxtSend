/**
 * LinkedIn provider module entry point (P5 Stage F).
 *
 * THE seam for LinkedIn sending — the legacy adapter that used to
 * live under src/lib/integrations (a demo class + a throwing live
 * stub behind a caller-less factory) was retired in this stage so
 * there is exactly ONE LinkedIn interface: LinkedInProviderAdapter.
 *
 * No vendor is wired today: createLinkedInAdapter() returns the
 * NotConfigured implementation, whose capabilities refuse honestly.
 * When the owner procures a LinkedIn-approved outreach provider,
 * its adapter is implemented beside ./not-configured.ts and this
 * factory starts returning it for that provider's configuration.
 */

import { NotConfiguredLinkedInAdapter } from "./not-configured";
import type { LinkedInProviderAdapter } from "./types";

export * from "./types";
export {
  getLinkedInProviderState,
  isLinkedInCredentialsPresent,
  describeLinkedInProvider,
} from "./state";
export type { LinkedInEnv, LinkedInProviderDescription } from "./state";
export { NotConfiguredLinkedInAdapter } from "./not-configured";
export type { NotConfiguredLinkedInDeps } from "./not-configured";
export { accountHealthView, accountHealthActionHref } from "./health";
export type { AccountHealthView, AccountHealthTone } from "./health";
export {
  LINKEDIN_STEP_TYPES,
  LINKEDIN_STEP_TYPE_LABELS,
  isLinkedInStepType,
  linkedInStepTypeLabel,
  linkedInStepsOf,
  filterLinkedInCampaigns,
  summarizeLinkedInExecutions,
  buildLinkedInActivity,
} from "./activity";
export type { LinkedInExecutionSummary, LinkedInActivityRow } from "./activity";

/**
 * The active LinkedIn adapter. Always the NotConfigured
 * implementation in this build — see the header.
 */
export function createLinkedInAdapter(): LinkedInProviderAdapter {
  return new NotConfiguredLinkedInAdapter();
}
