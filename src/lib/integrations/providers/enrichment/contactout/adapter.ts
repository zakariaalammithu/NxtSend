/**
 * ContactOut enrichment adapter.
 *
 * Endpoints verified against contactout.com/api_docs (see
 * config.ts). ContactOut returns no per-field confidence, so
 * confidence is null throughout. Credit usage follows the API
 * reference: 1 search credit per found profile, +1 per email found,
 * +1 per phone found.
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
  unsupportedOperation,
} from "../common";
import { CONTACTOUT_CONFIG } from "./config";

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export interface ContactOutAdapterOptions {
  apiKey: string;
  recordUsage?: UsageRecorder;
  client?: ProviderHttpClient;
}

export function createContactOutAdapter(opts: ContactOutAdapterOptions): EnrichmentAdapter {
  const apiKey = requireApiKey(opts.apiKey, "ContactOut");
  const client =
    opts.client ??
    new ProviderHttpClient({
      baseUrl: CONTACTOUT_CONFIG.baseUrl,
      // ContactOut's documented auth header is literally `token`.
      getAuthHeaders: () => ({ token: apiKey }),
    });
  const recordUsage = opts.recordUsage;

  function profileToResult(profile: Record<string, unknown> | null): EnrichmentResult {
    const fields: EnrichmentResult["fields"] = {};
    if (!profile) {
      return { provider: "contactout", matched: false, confidence: null, fields, creditsUsed: 0, creditsRemaining: null };
    }
    const emails = profile.emails as Array<{ email?: string; type?: string }> | undefined;
    const workEmail = emails?.find((e) => e.type === "work") ?? emails?.[0];
    if (workEmail?.email) fields.email = enrichedField(workEmail.email, "contactout");
    if (str(profile.first_name)) fields.first_name = enrichedField(profile.first_name, "contactout");
    if (str(profile.last_name)) fields.last_name = enrichedField(profile.last_name, "contactout");
    if (str(profile.title) ?? str(profile.job_title)) {
      fields.job_title = enrichedField(profile.title ?? profile.job_title, "contactout");
    }
    if (str(profile.linkedin_url) ?? str(profile.profile_url)) {
      fields.linkedin_url = enrichedField(profile.linkedin_url ?? profile.profile_url, "contactout");
    }
    const phones = profile.phones as Array<{ phone?: string }> | undefined;
    if (phones?.[0]?.phone) fields.phone = enrichedField(phones[0].phone, "contactout");
    else if (str(profile.phone)) fields.phone = enrichedField(profile.phone, "contactout");
    if (str(profile.location)) fields.location = enrichedField(profile.location, "contactout");
    const company =
      (profile.company as Record<string, unknown> | undefined) ??
      (profile.current_company as Record<string, unknown> | undefined);
    if (company && str(company.name)) fields.company = enrichedField(company.name, "contactout");
    else if (str(profile.company_name)) fields.company = enrichedField(profile.company_name, "contactout");
    if (Array.isArray(profile.skills) && profile.skills.length > 0) {
      fields.skills = enrichedField(profile.skills, "contactout");
    }
    const creditsUsed = 1 + (fields.email ? 1 : 0) + (fields.phone ? 1 : 0);
    return { provider: "contactout", matched: true, confidence: null, fields, creditsUsed, creditsRemaining: null };
  }

  async function record(event: string, credits: number): Promise<void> {
    if (recordUsage && credits > 0) await recordUsage(event, credits);
  }

  const adapter: EnrichmentAdapter = {
    provider: "contactout",

    async enrichLead(input: EnrichLeadInput): Promise<EnrichmentResult> {
      try {
        if (input.linkedinUrl) {
          const res = await client.request<{ profile?: Record<string, unknown> | null }>({
            method: "GET",
            path: "/v1/linkedin/enrich",
            query: { profile: input.linkedinUrl },
          });
          const result = profileToResult(res.profile ?? null);
          await record("contactout.linkedin.enrich", result.creditsUsed);
          return result;
        }
        const body: Record<string, unknown> = {};
        if (input.email) body.email = input.email;
        if (input.firstName) body.first_name = input.firstName;
        if (input.lastName) body.last_name = input.lastName;
        if (input.company) body.company = input.company;
        if (Object.keys(body).length === 0) {
          return { provider: "contactout", matched: false, confidence: null, fields: {}, creditsUsed: 0, creditsRemaining: null };
        }
        const res = await client.request<{ profile?: Record<string, unknown> | null }>({
          method: "POST",
          path: "/v1/people/enrich",
          body: { ...body, include: ["email", "phone"] },
        });
        const result = profileToResult(res.profile ?? null);
        await record("contactout.people.enrich", result.creditsUsed);
        return result;
      } catch (err) {
        throw mapAuthError(err, "ContactOut");
      }
    },

    async enrichCompany(): Promise<EnrichmentResult> {
      // ContactOut's documented API is people-focused; no company
      // enrichment endpoint is listed in its API reference.
      throw unsupportedOperation("ContactOut", "company enrichment");
    },

    async findEmail(input: EnrichLeadInput): Promise<EnrichmentResult> {
      if (!input.linkedinUrl) return adapter.enrichLead(input);
      try {
        const res = await client.request<{ profile?: Record<string, unknown> | null }>({
          method: "GET",
          path: "/v1/people/linkedin",
          query: { profile: input.linkedinUrl, include_phone: "true" },
        });
        const result = profileToResult(res.profile ?? null);
        await record("contactout.people.linkedin", result.creditsUsed);
        return result;
      } catch (err) {
        throw mapAuthError(err, "ContactOut");
      }
    },

    async bulkEnrich(inputs: EnrichLeadInput[], options: BulkEnrichmentOptions) {
      return runBulkEnrichment({
        provider: "contactout",
        inputs,
        enrichOne: (item) => adapter.enrichLead(item),
        options,
      });
    },

    async getCreditBalance(): Promise<number | null> {
      // No credits-balance endpoint is listed in ContactOut's API
      // reference; usage lives in the ContactOut dashboard.
      return null;
    },
  };

  return adapter;
}

export { toLeadPatch };
