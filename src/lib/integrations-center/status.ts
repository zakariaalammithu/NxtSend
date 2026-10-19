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
import { getEmailState, isEmailFromConfigured } from "@/lib/email/state";
import { getBillingState } from "@/lib/billing/state";
import { isPixelConfigured } from "@/lib/analytics/pixel";
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
  webhookConfigured: boolean | null
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
      if (demo) {
        return {
          status: "Demo Mode",
          message:
            "Demo Mode: LinkedIn accounts, campaigns and inbox threads are simulated and labelled. Sending is refused by design.",
          configured: false,
        };
      }
      return {
        status: "Configuration Required",
        message:
          "Authorized provider required: LinkedIn's official API does not support outreach automation and no compliant provider is integrated. The reserved OAuth variables do not connect anything by themselves.",
        configured: false,
      };
    }
    case "muse-ai":
      return {
        status: "Unsupported / No Documented API",
        message:
          "No public API exists for driving the Muse agent (researched 2026-10-19). The supported path is the Muse Connector Platform: NxtSend exposes an API/MCP server and submits it for Meta's review.",
        configured: false,
      };
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
    const derived = deriveStatus(descriptor.id, env, mode, webhookConfigured);
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
