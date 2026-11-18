/**
 * RB2B enrichment adapter — WEBHOOK INGESTION ONLY.
 *
 * RB2B has no query API for identified visitors (see config.ts):
 * data arrives as an outbound webhook push per page view. This
 * module is pure mapping — it takes a decoded RB2B webhook payload
 * and returns an EnrichmentResult + lead patch, exactly as a
 * webhook receiver route would use it. It makes no HTTP calls and
 * needs no credential to map a payload.
 *
 * Payload fields (per RB2B's documented webhook shape): email,
 * first_name, last_name, job_title, company, linkedin_url, city,
 * state, industry, revenue, employee_count, pages_visited, tags.
 * Unknown extra fields are preserved under
 * custom_fields["enrichment_rb2b"] by toLeadPatch.
 */

import type { SyncResult } from "../../types";
import type {
  BulkEnrichmentOptions,
  EnrichLeadInput,
  EnrichmentAdapter,
  EnrichmentResult,
} from "../types";
import { enrichedField, toLeadPatch, unsupportedOperation } from "../common";
import { RB2B_CONFIG } from "./config";

export interface Rb2bVisitorPayload {
  email?: string;
  first_name?: string;
  last_name?: string;
  job_title?: string;
  company?: string;
  linkedin_url?: string;
  city?: string;
  state?: string;
  industry?: string;
  revenue?: string | number;
  employee_count?: string | number;
  pages_visited?: string[];
  tags?: string[];
  [key: string]: unknown;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Maps one RB2B webhook payload onto an enrichment result. Pure. */
export function rb2bPayloadToResult(payload: Rb2bVisitorPayload): EnrichmentResult {
  const fields: EnrichmentResult["fields"] = {};
  if (str(payload.email)) fields.email = enrichedField(payload.email, "rb2b");
  if (str(payload.first_name)) fields.first_name = enrichedField(payload.first_name, "rb2b");
  if (str(payload.last_name)) fields.last_name = enrichedField(payload.last_name, "rb2b");
  if (str(payload.job_title)) fields.job_title = enrichedField(payload.job_title, "rb2b");
  if (str(payload.company)) fields.company = enrichedField(payload.company, "rb2b");
  if (str(payload.linkedin_url)) fields.linkedin_url = enrichedField(payload.linkedin_url, "rb2b");
  const location = [payload.city, payload.state].filter(Boolean).join(", ");
  if (location) fields.location = enrichedField(location, "rb2b");
  if (str(payload.industry)) fields.industry = enrichedField(payload.industry, "rb2b");
  if (payload.employee_count !== undefined) fields.company_size = enrichedField(payload.employee_count, "rb2b");
  if (payload.revenue !== undefined) fields.revenue = enrichedField(payload.revenue, "rb2b");
  if (Array.isArray(payload.pages_visited) && payload.pages_visited.length > 0) {
    fields.pages_visited = enrichedField(payload.pages_visited, "rb2b");
  }
  if (Array.isArray(payload.tags) && payload.tags.length > 0) {
    fields.tags = enrichedField(payload.tags, "rb2b");
  }
  return {
    provider: "rb2b",
    matched: Object.keys(fields).length > 0,
    confidence: null,
    fields,
    creditsUsed: 0,
    creditsRemaining: null,
  };
}

/** Lead patch for an RB2B visitor payload. Pure. */
export function rb2bPayloadToLeadPatch(payload: Rb2bVisitorPayload) {
  return toLeadPatch("rb2b", rb2bPayloadToResult(payload));
}

export function createRb2bAdapter(): EnrichmentAdapter {
  const adapter: EnrichmentAdapter = {
    provider: "rb2b",

    async enrichLead(_input: EnrichLeadInput): Promise<EnrichmentResult> {
      void _input;
      // No pull API exists: enrichment only happens when RB2B pushes
      // a visitor webhook. Call rb2bPayloadToResult(payload) instead.
      throw unsupportedOperation("RB2B", "pull-based enrichment (no query API exists)");
    },

    async enrichCompany(_input: { domain?: string; name?: string }): Promise<EnrichmentResult> {
      void _input;
      throw unsupportedOperation("RB2B", "pull-based enrichment (no query API exists)");
    },

    async findEmail(_input: EnrichLeadInput): Promise<EnrichmentResult> {
      void _input;
      throw unsupportedOperation("RB2B", "pull-based enrichment (no query API exists)");
    },

    async bulkEnrich(
      _inputs: EnrichLeadInput[],
      _options: BulkEnrichmentOptions
    ): Promise<SyncResult> {
      void _inputs;
      void _options;
      throw unsupportedOperation("RB2B", "bulk enrichment (no query API exists)");
    },

    async getCreditBalance(): Promise<number | null> {
      // Credit usage is only exposed through the OEM partner API,
      // which is out of scope (partner program only).
      return null;
    },
  };

  return adapter;
}

export { RB2B_CONFIG, toLeadPatch };
