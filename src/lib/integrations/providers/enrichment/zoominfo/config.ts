/**
 * ZoomInfo enrichment — config.
 *
 * Verified against ZoomInfo's own docs and third-party guides that
 * cite them (read 2026-11-19):
 *  - New platform: GTM API, base `https://api.zoominfo.com/gtm`,
 *    documented at docs.gtm.ai, OAuth 2.0 (Authorization Code with
 *    PKCE for user apps, Client Credentials for server-to-server).
 *  - Legacy Enterprise API (base `https://api.zoominfo.com`) is
 *    being deprecated; its documented paths are /search/contact,
 *    /enrich/contact, /search/company, /enrich/company (see the
 *    Jitterbit guide citing ZoomInfo's docs).
 *  - Credit model (GTM API): search and lookup are free; 1 data
 *    credit per newly enriched record, free re-enrichment for
 *    12 months. Enrich takes up to 25 records per call.
 *  - No standalone email-verification endpoint in the Data API.
 *
 * STATUS: the adapter below calls the LEGACY paths on
 * `https://api.zoominfo.com` with a caller-supplied Bearer token,
 * because the exact GTM-API paths for search/enrich could NOT be
 * confirmed from docs.gtm.ai in this pass and must not be guessed.
 * The operator supplies a short-lived access token (obtained via
 * the documented OAuth 2.0 client-credentials flow) through the
 * stored connection credential or ZOOMINFO_ACCESS_TOKEN, or passes
 * a `getAccessToken` callback. Before production use, confirm the
 * GTM paths from docs.gtm.ai and update `gtmPathsVerified`.
 */

export const ZOOMINFO_CONFIG = {
  provider: "zoominfo",
  name: "ZoomInfo",
  baseUrl: "https://api.zoominfo.com",
  gtmBaseUrl: "https://api.zoominfo.com/gtm",
  docsUrl: "https://docs.gtm.ai/docs/overview",
  authType: "oauth2" as const,
  envVars: {
    accessToken: "ZOOMINFO_ACCESS_TOKEN",
    clientId: "ZOOMINFO_CLIENT_ID",
    clientSecret: "ZOOMINFO_CLIENT_SECRET",
  },
  supportedFields: [
    "email",
    "first_name",
    "last_name",
    "job_title",
    "company",
    "linkedin_url",
    "phone",
    "location",
    "seniority",
    "department",
    "industry",
    "company_size",
    "company_domain",
    "revenue",
  ],
  capabilities: [
    "Contact search by title / company / location (legacy POST /search/contact)",
    "Contact enrichment by email, LinkedIn URL, name, or ZoomInfo id (legacy POST /enrich/contact, up to 25 per call)",
    "Company search by name / domain (legacy POST /search/company)",
    "Company enrichment by domain / name / id (legacy POST /enrich/company, up to 25 per call)",
    "GTM API (api.zoominfo.com/gtm, OAuth 2.0) paths NOT yet verified — see note above",
  ],
  endpointsVerified: false,
  gtmPathsVerified: false,
  legacyPathsDeprecated: true,
} as const;
