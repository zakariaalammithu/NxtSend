/**
 * Environment configuration status — the full .env.example catalogue,
 * classified per variable WITHOUT ever exposing values.
 *
 * Every variable shipped in .env.example is catalogued here, grouped
 * by feature. Each variable is classified against an env source as:
 *
 *   "present_valid"       set, and not a placeholder shape
 *                         (src/lib/env.ts isConfiguredValue rules)
 *   "present_placeholder" set, but still the .env.example placeholder
 *                         (or an empty-looking stub) — the classic
 *                         "I copied the example file" failure
 *   "missing"             not set at all (or empty)
 *
 * Consumers: GET /api/admin/config-status (Admin → Diagnostics /
 * System Health) and `npm run config:check` (scripts/check-config.mjs
 * mirrors this catalogue for offline use). A unit test pins the
 * catalogue to the actual .env.example variable set so the two can
 * never silently drift apart.
 */

import { isConfiguredValue } from "./env";

export type EnvVarStatus = "present_valid" | "present_placeholder" | "missing";

export type ConfigGroupId =
  | "core"
  | "email"
  | "billing"
  | "ai"
  | "pixel"
  | "jobs"
  | "integrations";

export interface ConfigVarSpec {
  name: string;
  group: ConfigGroupId;
  visibility: "public" | "server";
  /** Required before the app can run live (non-demo) at all. */
  requiredForLive: boolean;
  purpose: string;
}

export const CONFIG_GROUP_LABELS: Record<ConfigGroupId, string> = {
  core: "Core (app + Supabase + bootstrap)",
  email: "Email (Resend)",
  billing: "Billing (Stripe)",
  ai: "AI providers",
  pixel: "Meta Pixel",
  jobs: "Background jobs",
  integrations: "Integrations (LinkedIn — documented demo)",
};

export const CONFIG_CATALOG: ConfigVarSpec[] = [
  // ── Core ──────────────────────────────────────────────────────────
  { name: "NEXT_PUBLIC_APP_URL", group: "core", visibility: "public", requiredForLive: true, purpose: "Public base URL — auth redirects, Stripe return URLs, referral links. Must be the production origin in production." },
  { name: "NODE_ENV", group: "core", visibility: "server", requiredForLive: false, purpose: "Runtime mode (development / production). Set automatically by Vercel; listed for completeness." },
  { name: "NEXT_PUBLIC_SUPABASE_URL", group: "core", visibility: "public", requiredForLive: true, purpose: "Supabase project URL (database + auth)." },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", group: "core", visibility: "public", requiredForLive: true, purpose: "Supabase anon key (RLS-scoped client access)." },
  { name: "SUPABASE_SERVICE_ROLE_KEY", group: "core", visibility: "server", requiredForLive: true, purpose: "Supabase service role — admin APIs, webhooks, worker. Bypasses RLS; server only." },
  { name: "ADMIN_BOOTSTRAP_SECRET", group: "core", visibility: "server", requiredForLive: false, purpose: "One-time super-admin bootstrap secret. Remove after first use (see SETUP.md §5)." },

  // ── Email ─────────────────────────────────────────────────────────
  { name: "RESEND_API_KEY", group: "email", visibility: "server", requiredForLive: false, purpose: "Resend API key for outbound email (adapter + sequence executor)." },
  { name: "EMAIL_FROM", group: "email", visibility: "server", requiredForLive: false, purpose: "Verified sender address/domain for outbound email." },
  { name: "RESEND_WEBHOOK_SECRET", group: "email", visibility: "server", requiredForLive: false, purpose: "Svix signing secret verifying Resend delivery/inbound webhooks. Webhook rejects events while unset." },

  // ── Billing ───────────────────────────────────────────────────────
  { name: "STRIPE_SECRET_KEY", group: "billing", visibility: "server", requiredForLive: false, purpose: "Stripe API secret (checkout + customer portal)." },
  { name: "STRIPE_WEBHOOK_SECRET", group: "billing", visibility: "server", requiredForLive: false, purpose: "Signing secret verifying Stripe webhooks; plan changes apply only from verified events." },
  { name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", group: "billing", visibility: "public", requiredForLive: false, purpose: "Stripe publishable key (public by design)." },
  { name: "STRIPE_PRICE_ID_STARTER", group: "billing", visibility: "server", requiredForLive: false, purpose: "Stripe Price ID — Starter, monthly." },
  { name: "STRIPE_PRICE_ID_STARTER_ANNUAL", group: "billing", visibility: "server", requiredForLive: false, purpose: "Stripe Price ID — Starter, annual." },
  { name: "STRIPE_PRICE_ID_GROWTH", group: "billing", visibility: "server", requiredForLive: false, purpose: "Stripe Price ID — Growth, monthly." },
  { name: "STRIPE_PRICE_ID_GROWTH_ANNUAL", group: "billing", visibility: "server", requiredForLive: false, purpose: "Stripe Price ID — Growth, annual." },
  { name: "STRIPE_PRICE_ID_AGENCY", group: "billing", visibility: "server", requiredForLive: false, purpose: "Stripe Price ID — Agency, monthly." },
  { name: "STRIPE_PRICE_ID_AGENCY_ANNUAL", group: "billing", visibility: "server", requiredForLive: false, purpose: "Stripe Price ID — Agency, annual." },

  // ── AI ────────────────────────────────────────────────────────────
  { name: "OPENAI_API_KEY", group: "ai", visibility: "server", requiredForLive: false, purpose: "OpenAI API key for AI drafting." },
  { name: "OPENAI_MODEL", group: "ai", visibility: "server", requiredForLive: false, purpose: "Optional OpenAI model override (default gpt-4o-mini). Empty is a valid state." },
  { name: "ANTHROPIC_API_KEY", group: "ai", visibility: "server", requiredForLive: false, purpose: "Anthropic API key for AI drafting." },
  { name: "ANTHROPIC_MODEL", group: "ai", visibility: "server", requiredForLive: false, purpose: "Optional Anthropic model override (default claude-sonnet-4-5). Empty is a valid state." },
  { name: "MODEL_API_KEY", group: "ai", visibility: "server", requiredForLive: false, purpose: "Meta Model API key (Muse Spark models) for AI drafting." },
  { name: "META_MODEL", group: "ai", visibility: "server", requiredForLive: false, purpose: "Optional Meta model override (default muse-spark-1.3). Empty is a valid state." },

  // ── Pixel ─────────────────────────────────────────────────────────
  { name: "NEXT_PUBLIC_META_PIXEL_ID", group: "pixel", visibility: "public", requiredForLive: false, purpose: "Meta Pixel ID (public identifier). Unset = loader renders nothing; consent is also required." },

  // ── Jobs ──────────────────────────────────────────────────────────
  { name: "CRON_SECRET", group: "jobs", visibility: "server", requiredForLive: true, purpose: "Authenticates POST/GET /api/jobs/run (Vercel Cron sends it as a Bearer token). The worker refuses to run while unset." },

  // ── Integrations ──────────────────────────────────────────────────
  { name: "LINKEDIN_CLIENT_ID", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Documented-demo only: no LinkedIn OAuth flow exists in the app (no authorized provider). Kept for the future provider integration." },
  { name: "LINKEDIN_CLIENT_SECRET", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Documented-demo only — see LINKEDIN_CLIENT_ID." },
  { name: "LINKEDIN_REDIRECT_URI", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Documented-demo only — the callback route does not exist yet." },
];

export function classifyEnvValue(
  name: string,
  raw: string | undefined | null
): EnvVarStatus {
  if (raw === undefined || raw === null || raw.trim() === "") return "missing";
  // NODE_ENV is a mode switch, not a credential: any non-empty value
  // is a real choice ("test" included — isConfiguredValue rejects the
  // literal "test" as a placeholder shape, which is wrong here).
  if (name === "NODE_ENV") return "present_valid";
  return isConfiguredValue(raw) ? "present_valid" : "present_placeholder";
}

export interface ConfigVarStatus extends ConfigVarSpec {
  status: EnvVarStatus;
}

export interface ConfigGroupStatus {
  group: ConfigGroupId;
  label: string;
  vars: ConfigVarStatus[];
  valid: number;
  placeholder: number;
  missing: number;
}

export interface ConfigStatusMatrix {
  groups: ConfigGroupStatus[];
  totals: { valid: number; placeholder: number; missing: number; total: number };
  /** Names (only) of required-for-live variables not in a valid state. */
  missingRequiredForLive: string[];
  /** Names (only) of variables still holding placeholder values. */
  placeholderVars: string[];
  liveReady: boolean;
}

export function buildConfigStatus(
  env: Record<string, string | undefined>
): ConfigStatusMatrix {
  const byGroup = new Map<ConfigGroupId, ConfigVarStatus[]>();
  for (const spec of CONFIG_CATALOG) {
    const entry: ConfigVarStatus = {
      ...spec,
      status: classifyEnvValue(spec.name, env[spec.name]),
    };
    const arr = byGroup.get(spec.group) ?? [];
    arr.push(entry);
    byGroup.set(spec.group, arr);
  }
  const groups: ConfigGroupStatus[] = (
    Object.keys(CONFIG_GROUP_LABELS) as ConfigGroupId[]
  ).map((group) => {
    const vars = byGroup.get(group) ?? [];
    return {
      group,
      label: CONFIG_GROUP_LABELS[group],
      vars,
      valid: vars.filter((v) => v.status === "present_valid").length,
      placeholder: vars.filter((v) => v.status === "present_placeholder").length,
      missing: vars.filter((v) => v.status === "missing").length,
    };
  });
  const all = groups.flatMap((g) => g.vars);
  const missingRequiredForLive = all
    .filter((v) => v.requiredForLive && v.status !== "present_valid")
    .map((v) => v.name);
  return {
    groups,
    totals: {
      valid: all.filter((v) => v.status === "present_valid").length,
      placeholder: all.filter((v) => v.status === "present_placeholder").length,
      missing: all.filter((v) => v.status === "missing").length,
      total: all.length,
    },
    missingRequiredForLive,
    placeholderVars: all
      .filter((v) => v.status === "present_placeholder")
      .map((v) => v.name),
    liveReady: missingRequiredForLive.length === 0,
  };
}

/** Builds the matrix from the current process environment. */
export function getConfigStatus(): ConfigStatusMatrix {
  const env: Record<string, string | undefined> = {};
  for (const spec of CONFIG_CATALOG) env[spec.name] = process.env[spec.name];
  // NODE_ENV is effectively always present; include it for completeness.
  env.NODE_ENV = process.env.NODE_ENV;
  return buildConfigStatus(env);
}
