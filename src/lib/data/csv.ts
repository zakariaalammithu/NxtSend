/**
 * CSV parsing, lead-row validation, duplicate detection and CSV export.
 *
 * This module is deliberately pure (no DOM, no storage, no network) so the
 * whole import pipeline can be unit-tested. The Leads page wires it to a
 * file input and to the leads repository; nothing in here invents data —
 * every imported lead comes from the uploaded file, and every rejected row
 * is reported back with its file row number.
 */

import { isValidEmail } from "@/lib/utils";
import type { Campaign, Lead } from "@/types";
import type { CampaignStats } from "./campaign-stats";

// ============================================================================
// Lead field model for import mapping
// ============================================================================

export type LeadFieldKey =
  | "first_name"
  | "last_name"
  | "email"
  | "company"
  | "job_title"
  | "linkedin_url"
  | "tags";

export interface LeadFieldDef {
  key: LeadFieldKey;
  label: string;
  /** Header spellings (already normalized) that auto-map to this field. */
  aliases: string[];
  required: boolean;
}

export const LEAD_FIELDS: LeadFieldDef[] = [
  {
    key: "first_name",
    label: "First Name",
    aliases: ["first name", "firstname", "first", "name", "full name", "fullname"],
    required: true,
  },
  {
    key: "last_name",
    label: "Last Name",
    aliases: ["last name", "lastname", "last", "surname"],
    required: false,
  },
  {
    key: "email",
    label: "Email",
    aliases: ["email", "email address", "emailaddress", "work email", "e mail"],
    // Not required on its own: a row is identified by an email OR a
    // LinkedIn URL (LinkedIn's My Network export has no email column).
    // The "one identity is required" rule lives in validateLeadRow.
    required: false,
  },
  {
    key: "company",
    label: "Company",
    aliases: ["company", "company name", "organization", "organisation", "account"],
    required: false,
  },
  {
    key: "job_title",
    label: "Job Title",
    aliases: ["job title", "jobtitle", "title", "role", "position"],
    required: false,
  },
  {
    key: "linkedin_url",
    label: "LinkedIn URL",
    aliases: ["linkedin", "linkedin url", "linkedin profile", "linkedinurl", "profile url"],
    required: false,
  },
  {
    key: "tags",
    label: "Tags (';'-separated)",
    aliases: ["tags", "tag", "labels"],
    required: false,
  },
];

/** A validated lead, ready to hand to the leads repository. */
export interface NewLeadInput {
  first_name: string;
  last_name?: string;
  /** Optional: a lead is identified by an email OR a LinkedIn URL. */
  email?: string;
  company?: string;
  job_title?: string;
  linkedin_url?: string;
  tags: string[];
}

/** field key -> CSV header name (exact header text from the file). */
export type ColumnMapping = Partial<Record<LeadFieldKey, string>>;

// ============================================================================
// Parser (RFC 4180-style: quotes, escaped quotes, commas, CRLF, embedded \n)
// ============================================================================

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, ""); // strip BOM (Excel exports)
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;

  const pushField = () => {
    row.push(field);
    field = "";
    fieldStarted = false;
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  let i = 0;
  while (i < src.length) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"' && field === "" && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      if (src[i + 1] === "\n") i += 1;
      pushRow();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    fieldStarted = true;
    i += 1;
  }

  // Final row when the file does not end with a newline.
  if (fieldStarted || field !== "" || row.length > 0) {
    pushRow();
  }

  return rows;
}

// ============================================================================
// Column mapping
// ============================================================================

export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

/**
 * Suggests a mapping from the file's headers: for each lead field, the first
 * header whose normalized form matches one of the field's aliases.
 */
export function suggestColumnMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map((h) => normalizeHeader(h));
  const mapping: ColumnMapping = {};

  for (const field of LEAD_FIELDS) {
    const idx = normalized.findIndex((h) => field.aliases.includes(h));
    if (idx >= 0) {
      mapping[field.key] = headers[idx];
    }
  }
  return mapping;
}

// ============================================================================
// Row validation
// ============================================================================

export function validateLeadRow(values: Record<LeadFieldKey, string>): {
  lead?: NewLeadInput;
  errors: string[];
} {
  const errors: string[] = [];
  const firstName = (values.first_name || "").trim();
  const lastName = (values.last_name || "").trim();
  const email = (values.email || "").trim();
  const company = (values.company || "").trim();
  const jobTitle = (values.job_title || "").trim();
  const linkedinUrl = (values.linkedin_url || "").trim();
  const tagsRaw = (values.tags || "").trim();

  if (!firstName) {
    errors.push("Missing first name");
  }
  // Identity rule (P4 Stage 2, matching Closely's model): every row
  // needs an email OR a LinkedIn URL. My Network exports have no emails
  // at all, so email alone can no longer be mandatory.
  if (!email && !linkedinUrl) {
    errors.push("Missing email and LinkedIn URL (one of them is required)");
  }
  if (email && !isValidEmail(email)) {
    errors.push(`Invalid email format: "${email}"`);
  }
  if (
    linkedinUrl &&
    !linkedinUrl.startsWith("http://") &&
    !linkedinUrl.startsWith("https://")
  ) {
    errors.push(`Invalid LinkedIn URL: "${linkedinUrl}"`);
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    errors,
    lead: {
      first_name: firstName,
      last_name: lastName || undefined,
      email: email || undefined,
      company: company || undefined,
      job_title: jobTitle || undefined,
      linkedin_url: linkedinUrl || undefined,
      tags: tagsRaw
        ? tagsRaw.split(";").map((t) => t.trim()).filter(Boolean)
        : [],
    },
  };
}

// ============================================================================
// Full import pipeline: parse output + mapping + existing emails -> result
// ============================================================================

export interface ImportRowError {
  /** 1-based row number in the original file (header is row 1). */
  row: number;
  messages: string[];
}

export interface ImportDuplicate {
  /** 1-based row number in the original file (header is row 1). */
  row: number;
  /** The identity the row was deduplicated on: its email, or its LinkedIn URL when it has no email. */
  identity: string;
  reason: "existing" | "in-file";
}

/** Normalizes a LinkedIn profile URL for identity comparison. */
export function normalizeLinkedinUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}

/**
 * The dedupe identity of a validated lead: its email when it has one,
 * otherwise its LinkedIn URL. Mirrors Closely's model (dedupe on
 * LinkedIn URL) while keeping the existing email behaviour for
 * email-carrying rows.
 */
export function leadIdentityKey(lead: {
  email?: string;
  linkedin_url?: string;
}): string | null {
  const email = (lead.email ?? "").trim().toLowerCase();
  if (email) return `email:${email}`;
  const url = normalizeLinkedinUrl(lead.linkedin_url ?? "");
  if (url) return `linkedin:${url}`;
  return null;
}

export interface CsvImportResult {
  leads: NewLeadInput[];
  errors: ImportRowError[];
  duplicates: ImportDuplicate[];
  /** Data rows examined (header and fully-empty rows excluded). */
  totalDataRows: number;
}

export function processCsvImport(
  rows: string[][],
  mapping: ColumnMapping,
  existingEmails: Iterable<string>,
  existingLinkedinUrls: Iterable<string> = []
): CsvImportResult {
  const result: CsvImportResult = {
    leads: [],
    errors: [],
    duplicates: [],
    totalDataRows: 0,
  };

  if (rows.length === 0) {
    return result;
  }

  const headers = rows[0].map((h) => h.trim());
  const columnIndex = new Map<LeadFieldKey, number>();
  for (const field of LEAD_FIELDS) {
    const headerName = mapping[field.key];
    if (headerName) {
      const idx = headers.indexOf(headerName);
      if (idx >= 0) columnIndex.set(field.key, idx);
    }
  }

  const existing = new Set<string>();
  for (const e of Array.from(existingEmails)) {
    const key = leadIdentityKey({ email: e });
    if (key) existing.add(key);
  }
  for (const u of Array.from(existingLinkedinUrls)) {
    const key = leadIdentityKey({ linkedin_url: u });
    if (key) existing.add(key);
  }
  const seenInFile = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const raw = rows[r];
    if (raw.every((cell) => cell.trim() === "")) {
      continue; // fully-empty line: not a data row, not an error
    }
    result.totalDataRows += 1;
    const fileRow = r + 1;

    const values = {} as Record<LeadFieldKey, string>;
    for (const field of LEAD_FIELDS) {
      const idx = columnIndex.get(field.key);
      values[field.key] = idx !== undefined ? (raw[idx] ?? "") : "";
    }

    const { lead, errors } = validateLeadRow(values);
    if (!lead) {
      result.errors.push({ row: fileRow, messages: errors });
      continue;
    }

    const identity = leadIdentityKey(lead);
    // A validated lead always has an identity (validateLeadRow requires
    // an email or a LinkedIn URL), so `identity` is never null here.
    const identityLabel = lead.email ?? lead.linkedin_url ?? "";
    if (identity && existing.has(identity)) {
      result.duplicates.push({ row: fileRow, identity: identityLabel, reason: "existing" });
      continue;
    }
    if (identity && seenInFile.has(identity)) {
      result.duplicates.push({ row: fileRow, identity: identityLabel, reason: "in-file" });
      continue;
    }
    if (identity) seenInFile.add(identity);
    result.leads.push(lead);
  }

  return result;
}

// ============================================================================
// Export
// ============================================================================

export function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export const LEAD_EXPORT_HEADERS = [
  "First Name",
  "Last Name",
  "Email",
  "Company",
  "Job Title",
  "LinkedIn URL",
  "Status",
  "Tags",
  "Added",
] as const;

export const CAMPAIGN_EXPORT_HEADERS = [
  "Campaign",
  "Type",
  "Status",
  "Created",
  "Prospects",
  "LinkedIn Connections Sent",
  "LinkedIn Accepted",
  "LinkedIn Messages Sent",
  "LinkedIn Replied",
  "Email Sent",
  "Email Opened",
  "Email Clicked",
  "Email Replied",
] as const;

/**
 * Campaigns export — one row per campaign with the honest stats from
 * campaign-stats.ts. Metrics with no data source (LinkedIn Accepted,
 * email Opened/Clicked when the provider event log is unavailable) are
 * exported as "n/a" — never as an invented number.
 */
export function campaignsToCsv(
  rows: Array<{ campaign: Campaign; stats: CampaignStats | undefined }>
): string {
  const num = (v: number | null | undefined): string =>
    v === null || v === undefined ? "n/a" : String(v);
  const lines: string[] = [CAMPAIGN_EXPORT_HEADERS.join(",")];
  for (const { campaign, stats } of rows) {
    const cells = [
      campaign.name,
      campaign.type,
      campaign.status,
      campaign.created_at,
      num(stats?.prospects),
      num(stats?.linkedin.connectionRequestsSent),
      num(stats?.linkedin.accepted ?? null),
      num(stats?.linkedin.messagesSent),
      num(stats?.linkedin.replied),
      num(stats?.email.sent),
      num(stats?.email.opened ?? null),
      num(stats?.email.clicked ?? null),
      num(stats?.email.replied),
    ];
    lines.push(cells.map((c) => escapeCsvField(String(c))).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

export function leadsToCsv(leads: Lead[]): string {
  const lines: string[] = [LEAD_EXPORT_HEADERS.join(",")];
  for (const lead of leads) {
    const cells = [
      lead.first_name ?? "",
      lead.last_name ?? "",
      lead.email ?? "",
      lead.company ?? "",
      lead.job_title ?? "",
      lead.linkedin_url ?? "",
      lead.status ?? "",
      (lead.tags ?? []).join("; "),
      lead.created_at ?? "",
    ];
    lines.push(cells.map((c) => escapeCsvField(String(c))).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
