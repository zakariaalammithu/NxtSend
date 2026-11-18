/**
 * ZoomInfo enrichment adapter.
 *
 * Calls the LEGACY Enterprise API paths (/search/contact,
 * /enrich/contact, /search/company, /enrich/company) on
 * https://api.zoominfo.com with a Bearer token supplied by the
 * caller — see config.ts for why the GTM-API paths are not called
 * yet (unverified, never guessed). ZoomInfo returns no per-field
 * confidence, so confidence is null throughout.
 */

import { ProviderHttpClient } from "../../client";
import type { UsageRecorder } from "../../usage";
import type {
  BulkEnrichmentOptions,
  EnrichLeadInput,
  EnrichmentAdapter,
  EnrichmentResult,
} from "../types";
import {
  enrichedField,
  mapAuthError,
  requireApiKey,
  runBulkEnrichment,
  toLeadPatch,
} from "../common";
import { ZOOMINFO_CONFIG } from "./config";

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export interface ZoomInfoAdapterOptions {
  /** Short-lived Bearer token (OAuth 2.0 client-credentials flow). */
  accessToken?: string;
  /** Optional callback that returns a fresh access token per request. */
  getAccessToken?: () => Promise<string>;
  recordUsage?: UsageRecorder;
  client?: ProviderHttpClient;
}

export function createZoomInfoAdapter(opts: ZoomInfoAdapterOptions): EnrichmentAdapter {
  const tokenSource =
    opts.getAccessToken ??
    (opts.accessToken ? async () => requireApiKey(opts.accessToken, "ZoomInfo") : null);
  if (!tokenSource) {
    requireApiKey(undefined, "ZoomInfo");
  }
  const client =
    opts.client ??
    new ProviderHttpClient({
      baseUrl: ZOOMINFO_CONFIG.baseUrl,
      getAuthHeaders: async () => ({
        Authorization: `Bearer ${await tokenSource!()}`,
      }),
    });
  const recordUsage = opts.recordUsage;

  async function record(event: string, credits: number): Promise<void> {
    if (recordUsage && credits > 0) await recordUsage(event, credits);
  }

  function personToResult(person: Record<string, unknown> | null): EnrichmentResult {
    const fields: EnrichmentResult["fields"] = {};
    if (!person) {
      return { provider: "zoominfo", matched: false, confidence: null, fields, creditsUsed: 0, creditsRemaining: null };
    }
    const email =
      str((person.email as Record<string, unknown> | undefined)?.work) ??
      str(person.email) ??
      str(person.workEmail);
    if (email) fields.email = enrichedField(email, "zoominfo");
    if (str(person.firstName)) fields.first_name = enrichedField(person.firstName, "zoominfo");
    if (str(person.lastName)) fields.last_name = enrichedField(person.lastName, "zoominfo");
    if (str(person.jobTitle)) fields.job_title = enrichedField(person.jobTitle, "zoominfo");
    if (str(person.linkedinUrl)) fields.linkedin_url = enrichedField(person.linkedinUrl, "zoominfo");
    if (str(person.phone)) fields.phone = enrichedField(person.phone, "zoominfo");
    if (str(person.managementLevel)) fields.seniority = enrichedField(person.managementLevel, "zoominfo");
    if (str(person.department)) fields.department = enrichedField(person.department, "zoominfo");
    const company = person.company as Record<string, unknown> | undefined;
    if (company) {
      if (str(company.name)) fields.company = enrichedField(company.name, "zoominfo");
      if (str(company.website)) fields.company_domain = enrichedField(company.website, "zoominfo");
      if (str(company.industry)) fields.industry = enrichedField(company.industry, "zoominfo");
    }
    return { provider: "zoominfo", matched: true, confidence: null, fields, creditsUsed: 1, creditsRemaining: null };
  }

  const adapter: EnrichmentAdapter = {
    provider: "zoominfo",

    async enrichLead(input: EnrichLeadInput): Promise<EnrichmentResult> {
      try {
        const match: Record<string, unknown> = {};
        if (input.email) match.email = input.email;
        if (input.linkedinUrl) match.linkedinUrl = input.linkedinUrl;
        if (input.firstName) match.firstName = input.firstName;
        if (input.lastName) match.lastName = input.lastName;
        if (input.company) match.companyName = input.company;
        if (Object.keys(match).length === 0) {
          return { provider: "zoominfo", matched: false, confidence: null, fields: {}, creditsUsed: 0, creditsRemaining: null };
        }
        const res = await client.request<{ data?: Array<Record<string, unknown>> | null }>({
          method: "POST",
          path: "/enrich/contact",
          body: { match, outputFields: ["*"] },
        });
        const person = res.data?.[0] ?? null;
        const result = personToResult(person);
        await record("zoominfo.enrich.contact", result.creditsUsed);
        return result;
      } catch (err) {
        throw mapAuthError(err, "ZoomInfo");
      }
    },

    async enrichCompany(input: { domain?: string; name?: string }): Promise<EnrichmentResult> {
      if (!input.domain && !input.name) {
        return { provider: "zoominfo", matched: false, confidence: null, fields: {}, creditsUsed: 0, creditsRemaining: null };
      }
      try {
        const match: Record<string, unknown> = {};
        if (input.domain) match.website = input.domain;
        if (input.name) match.companyName = input.name;
        const res = await client.request<{ data?: Array<Record<string, unknown>> | null }>({
          method: "POST",
          path: "/enrich/company",
          body: { match, outputFields: ["*"] },
        });
        const company = res.data?.[0] ?? null;
        const fields: EnrichmentResult["fields"] = {};
        if (company) {
          if (str(company.name)) fields.company = enrichedField(company.name, "zoominfo");
          if (str(company.website)) fields.company_domain = enrichedField(company.website, "zoominfo");
          if (str(company.industry)) fields.industry = enrichedField(company.industry, "zoominfo");
          if (company.employeeCount !== undefined) fields.company_size = enrichedField(company.employeeCount, "zoominfo");
          if (company.revenue !== undefined) fields.revenue = enrichedField(company.revenue, "zoominfo");
        }
        const result: EnrichmentResult = {
          provider: "zoominfo",
          matched: Boolean(company),
          confidence: null,
          fields,
          creditsUsed: company ? 1 : 0,
          creditsRemaining: null,
        };
        await record("zoominfo.enrich.company", result.creditsUsed);
        return result;
      } catch (err) {
        throw mapAuthError(err, "ZoomInfo");
      }
    },

    async findEmail(input: EnrichLeadInput): Promise<EnrichmentResult> {
      // ZoomInfo enrichment returns the work email for a matched
      // person; there is no separate email-finder endpoint.
      return adapter.enrichLead(input);
    },

    async bulkEnrich(inputs: EnrichLeadInput[], options: BulkEnrichmentOptions) {
      return runBulkEnrichment({
        provider: "zoominfo",
        inputs,
        enrichOne: (item) => adapter.enrichLead(item),
        options,
      });
    },

    async getCreditBalance(): Promise<number | null> {
      // No credits-balance endpoint is documented for the Data API;
      // usage lives in the ZoomInfo dashboard.
      return null;
    },
  };

  return adapter;
}

export { toLeadPatch };
