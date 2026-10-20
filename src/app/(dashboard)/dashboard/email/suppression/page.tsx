"use client";

/**
 * Suppression list — workspace management surface (P5 Stage C).
 *
 * The list itself is enforced server-side before every send
 * (fail-closed: if the check cannot run, the send is refused). This
 * page is only the management surface over GET/POST/DELETE
 * /api/email/suppressions:
 *  - entries arrive here from the provider webhook (bounces, spam
 *    complaints), from the public one-click unsubscribe endpoint, and
 *    from manual adds on this page;
 *  - manual add takes an email + a reason category;
 *  - remove asks for confirmation and warns that removing an address
 *    RE-ENABLES sending to it.
 *
 * In Demo Mode the API serves the demo store — the same store the
 * demo unsubscribe endpoint writes to and the demo executor reads —
 * and the page says so.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ban, Search, Trash2 } from "lucide-react";
import { suppressionSourceLabel, type SuppressionEntry } from "@/lib/email/suppression-store";

const REASON_OPTIONS = [
  { value: "unsubscribed (manual)", label: "Unsubscribed" },
  { value: "bounced (manual)", label: "Bounced" },
  { value: "spam complaint (manual)", label: "Spam complaint" },
  { value: "manual block", label: "Manual block" },
];

export default function SuppressionPage() {
  const [entries, setEntries] = useState<SuppressionEntry[]>([]);
  const [mode, setMode] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [reason, setReason] = useState(REASON_OPTIONS[0].value);
  const [adding, setAdding] = useState(false);

  const [query, setQuery] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/email/suppressions");
      const body = (await res.json()) as {
        entries?: SuppressionEntry[];
        mode?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setEntries(body.entries ?? []);
      setMode(body.mode ?? "");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the suppression list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = query.trim()
    ? entries.filter((e) => e.email.includes(query.trim().toLowerCase()))
    : entries;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/email/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), reason }),
      });
      const body = (await res.json()) as { created?: boolean; error?: string };
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setNotice(
        body.created
          ? `${email.trim().toLowerCase()} added — sends to this address are now refused.`
          : `${email.trim().toLowerCase()} was already on the suppression list.`
      );
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add the address.");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(address: string) {
    setRemoving(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/email/suppressions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address }),
      });
      const body = (await res.json()) as { removed?: boolean; error?: string };
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setNotice(
        body.removed
          ? `${address} removed — sending to this address is allowed again.`
          : `${address} was not on the list.`
      );
      setConfirmRemove(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove the address.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="suppression-page">
      <div>
        <Link
          href="/dashboard/email"
          className="inline-flex items-center gap-1.5 text-13 font-medium text-black-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Email
        </Link>
        <h1 className="mt-2 flex items-center gap-2.5 text-22 font-bold text-white">
          <Ban className="h-5 w-5 text-rose-300" /> Suppression list
        </h1>
        <p className="mt-1.5 max-w-2xl text-13 leading-relaxed text-black-400">
          Email to these addresses is refused before any send — checked
          on every campaign step and inbox reply, and if the check
          itself cannot run the send is refused (fail closed). Bounces
          and spam complaints are added automatically by the provider
          webhook; unsubscribes land here from the one-click
          unsubscribe link in every outgoing email.
        </p>
        {mode === "demo" && (
          <p className="mt-2 inline-block rounded-full bg-amber-500/15 px-2.5 py-1 text-12 font-medium text-amber-300">
            Demo Mode — this is the demo suppression store; the demo
            unsubscribe endpoint and demo sequence runner use this same
            list.
          </p>
        )}
      </div>

      <section className="glass-card p-5">
        <h2 className="text-14 font-semibold text-white">Add an address</h2>
        <form onSubmit={handleAdd} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-12 font-medium text-black-400">Email address</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@example.com"
              className="w-72 max-w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-12 font-medium text-black-400">Reason</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-violet-400/50 focus:outline-none"
            >
              {REASON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-black-900">
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={adding} className="btn-primary !py-2 !px-4 text-13">
            {adding ? "Adding…" : "Add to suppression list"}
          </button>
        </form>
      </section>

      {error && (
        <p className="rounded-lg border border-red-400/25 bg-red-400/5 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-emerald-400/25 bg-emerald-400/5 px-3 py-2 text-sm text-emerald-200">
          {notice}
        </p>
      )}

      <section className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-14 font-semibold text-white">
            Suppressed addresses{" "}
            <span className="text-black-400">
              ({visible.length}
              {query.trim() ? ` of ${entries.length}` : ""})
            </span>
          </h2>
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-black-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search addresses…"
              className="w-60 max-w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-8 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
            />
          </label>
        </div>

        {loading ? (
          <p className="mt-4 text-13 text-black-400">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="mt-4 text-13 text-black-400">
            {entries.length === 0
              ? "No addresses are suppressed in this workspace yet."
              : "No suppressed address matches your search."}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-13">
              <thead>
                <tr className="border-b border-white/8 text-12 uppercase tracking-wide text-black-500">
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">Reason</th>
                  <th className="py-2 pr-4 font-medium">Source</th>
                  <th className="py-2 pr-4 font-medium">Added</th>
                  <th className="py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => (
                  <tr key={entry.id} className="border-b border-white/5">
                    <td className="py-2.5 pr-4 font-medium text-white">{entry.email}</td>
                    <td className="py-2.5 pr-4 text-black-300">{entry.reason || "—"}</td>
                    <td className="py-2.5 pr-4 text-black-300">
                      {suppressionSourceLabel(entry.reason)}
                    </td>
                    <td className="py-2.5 pr-4 text-black-400">
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                    <td className="py-2.5">
                      {confirmRemove === entry.email ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-12 text-amber-300">
                            Removing re-enables sending to this address.
                          </span>
                          <button
                            type="button"
                            disabled={removing}
                            onClick={() => void handleRemove(entry.email)}
                            className="rounded-lg bg-rose-500/90 px-2.5 py-1 text-12 font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                          >
                            {removing ? "Removing…" : "Confirm remove"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemove(null)}
                            className="rounded-lg bg-white/5 px-2.5 py-1 text-12 font-medium text-black-200 hover:bg-white/10"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmRemove(entry.email)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1 text-12 font-medium text-black-200 hover:bg-white/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
