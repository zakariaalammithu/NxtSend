/**
 * Dropcontact enrichment adapter.
 *
 * Single async endpoint POST /v1/enrich/all + poll
 * GET /v1/enrich/all/{request_id}, verified against
 * developer.dropcontact.com (see config.ts). The email
 * `qualification` (e.g. "nominative@pro") is preserved verbatim on
 * the email_qualification field. Credits are spent only when a
 * verified email is returned; `credits_left` rides on every
 * response.
 */

import { ProviderHttpClient, toProviderError } from "../../client";
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
import { DROPCONTACT_CONFIG } from "./config";

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type DropcontactRecord = Record<string, unknown> & {
  email?: Array<{ email?: string; qualification?: string }>;
};

export interface DropcontactAdapterOptions {
  apiKey: string;
  recordUsage?: UsageRecorder;
  client?: ProviderHttpClient;
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

export function createDropcontactAdapter(
  opts: DropcontactAdapterOptions
): EnrichmentAdapter {
  const apiKey = requireApiKey(opts.apiKey, "Dropcontact");
  const sleep = opts.sleep ?? defaultSleep;
  const pollIntervalMs = opts.pollIntervalMs ?? DROPCONTACT_CONFIG.pollIntervalMs;
  const maxPollAttempts = opts.maxPollAttempts ?? DROPCONTACT_CONFIG.maxPollAttempts;
  const client =
    opts.client ??
    new ProviderHttpClient({
      baseUrl: DROPCONTACT_CONFIG.baseUrl,
      getAuthHeaders: () => ({ "X-Access-Token": apiKey }),
    });
  const recordUsage = opts.recordUsage;

  function recordToResult(
    record: DropcontactRecord | null,
    creditsRemaining: number | null
  ): EnrichmentResult {
    const fields: EnrichmentResult["fields"] = {};
    if (!record) {
      return { provider: "dropcontact", matched: false, confidence: null, fields, creditsUsed: 0, creditsRemaining };
    }
    const emailEntry = Array.isArray(record.email) ? record.email[0] : undefined;
    if (emailEntry?.email) fields.email = enrichedField(emailEntry.email, "dropcontact");
    if (emailEntry?.qualification) {
      fields.email_qualification = enrichedField(emailEntry.qualification, "dropcontact");
    }
    if (str(record.first_name)) fields.first_name = enrichedField(record.first_name, "dropcontact");
    if (str(record.last_name)) fields.last_name = enrichedField(record.last_name, "dropcontact");
    if (str(record.job_title)) fields.job_title = enrichedField(record.job_title, "dropcontact");
    if (str(record.company)) fields.company = enrichedField(record.company, "dropcontact");
    if (str(record.linkedin)) fields.linkedin_url = enrichedField(record.linkedin, "dropcontact");
    if (str(record.phone)) fields.phone = enrichedField(record.phone, "dropcontact");
    if (str(record.location)) fields.location = enrichedField(record.location, "dropcontact");
    if (str(record.website)) fields.company_domain = enrichedField(record.website, "dropcontact");
    if (str(record.industry)) fields.industry = enrichedField(record.industry, "dropcontact");
    if (str(record.nb_employees)) fields.company_size = enrichedField(record.nb_employees, "dropcontact");
    if (str(record.siren)) fields.siren = enrichedField(record.siren, "dropcontact");
    if (str(record.siret)) fields.siret = enrichedField(record.siret, "dropcontact");
    if (str(record.vat)) fields.vat = enrichedField(record.vat, "dropcontact");
    // Matched means Dropcontact returned something usable: a
    // verified email, a phone, or company data. A name-only record
    // (no email, no phone, no company) is not a match.
    const matched = Boolean(
      emailEntry?.email ?? record.phone ?? record.company ?? record.website
    );
    return {
      provider: "dropcontact",
      matched,
      confidence: null,
      fields,
      creditsUsed: emailEntry?.email ? 1 : 0,
      creditsRemaining,
    };
  }

  async function enrichBatch(
    contacts: Array<Record<string, unknown>>
  ): Promise<Array<{ result: EnrichmentResult }>> {
    const submit = await client.request<{
      request_id?: string;
      credits_left?: number;
      success?: boolean;
    }>({
      method: "POST",
      path: "/enrich/all",
      body: { data: contacts },
    });
    if (!submit.request_id) {
      throw toProviderError(new Error("Dropcontact did not return a request_id."));
    }
    let creditsRemaining =
      typeof submit.credits_left === "number" ? submit.credits_left : null;
    for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
      const res = await client.request<{
        success?: boolean;
        reason?: string;
        credits_left?: number;
        data?: DropcontactRecord[];
      }>({
        method: "GET",
        path: `/enrich/all/${submit.request_id}`,
      });
      if (typeof res.credits_left === "number") creditsRemaining = res.credits_left;
      if (res.success === false) {
        await sleep(pollIntervalMs);
        continue;
      }
      const data = res.data ?? [];
      const results = data.map((record) => ({ result: recordToResult(record, creditsRemaining) }));
      const creditsUsed = results.reduce((sum, r) => sum + r.result.creditsUsed, 0);
      if (recordUsage && creditsUsed > 0) {
        await recordUsage("dropcontact.enrich.all", creditsUsed);
      }
      return results;
    }
    throw toProviderError(
      new Error("Dropcontact enrichment did not finish within the poll window.")
    );
  }

  const adapter: EnrichmentAdapter = {
    provider: "dropcontact",

    async enrichLead(input: EnrichLeadInput): Promise<EnrichmentResult> {
      const contact: Record<string, unknown> = {};
      if (input.firstName) contact.first_name = input.firstName;
      if (input.lastName) contact.last_name = input.lastName;
      if (input.company) contact.company = input.company;
      if (input.domain) contact.website = input.domain;
      if (input.email) contact.email = input.email;
      if (input.linkedinUrl) contact.linkedin = input.linkedinUrl;
      if (Object.keys(contact).length === 0) {
        return { provider: "dropcontact", matched: false, confidence: null, fields: {}, creditsUsed: 0, creditsRemaining: null };
      }
      try {
        const [first] = await enrichBatch([contact]);
        return first?.result ?? { provider: "dropcontact", matched: false, confidence: null, fields: {}, creditsUsed: 0, creditsRemaining: null };
      } catch (err) {
        throw mapAuthError(err, "Dropcontact");
      }
    },

    async enrichCompany(input: { domain?: string; name?: string }): Promise<EnrichmentResult> {
      if (!input.domain && !input.name) {
        return { provider: "dropcontact", matched: false, confidence: null, fields: {}, creditsUsed: 0, creditsRemaining: null };
      }
      try {
        const [first] = await enrichBatch([
          { company: input.name ?? "", website: input.domain ?? "" },
        ]);
        return first?.result ?? { provider: "dropcontact", matched: false, confidence: null, fields: {}, creditsUsed: 0, creditsRemaining: null };
      } catch (err) {
        throw mapAuthError(err, "Dropcontact");
      }
    },

    async findEmail(input: EnrichLeadInput): Promise<EnrichmentResult> {
      return adapter.enrichLead(input);
    },

    async bulkEnrich(inputs: EnrichLeadInput[], options: BulkEnrichmentOptions) {
      // Dropcontact's native batch takes up to 250 contacts in one
      // call, so bulk goes through the shared sync-job runner with
      // per-contact calls here; a future optimisation can submit
      // real 250-contact batches and map results back by index.
      return runBulkEnrichment({
        provider: "dropcontact",
        inputs,
        enrichOne: (item) => adapter.enrichLead(item),
        options,
      });
    },

    async getCreditBalance(): Promise<number | null> {
      // No separate balance endpoint: Dropcontact documents checking
      // the balance by reading `credits_left` off any enrich call.
      // An empty batch is the documented zero-cost probe.
      try {
        const res = await client.request<{ credits_left?: number }>({
          method: "POST",
          path: "/enrich/all",
          body: { data: [] },
        });
        return typeof res.credits_left === "number" ? res.credits_left : null;
      } catch (err) {
        throw mapAuthError(err, "Dropcontact");
      }
    },
  };

  return adapter;
}

export { toLeadPatch };
