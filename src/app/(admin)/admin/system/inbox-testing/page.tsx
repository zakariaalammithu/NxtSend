"use client";

/**
 * Admin → System → Inbox Testing.
 *
 * Runs the REAL inbox reply path (Stage C): the threads below come
 * from GET /api/inbox/conversations for the signed-in admin's own
 * workspace, and "Send test reply" posts through
 * POST /api/inbox/conversations/[id]/reply with a fresh idempotency
 * key. The outcome shown is whatever the reply service recorded —
 * "simulated" in demo, "sent" only with a provider message ID in live
 * mode, or an honest refusal (not configured / suppressed / provider
 * error). Nothing here fabricates a delivery.
 */

import * as React from "react";
import { Button } from "@/components/ui";
import { AdminPageHeader, LoadingState } from "@/components/admin/AdminBits";

interface ThreadSummary {
  id: string;
  participant_name: string;
  channel?: string;
}

interface Outcome {
  kind: "ok" | "error";
  text: string;
}

export default function AdminInboxTestingPage() {
  const [threads, setThreads] = React.useState<ThreadSummary[] | null>(null);
  const [selectedId, setSelectedId] = React.useState("");
  const [content, setContent] = React.useState(
    "Admin inbox test — this reply exercises the real reply service end to end."
  );
  const [running, setRunning] = React.useState(false);
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/inbox/conversations", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error ?? `Request failed (${res.status})`);
        }
        if (!cancelled) {
          const list = (json.conversations ?? []) as ThreadSummary[];
          setThreads(list);
          if (list.length > 0) setSelectedId(list[0].id);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load threads.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function runTest() {
    if (!selectedId || running) return;
    setRunning(true);
    setOutcome(null);
    try {
      const res = await fetch(`/api/inbox/conversations/${selectedId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          idempotencyKey: `admin-inbox-test-${Date.now()}`,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        const status = json.message?.status ?? "recorded";
        setOutcome({
          kind: "ok",
          text: `Reply recorded with status "${status}"${
            json.duplicate ? " (idempotent duplicate — the original send was reused)"
          : ""
          }. This is the exact outcome the reply service persisted; "simulated" means demo mode recorded it without contacting a provider.`,
        });
      } else {
        setOutcome({
          kind: "error",
          text: `Reply refused (${json.code ?? res.status}): ${json.error ?? "Unknown error"} — this refusal is the honest outcome of the real path (e.g. provider not configured, recipient suppressed, or LinkedIn channel unavailable).`,
        });
      }
    } catch (err) {
      setOutcome({
        kind: "error",
        text: err instanceof Error ? err.message : "Test request failed.",
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6 pb-14 max-w-4xl">
      <AdminPageHeader
        title="Inbox Testing"
        description="Exercise the real inbox reply service against a thread in your own admin workspace. The outcome shown is the recorded one — simulated in demo, provider-confirmed in live mode, or an honest refusal."
      />

      {threads === null && !loadError && <LoadingState label="Loading your workspace threads…" />}
      {loadError && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-13 text-rose-200">
          {loadError}
        </div>
      )}

      {threads !== null && threads.length === 0 && (
        <div className="glass-card p-6">
          <p className="text-14 text-black-200">
            No inbox threads exist in your workspace yet, so there is nothing
            to reply to. In live mode, use a dedicated test workspace with a
            configured email provider and a seeded conversation; in demo
            mode, threads are seeded automatically — if this list is empty
            in demo, the demo inbox store has not been initialised in this
            browser yet (open the dashboard inbox once).
          </p>
        </div>
      )}

      {threads !== null && threads.length > 0 && (
        <div className="glass-card p-6 space-y-4">
          <div>
            <label htmlFor="test-thread" className="text-13 font-semibold text-black-200 block mb-1.5">
              Thread (your workspace)
            </label>
            <select
              id="test-thread"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full rounded-xl border border-black-600 bg-black-800 px-3 py-2.5 text-13 text-white focus:outline-none focus:border-purple-500"
            >
              {threads.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.participant_name} ({t.channel ?? "email"})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="test-content" className="text-13 font-semibold text-black-200 block mb-1.5">
              Test reply content
            </label>
            <textarea
              id="test-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-black-600 bg-black-800 px-3 py-2.5 text-13 text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          <Button variant="primary" onClick={runTest} disabled={running || !content.trim()}>
            {running ? "Sending through reply service…" : "Send test reply"}
          </Button>

          {outcome && (
            <div
              className={`rounded-xl border px-4 py-3 text-13 ${
                outcome.kind === "ok"
                  ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-200"
                  : "border-yellow-500/40 bg-yellow-950/30 text-yellow-200"
              }`}
            >
              {outcome.text}
            </div>
          )}

          <p className="text-12 text-black-500">
            Safety: this posts a real reply through the same service users use
            (idempotency-keyed, suppression-checked). In live mode with a
            configured provider it can send real email — use a thread in a
            test workspace, never a customer&rsquo;s live thread.
          </p>
        </div>
      )}
    </div>
  );
}
