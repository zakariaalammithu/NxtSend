/**
 * Meta (Facebook) Pixel — configuration + event vocabulary.
 *
 * The Pixel ID is a PUBLIC identifier (it ships in page HTML by design),
 * so NEXT_PUBLIC_META_PIXEL_ID is correct here — it is not a secret and
 * no provider key is ever read from a NEXT_PUBLIC_ var in this codebase.
 *
 * Hard rules:
 *  - No ID configured  -> the component renders nothing, loads nothing,
 *    fires nothing. There is no hardcoded/fallback Pixel ID.
 *  - The ID must look like a real Meta Pixel ID (numeric) — placeholder
 *    strings from .env.example never activate tracking.
 */

export type PixelEventName =
  | "PageView"
  | "Lead"
  | "CompleteRegistration"
  | "StartTrial"
  | "Subscribe";

/** localStorage key the consent gate reads (see MetaPixel component). */
export const CONSENT_STORAGE_KEY = "nxtsend_cookie_consent";
export const CONSENT_GRANTED_VALUE = "accepted";
/** Window event a future consent banner can dispatch after a grant. */
export const CONSENT_EVENT_NAME = "nxtsend:consent-granted";

export function getMetaPixelId(
  env: { NEXT_PUBLIC_META_PIXEL_ID?: string } = {
    NEXT_PUBLIC_META_PIXEL_ID: process.env.NEXT_PUBLIC_META_PIXEL_ID,
  }
): string | null {
  const raw = env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  if (!raw) return null;
  // Real Meta Pixel IDs are numeric strings. Anything else (including
  // the .env.example placeholder) is treated as "not configured".
  if (!/^\d{5,20}$/.test(raw)) return null;
  return raw;
}

export function isPixelConfigured(
  env: { NEXT_PUBLIC_META_PIXEL_ID?: string } = {
    NEXT_PUBLIC_META_PIXEL_ID: process.env.NEXT_PUBLIC_META_PIXEL_ID,
  }
): boolean {
  return getMetaPixelId(env) !== null;
}

/** Paths where marketing tracking must never fire. */
export function isTrackedPath(pathname: string): boolean {
  return !pathname.startsWith("/dashboard") && !pathname.startsWith("/admin");
}
