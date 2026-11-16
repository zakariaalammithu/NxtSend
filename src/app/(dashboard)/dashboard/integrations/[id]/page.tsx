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
  Copy,
  Check,
  Shield,
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
import { SCOPE_DESCRIPTIONS } from "@/lib/muse-connector/oauth/scopes";
import type { OAuthScope } from "@/lib/muse-connector/oauth/scopes";
import EmailAuthPanel from "@/components/integrations/EmailAuthPanel";
import EmailRoutingPanel from "@/components/integrations/EmailRoutingPanel";
import OAuthMailboxPanel from "@/components/integrations/OAuthMailboxPanel";

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

      {/* Email authentication — Resend only: real DNS verdicts for the
          sending domain + the provider-domain match. */}
      {d.id === "resend" && <EmailAuthPanel />}

      {/* Reply routing & unsubscribe — Resend only: where replies land
          (EMAIL_REPLY_TO) and whether unsubscribe signing is ready. */}
      {d.id === "resend" && <EmailRoutingPanel />}

      {/* Mailbox OAuth — Gmail / Outlook only: the connected mailbox
          (metadata only), Connect (live OAuth) and Disconnect. */}
      {d.id === "gmail" && <OAuthMailboxPanel provider="google" />}
      {d.id === "microsoft" && <OAuthMailboxPanel provider="microsoft" />}

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

      {/* Muse.ai live surface: endpoints, scopes, grants, activity */}
      {d.id === "muse-ai" && (
        <MuseLivePanels origin={origin} status={entry.status} mode={data?.mode ?? "demo"} />
      )}

      {/* ChatGPT live surface: same machinery, ChatGPT copy + nxtsend.* scopes */}
      {d.id === "chatgpt" && (
        <ChatGptLivePanels origin={origin} status={entry.status} mode={data?.mode ?? "demo"} />
      )}

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
            : d.id === "gmail" || d.id === "microsoft"
              ? "Use the Disconnect button in the Connected mailbox panel above: it deletes the stored (encrypted) OAuth tokens and marks the account disconnected — for Gmail it also revokes the grant at Google (best effort, reported in the result); Microsoft offers no revocation endpoint, so remove the app's consent in the Microsoft account too if you want it gone there. Removing the env variables additionally prevents NEW connections. Past message records are kept."
              : d.id === "muse-ai"
              ? "Revoke individual grants from the “Your Muse grants” panel above — revoking removes Muse's access for that grant immediately (every token for that client + user is revoked). Removing the environment variables additionally prevents NEW grants. Past audit entries are kept."
              : d.id === "chatgpt"
              ? "Revoke individual grants from the “Your ChatGPT grants” panel above — revoking removes ChatGPT's access for that grant immediately (every token for that client + user is revoked). Removing the environment variables additionally prevents NEW grants. Past audit entries are kept."
              : d.kind === "info"
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard unavailable (non-secure context) — the URL is
          // still shown in full and selectable.
        }
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-black-600 bg-black-800 px-2.5 py-1.5 text-11 font-semibold text-black-200 hover:text-white transition-colors"
      aria-label="Copy URL"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

interface MuseGrant {
  clientId: string;
  clientName: string;
  scopes: OAuthScope[];
  createdAt: string;
  refreshExpiresAt: string | null;
  active: boolean;
  lastUsedAt: string | null;
}

interface MuseActivityEntry {
  action: string;
  resource: string | null;
  details: string;
  created_at: string;
}

type ConnectorPlatform = "muse" | "chatgpt";

/**
 * Per-platform copy for the live panels. The machinery (grants +
 * activity APIs, revoke, endpoints rendering) is shared; only the
 * words, the MCP path, the scope prefix and the connect steps
 * differ. The ChatGPT panel lists only grants whose scopes carry
 * the nxtsend.* prefix (or whose client_id is a chatgpt.com CIMD
 * URL); the Muse panel lists only muse.* grants. A grant holding
 * both prefixes appears in both — it genuinely is a grant for both.
 */
const CONNECTOR_COPY: Record<
  ConnectorPlatform,
  {
    label: string;
    mcpPath: string;
    mcpNote: string;
    scopePrefix: "muse" | "nxtsend";
    endpoints: { label: string; path: string; note: string }[];
    connectSteps: string[];
    grantsTitle: string;
    grantsEmpty: string;
    activityEmpty: string;
    securityNotes: string[];
  }
> = {
  muse: {
    label: "Muse",
    mcpPath: "/api/mcp",
    mcpNote: "Streamable HTTP, JSON-RPC 2.0. Give this URL to Muse as a Custom Connector.",
    scopePrefix: "muse",
    endpoints: [
      {
        label: "MCP endpoint",
        path: "/api/mcp",
        note: "Streamable HTTP, JSON-RPC 2.0. Give this URL to Muse as a Custom Connector.",
      },
      {
        label: "Authorize (consent screen)",
        path: "/api/muse/oauth/authorize",
        note: "GET shows the consent screen; POST approves or denies.",
      },
      { label: "Token", path: "/api/muse/oauth/token", note: "authorization_code + refresh_token." },
      { label: "Revoke", path: "/api/muse/oauth/revoke", note: "RFC 7009 token revocation." },
      {
        label: "Register (Dynamic Client Registration)",
        path: "/api/muse/oauth/register",
        note: "RFC 7591 — public clients by default; no pre-registered client secret exists.",
      },
      {
        label: "Protected-resource metadata",
        path: "/.well-known/oauth-protected-resource/api/mcp",
        note: "RFC 9728 metadata for the MCP resource.",
      },
    ],
    connectSteps: [
      "In Muse, add NxtSend as a Custom Connector with the MCP endpoint URL above. Muse registers itself via Dynamic Client Registration — there is no client secret to copy (clients are public by default).",
      "Sign in on NxtSend's consent screen and choose the scopes. Pick muse.read only unless Muse genuinely needs to change or send things.",
      "Use NxtSend from inside Muse. Sensitive writes (sending email, deleting a lead) need your approval in Muse every single time — they can never be set to “Always allow”.",
      "Directory listing is a separate step: submit at muse.ai/platform for Meta's review. That submission has NOT been made and no approval is claimed — the Custom Connector path above works without it.",
    ],
    grantsTitle: "Your Muse grants",
    grantsEmpty:
      "No Muse grants for your account. A grant appears here after you approve Muse on the consent screen — until then, nothing is connected.",
    activityEmpty:
      "No Muse activity recorded for this workspace yet — MCP tool calls and OAuth grant/revoke events appear here (newest first, up to 50).",
    securityNotes: [
      "Tokens and authorization codes are stored as SHA-256 hashes only — a database read can never yield a usable token, and no token value is ever logged or shown in the UI.",
      "Refresh tokens rotate on every use; presenting an already-rotated refresh token revokes the whole grant.",
      "The OAuth tables (migration 023) have RLS enabled with zero policies — only the service role can read or write them; the browser cannot reach them at all.",
      "A grant is scoped to one user and one workspace. MCP tool calls are workspace-scoped and scope-enforced; a muse.read token cannot call a write tool.",
      "Sensitive writes (send_email, send_inbox_reply, delete_lead) need approval in Muse every time. There is no LinkedIn-send tool: no authorized LinkedIn provider exists, and the official LinkedIn API exposes no connection-request/DM endpoints to standard developers.",
      "Every MCP tool call and OAuth grant/revoke event is written to the audit log for this workspace (see the activity history above).",
      "Demo Mode refuses the whole Muse surface (OAuth 503/400, MCP 503) — the demo persona is never served to Muse.",
    ],
  },
  chatgpt: {
    label: "ChatGPT",
    mcpPath: "/api/mcp/chatgpt",
    mcpNote:
      "Streamable HTTP, JSON-RPC 2.0. Add this URL in ChatGPT with Developer Mode on (Settings → Connectors → Advanced → Developer mode).",
    scopePrefix: "nxtsend",
    endpoints: [
      {
        label: "MCP endpoint",
        path: "/api/mcp/chatgpt",
        note: "Streamable HTTP, JSON-RPC 2.0. Add this URL in ChatGPT with Developer Mode on (Settings → Connectors → Advanced → Developer mode).",
      },
      {
        label: "Authorize (consent screen)",
        path: "/api/muse/oauth/authorize",
        note: "GET shows the consent screen; POST approves or denies.",
      },
      { label: "Token", path: "/api/muse/oauth/token", note: "authorization_code + refresh_token." },
      { label: "Revoke", path: "/api/muse/oauth/revoke", note: "RFC 7009 token revocation." },
      {
        label: "Register (Dynamic Client Registration)",
        path: "/api/muse/oauth/register",
        note: "RFC 7591 — public clients by default; no pre-registered client secret exists.",
      },
      {
        label: "Authorization-server metadata",
        path: "/.well-known/oauth-authorization-server",
        note: "RFC 8414 metadata: issuer, authorize/token/revoke/register endpoints (PKCE S256 only).",
      },
      {
        label: "Protected-resource metadata (root)",
        path: "/.well-known/oauth-protected-resource",
        note: "RFC 9728 root metadata for both MCP resources.",
      },
      {
        label: "Protected-resource metadata (ChatGPT resource)",
        path: "/.well-known/oauth-protected-resource/api/mcp/chatgpt",
        note: "RFC 9728 metadata for the ChatGPT MCP resource.",
      },
    ],
    connectSteps: [
      "In ChatGPT, turn on Developer Mode: ChatGPT Settings → Connectors → Advanced → Developer mode. Developer Mode is labelled high-risk by OpenAI and its availability changes often — if the setting is missing, check the live ChatGPT settings (a workspace admin may have disabled custom connectors).",
      "Add NxtSend as a connector with the MCP endpoint URL above. ChatGPT identifies itself with a CIMD client_id URL or registers via Dynamic Client Registration — there is no client secret to copy (clients are public by default).",
      "Sign in on NxtSend's consent screen and choose the scopes. Pick nxtsend.read only unless ChatGPT genuinely needs to change or send things.",
      "Use NxtSend from inside ChatGPT. Sensitive writes (sending email, deleting a lead or a campaign) need your approval in ChatGPT every single time — they can never be set to “Always allow”.",
      "Directory listing is a separate step: submit to OpenAI for review. That submission has NOT been made and no approval is claimed — the Developer Mode path above works without it.",
    ],
    grantsTitle: "Your ChatGPT grants",
    grantsEmpty:
      "No ChatGPT grants for your account. A grant appears here after you approve ChatGPT on the consent screen — until then, nothing is connected.",
    activityEmpty:
      "No ChatGPT activity recorded for this workspace yet — MCP tool calls and OAuth grant/revoke events appear here (newest first, up to 50).",
    securityNotes: [
      "Tokens and authorization codes are stored as SHA-256 hashes only — a database read can never yield a usable token, and no token value is ever logged or shown in the UI.",
      "Refresh tokens rotate on every use; presenting an already-rotated refresh token revokes the whole grant.",
      "The OAuth tables (migrations 023 + 024) have RLS enabled with zero policies — only the service role can read or write them; the browser cannot reach them at all.",
      "A grant is scoped to one user and one workspace and bound to one MCP resource (RFC 8707): a token issued for /api/mcp/chatgpt does not validate for /api/mcp, and vice versa. MCP tool calls are workspace-scoped and scope-enforced; a nxtsend.read token cannot call a write tool.",
      "Sensitive writes (send_email, send_inbox_reply, delete_lead, delete_campaign) need approval in ChatGPT every time. There is no LinkedIn-send tool: no authorized LinkedIn provider exists, and the official LinkedIn API exposes no connection-request/DM endpoints to standard developers.",
      "private_key_jwt client authentication is NOT supported: a client document declaring it is still accepted, but the client is treated as public (PKCE) and any client_assertion at the token endpoint is refused with invalid_client — verifying JWT bearer assertions needs JWKS fetch + RS256/ES256 verification + aud/exp/jti replay protection, a trust surface this server does not implement.",
      "Every MCP tool call and OAuth grant/revoke event is written to the audit log for this workspace (see the activity history above).",
      "Demo Mode refuses the whole ChatGPT surface (OAuth 503/400, MCP 503) — the demo persona is never served to ChatGPT.",
    ],
  },
};

/** True when a grant belongs to this platform (scope prefix or CIMD client origin). */
function grantBelongsToPlatform(grant: MuseGrant, platform: ConnectorPlatform): boolean {
  const prefix = CONNECTOR_COPY[platform].scopePrefix;
  if (grant.scopes.some((s) => s.startsWith(`${prefix}.`))) return true;
  if (platform === "chatgpt" && grant.clientId.startsWith("https://chatgpt.com")) return true;
  if (platform === "muse" && grant.clientId.startsWith("https://agent.meta.ai")) return true;
  return false;
}

/**
 * Live connector panels (detail page only). Everything here comes from
 * the real implementation: endpoint URLs from this deployment's
 * origin, scopes from the OAuth module (SCOPE_DESCRIPTIONS — both
 * muse.* and nxtsend.*), grants + activity from the grants/activity
 * APIs. No state is ever shown as "Connected" unless a real grant
 * exists — the header badge already reflects that (derived from the
 * grants count in GET /api/integrations/status).
 */
function ConnectorLivePanels({
  platform,
  origin,
  status,
  mode,
}: {
  platform: ConnectorPlatform;
  origin: string;
  status: string;
  mode: string;
}) {
  const copy = CONNECTOR_COPY[platform];
  const [grants, setGrants] = React.useState<MuseGrant[] | null>(null);
  const [grantsError, setGrantsError] = React.useState<string | null>(null);
  const [activity, setActivity] = React.useState<MuseActivityEntry[] | null>(null);
  const [activityError, setActivityError] = React.useState<string | null>(null);
  const [revokeBusy, setRevokeBusy] = React.useState<string | null>(null);
  const [revokeError, setRevokeError] = React.useState<string | null>(null);
  const [revokeNotice, setRevokeNotice] = React.useState<string | null>(null);

  const loadGrants = React.useCallback(async () => {
    try {
      const res = await fetch("/api/muse/grants");
      const body = (await res.json().catch(() => null)) as
        | { grants?: MuseGrant[]; error?: string }
        | null;
      if (!res.ok) throw new Error(body?.error ?? `Grants request failed (HTTP ${res.status})`);
      setGrants(body?.grants ?? []);
      setGrantsError(null);
    } catch (err) {
      setGrantsError(err instanceof Error ? err.message : `Failed to load ${copy.label} grants.`);
    }
  }, []);

  const loadActivity = React.useCallback(async () => {
    try {
      const res = await fetch("/api/muse/activity");
      const body = (await res.json().catch(() => null)) as
        | { entries?: MuseActivityEntry[]; error?: string }
        | null;
      if (!res.ok) throw new Error(body?.error ?? `Activity request failed (HTTP ${res.status})`);
      setActivity(body?.entries ?? []);
      setActivityError(null);
    } catch (err) {
      setActivityError(err instanceof Error ? err.message : `Failed to load ${copy.label} activity.`);
    }
  }, []);

  React.useEffect(() => {
    void loadGrants();
    void loadActivity();
  }, [loadGrants, loadActivity]);

  const revokeGrant = async (clientId: string) => {
    setRevokeBusy(clientId);
    setRevokeError(null);
    setRevokeNotice(null);
    try {
      const res = await fetch(`/api/muse/grants?client_id=${encodeURIComponent(clientId)}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? `Revoke failed (HTTP ${res.status})`);
      setRevokeNotice(`Grant for “${clientId}” revoked — ${copy.label} can no longer use it.`);
      await loadGrants();
      await loadActivity();
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : "Revoke failed.");
    } finally {
      setRevokeBusy(null);
    }
  };

  const endpoints = copy.endpoints;
  // Grants are fetched for the whole account (the grants API is
  // platform-agnostic); this panel shows only this platform's
  // grants — see grantBelongsToPlatform.
  const platformGrants = grants === null ? null : grants.filter((g) => grantBelongsToPlatform(g, platform));

  return (
    <>
      <Section title="Live connection status">
        <p className="text-13 text-black-300 leading-relaxed">
          Current status: <strong className="text-white">{status}</strong>.{" "}
          {status === "Connected and Verified"
            ? `At least one active ${copy.label} OAuth grant exists for this workspace — ${copy.label} can call the MCP server on behalf of the granting user(s).`
            : status === "Connected but Not Verified"
              ? `The MCP surface is configured, but no active ${copy.label} grant exists yet — configuration alone is not a connection. Connect from ${copy.label} (steps below) to create a grant.`
              : status === "Demo Mode"
                ? `Demo Mode: the ${copy.label} OAuth + MCP surface refuses demo outright — no grant can be issued or used here.`
                : `The ${copy.label} surface is not fully configured on this deployment — see the environment variables above.`}
        </p>
        {mode === "demo" && (
          <p className="text-12 text-black-400 leading-relaxed">
            Grants and activity are unavailable in Demo Mode by design; they appear here in live mode.
          </p>
        )}
      </Section>

      <Section title="Endpoints — this deployment">
        <div className="divide-y divide-black-700/60">
          {endpoints.map((e) => (
            <div key={e.path} className="py-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-13 font-semibold text-white">{e.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 rounded-xl bg-black-800 border border-black-700 px-3 py-2 font-mono text-12 text-purple-200 break-all">
                  {origin ? `${origin}${e.path}` : e.path}
                </code>
                <CopyButton text={origin ? `${origin}${e.path}` : e.path} />
              </div>
              <p className="text-12 text-black-400 leading-relaxed">{e.note}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title={`Scopes — what a ${copy.label} grant can ask for`}>
        <p className="text-13 text-black-300 leading-relaxed">
          A <code className="font-mono text-black-100">{copy.scopePrefix}.read</code>-only grant is the
          recommended default — it lets {copy.label} look things up without changing anything. The consent
          screen offers it, and a requested scope outside these three is refused, never silently
          widened.
        </p>
        <div className="divide-y divide-black-700/60">
          {(Object.entries(SCOPE_DESCRIPTIONS) as [OAuthScope, string][])
            .filter(([scope]) => scope.startsWith(`${copy.scopePrefix}.`))
            .map(([scope, description]) => (
              <div key={scope} className="py-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-13 text-white">{scope}</code>
                  {scope === `${copy.scopePrefix}.read` && (
                    <Badge variant="blue" size="sm">Recommended default</Badge>
                  )}
                  {scope === `${copy.scopePrefix}.send` && (
                    <Badge variant="error" size="sm">Sensitive</Badge>
                  )}
                </div>
                <p className="text-12 text-black-300 leading-relaxed">{description}</p>
              </div>
            ))}
        </div>
      </Section>

      <Section title={`Connect to ${copy.label}`}>
        <ol className="space-y-2 list-none">
          {copy.connectSteps.map((step, i) => (
            <li key={step} className="flex items-start gap-3 text-13 text-black-300">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-600/20 border border-purple-500/30 text-11 font-bold text-purple-300 mt-0.5">
                {i + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title={copy.grantsTitle}>
        {grantsError && (
          <p className="text-13 text-rose-200 leading-relaxed">{grantsError}</p>
        )}
        {!grantsError && platformGrants === null && (
          <p className="text-13 text-black-400">Loading grants…</p>
        )}
        {!grantsError && platformGrants !== null && platformGrants.length === 0 && (
          <p className="text-13 text-black-300 leading-relaxed">
            {copy.grantsEmpty}
          </p>
        )}
        {platformGrants !== null && platformGrants.length > 0 && (
          <div className="divide-y divide-black-700/60">
            {platformGrants.map((g) => (
              <div key={g.clientId} className="py-3 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-13 font-semibold text-white">{g.clientName}</span>
                  <code className="font-mono text-11 text-black-400 break-all">{g.clientId}</code>
                  <Badge variant={g.active ? "success" : "gray"} size="sm">
                    {g.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <p className="text-12 text-black-300">
                  Scopes: {g.scopes.length > 0 ? g.scopes.join(", ") : "—"}
                </p>
                {/* Scope descriptions come from SCOPE_DESCRIPTIONS, so
                    nxtsend.* grants list with descriptions exactly
                    like muse.* grants — never a bare scope string. */}
                {g.scopes.length > 0 && (
                  <ul className="space-y-0.5">
                    {g.scopes.map((scope) => (
                      <li key={scope} className="text-12 text-black-400 leading-relaxed">
                        <code className="font-mono text-black-200">{scope}</code>
                        {SCOPE_DESCRIPTIONS[scope]
                          ? ` — ${SCOPE_DESCRIPTIONS[scope]}`
                          : " — unknown scope (refused at issue time; report it as a bug)."}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-12 text-black-400">
                  Created {new Date(g.createdAt).toLocaleString()}
                  {g.refreshExpiresAt
                    ? ` · refresh token expires ${new Date(g.refreshExpiresAt).toLocaleString()}`
                    : " · no live refresh token"}
                  {" · "}Last used: not tracked (migration 023 stores no last-used time).
                </p>
                <button
                  type="button"
                  onClick={() => void revokeGrant(g.clientId)}
                  disabled={revokeBusy === g.clientId || !g.active}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/30 hover:bg-rose-950/50 disabled:opacity-50 px-3 py-1.5 text-12 font-semibold text-rose-200 transition-colors"
                >
                  {revokeBusy === g.clientId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {revokeBusy === g.clientId ? "Revoking…" : "Revoke grant"}
                </button>
              </div>
            ))}
          </div>
        )}
        {revokeNotice && <p className="text-13 text-green-300">{revokeNotice}</p>}
        {revokeError && <p className="text-13 text-rose-200">{revokeError}</p>}
        <p className="text-12 text-black-400 leading-relaxed">
          Revoking removes {copy.label}&apos;s access for that grant immediately. Token values are never
          shown here — grants are identified by client name and scopes only.
        </p>
      </Section>

      <Section title="Integration activity history">
        {platform === "chatgpt" && (
          <p className="text-12 text-black-400 leading-relaxed">
            The audit log is shared with the Muse connector — entries here cover MCP tool calls
            and OAuth events from both platforms (actions are recorded as muse.tool.* for both).
          </p>
        )}
        {activityError && (
          <p className="text-13 text-rose-200 leading-relaxed">{activityError}</p>
        )}
        {!activityError && activity === null && (
          <p className="text-13 text-black-400">Loading activity…</p>
        )}
        {!activityError && activity !== null && activity.length === 0 && (
          <p className="text-13 text-black-300 leading-relaxed">
            {copy.activityEmpty}
          </p>
        )}
        {activity !== null && activity.length > 0 && (
          <div className="divide-y divide-black-700/60">
            {activity.map((a, i) => (
              <div key={`${a.created_at}-${a.action}-${i}`} className="py-2.5 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-12 text-white">{a.action}</code>
                  {a.resource && (
                    <span className="font-mono text-11 text-black-400 break-all">{a.resource}</span>
                  )}
                  <span className="text-11 text-black-500">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </div>
                {a.details && <p className="text-12 text-black-300 leading-relaxed">{a.details}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Security & privacy notes">
        <ul className="space-y-1.5">
          {copy.securityNotes.map((note) => (
            <li key={note} className="flex items-start gap-2 text-13 text-black-300">
              <Shield className="h-4 w-4 shrink-0 text-purple-400 mt-0.5" />
              <span className="leading-relaxed">{note}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

function MuseLivePanels({
  origin,
  status,
  mode,
}: {
  origin: string;
  status: string;
  mode: string;
}) {
  return <ConnectorLivePanels platform="muse" origin={origin} status={status} mode={mode} />;
}

function ChatGptLivePanels({
  origin,
  status,
  mode,
}: {
  origin: string;
  status: string;
  mode: string;
}) {
  return <ConnectorLivePanels platform="chatgpt" origin={origin} status={status} mode={mode} />;
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
          The surface itself is implemented:{" "}
          <code className="font-mono text-black-200">src/lib/muse-connector/oauth/</code>{" "}
          (OAuth 2.1 server),{" "}
          <code className="font-mono text-black-200">src/app/api/muse/oauth/</code>{" "}
          and{" "}
          <code className="font-mono text-black-200">src/app/api/muse/grants/</code>{" "}
          (routes),{" "}
          <code className="font-mono text-black-200">src/app/api/mcp/</code>{" "}
          (MCP server),{" "}
          <code className="font-mono text-black-200">src/lib/muse-connector/adapter.ts</code>{" "}
          (the 18 tools), and migration 023. What remains is the
          submission itself (items above) — nothing here has been
          submitted to Meta, and no approval is claimed.
        </p>
      </Section>
    </>
  );
}
