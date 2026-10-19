/**
 * Muse Connector Platform — submission readiness checklist.
 *
 * Assembled from Meta's official Connector guidelines (§5 submission
 * requirements, §6 review) and terms, researched 2026-10-19
 * (~/workspace/research_notes/muse-ai-api-investigation-20261018-2029).
 * Every item is something NxtSend's owner must supply or complete —
 * none of it can be done from inside this codebase, which is exactly
 * why the Muse.ai integration status is "Unsupported / No Documented
 * API" + "API Access Required" rather than a fake connection.
 *
 * Key facts baked into the items:
 *  - No paid Muse consumer plan is required to submit.
 *  - No submission fee, revenue share, or review timeline is published.
 *  - Meta reviews against your LIVE endpoint; nothing is uploaded.
 *  - Approval is discretionary; meeting the guidelines does not
 *    guarantee it. Onboarding runs in waves.
 *  - Meta is NOT currently approving new financial money-movement
 *    tools (read-only finance is allowed) — NxtSend's billing surface
 *    is therefore kept out of the manifest entirely.
 */

export interface MuseReadinessItem {
  id: string;
  title: string;
  detail: string;
  /** Where the requirement comes from (guidelines section / terms). */
  source: string;
}

export const MUSE_READINESS_CHECKLIST: MuseReadinessItem[] = [
  {
    id: "live-surface",
    title: "A live integration surface to connect",
    detail:
      "Expose either a hosted MCP endpoint (URL + documentation) or a documented REST API (URL + preferably an OpenAPI spec). Meta tests against the live endpoint; nothing is uploaded. This is the main build item on NxtSend's side.",
    source: "Guidelines §5.4; submission form (first-hand account)",
  },
  {
    id: "submission",
    title: "Submission at muse.ai/platform",
    detail:
      "Sign in with a work email and submit: connector name, company/developer, product website, example prompts, 512×512 PNG/SVG icon, whether it accepts payments, contact name + work email, support email/URL, privacy policy URL, terms of service URL.",
    source: "Submission form (first-hand account); Guidelines §5",
  },
  {
    id: "business-verification",
    title: "Business verification",
    detail:
      "Business information and supporting evidence of authority to submit, authorised brand assets, support + security contacts, a named developer responsible for maintenance, and acceptance of the Muse Connector Terms.",
    source: "Guidelines §5.2",
  },
  {
    id: "data-processing",
    title: "Data-processing questionnaire",
    detail:
      "Declare what data is accessed and why, how it is protected, shared, retained and deleted — consistent with the published privacy policy. Connector data must not be sold, used for secondary purposes, or trained on.",
    source: "Guidelines §5.3 + §4; Connector Terms",
  },
  {
    id: "credentials-and-tool-docs",
    title: "Integration credentials + tool documentation",
    detail:
      "Provide the endpoint, auth setup (API key or OAuth with PKCE; offer a Read Only option where possible), requested scopes, and test vs production credentials. API/MCP docs must include setup instructions, inputs/outputs, Read/Write/Sensitive-write classifications (see the manifest), permissions, side effects, status handling, errors and rate limits.",
    source: "Guidelines §5.4 + §3.1",
  },
  {
    id: "test-account",
    title: "Dedicated test account + demo",
    detail:
      "A test account kept accessible throughout review, with sign-in instructions and representative data, and a way to exercise transaction tools without real charges.",
    source: "Guidelines §5.5",
  },
  {
    id: "review",
    title: "Pass Meta's 3-stage review",
    detail:
      "(1) Risk assessment (security/privacy/integrity), (2) tool review — approval covers only the approved tools, (3) end-to-end QA including verifying that sensitive writes require approval every time. Status is tracked in the submissions portal; Meta does not answer individual status emails.",
    source: "Guidelines §5.7 + §6",
  },
  {
    id: "ongoing-obligations",
    title: "Ongoing Connector Terms obligations",
    detail:
      "48-hour security-incident notification to Meta, data minimisation, audit up to once per year, 30-day termination by either party, Meta may re-review or remove a connector at any time. No exclusivity.",
    source: "Connector Terms (platform.muse.ai/terms)",
  },
  {
    id: "custom-connector-fallback",
    title: "Immediately available fallback: Custom Connectors",
    detail:
      "Without any directory approval, Muse users can already connect a service that publishes a good public API/OpenAPI spec or hosted MCP server — Muse builds the connector and stores credentials in its Secure Credentials Store. Publishing the surface (item 1) + a setup prompt is therefore useful from day one.",
    source: "Meta Help Center: How Muse works with Connectors",
  },
];
