"use client";

/**
 * Shared presentational shell for the email-outreach provider panels.
 *
 * NOT wired into any page — the coordinator wires the per-provider
 * wrappers (e.g. `InstantlyPanel`) into the integrations detail page.
 *
 * Honesty rules baked into the copy:
 *  - a status of "connected" is only shown when the caller passes a
 *    status that came from a verified check; configuration alone is
 *    never presented as a connection;
 *  - endpoints the adapter could not verify against the provider's
 *    official docs are listed under "Config-ready — not live", never
 *    as working features;
 *  - sync jobs are the activity record: there is no live activity
 *    feed for these providers, and the panel says so instead of
 *    inventing one;
 *  - the retry note states the engine rule (retries only
 *    429/502/503/504, max 3 attempts) so an operator can tell a
 *    retryable failure from a final one.
 */

import { useState } from "react";

export interface EmailOutreachEndpoint {
  method: string;
  path: string;
  note: string;
}

export interface EmailOutreachEnvVar {
  name: string;
  purpose: string;
}

export interface EmailOutreachSyncJobRow {
  id: string;
  direction: string;
  status: string;
  processed: number;
  created: number;
  skipped: number;
  failed: number;
  createdAt: string;
}

export interface EmailOutreachPanelProps {
  providerId: string;
  providerName: string;
  /** Caller-supplied status string (from a verified check, never assumed). */
  status: string;
  mode: string;
  docsUrl: string | null;
  envVars: EmailOutreachEnvVar[];
  verifiedEndpoints: EmailOutreachEndpoint[];
  configReadyNotes: string[];
  capabilities: string[];
  syncJobs?: EmailOutreachSyncJobRow[] | null;
  lastError?: string | null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {children}
      </div>
    </section>
  );
}

export default function EmailOutreachPanel({
  providerId,
  providerName,
  status,
  mode,
  docsUrl,
  envVars,
  verifiedEndpoints,
  configReadyNotes,
  capabilities,
  syncJobs,
  lastError,
}: EmailOutreachPanelProps) {
  const [showEndpoints, setShowEndpoints] = useState(true);
  const connected = status.toLowerCase().includes("connected");

  return (
    <div className="space-y-4" data-provider={providerId}>
      <Section title="Live connection status">
        <p>
          Current status: <strong className="text-slate-900 dark:text-white">{status}</strong>.{" "}
          {connected
            ? `This status came from a verified authenticated check against ${providerName} — it is not claimed from configuration alone.`
            : `${providerName} is not verified as connected. Storing a credential is configuration, not a connection; run the connection test to verify it.`}
        </p>
        {mode === "demo" && (
          <p>
            Demo mode: no live provider calls are made here. Connect in live mode to verify
            credentials.
          </p>
        )}
        {lastError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700 dark:bg-red-950 dark:text-red-300">
            Last API error: {lastError}
          </p>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          API errors retry only on 429 / 502 / 503 / 504, up to 3 attempts total, with
          exponential back-off. Other failures are final and are recorded on the sync job.
        </p>
      </Section>

      <Section title="Capabilities">
        <ul className="list-disc space-y-1 pl-5">
          {capabilities.map((cap) => (
            <li key={cap}>{cap}</li>
          ))}
        </ul>
        {docsUrl && (
          <p>
            Provider docs:{" "}
            <a
              href={docsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline dark:text-blue-400"
            >
              {docsUrl}
            </a>
          </p>
        )}
      </Section>

      <Section title="Environment variables">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Credentials are stored encrypted in the integration-connections store, never in code
          or logs. These names are the conventional operator-facing names for the credential
          that seeds a connection.
        </p>
        <ul className="space-y-1">
          {envVars.map((v) => (
            <li key={v.name}>
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">
                {v.name}
              </code>{" "}
              — {v.purpose}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Verified endpoints">
        <button
          type="button"
          onClick={() => setShowEndpoints((s) => !s)}
          className="text-xs font-medium text-blue-600 underline dark:text-blue-400"
        >
          {showEndpoints ? "Hide endpoints" : "Show endpoints"}
        </button>
        {showEndpoints && (
          <ul className="space-y-2">
            {verifiedEndpoints.map((e) => (
              <li key={`${e.method} ${e.path}`}>
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">
                  {e.method} {e.path}
                </code>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{e.note}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {configReadyNotes.length > 0 && (
        <Section title="Config-ready — not live">
          <p>
            These operations are implemented as explicit config-ready stubs: they throw a
            named error instead of calling an unverified URL. Verify the endpoint against the
            provider docs, then implement them.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {configReadyNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Sync status & activity">
        {!syncJobs || syncJobs.length === 0 ? (
          <p>No sync has run yet for {providerName}. Sync jobs are the activity record for
          this provider — there is no separate live activity feed.</p>
        ) : (
          <ul className="space-y-2">
            {syncJobs.map((job) => (
              <li
                key={job.id}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700"
              >
                <span className="font-semibold">{job.direction}</span> · {job.status} ·{" "}
                processed {job.processed}, created {job.created}, skipped {job.skipped},
                failed {job.failed} · {job.createdAt}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
