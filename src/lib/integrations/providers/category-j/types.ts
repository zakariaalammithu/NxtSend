/**
 * Category J shared types — Wave 2, Phase 1.
 *
 * The three implemented Category J providers (GetLeads, Cornersight,
 * HotHawk) all produce leads, but each has its own adapter interface
 * (enrichment for GetLeads, intent-lead import for Cornersight,
 * email-outreach for HotHawk). This module holds only the pieces
 * they genuinely share: one normalised lead shape and the small
 * string helpers used to map provider rows onto it.
 *
 * Pure types + pure functions: no env access, no secrets, no I/O.
 */

export interface CategoryJLead {
  externalId?: string;
  email?: string;
  firstName: string;
  lastName?: string;
  company?: string;
  companyDomain?: string;
  jobTitle?: string;
  linkedinUrl?: string;
  country?: string;
  /** Provider-specific signal, e.g. Cornersight `isIcp` / engagement type. */
  tags?: string[];
}

/** Returns the string, or undefined for missing / blank / non-string values. */
export function cleanStr(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Splits "Jane Example" into first/last; a single token is the first name. */
export function splitFullName(fullName: string | undefined): {
  firstName: string;
  lastName?: string;
} {
  const clean = (fullName ?? "").trim();
  if (!clean) return { firstName: "" };
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}
