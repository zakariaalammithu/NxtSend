"use client";

/**
 * Shared shell for the Stage 6 provider panels (communication +
 * productivity). Panels are NOT wired into any page — the
 * coordinator wires them in. They take their state as props and
 * never fetch, never claim a live connection: the status shown is
 * whatever the caller passes in (from the stored connection state
 * via checkProviderHealth).
 */

export type ProviderPanelStatus =
  | "connected"
  | "disconnected"
  | "configuration_required"
  | "credentials_missing"
  | "error"
  | "coming_soon";

export interface ProviderPanelShellProps {
  name: string;
  tagline: string;
  status: ProviderPanelStatus;
  configured: boolean;
  missing: string[];
  capabilities: string[];
  setupSteps: string[];
  docsUrl: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  testId: string;
}

const STATUS_BADGE: Record<ProviderPanelStatus, { label: string; cls: string }> = {
  connected: { label: "Connected", cls: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30" },
  disconnected: { label: "Not connected", cls: "bg-slate-400/10 text-slate-300 ring-slate-400/30" },
  configuration_required: { label: "Configuration required", cls: "bg-amber-400/10 text-amber-300 ring-amber-400/30" },
  credentials_missing: { label: "Credentials missing", cls: "bg-amber-400/10 text-amber-300 ring-amber-400/30" },
  error: { label: "Error", cls: "bg-red-400/10 text-red-300 ring-red-400/30" },
  coming_soon: { label: "Coming soon", cls: "bg-slate-400/10 text-slate-300 ring-slate-400/30" },
};

export default function ProviderPanelShell({
  name,
  tagline,
  status,
  configured,
  missing,
  capabilities,
  setupSteps,
  docsUrl,
  lastSyncAt,
  lastError,
  testId,
}: ProviderPanelShellProps) {
  const badge = STATUS_BADGE[status];
  return (
    <section className="glass-card p-6" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold text-white">{name}</h3>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${badge.cls}`}>
          {badge.label}
        </span>
      </div>
      <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-400">{tagline}</p>

      {!configured && missing.length > 0 && (
        <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-sm text-amber-200">
          Configuration required — missing: {missing.join(", ")}.
        </p>
      )}
      {lastError && (
        <p className="mt-3 rounded-lg border border-red-400/25 bg-red-400/5 px-3 py-2 text-sm text-red-200">
          Last error: {lastError}
        </p>
      )}
      {lastSyncAt && (
        <p className="mt-3 text-xs text-slate-500">Last sync {new Date(lastSyncAt).toLocaleString()}</p>
      )}

      <h4 className="mt-4 text-sm font-semibold text-white">What it does</h4>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-slate-400">
        {capabilities.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>

      <h4 className="mt-4 text-sm font-semibold text-white">Setup</h4>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-slate-400">
        {setupSteps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>

      {docsUrl && (
        <p className="mt-4 text-xs">
          <a href={docsUrl} target="_blank" rel="noreferrer" className="text-violet-300 underline">
            Provider documentation
          </a>
        </p>
      )}
    </section>
  );
}
