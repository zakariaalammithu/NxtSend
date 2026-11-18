/**
 * SalesQL enrichment adapter.
 *
 * GET /persons/enrich verified against salesql.com/api (see
 * config.ts). SalesQL returns a per-email `status` ("Valid" etc.)
 * and a per-phone `is_valid` boolean; there is no 0–100 confidence,
 * so confidence is null throughout. 1 credit per matched person.
 */

import { isProviderError, ProviderHttpClient } from "../../client";
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
  unverifiedEndpoint,
} from "../common";
import { SALESQL_CONFIG } from "./config";

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export interface SalesQlAdapterOptions {
  apiKey: string;
  recordUsage?: UsageRecorder;
  client?: ProviderHttpClient;
}

export function createSalesQlAdapter(opts: SalesQlAdapterOptions): EnrichmentAdapter {
  const apiKey = requireApiKey(opts.apiKey, "SalesQL");
  const client =
    opts.client ??
    new ProviderHttpClient({
      baseUrl: SALESQL_CONFIG.baseUrl,
      getAuthHeaders: () => ({ Authorization: `Bearer ${apiKey}` }),
    });
  const recordUsage = opts.recordUsage;

  const adapter: EnrichmentAdapter = {
    provider: "salesql",

    async enrichLead(input: EnrichLeadInput): Promise<EnrichmentResult> {
      const query: Record<string, string> = {};
      if (input.linkedinUrl) query.linkedin_url = input.linkedinUrl;
      if (input.email) query.email = input.email;
      if (input.firstName) query.first_name = input.firstName;
      if (input.lastName) query.last_name = input.lastName;
      if (input.company) query.company = input.company;
      if (Object.keys(query).length === 0) {
        return { provider: "salesql", matched: false, confidence: null, fields: {}, creditsUsed: 0, creditsRemaining: null };
      }
      try {
        const res = await client.request<{
          full_name?: string;
          first_name?: string;
          last_name?: string;
          title?: string;
          location?: string;
          linkedin_url?: string;
          company?: string | { name?: string } | null;
          emails?: Array<{ email?: string; status?: string }> | null;
          phones?: Array<{ phone?: string; type?: string; is_valid?: boolean }> | null;
        }>({
          method: "GET",
          path: "/persons/enrich",
          query,
        });
        const fields: EnrichmentResult["fields"] = {};
        const email = res.emails?.[0];
        if (email?.email) fields.email = enrichedField(email.email, "salesql");
        if (email?.status) fields.email_status = enrichedField(email.status, "salesql");
        if (str(res.first_name)) fields.first_name = enrichedField(res.first_name, "salesql");
        if (str(res.last_name)) fields.last_name = enrichedField(res.last_name, "salesql");
        if (str(res.title)) fields.job_title = enrichedField(res.title, "salesql");
        if (str(res.location)) fields.location = enrichedField(res.location, "salesql");
        if (str(res.linkedin_url)) fields.linkedin_url = enrichedField(res.linkedin_url, "salesql");
        const companyName =
          typeof res.company === "string" ? res.company : res.company?.name;
        if (str(companyName)) fields.company = enrichedField(companyName, "salesql");
        const phone = res.phones?.[0];
        if (phone?.phone) fields.phone = enrichedField(phone.phone, "salesql");
        if (phone?.is_valid !== undefined) fields.phone_is_valid = enrichedField(phone.is_valid, "salesql");
        const matched = Object.keys(fields).length > 0;
        const result: EnrichmentResult = {
          provider: "salesql",
          matched,
          confidence: null,
          fields,
          creditsUsed: matched ? 1 : 0,
          creditsRemaining: null,
        };
        if (recordUsage && result.creditsUsed > 0) {
          await recordUsage("salesql.persons.enrich", result.creditsUsed);
        }
        return result;
      } catch (err) {
        // SalesQL returns 404 when the person is not in its database;
        // per its docs that consumes no credit, so it is an
        // unmatched result, not a failure.
        if (isProviderError(err) && err.status === 404) {
          return {
            provider: "salesql",
            matched: false,
            confidence: null,
            fields: {},
            creditsUsed: 0,
            creditsRemaining: null,
          };
        }
        throw mapAuthError(err, "SalesQL");
      }
    },

    async enrichCompany(): Promise<EnrichmentResult> {
      // Company enrichment is a documented SalesQL capability, but
      // the exact organisations endpoint path is not published on
      // the pages checked — refusing to guess the URL.
      throw unverifiedEndpoint("SalesQL", "company enrichment");
    },

    async findEmail(input: EnrichLeadInput): Promise<EnrichmentResult> {
      return adapter.enrichLead(input);
    },

    async bulkEnrich(inputs: EnrichLeadInput[], options: BulkEnrichmentOptions) {
      return runBulkEnrichment({
        provider: "salesql",
        inputs,
        enrichOne: (item) => adapter.enrichLead(item),
        options,
      });
    },

    async getCreditBalance(): Promise<number | null> {
      // No credits-balance endpoint is published for the SalesQL API;
      // the balance lives in the SalesQL dashboard.
      return null;
    },
  };

  return adapter;
}

export { toLeadPatch };
