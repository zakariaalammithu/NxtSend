/**
 * Apify enrichment adapter.
 *
 * Runs an operator-chosen Actor (async start + poll + dataset
 * read), verified against Apify API v2 docs (see config.ts). The
 * Actor id and its input are operator-supplied; dataset items are
 * preserved generically with source `apify:<actorId>` — the adapter
 * never invents a field mapping for an Actor it has not seen.
 * Confidence is null: Actors do not report a uniform confidence.
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
import { APIFY_CONFIG } from "./config";

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TERMINAL_RUN_STATUSES = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);

export interface ApifyAdapterOptions {
  apiKey: string;
  /** Actor id in REST form, e.g. "username~actor-name". */
  actorId: string;
  /** Input object passed to the Actor on every run (operator-defined). */
  actorInput?: Record<string, unknown>;
  recordUsage?: UsageRecorder;
  client?: ProviderHttpClient;
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

export function createApifyAdapter(opts: ApifyAdapterOptions): EnrichmentAdapter {
  const apiKey = requireApiKey(opts.apiKey, "Apify");
  const actorId = requireApiKey(opts.actorId, "Apify (actor ID)");
  const sleep = opts.sleep ?? defaultSleep;
  const pollIntervalMs = opts.pollIntervalMs ?? APIFY_CONFIG.pollIntervalMs;
  const maxPollAttempts = opts.maxPollAttempts ?? APIFY_CONFIG.maxPollAttempts;
  const client =
    opts.client ??
    new ProviderHttpClient({
      baseUrl: APIFY_CONFIG.baseUrl,
      getAuthHeaders: () => ({ Authorization: `Bearer ${apiKey}` }),
    });
  const recordUsage = opts.recordUsage;
  const source = `apify:${actorId}`;

  async function runActor(input: Record<string, unknown>): Promise<Array<Record<string, unknown>>> {
    const started = await client.request<{
      data?: { id?: string; defaultDatasetId?: string; status?: string } | null;
    }>({
      method: "POST",
      path: `/acts/${encodeURIComponent(actorId)}/runs`,
      body: { ...opts.actorInput, ...input },
    });
    const run = started.data;
    if (!run?.id) throw toProviderError(new Error("Apify did not return a run id."));
    let datasetId = run.defaultDatasetId ?? null;
    for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
      const polled = await client.request<{
        data?: { status?: string; defaultDatasetId?: string } | null;
      }>({
        method: "GET",
        path: `/actor-runs/${encodeURIComponent(run.id)}`,
      });
      const status = polled.data?.status;
      if (polled.data?.defaultDatasetId) datasetId = polled.data.defaultDatasetId;
      if (status && TERMINAL_RUN_STATUSES.has(status)) {
        if (status !== "SUCCEEDED") {
          throw toProviderError(new Error(`Apify Actor run ended with status ${status}.`));
        }
        break;
      }
      await sleep(pollIntervalMs);
    }
    if (!datasetId) throw toProviderError(new Error("Apify run finished without a dataset id."));
    const items = await client.request<Array<Record<string, unknown>>>({
      method: "GET",
      path: `/datasets/${encodeURIComponent(datasetId)}/items`,
    });
    if (recordUsage) await recordUsage("apify.actor.run", 1);
    return Array.isArray(items) ? items : [];
  }

  function itemToResult(item: Record<string, unknown> | null): EnrichmentResult {
    const fields: EnrichmentResult["fields"] = {};
    if (!item) {
      return { provider: "apify", matched: false, confidence: null, fields, creditsUsed: 0, creditsRemaining: null };
    }
    const pick = (keys: string[]): string | undefined => {
      for (const key of keys) {
        const value = str(item[key]);
        if (value) return value;
      }
      return undefined;
    };
    const email = pick(["email", "workEmail", "emailAddress"]);
    if (email) fields.email = enrichedField(email, source);
    const firstName = pick(["firstName", "first_name"]);
    if (firstName) fields.first_name = enrichedField(firstName, source);
    const lastName = pick(["lastName", "last_name"]);
    if (lastName) fields.last_name = enrichedField(lastName, source);
    const title = pick(["title", "jobTitle", "position"]);
    if (title) fields.job_title = enrichedField(title, source);
    const company = pick(["company", "companyName", "organization"]);
    if (company) fields.company = enrichedField(company, source);
    const linkedin = pick(["linkedinUrl", "linkedin", "profileUrl"]);
    if (linkedin) fields.linkedin_url = enrichedField(linkedin, source);
    const phone = pick(["phone", "phoneNumber"]);
    if (phone) fields.phone = enrichedField(phone, source);
    const known = new Set([
      "email", "workEmail", "emailAddress", "firstName", "first_name",
      "lastName", "last_name", "title", "jobTitle", "position",
      "company", "companyName", "organization",
      "linkedinUrl", "linkedin", "profileUrl", "phone", "phoneNumber",
    ]);
    for (const [key, value] of Object.entries(item)) {
      if (known.has(key) || value === undefined || value === null || value === "") continue;
      fields[key] = enrichedField(value, source);
    }
    return {
      provider: "apify",
      matched: Object.keys(fields).length > 0,
      confidence: null,
      fields,
      creditsUsed: 0,
      creditsRemaining: null,
    };
  }

  const adapter: EnrichmentAdapter = {
    provider: "apify",

    async enrichLead(input: EnrichLeadInput): Promise<EnrichmentResult> {
      const actorInput: Record<string, unknown> = {};
      if (input.email) actorInput.email = input.email;
      if (input.linkedinUrl) actorInput.linkedinUrl = input.linkedinUrl;
      if (input.firstName) actorInput.firstName = input.firstName;
      if (input.lastName) actorInput.lastName = input.lastName;
      if (input.company) actorInput.company = input.company;
      if (input.domain) actorInput.domain = input.domain;
      if (Object.keys(actorInput).length === 0) {
        return { provider: "apify", matched: false, confidence: null, fields: {}, creditsUsed: 0, creditsRemaining: null };
      }
      try {
        const items = await runActor(actorInput);
        return itemToResult(items[0] ?? null);
      } catch (err) {
        throw mapAuthError(err, "Apify");
      }
    },

    async enrichCompany(input: { domain?: string; name?: string }): Promise<EnrichmentResult> {
      return adapter.enrichLead({ domain: input.domain, company: input.name });
    },

    async findEmail(input: EnrichLeadInput): Promise<EnrichmentResult> {
      return adapter.enrichLead(input);
    },

    async bulkEnrich(inputs: EnrichLeadInput[], options: BulkEnrichmentOptions) {
      return runBulkEnrichment({
        provider: "apify",
        inputs,
        enrichOne: (item) => adapter.enrichLead(item),
        options,
      });
    },

    async getCreditBalance(): Promise<number | null> {
      // Apify bills per-Actor-run usage; no credits-balance endpoint
      // exists in the API v2 docs.
      return null;
    },
  };

  return adapter;
}

export { toLeadPatch };
