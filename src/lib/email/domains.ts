/**
 * Resend domain status — the provider side of email authentication.
 *
 * The Integration Center's Test Connection used to call
 * `domains.list()` and throw the answer away. This module keeps it:
 * which domains the Resend account holds, each one's verification
 * status, and — for the domain that matters — the exact DNS records
 * Resend expects (from `domains.get`), so the UI can show the
 * operator precisely what to add at their DNS host.
 *
 * The match that matters: sends go out as EMAIL_FROM. If that domain
 * is not verified at Resend, Resend rejects the sends — so the match
 * state is computed here and surfaced as a warning, never assumed.
 */

import { Resend } from "resend";

export interface ResendDomainRecordInfo {
  /** Provider's record kind: "SPF" | "DKIM" | … (as reported). */
  kind: string;
  /** DNS host/name the record belongs at, e.g. "resend._domainkey.example.com". */
  name: string;
  /** DNS record type: TXT / MX / CNAME. */
  type: string;
  /** The exact value to publish. */
  value: string;
  /** Provider-side status for this record: "verified" | "pending" | "failed" | … */
  status: string;
}

export interface ResendDomainInfo {
  id: string;
  name: string;
  /** Provider status: "verified" | "pending" | "partially_verified" | "failed" | … */
  status: string;
  /** DNS records Resend expects — only fetched for the detail domain. */
  records: ResendDomainRecordInfo[];
}

export interface ResendDomainsResult {
  domains: ResendDomainInfo[];
  error: string | null;
}

/** The subset of the Resend SDK this module depends on (injectable). */
export interface ResendDomainsClient {
  list(): Promise<unknown>;
  get(id: string): Promise<unknown>;
}

function sdkDomainsClient(apiKey: string): ResendDomainsClient {
  const client = new Resend(apiKey);
  return {
    list: () => client.domains.list(),
    get: (id: string) => client.domains.get(id),
  };
}

interface RawDomain {
  id?: unknown;
  name?: unknown;
  status?: unknown;
  records?: unknown;
}

function asRecordArray(raw: unknown): RawDomain[] {
  // SDK shapes vary by version: { data: [...] }, { data: { data: [...] } }.
  const top = (raw as { data?: unknown } | null)?.data;
  if (Array.isArray(top)) return top as RawDomain[];
  const nested = (top as { data?: unknown } | null)?.data;
  if (Array.isArray(nested)) return nested as RawDomain[];
  return [];
}

function sdkError(raw: unknown): string | null {
  const err = (raw as { error?: { name?: string; message?: string } | null } | null)?.error;
  if (!err) return null;
  return `${err.name ?? "error"}: ${err.message ?? "unknown error"}`;
}

function normalizeRecord(raw: unknown): ResendDomainRecordInfo | null {
  const r = raw as {
    record?: unknown;
    name?: unknown;
    type?: unknown;
    value?: unknown;
    status?: unknown;
  } | null;
  if (!r || typeof r.name !== "string") return null;
  return {
    kind: typeof r.record === "string" ? r.record : "",
    name: r.name,
    type: typeof r.type === "string" ? r.type : "TXT",
    value: typeof r.value === "string" ? r.value : "",
    status: typeof r.status === "string" ? r.status : "",
  };
}

function normalizeDomain(raw: RawDomain): ResendDomainInfo | null {
  if (typeof raw?.name !== "string" || typeof raw?.id !== "string") return null;
  return {
    id: raw.id,
    name: raw.name,
    status: typeof raw.status === "string" ? raw.status : "unknown",
    records: Array.isArray(raw.records)
      ? (raw.records.map(normalizeRecord).filter(Boolean) as ResendDomainRecordInfo[])
      : [],
  };
}

/**
 * Lists the account's Resend domains. When `detailDomain` names one
 * of them, that domain's expected DNS records are fetched too (one
 * extra read-only call). A failure of the detail fetch is NOT fatal —
 * the list still answers with empty records for that domain.
 */
export async function listResendDomains(
  apiKey: string,
  opts: { detailDomain?: string | null; client?: ResendDomainsClient } = {}
): Promise<ResendDomainsResult> {
  const client = opts.client ?? sdkDomainsClient(apiKey);
  let listRaw: unknown;
  try {
    listRaw = await client.list();
  } catch (err) {
    return {
      domains: [],
      error: err instanceof Error ? err.message : "domains list failed",
    };
  }
  const listError = sdkError(listRaw);
  if (listError) return { domains: [], error: listError };

  const domains = asRecordArray(listRaw)
    .map(normalizeDomain)
    .filter(Boolean) as ResendDomainInfo[];

  const detail = opts.detailDomain?.trim().toLowerCase();
  if (detail) {
    const target = domains.find((d) => d.name.toLowerCase() === detail);
    if (target && target.records.length === 0) {
      try {
        const getRaw = await client.get(target.id);
        if (!sdkError(getRaw)) {
          const top = (getRaw as { data?: RawDomain } | null)?.data;
          const records = Array.isArray(top?.records)
            ? (top.records.map(normalizeRecord).filter(Boolean) as ResendDomainRecordInfo[])
            : [];
          target.records = records;
          if (typeof top?.status === "string") target.status = top.status;
        }
      } catch {
        // Detail fetch is best-effort — the list verdict stands.
      }
    }
  }
  return { domains, error: null };
}

/**
 * Extracts the domain from an EMAIL_FROM value, which may be a bare
 * address ("hello@example.com") or a display-name form
 * ("NxtSend <hello@example.com>"). Returns null when no plausible
 * address/domain is present.
 */
export function extractEmailDomain(
  emailFrom: string | undefined | null
): string | null {
  if (!emailFrom) return null;
  const v = emailFrom.trim();
  const angle = v.match(/<([^>]+)>/);
  const address = (angle ? angle[1] : v).trim();
  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1) return null;
  const domain = address.slice(at + 1).trim().toLowerCase().replace(/\.$/, "");
  return domain.includes(".") ? domain : null;
}

export type FromDomainMatchState =
  | "verified"
  | "not_verified"
  | "not_listed"
  | "unknown";

export interface FromDomainMatch {
  fromDomain: string | null;
  state: FromDomainMatchState;
  /** The matched provider domain, when one was found. */
  domain: ResendDomainInfo | null;
}

/**
 * Compares the EMAIL_FROM domain against the provider's domain list.
 * "verified" requires the provider's own status to be exactly
 * "verified" — anything else is reported, never upgraded.
 */
export function matchEmailFromDomain(
  domains: ResendDomainInfo[],
  emailFrom: string | undefined | null
): FromDomainMatch {
  const fromDomain = extractEmailDomain(emailFrom);
  if (!fromDomain) return { fromDomain: null, state: "unknown", domain: null };
  const found =
    domains.find((d) => d.name.toLowerCase() === fromDomain) ?? null;
  if (!found) return { fromDomain, state: "not_listed", domain: null };
  return {
    fromDomain,
    state: found.status === "verified" ? "verified" : "not_verified",
    domain: found,
  };
}

/**
 * DKIM selectors a provider domain's records point at — the selector
 * is the label before "._domainkey" in the record's host name
 * (e.g. "resend._domainkey.example.com" → "resend").
 */
export function dkimSelectorsFromDomain(domain: ResendDomainInfo): string[] {
  const selectors: string[] = [];
  for (const record of domain.records) {
    const idx = record.name.toLowerCase().indexOf("._domainkey");
    if (idx > 0) {
      const label = record.name.slice(0, idx).split(".").pop()?.toLowerCase();
      if (label && !selectors.includes(label)) selectors.push(label);
    }
  }
  return selectors;
}
