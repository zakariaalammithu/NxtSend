/**
 * Platform settings — pure core (types, defaults, validation).
 *
 * The settings record is persisted by the admin platform service
 * (Supabase `admin_settings` singleton row in live mode; a labelled
 * in-process demo store in Demo Mode) and mutated only through
 * PUT /api/admin/settings (admin-gated in live mode, audit-logged in
 * both modes). A safe public subset is exposed via
 * GET /api/settings/public for the signup page and dashboard chrome.
 */

export interface AdminSettings {
  site_name: string;
  support_email: string;
  /** When false, the dashboard's demo-mode notice strip is hidden. */
  demo_banner_enabled: boolean;
  /** When false, the signup page refuses new registrations. */
  signups_open: boolean;
  /** Global defaults shown to new campaigns (executor consumes later). */
  default_daily_connections: number;
  default_daily_messages: number;
  updated_at: string | null;
  updated_by: string | null;
}

export const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  site_name: "NxtSend",
  support_email: "support@nxtsend.com",
  demo_banner_enabled: true,
  signups_open: true,
  default_daily_connections: 20,
  default_daily_messages: 50,
  updated_at: null,
  updated_by: null,
};

/** The only fields the public endpoint may ever expose. */
export interface PublicSettings {
  site_name: string;
  signups_open: boolean;
  demo_banner_enabled: boolean;
}

export function toPublicSettings(settings: AdminSettings): PublicSettings {
  return {
    site_name: settings.site_name,
    signups_open: settings.signups_open,
    demo_banner_enabled: settings.demo_banner_enabled,
  };
}

/** Single decision point for the signup gate (unit-tested). */
export function isSignupOpen(settings: Pick<AdminSettings, "signups_open">): boolean {
  return settings.signups_open === true;
}

export type SettingsValidation =
  | { ok: true; value: Omit<AdminSettings, "updated_at" | "updated_by"> }
  | { ok: false; errors: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function boundedInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.floor(value);
  return n >= min && n <= max ? n : null;
}

/**
 * Validates a PUT body against the CURRENT settings (partial updates are
 * allowed: absent fields keep their current values). Unknown fields are
 * ignored, never persisted.
 */
export function validateSettingsUpdate(
  body: Record<string, unknown>,
  current: AdminSettings
): SettingsValidation {
  const errors: Record<string, string> = {};
  const next: Omit<AdminSettings, "updated_at" | "updated_by"> = {
    site_name: current.site_name,
    support_email: current.support_email,
    demo_banner_enabled: current.demo_banner_enabled,
    signups_open: current.signups_open,
    default_daily_connections: current.default_daily_connections,
    default_daily_messages: current.default_daily_messages,
  };

  if ("site_name" in body) {
    const v = typeof body.site_name === "string" ? body.site_name.trim() : "";
    if (v.length < 2 || v.length > 60) errors.site_name = "site_name must be 2–60 characters";
    else next.site_name = v;
  }
  if ("support_email" in body) {
    const v = typeof body.support_email === "string" ? body.support_email.trim() : "";
    if (!EMAIL_RE.test(v)) errors.support_email = "support_email must be a valid email address";
    else next.support_email = v;
  }
  if ("demo_banner_enabled" in body) {
    if (typeof body.demo_banner_enabled !== "boolean")
      errors.demo_banner_enabled = "demo_banner_enabled must be a boolean";
    else next.demo_banner_enabled = body.demo_banner_enabled;
  }
  if ("signups_open" in body) {
    if (typeof body.signups_open !== "boolean")
      errors.signups_open = "signups_open must be a boolean";
    else next.signups_open = body.signups_open;
  }
  if ("default_daily_connections" in body) {
    const n = boundedInt(body.default_daily_connections, 1, 1000);
    if (n === null) errors.default_daily_connections = "must be an integer between 1 and 1000";
    else next.default_daily_connections = n;
  }
  if ("default_daily_messages" in body) {
    const n = boundedInt(body.default_daily_messages, 1, 5000);
    if (n === null) errors.default_daily_messages = "must be an integer between 1 and 5000";
    else next.default_daily_messages = n;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: next };
}

/** Field-level diff for audit metadata ("what changed", never values of secrets — settings hold none). */
export function diffSettings(
  before: AdminSettings,
  after: Omit<AdminSettings, "updated_at" | "updated_by">
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  (Object.keys(after) as Array<keyof typeof after>).forEach((key) => {
    if (before[key] !== after[key]) {
      diff[key] = { from: before[key], to: after[key] };
    }
  });
  return diff;
}
