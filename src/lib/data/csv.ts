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
import type { Lead } from "@/types";

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
    required: true,
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
  email: string;
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
  if (!email) {
    errors.push("Missing email");
  } else if (!isValidEmail(email)) {
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
      email,
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
  email: string;
  reason: "existing" | "in-file";
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
  existingEmails: Iterable<string>
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
    if (e) existing.add(e.trim().toLowerCase());
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

    const emailKey = lead.email.toLowerCase();
    if (existing.has(emailKey)) {
      result.duplicates.push({ row: fileRow, email: lead.email, reason: "existing" });
      continue;
    }
    if (seenInFile.has(emailKey)) {
      result.duplicates.push({ row: fileRow, email: lead.email, reason: "in-file" });
      continue;
    }
    seenInFile.add(emailKey);
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
