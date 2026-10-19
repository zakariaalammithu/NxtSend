"use client";

import * as React from "react";
import { AdminPageHeader, ModeNote, useAdminFetch } from "@/components/admin/AdminBits";
import type { IntegrationStatusEntry } from "@/lib/integrations-center/types";

interface StatusResponse {
  mode: string;
  integrations: IntegrationStatusEntry[];
}

/**
 * Admin → Analytics → Website Visitors. HONEST STATE: NxtSend has no
 * analytics data source. The only traffic measurement prepared is
 * the Meta Pixel (consent-gated pageviews), whose data lives in Meta
 * Events Manager — not in this database — and no analytics provider
 * (Plausible/GA/PostHog) is integrated. This page therefore shows
 * the Pixel's real configuration state and what connecting a
 * provider would enable. It will never show invented visitor charts.
 */
export default function AdminVisitorsPage() {
  const { data } = useAdminFetch<StatusResponse>("/api/integrations/status");
  const pixel = data?.integrations.find((i) => i.descriptor.id === "meta-pixel");

  return (
    <div className="space-y-6 pb-14 max-w-4xl">
      <AdminPageHeader
        title="Website Visitors"
        description="Marketing-site traffic measurement. No analytics provider is connected to this deployment, so there is no visitor data to show — and none is fabricated."
        badge="No data source"
      />

      {data && <ModeNote mode={data.mode} />}

      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">Meta Pixel — the one prepared channel</h2>
        <p className="text-13 text-black-300">
          Status:{" "}
          <strong className="text-black-100">{pixel ? pixel.status : "…"}</strong>
          {pixel ? ` — ${pixel.statusMessage}` : ""}
        </p>
        <p className="text-13 text-black-400">
          When a Pixel ID is configured, the marketing site fires consent-gated
          PageView events (plus signup/trial/subscribe conversions). The
          resulting numbers live in Meta Events Manager / Ads Manager — Meta
          does not provide an API for this app to read them back into this
          page, so visitor reporting stays in Meta&rsquo;s own tools.
        </p>
      </div>

      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">What a real visitors page needs</h2>
        <ul className="list-disc pl-5 space-y-2 text-13 text-black-300">
          <li>An analytics provider account (e.g. Plausible, PostHog, or GA4) added to the marketing site.</li>
          <li>Its read API credentials stored server-side, with an adapter in the Integration Center registry.</li>
          <li>Consent handling consistent with the Pixel&rsquo;s existing consent gate.</li>
        </ul>
        <p className="text-13 text-black-400">
          Until then, registration growth (which this platform DOES measure
          from its own database) is under Analytics → User Growth.
        </p>
      </div>
    </div>
  );
}
