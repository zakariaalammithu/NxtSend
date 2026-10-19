"use client";

import * as React from "react";
import Link from "next/link";
import { AdminIntegrationView } from "@/components/admin/AdminIntegrationView";

/**
 * Admin → Integrations → Muse.ai Integration.
 *
 * Research verdict (deep research, 2026-10-18/19): muse.ai today is
 * Meta Platforms' "Muse" personal AI agent. There is NO public API
 * for driving a user's Muse agent, so no such integration can be
 * built — and none is claimed. Two real paths exist and both are
 * prepared in the codebase:
 *   1. Muse Connector Platform — NxtSend exposes its own API / hosted
 *      MCP server and submits for Meta's review (readiness pack in
 *      src/lib/muse-connector: tool manifest, adapter interface,
 *      submission checklist).
 *   2. Meta Model API — already implemented as the "meta" AI
 *      provider (see AI Providers), for NxtSend's own AI features.
 * The status below therefore stays "Unsupported / No Documented API"
 * for the agent-integration reading — permanently, until Meta
 * publishes an agent API.
 */
export default function AdminMuseAiPage() {
  return (
    <AdminIntegrationView
      title="Muse.ai Integration"
      description="Connection between NxtSend and Meta's Muse agent. Researched thoroughly: there is no documented public API to drive a user's Muse agent, so this integration is prepared-for, not implemented — and it will never be labelled connected without one."
      integrationIds={["muse-ai"]}
    >
      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">What the owner must obtain</h2>
        <ul className="list-disc pl-5 space-y-2 text-13 text-black-300">
          <li>
            A decision on the Connector Platform path: NxtSend must expose a
            public API or hosted MCP server of its own, then submit it for
            Meta&rsquo;s connector review (business verification and a
            data-processing questionnaire are part of that process).
          </li>
          <li>
            Or, if Meta publishes an agent API in future: official developer
            documentation + credentials. The adapter interface in{" "}
            <span className="font-mono">src/lib/muse-connector</span> is where
            it would be implemented; the Integration Center detail page lists
            exactly which files change.
          </li>
        </ul>
        <Link
          href="/dashboard/integrations/muse-ai"
          className="inline-block text-13 font-semibold text-purple-400 hover:text-purple-300"
        >
          Open the full Muse.ai readiness page (tool manifest + checklist) →
        </Link>
      </div>
    </AdminIntegrationView>
  );
}
