/**
 * Snov.io enrichment adapter.
 *
 * OAuth client-credentials token exchange + async v2 task flow,
 * verified against snov.io/api (see config.ts). The access token is
 * cached in the adapter instance until shortly before expiry.
 * Polling uses the injected `sleep` (default 5s, up to 12 polls).
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
import { SNOV_CONFIG } from "./config";

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SnovAdapterOptions {
  clientId: string;
  clientSecret: string;
  recordUsage?: UsageRecorder;
  client?: ProviderHttpClient;
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

export function createSnovAdapter(opts: SnovAdapterOptions): EnrichmentAdapter {
  const clientId = requireApiKey(opts.clientId, "Snov.io (client ID)");
  const clientSecret = requireApiKey(opts.clientSecret, "Snov.io (client secret)");
  const sleep = opts.sleep ?? defaultSleep;
  const pollIntervalMs = opts.pollIntervalMs ?? SNOV_CONFIG.pollIntervalMs;
  const maxPollAttempts = opts.maxPollAttempts ?? SNOV_CONFIG.maxPollAttempts;
  let cachedToken: { token: string; expiresAt: number } | null = null;

  const client =
    opts.client ??
    new ProviderHttpClient({
      baseUrl: SNOV_CONFIG.baseUrl,
      getAuthHeaders: async () => {
        if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
          return { Authorization: `Bearer ${cachedToken.token}` };
        }
        const tokenRes = await new ProviderHttpClient({
          baseUrl: SNOV_CONFIG.baseUrl,
          getAuthHeaders: () => ({}),
        }).request<{ access_token?: string; expires_in?: number }>({
          method: "POST",
          path: "/v1/oauth/access_token",
          body: {
            grant_type: "client_credentials",
            client_id: clientId,
            client_secret: clientSecret,
          },
        });
        if (!tokenRes.access_token) {
          throw toProviderError(new Error("Snov.io did not return an access token."));
        }
        cachedToken = {
          token: tokenRes.access_token,
          expiresAt: Date.now() + (tokenRes.expires_in ?? 3600) * 1000,
        };
        return { Authorization: `Bearer ${cachedToken.token}` };
      },
    });
  const recordUsage = opts.recordUsage;

  async function startTask(
    path: string,
    body: Record<string, unknown>,
    event: string
  ): Promise<string> {
    const res = await client.request<{ task_hash?: string; taskHash?: string }>({
      method: "POST",
      path,
      body,
    });
    const taskHash = res.task_hash ?? res.taskHash;
    if (!taskHash) throw toProviderError(new Error(`Snov.io ${path} did not return a task_hash.`));
    if (recordUsage) await recordUsage(event, 1);
    return taskHash;
  }

  async function pollTask<T>(resultPath: (taskHash: string) => string, taskHash: string): Promise<T> {
    let last: T | null = null;
    for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
      const res = await client.request<T & { success?: boolean; status?: string }>({
        method: "GET",
        path: resultPath(taskHash),
      });
      last = res;
      // Snov marks unfinished tasks with success=false / status pending.
      if (res.success === false || res.status === "pending" || res.status === "processing") {
        await sleep(pollIntervalMs);
        continue;
      }
      return res;
    }
    if (last) return last;
    throw toProviderError(new Error("Snov.io task did not finish within the poll window."));
  }

  function prospectToResult(prospect: Record<string, unknown> | null): EnrichmentResult {
    const fields: EnrichmentResult["fields"] = {};
    if (!prospect) {
      return { provider: "snov", matched: false, confidence: null, fields, creditsUsed: 0, creditsRemaining: null };
    }
    if (str(prospect.email)) fields.email = enrichedField(prospect.email, "snov");
    if (str(prospect.first_name)) fields.first_name = enrichedField(prospect.first_name, "snov");
    if (str(prospect.last_name)) fields.last_name = enrichedField(prospect.last_name, "snov");
    if (str(prospect.position)) fields.job_title = enrichedField(prospect.position, "snov");
    if (str(prospect.company_name)) fields.company = enrichedField(prospect.company_name, "snov");
    if (str(prospect.linkedin)) fields.linkedin_url = enrichedField(prospect.linkedin, "snov");
    if (str(prospect.location)) fields.location = enrichedField(prospect.location, "snov");
    if (str(prospect.verification_status)) {
      fields.email_verification_status = enrichedField(prospect.verification_status, "snov");
    }
    return {
      provider: "snov",
      matched: Boolean(prospect.email ?? prospect.first_name),
      confidence: null,
      fields,
      creditsUsed: prospect.email ? 1 : 0,
      creditsRemaining: null,
    };
  }

  const adapter: EnrichmentAdapter = {
    provider: "snov",

    async enrichLead(input: EnrichLeadInput): Promise<EnrichmentResult> {
      try {
        if (input.linkedinUrl) {
          const taskHash = await startTask(
            "/v2/li-profiles-by-urls/start",
            { urls: [input.linkedinUrl] },
            "snov.li-profiles-by-urls"
          );
          const res = await pollTask<{ data?: Array<Record<string, unknown>> }>(
            (h) => `/v2/li-profiles-by-urls/result?task_hash=${h}`,
            taskHash
          );
          return prospectToResult(res.data?.[0] ?? null);
        }
        if (input.domain && input.firstName && input.lastName) {
          return adapter.findEmail(input);
        }
        if (input.domain) {
          const taskHash = await startTask(
            "/v2/domain-search/start",
            { domain: input.domain },
            "snov.domain-search"
          );
          const res = await pollTask<{
            data?: { organization?: Record<string, unknown> | null; emails?: Array<Record<string, unknown>> | null };
          }>((h) => `/v2/domain-search/result/${h}`, taskHash);
          const org = res.data?.organization ?? null;
          const fields: EnrichmentResult["fields"] = {};
          if (org) {
            if (str(org.name)) fields.company = enrichedField(org.name, "snov");
            if (str(org.domain)) fields.company_domain = enrichedField(org.domain, "snov");
            if (str(org.industry)) fields.industry = enrichedField(org.industry, "snov");
          }
          const firstEmail = res.data?.emails?.[0];
          if (firstEmail && str(firstEmail.email)) fields.email = enrichedField(firstEmail.email, "snov");
          return {
            provider: "snov",
            matched: Object.keys(fields).length > 0,
            confidence: null,
            fields,
            creditsUsed: firstEmail ? 1 : 0,
            creditsRemaining: null,
          };
        }
        return { provider: "snov", matched: false, confidence: null, fields: {}, creditsUsed: 0, creditsRemaining: null };
      } catch (err) {
        throw mapAuthError(err, "Snov.io");
      }
    },

    async enrichCompany(input: { domain?: string; name?: string }): Promise<EnrichmentResult> {
      try {
        if (input.domain) return adapter.enrichLead({ domain: input.domain });
        if (input.name) {
          const taskHash = await startTask(
            "/v2/company-domain-by-name/start",
            { company_name: input.name },
            "snov.company-domain-by-name"
          );
          const res = await pollTask<{ data?: { domain?: string } | null }>(
            (h) => `/v2/company-domain-by-name/result?task_hash=${h}`,
            taskHash
          );
          const fields: EnrichmentResult["fields"] = {};
          if (res.data?.domain) fields.company_domain = enrichedField(res.data.domain, "snov");
          return {
            provider: "snov",
            matched: Boolean(res.data?.domain),
            confidence: null,
            fields,
            creditsUsed: res.data?.domain ? 1 : 0,
            creditsRemaining: null,
          };
        }
        return { provider: "snov", matched: false, confidence: null, fields: {}, creditsUsed: 0, creditsRemaining: null };
      } catch (err) {
        throw mapAuthError(err, "Snov.io");
      }
    },

    async findEmail(input: EnrichLeadInput): Promise<EnrichmentResult> {
      if (!input.domain || !input.firstName || !input.lastName) {
        return { provider: "snov", matched: false, confidence: null, fields: {}, creditsUsed: 0, creditsRemaining: null };
      }
      try {
        const taskHash = await startTask(
          "/v2/emails-by-domain-by-name/start",
          {
            names: [{ first_name: input.firstName, last_name: input.lastName }],
            domain: input.domain,
          },
          "snov.emails-by-domain-by-name"
        );
        const res = await pollTask<{ data?: Array<Record<string, unknown>> }>(
          (h) => `/v2/emails-by-domain-by-name/result?task_hash=${h}`,
          taskHash
        );
        return prospectToResult(res.data?.[0] ?? null);
      } catch (err) {
        throw mapAuthError(err, "Snov.io");
      }
    },

    async bulkEnrich(inputs: EnrichLeadInput[], options: BulkEnrichmentOptions) {
      return runBulkEnrichment({
        provider: "snov",
        inputs,
        enrichOne: (item) => adapter.enrichLead(item),
        options,
      });
    },

    async getCreditBalance(): Promise<number | null> {
      // Snov.io exposes no credits-balance endpoint in its public
      // API docs; the balance lives in the Snov.io dashboard.
      return null;
    },
  };

  return adapter;
}

export { toLeadPatch };
