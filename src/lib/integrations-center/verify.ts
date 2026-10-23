/**
 * Integration Center — Test Connection (verification) service.
 *
 * One SAFE, read-only, documented verification call per provider:
 *   resend      Resend SDK: domains.list()
 *   stripe      Stripe SDK: accounts.retrieve()
 *   openai      GET https://api.openai.com/v1/models (Bearer)
 *   anthropic   GET https://api.anthropic.com/v1/models (x-api-key)
 *   meta-model  GET https://api.meta.ai/v1/models (Bearer MODEL_API_KEY)
 *               — endpoint details are documented via SECONDARY sources
 *               quoting Meta's developer docs (Meta's developer portal
 *               could not be fetched directly during the 2026-10-19
 *               research); the result notes say so every time.
 *   supabase    GET <project>/auth/v1/health (GoTrue health, anon key)
 *   webhooks    a signed `nxtsend.test` event through the existing
 *               dispatch pipeline (route supplies the dispatcher)
 *
 * Providers with no server-side verification surface return an honest
 * instruction result instead of pretending (Meta Pixel), a static
 * status (Muse.ai / not-implemented entries / LinkedIn), or a pointer
 * to the manual smoke test (jobs).
 *
 * Guards (unit-tested): when required configuration is missing, NO
 * outbound call is made — the result is Configuration Required /
 * Not Connected. In Demo Mode no provider is called at all; the result
 * is the honest Demo Mode state. No secret value ever appears in a
 * result message.
 */

import { isConfiguredValue } from "@/lib/env";
import { getDataMode, isSupabaseConfigured, type DataMode } from "@/lib/data/mode";
import { getEmailState } from "@/lib/email/state";
import {
  extractEmailDomain,
  listResendDomains,
  matchEmailFromDomain,
  type ResendDomainInfo,
} from "@/lib/email/domains";
import { getBillingState } from "@/lib/billing/state";
import { NotConfiguredLinkedInAdapter } from "@/lib/linkedin/not-configured";
import { isPixelConfigured } from "@/lib/analytics/pixel";
import type { CenterStatus, VerifyOutcome } from "./types";

export interface VerifyDeps {
  env?: Record<string, string | undefined>;
  mode?: DataMode;
  /** Injectable fetch for the HTTP-based verifications (tests). */
  fetchFn?: typeof fetch;
  /**
   * Injectable Resend domain status (tests). Default: the real SDK
   * list (+ record detail for the EMAIL_FROM domain). When a fake
   * returns no `domains`, the verdict falls back to the key-acceptance
   * message only — domain verification is never claimed without data.
   */
  resendListDomains?: (apiKey: string) => Promise<{
    domains?: ResendDomainInfo[];
    error: string | null;
  }>;
  /** Injectable Stripe accounts.retrieve (tests). Default: real SDK call. */
  stripeRetrieveAccount?: () => Promise<{ id: string }>;
  /** Whether the caller's workspace has an enabled webhook subscription. */
  webhookConfigured?: boolean;
  /**
   * Dispatches the nxtsend.test event through the webhooks pipeline
   * (route-composed; simulated in demo mode). Return = delivery status.
   */
  dispatchTestEvent?: () => Promise<{ status: string }>;
  /**
   * Mailbox verification (route-composed; needs the caller's
   * workspace + service role): performs the REAL OAuth check —
   * valid token (refreshing if needed) + provider profile re-fetch
   * matched against the connected mailbox. See
   * src/lib/oauth/service.ts verifyOAuthConnection.
   */
  mailboxVerify?: (provider: "google" | "microsoft") => Promise<{
    attempted: boolean;
    ok: boolean;
    message: string;
  }>;
}

const META_MODEL_NOTES =
  "Endpoint details (api.meta.ai/v1, Bearer MODEL_API_KEY) are documented via secondary sources quoting Meta's developer documentation — Meta's developer portal could not be fetched directly during the 2026-10-19 research. A successful response is the first primary confirmation for this key.";

function outcome(
  integrationId: string,
  status: CenterStatus,
  ok: boolean,
  attempted: boolean,
  message: string,
  notes?: string
): VerifyOutcome {
  return {
    integrationId,
    status,
    ok,
    attempted,
    checkedAt: new Date().toISOString(),
    message,
    ...(notes ? { notes } : {}),
  };
}

async function modelsListCheck(args: {
  fetchFn: typeof fetch;
  url: string;
  headers: Record<string, string>;
  providerLabel: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await args.fetchFn(args.url, {
      method: "GET",
      headers: args.headers,
    });
    if (res.ok) return { ok: true };
    return {
      ok: false,
      message: `${args.providerLabel} rejected the verification request (HTTP ${res.status}). The key may be invalid, revoked, or lack access.`,
    };
  } catch (err) {
    return {
      ok: false,
      message: `${args.providerLabel} verification request failed: ${err instanceof Error ? err.message : "network error"}.`,
    };
  }
}

export async function verifyIntegration(
  id: string,
  deps: VerifyDeps = {}
): Promise<VerifyOutcome | null> {
  const env = deps.env ?? (process.env as Record<string, string | undefined>);
  const mode = deps.mode ?? getDataMode();
  const fetchFn = deps.fetchFn ?? fetch;

  // ── Demo Mode: never call out (webhooks dispatch stays simulated). ──
  if (mode === "demo") {
    if (id === "webhooks" && deps.dispatchTestEvent) {
      const delivery = await deps.dispatchTestEvent();
      return outcome(
        id,
        "Demo Mode",
        false,
        true,
        `Demo Mode: a nxtsend.test event was recorded as a ${delivery.status} delivery in the demo log — the endpoint was NOT actually called.`
      );
    }
    if (id === "muse-ai") {
      return outcome(
        id,
        "Unsupported / No Documented API",
        false,
        false,
        "Demo Mode, and no documented public API exists for the Muse agent in any mode. See the readiness pack on this page."
      );
    }
    return outcome(
      id,
      "Demo Mode",
      false,
      false,
      "Demo Mode: no verification call was made. Configure Supabase and the provider credentials (SETUP.md), then verify again in live mode."
    );
  }

  switch (id) {
    case "supabase": {
      const url = env.NEXT_PUBLIC_SUPABASE_URL;
      const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!isSupabaseConfigured({ NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon })) {
        const attempted = Boolean(url) || Boolean(anon);
        return outcome(
          id,
          attempted ? "Configuration Required" : "Not Connected",
          false,
          false,
          attempted
            ? "Supabase values are placeholders or incomplete — no verification call was made."
            : "Supabase is not configured — no verification call was made."
        );
      }
      try {
        const res = await fetchFn(`${(url as string).replace(/\/$/, "")}/auth/v1/health`, {
          method: "GET",
          headers: { apikey: anon as string },
        });
        if (res.ok) {
          return outcome(id, "Connected and Verified", true, true,
            "Supabase Auth health endpoint answered successfully — the project URL and anon key work.");
        }
        return outcome(id, "Error", false, true,
          `Supabase Auth health check returned HTTP ${res.status}. Check the project URL in NEXT_PUBLIC_SUPABASE_URL.`);
      } catch (err) {
        return outcome(id, "Error", false, true,
          `Supabase health check failed: ${err instanceof Error ? err.message : "network error"}.`);
      }
    }

    case "resend": {
      const state = getEmailState(
        { RESEND_API_KEY: env.RESEND_API_KEY, EMAIL_FROM: env.EMAIL_FROM, RESEND_WEBHOOK_SECRET: env.RESEND_WEBHOOK_SECRET },
        mode
      );
      if (state !== "connected") {
        return outcome(
          id,
          state === "configuration_required" ? "Configuration Required" : "Not Connected",
          false,
          false,
          "Resend is not fully configured (RESEND_API_KEY + EMAIL_FROM are both required) — no verification call was made."
        );
      }
      const emailFrom = env.EMAIL_FROM;
      const fromDomain = extractEmailDomain(emailFrom);
      const listDomains =
        deps.resendListDomains ??
        (async (apiKey: string) =>
          listResendDomains(apiKey, { detailDomain: fromDomain }));
      const { domains, error } = await listDomains(
        env.RESEND_API_KEY as string
      );
      if (error) {
        return outcome(id, "Error", false, true,
          `Resend rejected the verification call: ${error}. Check RESEND_API_KEY.`);
      }
      if (!domains) {
        // The verifier ran without domain data: only key acceptance is
        // established — domain verification is NOT claimed.
        return outcome(id, "Connected and Verified", true, true,
          "Resend accepted the API key (domains list succeeded). Sending still depends on a verified domain matching EMAIL_FROM.");
      }
      const match = matchEmailFromDomain(domains, emailFrom);
      if (match.state === "verified" && match.domain) {
        return outcome(id, "Connected and Verified", true, true,
          `Resend accepted the API key, and the EMAIL_FROM domain (${match.domain.name}) is verified at Resend — sends from it are accepted by the provider.`);
      }
      if (match.state === "not_verified" && match.domain) {
        return outcome(id, "Configuration Required", false, true,
          `Resend accepted the key, but the EMAIL_FROM domain (${match.domain.name}) is not verified at Resend — its provider status is "${match.domain.status}". Resend rejects sends from unverified domains; add the domain's DNS records in Resend and re-verify before sending.`);
      }
      if (match.state === "not_listed") {
        return outcome(id, "Configuration Required", false, true,
          `Resend accepted the key, but the EMAIL_FROM domain (${match.fromDomain}) is not among the Resend account's domains (${domains.length === 0 ? "the account has no domains yet" : domains.map((d) => d.name).join(", ")}). Add and verify that domain in Resend — sends from it will be rejected until then.`);
      }
      return outcome(id, "Connected and Verified", true, true,
        "Resend accepted the API key (domains list succeeded). Sending still depends on a verified domain matching EMAIL_FROM.");
    }

    case "gmail":
    case "microsoft": {
      // The mailbox Test Connection is a REAL provider check: the
      // stored grant's token is validated (refreshed when needed)
      // and the provider profile is re-fetched and matched to the
      // connected mailbox (route-composed mailboxVerify). With no
      // connection there is nothing to call — attempted stays false.
      const provider = id === "gmail" ? "google" : "microsoft";
      const label = provider === "google" ? "Gmail" : "Outlook (Microsoft 365)";
      if (!deps.mailboxVerify) {
        return outcome(id, "Not Connected", false, false,
          `No ${label} mailbox check is available in this context (workspace service role required). Connect a mailbox from this page in live mode first.`);
      }
      const result = await deps.mailboxVerify(provider);
      if (!result.attempted) {
        const notConfigured = /not configured/i.test(result.message);
        return outcome(
          id,
          notConfigured ? "Configuration Required" : "Not Connected",
          false,
          false,
          result.message
        );
      }
      return result.ok
        ? outcome(id, "Connected and Verified", true, true, result.message)
        : outcome(id, "Error", false, true, result.message);
    }

    case "stripe": {
      const state = getBillingState(
        { STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET },
        mode
      );
      if (state !== "connected") {
        return outcome(
          id,
          state === "configuration_required" ? "Configuration Required" : "Not Connected",
          false,
          false,
          "Stripe is not fully configured (STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET are both required) — no verification call was made."
        );
      }
      const retrieve =
        deps.stripeRetrieveAccount ??
        (async () => {
          const { getStripeClient } = await import("@/lib/billing/stripe-client");
          const stripe = getStripeClient();
          if (!stripe) throw new Error("Stripe client unavailable");
          const account = await stripe.accounts.retrieve();
          return { id: account.id };
        });
      try {
        const account = await retrieve();
        return outcome(id, "Connected and Verified", true, true,
          `Stripe accepted the secret key (account ${account.id}).`);
      } catch (err) {
        return outcome(id, "Error", false, true,
          `Stripe rejected the verification call: ${err instanceof Error ? err.message : "unknown error"}. Check STRIPE_SECRET_KEY.`);
      }
    }

    case "openai": {
      if (!isConfiguredValue(env.OPENAI_API_KEY)) {
        return outcome(id, "Not Connected", false, false,
          "OPENAI_API_KEY is not set — no verification call was made.");
      }
      const check = await modelsListCheck({
        fetchFn,
        url: "https://api.openai.com/v1/models",
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        providerLabel: "OpenAI",
      });
      return check.ok
        ? outcome(id, "Connected and Verified", true, true,
            "OpenAI accepted the API key (models list succeeded).")
        : outcome(id, "Error", false, true, check.message);
    }

    case "anthropic": {
      if (!isConfiguredValue(env.ANTHROPIC_API_KEY)) {
        return outcome(id, "Not Connected", false, false,
          "ANTHROPIC_API_KEY is not set — no verification call was made.");
      }
      const check = await modelsListCheck({
        fetchFn,
        url: "https://api.anthropic.com/v1/models",
        headers: {
          "x-api-key": env.ANTHROPIC_API_KEY as string,
          "anthropic-version": "2023-06-01",
        },
        providerLabel: "Anthropic",
      });
      return check.ok
        ? outcome(id, "Connected and Verified", true, true,
            "Anthropic accepted the API key (models list succeeded).")
        : outcome(id, "Error", false, true, check.message);
    }

    case "meta-model": {
      if (!isConfiguredValue(env.MODEL_API_KEY)) {
        return outcome(id, "Not Connected", false, false,
          "MODEL_API_KEY is not set — no verification call was made.", META_MODEL_NOTES);
      }
      const check = await modelsListCheck({
        fetchFn,
        url: "https://api.meta.ai/v1/models",
        headers: { Authorization: `Bearer ${env.MODEL_API_KEY}` },
        providerLabel: "Meta Model API",
      });
      return check.ok
        ? outcome(id, "Connected and Verified", true, true,
            "Meta Model API accepted the key (models list succeeded).", META_MODEL_NOTES)
        : outcome(id, "Error", false, true, check.message, META_MODEL_NOTES);
    }

    case "meta-pixel": {
      const configured = isPixelConfigured({
        NEXT_PUBLIC_META_PIXEL_ID: env.NEXT_PUBLIC_META_PIXEL_ID,
      });
      return outcome(
        id,
        configured ? "Connected but Not Verified" : "Not Connected",
        false,
        false,
        configured
          ? "A Pixel cannot be verified from the server — there is no verification API. Verify in Meta Events Manager → Test Events: load a marketing page with consent granted and confirm the PageView arrives (SETUP.md §8)."
          : "NEXT_PUBLIC_META_PIXEL_ID is not set to a numeric Pixel ID, so the loader renders nothing. Set it, redeploy, then verify in Meta Events Manager → Test Events."
      );
    }

    case "webhooks": {
      if (!deps.webhookConfigured || !deps.dispatchTestEvent) {
        return outcome(id, "Not Connected", false, false,
          "No enabled webhook subscription exists for this workspace — configure one in the Webhooks section first. No test event was sent.");
      }
      const delivery = await deps.dispatchTestEvent();
      if (delivery.status === "delivered") {
        return outcome(id, "Connected and Verified", true, true,
          "A signed nxtsend.test event was delivered to the configured endpoint and it answered 2xx.");
      }
      return outcome(id, "Error", false, true,
        `The nxtsend.test event could not be delivered (status: ${delivery.status}). See the delivery log in the Webhooks section for the receiver's response.`);
    }

    case "jobs": {
      const configured = isConfiguredValue(env.CRON_SECRET);
      return outcome(
        id,
        configured ? "Connected but Not Verified" : "Configuration Required",
        false,
        false,
        configured
          ? "There is no remote verification for the jobs worker. Smoke-test it: POST /api/jobs/run with header Authorization: Bearer <CRON_SECRET> — a 200 summary means the worker runs."
          : "CRON_SECRET is not set — the worker route refuses to run (503). Set it, then smoke-test /api/jobs/run."
      );
    }

    case "linkedin": {
      // No outbound call is possible — there is no provider to call.
      // The refusal wording comes from the ONE LinkedIn seam's
      // adapter (src/lib/linkedin), asked for a health check it
      // cannot perform live; its message is the Test Connection
      // result, verbatim.
      const adapter = new NotConfiguredLinkedInAdapter({
        env: {
          LINKEDIN_PROVIDER: env.LINKEDIN_PROVIDER,
          LINKEDIN_PROVIDER_API_KEY: env.LINKEDIN_PROVIDER_API_KEY,
        },
        mode,
      });
      const refusal = await adapter.sendMessage({
        accountId: "test-connection",
        leadId: "test-connection",
        body: "",
      });
      return outcome(
        id,
        "Configuration Required",
        false,
        false,
        refusal.ok
          ? "No LinkedIn provider is configured — there is nothing to verify against."
          : refusal.message
      );
    }

    case "muse-ai":
      return outcome(id, "Unsupported / No Documented API", false, false,
        "No documented public API exists for the Muse agent — there is nothing to verify against. The Connector Platform path (NxtSend as the API provider) is documented on this page.");

    case "google-sheets":
    case "crm":
    case "email-verification":
      return outcome(id, "Not Connected", false, false,
        "Not implemented yet: no adapter exists in the codebase, so there is nothing to verify. See the detail page for what implementation requires.");

    default:
      return null;
  }
}
