/**
 * Email-verification provider definitions (Stage 5).
 *
 * Exported here for the coordinator to merge into
 * `src/lib/integrations/providers/registry.ts` — this file does
 * NOT edit the registry itself.
 *
 * Verification classifications are preserved verbatim from each
 * provider's response; the capabilities below name the exact
 * classification values each provider returns.
 */

import type { ProviderDefinition } from "../types";

export const VERIFICATION_PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "millionverifier",
    name: "MillionVerifier",
    category: "email_verification",
    authType: "api_key",
    docsUrl: "https://developer.millionverifier.com",
    capabilities: [
      "Single email verification",
      "Bulk verification (sequential single checks)",
      "Classifications: ok, catch_all, unknown, error, disposable, invalid (verbatim)",
      "Credit balance retrieval",
    ],
    twoWaySync: false,
  },
  {
    id: "zerobounce",
    name: "ZeroBounce",
    category: "email_verification",
    authType: "api_key",
    docsUrl: "https://www.zerobounce.net/docs/email-validation-api-quickstart/v2-validate-emails",
    capabilities: [
      "Single email verification",
      "Native batch verification (up to 100 per call, with single-check fallback)",
      "Classifications: valid, invalid, catch-all, unknown, spamtrap, abuse, do_not_mail (verbatim)",
      "Credit balance retrieval",
    ],
    twoWaySync: false,
  },
  {
    id: "neverbounce",
    name: "NeverBounce",
    category: "email_verification",
    authType: "api_key",
    docsUrl: "https://developers.neverbounce.com/v4.0/",
    capabilities: [
      "Single email verification",
      "Bulk verification (sequential single checks; Jobs API is form-encoded and not used)",
      "Classifications: valid, invalid, disposable, catchall, unknown (verbatim)",
      "Credit balance retrieval",
    ],
    twoWaySync: false,
  },
  {
    id: "bouncer",
    name: "Bouncer",
    category: "email_verification",
    authType: "api_key",
    docsUrl: "https://www.usebouncer.com/api-documentation/",
    capabilities: [
      "Single email verification",
      "Bulk verification (sequential single checks; batch result-retrieval path unverified)",
      "Classifications: deliverable, risky, undeliverable, unknown (verbatim)",
      "Credit balance retrieval",
    ],
    twoWaySync: false,
  },
  {
    id: "hunter-verifier",
    name: "Hunter Email Verifier",
    category: "email_verification",
    authType: "api_key",
    docsUrl: "https://hunter.io/api-documentation",
    capabilities: [
      "Single email verification",
      "Bulk verification (sequential single checks)",
      "Classifications: deliverable, undeliverable, risky, unknown (verbatim)",
      "Remaining-verifications balance via /account",
    ],
    twoWaySync: false,
  },
];
