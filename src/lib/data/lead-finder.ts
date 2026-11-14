/**
 * Lead Finder — keyword-based ICP parsing over NxtSend's own leads.
 *
 * Pure functions only: no AI call, no external API, no network. A
 * free-text description of an ideal buyer ("CFOs at fintech companies
 * with 500+ people in London") is mapped to filters over the EXISTING
 * Lead fields only (job_title, company, tags, status, custom_fields).
 * No new lead columns are introduced.
 *
 * Honest scope: this searches the leads already in the workspace
 * (imported or added in NxtSend). It is NOT an external lead database
 * and never claims to be one. A description that mentions nothing the
 * parser recognises matches nothing — it never dumps the whole CRM.
 */

import type { Lead } from "@/types";

// ============================================================================
// Types
// ============================================================================

export interface IcpFilters {
  /** Canonical job titles, e.g. ["CFO", "VP Sales"]. */
  jobTitles: string[];
  /** Industry / company keywords, e.g. ["fintech"]. Matched against
   *  company name, tags and custom_fields values. */
  keywords: string[];
  /** Tag values to match against lead.tags. Sector keywords double as
   *  tags here because tags are the list model in this app and carry
   *  sector labels (e.g. "Fintech"). */
  tags: string[];
  /** Lead statuses, e.g. ["new"]. Only explicit status words count. */
  statuses: string[];
  /** Location hints, e.g. ["London"]. Matched against string values
   *  in custom_fields (notably `location`) when present. */
  locations: string[];
  /** Minimum company size ("500+ people" -> 500). Null when the
   *  description gives no size hint. */
  minCompanySize: number | null;
}

export interface ParsedIcp {
  filters: IcpFilters;
  /** True when at least one recognisable criterion was extracted. */
  hasCriteria: boolean;
}

export const EMPTY_FILTERS: IcpFilters = {
  jobTitles: [],
  keywords: [],
  tags: [],
  statuses: [],
  locations: [],
  minCompanySize: null,
};

export function hasCriteria(filters: IcpFilters): boolean {
  return (
    filters.jobTitles.length > 0 ||
    filters.keywords.length > 0 ||
    filters.tags.length > 0 ||
    filters.statuses.length > 0 ||
    filters.locations.length > 0 ||
    filters.minCompanySize !== null
  );
}

// ============================================================================
// Vocabularies (deterministic, keyword-based)
// ============================================================================

/** Canonical title -> phrases that signal it (lowercased, plurals ok). */
const TITLE_PHRASES: { title: string; phrases: string[] }[] = [
  { title: "CEO", phrases: ["ceo", "chief executive officer", "chief executive"] },
  { title: "CFO", phrases: ["cfo", "chief financial officer", "chief finance officer"] },
  { title: "CTO", phrases: ["cto", "chief technology officer", "chief technical officer"] },
  { title: "CMO", phrases: ["cmo", "chief marketing officer"] },
  { title: "CRO", phrases: ["cro", "chief revenue officer"] },
  { title: "COO", phrases: ["coo", "chief operating officer"] },
  { title: "CIO", phrases: ["cio", "chief information officer"] },
  {
    title: "VP Sales",
    phrases: ["vp sales", "vice president of sales", "vp of sales", "head of sales", "sales director", "director of sales"],
  },
  {
    title: "VP Engineering",
    phrases: ["vp engineering", "vice president of engineering", "vp of engineering", "head of engineering", "engineering director", "director of engineering"],
  },
  {
    title: "VP Product",
    phrases: ["vp product", "vice president of product", "vp of product", "head of product", "product director", "director of product"],
  },
  {
    title: "VP Marketing",
    phrases: ["vp marketing", "vice president of marketing", "vp of marketing", "head of marketing", "marketing director", "director of marketing"],
  },
  {
    title: "VP Operations",
    phrases: ["vp operations", "vice president of operations", "vp of operations", "head of operations", "operations director", "director of operations"],
  },
  {
    title: "Head of Growth",
    phrases: ["head of growth", "growth lead", "vp growth", "vice president of growth"],
  },
  { title: "Founder", phrases: ["founder", "co-founder", "cofounder", "co founder"] },
  {
    title: "Business Development",
    phrases: ["business development", "bd lead", "head of business development", "partnerships lead", "partnerships manager"],
  },
];

/** Aliases used to match a canonical title against a lead's job_title. */
const TITLE_ALIASES: Record<string, string[]> = {
  CEO: ["ceo", "chief executive officer", "chief executive"],
  CFO: ["cfo", "chief financial officer", "chief finance officer"],
  CTO: ["cto", "chief technology officer", "chief technical officer"],
  CMO: ["cmo", "chief marketing officer"],
  CRO: ["cro", "chief revenue officer"],
  COO: ["coo", "chief operating officer"],
  CIO: ["cio", "chief information officer"],
  "VP Sales": ["vp sales", "vice president of sales", "vp of sales", "head of sales", "sales director", "director of sales", "sales vp"],
  "VP Engineering": ["vp engineering", "vice president of engineering", "vp of engineering", "head of engineering", "engineering director", "director of engineering"],
  "VP Product": ["vp product", "vice president of product", "vp of product", "head of product", "product director", "director of product"],
  "VP Marketing": ["vp marketing", "vice president of marketing", "vp of marketing", "head of marketing", "marketing director", "director of marketing"],
  "VP Operations": ["vp operations", "vice president of operations", "vp of operations", "head of operations", "operations director", "director of operations"],
  "Head of Growth": ["head of growth", "growth lead", "vp growth", "vice president of growth"],
  Founder: ["founder", "co-founder", "cofounder", "co founder"],
  "Business Development": ["business development", "partnerships"],
};

/** Canonical industry keyword -> phrases that signal it (lowercased). */
const INDUSTRY_PHRASES: { keyword: string; phrases: string[] }[] = [
  { keyword: "fintech", phrases: ["fintech", "financial technology", "financial services"] },
  { keyword: "saas", phrases: ["saas", "software as a service", "software company", "software companies", "b2b software"] },
  { keyword: "healthcare", phrases: ["healthcare", "health care", "healthtech", "health tech", "medical"] },
  { keyword: "edtech", phrases: ["edtech", "education technology", "education"] },
  { keyword: "ecommerce", phrases: ["ecommerce", "e-commerce", "e commerce", "online retail", "retail"] },
  { keyword: "devtools", phrases: ["devtools", "developer tools", "developer tool"] },
  { keyword: "cybersecurity", phrases: ["cybersecurity", "cyber security", "infosec", "security software"] },
  { keyword: "logistics", phrases: ["logistics", "supply chain", "shipping"] },
  { keyword: "real estate", phrases: ["real estate", "proptech", "property tech"] },
  { keyword: "hr tech", phrases: ["hr tech", "hrtech", "human resources", "recruiting"] },
  { keyword: "marketing", phrases: ["marketing agency", "marketing tech", "martech", "adtech", "advertising"] },
  { keyword: "media", phrases: ["media", "publishing", "entertainment"] },
  { keyword: "manufacturing", phrases: ["manufacturing", "industrial"] },
  { keyword: "energy", phrases: ["energy", "cleantech", "clean tech", "renewable"] },
  { keyword: "biotech", phrases: ["biotech", "biotechnology", "life sciences", "pharma"] },
  { keyword: "legaltech", phrases: ["legaltech", "legal tech", "law firm"] },
  { keyword: "insurtech", phrases: ["insurtech", "insurance"] },
  { keyword: "foodtech", phrases: ["foodtech", "food tech", "food delivery"] },
  { keyword: "travel", phrases: ["travel", "hospitality", "hotel"] },
  { keyword: "automotive", phrases: ["automotive", "auto tech", "mobility"] },
  { keyword: "gaming", phrases: ["gaming", "video games", "esports"] },
  { keyword: "ai", phrases: ["artificial intelligence", " ai ", " ai,", "machine learning", "ml company"] },
  { keyword: "nonprofit", phrases: ["nonprofit", "non-profit", "charity", "ngo"] },
  { keyword: "consulting", phrases: ["consulting", "consultancy", "professional services"] },
  { keyword: "finance", phrases: ["finance", "banking", "investment", "venture capital", "private equity"] },
];

/** Explicit status words. "new" only counts in an explicit phrase so
 *  everyday uses ("new customers") don't flip the status filter. */
const STATUS_PHRASES: { status: string; phrases: string[] }[] = [
  { status: "new", phrases: ["status new", "new leads", "brand new leads", "fresh leads"] },
  { status: "contacted", phrases: ["contacted", "already contacted", "been contacted"] },
  { status: "replied", phrases: ["replied", "responded", "who replied", "that replied"] },
  { status: "converted", phrases: ["converted", "customers", "paying customers"] },
  { status: "unresponsive", phrases: ["unresponsive", "not responding", "ghosted"] },
];

// ============================================================================
// Parsing
// ============================================================================

/** Escape a literal string for use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Does `phrase` appear in `text` as a whole word/phrase? Plural "s" is
 * tolerated on the final word ("CFOs", "companies"). Matching is
 * case-insensitive; callers pass lowercased text.
 */
function containsPhrase(text: string, phrase: string): boolean {
  const pattern = new RegExp(
    `\\b${escapeRegExp(phrase).replace(/ /g, "\\s+")}s?\\b`,
    "i"
  );
  return pattern.test(text);
}

/** Extract location hints from the RAW text: "in London", "based in
 *  San Francisco", "located in Berlin". Only capitalised words after
 *  those markers count, so lowercase filler is never a location. */
function extractLocations(rawText: string): string[] {
  const found: string[] = [];
  const re =
    /(?:\bin|based in|located in|headquartered in)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawText)) !== null) {
    const loc = m[1].trim();
    // Skip the tail of a sentence that happens to start capitalised
    // after "in" at the very start ("In London we...") is fine — it
    // IS a location. Keep every distinct hit.
    if (loc && !found.includes(loc)) found.push(loc);
  }
  return found;
}

/** Extract a minimum company size: "500+ people", "500 or more
 *  employees", "at least 200 staff". Returns null when absent. */
function extractMinCompanySize(text: string): number | null {
  const re =
    /(?:at least|over|more than|above|minimum of|\+)?\s*(\d[\d,]*)\s*\+?\s*(?:or more\s+)?(?:people|employees|staff|team members|headcount)/i;
  const m = re.exec(text);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Map a free-text ideal-buyer description to filters over existing
 * Lead fields. Deterministic and keyword-based — no AI, no network.
 * Returns empty filters (hasCriteria false) for empty or
 * unrecognised text.
 */
export function parseIcpDescription(text: string): ParsedIcp {
  const raw = (text ?? "").trim();
  if (!raw) return { filters: { ...EMPTY_FILTERS }, hasCriteria: false };

  const lower = raw.toLowerCase();

  const jobTitles: string[] = [];
  for (const { title, phrases } of TITLE_PHRASES) {
    if (phrases.some((p) => containsPhrase(lower, p)) && !jobTitles.includes(title)) {
      jobTitles.push(title);
    }
  }

  const keywords: string[] = [];
  for (const { keyword, phrases } of INDUSTRY_PHRASES) {
    if (phrases.some((p) => containsPhrase(lower, p)) && !keywords.includes(keyword)) {
      keywords.push(keyword);
    }
  }

  const statuses: string[] = [];
  for (const { status, phrases } of STATUS_PHRASES) {
    if (phrases.some((p) => containsPhrase(lower, p)) && !statuses.includes(status)) {
      statuses.push(status);
    }
  }

  const locations = extractLocations(raw);
  const minCompanySize = extractMinCompanySize(raw);

  // Sector keywords double as tags: tags are the list model and carry
  // sector labels in this app (e.g. a lead tagged "Fintech").
  const filters: IcpFilters = {
    jobTitles,
    keywords,
    tags: [...keywords],
    statuses,
    locations,
    minCompanySize,
  };
  return { filters, hasCriteria: hasCriteria(filters) };
}

// ============================================================================
// Matching
// ============================================================================

/** All string values stored in a lead's custom_fields. */
function customFieldStrings(lead: Lead): string[] {
  const out: string[] = [];
  for (const value of Object.values(lead.custom_fields ?? {})) {
    if (typeof value === "string") out.push(value);
    else if (typeof value === "number") out.push(String(value));
  }
  return out;
}

/** Parse a team_size-style custom field ("1000+", "15-50", "500") into
 *  the largest size it claims, or null when it carries no number. */
function parseTeamSize(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const nums = value.match(/\d[\d,]*/g);
  if (!nums) return null;
  const parsed = nums.map((n) => Number(n.replace(/,/g, ""))).filter((n) => Number.isFinite(n));
  return parsed.length > 0 ? Math.max(...parsed) : null;
}

function includesFolded(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Does one lead satisfy the filters? Groups combine with AND (a lead
 * must satisfy every non-empty group); values inside a group combine
 * with OR. A filter set with no criteria at all matches nothing —
 * an unrecognised description must not dump the whole CRM.
 */
export function matchesLead(lead: Lead, filters: IcpFilters): boolean {
  if (!hasCriteria(filters)) return false;

  if (filters.jobTitles.length > 0) {
    const title = lead.job_title ?? "";
    const ok = filters.jobTitles.some((t) =>
      (TITLE_ALIASES[t] ?? [t]).some((alias) => includesFolded(title, alias))
    );
    if (!ok) return false;
  }

  if (filters.keywords.length > 0) {
    // A keyword is a company/industry signal: it may live in the
    // company name, in a sector tag (e.g. "Fintech"), or in a
    // custom field value.
    const haystacks = [
      lead.company ?? "",
      ...(lead.tags ?? []),
      ...customFieldStrings(lead),
    ];
    const ok = filters.keywords.some((kw) =>
      haystacks.some((h) => includesFolded(h, kw))
    );
    if (!ok) return false;
  }

  if (filters.tags.length > 0) {
    const tags = lead.tags ?? [];
    const ok = filters.tags.some((tag) =>
      tags.some((t) => includesFolded(t, tag))
    );
    if (!ok) return false;
  }

  if (filters.statuses.length > 0) {
    if (!filters.statuses.includes(lead.status)) return false;
  }

  if (filters.locations.length > 0) {
    const haystacks = customFieldStrings(lead);
    const ok = filters.locations.some((loc) =>
      haystacks.some((h) => includesFolded(h, loc))
    );
    if (!ok) return false;
  }

  if (filters.minCompanySize !== null) {
    const size = parseTeamSize(lead.custom_fields?.team_size);
    if (size === null || size < filters.minCompanySize) return false;
  }

  return true;
}

/** Filter a lead list with parsed ICP filters (same rules as matchesLead). */
export function filterLeads(leads: Lead[], filters: IcpFilters): Lead[] {
  if (!hasCriteria(filters)) return [];
  return leads.filter((lead) => matchesLead(lead, filters));
}

/**
 * Suggest a default list (tag) name from the description, e.g.
 * "CFOs at fintech companies..." -> "CFO Fintech". Falls back to the
 * first words of the description, then to a generic name.
 */
export function suggestListName(text: string, filters: IcpFilters): string {
  const parts = [...filters.jobTitles, ...filters.keywords];
  if (parts.length > 0) {
    const name = parts
      .map((p) =>
        p
          .split(" ")
          .map((w) => (w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
          .join(" ")
      )
      .join(" ");
    return name.slice(0, 60);
  }
  const words = (text ?? "").trim().split(/\s+/).slice(0, 4).join(" ");
  return words ? words.slice(0, 60) : "Lead Finder list";
}
