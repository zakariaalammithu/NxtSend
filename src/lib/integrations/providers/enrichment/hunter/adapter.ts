/**
 * Hunter.io enrichment adapter (email discovery + person/company
 * enrichment). Email verification is the separate `hunter-verifier`
 * adapter — this one never calls /email-verifier.
 *
 * Endpoints verified against hunter.io/api-documentation (see
 * config.ts). Hunter supplies a 0–100 confidence on Email Finder
 * results; it is converted to 0–1 and preserved on the field.
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
import { HUNTER_CONFIG } from "./config";

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toConfidence(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value / 100));
  }
  return null;
}

export interface HunterAdapterOptions {
  apiKey: string;
  recordUsage?: UsageRecorder;
  client?: ProviderHttpClient;
}

export function createHunterAdapter(opts: HunterAdapterOptions): EnrichmentAdapter {
  const apiKey = requireApiKey(opts.apiKey, "Hunter.io");
  const client =
    opts.client ??
    new ProviderHttpClient({
      baseUrl: HUNTER_CONFIG.baseUrl,
      // X-API-KEY header keeps the key out of URLs and logs.
      getAuthHeaders: () => ({ "X-API-KEY": apiKey }),
    });
  const recordUsage = opts.recordUsage;

  async function record(event: string, credits: number): Promise<void> {
    if (recordUsage && credits > 0) await recordUsage(event, credits);
  }

  const adapter: EnrichmentAdapter = {
    provider: "hunter",

    async enrichLead(input: EnrichLeadInput): Promise<EnrichmentResult> {
      try {
        // Prefer Combined Enrichment when we have an email (person +
        // company in one call); otherwise Email Finder by name+domain.
        if (input.email) {
          const res = await client.request<{
            data?: {
              first_name?: string;
              last_name?: string;
              position?: string;
              linkedin?: string;
              location?: string;
              company?: {
                name?: string;
                domain?: string;
                industry?: string;
                size?: string;
              } | null;
            } | null;
          }>({
            method: "GET",
            path: "/combined/find",
            query: { email: input.email },
          });
          const data = res.data ?? null;
          const fields: EnrichmentResult["fields"] = {};
          if (data) {
            if (str(data.first_name)) fields.first_name = enrichedField(data.first_name, "hunter");
            if (str(data.last_name)) fields.last_name = enrichedField(data.last_name, "hunter");
            if (str(data.position)) fields.job_title = enrichedField(data.position, "hunter");
            if (str(data.linkedin)) fields.linkedin_url = enrichedField(data.linkedin, "hunter");
            if (str(data.location)) fields.location = enrichedField(data.location, "hunter");
            if (data.company) {
              if (str(data.company.name)) fields.company = enrichedField(data.company.name, "hunter");
              if (str(data.company.domain)) fields.company_domain = enrichedField(data.company.domain, "hunter");
              if (str(data.company.industry)) fields.industry = enrichedField(data.company.industry, "hunter");
              if (str(data.company.size)) fields.company_size = enrichedField(data.company.size, "hunter");
            }
          }
          const result: EnrichmentResult = {
            provider: "hunter",
            matched: Boolean(data),
            confidence: null,
            fields,
            creditsUsed: data ? 1 : 0,
            creditsRemaining: null,
          };
          await record("hunter.combined.find", result.creditsUsed);
          return result;
        }
        return adapter.findEmail(input);
      } catch (err) {
        throw mapAuthError(err, "Hunter.io");
      }
    },

    async enrichCompany(input: { domain?: string; name?: string }): Promise<EnrichmentResult> {
      if (!input.domain) {
        return {
          provider: "hunter",
          matched: false,
          confidence: null,
          fields: {},
          creditsUsed: 0,
          creditsRemaining: null,
        };
      }
      try {
        const res = await client.request<{
          data?: {
            name?: string;
            domain?: string;
            industry?: string;
            size?: string;
            linkedin?: string;
          } | null;
        }>({
          method: "GET",
          path: "/companies/find",
          query: { domain: input.domain },
        });
        const data = res.data ?? null;
        const fields: EnrichmentResult["fields"] = {};
        if (data) {
          if (str(data.name)) fields.company = enrichedField(data.name, "hunter");
          if (str(data.domain)) fields.company_domain = enrichedField(data.domain, "hunter");
          if (str(data.industry)) fields.industry = enrichedField(data.industry, "hunter");
          if (str(data.size)) fields.company_size = enrichedField(data.size, "hunter");
          if (str(data.linkedin)) fields.company_linkedin_url = enrichedField(data.linkedin, "hunter");
        }
        const result: EnrichmentResult = {
          provider: "hunter",
          matched: Boolean(data),
          confidence: null,
          fields,
          creditsUsed: data ? 1 : 0,
          creditsRemaining: null,
        };
        await record("hunter.companies.find", result.creditsUsed);
        return result;
      } catch (err) {
        throw mapAuthError(err, "Hunter.io");
      }
    },

    async findEmail(input: EnrichLeadInput): Promise<EnrichmentResult> {
      const domain = input.domain;
      if (!domain || !input.firstName || !input.lastName) {
        return {
          provider: "hunter",
          matched: false,
          confidence: null,
          fields: {},
          creditsUsed: 0,
          creditsRemaining: null,
        };
      }
      try {
        const res = await client.request<{
          data?: {
            email?: string | null;
            confidence?: number;
            first_name?: string;
            last_name?: string;
            position?: string;
            company?: string;
            linkedin?: string;
            verification?: { status?: string } | null;
            sources?: Array<{ uri?: string }> | null;
          } | null;
        }>({
          method: "GET",
          path: "/email-finder",
          query: {
            domain,
            first_name: input.firstName,
            last_name: input.lastName,
          },
        });
        const data = res.data ?? null;
        const fields: EnrichmentResult["fields"] = {};
        const confidence = data ? toConfidence(data.confidence) : null;
        if (data?.email) fields.email = enrichedField(data.email, "hunter", confidence);
        if (data && str(data.position)) fields.job_title = enrichedField(data.position, "hunter");
        if (data && str(data.company)) fields.company = enrichedField(data.company, "hunter");
        if (data && str(data.linkedin)) fields.linkedin_url = enrichedField(data.linkedin, "hunter");
        if (data?.verification?.status) {
          fields.email_verification_status = enrichedField(data.verification.status, "hunter");
        }
        if (data && Array.isArray(data.sources) && data.sources.length > 0) {
          fields.email_sources = enrichedField(
            data.sources.map((s) => s.uri).filter(Boolean),
            "hunter"
          );
        }
        const result: EnrichmentResult = {
          provider: "hunter",
          matched: Boolean(data?.email),
          confidence,
          fields,
          creditsUsed: data?.email ? 1 : 0,
          creditsRemaining: null,
        };
        await record("hunter.email-finder", result.creditsUsed);
        return result;
      } catch (err) {
        throw mapAuthError(err, "Hunter.io");
      }
    },

    async bulkEnrich(inputs: EnrichLeadInput[], options: BulkEnrichmentOptions) {
      return runBulkEnrichment({
        provider: "hunter",
        inputs,
        enrichOne: (item) => adapter.enrichLead(item),
        options,
      });
    },

    async getCreditBalance(): Promise<number | null> {
      try {
        const res = await client.request<{
          data?: {
            requests?: { searches?: { available?: number } | null } | null;
          } | null;
        }>({ method: "GET", path: "/account" });
        const available = res.data?.requests?.searches?.available;
        return typeof available === "number" ? available : null;
      } catch (err) {
        throw mapAuthError(err, "Hunter.io");
      }
    },
  };

  return adapter;
}

export { toLeadPatch };
