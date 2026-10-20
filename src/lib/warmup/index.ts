/**
 * Email warm-up module entry point (P5 Stage E).
 *
 * One approved provider today: Instantly (API v2). Warm-up activity
 * itself happens entirely inside the provider's network — this module
 * only reads the provider-reported status. See ./types.ts for the
 * honesty rules and ./instantly.ts for the documented API surface.
 */

import { InstantlyWarmupAdapter, type InstantlyAdapterDeps } from "./instantly";
import type { WarmupProviderAdapter } from "./types";

export * from "./types";
export { getWarmupState, isWarmupConfigured } from "./state";
export type { WarmupEnv } from "./state";
export {
  InstantlyWarmupAdapter,
  mapInstantlyAccount,
  mapInstantlyAnalytics,
  INSTANTLY_API_BASE,
} from "./instantly";
export type { InstantlyAdapterDeps } from "./instantly";

/** The configured warm-up adapter (Instantly). State derives from env. */
export function createWarmupAdapter(
  deps: InstantlyAdapterDeps = {}
): WarmupProviderAdapter {
  return new InstantlyWarmupAdapter(deps);
}
