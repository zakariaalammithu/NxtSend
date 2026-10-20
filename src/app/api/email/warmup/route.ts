/**
 * Email warm-up status — GET /api/email/warmup (P5 Stage E).
 *
 * Feeds the Warm-up page under Email. Warm-up is operated entirely by
 * the external provider (Instantly); this route returns ONLY what
 * Instantly's API reports for the operator's mailboxes:
 *
 *  - Demo Mode: NO provider call and NO simulated data — the payload
 *    is the honest Unavailable state with the demo label.
 *  - Live, no key: the same Unavailable state (not_connected /
 *    configuration_required) — again with zero provider-shaped data.
 *  - Live, key set: the adapter's provider-reported report (mailboxes,
 *    provider-set limits/ramp, provider analytics). A provider failure
 *    returns state "error" with the provider's own message.
 *
 * Same guards as the other workspace APIs (resolveCenterContext).
 * The response never contains the API key — presence/state only.
 */

import { NextResponse } from "next/server";
import { resolveCenterContext } from "@/lib/integrations-center/server";
import { createWarmupAdapter } from "@/lib/warmup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDER_INFO = {
  provider: "instantly",
  providerLabel: "Instantly",
  docsUrl: "https://developer.instantly.ai/",
  signupUrl: "https://instantly.ai/pricing",
  envVars: ["INSTANTLY_API_KEY"],
  pricingNote:
    "Warm-up is included with Instantly's Outreach plans. Entry point: Growth — $47/month, or $37.60/month billed annually (unlimited accounts + unlimited warm-up; API access included). A 14-day free trial is offered.",
};

export async function GET() {
  const ctx = await resolveCenterContext();
  if (!ctx.ok) return ctx.response;

  const adapter = createWarmupAdapter();
  const state = adapter.getState();

  if (state !== "connected") {
    // Unavailable — honestly. No provider call is made in demo mode or
    // without credentials, and no warm-up data is fabricated.
    return NextResponse.json({
      mode: ctx.mode,
      available: false,
      state,
      message:
        state === "demo"
          ? "Demo Mode: no Instantly provider is connected, so warm-up is Unavailable. NxtSend never simulates a running warm-up."
          : state === "configuration_required"
            ? "INSTANTLY_API_KEY is present but still a placeholder value. Warm-up is Unavailable until the real Instantly API key is set."
            : "Unavailable — provider not connected: set INSTANTLY_API_KEY (Instantly → Settings → Integrations → API, accounts:read scope) to read warm-up status from Instantly.",
      ...PROVIDER_INFO,
      report: null,
    });
  }

  const result = await adapter.getWarmupStatus();
  if (!result.ok) {
    return NextResponse.json({
      mode: ctx.mode,
      available: false,
      state: result.state,
      message: result.message,
      ...PROVIDER_INFO,
      report: null,
    });
  }

  return NextResponse.json({
    mode: ctx.mode,
    available: true,
    state: "connected",
    message: "Warm-up status as reported by Instantly.",
    ...PROVIDER_INFO,
    report: result.report,
  });
}
