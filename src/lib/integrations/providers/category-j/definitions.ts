/**
 * Category J provider definitions — Wave 2, Phase 1.
 *
 * Merge these into src/lib/integrations/providers/registry.ts the
 * same way the CRM / enrichment / email-outreach definition files
 * are merged (see src/lib/integrations/providers/crm/definitions.ts).
 * Do NOT claim any of these as live-verified: every adapter below
 * is implemented from the official docs and mock-tested only.
 */

import type { ProviderDefinition } from "../types";
import { GETLEADS_DEFINITION } from "./getleads/config";
import { CORNERSIGHT_DEFINITION } from "./cornersight/config";
import { HOTHAWK_DEFINITION } from "./hothawk/config";

export const CATEGORY_J_PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  GETLEADS_DEFINITION,
  CORNERSIGHT_DEFINITION,
  HOTHAWK_DEFINITION,
];

export function getCategoryJProviderDefinition(
  providerId: string
): ProviderDefinition | undefined {
  return CATEGORY_J_PROVIDER_DEFINITIONS.find((d) => d.id === providerId);
}
