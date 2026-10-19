/**
 * Per-user settings — pure core (types, defaults, validation).
 *
 * Two kinds of data live here:
 *   - Profile fields backed by the `profiles` table (full_name — the
 *     only user-writable column migration 002 grants, besides
 *     avatar_url).
 *   - Preferences (notification toggles + the profile "bio/title"
 *     line, which has no profiles column) persisted as JSON in the
 *     `user_preferences` table (migration 009) in live mode, or in
 *     the demo store in Demo Mode.
 *
 * Validation lives here so the repository, the API surface and the
 * tests all share one definition of "acceptable".
 */

export interface UserPreferences {
  notify_replies: boolean;
  notify_connections: boolean;
  daily_digest: boolean;
  bounce_alerts: boolean;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  notify_replies: true,
  notify_connections: true,
  daily_digest: false,
  bounce_alerts: true,
};

/** The stored JSON shape in user_preferences / the demo store. */
export interface StoredUserPrefs extends UserPreferences {
  bio: string;
}

export const DEFAULT_STORED_PREFS: StoredUserPrefs = {
  ...DEFAULT_USER_PREFERENCES,
  bio: "",
};

/**
 * Coerces untrusted stored JSON into a valid StoredUserPrefs. Unknown
 * keys are dropped; non-boolean toggles fall back to the defaults, so
 * a corrupted record can never crash or silently reconfigure the UI.
 */
export function normalizeStoredPrefs(raw: unknown): StoredUserPrefs {
  const out: StoredUserPrefs = { ...DEFAULT_STORED_PREFS };
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  for (const key of [
    "notify_replies",
    "notify_connections",
    "daily_digest",
    "bounce_alerts",
  ] as const) {
    if (typeof r[key] === "boolean") out[key] = r[key] as boolean;
  }
  if (typeof r.bio === "string") out.bio = r.bio.slice(0, 280);
  return out;
}

export type ProfilePatchValidation =
  | { ok: true; value: { full_name?: string; bio?: string } }
  | { ok: false; error: string };

export function validateProfilePatch(patch: {
  full_name?: unknown;
  bio?: unknown;
}): ProfilePatchValidation {
  const value: { full_name?: string; bio?: string } = {};
  if (patch.full_name !== undefined) {
    if (typeof patch.full_name !== "string") {
      return { ok: false, error: "Full name must be text." };
    }
    const name = patch.full_name.trim();
    if (name.length < 2 || name.length > 80) {
      return { ok: false, error: "Full name must be 2–80 characters." };
    }
    value.full_name = name;
  }
  if (patch.bio !== undefined) {
    if (typeof patch.bio !== "string") {
      return { ok: false, error: "Bio must be text." };
    }
    if (patch.bio.length > 280) {
      return { ok: false, error: "Bio must be 280 characters or fewer." };
    }
    value.bio = patch.bio;
  }
  return { ok: true, value };
}

export function validatePasswordChange(input: {
  newPassword?: unknown;
  confirmPassword?: unknown;
}): { ok: true; value: string } | { ok: false; error: string } {
  const pw = typeof input.newPassword === "string" ? input.newPassword : "";
  const confirm =
    typeof input.confirmPassword === "string" ? input.confirmPassword : "";
  if (pw.length < 8) {
    return { ok: false, error: "New password must be at least 8 characters." };
  }
  if (pw !== confirm) {
    return { ok: false, error: "New password and confirmation do not match." };
  }
  return { ok: true, value: pw };
}
