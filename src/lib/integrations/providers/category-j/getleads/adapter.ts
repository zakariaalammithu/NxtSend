/**
 * GetLeads enrichment adapter (contact/company search + person and
 * company enrichment).
 *
 * Endpoints verified against https://www.getleads.io/docs/ (see
 * ./config.ts). GetLeads returns REST rows with storage names for
 * some fields (company search: co_name, org_domain,
 * current_company_linkedin_url); the mappers below accept both the
 * storage names and the public/canonical names, and never invent a
 * value that is absent.
 *
 * Credit note (per the docs): one plan credit buys one returned
 * record; a genuine no-match enrichment should not consume a
 * record credit, so creditsUsed is 1 only when a record matched.
 * email_status VALID is the only deliverable label — a stored work
 * email with CATCH_ALL / UNKNOWN is returned as-is with its status,
 * never upgraded to "verified" here.
 */

import { ProviderHttpClient } from "../../client";
import type { UsageRecorder } from "../../usage";
import type {
  BulkEnrichmentOptions,
  EnrichLeadInput,
  EnrichmentAdapter,
  EnrichmentResult,
} from "../../enrichment/types";
import {
  enrichedField,
  mapAuthError,
  requireApiKey,
  runBulkEnrichment,
  toLeadPatch,
} from "../../enrichment/common";
import { cleanStr, splitFullName, type CategoryJLead } from "../types";
import { GETLEADS_CONFIG } from "./config";

type JsonRecord = Record<string, unknown>;

function str(value: unknown): string | undefined {
  return cleanStr(value);
}

/** First defined string among the candidate keys of a row. */
function pick(row: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = str(row[key]);
    if (value) return value;
  }
  return undefined;
}

/** Maps one GetLeads contact row onto a CategoryJLead. */
export function getLeadsContactToLead(row: JsonRecord): CategoryJLead {
  const fullName = pick(row, ["full_name", "name"]);
  const { firstName, lastName } = splitFullName(fullName);
  return {
    email: pick(row, ["work_email", "email"]),
    firstName: pick(row, ["first_name"]) ?? firstName,
    lastName: pick(row, ["last_name"]) ?? lastName,
    company: pick(row, ["company_name", "current_employer", "co_name"]),
    companyDomain: pick(row, ["company_domain", "org_domain", "domain"]),
    jobTitle: pick(row, ["current_title", "job_title", "title"]),
    linkedinUrl: pick(row, ["linkedin_url", "profileUrl"]),
    country: pick(row, ["country", "person_country"]),
    tags: [],
  };
}

/** Maps one GetLeads contact row onto enrichment fields. */
function contactRowToFields(row: JsonRecord): EnrichmentResult["fields"] {
  const fields: EnrichmentResult["fields"] = {};
  const lead = getLeadsContactToLead(row);
  if (lead.firstName) fields.first_name = enrichedField(lead.firstName, "getleads");
  if (lead.lastName) fields.last_name = enrichedField(lead.lastName, "getleads");
  if (lead.email) fields.email = enrichedField(lead.email, "getleads");
  if (lead.jobTitle) fields.job_title = enrichedField(lead.jobTitle, "getleads");
  if (lead.company) fields.company = enrichedField(lead.company, "getleads");
  if (lead.companyDomain)
    fields.company_domain = enrichedField(lead.companyDomain, "getleads");
  if (lead.linkedinUrl)
    fields.linkedin_url = enrichedField(lead.linkedinUrl, "getleads");
  const emailStatus = pick(row, ["email_status"]);
  if (emailStatus)
    fields.email_status = enrichedField(emailStatus, "getleads");
  const phone = pick(row, ["direct_dial", "direct_phone", "mobile_phone"]);
  if (phone) fields.phone = enrichedField(phone, "getleads");
  const headline = pick(row, ["linkedin_headline"]);
  if (headline) fields.linkedin_headline = enrichedField(headline, "getleads");
  return fields;
}

/** Maps one GetLeads company row (storage names) onto enrichment fields. */
function companyRowToFields(row: JsonRecord): EnrichmentResult["fields"] {
  const fields: EnrichmentResult["fields"] = {};
  const name = pick(row, ["co_name", "company_name", "name"]);
  if (name) fields.company = enrichedField(name, "getleads");
  const domain = pick(row, ["org_domain", "company_domain", "domain"]);
  if (domain) fields.company_domain = enrichedField(domain, "getleads");
  const linkedin = pick(row, ["current_company_linkedin_url", "company_linkedin_url"]);
  if (linkedin) fields.company_linkedin_url = enrichedField(linkedin, "getleads");
  const website = pick(row, ["co_website", "company_website"]);
  if (website) fields.company_website = enrichedField(website, "getleads");
  const industry = pick(row, ["current_company_industry", "company_industry"]);
  if (industry) fields.industry = enrichedField(industry, "getleads");
  const size = pick(row, ["employee_count_range"]);
  if (size) fields.company_size = enrichedField(size, "getleads");
  const country = pick(row, ["company_hq_country"]);
  if (country) fields.company_hq_country = enrichedField(country, "getleads");
  const city = pick(row, ["company_hq_city"]);
  if (city) fields.company_hq_city = enrichedField(city, "getleads");
  return fields;
}

/** Enrichment responses carry one result per input item; accept the documented container keys. */
function readEnrichItems(body: JsonRecord): JsonRecord[] {
  for (const key of ["results", "items", "data"]) {
    const value = body[key];
    if (Array.isArray(value)) return value as JsonRecord[];
  }
  return [];
}

export interface GetLeadsAdapterOptions {
  apiKey: string;
  recordUsage?: UsageRecorder;
  client?: ProviderHttpClient;
}

export interface GetLeadsSearchFilters {
  domains?: string[];
  jobTitles?: string[];
  seniority?: string[];
  industries?: string[];
  countries?: string[];
  companyName?: string;
  requireEmail?: boolean;
  emailStatus?: string[];
}

export interface GetLeadsAdapter extends EnrichmentAdapter {
  /** Discover contacts: POST /api/v1/contacts/search, paged. */
  searchContacts(
    filters: GetLeadsSearchFilters,
    opts?: { limit?: number; offset?: number }
  ): Promise<{ leads: CategoryJLead[]; hasMore: boolean; nextOffset: number | null }>;
  /** Discover companies: POST /api/v1/companies/search, paged. */
  searchCompanies(
    filters: { domains?: string[]; companyName?: string },
    opts?: { limit?: number; offset?: number }
  ): Promise<EnrichmentResult[]>;
  /** One company profile: GET /api/v1/companies/lookup?domain=. */
  lookupCompany(input: { domain?: string; name?: string }): Promise<EnrichmentResult>;
}

export function createGetLeadsAdapter(opts: GetLeadsAdapterOptions): GetLeadsAdapter {
  const apiKey = requireApiKey(opts.apiKey, "GetLeads");
  const client =
    opts.client ??
    new ProviderHttpClient({
      baseUrl: GETLEADS_CONFIG.baseUrl,
      getAuthHeaders: () => ({ Authorization: `Bearer ${apiKey}` }),
    });
  const recordUsage = opts.recordUsage;

  async function record(event: string, credits: number): Promise<void> {
    if (recordUsage && credits > 0) await recordUsage(event, credits);
  }

  async function enrichFrom(
    path: string,
    item: JsonRecord
  ): Promise<EnrichmentResult> {
    try {
      const res = await client.request<JsonRecord>({
        method: "POST",
        path,
        body: { items: [item], limit_per_item: 1 },
      });
      const first = readEnrichItems(res)[0];
      const data =
        first && first.success !== false && first.data && typeof first.data === "object"
          ? (first.data as JsonRecord)
          : null;
      const fields = data ? contactRowToFields(data) : {};
      const matched = Boolean(data && Object.keys(fields).length > 0);
      const result: EnrichmentResult = {
        provider: "getleads",
        matched,
        confidence: null,
        fields,
        creditsUsed: matched ? 1 : 0,
        creditsRemaining:
          typeof res.creditsRemaining === "number" ? res.creditsRemaining : null,
      };
      await record(`getleads.${path.split("/").pop() ?? "enrich"}`, result.creditsUsed);
      return result;
    } catch (err) {
      throw mapAuthError(err, "GetLeads");
    }
  }

  const adapter: GetLeadsAdapter = {
    provider: "getleads",

    async enrichLead(input: EnrichLeadInput): Promise<EnrichmentResult> {
      if (input.email) {
        return enrichFrom("/api/v1/enrich/from-email", { email: input.email });
      }
      if (input.linkedinUrl) {
        return enrichFrom("/api/v1/enrich/from-linkedin", {
          linkedin_url: input.linkedinUrl,
        });
      }
      return adapter.findEmail(input);
    },

    async enrichCompany(input: { domain?: string; name?: string }): Promise<EnrichmentResult> {
      if (!input.domain && !input.name) {
        return {
          provider: "getleads",
          matched: false,
          confidence: null,
          fields: {},
          creditsUsed: 0,
          creditsRemaining: null,
        };
      }
      return adapter.lookupCompany(input);
    },

    async findEmail(input: EnrichLeadInput): Promise<EnrichmentResult> {
      if (input.email) {
        return enrichFrom("/api/v1/enrich/from-email", { email: input.email });
      }
      if (!input.firstName || !input.lastName) {
        return {
          provider: "getleads",
          matched: false,
          confidence: null,
          fields: {},
          creditsUsed: 0,
          creditsRemaining: null,
        };
      }
      const item: JsonRecord = {
        first_name: input.firstName,
        last_name: input.lastName,
      };
      if (input.company) item.company_name = input.company;
      else if (input.domain) item.email_domain = input.domain;
      else {
        return {
          provider: "getleads",
          matched: false,
          confidence: null,
          fields: {},
          creditsUsed: 0,
          creditsRemaining: null,
        };
      }
      return enrichFrom("/api/v1/enrich/from-person", item);
    },

    async bulkEnrich(inputs: EnrichLeadInput[], options: BulkEnrichmentOptions) {
      return runBulkEnrichment({
        provider: "getleads",
        inputs,
        enrichOne: (item) => adapter.enrichLead(item),
        options,
      });
    },

    async getCreditBalance(): Promise<number | null> {
      try {
        const res = await client.request<JsonRecord>({
          method: "GET",
          path: "/api/v1/usage/fair-use",
        });
        // `creditsRemaining` is the field GetLeads itself returns on
        // its count/search responses; anything else is not parsed.
        return typeof res.creditsRemaining === "number" ? res.creditsRemaining : null;
      } catch (err) {
        throw mapAuthError(err, "GetLeads");
      }
    },

    async searchContacts(filters, opts) {
      try {
        const body: JsonRecord = {
          filters: {
            ...(filters.domains ? { domains: filters.domains } : {}),
            ...(filters.jobTitles ? { job_titles: filters.jobTitles } : {}),
            ...(filters.seniority ? { seniority: filters.seniority } : {}),
            ...(filters.industries ? { industries: filters.industries } : {}),
            ...(filters.countries ? { countries: filters.countries } : {}),
            ...(filters.companyName ? { company_name: filters.companyName } : {}),
            ...(filters.requireEmail !== undefined
              ? { require_email: filters.requireEmail }
              : {}),
            ...(filters.emailStatus ? { email_status: filters.emailStatus } : {}),
          },
          columns: GETLEADS_CONFIG.contactColumns,
          limit: Math.min(opts?.limit ?? 100, GETLEADS_CONFIG.maxSearchPage),
          offset: opts?.offset ?? 0,
        };
        const res = await client.request<JsonRecord>({
          method: "POST",
          path: "/api/v1/contacts/search",
          body,
        });
        const rows = Array.isArray(res.contacts) ? (res.contacts as JsonRecord[]) : [];
        return {
          leads: rows.map(getLeadsContactToLead),
          hasMore: res.has_more === true,
          nextOffset: typeof res.next_offset === "number" ? res.next_offset : null,
        };
      } catch (err) {
        throw mapAuthError(err, "GetLeads");
      }
    },

    async searchCompanies(filters, opts) {
      try {
        const res = await client.request<JsonRecord>({
          method: "POST",
          path: "/api/v1/companies/search",
          body: {
            filters: {
              ...(filters.domains ? { domains: filters.domains } : {}),
              ...(filters.companyName ? { company_name: filters.companyName } : {}),
            },
            columns: GETLEADS_CONFIG.companyColumns,
            limit: Math.min(opts?.limit ?? 100, 5000),
            offset: opts?.offset ?? 0,
          },
        });
        const rows = Array.isArray(res.companies) ? (res.companies as JsonRecord[]) : [];
        return rows.map((row) => {
          const fields = companyRowToFields(row);
          return {
            provider: "getleads",
            matched: Object.keys(fields).length > 0,
            confidence: null,
            fields,
            creditsUsed: Object.keys(fields).length > 0 ? 1 : 0,
            creditsRemaining:
              typeof res.creditsRemaining === "number" ? res.creditsRemaining : null,
          } satisfies EnrichmentResult;
        });
      } catch (err) {
        throw mapAuthError(err, "GetLeads");
      }
    },

    async lookupCompany(input) {
      if (!input.domain && !input.name) {
        return {
          provider: "getleads",
          matched: false,
          confidence: null,
          fields: {},
          creditsUsed: 0,
          creditsRemaining: null,
        };
      }
      try {
        const res = await client.request<JsonRecord>({
          method: "GET",
          path: "/api/v1/companies/lookup",
          query: input.domain ? { domain: input.domain } : { company_name: input.name ?? "" },
        });
        const company =
          res.found === true && res.company && typeof res.company === "object"
            ? (res.company as JsonRecord)
            : null;
        const fields = company ? companyRowToFields(company) : {};
        const result: EnrichmentResult = {
          provider: "getleads",
          matched: Boolean(company),
          confidence: null,
          fields,
          creditsUsed: company ? 1 : 0,
          creditsRemaining:
            typeof res.creditsRemaining === "number" ? res.creditsRemaining : null,
        };
        await record("getleads.companies.lookup", result.creditsUsed);
        return result;
      } catch (err) {
        throw mapAuthError(err, "GetLeads");
      }
    },
  };

  return adapter;
}

export { toLeadPatch };
