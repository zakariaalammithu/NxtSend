"use client";

/**
 * Email authentication panel — SPF / DKIM / DMARC verdicts for the
 * sending domain, from REAL public-DNS lookups via
 * POST /api/email-auth/check, plus the Resend provider-domain match.
 *
 * Honesty rules baked into the copy:
 *  - these records AUTHENTICATE a domain; nothing here claims or
 *    implies inbox placement or "deliverability" as an outcome;
 *  - demo mode runs the same real DNS lookups (public data) and says
 *    so; the provider section is "not configured", never simulated;
 *  - a domain with no records shows exactly that — never a fake pass.
 */

import { useState } from "react";

interface ProtocolVerdict {
  protocol: "SPF" | "DKIM" | "DMARC";
  state: "valid" | "invalid" | "not_found" | "error";
  records: string[];
  issues: string[];
  notes: string[];
  fix: string;
  selector?: string;
  selectorSource?: "provider" | "guess";
}

interface CheckResponse {
  domain: string | null;
  needsDomain?: boolean;
  mode: string;
  defaultDomain: string | null;
  checkedAt: string;
  dns: {
    spf: ProtocolVerdict;
    dmarc: ProtocolVerdict;
    dkim: ProtocolVerdict[];
  } | null;
  provider: {
    configured: boolean;
    state: string;
    message: string;
    fromDomain: string | null;
    match: string | null;
    domains: { name: string; status: string }[];
    recordsToAdd: {
      kind: string;
      name: string;
      type: string;
      value: string;
      status: string;
    }[];
  };
}

const STATE_BADGE: Record<ProtocolVerdict["state"], { label: string; cls: string }> = {
  valid: {
    label: "Found · valid",
    cls: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30",
  },
  invalid: {
    label: "Found · problem",
    cls: "bg-red-400/10 text-red-300 ring-red-400/30",
  },
  not_found: {
    label: "Not found",
    cls: "bg-amber-400/10 text-amber-300 ring-amber-400/30",
  },
  error: {
    label: "Check failed",
    cls: "bg-slate-400/10 text-slate-300 ring-slate-400/30",
  },
};

function VerdictRow({ verdict }: { verdict: ProtocolVerdict }) {
  const badge = STATE_BADGE[verdict.state];
  const title =
    verdict.protocol === "DKIM"
      ? `DKIM · selector "${verdict.selector}" (${verdict.selectorSource === "provider" ? "provider-reported" : "common guess"})`
      : verdict.protocol;
  return (
    <div
      className="rounded-xl border border-white/8 bg-white/[0.02] p-4"
      data-testid={`auth-verdict-${verdict.protocol.toLowerCase()}${verdict.protocol === "DKIM" ? `-${verdict.selector}` : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-white">{title}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${badge.cls}`}
        >
          {badge.label}
        </span>
      </div>
      {verdict.records.length > 0 && (
        <div className="mt-2 space-y-1">
          {verdict.records.map((r, i) => (
            <code
              key={i}
              className="block overflow-x-auto whitespace-nowrap rounded-lg bg-black/30 px-2.5 py-1.5 font-mono text-[11px] text-slate-300"
            >
              {r}
            </code>
          ))}
        </div>
      )}
      {verdict.issues.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-red-200/90">
          {verdict.issues.map((issue, i) => (
            <li key={i}>{issue}</li>
          ))}
        </ul>
      )}
      {verdict.notes.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-400">
          {verdict.notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}
      {(verdict.state === "invalid" || verdict.state === "not_found") && (
        <p className="mt-2 text-xs leading-relaxed text-slate-300">
          <span className="font-semibold text-white">How to fix: </span>
          {verdict.fix}
        </p>
      )}
    </div>
  );
}

export default function EmailAuthPanel({
  defaultDomain,
}: {
  defaultDomain?: string | null;
}) {
  const [domain, setDomain] = useState(defaultDomain ?? "");
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runCheck() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/email-auth/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim() || undefined }),
      });
      const data = (await res.json()) as CheckResponse & { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Check failed (HTTP ${res.status}).`);
        setResult(null);
        return;
      }
      setResult(data);
      if (data.domain) setDomain(data.domain);
    } catch {
      setError("The check request failed — is the app reachable?");
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  const provider = result?.provider;
  const providerWarn =
    provider &&
    (provider.state === "not_verified" || provider.state === "not_listed");
  const providerOk = provider?.state === "verified";

  return (
    <section className="glass-card p-6" data-testid="email-auth-panel">
      <h3 className="text-base font-bold text-white">
        Email authentication (SPF · DKIM · DMARC)
      </h3>
      <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-400">
        These DNS records prove to receiving servers that mail from your
        domain really comes from your provider. They authenticate the
        domain — they do not, on their own, guarantee inbox placement,
        which also depends on sender reputation and history. This check
        reads the domain&apos;s real public DNS records.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="your-sending-domain.com"
          data-testid="auth-domain-input"
          className="w-72 max-w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
        />
        <button
          type="button"
          onClick={runCheck}
          disabled={running}
          data-testid="auth-run-check"
          className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? "Checking DNS…" : "Run check"}
        </button>
        {result?.checkedAt && (
          <span className="text-xs text-slate-500">
            Last checked {new Date(result.checkedAt).toLocaleString()}
          </span>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-400/25 bg-red-400/5 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}

      {!result && !error && (
        <p className="mt-3 text-sm text-slate-500">
          No check run yet. Leave the field empty to check the sending
          domain from EMAIL_FROM
          {defaultDomain ? ` (${defaultDomain})` : ""}, or type any
          domain to inspect its live public records. Nothing is
          simulated.
        </p>
      )}

      {result?.needsDomain && (
        <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-sm text-amber-200">
          {result.provider.message}
        </p>
      )}

      {result && !result.needsDomain && provider && (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm leading-relaxed ${
            providerOk
              ? "border-emerald-400/25 bg-emerald-400/5 text-emerald-100"
              : providerWarn
                ? "border-amber-400/30 bg-amber-400/5 text-amber-100"
                : "border-white/10 bg-white/[0.02] text-slate-300"
          }`}
          data-testid="auth-provider-match"
        >
          <span className="font-semibold text-white">
            Provider (Resend) match:{" "}
          </span>
          {provider.message}
          {provider.domains.length > 0 && (
            <span className="mt-2 flex flex-wrap gap-1.5">
              {provider.domains.map((d) => (
                <span
                  key={d.name}
                  className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-slate-300 ring-1 ring-white/10"
                >
                  {d.name} · {d.status}
                </span>
              ))}
            </span>
          )}
        </div>
      )}

      {result?.dns && (
        <div className="mt-4 space-y-3">
          <VerdictRow verdict={result.dns.spf} />
          {result.dns.dkim.map((v) => (
            <VerdictRow key={v.selector} verdict={v} />
          ))}
          <VerdictRow verdict={result.dns.dmarc} />
        </div>
      )}

      {result && !result.needsDomain && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-white">
            Records to add at your DNS host
          </h4>
          {provider && provider.recordsToAdd.length > 0 ? (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead>
                  <tr className="text-slate-500">
                    <th className="py-1.5 pr-3 font-medium">For</th>
                    <th className="py-1.5 pr-3 font-medium">Type</th>
                    <th className="py-1.5 pr-3 font-medium">Host / name</th>
                    <th className="py-1.5 pr-3 font-medium">Value</th>
                    <th className="py-1.5 font-medium">Provider status</th>
                  </tr>
                </thead>
                <tbody>
                  {provider.recordsToAdd.map((r, i) => (
                    <tr key={i} className="border-t border-white/5 align-top">
                      <td className="py-2 pr-3 text-slate-300">{r.kind || "—"}</td>
                      <td className="py-2 pr-3 text-slate-300">{r.type}</td>
                      <td className="py-2 pr-3 font-mono text-[11px] text-slate-300">{r.name}</td>
                      <td className="max-w-[280px] break-all py-2 pr-3 font-mono text-[11px] text-slate-300">{r.value}</td>
                      <td className="py-2 text-slate-300">{r.status || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-slate-500">
                These are the exact records Resend reports for this
                domain. After adding them, wait for DNS propagation and
                run the check again.
              </p>
            </div>
          ) : (
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-slate-400">
              <li>
                <span className="text-slate-200">SPF:</span> in the Resend
                dashboard, open the domain and copy its SPF record
                exactly (a TXT record, usually on the{" "}
                <code className="font-mono">send</code> subdomain,
                including amazonses.com). Never keep two SPF records on
                one name.
              </li>
              <li>
                <span className="text-slate-200">DKIM:</span> copy the
                DKIM TXT record Resend shows (host{" "}
                <code className="font-mono">resend._domainkey</code>)
                with its full public key — do not shorten it.
              </li>
              <li>
                <span className="text-slate-200">DMARC:</span> add a TXT
                record at <code className="font-mono">_dmarc</code>{" "}
                starting with{" "}
                <code className="font-mono">
                  v=DMARC1; p=none; rua=mailto:you@your-domain.com
                </code>
                , then tighten the policy to quarantine and reject once
                reports look clean.
              </li>
            </ul>
          )}
          {result.mode === "demo" && (
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Demo mode note: the DNS verdicts above are real lookups of
              public records — the same check that runs in live mode.
              The provider section cannot be read without a Resend key,
              so it reports &quot;not configured&quot; rather than
              simulating a match.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
