/**
 * Cornersight adapter — LinkedIn-engagement intent leads, read-only.
 *
 * Verified endpoints (base https://app.cornersight.io, see ./config.ts):
 * GET /api/v1/leads, GET /api/v1/engagers, GET /api/v1/leads/raw,
 * POST /api/v1/enrich/profile|company (async, returns jobId),
 * GET /api/v1/jobs/{jobId}/status, GET /api/v1/credits.
 *
 * Lead rows carry no email address (Cornersight does not sell
 * emails); a lead without an email is a normal result here, not a
 * failure. One row of GET /api/v1/leads is one ENGAGEMENT, so the
 * same person can appear several times — use listEngagers (one row
 * per person) or dedupe by linkedinUrl when importing.
 * No LinkedIn send/accept anywhere: this adapter only reads leads.
 */

import { ProviderHttpClient, toProviderError } from "../../client";
import { requireApiKey, unsupportedOperation } from "../../enrichment/common";
import { cleanStr, splitFullName, type CategoryJLead } from "../types";
import { CORNERSIGHT_CONFIG } from "./config";

type JsonRecord = Record<string, unknown>;

function str(value: unknown): string | undefined {
  return cleanStr(value);
}

/** One Cornersight lead row, as returned by GET /api/v1/leads. */
export interface CornersightLeadRow {
  id?: string;
  profileId?: string;
  name?: string;
  linkedinUsername?: string;
  linkedinUrl?: string;
  avatarUrl?: string | null;
  jobTitle?: string;
  company?: string;
  companyDomain?: string;
  country?: string;
  engagementType?: string;
  commentText?: string | null;
  commentPostedAt?: string | null;
  isIcp?: boolean;
  webhookStatus?: string;
  postUrl?: string;
  postPostedAt?: string | null;
  detectedAt?: string;
  createdAt?: string;
  companyName?: string;
  companyUrl?: string;
  companyLinkedinUrl?: string;
  companyDescription?: string;
  companyIndustry?: string;
  companyLocation?: string;
  companyEmployeeCount?: number | null;
  companyStaffRange?: string;
  companyEnrichedAt?: string | null;
  engagementCount?: number;
}

/** Maps a Cornersight lead row onto a NxtSend lead. No email: Cornersight supplies none. */
export function cornersightRowToLead(row: CornersightLeadRow): CategoryJLead {
  const { firstName, lastName } = splitFullName(row.name);
  const tags: string[] = ["cornersight"];
  if (row.isIcp) tags.push("cornersight-icp");
  if (row.engagementType) tags.push(`engagement:${row.engagementType.toLowerCase()}`);
  return {
    externalId: row.id,
    firstName,
    lastName,
    company: row.companyName ?? row.company,
    companyDomain: row.companyDomain,
    jobTitle: row.jobTitle,
    linkedinUrl: row.linkedinUrl,
    country: row.country,
    tags,
  };
}

export interface CornersightAdapterOptions {
  apiKey: string;
  client?: ProviderHttpClient;
  /** Delay between job-status polls. Defaults to 1000ms; tests pass 0. */
  pollDelayMs?: number;
  /** Sleep implementation (injectable so tests never wait). */
  sleep?: (ms: number) => Promise<void>;
}

export interface CornersightListOpts {
  profileId?: string;
  username?: string;
  isIcp?: boolean;
  engagementType?: "Like" | "Comment" | "Author";
  since?: string;
  until?: string;
  limit?: number;
}

export interface CornersightAdapter {
  readonly provider: "cornersight";
  testConnection(): Promise<{ ok: boolean; detail: string }>;
  listLeads(
    opts?: CornersightListOpts
  ): Promise<{ leads: CategoryJLead[]; total: number; hasMore: boolean }>;
  listEngagers(
    opts?: CornersightListOpts & { minEngagements?: number }
  ): Promise<{ leads: CategoryJLead[]; total: number; hasMore: boolean }>;
  listRawLeads(
    opts?: CornersightListOpts
  ): Promise<{ leads: CategoryJLead[]; total: number; hasMore: boolean }>;
  /** Starts an enrichment job; returns its jobId (poll with getJobStatus). */
  enrichProfile(username: string, saveTrackedProfile?: boolean): Promise<{ jobId: string }>;
  enrichCompany(username: string, saveTrackedProfile?: boolean): Promise<{ jobId: string }>;
  getJobStatus(jobId: string): Promise<{ status: string; error?: string }>;
  /** Polls a job until completed/failed (max 30 polls). */
  waitForJob(jobId: string): Promise<{ status: string; error?: string }>;
  getCreditBalance(): Promise<number | null>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createCornersightAdapter(
  opts: CornersightAdapterOptions
): CornersightAdapter {
  const apiKey = requireApiKey(opts.apiKey, "Cornersight");
  const client =
    opts.client ??
    new ProviderHttpClient({
      baseUrl: CORNERSIGHT_CONFIG.baseUrl,
      // X-API-Key header keeps the key out of URLs and logs.
      getAuthHeaders: () => ({ "X-API-Key": apiKey }),
    });
  const pollDelayMs = opts.pollDelayMs ?? 1000;
  const sleep = opts.sleep ?? defaultSleep;

  async function listPage(
    path: string,
    listOpts: CornersightListOpts & { minEngagements?: number } | undefined,
    pageSize: number
  ): Promise<{ leads: CategoryJLead[]; total: number; hasMore: boolean }> {
    const query: Record<string, string> = {
      limit: String(Math.min(pageSize, CORNERSIGHT_CONFIG.maxPageSize)),
      offset: "0",
    };
    if (listOpts?.profileId) query.profileId = listOpts.profileId;
    if (listOpts?.username) query.username = listOpts.username;
    if (listOpts?.isIcp !== undefined) query.isIcp = String(listOpts.isIcp);
    if (listOpts?.engagementType) query.engagementType = listOpts.engagementType;
    if (listOpts?.since) query.since = listOpts.since;
    if (listOpts?.until) query.until = listOpts.until;
    if (listOpts?.minEngagements !== undefined)
      query.minEngagements = String(listOpts.minEngagements);
    const res = await client.request<{
      data?: CornersightLeadRow[];
      total?: number;
      hasMore?: boolean;
    }>({ method: "GET", path, query });
    return {
      leads: (res.data ?? []).map(cornersightRowToLead),
      total: typeof res.total === "number" ? res.total : (res.data ?? []).length,
      hasMore: res.hasMore === true,
    };
  }

  const adapter: CornersightAdapter = {
    provider: "cornersight",

    async testConnection() {
      try {
        const res = await client.request<JsonRecord>({
          method: "GET",
          path: "/api/v1/credits",
        });
        const remaining =
          typeof res.remaining === "number" ? ` (${res.remaining} credits remaining)` : "";
        return { ok: true, detail: `Cornersight account reachable${remaining}.` };
      } catch (err) {
        return { ok: false, detail: toProviderError(err).message };
      }
    },

    async listLeads(listOpts) {
      return listPage("/api/v1/leads", listOpts, listOpts?.limit ?? 50);
    },

    async listEngagers(listOpts) {
      return listPage("/api/v1/engagers", listOpts, listOpts?.limit ?? 50);
    },

    async listRawLeads(listOpts) {
      return listPage("/api/v1/leads/raw", listOpts, listOpts?.limit ?? 50);
    },

    async enrichProfile(username, saveTrackedProfile = false) {
      const res = await client.request<{ jobId?: string }>({
        method: "POST",
        path: "/api/v1/enrich/profile",
        body: { username, saveTrackedProfile },
      });
      if (!res.jobId) {
        throw new Error("[cornersight] Enrichment job returned no jobId.");
      }
      return { jobId: res.jobId };
    },

    async enrichCompany(username, saveTrackedProfile = false) {
      const res = await client.request<{ jobId?: string }>({
        method: "POST",
        path: "/api/v1/enrich/company",
        body: { username, saveTrackedProfile },
      });
      if (!res.jobId) {
        throw new Error("[cornersight] Enrichment job returned no jobId.");
      }
      return { jobId: res.jobId };
    },

    async getJobStatus(jobId) {
      const res = await client.request<{ status?: string; error?: string }>({
        method: "GET",
        path: `/api/v1/jobs/${jobId}/status`,
      });
      return { status: res.status ?? "unknown", error: str(res.error) };
    },

    async waitForJob(jobId) {
      for (let attempt = 0; attempt < 30; attempt++) {
        const status = await adapter.getJobStatus(jobId);
        if (status.status === "completed" || status.status === "failed") return status;
        await sleep(pollDelayMs);
      }
      return { status: "timeout", error: "Job did not finish within 30 polls." };
    },

    async getCreditBalance(): Promise<number | null> {
      const res = await client.request<JsonRecord>({
        method: "GET",
        path: "/api/v1/credits",
      });
      return typeof res.remaining === "number" ? res.remaining : null;
    },
  };

  return adapter;
}

/** Cornersight has no lead-write operation — export is unsupported by design. */
export function cornersightExportUnsupported(): never {
  throw unsupportedOperation("Cornersight", "exportLead");
}
