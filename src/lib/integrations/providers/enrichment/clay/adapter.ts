/**
 * Clay enrichment adapter.
 *
 * Runs an operator-configured Clay routine over lead inputs via
 * the Public API (base https://api.clay.com/public/v0, `clay-api-key`
 * header). Routine ids are workspace-specific and supplied by the
 * operator — never invented. Routine output fields are preserved
 * generically: known lead columns map directly, everything else
 * lands under custom_fields["enrichment_clay"] via toLeadPatch.
 *
 * A routine run is async: POST /routines/{id}/run returns a
 * routine_run_id; results are polled (202 while running, 200 when
 * complete) with the injected sleep.
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
import { CLAY_CONFIG } from "./config";

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ClayAdapterOptions {
  apiKey: string;
  /** Operator-configured routine id (Clay-managed function or custom routine). */
  routineId: string;
  recordUsage?: UsageRecorder;
  client?: ProviderHttpClient;
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

interface ClayRunResponse {
  routine_run_id?: string;
  run_id?: string;
}

interface ClayResultsResponse {
  status?: string;
  results?: Array<{
    id?: string;
    outputs?: Record<string, unknown> | null;
    error?: string | null;
  }>;
}

export function createClayAdapter(opts: ClayAdapterOptions): EnrichmentAdapter {
  const apiKey = requireApiKey(opts.apiKey, "Clay");
  const routineId = requireApiKey(opts.routineId, "Clay (routine ID)");
  const sleep = opts.sleep ?? defaultSleep;
  const pollIntervalMs = opts.pollIntervalMs ?? CLAY_CONFIG.pollIntervalMs;
  const maxPollAttempts = opts.maxPollAttempts ?? CLAY_CONFIG.maxPollAttempts;
  const client =
    opts.client ??
    new ProviderHttpClient({
      baseUrl: CLAY_CONFIG.baseUrl,
      getAuthHeaders: () => ({ "clay-api-key": apiKey }),
    });
  const recordUsage = opts.recordUsage;

  async function runRoutine(
    items: Array<{ id: string; inputs: Record<string, unknown> }>
  ): Promise<Array<Record<string, unknown>>> {
    const started = await client.request<ClayRunResponse>({
      method: "POST",
      path: `/routines/${encodeURIComponent(routineId)}/run`,
      body: { items },
    });
    const runId = started.routine_run_id ?? started.run_id;
    if (!runId) throw toProviderError(new Error("Clay did not return a routine_run_id."));
    for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
      const res = await client.request<ClayResultsResponse>({
        method: "GET",
        path: `/routines/run/${encodeURIComponent(runId)}/results`,
      });
      if (res.status === "complete" || res.status === "completed") {
        const outputs = (res.results ?? []).map((r) => r.outputs ?? {});
        if (recordUsage) await recordUsage("clay.routines.run", outputs.length);
        return outputs;
      }
      await sleep(pollIntervalMs);
    }
    throw toProviderError(new Error("Clay routine run did not finish within the poll window."));
  }

  function outputsToResult(outputs: Record<string, unknown>): EnrichmentResult {
    const source = `clay:${routineId}`;
    const fields: EnrichmentResult["fields"] = {};
    const pick = (keys: string[]): string | undefined => {
      for (const key of keys) {
        const value = str(outputs[key]);
        if (value) return value;
      }
      return undefined;
    };
    const email = pick(["email", "Email", "work_email", "Work Email"]);
    if (email) fields.email = enrichedField(email, source);
    const firstName = pick(["first_name", "First Name"]);
    if (firstName) fields.first_name = enrichedField(firstName, source);
    const lastName = pick(["last_name", "Last Name"]);
    if (lastName) fields.last_name = enrichedField(lastName, source);
    const title = pick(["title", "Title", "job_title", "Job Title"]);
    if (title) fields.job_title = enrichedField(title, source);
    const company = pick(["company", "Company", "company_name", "Company Name"]);
    if (company) fields.company = enrichedField(company, source);
    const linkedin = pick(["linkedin_url", "LinkedIn URL", "linkedin"]);
    if (linkedin) fields.linkedin_url = enrichedField(linkedin, source);
    const phone = pick(["phone", "Phone", "mobile_phone", "Mobile Phone"]);
    if (phone) fields.phone = enrichedField(phone, source);
    // Preserve every other routine output verbatim under its own key.
    const known = new Set([
      "email", "Email", "work_email", "Work Email",
      "first_name", "First Name", "last_name", "Last Name",
      "title", "Title", "job_title", "Job Title",
      "company", "Company", "company_name", "Company Name",
      "linkedin_url", "LinkedIn URL", "linkedin",
      "phone", "Phone", "mobile_phone", "Mobile Phone",
    ]);
    for (const [key, value] of Object.entries(outputs)) {
      if (known.has(key) || value === undefined || value === null || value === "") continue;
      fields[key] = enrichedField(value, source);
    }
    return {
      provider: "clay",
      matched: Object.keys(fields).length > 0,
      confidence: null,
      fields,
      creditsUsed: 0,
      creditsRemaining: null,
    };
  }

  const adapter: EnrichmentAdapter = {
    provider: "clay",

    async enrichLead(input: EnrichLeadInput): Promise<EnrichmentResult> {
      try {
        const inputs: Record<string, unknown> = {};
        if (input.email) inputs.email = input.email;
        if (input.firstName) inputs.first_name = input.firstName;
        if (input.lastName) inputs.last_name = input.lastName;
        if (input.company) inputs.company = input.company;
        if (input.domain) inputs.domain = input.domain;
        if (input.linkedinUrl) inputs.linkedin_url = input.linkedinUrl;
        if (Object.keys(inputs).length === 0) {
          return { provider: "clay", matched: false, confidence: null, fields: {}, creditsUsed: 0, creditsRemaining: null };
        }
        const outputs = await runRoutine([{ id: input.email ?? input.linkedinUrl ?? "lead-1", inputs }]);
        return outputsToResult(outputs[0] ?? {});
      } catch (err) {
        throw mapAuthError(err, "Clay");
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
        provider: "clay",
        inputs,
        enrichOne: (item) => adapter.enrichLead(item),
        options,
      });
    },

    async getCreditBalance(): Promise<number | null> {
      // Clay publishes no credits-balance endpoint for the Public
      // API; usage lives in the Clay workspace.
      return null;
    },
  };

  return adapter;
}

export { toLeadPatch };
