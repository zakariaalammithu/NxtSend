/**
 * Resolves the public app URL for Stripe return/redirect URLs.
 *
 * Production rule (brief §9.11 — no localhost dependence): when
 * NODE_ENV is "production", NEXT_PUBLIC_APP_URL must be set to a real
 * public origin. An unset value, a placeholder, or an explicit
 * localhost URL is a configuration ERROR — the billing routes refuse
 * (503) instead of sending the customer's browser to localhost.
 *
 * Development keeps the historical convenience: unset → localhost.
 */
import { isConfiguredValue } from "@/lib/env";

export type AppUrlResolution = { url: string } | { error: string };

export function resolveAppUrl(): AppUrlResolution {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const isProduction = process.env.NODE_ENV === "production";

  if (isConfiguredValue(raw)) {
    let hostname = "";
    try {
      hostname = new URL(raw as string).hostname;
    } catch {
      return {
        error: `NEXT_PUBLIC_APP_URL is not a valid URL ("${raw}"). Set it to the public origin of this deployment.`,
      };
    }
    if (isProduction && (hostname === "localhost" || hostname === "127.0.0.1")) {
      return {
        error:
          "NEXT_PUBLIC_APP_URL points at localhost in a production build. Set it to the public origin (e.g. https://your-domain) in Vercel → Project → Settings → Environment Variables.",
      };
    }
    return { url: (raw as string).replace(/\/+$/, "") };
  }

  if (isProduction) {
    return {
      error:
        "NEXT_PUBLIC_APP_URL is not configured. Billing redirects require the public origin of this deployment — set NEXT_PUBLIC_APP_URL in Vercel → Project → Settings → Environment Variables.",
    };
  }
  return { url: "http://localhost:3000" };
}
