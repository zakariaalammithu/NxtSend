/**
 * Apollo.io enrichment adapter.
 *
 * Endpoints verified against docs.apollo.io (see config.ts).
 * Apollo returns no confidence scores, so every field's confidence
 * is null. Credit usage follows Apollo's documented model: 1 credit
 * when an email/demographics is returned, +8 when a mobile phone is
 * returned, 0 when nothing credit-consuming is found.
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
import { APOLLO_CONFIG } from "./config";

export type ApolloPerson = Record<string, unknown>;

interface ApolloMatchResponse {
  person?: Record<string, unknown> | null;
  organization?: Record<string, unknown> | null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function personToResult(
  person: Record<string, unknown> | null | undefined,
  organization: Record<string, unknown> | null | undefined,
  creditsUsed: number,
  creditsRemaining: number | null = null
): EnrichmentResult {
  const fields: EnrichmentResult["fields"] = {};
  if (!person) {
    return {
      provider: "apollo",
      matched: false,
      confidence: null,
      fields,
      creditsUsed: 0,
      creditsRemaining,
    };
  }
  const email = str(person.email);
  const phone =
    str(person.sanitized_phone) ?? str(person.phone_number) ?? str(person.mobile_phone);
  if (email) fields.email = enrichedField(email, "apollo");
  if (str(person.first_name)) fields.first_name = enrichedField(person.first_name, "apollo");
  if (str(person.last_name)) fields.last_name = enrichedField(person.last_name, "apollo");
  if (str(person.title)) fields.job_title = enrichedField(person.title, "apollo");
  if (str(person.linkedin_url)) fields.linkedin_url = enrichedField(person.linkedin_url, "apollo");
  if (phone) fields.phone = enrichedField(phone, "apollo");
  if (str(person.city) || str(person.state) || str(person.country)) {
    fields.location = enrichedField(
      [person.city, person.state, person.country].filter(Boolean).join(", "),
      "apollo"
    );
  }
  if (str(person.seniority)) fields.seniority = enrichedField(person.seniority, "apollo");
  if (str(person.departments)) fields.department = enrichedField(person.departments, "apollo");
  const org = (person.organization as Record<string, unknown> | undefined) ?? organization;
  if (org) {
    if (str(org.name)) fields.company = enrichedField(org.name, "apollo");
    if (str(org.primary_domain)) fields.company_domain = enrichedField(org.primary_domain, "apollo");
    if (str(org.industry)) fields.industry = enrichedField(org.industry, "apollo");
    if (org.estimated_num_employees !== undefined) {
      fields.company_size = enrichedField(org.estimated_num_employees, "apollo");
    }
  }
  if (str(person.email_status)) fields.email_status = enrichedField(person.email_status, "apollo");
  return {
    provider: "apollo",
    matched: true,
    confidence: null,
    fields,
    creditsUsed,
    creditsRemaining,
  };
}

export interface ApolloAdapterOptions {
  apiKey: string;
  recordUsage?: UsageRecorder;
  client?: ProviderHttpClient;
}

export function createApolloAdapter(opts: ApolloAdapterOptions): EnrichmentAdapter {
  const apiKey = requireApiKey(opts.apiKey, "Apollo.io");
  const client =
    opts.client ??
    new ProviderHttpClient({
      baseUrl: APOLLO_CONFIG.baseUrl,
      getAuthHeaders: () => ({ "x-api-key": apiKey }),
    });
  const recordUsage = opts.recordUsage;

  async function matchPerson(
    body: Record<string, unknown>,
    revealEmail = true
  ): Promise<EnrichmentResult> {
    try {
      const res = await client.request<ApolloMatchResponse>({
        method: "POST",
        path: "/people/match",
        body: {
          ...body,
          reveal_personal_emails: revealEmail,
          reveal_phone_number: false,
        },
      });
      const result = personToResult(
        res.person ?? null,
        res.organization ?? null,
        res.person ? 1 : 0
      );
      if (recordUsage && result.creditsUsed > 0) {
        await recordUsage("apollo.people.match", result.creditsUsed);
      }
      return result;
    } catch (err) {
      throw mapAuthError(err, "Apollo.io");
    }
  }

  const adapter: EnrichmentAdapter = {
    provider: "apollo",

    async enrichLead(input: EnrichLeadInput): Promise<EnrichmentResult> {
      const body: Record<string, unknown> = {};
      if (input.email) body.email = input.email;
      if (input.linkedinUrl) body.linkedin_url = input.linkedinUrl;
      if (input.firstName) body.first_name = input.firstName;
      if (input.lastName) body.last_name = input.lastName;
      if (input.company) body.organization_name = input.company;
      if (Object.keys(body).length === 0) {
        return {
          provider: "apollo",
          matched: false,
          confidence: null,
          fields: {},
          creditsUsed: 0,
          creditsRemaining: null,
        };
      }
      return matchPerson(body);
    },

    async enrichCompany(input: { domain?: string; name?: string }): Promise<EnrichmentResult> {
      if (!input.domain && !input.name) {
        return {
          provider: "apollo",
          matched: false,
          confidence: null,
          fields: {},
          creditsUsed: 0,
          creditsRemaining: null,
        };
      }
      try {
        const res = await client.request<{ organization?: Record<string, unknown> | null }>({
          method: "POST",
          path: "/organizations/enrich",
          body: { domain: input.domain, name: input.name },
        });
        const org = res.organization ?? null;
        const fields: EnrichmentResult["fields"] = {};
        if (org) {
          if (str(org.name)) fields.company = enrichedField(org.name, "apollo");
          if (str(org.primary_domain)) fields.company_domain = enrichedField(org.primary_domain, "apollo");
          if (str(org.industry)) fields.industry = enrichedField(org.industry, "apollo");
          if (org.estimated_num_employees !== undefined) {
            fields.company_size = enrichedField(org.estimated_num_employees, "apollo");
          }
          if (str(org.linkedin_url)) fields.company_linkedin_url = enrichedField(org.linkedin_url, "apollo");
        }
        const result: EnrichmentResult = {
          provider: "apollo",
          matched: Boolean(org),
          confidence: null,
          fields,
          creditsUsed: org ? 1 : 0,
          creditsRemaining: null,
        };
        if (recordUsage && result.creditsUsed > 0) {
          await recordUsage("apollo.organizations.enrich", result.creditsUsed);
        }
        return result;
      } catch (err) {
        throw mapAuthError(err, "Apollo.io");
      }
    },

    async findEmail(input: EnrichLeadInput): Promise<EnrichmentResult> {
      return matchPerson(
        {
          first_name: input.firstName,
          last_name: input.lastName,
          organization_name: input.company,
          domain: input.domain,
        },
        true
      );
    },

    async bulkEnrich(inputs: EnrichLeadInput[], options: BulkEnrichmentOptions) {
      return runBulkEnrichment({
        provider: "apollo",
        inputs,
        enrichOne: (item) => adapter.enrichLead(item),
        options,
      });
    },

    async getCreditBalance(): Promise<number | null> {
      // Apollo exposes no credits-balance endpoint in its public API
      // docs; the balance lives in the Apollo dashboard.
      return null;
    },
  };

  return adapter;
}

export { toLeadPatch };
