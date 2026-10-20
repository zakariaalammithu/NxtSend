/**
 * Audience source definitions for the campaign wizard (Step 2).
 *
 * Pure data + validation — no DOM, no storage — so the LinkedIn source
 * rules are unit-testable. The four LinkedIn tabs only ever DEFINE a
 * source (type + URL + requested count) that is saved with the
 * campaign: collecting people from LinkedIn requires an authorized
 * LinkedIn provider, and NxtSend deliberately has none (no scraping,
 * no browser automation, no session cookies — see the Integration
 * Center). Nothing in this module, or in the wizard, invents people
 * from a LinkedIn URL.
 */

import type { AudienceSourceType, WarmupLimits } from "@/types";

/** The LinkedIn-backed source types (everything except the CSV tabs). */
export type LinkedinSourceType = Exclude<AudienceSourceType, "csv" | "my_network">;

/**
 * Closely's warm-up schedule, shown in wizard Step 1 as the DEFAULT
 * daily limits that will apply to the selected LinkedIn account while
 * it warms up. These are defaults presented to the user — not live
 * account state (there is no account model until migration 011 /
 * Stage 4, which is when per-account limits become real and editable).
 */
export const DEFAULT_WARMUP_LIMITS: WarmupLimits = {
  connection_requests: 5,
  messages: 10,
  profile_views: 20,
  like_post: 20,
  endorse_skills: 20,
  find_email: 20,
};

export const WARMUP_LIMIT_ROWS: Array<{
  key: keyof WarmupLimits;
  label: string;
  growthNote: string;
}> = [
  { key: "connection_requests", label: "Connection requests", growthNote: "The number of connection requests will keep growing." },
  { key: "messages", label: "Messages", growthNote: "The number of messages will keep growing." },
  { key: "profile_views", label: "Profiles views", growthNote: "The number of profiles views will keep growing." },
  { key: "like_post", label: "Like post", growthNote: "The number of posts likes will keep growing." },
  { key: "endorse_skills", label: "Endorse skills", growthNote: "The number of skills endorses will keep growing." },
  { key: "find_email", label: "Find email", growthNote: "The number of find emails will keep growing." },
];

export interface LinkedinSourceDef {
  type: LinkedinSourceType;
  tabLabel: string;
  heading: string;
  instructions: string;
  urlLabel: string;
  urlPlaceholder: string;
  /** Shown under the count input (Closely's documented caps). */
  maxNote: string;
  examples: Array<{ label: string; url: string }>;
}

export const LINKEDIN_SOURCE_DEFS: Record<LinkedinSourceType, LinkedinSourceDef> = {
  linkedin_search: {
    type: "linkedin_search",
    tabLabel: "LinkedIn Search",
    heading: "Find people",
    instructions:
      "Find people you want to reach in LinkedIn search, in Sales Navigator or in LinkedIn Recruiter and insert the link to your search results below. Check examples of these links on the right.",
    urlLabel: "Search results link",
    urlPlaceholder: "Enter Search, Sales Navigator URL or LinkedIn Recruiter URL",
    maxNote: "Max contacts: LinkedIn Basic Search - 1000, Sales Navigator - 2500",
    examples: [
      { label: "LinkedIn Basic Search example:", url: "https://www.linkedin.com/search/results/people/" },
      { label: "LinkedIn Sales Navigator example:", url: "https://www.linkedin.com/sales/search/people/" },
      { label: "LinkedIn Sales Navigator list example:", url: "https://www.linkedin.com/sales/lists/people/" },
      { label: "LinkedIn Recruiter example:", url: "https://www.linkedin.com/talent/search/" },
    ],
  },
  post_engagement: {
    type: "post_engagement",
    tabLabel: "Post engagement",
    heading: "Reach people who engaged with a post",
    instructions:
      "Paste the link to a LinkedIn post below. People who liked or commented on the post are the audience for this campaign. Check an example of the link on the right.",
    urlLabel: "Post link",
    urlPlaceholder: "Enter LinkedIn post URL",
    maxNote: "Note: the more people the longer the wait",
    examples: [
      { label: "LinkedIn post example:", url: "https://www.linkedin.com/posts/" },
    ],
  },
  event_attendees: {
    type: "event_attendees",
    tabLabel: "Event attendees",
    heading: "Reach event attendees",
    instructions:
      "Paste the link to a LinkedIn event below. People who registered for the event are the audience for this campaign. Check an example of the link on the right.",
    urlLabel: "Event link",
    urlPlaceholder: "Enter LinkedIn event URL",
    maxNote: "Note: the more people the longer the wait",
    examples: [
      { label: "LinkedIn event example:", url: "https://www.linkedin.com/events/" },
    ],
  },
  group_members: {
    type: "group_members",
    tabLabel: "Group members",
    heading: "Reach group members",
    instructions:
      "Paste the link to a LinkedIn group below. Members of the group are the audience for this campaign. Check an example of the link on the right.",
    urlLabel: "Group link",
    urlPlaceholder: "Enter LinkedIn group URL",
    maxNote: "Note: the more people the longer the wait",
    examples: [
      { label: "LinkedIn group example:", url: "https://www.linkedin.com/groups/" },
    ],
  },
};

export const LINKEDIN_SOURCE_TYPES = Object.keys(
  LINKEDIN_SOURCE_DEFS
) as LinkedinSourceType[];

/** Documented per-source maximum for LinkedIn Search (Closely). */
export function maxPeopleForSource(type: LinkedinSourceType, url: string): number | null {
  if (type !== "linkedin_search") return null;
  const u = url.toLowerCase();
  // Sales Navigator and Recruiter searches allow up to 2,500 people;
  // a basic LinkedIn search caps at 1,000.
  return u.includes("/sales/") || u.includes("/talent/") ? 2500 : 1000;
}

const URL_PATTERNS: Record<LinkedinSourceType, RegExp> = {
  linkedin_search: /\/(search\/|sales\/|talent\/)/,
  post_engagement: /\/posts\/|\/feed\/update\//,
  event_attendees: /\/events\//,
  group_members: /\/groups\//,
};

const URL_ERRORS: Record<LinkedinSourceType, string> = {
  linkedin_search:
    "That link doesn't look like a LinkedIn search. Paste a Search, Sales Navigator or Recruiter results link (it contains /search/, /sales/ or /talent/).",
  post_engagement:
    "That link doesn't look like a LinkedIn post. Paste a post link (it contains /posts/).",
  event_attendees:
    "That link doesn't look like a LinkedIn event. Paste an event link (it contains /events/).",
  group_members:
    "That link doesn't look like a LinkedIn group. Paste a group link (it contains /groups/).",
};

/**
 * Validates a LinkedIn source definition. Returns an error message, or
 * null when the definition is valid and can be saved with the campaign.
 */
export function validateLinkedinSource(
  type: LinkedinSourceType,
  url: string,
  count: number
): string | null {
  const trimmed = url.trim();
  if (!trimmed) return "Paste a LinkedIn link first.";
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "That link is not a valid URL.";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "The link must start with http:// or https://.";
  }
  if (!/(^|\.)linkedin\.com$/i.test(parsed.hostname)) {
    return "The link must be on linkedin.com.";
  }
  if (!URL_PATTERNS[type].test(parsed.pathname)) {
    return URL_ERRORS[type];
  }
  if (!Number.isFinite(count) || count < 1) {
    return "How many people? Enter a number of at least 1.";
  }
  const max = maxPeopleForSource(type, trimmed);
  if (max !== null && count > max) {
    return `Too many people for this link type — the maximum is ${max.toLocaleString()}.`;
  }
  return null;
}

/** Human label for any audience source type (Step 4 summary, list header). */
export function audienceSourceLabel(type: AudienceSourceType): string {
  switch (type) {
    case "csv":
      return "CSV file";
    case "my_network":
      return "CSV file · My Network";
    default:
      return LINKEDIN_SOURCE_DEFS[type].tabLabel;
  }
}
