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
  { name: "MUSE_MCP_ENABLED", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Enables the Muse (Meta) Connector MCP surface. Set to \"false\" to disable it; unset means enabled. The Muse OAuth 2.1 server (migration 023) issues the credentials Muse uses." },
  { name: "MUSE_MCP_PUBLIC_URL", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Public origin advertised in the Muse protected-resource metadata (/.well-known/oauth-protected-resource/api/mcp). Only set when the Muse surface lives somewhere other than NEXT_PUBLIC_APP_URL." },
  { name: "CHATGPT_MCP_ENABLED", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Enables the ChatGPT MCP surface (/api/mcp/chatgpt). Set to \"false\" to disable it; unset means the MUSE_MCP_ENABLED value applies; both unset means enabled. The OAuth 2.1 server (migrations 023 + 024) issues the credentials ChatGPT uses." },
  { name: "CHATGPT_MCP_PUBLIC_URL", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Public origin advertised in the ChatGPT protected-resource metadata (/.well-known/oauth-protected-resource). Precedence: CHATGPT_MCP_PUBLIC_URL, then MUSE_MCP_PUBLIC_URL, then NEXT_PUBLIC_APP_URL. Only set when the ChatGPT surface lives somewhere else." },
  { name: "CLAUDE_MCP_ENABLED", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Enables the Claude MCP surface (/api/mcp/claude). Set to \"false\" to disable it; unset means the MUSE_MCP_ENABLED value applies; both unset means enabled. The OAuth 2.1 server (migrations 023 + 024) issues the credentials Claude uses." },
  { name: "CLAUDE_MCP_PUBLIC_URL", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Public origin advertised in the Claude protected-resource metadata (/.well-known/oauth-protected-resource/api/mcp/claude). Precedence: CLAUDE_MCP_PUBLIC_URL, then MUSE_MCP_PUBLIC_URL, then NEXT_PUBLIC_APP_URL. Only set when the Claude surface lives somewhere else." },
  { name: "ZAPIER_ENABLED", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Enables the Zapier REST API surface (/api/integrations/zapier/v1). Set to \"false\" to disable it; unset means enabled. The OAuth 2.1 server (migrations 023 + 025/026/027) issues the credentials Zapier uses." },
  { name: "ZAPIER_APP_BASE_URL", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Public origin advertised in the Zapier protected-resource metadata (/.well-known/oauth-protected-resource/api/integrations/zapier). Only set when the Zapier surface lives somewhere other than NEXT_PUBLIC_APP_URL." },
  { name: "N8N_INTEGRATION_ENABLED", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Enables the n8n REST API surface (/api/integrations/n8n/v1). Set to \"false\" to disable it; unset means enabled. The OAuth 2.1 server (migrations 023 + 028/029) issues the credentials n8n uses; scoped API keys are created in-app (Settings → Integrations → n8n), never in env." },
  { name: "N8N_API_BASE_URL", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Public origin advertised in the n8n protected-resource metadata (/.well-known/oauth-protected-resource/api/integrations/n8n). Only set when the n8n surface lives somewhere other than NEXT_PUBLIC_APP_URL." },
  { name: "LINKEDIN_CLIENT_ID", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Documented-demo only: no LinkedIn OAuth flow exists in the app (no authorized provider). Kept for the future provider integration." },
  { name: "LINKEDIN_CLIENT_SECRET", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Documented-demo only — see LINKEDIN_CLIENT_ID." },
  { name: "LINKEDIN_REDIRECT_URI", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Documented-demo only — the callback route does not exist yet." },

  // ── Automation REST platforms (Make / Pabbly / Albato / Activepieces) ──
  // The platform surfaces authenticate with the shared OAuth 2.1 server
  // (TOKEN_ENCRYPTION_KEY) — there is no per-platform client secret.
  // These two variables per platform are the enable switch and the
  // public-origin override, read by src/lib/integrations/rest/config.ts
  // (isPlatformEnabled / getPlatformBaseUrl).
  { name: "MAKE_ENABLED", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Enables the Make REST API surface (/api/integrations/make/v1). Set to \"false\" to disable it; unset means enabled. The OAuth 2.1 server (migrations 023 + 029) issues the credentials Make uses." },
  { name: "MAKE_API_BASE_URL", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Public origin advertised in the Make protected-resource metadata (/.well-known/oauth-protected-resource/api/integrations/make). Only set when the Make surface lives somewhere other than NEXT_PUBLIC_APP_URL." },
  { name: "PABBLY_ENABLED", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Enables the Pabbly Connect REST API surface (/api/integrations/pabbly/v1). Set to \"false\" to disable it; unset means enabled. The OAuth 2.1 server (migrations 023 + 029) issues the credentials Pabbly Connect uses." },
  { name: "PABBLY_API_BASE_URL", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Public origin advertised in the Pabbly Connect protected-resource metadata (/.well-known/oauth-protected-resource/api/integrations/pabbly). Only set when the Pabbly Connect surface lives somewhere other than NEXT_PUBLIC_APP_URL." },
  { name: "ALBATO_ENABLED", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Enables the Albato REST API surface (/api/integrations/albato/v1). Set to \"false\" to disable it; unset means enabled. The OAuth 2.1 server (migrations 023 + 029) issues the credentials Albato uses." },
  { name: "ALBATO_API_BASE_URL", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Public origin advertised in the Albato protected-resource metadata (/.well-known/oauth-protected-resource/api/integrations/albato). Only set when the Albato surface lives somewhere other than NEXT_PUBLIC_APP_URL." },
  { name: "ACTIVEPIECES_ENABLED", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Enables the Activepieces REST API surface (/api/integrations/activepieces/v1). Set to \"false\" to disable it; unset means enabled. The OAuth 2.1 server (migrations 023 + 029) issues the credentials Activepieces uses." },
  { name: "ACTIVEPIECES_API_BASE_URL", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Public origin advertised in the Activepieces protected-resource metadata (/.well-known/oauth-protected-resource/api/integrations/activepieces). Only set when the Activepieces surface lives somewhere other than NEXT_PUBLIC_APP_URL." },

  // ── Email Outreach provider credentials ───────────────────────────
  // Server-side env fallback for each adapter's credential (the name
  // declared in src/lib/integrations/providers/email-outreach/*/config.ts).
  // The stored encrypted per-workspace connection is tried first; the env
  // var only seeds/falls back. Presence alone never yields Connected.
  { name: "EMAILBISON_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "EmailBison API key — server-side env fallback for the EmailBison email-outreach credential (stored encrypted connection tried first)." },
  { name: "INSTANTLY_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Instantly API key — server-side env fallback for the Instantly email-outreach credential (stored encrypted connection tried first)." },
  { name: "LEMLIST_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Lemlist API key — server-side env fallback for the Lemlist email-outreach credential (stored encrypted connection tried first)." },
  { name: "MAILSHAKE_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Mailshake API key — server-side env fallback for the Mailshake email-outreach credential (stored encrypted connection tried first)." },
  { name: "MASTERINBOX_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Master Inbox API key — server-side env fallback for the Master Inbox email-outreach credential (stored encrypted connection tried first)." },
  { name: "REPLY_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Reply.io API key — server-side env fallback for the Reply email-outreach credential (stored encrypted connection tried first)." },
  { name: "SMARTLEAD_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Smartlead API key — server-side env fallback for the Smartlead email-outreach credential (stored encrypted connection tried first)." },
  { name: "SMARTREACH_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "SmartReach.io API key — server-side env fallback for the SmartReach email-outreach credential (stored encrypted connection tried first)." },
  { name: "SNOV_API_USER_ID", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Snov.io API user ID (email-outreach OAuth pair with SNOV_API_SECRET) — server-side env fallback for the Snov email-outreach credential (stored encrypted connection tried first)." },
  { name: "SNOV_API_SECRET", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Snov.io API secret (email-outreach OAuth pair with SNOV_API_USER_ID) — server-side env fallback for the Snov email-outreach credential (stored encrypted connection tried first)." },
  { name: "WOODPECKER_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Woodpecker API key — server-side env fallback for the Woodpecker email-outreach credential (stored encrypted connection tried first)." },
  { name: "HOTHAWK_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "HotHawk API key — server-side env fallback for the HotHawk email-outreach credential (stored encrypted connection tried first)." },

  // ── Lead Enrichment provider credentials ─────────────────────────
  // Server-side env fallback for each adapter's credential (the name
  // declared in src/lib/integrations/providers/enrichment/*/config.ts,
  // read via resolveProviderApiKey in enrichment/common.ts). The stored
  // encrypted per-workspace connection is tried first.
  { name: "APIFY_TOKEN", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Apify API token — server-side env fallback for the Apify lead-enrichment credential (stored encrypted connection tried first)." },
  { name: "APOLLO_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Apollo API key — server-side env fallback for the Apollo lead-enrichment credential (stored encrypted connection tried first)." },
  { name: "CLAY_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Clay API key — server-side env fallback for the Clay lead-enrichment credential (stored encrypted connection tried first)." },
  { name: "CONTACTOUT_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "ContactOut API key — server-side env fallback for the ContactOut lead-enrichment credential (stored encrypted connection tried first)." },
  { name: "DROPCONTACT_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Dropcontact API key — server-side env fallback for the Dropcontact lead-enrichment credential (stored encrypted connection tried first)." },
  { name: "FACTORS_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Factors.ai API key — server-side env fallback for the Factors lead-enrichment credential (stored encrypted connection tried first)." },
  { name: "HUNTER_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Hunter API key — server-side env fallback for the Hunter lead-enrichment and Hunter email-verification credentials (shared name; stored encrypted connection tried first)." },
  { name: "PERSANA_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Persana API key — server-side env fallback for the Persana lead-enrichment credential (stored encrypted connection tried first)." },
  { name: "RB2B_WEBHOOK_SECRET", group: "integrations", visibility: "server", requiredForLive: false, purpose: "RB2B webhook secret — server-side env fallback for the RB2B lead-enrichment credential (stored encrypted connection tried first). RB2B delivers via webhook, not a polling API key." },
  { name: "SALESQL_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "SalesQL API key — server-side env fallback for the SalesQL lead-enrichment credential (stored encrypted connection tried first)." },
  { name: "SNOV_CLIENT_ID", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Snov.io OAuth client ID (enrichment OAuth pair with SNOV_CLIENT_SECRET) — server-side env fallback for the Snov lead-enrichment credential (stored encrypted connection tried first). Distinct from the SNOV_API_USER_ID / SNOV_API_SECRET outreach pair." },
  { name: "SNOV_CLIENT_SECRET", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Snov.io OAuth client secret (enrichment OAuth pair with SNOV_CLIENT_ID) — server-side env fallback for the Snov lead-enrichment credential (stored encrypted connection tried first)." },
  { name: "ZOOMINFO_CLIENT_ID", group: "integrations", visibility: "server", requiredForLive: false, purpose: "ZoomInfo OAuth client ID (pair with ZOOMINFO_CLIENT_SECRET) — server-side env fallback for the ZoomInfo lead-enrichment credential (stored encrypted connection tried first)." },
  { name: "ZOOMINFO_CLIENT_SECRET", group: "integrations", visibility: "server", requiredForLive: false, purpose: "ZoomInfo OAuth client secret (pair with ZOOMINFO_CLIENT_ID) — server-side env fallback for the ZoomInfo lead-enrichment credential (stored encrypted connection tried first)." },
  { name: "ZOOMINFO_ACCESS_TOKEN", group: "integrations", visibility: "server", requiredForLive: false, purpose: "ZoomInfo access token — server-side env fallback for the ZoomInfo lead-enrichment credential (stored encrypted connection tried first)." },
  { name: "GETLEADS_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "GetLeads API key — server-side env fallback for the GetLeads lead-enrichment credential (stored encrypted connection tried first)." },
  { name: "CORNERSIGHT_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "CornerSight API key — server-side env fallback for the CornerSight lead-enrichment credential (stored encrypted connection tried first)." },

  // ── Email Verification provider credentials ───────────────────────
  // Server-side env fallback for each adapter's credential (the name
  // declared in src/lib/integrations/providers/verification/*/config.ts,
  // read via resolveProviderApiKey re-exported from verification/common.ts).
  // The stored encrypted per-workspace connection is tried first.
  { name: "BOUNCER_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Bouncer API key — server-side env fallback for the Bouncer email-verification credential (stored encrypted connection tried first)." },
  { name: "MILLIONVERIFIER_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "MillionVerifier API key — server-side env fallback for the MillionVerifier email-verification credential (stored encrypted connection tried first)." },
  { name: "NEVERBOUNCE_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "NeverBounce API key — server-side env fallback for the NeverBounce email-verification credential (stored encrypted connection tried first)." },
  { name: "ZEROBOUNCE_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "ZeroBounce API key — server-side env fallback for the ZeroBounce email-verification credential (stored encrypted connection tried first)." },

  // ── Communication provider credentials ────────────────────────────
  // Server-side env fallback for each adapter's credential (the name
  // declared in src/lib/integrations/providers/communication/*/config.ts).
  // The stored encrypted per-workspace connection is tried first.
  { name: "DISCORD_WEBHOOK_URL", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Discord incoming webhook URL — server-side env fallback for the Discord communication credential (stored encrypted connection tried first)." },
  { name: "SLACK_WEBHOOK_URL", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Slack incoming webhook URL — server-side env fallback for the Slack communication credential (stored encrypted connection tried first)." },
  { name: "SLACK_BOT_TOKEN", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Slack bot token — server-side env fallback for the Slack communication credential (stored encrypted connection tried first)." },
  { name: "TEAMS_WEBHOOK_URL", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Microsoft Teams incoming webhook URL — server-side env fallback for the Teams communication credential (stored encrypted connection tried first)." },
  { name: "TELEGRAM_BOT_TOKEN", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Telegram bot token — server-side env fallback for the Telegram communication credential (stored encrypted connection tried first)." },
  { name: "WHATSAPP_ACCESS_TOKEN", group: "integrations", visibility: "server", requiredForLive: false, purpose: "WhatsApp Business API access token — server-side env fallback for the WhatsApp communication credential (stored encrypted connection tried first)." },

  // ── Productivity provider credentials ─────────────────────────────
  // Server-side env fallback for each adapter's credential (the name
  // declared in src/lib/integrations/providers/productivity/*/config.ts).
  // The stored encrypted per-workspace connection is tried first.
  { name: "AIRTABLE_PAT", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Airtable personal access token — server-side env fallback for the Airtable productivity credential (stored encrypted connection tried first)." },
  { name: "ASANA_ACCESS_TOKEN", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Asana personal access token — server-side env fallback for the Asana productivity credential (stored encrypted connection tried first)." },
  { name: "CALENDLY_ACCESS_TOKEN", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Calendly personal access token — server-side env fallback for the Calendly productivity credential (stored encrypted connection tried first)." },
  { name: "CLICKUP_API_TOKEN", group: "integrations", visibility: "server", requiredForLive: false, purpose: "ClickUp API token — server-side env fallback for the ClickUp productivity credential (stored encrypted connection tried first)." },
  { name: "JIRA_API_TOKEN", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Jira API token — server-side env fallback for the Jira productivity credential (stored encrypted connection tried first)." },
  { name: "LINEAR_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Linear API key — server-side env fallback for the Linear productivity credential (stored encrypted connection tried first)." },
  { name: "MONDAY_API_TOKEN", group: "integrations", visibility: "server", requiredForLive: false, purpose: "monday.com API token — server-side env fallback for the monday.com productivity and CRM credentials (stored encrypted connection tried first)." },
  { name: "NOTION_TOKEN", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Notion internal integration token — server-side env fallback for the Notion productivity credential (stored encrypted connection tried first)." },
  { name: "TRELLO_API_KEY", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Trello API key (pair with TRELLO_TOKEN) — server-side env fallback for the Trello productivity credential (stored encrypted connection tried first)." },
  { name: "TRELLO_TOKEN", group: "integrations", visibility: "server", requiredForLive: false, purpose: "Trello token (pair with TRELLO_API_KEY) — server-side env fallback for the Trello productivity credential (stored encrypted connection tried first)." },
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
