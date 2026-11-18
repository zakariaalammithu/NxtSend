/**
 * Email-outreach provider definitions (Stage 4).
 *
 * Exported for the coordinator to merge into the central registry
 * (`src/lib/integrations/providers/registry.ts` — DO NOT EDIT IT).
 * Capabilities are honest: anything not yet live says so in the
 * capability text itself. Nothing here claims a connection.
 */

import type { ProviderDefinition } from "../types";
import { INSTANTLY_DEFINITION } from "./instantly/config";
import { SMARTLEAD_DEFINITION } from "./smartlead/config";
import { EMAILBISON_DEFINITION } from "./emailbison/config";
import { MASTERINBOX_DEFINITION } from "./masterinbox/config";
import { SMARTREACH_DEFINITION } from "./smartreach/config";
import { REPLY_DEFINITION } from "./reply/config";
import { LEMLIST_DEFINITION } from "./lemlist/config";
import { SNOV_DEFINITION } from "./snov/config";
import { MAILSHAKE_DEFINITION } from "./mailshake/config";
import { WOODPECKER_DEFINITION } from "./woodpecker/config";

export const EMAIL_OUTREACH_PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  INSTANTLY_DEFINITION,
  SMARTLEAD_DEFINITION,
  EMAILBISON_DEFINITION,
  MASTERINBOX_DEFINITION,
  SMARTREACH_DEFINITION,
  REPLY_DEFINITION,
  LEMLIST_DEFINITION,
  SNOV_DEFINITION,
  MAILSHAKE_DEFINITION,
  WOODPECKER_DEFINITION,
];
