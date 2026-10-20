"use client";

/**
 * Reply routing & unsubscribe panel — Resend integration page.
 *
 * Shows, from GET /api/email/routing (server-derived, no secret
 * values ever leave the server):
 *  - where replies to outbound mail land: EMAIL_REPLY_TO when set —
 *    the executor and the inbox reply service pass it on every send;
 *    when unset, a plain warning that replies go to the From address
 *    and only reach the Inbox if that domain is a receiving domain;
 *  - unsubscribe signing status (dedicated secret / derived from the
 *    service-role key / demo / unconfigured) and whether a public
 *    unsubscribe URL can be built in this deployment;
 *  - a link to the workspace suppression list, where unsubscribed,
 *    bounced and complained addresses land.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, MailCheck, ShieldCheck } from "lucide-react";

interface RoutingResponse {
  mode: string;
  replyTo: string | null;
  from: string | null;
  fromDomain: string | null;
  repliesRouteTo: string | null;
  replyToConfigured: boolean;
  unsubscribeSigning: "configured" | "derived" | "demo" | "unconfigured";
  unsubscribeBaseUrl: string | null;
  unsubscribeBaseError: string | null;
}

const SIGNING_LABELS: Record<RoutingResponse["unsubscribeSigning"], string> = {
  configured: "Configured (UNSUBSCRIBE_SECRET)",
  derived: "Configured (derived from SUPABASE_SERVICE_ROLE_KEY)",
  demo: "Demo key (Demo Mode only)",
  unconfigured: "Not configured",
};

export default function EmailRoutingPanel() {
  const [data, setData] = useState<RoutingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/email/routing");
        const body = (await res.json()) as RoutingResponse & { error?: string };
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
        if (!cancelled) setData(body);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load routing status.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="glass-card p-6" data-testid="email-routing-panel">
      <div className="flex items-center gap-2.5">
        <MailCheck className="h-5 w-5 text-violet-300" />
        <h3 className="text-15 font-semibold text-white">
          Reply routing &amp; unsubscribe
        </h3>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-400/25 bg-red-400/5 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      {!data && !error && (
        <p className="mt-3 text-13 text-black-400">Loading routing status…</p>
      )}

      {data && (
        <div className="mt-4 space-y-4 text-13 leading-relaxed text-black-300">
          {data.replyToConfigured ? (
            <p>
              <strong className="text-white">Replies route to {data.replyTo}.</strong>{" "}
              Every campaign email and inbox reply is sent with this
              Reply-To (EMAIL_REPLY_TO), so answers land on your
              receiving domain and reach the Inbox.
            </p>
          ) : (
            <p className="rounded-lg border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-amber-200">
              <strong>Replies will go to your From address</strong>
              {data.from ? ` (${data.from})` : ""} — set{" "}
              <code className="font-mono text-12">EMAIL_REPLY_TO</code> to
              an address on your receiving domain so replies reach the
              Inbox. Until then the reply loop only works if the From
              domain itself receives mail (SETUP.md §6).
            </p>
          )}

          <div className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
            <div>
              <p>
                <strong className="text-white">Unsubscribe signing:</strong>{" "}
                {SIGNING_LABELS[data.unsubscribeSigning]}. Every outbound
                email carries a List-Unsubscribe header (one-click) and a
                footer unsubscribe link, signed per recipient.
              </p>
              {!data.unsubscribeBaseUrl && data.unsubscribeBaseError && (
                <p className="mt-1.5 text-amber-200">{data.unsubscribeBaseError}</p>
              )}
              {data.unsubscribeSigning === "unconfigured" && (
                <p className="mt-1.5 text-amber-200">
                  No unsubscribe link can be signed in this deployment —
                  set UNSUBSCRIBE_SECRET (recommended) or
                  SUPABASE_SERVICE_ROLE_KEY, from which a signing key is
                  derived.
                </p>
              )}
            </div>
          </div>

          <Link
            href="/dashboard/email/suppression"
            className="inline-flex items-center gap-1.5 font-semibold text-purple-300 hover:text-white transition-colors"
          >
            Manage the suppression list
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
          <p className="text-12 text-black-400">
            Unsubscribed, bounced and complained addresses are refused
            automatically before any send — the list is enforced
            fail-closed, never advisory.
          </p>
        </div>
      )}
    </section>
  );
}
