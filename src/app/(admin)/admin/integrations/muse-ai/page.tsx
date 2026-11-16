"use client";

import * as React from "react";
import Link from "next/link";
import { AdminIntegrationView } from "@/components/admin/AdminIntegrationView";
import {
  ErrorState,
  LoadingState,
  fmtDateTime,
  useAdminFetch,
} from "@/components/admin/AdminBits";

interface AdminMuseStats {
  mode: string;
  mcpEnabled: boolean;
  publicUrl: string | null;
  chatgptMcpEnabled?: boolean;
  chatgptPublicUrl?: string | null;
  /** null = unknown (migration 023 tables could not be read). */
  grantCount: number | null;
  /** Active grants split by client origin; null = unknown. */
  grantsByOrigin?: { muse: number; chatgpt: number; other: number; total: number } | null;
  toolCounts: { tool: string; calls: number }[];
  recentErrors: { action: string; resource: string | null; details: string; created_at: string }[];
  recentEvents: { action: string; resource: string | null; details: string; created_at: string }[];
  note?: string;
}

/**
 * Live admin panels for the Muse connector (GET /api/admin/muse,
 * behind resolveAdminGate). Grant count, MCP tool-call counts from
 * the audit log, and recent Muse errors — metadata only, never
 * token/secret material.
 */
function AdminMusePanels() {
  const { data, error, loading, reload } = useAdminFetch<AdminMuseStats>(
    "/api/admin/muse"
  );

  if (loading) return <LoadingState label="Loading Muse stats…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const totalCalls = data.toolCounts.reduce((sum, t) => sum + t.calls, 0);

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">Live overview</h2>
        {data.note && <p className="text-13 text-black-300 leading-relaxed">{data.note}</p>}
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <dt className="text-12 text-black-400">Muse MCP surface</dt>
            <dd className="text-14 font-semibold text-white mt-0.5">
              {data.mcpEnabled ? "Enabled" : "Disabled"}
            </dd>
            <dd className="text-12 text-black-400 break-all mt-0.5">
              {data.publicUrl ?? "No public URL set"}
            </dd>
          </div>
          <div>
            <dt className="text-12 text-black-400">ChatGPT MCP surface</dt>
            <dd className="text-14 font-semibold text-white mt-0.5">
              {data.chatgptMcpEnabled === undefined
                ? "Unknown"
                : data.chatgptMcpEnabled
                  ? "Enabled"
                  : "Disabled"}
            </dd>
            <dd className="text-12 text-black-400 break-all mt-0.5">
              {data.chatgptPublicUrl ?? "No public URL set"}
            </dd>
          </div>
          <div>
            <dt className="text-12 text-black-400">Active grants (platform-wide)</dt>
            <dd className="text-14 font-semibold text-white mt-0.5">
              {data.grantCount === null ? "Unknown" : String(data.grantCount)}
            </dd>
            <dd className="text-12 text-black-400 mt-0.5">
              {data.grantCount === null
                ? "Migration 023 tables could not be read."
                : "Distinct client + user pairs with a live refresh token."}
            </dd>
          </div>
          <div>
            <dt className="text-12 text-black-400">MCP tool calls (audit log, latest 1,000 Muse entries)</dt>
            <dd className="text-14 font-semibold text-white mt-0.5">{totalCalls}</dd>
            <dd className="text-12 text-black-400 mt-0.5">
              {data.toolCounts.length === 0
                ? "No Muse tool calls recorded yet."
                : `${data.toolCounts.length} tool(s) used.`}
            </dd>
          </div>
        </dl>
      </div>

      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">Grants by client origin</h2>
        <p className="text-12 text-black-400 leading-relaxed">
          Active grants split by the client that holds them — Muse, ChatGPT, or Other
          (a client whose origin cannot be determined, e.g. a loopback-only test client).
          Classified by client identity (CIMD URL origin / registered redirect URI), with the
          grant&apos;s scope prefix as fallback. A ChatGPT grant is one whose client is ChatGPT;
          counting by origin is what lets the ChatGPT Integration Center entry show
          &ldquo;Connected&rdquo; only for a real ChatGPT grant.
        </p>
        {!data.grantsByOrigin ? (
          <p className="text-13 text-black-300 leading-relaxed">
            Unknown — migration 023 tables could not be read.
          </p>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {(
              [
                ["Muse", data.grantsByOrigin.muse],
                ["ChatGPT", data.grantsByOrigin.chatgpt],
                ["Other", data.grantsByOrigin.other],
                ["Total", data.grantsByOrigin.total],
              ] as const
            ).map(([label, count]) => (
              <div key={label}>
                <dt className="text-12 text-black-400">{label}</dt>
                <dd className="text-14 font-semibold text-white mt-0.5">{count}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">Tool-call counts</h2>
        {data.toolCounts.length === 0 ? (
          <p className="text-13 text-black-300 leading-relaxed">
            No MCP tool calls in the audit log yet. Calls appear here once a Muse grant is used.
          </p>
        ) : (
          <div className="divide-y divide-black-700/60">
            {data.toolCounts.map((t) => (
              <div key={t.tool} className="flex items-center justify-between gap-3 py-2">
                <code className="font-mono text-13 text-white">{t.tool}</code>
                <span className="text-13 font-semibold text-black-200">{t.calls}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">Recent Muse errors</h2>
        <p className="text-12 text-black-400 leading-relaxed">
          Muse audit entries whose detail mentions a failure, error, denial or refusal, plus
          OAuth denies. This is a text match over audit details — audit rows carry no structured
          error flag.
        </p>
        {data.recentErrors.length === 0 ? (
          <p className="text-13 text-black-300 leading-relaxed">
            No Muse errors in the recent audit entries.
          </p>
        ) : (
          <div className="divide-y divide-black-700/60">
            {data.recentErrors.map((e, i) => (
              <div key={`${e.created_at}-${e.action}-${i}`} className="py-2.5 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-12 text-white">{e.action}</code>
                  {e.resource && (
                    <span className="font-mono text-11 text-black-400 break-all">{e.resource}</span>
                  )}
                  <span className="text-11 text-black-500">{fmtDateTime(e.created_at)}</span>
                </div>
                {e.details && <p className="text-12 text-black-300 leading-relaxed">{e.details}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">Recent Muse events</h2>
        {data.recentEvents.length === 0 ? (
          <p className="text-13 text-black-300 leading-relaxed">
            No Muse audit entries yet.
          </p>
        ) : (
          <div className="divide-y divide-black-700/60">
            {data.recentEvents.map((e, i) => (
              <div key={`${e.created_at}-${e.action}-${i}`} className="py-2.5 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-12 text-white">{e.action}</code>
                  {e.resource && (
                    <span className="font-mono text-11 text-black-400 break-all">{e.resource}</span>
                  )}
                  <span className="text-11 text-black-500">{fmtDateTime(e.created_at)}</span>
                </div>
                {e.details && <p className="text-12 text-black-300 leading-relaxed">{e.details}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Admin → Integrations → Muse.ai Integration.
 *
 * The Muse Connector Platform path is IMPLEMENTED in this codebase:
 * NxtSend is the server — it exposes an OAuth 2.1 server
 * (src/lib/muse-connector/oauth/, migration 023) and a hosted MCP
 * server (src/app/api/mcp/, 18 tools) that Muse calls into. It has
 * NOT been submitted to Meta and is NOT approved, so it does not
 * appear in Muse's connector directory. There is still no public API
 * for driving a user's Muse agent — this entry must never be
 * labelled connected without a real OAuth grant, and the live panels
 * below show the real grant/tool counts (or honest zeros).
 */
export default function AdminMuseAiPage() {
  return (
    <AdminIntegrationView
      title="Muse.ai Integration"
      description="Connection between NxtSend and Meta's Muse agent. The Connector Platform surface (OAuth 2.1 + MCP server) is implemented and testable as a Custom Connector — but it has not been submitted to Meta and is not approved. A 'Connected' status comes only from a real OAuth grant, never from configuration alone."
      integrationIds={["muse-ai"]}
    >
      <AdminMusePanels />
      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">What the owner must obtain</h2>
        <ul className="list-disc pl-5 space-y-2 text-13 text-black-300">
          <li>
            A decision on the Connector Platform submission: the surface
            is implemented (OAuth 2.1 + MCP, migration 023); submitting
            it at muse.ai/platform for Meta&rsquo;s review — business
            verification and a data-processing questionnaire are part of
            that process — is still an owner step, and has not been done.
          </li>
          <li>
            LinkedIn-send tools stay unsupported: no authorized LinkedIn
            provider exists, and the official LinkedIn API exposes no
            connection-request/DM endpoints to standard developers.
          </li>
          <li>
            ChatGPT grants are listed in the same overview above
            (&ldquo;Grants by client origin&rdquo;) and on the{" "}
            <Link
              href="/dashboard/integrations/chatgpt"
              className="font-semibold text-purple-400 hover:text-purple-300"
            >
              ChatGPT Integration Center page
            </Link>{" "}
            — the ChatGPT MCP surface (/api/mcp/chatgpt, 54 tools) shares
            the same OAuth tables (migrations 023 + 024) and has not
            been submitted to OpenAI.
          </li>
        </ul>
        <Link
          href="/dashboard/integrations/muse-ai"
          className="inline-block text-13 font-semibold text-purple-400 hover:text-purple-300"
        >
          Open the full Muse.ai page (endpoints, scopes, grants, activity) →
        </Link>
      </div>
    </AdminIntegrationView>
  );
}
