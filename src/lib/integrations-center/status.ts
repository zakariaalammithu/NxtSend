/**
 * Integration Center status service.
 *
 * Aggregates the EXISTING env-derived state modules (email, billing,
 * AI, data mode, pixel) plus static honest entries, and maps them onto
 * the Center status vocabulary (./types.ts).
 *
 * The mapping rule that matters most: the state modules' "connected"
 * means "credentials are configured" — the Center renders that as
 * "Connected but Not Verified". It becomes "Connected and Verified"
 * ONLY when a verification record (an actual provider call that
 * succeeded — this session, or the stored last-verification success
 * from migration 006) exists AND the configuration is still present.
 * A stored FAILED verification surfaces as "Error" while configured.
 */

import { isConfiguredValue, type ProviderState } from "@/lib/env";
import { getDataMode, isSupabaseConfigured, type DataMode } from "@/lib/data/mode";
import { getOAuthConfigStatus, OAUTH_PROVIDER_LABELS } from "@/lib/oauth/config";
import type { OAuthProvider } from "@/lib/oauth/types";
import type { OAuthMailboxSummary } from "@/lib/oauth/store";
import { getEmailState, isEmailFromConfigured } from "@/lib/email/state";
import { describeLinkedInProvider } from "@/lib/linkedin/state";
import { getBillingState } from "@/lib/billing/state";
import { isPixelConfigured } from "@/lib/analytics/pixel";
import {
  isMuseMcpEnabled,
  getMusePublicUrl,
  isChatGptMcpEnabled,
  getChatGptPublicUrl,
  isClaudeMcpEnabled,
  getClaudePublicUrl,
} from "@/lib/muse-connector/oauth/config";
import { isZapierEnabled, getZapierBaseUrl } from "@/lib/integrations/zapier/config";
import { INTEGRATION_REGISTRY } from "./registry";
import type {
  CenterStatus,
  IntegrationStatusEntry,
  VerificationRecord,
} from "./types";

export type CenterEnv = Record<string, string | undefined>;

function envFromProcess(): CenterEnv {
  return process.env as CenterEnv;
}

/**
 * n8n env helpers — LOCAL to this file, mirroring
 * src/lib/integrations/zapier/config.ts exactly (same flag parsing,
 * same URL precedence N8N_API_BASE_URL → NEXT_PUBLIC_APP_URL →
 * request origin). They live here because no shared helper exists
 * for them: Worker B's src/lib/integrations/rest/config.ts (landed
 * 2026-11-18) carries only per-platform metadata
 * (N8N_PLATFORM: resource path, scope prefix, env var names) and
 * no isPlatformEnabled / getPlatformBaseUrl functions, and
 * Worker A's src/lib/integrations/n8n/config.ts has not landed.
 * If either lands a helper, delete these two functions and import
 * from there instead — the behaviour must stay identical.
 */
export function isN8nEnabled(env: CenterEnv = envFromProcess()): boolean {
  const value = env.N8N_INTEGRATION_ENABLED?.trim().toLowerCase();
  if (!value) return true;
  return value !== "false" && value !== "0" && value !== "no" && value !== "off";
}

export function getN8nBaseUrl(
  requestOrigin?: string,
  env: CenterEnv = envFromProcess()
): string | null {
  const parse = (raw: string | undefined): string | null => {
    if (!raw?.trim()) return null;
    try {
      const url = new URL(raw.trim());
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
      return url.origin;
    } catch {
      return null;
    }
  };
  return (
    parse(env.N8N_API_BASE_URL) ??
    parse(env.NEXT_PUBLIC_APP_URL) ??
    parse(requestOrigin)
  );
}

/** The core mapping: raw provider state -> Center vocabulary. */
export function mapProviderState(state: ProviderState): CenterStatus {
  switch (state) {
    case "connected":
      // Credentials configured — NOT proof the provider accepts them.
      return "Connected but Not Verified";
    case "not_connected":
      return "Not Connected";
    case "configuration_required":
      return "Configuration Required";
    case "demo":
      return "Demo Mode";
    case "error":
      return "Error";
  }
}

/**
 * Applies a stored/session verification record on top of a derived
 * status. Verification only counts while the configuration it verified
 * is still present; a stale record never resurrects a removed config.
 */
export function applyVerification(
  derived: CenterStatus,
  configured: boolean,
  record: VerificationRecord | null | undefined
): CenterStatus {
  if (!record || !configured) return derived;
  return record.ok ? "Connected and Verified" : "Error";
}

export interface IntegrationStatusOptions {
  env?: CenterEnv;
  mode?: DataMode;
  /** Last-verification records by integration id (live: migration 006 store). */
  verifications?: Record<string, VerificationRecord>;
  /**
   * Whether the caller's workspace has an enabled outbound-webhook
   * subscription. null = unknown (treated as not configured).
   */
  webhookConfigured?: boolean | null;
  /**
   * Per-OAuth-provider mailbox summaries for the caller's workspace
   * (live mode, from oauth_connections metadata — never tokens).
   * Absent/null = no connection is recorded for that provider.
   */
  oauthMailboxes?: Partial<Record<OAuthProvider, OAuthMailboxSummary | null>>;
  /**
   * Number of ACTIVE Muse OAuth grants for the caller's workspace
   * (live mode, counted from muse_oauth_tokens). null = unknown
   * (e.g. migration 023 not applied) — treated as "no grant seen".
   * A grant is the ONLY thing that can make muse-ai "Connected".
   */
  museGrantsActive?: number | null;
  /**
   * Number of ACTIVE ChatGPT OAuth grants for the caller's workspace
   * (live mode, counted from muse_oauth_tokens by client origin —
   * see countActiveGrantsByOrigin). Same rule as museGrantsActive:
   * null = unknown, and a grant is the ONLY thing that can make
   * the chatgpt entry "Connected".
   */
  chatgptGrantsActive?: number | null;
  /**
   * Number of ACTIVE Claude OAuth grants for the caller's workspace
   * (live mode, counted from muse_oauth_tokens by client origin).
   * Same rule as museGrantsActive: null = unknown, and a grant is
   * the ONLY thing that can make the claude entry "Connected". A
   * Muse or ChatGPT grant never connects it.
   */
  claudeGrantsActive?: number | null;
  /**
   * Number of ACTIVE Zapier OAuth grants for the caller's workspace
   * (live mode, counted from muse_oauth_tokens by client origin —
   * see countActiveGrantsByOrigin). Same rule as the MCP entries:
   * null = unknown, and a grant is the ONLY thing that can make
   * the zapier entry "Connected". A Zapier webhook subscription is
   * created with a grant token, so a subscription cannot exist
   * without a grant — the grant count is the connection signal,
   * and no separate subscription count is consulted here.
   */
  zapierGrantsActive?: number | null;
  /**
   * Number of ACTIVE n8n OAuth grants for the caller's workspace
   * (live mode, counted from muse_oauth_tokens by client origin —
   * see countActiveGrantsByOrigin). Same rule as the MCP entries:
   * null = unknown, and a grant is the ONLY thing that can make
   * the n8n entry "Connected". An n8n API key is a second,
   * independent connection signal: a recently-used API key also
   * counts as a connection (the panel reports it), but this status
   * derivation only sees grant counts, so a key-only connection
   * shows as "Connected but Not Verified" here until the grant
   * count is consulted — the detail page states the key signal
   * explicitly rather than letting this status claim it.
   */
  n8nGrantsActive?: number | null;
}

interface DerivedStatus {
  status: CenterStatus;
  message: string;
  /** Is the integration's configuration currently present (for verification merge)? */
  configured: boolean;
}

function deriveStatus(
  id: string,
  env: CenterEnv,
  mode: DataMode,
  webhookConfigured: boolean | null,
  oauthMailboxes?: Partial<Record<OAuthProvider, OAuthMailboxSummary | null>>,
  museGrantsActive?: number | null,
  chatgptGrantsActive?: number | null,
  claudeGrantsActive?: number | null,
  zapierGrantsActive?: number | null,
  n8nGrantsActive?: number | null
): DerivedStatus {
  const demo = mode === "demo";
  switch (id) {
    case "supabase": {
      if (demo) {
        return {
          status: "Demo Mode",
          message:
            "No Supabase project is configured — the whole app runs on labelled demo data.",
          configured: false,
        };
      }
      const configured = isSupabaseConfigured({
        NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      });
      if (configured) {
        return {
          status: "Connected but Not Verified",
          message:
            "Supabase URL and anon key are configured. Use Test Connection to verify the project answers.",
          configured: true,
        };
      }
      const attempted =
        Boolean(env.NEXT_PUBLIC_SUPABASE_URL) ||
        Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      return {
        status: attempted ? "Configuration Required" : "Not Connected",
        message: attempted
          ? "Supabase values are present but are placeholders or incomplete — the data layer still runs in demo mode."
          : "No Supabase configuration is present.",
        configured: false,
      };
    }
    case "resend": {
      const state = getEmailState(
        {
          RESEND_API_KEY: env.RESEND_API_KEY,
          EMAIL_FROM: env.EMAIL_FROM,
          RESEND_WEBHOOK_SECRET: env.RESEND_WEBHOOK_SECRET,
        },
        mode
      );
      const configured =
        isConfiguredValue(env.RESEND_API_KEY) && isEmailFromConfigured(env.EMAIL_FROM);
      return {
        status: mapProviderState(state),
        message:
          state === "connected"
            ? "RESEND_API_KEY and EMAIL_FROM are configured. Use Test Connection to verify the key against Resend."
            : state === "configuration_required"
              ? "Exactly one of RESEND_API_KEY / EMAIL_FROM is set — both are required."
              : state === "demo"
                ? "Demo Mode: no email is sent; sends are simulated and labelled."
                : "No Resend configuration is present.",
        configured,
      };
    }
    case "gmail":
    case "microsoft": {
      // Mailbox OAuth: "Connected" can ONLY come from a stored
      // connection — which itself exists only after a completed
      // OAuth exchange + provider profile fetch (src/lib/oauth).
      // Env configuration alone yields Not Connected /
      // Configuration Required, never a connection claim. The
      // completed exchange + profile fetch IS this integration's
      // verification, so an active connection maps to
      // "Connected and Verified".
      const provider: OAuthProvider = id === "gmail" ? "google" : "microsoft";
      const label = OAUTH_PROVIDER_LABELS[provider];
      if (demo) {
        return {
          status: "Demo Mode",
          message: `Demo Mode: ${label} mailboxes connect via OAuth in live mode only — nothing is connected or simulated here. Configure Supabase + the OAuth client (SETUP.md §15), then connect from this page in live mode.`,
          configured: false,
        };
      }
      const config = getOAuthConfigStatus(provider, env);
      const summary = oauthMailboxes?.[provider] ?? null;
      if (summary?.email && summary.connectionStatus === "active") {
        if (summary.authStatus === "ok") {
          return {
            status: "Connected and Verified",
            message: `${label} mailbox ${summary.email} is connected via OAuth (the connection was verified by the completed OAuth exchange and provider profile fetch). Sends from campaigns that select this mailbox go through it; Test Connection re-checks the grant against the provider.`,
            configured: true,
          };
        }
        return {
          status: "Error",
          message: `${label} mailbox ${summary.email} has a stored OAuth grant, but its recorded authorization state is "${summary.authStatus}" — reconnect the mailbox from this page. Sends from it refuse until then.`,
          configured: false,
        };
      }
      if (summary?.email) {
        return {
          status: "Error",
          message: `${label} mailbox ${summary.email} has a recorded connection state of "${summary.connectionStatus}" — reconnect the mailbox from this page. Sends from it refuse until it is active again.`,
          configured: false,
        };
      }
      if (!config.clientConfigured && !config.vaultConfigured) {
        const nothingSet = config.missing.length >= 3;
        return {
          status: nothingSet ? "Not Connected" : "Configuration Required",
          message: nothingSet
            ? `No ${label} OAuth configuration is present. Create the OAuth client (SETUP.md §15), set the variables below, then connect a mailbox from this page.`
            : `${label} OAuth is partially configured — missing: ${config.missing.join(", ")}.`,
          configured: false,
        };
      }
      if (!config.ready) {
        return {
          status: "Configuration Required",
          message: `${label} OAuth is partially configured — missing: ${config.missing.join(", ")}. Connect becomes available once the configuration is complete.`,
          configured: false,
        };
      }
      return {
        status: "Not Connected",
        message: `${label} OAuth client is configured, but no mailbox has been connected yet in this workspace. Use Connect in the Connected mailbox panel below — the connection completes only after the provider consent and profile fetch succeed.`,
        configured: false,
      };
    }
    case "stripe": {
      const state = getBillingState(
        {
          STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
          STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET,
        },
        mode
      );
      const configured =
        isConfiguredValue(env.STRIPE_SECRET_KEY) &&
        isConfiguredValue(env.STRIPE_WEBHOOK_SECRET);
      return {
        status: mapProviderState(state),
        message:
          state === "connected"
            ? "Stripe secret key and webhook secret are configured. Use Test Connection to verify the key against Stripe."
            : state === "configuration_required"
              ? "Only one of STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET is set — both are required."
              : state === "demo"
                ? "Demo Mode: no payments are processed."
                : "No Stripe configuration is present.",
        configured,
      };
    }
    case "openai":
    case "anthropic":
    case "meta-model": {
      const keyName =
        id === "openai"
          ? "OPENAI_API_KEY"
          : id === "anthropic"
            ? "ANTHROPIC_API_KEY"
            : "MODEL_API_KEY";
      if (demo) {
        return {
          status: "Demo Mode",
          message:
            "Demo Mode: AI drafting returns a labelled local sample, not AI output.",
          configured: false,
        };
      }
      const configured = isConfiguredValue(env[keyName]);
      return {
        status: configured ? "Connected but Not Verified" : "Not Connected",
        message: configured
          ? `${keyName} is configured. Use Test Connection to verify it against the provider.`
          : `${keyName} is not set on the server.`,
        configured,
      };
    }
    case "meta-pixel": {
      const configured = isPixelConfigured({
        NEXT_PUBLIC_META_PIXEL_ID: env.NEXT_PUBLIC_META_PIXEL_ID,
      });
      return {
        status: configured ? "Connected but Not Verified" : "Not Connected",
        message: configured
          ? "A numeric Pixel ID is configured. There is no server-side verification for a Pixel — verify in Meta Events Manager → Test Events (with consent granted)."
          : "NEXT_PUBLIC_META_PIXEL_ID is unset or not a numeric Pixel ID — the loader renders nothing.",
        configured,
      };
    }
    case "webhooks": {
      if (demo) {
        return {
          status: "Demo Mode",
          message:
            "Demo Mode: webhook deliveries are simulated and logged — endpoints are never actually called.",
          configured: false,
        };
      }
      const configured = webhookConfigured === true;
      return {
        status: configured ? "Connected but Not Verified" : "Not Connected",
        message: configured
          ? "This workspace has an enabled webhook subscription. Use Test Connection to dispatch a signed test event."
          : "No enabled webhook subscription exists for this workspace — configure one in the Webhooks section.",
        configured,
      };
    }
    case "jobs": {
      if (demo) {
        return {
          status: "Demo Mode",
          message: "Demo Mode: the jobs worker runs against in-memory stores when triggered.",
          configured: false,
        };
      }
      const configured = isConfiguredValue(env.CRON_SECRET);
      return {
        status: configured ? "Connected but Not Verified" : "Configuration Required",
        message: configured
          ? "CRON_SECRET is configured; Vercel Cron can invoke the worker. There is no remote check — trigger /api/jobs/run to smoke-test it."
          : "CRON_SECRET is not set — the worker route refuses to run (503) rather than accepting unauthenticated triggers.",
        configured,
      };
    }
    case "linkedin": {
      // The provider state comes from the ONE LinkedIn seam
      // (src/lib/linkedin): demo in Demo Mode, Configuration Required
      // in every live configuration of this build — even with
      // provider credentials present, because no vendor adapter is
      // implemented behind the seam yet. `configured` stays false:
      // reserved variables never count as a connection.
      const description = describeLinkedInProvider(
        {
          LINKEDIN_PROVIDER: env.LINKEDIN_PROVIDER,
          LINKEDIN_PROVIDER_API_KEY: env.LINKEDIN_PROVIDER_API_KEY,
        },
        demo ? "demo" : "supabase"
      );
      return {
        status: mapProviderState(description.state),
        message: description.message,
        configured: false,
      };
    }
    case "muse-ai": {
      // The Muse surface is implemented (OAuth 2.1 server + MCP
      // server, migration 023) — the status now derives from the
      // REAL config state, never from the old research-only label:
      //   - Demo Mode: the surface refuses demo outright.
      //   - A real, active OAuth grant for this workspace is the
      //     ONLY thing that yields "Connected" (and it is Verified:
      //     the grant exists only after a completed OAuth exchange).
      //   - Enabled + public URL set, no grant: "Connected but Not
      //     Verified" — configuration alone is never a connection.
      //   - Otherwise: Not Connected / Configuration Required.
      // `configured` stays false without a grant, so a stale
      // verification record can never upgrade config to Verified.
      if (demo) {
        return {
          status: "Demo Mode",
          message:
            "Demo Mode: the Muse OAuth + MCP surface is unavailable — no grant can be issued or used.",
          configured: false,
        };
      }
      if (museGrantsActive != null && museGrantsActive > 0) {
        return {
          status: "Connected and Verified",
          message: `${museGrantsActive} active Muse OAuth grant(s) exist for this workspace — Muse can call the MCP server on behalf of the granting user(s). Manage them from the grants panel on the detail page.`,
          configured: true,
        };
      }
      const museEnabled = isMuseMcpEnabled(env);
      const musePublicUrl = getMusePublicUrl(undefined, env);
      if (museEnabled && musePublicUrl) {
        return {
          status: "Connected but Not Verified",
          message:
            "Muse MCP surface is configured (MUSE_MCP_ENABLED + public URL are set). That is configuration, not a connection — 'Connected' requires a real OAuth grant; see the grants panel on the detail page.",
          configured: false,
        };
      }
      return {
        status: museEnabled ? "Configuration Required" : "Not Connected",
        message: museEnabled
          ? "Muse MCP surface is enabled but no public URL is set (MUSE_MCP_PUBLIC_URL or NEXT_PUBLIC_APP_URL) — Muse cannot reach the connector until one is set."
          : "Muse MCP surface is disabled (MUSE_MCP_ENABLED is false).",
        configured: false,
      };
    }
    case "chatgpt": {
      // Same rule as muse-ai, for the ChatGPT surface
      // (/api/mcp/chatgpt, nxtsend.* scopes, migration 023 + 024):
      // Demo Mode refuses the surface; a real, active ChatGPT
      // OAuth grant is the ONLY thing that yields "Connected"
      // (and it is Verified — the grant exists only after a
      // completed OAuth exchange); enabled + public URL set, no
      // grant, is "Connected but Not Verified" — configuration
      // alone is never a connection. `configured` stays false
      // without a grant, so a stale verification record can never
      // upgrade config to Verified.
      if (demo) {
        return {
          status: "Demo Mode",
          message:
            "Demo Mode: the ChatGPT OAuth + MCP surface is unavailable — no grant can be issued or used.",
          configured: false,
        };
      }
      if (chatgptGrantsActive != null && chatgptGrantsActive > 0) {
        return {
          status: "Connected and Verified",
          message: `${chatgptGrantsActive} active ChatGPT OAuth grant(s) exist for this workspace — ChatGPT can call the MCP server on behalf of the granting user(s). Manage them from the grants panel on the detail page.`,
          configured: true,
        };
      }
      const chatgptEnabled = isChatGptMcpEnabled(env);
      const chatgptPublicUrl = getChatGptPublicUrl(undefined, env);
      if (chatgptEnabled && chatgptPublicUrl) {
        return {
          status: "Connected but Not Verified",
          message:
            "ChatGPT MCP surface is configured (CHATGPT_MCP_ENABLED / MUSE_MCP_ENABLED + public URL are set). That is configuration, not a connection — 'Connected' requires a real OAuth grant; see the grants panel on the detail page.",
          configured: false,
        };
      }
      return {
        status: chatgptEnabled ? "Configuration Required" : "Not Connected",
        message: chatgptEnabled
          ? "ChatGPT MCP surface is enabled but no public URL is set (CHATGPT_MCP_PUBLIC_URL, MUSE_MCP_PUBLIC_URL or NEXT_PUBLIC_APP_URL) — ChatGPT cannot reach the connector until one is set."
          : "ChatGPT MCP surface is disabled (CHATGPT_MCP_ENABLED — or MUSE_MCP_ENABLED as its fallback — is false).",
        configured: false,
      };
    }
    case "claude": {
      // Same rule as muse-ai / chatgpt, for the Claude surface
      // (/api/mcp/claude, claude.* scopes, migration 023 + 024):
      // Demo Mode refuses the surface; a real, active Claude OAuth
      // grant is the ONLY thing that yields "Connected" (and it is
      // Verified — the grant exists only after a completed OAuth
      // exchange); enabled + public URL set, no grant, is
      // "Connected but Not Verified" — configuration alone is never
      // a connection. A Muse or ChatGPT grant never connects this
      // entry: only the claudeGrantsActive count is consulted.
      // `configured` stays false without a grant, so a stale
      // verification record can never upgrade config to Verified.
      if (demo) {
        return {
          status: "Demo Mode",
          message:
            "Demo Mode: the Claude OAuth + MCP surface is unavailable — no grant can be issued or used.",
          configured: false,
        };
      }
      if (claudeGrantsActive != null && claudeGrantsActive > 0) {
        return {
          status: "Connected and Verified",
          message: `${claudeGrantsActive} active Claude OAuth grant(s) exist for this workspace — Claude can call the MCP server on behalf of the granting user(s). Manage them from the grants panel on the detail page.`,
          configured: true,
        };
      }
      const claudeEnabled = isClaudeMcpEnabled(env);
      const claudePublicUrl = getClaudePublicUrl(undefined, env);
      if (claudeEnabled && claudePublicUrl) {
        return {
          status: "Connected but Not Verified",
          message:
            "Claude MCP surface is configured (CLAUDE_MCP_ENABLED / MUSE_MCP_ENABLED + public URL are set). That is configuration, not a connection — 'Connected' requires a real OAuth grant; see the grants panel on the detail page.",
          configured: false,
        };
      }
      return {
        status: claudeEnabled ? "Configuration Required" : "Not Connected",
        message: claudeEnabled
          ? "Claude MCP surface is enabled but no public URL is set (CLAUDE_MCP_PUBLIC_URL, MUSE_MCP_PUBLIC_URL or NEXT_PUBLIC_APP_URL) — Claude cannot reach the connector until one is set."
          : "Claude MCP surface is disabled (CLAUDE_MCP_ENABLED — or MUSE_MCP_ENABLED as its fallback — is false).",
        configured: false,
      };
    }
    case "zapier": {
      // Same rule as the MCP entries, for the Zapier surface
      // (REST API v1 + REST Hooks, zapier.* scopes, migrations
      // 025–027): Demo Mode refuses the surface; a real, active
      // Zapier OAuth grant is the ONLY thing that yields
      // "Connected" (and it is Verified — the grant exists only
      // after a completed OAuth exchange); enabled + public URL
      // set, no grant, is "Connected but Not Verified" —
      // configuration alone is never a connection. A Muse,
      // ChatGPT or Claude grant never connects this entry: only
      // the zapierGrantsActive count is consulted. `configured`
      // stays false without a grant, so a stale verification
      // record can never upgrade config to Verified.
      if (demo) {
        return {
          status: "Demo Mode",
          message:
            "Demo Mode: the Zapier REST API + webhook surface is unavailable — no grant can be issued or used (Zapier calls receive 503).",
          configured: false,
        };
      }
      if (zapierGrantsActive != null && zapierGrantsActive > 0) {
        return {
          status: "Connected and Verified",
          message: `${zapierGrantsActive} active Zapier OAuth grant(s) exist for this workspace — Zapier can call the REST API on behalf of the granting user(s). Manage them from the grants panel on the detail page.`,
          configured: true,
        };
      }
      const zapierEnabled = isZapierEnabled(env);
      const zapierBaseUrl = getZapierBaseUrl(undefined, env);
      if (zapierEnabled && zapierBaseUrl) {
        return {
          status: "Connected but Not Verified",
          message:
            "Zapier REST surface is configured (ZAPIER_ENABLED + public URL are set). That is configuration, not a connection — 'Connected' requires a real OAuth grant; see the grants panel on the detail page.",
          configured: false,
        };
      }
      return {
        status: zapierEnabled ? "Configuration Required" : "Not Connected",
        message: zapierEnabled
          ? "Zapier REST surface is enabled but no public URL is set (ZAPIER_APP_BASE_URL or NEXT_PUBLIC_APP_URL) — Zapier cannot reach the API until one is set."
          : "Zapier REST surface is disabled (ZAPIER_ENABLED is false).",
        configured: false,
      };
    }
    case "n8n": {
      // Same rule as the Zapier entry, for the n8n surface
      // (REST API v1 + webhooks, n8n.* scopes, migrations
      // 028–029): Demo Mode refuses the surface; a real, active
      // n8n OAuth grant is the ONLY thing that yields
      // "Connected" (and it is Verified — the grant exists only
      // after a completed OAuth exchange); enabled + public URL
      // set, no grant, is "Connected but Not Verified" —
      // configuration alone is never a connection. A Muse,
      // ChatGPT, Claude or Zapier grant never connects this
      // entry: only the n8nGrantsActive count is consulted.
      // `configured` stays false without a grant, so a stale
      // verification record can never upgrade config to Verified.
      // NOTE: a recently-used n8n API key is a second, real
      // connection signal, but this derivation only sees grant
      // counts — a key-only connection is reported by the detail
      // page's API-key panel, not by this status.
      if (demo) {
        return {
          status: "Demo Mode",
          message:
            "Demo Mode: the n8n REST API + webhook surface is unavailable — no grant can be issued or used (n8n calls receive 503).",
          configured: false,
        };
      }
      if (n8nGrantsActive != null && n8nGrantsActive > 0) {
        return {
          status: "Connected and Verified",
          message: `${n8nGrantsActive} active n8n OAuth grant(s) exist for this workspace — n8n can call the REST API on behalf of the granting user(s). Manage them from the grants panel on the detail page.`,
          configured: true,
        };
      }
      const n8nEnabled = isN8nEnabled(env);
      const n8nBaseUrl = getN8nBaseUrl(undefined, env);
      if (n8nEnabled && n8nBaseUrl) {
        return {
          status: "Connected but Not Verified",
          message:
            "n8n REST surface is configured (N8N_INTEGRATION_ENABLED + public URL are set). That is configuration, not a connection — 'Connected' requires a real OAuth grant or a recently-used API key; see the grants and API-key panels on the detail page.",
          configured: false,
        };
      }
      return {
        status: n8nEnabled ? "Configuration Required" : "Not Connected",
        message: n8nEnabled
          ? "n8n REST surface is enabled but no public URL is set (N8N_API_BASE_URL or NEXT_PUBLIC_APP_URL) — n8n cannot reach the API until one is set."
          : "n8n REST surface is disabled (N8N_INTEGRATION_ENABLED is false).",
        configured: false,
      };
    }
    case "google-sheets":
    case "crm":
    case "email-verification":
      return {
        status: "Not Connected",
        message: "Not implemented yet — no adapter exists in the codebase. See the detail page for what implementation requires.",
        configured: false,
      };
    default:
      return { status: "Not Connected", message: "Unknown integration.", configured: false };
  }
}

/**
 * Builds the full status list for the registry. Pure with respect to
 * its options (env/mode/verifications are injectable) so unit tests can
 * drive every vocabulary state without a live provider.
 */
export function getIntegrationStatuses(
  options: IntegrationStatusOptions = {}
): IntegrationStatusEntry[] {
  const env = options.env ?? envFromProcess();
  const mode = options.mode ?? getDataMode();
  const verifications = options.verifications ?? {};
  const webhookConfigured = options.webhookConfigured ?? null;

  return INTEGRATION_REGISTRY.map((descriptor) => {
    const derived = deriveStatus(
      descriptor.id,
      env,
      mode,
      webhookConfigured,
      options.oauthMailboxes,
      options.museGrantsActive,
      options.chatgptGrantsActive,
      options.claudeGrantsActive,
      options.zapierGrantsActive,
      options.n8nGrantsActive
    );
    const record = verifications[descriptor.id] ?? null;
    let status = applyVerification(derived.status, derived.configured, record);
    let message = derived.message;
    if (record && derived.configured) {
      message = record.ok
        ? `Verified ${record.checkedAt}: ${record.message}`
        : `Last verification FAILED ${record.checkedAt}: ${record.message}`;
      status = record.ok ? "Connected and Verified" : "Error";
    }
    return {
      descriptor,
      status,
      statusMessage: message,
      envPresence: descriptor.envVars.map((v) => ({
        name: v.name,
        present: isConfiguredValue(env[v.name]),
      })),
      lastVerification: record,
    };
  });
}
