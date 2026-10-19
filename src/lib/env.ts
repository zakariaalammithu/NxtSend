/**
 * Shared environment / provider-state helpers (server-side modules).
 *
 * Every provider adapter in Stage 2c (email, billing, AI, webhooks, jobs)
 * derives its honest state from ACTUAL environment presence using the
 * single check below — a state is never hardcoded to "connected".
 *
 * State vocabulary (from the product brief):
 *   "connected"              credentials present and plausibly real
 *   "not_connected"          nothing configured
 *   "configuration_required" partially configured (some required vars set)
 *   "demo"                   the app itself is in demo mode (no Supabase)
 *   "error"                  configured but a live operation failed
 */

export type ProviderState =
  | "connected"
  | "not_connected"
  | "configuration_required"
  | "demo"
  | "error";

export const PROVIDER_STATE_LABELS: Record<ProviderState, string> = {
  connected: "Connected",
  not_connected: "Not Connected",
  configuration_required: "Configuration Required",
  demo: "Demo Mode",
  error: "Error",
};

/**
 * True when an env var holds a plausibly real value — i.e. it is set,
 * non-empty, and not one of the placeholder shapes used in .env.example
 * (`re_your_...`, `sk_test_your_...`, `whsec_your_...`, `your-...`,
 * `change-me-...`, anything containing "placeholder").
 *
 * This deliberately does NOT validate the credential against the provider
 * (that takes a network call); it only separates "operator supplied a
 * value" from "the shipped placeholder is still in place".
 */
export function isConfiguredValue(value: string | undefined | null): value is string {
  if (!value) return false;
  const v = value.trim();
  if (v.length === 0) return false;
  const lower = v.toLowerCase();
  if (lower.includes("placeholder")) return false;
  if (lower.includes("your-") || lower.includes("your_")) return false;
  if (lower.startsWith("change-me")) return false;
  if (lower === "demo" || lower === "test") return false;
  return true;
}

/** Reads a server-side env var by name (never a NEXT_PUBLIC_ secret). */
export function serverEnv(name: string): string | undefined {
  return process.env[name];
}
