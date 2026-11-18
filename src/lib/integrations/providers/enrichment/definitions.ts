/**
 * Lead-enrichment provider definitions (Stage 5).
 *
 * Exported here for the coordinator to merge into
 * `src/lib/integrations/providers/registry.ts` — this file does
 * NOT edit the registry itself.
 *
 * Capabilities are honest: providers whose public API could not
 * be verified, or which are shut down / deprecated, are listed
 * with their real status in the capability text so the UI never
 * claims a working connection for them.
 */

import type { ProviderDefinition } from "../types";

export const ENRICHMENT_PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "apollo",
    name: "Apollo.io",
    category: "enrichment",
    authType: "api_key",
    docsUrl: "https://docs.apollo.io/",
    capabilities: [
      "Enrich one person by email, name + employer, or LinkedIn URL",
      "Bulk enrichment (up to 10 people per call)",
      "People search",
      "Company enrichment by domain",
      "Waterfall email + phone reveal",
    ],
    twoWaySync: false,
  },
  {
    id: "hunter",
    name: "Hunter.io",
    category: "enrichment",
    authType: "api_key",
    docsUrl: "https://hunter.io/api-documentation",
    capabilities: [
      "Domain search (all emails at a company)",
      "Email finder with 0–100 confidence",
      "People search by email or LinkedIn handle",
      "Company search by domain",
      "Combined search by email",
    ],
    twoWaySync: false,
  },
  {
    id: "zoominfo",
    name: "ZoomInfo",
    category: "enrichment",
    authType: "oauth2",
    docsUrl: "https://docs.gtm.ai/docs/overview",
    capabilities: [
      "Contact enrichment (legacy Enterprise API paths; GTM API paths unverified — see adapter config)",
      "Company enrichment",
      "Contact and company search",
    ],
    twoWaySync: false,
  },
  {
    id: "contactout",
    name: "ContactOut",
    category: "enrichment",
    authType: "api_key",
    docsUrl: "https://contactout.com/api_docs/",
    capabilities: [
      "Enrich a person from a LinkedIn profile URL",
      "Enrich a person by email or name + company",
      "LinkedIn profile lookup with email and phone",
    ],
    twoWaySync: false,
  },
  {
    id: "salesql",
    name: "SalesQL",
    category: "enrichment",
    authType: "bearer_token",
    docsUrl: "https://salesql.com/api",
    capabilities: [
      "Enrich a person by LinkedIn URL, email, or name + company",
      "Verified work and personal emails with status",
      "Phone numbers with validity flag",
      "Bulk enrichment (sequential single calls; bulk endpoint schema unverified)",
    ],
    twoWaySync: false,
  },
  {
    id: "snov",
    name: "Snov.io",
    category: "enrichment",
    authType: "oauth2",
    docsUrl: "https://snov.io/api",
    capabilities: [
      "Domain search (async task)",
      "Email finder by name + domain (async task)",
      "Company lookup by name (async task)",
      "LinkedIn profile lookup by URL (async task)",
      "Email verification (async task)",
    ],
    twoWaySync: false,
  },
  {
    id: "dropcontact",
    name: "Dropcontact",
    category: "enrichment",
    authType: "api_key",
    docsUrl: "https://developer.dropcontact.com/",
    capabilities: [
      "Batch person enrichment (up to 250 contacts per batch, async)",
      "Verified work emails with qualification",
      "Company data (SIREN, industry, employee count)",
      "GDPR-compliant enrichment (no data stored on failure)",
    ],
    twoWaySync: false,
  },
  {
    id: "persana",
    name: "Persana AI",
    category: "enrichment",
    authType: "api_key",
    docsUrl: "https://persana.ai/full-contact-api",
    capabilities: [
      "Config-ready only — no public API reference found; endpoints unverified",
    ],
    twoWaySync: false,
  },
  {
    id: "clearbit",
    name: "Clearbit / HubSpot Data Enrichment",
    category: "enrichment",
    authType: "api_key",
    docsUrl: null,
    capabilities: [
      "Provider blocked — standalone Clearbit API deprecated after the HubSpot acquisition; enrichment now only inside paid HubSpot (Breeze Intelligence)",
    ],
    twoWaySync: false,
  },
  {
    id: "clay",
    name: "Clay",
    category: "enrichment",
    authType: "api_key",
    docsUrl: "https://developers.clay.com",
    capabilities: [
      "Run an operator-configured enrichment routine (1–100 items inline)",
      "Batch routine runs via JSONL upload",
      "Routine outputs mapped generically onto lead fields",
    ],
    twoWaySync: false,
  },
  {
    id: "apify",
    name: "Apify",
    category: "enrichment",
    authType: "api_key",
    docsUrl: "https://docs.apify.com/api/v2",
    capabilities: [
      "Run an operator-chosen Store Actor (async run + dataset read)",
      "Dataset items mapped generically onto lead fields",
      "Operator owns the Actor choice; Actors must not scrape services in violation of their terms",
    ],
    twoWaySync: false,
  },
  {
    id: "rb2b",
    name: "RB2B",
    category: "enrichment",
    authType: "webhook",
    docsUrl: "https://support.rb2b.com/",
    capabilities: [
      "Webhook-only visitor identification (no pull API)",
      "Maps inbound visitor payloads onto lead fields",
      "US traffic only",
    ],
    twoWaySync: false,
  },
  {
    id: "factors",
    name: "Factors.ai",
    category: "enrichment",
    authType: "api_key",
    docsUrl: "https://help.factors.ai/en/",
    capabilities: [
      "Config-ready only — Factors API reference not verified; endpoints unverified",
    ],
    twoWaySync: false,
  },
  {
    id: "trigify",
    name: "Trigify",
    category: "enrichment",
    authType: "api_key",
    docsUrl: "https://www.trigify.io/",
    capabilities: [
      "Provider blocked — Trigify shut down 22 October 2026; API and signal collection stopped",
    ],
    twoWaySync: false,
  },
  {
    id: "weezly",
    name: "Weezly",
    category: "enrichment",
    authType: "api_key",
    docsUrl: "https://weezly.com/",
    capabilities: [
      "Not implemented — no public developer API found",
    ],
    twoWaySync: false,
  },
];
