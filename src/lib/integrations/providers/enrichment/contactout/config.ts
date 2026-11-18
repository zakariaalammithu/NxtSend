/**
 * ContactOut enrichment — config.
 *
 * Verified against ContactOut's official API Reference
 * (contactout.com/api_docs, read 2026-11-19):
 *  - Base URL `https://api.contactout.com`.
 *  - Auth: API key in the `token` header (NOT Authorization).
 *  - GET /v1/linkedin/enrich?profile=<linkedin-url> — profile
 *    details for one LinkedIn profile.
 *  - POST /v1/people/enrich — enrich by name / email / phone /
 *    LinkedIn URL / company; add `include` to return contact
 *    details (email, phone).
 *  - GET /v1/people/linkedin?profile=&include_phone=true — contact
 *    details for one LinkedIn profile.
 *  - Credit model (per the API reference): 1 search credit when a
 *    profile is found, +1 email credit when an email is found, +1
 *    phone credit when a phone is found.
 *  - Rate limits: People Search 60/min; Contact Checker APIs
 *    150/min per endpoint, 3000/day shared.
 */

export const CONTACTOUT_CONFIG = {
  provider: "contactout",
  name: "ContactOut",
  baseUrl: "https://api.contactout.com",
  docsUrl: "https://contactout.com/api_docs/",
  authType: "api_key" as const,
  envVars: { apiKey: "CONTACTOUT_API_KEY" },
  supportedFields: [
    "email",
    "first_name",
    "last_name",
    "job_title",
    "company",
    "linkedin_url",
    "phone",
    "location",
    "education",
    "skills",
    "work_history",
  ],
  capabilities: [
    "LinkedIn profile enrichment (GET /v1/linkedin/enrich)",
    "People enrichment by name / email / phone / LinkedIn URL / company (POST /v1/people/enrich)",
    "Contact details for one LinkedIn profile, incl. phone (GET /v1/people/linkedin)",
  ],
  endpointsVerified: true,
} as const;
