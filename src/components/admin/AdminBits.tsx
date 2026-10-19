"use client";

/**
 * Shared building blocks for Stage-D admin pages: a fetch hook with
 * loading/error state, page header, demo/live mode note, and the
 * standard loading / error / empty panels — so every admin page
 * presents honest states the same way.
 */

import * as React from "react";
import { AlertTriangle, Loader2, Shield } from "lucide-react";

export function useAdminFetch<T>(url: string, deps: unknown[] = []) {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [reloadKey, setReloadKey] = React.useState(0);

  const reload = React.useCallback(() => setReloadKey((k) => k + 1), []);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(url);
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
          throw new Error(
            typeof body.error === "string" ? body.error : `Request failed (${res.status})`
          );
        }
        if (!cancelled) setData(body as T);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, reloadKey, ...deps]);

  return { data, error, loading, reload };
}

export function AdminPageHeader({
  title,
  description,
  badge,
}: {
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">{title}</h1>
        {badge && <span className="demo-badge">{badge}</span>}
      </div>
      <p className="mt-1 text-14 text-black-300">{description}</p>
    </div>
  );
}

export function ModeNote({ mode }: { mode: "demo" | "supabase" | string }) {
  if (mode === "demo") {
    return (
      <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 p-4 text-rose-200 flex items-center gap-3">
        <Shield className="h-5 w-5 text-rose-400 shrink-0" />
        <p className="text-13">
          <strong>Demo Mode</strong> — showing the labelled demo dataset. Connect
          Supabase to see live platform data.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-4 text-emerald-200 flex items-center gap-3">
      <Shield className="h-5 w-5 text-emerald-400 shrink-0" />
      <p className="text-13">
        <strong>Live data</strong> — read from the production database through
        admin-gated API routes.
      </p>
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="glass-card p-10 flex items-center justify-center gap-3 text-black-300 text-14">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 px-5 py-4 text-13 text-rose-200 flex items-center justify-between gap-4">
      <span className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {message}
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-12 font-semibold text-rose-100 hover:bg-rose-500/10"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyStateBox({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="glass-card p-10 text-center">
      <p className="text-16 font-semibold text-white">{title}</p>
      <p className="mt-2 text-13 text-black-400 max-w-xl mx-auto">{message}</p>
    </div>
  );
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
