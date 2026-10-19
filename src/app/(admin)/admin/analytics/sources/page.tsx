"use client";

import * as React from "react";
import { AdminPageHeader } from "@/components/admin/AdminBits";

/**
 * Admin → Analytics → Traffic Sources. HONEST STATE: same root cause
 * as Website Visitors — no analytics provider is connected and the
 * app records no referrer/UTM data for signups, so a sources
 * breakdown cannot be produced from real data. Rather than render
 * invented channel percentages, this page documents the gap and the
 * two ways it can be closed.
 */
export default function AdminSourcesPage() {
  return (
    <div className="space-y-6 pb-14 max-w-4xl">
      <AdminPageHeader
        title="Traffic Sources"
        description="Where visitors and signups come from. Not measurable today: no analytics provider is connected, and signup records carry no referrer or UTM attribution."
        badge="No data source"
      />

      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">Why this page is empty (on purpose)</h2>
        <p className="text-13 text-black-300">
          A traffic-sources report needs one of two data feeds, and this
          deployment has neither:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-13 text-black-300">
          <li>
            <strong className="text-black-100">An analytics provider</strong>{" "}
            (Plausible / PostHog / GA4) measuring sessions by referrer — not
            integrated; its data would also live in the provider, like the
            Meta Pixel&rsquo;s does.
          </li>
          <li>
            <strong className="text-black-100">First-party attribution</strong>{" "}
            — capturing UTM parameters and referrer at signup into the
            profiles/workspaces records. This is buildable in-product (a
            small capture on the signup page + columns + this report) and is
            the recommended path if channel-level signup attribution is
            wanted without a third-party analytics dependency.
          </li>
        </ul>
        <p className="text-13 text-black-400">
          Until one of those exists, any percentages shown here would be
          invented — so none are.
        </p>
      </div>
    </div>
  );
}
