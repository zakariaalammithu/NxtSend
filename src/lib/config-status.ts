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
  | "oauth"
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
  oauth: "Mailbox OAuth (Gmail / Outlook)",
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
  { name: "NEXT_PUBLIC_DEMO_MODE", group: "core", visibility: "public", requiredForLive: false, purpose: "Set to \"true\" to force the Demo Mode banner even when Supabase is configured (banner override only — it does not switch the data mode)." },
  { name: "NEXT_PUBLIC_SUPABASE_URL", group: "core", visibility: "public", requiredForLive: true, purpose: "Supabase project URL (database + auth)." },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", group: "core", visibility: "public", requiredForLive: true, purpose: "Supabase anon key (RLS-scoped client access)." },
  { name: "SUPABASE_SERVICE_ROLE_KEY", group: "core", visibility: "server", requiredForLive: true, purpose: "Supabase service role — admin APIs, webhooks, worker. Bypasses RLS; server only." },
  { name: "ADMIN_BOOTSTRAP_SECRET", group: "core", visibility: "server", requiredForLive: false, purpose: "One-time super-admin bootstrap secret. Remove after first use (see SETUP.md §5)." },

  // ── Email ─────────────────────────────────────────────────────────
  { name: "RESEND_API_KEY", group: "email", visibility: "server", requiredForLive: false, purpose: "Resend API key for outbound email (adapter + sequence executor)." },
  { name: "EMAIL_FROM", group: "email", visibility: "server", requiredForLive: false, purpose: "Verified sender address/domain for outbound email." },
  { name: "CONTACT_NOTIFICATION_EMAIL", group: "email", visibility: "server", requiredForLive: false, purpose: "Internal inbox that receives contact-form notification email (owner's: nxtsendai@gmail.com). Sent from EMAIL_FROM via Resend with the visitor's address as Reply-To; while unset, contact notifications record not_configured (submissions are still stored)." },
  { name: "RESEND_WEBHOOK_SECRET", group: "email", visibility: "server", requiredForLive: false, purpose: "Svix signing secret verifying Resend delivery/inbound webhooks. Webhook rejects events while unset." },
  { name: "EMAIL_REPLY_TO", group: "email", visibility: "server", requiredForLive: false, purpose: "Reply-To for all outbound email (executor + inbox replies). Set to an address on the receiving domain so replies reach the Inbox; unset means replies go to EMAIL_FROM." },
  { name: "UNSUBSCRIBE_SECRET", group: "email", visibility: "server", requiredForLive: false, purpose: "HMAC signing secret for one-click unsubscribe links. Unset → the key is derived from SUPABASE_SERVICE_ROLE_KEY; both unset in live mode → sends omit the unsubscribe URL and warn in the result." },

  // ── Mailbox OAuth ─────────────────────────────────────────────────
  { name: "GOOGLE_CLIENT_ID", group: "oauth", visibility: "server", requiredForLive: false, purpose: "Google Cloud OAuth client ID (Web application) for Gmail mailbox connections. Callback: <NEXT_PUBLIC_APP_URL>/api/oauth/google/callback (SETUP.md §15)." },
  { name: "GOOGLE_CLIENT_SECRET", group: "oauth", visibility: "server", requiredForLive: false, purpose: "Google OAuth client secret (server-only). Used only in the authorization-code exchange + token refresh." },
  { name: "MICROSOFT_CLIENT_ID", group: "oauth", visibility: "server", requiredForLive: false, purpose: "Azure app registration Application (client) ID for Outlook / Microsoft 365 mailbox connections. Callback: <NEXT_PUBLIC_APP_URL>/api/oauth/microsoft/callback (SETUP.md §15)." },
  { name: "MICROSOFT_CLIENT_SECRET", group: "oauth", visibility: "server", requiredForLive: false, purpose: "Azure app registration client secret VALUE (server-only). Used only in the authorization-code exchange + token refresh." },
  { name: "TOKEN_ENCRYPTION_KEY", group: "oauth", visibility: "server", requiredForLive: false, purpose: "AES-256-GCM key (base64, 32 bytes) encrypting stored OAuth tokens in oauth_connections (migration 014). Generate: openssl rand -base64 32. Unset/malformed → mailbox connect refuses before any redirect." },

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
  { name: "INTEGRATION_HUB_ENCRYPTION_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Integration Hub credential-vault key (AES-256-GCM, migration 016; dedicated key, separate from TOKEN_ENCRYPTION_KEY). Encrypts hub_credentials at rest. Losing or rotating it makes stored Hub credentials undecryptable — they must be re-entered." },
  { name: "LINKEDIN_PROVIDER", group: "integrations", visibility: "server", requiredForLive: false, purpose: "RESERVED for the LinkedIn provider integration (src/lib/linkedin): the name/key of the LinkedIn-approved outreach provider the owner procured. Setting it connects nothing — no vendor adapter is implemented yet." },
  { name: "LINKEDIN_PROVIDER_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "RESERVED — the approved provider's API key (server-only, never rendered). See LINKEDIN_PROVIDER." },
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
