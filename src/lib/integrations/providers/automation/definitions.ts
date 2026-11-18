/**
 * Automation-provider definitions (Stage 2) — Make, Pabbly
 * Connect, Albato, Activepieces.
 *
 * The coordinator merges these into the central registry
 * (`src/lib/integrations/providers/registry.ts` — DO NOT EDIT).
 * Capabilities are honest: anything not yet published, submitted
 * or live-verified says so in the capability text itself. Nothing
 * here claims a connection — a definition is a description of
 * what the platform surface offers, not proof that it is
 * connected.
 *
 * Auth model per platform (verified against each platform's
 * official docs — see docs/integrations/providers/automation-*.md):
 *   - All four authenticate to NxtSend the same way: OAuth 2.0
 *     against the shared authorization server, with the
 *     platform-prefixed read/write scopes (no `.send` tier on any
 *     of them — none of them sends LinkedIn messages, and email
 *     inbox replies are covered by the write tier).
 *   - Make additionally has a custom-app path (OAuth 2.0
 *     connection in a Make custom app) and a generic HTTP-module
 *     path (Bearer token in the HTTP module).
 *   - Pabbly has no custom-app SDK: the documented path is the
 *     generic "API by Pabbly" HTTP action + "Webhook by Pabbly"
 *     trigger, both carrying the same OAuth Bearer token.
 *   - Albato has an App Integrator builder (OAuth 2.0
 *     authorization + copy-paste API requests) and a generic
 *     Webhook app; no downloadable manifest exists.
 *   - Activepieces has a TypeScript piece (OAuth 2.0 auth in
 *     `@activepieces/pieces-framework`) plus a generic HTTP piece.
 */

import type { ProviderDefinition } from "../types";

export const AUTOMATION_PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "make",
    name: "Make",
    category: "automation",
    authType: "oauth2",
    docsUrl: "https://developers.make.com",
    capabilities: [
      "OAuth 2.0 (shared server) + REST API v1: leads, campaigns, sequences, conversations, accounts, usage",
      "REST Hook webhooks: 8 events with per-subscription HMAC signing, best-effort immediate delivery + cron retries",
      "Make custom app (Base + OAuth 2.0 connection + modules) — manifest skeleton in integrations/make/, NOT submitted to Make",
      "Importable scenario blueprints (Webhooks trigger + HTTP actions) in integrations/make/scenarios/ — NOT imported into a live Make account",
      "Scopes make.read / make.write only — there is no make.send tier; LinkedIn-send actions are not supported",
    ],
    twoWaySync: true,
    scopes: ["make.read", "make.write"],
  },
  {
    id: "pabbly",
    name: "Pabbly Connect",
    category: "automation",
    authType: "oauth2",
    docsUrl: "https://www.pabbly.com/pabbly-connect-documentation-complete-integration-guide/",
    capabilities: [
      "OAuth 2.0 (shared server) + REST API v1: leads, campaigns, sequences, conversations, accounts, usage",
      "REST Hook webhooks: 8 events with per-subscription HMAC signing, best-effort immediate delivery + cron retries",
      "No custom-app SDK: the documented path is the generic 'API by Pabbly' HTTP action + 'Webhook by Pabbly' trigger (workflow setup guide in docs/integrations/providers/automation-pabbly.md) — no Pabbly app to publish",
      "Scopes pabbly.read / pabbly.write only — there is no pabbly.send tier; LinkedIn-send actions are not supported",
    ],
    twoWaySync: true,
    scopes: ["pabbly.read", "pabbly.write"],
  },
  {
    id: "albato",
    name: "Albato",
    category: "automation",
    authType: "oauth2",
    docsUrl: "https://albato.com/en/wiki/articles/app-integrator-introduction",
    capabilities: [
      "OAuth 2.0 (shared server) + REST API v1: leads, campaigns, sequences, conversations, accounts, usage",
      "REST Hook webhooks: 8 events with per-subscription HMAC signing, best-effort immediate delivery + cron retries",
      "Albato App Integrator builder spec (OAuth 2.0 authorization + triggers/actions mapped to the v1 API) in docs/integrations/providers/automation-albato.md — the builder is web-only, there is no downloadable manifest; the app is NOT submitted to Albato",
      "Scopes albato.read / albato.write only — there is no albato.send tier; LinkedIn-send actions are not supported",
    ],
    twoWaySync: true,
    scopes: ["albato.read", "albato.write"],
  },
  {
    id: "activepieces",
    name: "Activepieces",
    category: "automation",
    authType: "oauth2",
    docsUrl: "https://www.activepieces.com/docs",
    capabilities: [
      "OAuth 2.0 (shared server) + REST API v1: leads, campaigns, sequences, conversations, accounts, usage",
      "REST Hook webhooks: 8 events with per-subscription HMAC signing, best-effort immediate delivery + cron retries",
      "TypeScript piece (@activepieces/pieces-framework 0.32.0, OAuth 2.0 auth) in integrations/activepieces/ — build-verified (tsc clean + runtime construct, 17 actions, 9 triggers), NOT installed in any Activepieces instance and NOT submitted to Activepieces",
      "Scopes activepieces.read / activepieces.write only — there is no activepieces.send tier; LinkedIn-send actions are not supported",
    ],
    twoWaySync: true,
    scopes: ["activepieces.read", "activepieces.write"],
  },
];

export function getAutomationProviderDefinition(id: string): ProviderDefinition | null {
  return AUTOMATION_PROVIDER_DEFINITIONS.find((d) => d.id === id) ?? null;
}
