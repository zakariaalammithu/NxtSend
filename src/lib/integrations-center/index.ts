/**
 * Integration Center entry point.
 *
 * The registry (./registry.ts) describes every integration; the status
 * service (./status.ts) derives honest statuses from the existing
 * env-based state modules; the verify service (./verify.ts) performs
 * the safe read-only Test Connection calls; verification results are
 * persisted per workspace (./verification-store.ts, migration 006).
 */

export * from "./types";
export { INTEGRATION_REGISTRY, getIntegrationDescriptor } from "./registry";
export {
  getIntegrationStatuses,
  mapProviderState,
  applyVerification,
} from "./status";
export type { IntegrationStatusOptions } from "./status";
export { verifyIntegration } from "./verify";
export type { VerifyDeps } from "./verify";
