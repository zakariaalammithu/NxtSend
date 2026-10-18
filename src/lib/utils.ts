import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format as formatFns, formatDistanceToNow, isValid, parseISO } from "date-fns";
import type { PlanType } from "@/types";

/**
 * Combines conditional class names with clsx and merges conflicting Tailwind classes.
 *
 * @param inputs - List of class names, conditionals, or objects.
 * @returns Deduplicated and merged Tailwind class string.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formats a date string or Date object into human-readable representation.
 *
 * @param date - ISO date string or Date instance.
 * @param formatStyle - 'short' (e.g. 'Oct 13, 2024'), 'long' (e.g. 'October 13, 2024 3:30 PM'), or 'relative' (e.g. '5 minutes ago').
 * @returns Formatted date string or original string if invalid.
 */
export function formatDate(
  date: string | Date,
  formatStyle: "short" | "long" | "relative" = "short"
): string {
  let parsed: Date;

  if (typeof date === "string") {
    parsed = parseISO(date);
    if (!isValid(parsed)) {
      parsed = new Date(date);
    }
  } else {
    parsed = date;
  }

  if (!isValid(parsed)) {
    return typeof date === "string" ? date : "";
  }

  switch (formatStyle) {
    case "relative":
      return formatDistanceToNow(parsed, { addSuffix: true });
    case "long":
      return formatFns(parsed, "MMMM d, yyyy h:mm a");
    case "short":
    default:
      return formatFns(parsed, "MMM d, yyyy");
  }
}

/**
 * Formats numbers into a comma-separated locale representation.
 *
 * @param n - Number to format.
 * @returns Formatted number string, e.g. "1,240".
 */
export function formatNumber(n: number): string {
  if (isNaN(n) || n === null || n === undefined) {
    return "0";
  }
  return new Intl.NumberFormat("en-US").format(n);
}

/**
 * Truncates a string to a specified maximum length and appends an ellipsis.
 *
 * @param str - The source string.
 * @param maxLength - Maximum number of characters before truncating.
 * @returns Truncated string with ellipsis or original string.
 */
export function truncate(str: string, maxLength: number): string {
  if (!str) return "";
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength).trimEnd()}...`;
}

/**
 * Extracts the initials (up to 2 uppercase characters) from a person or company name.
 *
 * @param name - Full name or label.
 * @returns Up to 2 capitalized initials, e.g. "JD" for "John Doe".
 */
export function getInitials(name: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Converts a text string into a URL-friendly slug.
 *
 * @param str - Source text to convert.
 * @returns Lowercase hyphen-delimited slug.
 */
export function slugify(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Generates a unique identifier (UUID v4) with crypto.randomUUID fallback.
 *
 * @returns Unique UUID string.
 */
export function generateId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Validates whether an email string adheres to a standard email format.
 *
 * @param email - Target email address to validate.
 * @returns True if the string is a valid email, false otherwise.
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Quantitative limits enforced for each workspace tier.
 */
export interface PlanLimit {
  leads: number;
  campaigns: number;
  accounts: number;
  emailsPerMonth: number;
}

/**
 * Plan quota limits mapped by PlanType tier.
 */
export const planLimits: Record<PlanType, PlanLimit> = {
  free: {
    leads: 500,
    campaigns: 3,
    accounts: 1,
    emailsPerMonth: 1000,
  },
  starter: {
    leads: 2000,
    campaigns: 10,
    accounts: 3,
    emailsPerMonth: 10000,
  },
  growth: {
    leads: 10000,
    campaigns: 50,
    accounts: 10,
    emailsPerMonth: 100000,
  },
  agency: {
    leads: 100000,
    campaigns: 999,
    accounts: 50,
    emailsPerMonth: 1000000,
  },
};
