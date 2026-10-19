"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  FlaskConical,
  Puzzle,
} from "lucide-react";
import { DemoBanner, Badge } from "@/components/ui";
import {
  INTEGRATION_ICONS,
  STATUS_BADGE_VARIANT,
} from "@/components/dashboard/IntegrationCenterBits";
import type {
  IntegrationStatusEntry,
  VerifyOutcome,
} from "@/lib/integrations-center/types";
import {
  NXTSEND_TOOL_MANIFEST,
  MUSE_READINESS_CHECKLIST,
  MUSE_CONNECTOR_MANIFEST_STATUS,
} from "@/lib/muse-connector";

/**
 * Integration Center detail page — one dynamic route driven entirely
 * by the registry + status API. Shows: overview, capabilities, the
 * required env vars (names + presence only, never values), setup
 * steps, webhook configuration where the provider calls NxtSend, a
 * Test Connection action wired to POST /api/integrations/[id]/verify
 * with the result rendered verbatim, disconnect guidance, and
 * troubleshooting. The Muse.ai page additionally renders the
 * research-based readiness pack (tool manifest + checklist).
 */

interface StatusResponse {
  mode: "demo" | "supabase";
  integrations: IntegrationStatusEntry[];
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-card p-6 space-y-3">
      <h2 className="text-16 font-bold text-white">{title}</h2>
      {children}
    </section>
  );
}

export default function IntegrationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [data, setData] = React.useState<StatusResponse | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [origin, setOrigin] = React.useState("");
  const [verifyBusy, setVerifyBusy] = React.useState(false);
  const [verifyResult, setVerifyResult] = React.useState<VerifyOutcome | null>(null);
  const [verifyError, setVerifyError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/status");
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Status request failed (HTTP ${res.status})`);
      }
      setData((await res.json()) as StatusResponse);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load integration status.");
    }
  }, []);

  React.useEffect(() => {
    setOrigin(window.location.origin);
    void load();
  }, [load]);

  const entry = data?.integrations.find((e) => e.descriptor.id === id) ?? null;

  const runVerify = async () => {
    setVerifyBusy(true);
    setVerifyError(null);
    try {
      const res = await fetch(`/api/integrations/${id}/verify`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | (VerifyOutcome & { persisted?: boolean })
        | { error?: string }
        | null;
      if (!res.ok) {
        throw new Error(
          (body as { error?: string } | null)?.error ??
            `Verification request failed (HTTP ${res.status})`
        );
      }
      setVerifyResult(body as VerifyOutcome);
      // Refresh statuses so a persisted verification is reflected.
      void load();
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setVerifyBusy(false);
    }
  };

  if (loadError) {
    return (
      <div className="space-y-6 pb-14">
        <BackLink />
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
          <p className="text-13 text-rose-200">{loadError}</p>
        </div>
      </div>
    );
  }

  if (data && !entry) {
    return (
      <div className="space-y-6 pb-14">
        <BackLink />
        <div className="glass-card p-8 text-center space-y-2">
          <h1 className="text-20 font-bold text-white">Unknown integration</h1>
          <p className="text-13 text-black-300">
            No integration with the id “{id}” exists in the Integration Center registry.
          </p>
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="space-y-6 pb-14" aria-busy="true">
        <BackLink />
        <div className="glass-card p-6 animate-pulse space-y-3">
          <div className="h-8 w-1/2 rounded bg-black-700" />
          <div className="h-4 w-2/3 rounded bg-black-800" />
          <div className="h-4 w-1/3 rounded bg-black-800" />
        </div>
      </div>
    );
  }

  const d = entry.descriptor;
  const Icon = INTEGRATION_ICONS[d.id] ?? Puzzle;
  const lastVerification = verifyResult
    ? {
        ok: verifyResult.ok,
        checkedAt: verifyResult.checkedAt,
        message: verifyResult.message,
      }
    : entry.lastVerification;

  return (
    <div className="space-y-6 pb-14">
      <BackLink />
      {data?.mode === "demo" && <DemoBanner feature={d.name} />}

      {/* Header */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-black-800 border border-black-700 text-purple-400">
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">{d.name}</h1>
            <Badge variant={STATUS_BADGE_VARIANT[verifyResult ? verifyResult.status : entry.status]}>
              {verifyResult ? verifyResult.status : entry.status}
            </Badge>
          </div>
          <p className="mt-1 text-14 text-black-300">{d.tagline}</p>
          <p className="mt-1 text-13 text-black-400">{entry.statusMessage}</p>
        </div>
      </div>

      {d.notImplementedNote && (
        <div className="rounded-xl border border-orange-500/30 bg-orange-950/20 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-orange-400 mt-0.5" />
          <p className="text-13 text-orange-200 leading-relaxed">{d.notImplementedNote}</p>
        </div>
      )}

      {/* Test Connection */}
      <Section title="Test Connection">
        <p className="text-13 text-black-300 leading-relaxed">
          {d.verifySupported
            ? "Runs one safe, read-only verification call against the provider using the server-side configuration. The result — success or failure — is shown verbatim below; a configured key alone never counts as verified."
            : "This integration has no server-side verification call. The button returns the exact reason and what to do instead — it never pretends to have verified anything."}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={runVerify}
            disabled={verifyBusy}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-60 px-4 py-2.5 text-13 font-semibold text-white transition-colors"
          >
            {verifyBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            {verifyBusy ? "Testing…" : "Test Connection"}
          </button>
          {lastVerification && (
            <span className="inline-flex items-center gap-1.5 text-12 text-black-300">
              {lastVerification.ok ? (
                <CheckCircle2 className="h-4 w-4 text-green-400" />
              ) : (
                <XCircle className="h-4 w-4 text-rose-400" />
              )}
              Last verification: {lastVerification.ok ? "passed" : "failed"} ·{" "}
              {new Date(lastVerification.checkedAt).toLocaleString()}
            </span>
          )}
        </div>
        {verifyError && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3.5 text-13 text-rose-200">
            {verifyError}
          </div>
        )}
        {verifyResult && (
          <div
            className={`rounded-xl border p-3.5 text-13 leading-relaxed ${
              verifyResult.ok
                ? "border-green-500/30 bg-green-950/20 text-green-200"
                : "border-black-600 bg-black-800/60 text-black-200"
            }`}
          >
            <p>
              <strong className="text-white">{verifyResult.status}</strong> — {verifyResult.message}
            </p>
            {verifyResult.notes && (
              <p className="mt-1.5 text-12 text-black-300">{verifyResult.notes}</p>
            )}
          </div>
        )}
        {!verifyResult && lastVerification && (
          <p className="text-12 text-black-400">{lastVerification.message}</p>
        )}
      </Section>

      {/* Overview */}
      <Section title="Overview">
        <p className="text-13 text-black-300 leading-relaxed">{d.description}</p>
        {d.docsUrl && (
          <a
            href={d.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-13 font-semibold text-purple-300 hover:text-white transition-colors"
          >
            Official documentation <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        {!d.docsUrl && (
          <p className="text-12 text-black-400">
            Internal surface — documented in SETUP.md (§10 and §14) in the repository root.
          </p>
        )}
      </Section>

      {/* Capabilities */}
      <Section title="Capabilities">
        <ul className="space-y-1.5">
          {d.capabilities.map((c) => (
            <li key={c} className="flex items-start gap-2 text-13 text-black-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-purple-400 mt-0.5" />
              <span className="leading-relaxed">{c}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Muse.ai readiness pack */}
      {d.id === "muse-ai" && <MuseReadinessPack />}

      {/* Environment variables */}
      {d.envVars.length > 0 && (
        <Section title="Required configuration (environment variables)">
          <p className="text-12 text-black-400 leading-relaxed">
            Set these in <strong className="text-black-200">Vercel → Project → Settings → Environment Variables</strong>{" "}
            (or <code className="font-mono text-black-200">.env.local</code> locally), then redeploy.
            Values are never displayed here — only whether each one is set.
          </p>
          <div className="divide-y divide-black-700/60">
            {d.envVars.map((v) => {
              const presence = entry.envPresence.find((p) => p.name === v.name);
              return (
                <div key={v.name} className="py-3 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-13 text-white">{v.name}</code>
                    <Badge variant={v.required ? "warning" : "gray"} size="sm">
                      {v.required ? "Required" : "Optional"}
                    </Badge>
                    <Badge variant={v.visibility === "public" ? "blue" : "purple"} size="sm">
                      {v.visibility === "public" ? "Public" : "Server-only"}
                    </Badge>
                    {presence &&
                      (presence.present ? (
                        <span className="inline-flex items-center gap-1 text-11 font-medium text-green-400">
                          <CheckCircle2 className="h-3 w-3" /> Set
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-11 font-medium text-black-400">
                          <XCircle className="h-3 w-3" /> Not set
                        </span>
                      ))}
                  </div>
                  <p className="text-12 text-black-400 leading-relaxed">{v.purpose}</p>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Setup steps */}
      <Section title="Setup steps">
        <ol className="space-y-2 list-none">
          {d.setupSteps.map((step, i) => (
            <li key={step} className="flex items-start gap-3 text-13 text-black-300">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-600/20 border border-purple-500/30 text-11 font-bold text-purple-300 mt-0.5">
                {i + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </Section>

      {/* Webhook configuration */}
      {d.webhook && (
        <Section title="Webhook configuration">
          <p className="text-13 text-black-300">
            Register this URL in the provider&apos;s dashboard:
          </p>
          <code className="block rounded-xl bg-black-800 border border-black-700 px-4 py-3 font-mono text-13 text-purple-200 break-all">
            {origin ? `${origin}${d.webhook.urlPath}` : d.webhook.urlPath}
          </code>
          <p className="text-12 text-black-400 leading-relaxed">{d.webhook.notes}</p>
        </Section>
      )}
      {d.id === "webhooks" && (
        <Section title="Webhook configuration">
          <p className="text-13 text-black-300 leading-relaxed">
            The subscription (receiver URL, events, signing secret) is configured in the{" "}
            <Link
              href="/dashboard/integrations#webhook-settings"
              className="font-semibold text-purple-300 hover:text-white transition-colors"
            >
              Outbound Webhooks section of the Integration Center
            </Link>
            . The signing secret is generated server-side and shown exactly once — to rotate it,
            save the subscription again and update your receiver.
          </p>
        </Section>
      )}

      {/* Disconnect / disable */}
      <Section title="Disconnect / disable">
        <p className="text-13 text-black-300 leading-relaxed">
          {d.id === "webhooks"
            ? "Disable the subscription toggle in the Outbound Webhooks section (deliveries stop immediately), or delete the subscription to remove it entirely. Past delivery logs are kept."
            : d.id === "muse-ai" || d.kind === "info"
              ? "Nothing is connected, so there is nothing to disconnect. This entry documents the limitation and what implementing it would require."
              : "Remove (or replace) the environment variables listed above in Vercel and redeploy. The status returns to Not Connected, and any stored verification stops applying because the configuration it verified is gone. No data is deleted by disconnecting."}
        </p>
      </Section>

      {/* Troubleshooting */}
      <Section title="Troubleshooting">
        <ul className="space-y-1.5">
          {d.troubleshooting.map((t) => (
            <li key={t} className="flex items-start gap-2 text-13 text-black-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-yellow-400 mt-0.5" />
              <span className="leading-relaxed">{t}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard/integrations"
      className="inline-flex items-center gap-1.5 text-13 font-semibold text-black-300 hover:text-white transition-colors"
    >
      <ArrowLeft className="h-4 w-4" /> Integration Center
    </Link>
  );
}

function MuseReadinessPack() {
  return (
    <>
      <Section title="The two real paths (from the 2026-10-19 research)">
        <div className="space-y-3 text-13 text-black-300 leading-relaxed">
          <p>
            <strong className="text-white">1 · Muse Connector Platform (this entry).</strong>{" "}
            The direction is inverted: NxtSend exposes its own API or hosted MCP server and submits
            it at <span className="font-mono text-black-100">muse.ai/platform</span>. Meta reviews
            it (functional / security / legal + end-to-end QA) and, if approved, it appears in
            Muse&apos;s connector directory. Auth is an API key or OAuth (PKCE) that{" "}
            <em>NxtSend issues</em>. There are no connector webhooks, no connector SDK, and no
            published fees or review timeline. A paid Muse plan is NOT required to submit.
          </p>
          <p>
            <strong className="text-white">2 · Meta Model API (separate entry).</strong> If what
            you want is Muse Spark <em>models</em> inside NxtSend, that exists today as a normal
            inference API — see the{" "}
            <Link
              href="/dashboard/integrations/meta-model"
              className="font-semibold text-purple-300 hover:text-white transition-colors"
            >
              Meta Model API
            </Link>{" "}
            entry. It does not give access to a user&apos;s Muse agent, its memory, or its
            connectors.
          </p>
          <p>
            <strong className="text-white">Not this product:</strong> the legacy muse.ai video
            platform rebranded to Skiv (skiv.com) in March 2026 — its API belongs to Skiv now.
          </p>
        </div>
      </Section>

      <Section title={`Tool manifest — pre-classified draft (${MUSE_CONNECTOR_MANIFEST_STATUS})`}>
        <p className="text-12 text-black-400 leading-relaxed">
          Classifications follow Meta&apos;s Connector guidelines: Read (no state change), Write
          (creates/changes), Sensitive write (irreversible/consequential — approval required every
          time, never “Always allow”). Approval at review covers only approved tools.
        </p>
        <div className="divide-y divide-black-700/60">
          {NXTSEND_TOOL_MANIFEST.map((tool) => (
            <div key={tool.name} className="py-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-13 text-white">{tool.name}</code>
                <Badge
                  variant={
                    tool.classification === "Read"
                      ? "blue"
                      : tool.classification === "Write"
                        ? "purple"
                        : "error"
                  }
                  size="sm"
                >
                  {tool.classification}
                </Badge>
              </div>
              <p className="text-12 text-black-300 leading-relaxed">{tool.description}</p>
              <p className="text-11 text-black-400">
                Inputs: {tool.inputs} · Side effects: {tool.sideEffects}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Submission readiness checklist — what the owner must obtain">
        <ol className="space-y-3 list-none">
          {MUSE_READINESS_CHECKLIST.map((item, i) => (
            <li key={item.id} className="flex items-start gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-600/20 border border-purple-500/30 text-11 font-bold text-purple-300 mt-0.5">
                {i + 1}
              </span>
              <div>
                <p className="text-13 font-semibold text-white">{item.title}</p>
                <p className="text-12 text-black-300 leading-relaxed mt-0.5">{item.detail}</p>
                <p className="text-11 text-black-500 mt-0.5">Source: {item.source}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-12 text-black-400 leading-relaxed pt-1">
          When access is obtained, the files that change are:{" "}
          <code className="font-mono text-black-200">src/lib/muse-connector/adapter.ts</code>{" "}
          (implement the hosted surface),{" "}
          <code className="font-mono text-black-200">src/lib/muse-connector/manifest.ts</code>{" "}
          (final JSON Schemas), the muse-ai registry/status source in{" "}
          <code className="font-mono text-black-200">src/lib/integrations-center/</code>, and
          SETUP.md §14 — no other part of the app needs to change.
        </p>
      </Section>
    </>
  );
}
