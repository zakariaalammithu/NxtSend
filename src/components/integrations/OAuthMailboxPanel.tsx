"use client";

/**
 * Connected-mailbox panel — Gmail / Outlook integration pages.
 *
 * Everything rendered here comes from GET /api/oauth/connections,
 * which returns METADATA ONLY (provider, mailbox address, grant
 * status, token expiry, scopes) — token material never exists in
 * the browser. Actions:
 *  - Connect: a plain navigation to /api/oauth/<provider>/connect,
 *    which redirects to the provider's consent screen (live mode
 *    only). In Demo Mode there is deliberately NO working connect:
 *    the panel explains what live setup requires instead of faking
 *    a connection.
 *  - Disconnect: POST /api/oauth/disconnect behind an inline
 *    confirm; the result (including Google revocation outcome) is
 *    shown verbatim.
 * OAuth round-trip notices arrive as ?oauth_connected / ?oauth_error
 * query params (set by the connect/callback routes) and are mapped
 * to honest explanations here.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2,
  Mail,
  PlugZap,
  Unplug,
} from "lucide-react";

type OAuthProviderId = "google" | "microsoft";

interface ProviderConfig {
  provider: OAuthProviderId;
  clientConfigured: boolean;
  vaultConfigured: boolean;
  redirectUri: string | null;
  missing: string[];
  ready: boolean;
}

interface ConnectionMetadata {
  id: string;
  accountId: string;
  provider: OAuthProviderId;
  email: string;
  scopes: string | null;
  status: "active" | "needs_reconnect" | "disconnected" | "error";
  tokenExpiresAt: string | null;
  authStatus: string;
  createdAt: string;
  updatedAt: string;
}

interface ConnectionsResponse {
  mode: "demo" | "supabase";
  providers: ProviderConfig[];
  connections: ConnectionMetadata[];
}

const LABELS: Record<OAuthProviderId, string> = {
  google: "Gmail",
  microsoft: "Outlook (Microsoft 365)",
};

const ERROR_TEXT: Record<string, string> = {
  demo_mode:
    "Demo Mode: mailboxes can't be connected here. Connecting runs in live mode — with Supabase configured and the OAuth client set up (SETUP.md §15) — and the consent happens on the provider's own screen. Nothing was connected.",
  not_configured:
    "The OAuth configuration for this provider is incomplete, so the connect flow stopped before redirecting. The missing items are listed in this panel.",
  unauthorized:
    "You need to be signed in to connect a mailbox. Sign in and try again.",
  state_invalid:
    "The connection attempt could not be verified (the OAuth state expired or didn't match your session). Nothing was stored — start the connection again.",
  exchange_failed:
    "The provider rejected the authorization code exchange. Nothing was stored — try connecting again; if it repeats, check the OAuth client configuration (SETUP.md §15).",
  profile_failed:
    "The mailbox profile could not be fetched from the provider after consent, so no connection was recorded. Nothing was stored.",
  storage_failed:
    "The connection could not be stored on the server. Nothing was connected — check the server configuration (migration 014 applied? TOKEN_ENCRYPTION_KEY valid?).",
  provider_denied:
    "The provider sign-in was cancelled or denied at the consent step. Nothing was connected.",
  invalid_callback:
    "The provider returned without the expected parameters. Nothing was connected.",
};

const STATUS_CHIP: Record<ConnectionMetadata["status"], string> = {
  active: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  needs_reconnect: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  error: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  disconnected: "border-black-600 bg-black-800 text-black-300",
};

export default function OAuthMailboxPanel({
  provider,
}: {
  provider: OAuthProviderId;
}) {
  const label = LABELS[provider];
  const [data, setData] = useState<ConnectionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<
    { kind: "success" | "error"; text: string } | null
  >(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/oauth/connections");
      const body = (await res.json()) as ConnectionsResponse & {
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setData(body);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load mailbox status."
      );
    }
  }, []);

  useEffect(() => {
    void load();
    // OAuth round-trip notices (set by the connect/callback routes).
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("oauth_connected");
    const oauthError = params.get("oauth_error");
    if (connected === provider) {
      const mailbox = params.get("mailbox");
      setNotice({
        kind: "success",
        text: `${label} mailbox ${mailbox ?? ""} is connected. Campaigns that select this mailbox as their email account now send from it.`,
      });
    } else if (oauthError) {
      const missing = params.get("missing");
      const base =
        ERROR_TEXT[oauthError] ?? `The connection did not complete (${oauthError}). Nothing was connected.`;
      setNotice({
        kind: "error",
        text: missing ? `${base} Missing: ${missing}.` : base,
      });
    }
  }, [load, provider, label]);

  const disconnect = async (connection: ConnectionMetadata) => {
    setBusyId(connection.id);
    setActionNote(null);
    try {
      const res = await fetch("/api/oauth/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: connection.id }),
      });
      const body = (await res.json()) as {
        error?: string;
        provider?: OAuthProviderId;
        email?: string;
        revokedAtProvider?: boolean | null;
      };
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setActionNote(
        body.provider === "google"
          ? body.revokedAtProvider
            ? `Disconnected ${body.email}: stored tokens deleted and the grant was revoked at Google.`
            : `Disconnected ${body.email}: stored tokens deleted. Google revocation could not be confirmed, but NxtSend no longer holds the grant and cannot use it.`
          : `Disconnected ${body.email}: stored tokens deleted. Microsoft provides no revocation endpoint for this flow — also remove the app's consent in the Microsoft account if you want the grant gone there too.`
      );
      setConfirmId(null);
      void load();
    } catch (err) {
      setActionNote(
        err instanceof Error ? err.message : "Disconnect failed."
      );
    } finally {
      setBusyId(null);
    }
  };

  const config = data?.providers.find((p) => p.provider === provider) ?? null;
  const connections =
    data?.connections.filter((c) => c.provider === provider) ?? [];
  const isDemo = data?.mode === "demo";

  return (
    <section className="glass-card p-6 space-y-4" data-testid="oauth-mailbox-panel">
      <div className="flex items-center gap-2.5">
        <Mail className="h-5 w-5 text-violet-300" />
        <h3 className="text-15 font-semibold text-white">Connected mailbox</h3>
      </div>

      {notice && (
        <div
          className={`rounded-xl border p-3.5 flex items-start gap-2.5 text-13 leading-relaxed ${
            notice.kind === "success"
              ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-200"
              : "border-rose-500/30 bg-rose-950/20 text-rose-200"
          }`}
          role="status"
        >
          {notice.kind === "success" ? (
            <CheckCircle2 className="h-4.5 w-4.5 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-400/25 bg-red-400/5 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      {!data && !error && (
        <p className="text-13 text-black-400">Loading mailbox status…</p>
      )}

      {data && isDemo && (
        <div
          className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 space-y-2.5"
          data-testid="oauth-demo-explanation"
        >
          <p className="flex items-start gap-2 text-13 text-amber-200 leading-relaxed">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              <strong>Demo Mode — mailbox connection is disabled here.</strong>{" "}
              Connecting a mailbox is a live-mode OAuth flow: you sign in on{" "}
              {provider === "google" ? "Google's" : "Microsoft's"} own consent
              screen and the provider returns an authorization the app stores
              encrypted. NxtSend never asks for a mailbox password, and Demo
              Mode never pretends a mailbox is connected.
            </span>
          </p>
          <p className="text-12.5 text-amber-100/80 leading-relaxed">
            To connect for real you need: the app running in live mode
            (Supabase configured), an OAuth client created in{" "}
            {provider === "google"
              ? "the Google Cloud Console (Gmail API enabled; redirect URI registered)"
              : "an Azure app registration (Graph mail permissions; redirect URI registered)"}
            , the client ID + secret set in Vercel, and a
            TOKEN_ENCRYPTION_KEY. The full step-by-step is in SETUP.md §15.
            Then this panel offers the real Connect button.
          </p>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 rounded-xl bg-black-700 px-4 py-2.5 text-13 font-semibold text-black-400 cursor-not-allowed"
            data-testid="oauth-connect-disabled"
          >
            <PlugZap className="h-4 w-4" />
            Connect {label} mailbox (live mode only)
          </button>
        </div>
      )}

      {data && !isDemo && config && !config.ready && (
        <div
          className="rounded-xl border border-orange-500/30 bg-orange-950/20 p-4 space-y-2"
          data-testid="oauth-config-missing"
        >
          <p className="flex items-start gap-2 text-13 text-orange-200 leading-relaxed">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              <strong>Configuration required before connecting:</strong>{" "}
              {config.missing.join(", ")}. Set the missing variables in
              Vercel → Project → Settings → Environment Variables and
              redeploy (SETUP.md §15).
            </span>
          </p>
          {config.redirectUri && (
            <p className="text-12.5 text-orange-100/80 leading-relaxed">
              Register this redirect URI in the{" "}
              {provider === "google"
                ? "Google Cloud Console OAuth client"
                : "Azure app registration"}
              :{" "}
              <code className="font-mono text-orange-100 break-all">
                {config.redirectUri}
              </code>
            </p>
          )}
        </div>
      )}

      {data && !isDemo && connections.length > 0 && (
        <div className="space-y-3">
          {connections.map((connection) => (
            <div
              key={connection.id}
              className="rounded-xl border border-black-700 bg-black-800/40 p-4 space-y-2"
              data-testid="oauth-connection-card"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-14 font-semibold text-white">
                  {connection.email}
                </span>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-11 font-medium capitalize ${STATUS_CHIP[connection.status]}`}
                >
                  {connection.status.replace("_", " ")}
                </span>
                {connection.authStatus !== "ok" && (
                  <span className="text-11 text-amber-300">
                    authorization: {connection.authStatus.replace("_", " ")}
                  </span>
                )}
              </div>
              <p className="text-12 text-black-400 leading-relaxed">
                {connection.tokenExpiresAt
                  ? `Access token expires ${new Date(connection.tokenExpiresAt).toLocaleString()} — refresh is automatic; a failed refresh marks this mailbox "needs reconnect" and its sends refuse honestly.`
                  : "Token expiry is not recorded for this grant."}{" "}
                Tokens are stored encrypted on the server and are never shown
                here.
              </p>
              {connection.scopes && (
                <p className="text-12 text-black-500">
                  Granted scopes: {connection.scopes}
                </p>
              )}
              {confirmId === connection.id ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-12.5 text-black-300">
                    Disconnect this mailbox? Stored tokens are deleted and
                    campaigns selecting it will refuse to send until another
                    account is chosen.
                  </span>
                  <button
                    type="button"
                    disabled={busyId === connection.id}
                    onClick={() => void disconnect(connection)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-60 px-3 py-1.5 text-12 font-semibold text-white"
                  >
                    {busyId === connection.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Unplug className="h-3.5 w-3.5" />
                    )}
                    Disconnect
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    className="rounded-lg border border-black-600 px-3 py-1.5 text-12 font-medium text-black-200 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmId(connection.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-black-600 px-3 py-1.5 text-12 font-medium text-black-200 hover:text-white"
                  data-testid="oauth-disconnect-button"
                >
                  <Unplug className="h-3.5 w-3.5" /> Disconnect
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {data && !isDemo && config?.ready && connections.length === 0 && (
        <div className="space-y-2.5" data-testid="oauth-connect-ready">
          <p className="text-13 text-black-300 leading-relaxed">
            No {label} mailbox is connected in this workspace yet. Connect
            runs on {provider === "google" ? "Google’s" : "Microsoft’s"} own
            consent screen — you’ll pick the mailbox and approve sending
            access there. The connection exists only after the provider
            returns and the mailbox profile is fetched.
          </p>
          <a
            href={`/api/oauth/${provider}/connect`}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2.5 text-13 font-semibold text-white transition-colors"
            data-testid="oauth-connect-button"
          >
            <PlugZap className="h-4 w-4" />
            Connect {label} mailbox
          </a>
        </div>
      )}

      {actionNote && (
        <p className="rounded-lg border border-black-600 bg-black-800/60 px-3 py-2 text-12.5 text-black-200" role="status">
          {actionNote}
        </p>
      )}
    </section>
  );
}
