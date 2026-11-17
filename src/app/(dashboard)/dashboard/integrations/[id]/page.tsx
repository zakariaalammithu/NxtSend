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

      {/* Claude live surface: same machinery, Claude copy + claude.* scopes */}
      {d.id === "claude" && (
        <ClaudeLivePanels origin={origin} status={entry.status} mode={data?.mode ?? "demo"} />
      )}

      {/* Zapier live surface: REST API + REST Hooks — a SEPARATE panel.
          ConnectorLivePanels is MCP-specific (it fetches /api/muse/grants +
          /api/muse/activity and renders MCP endpoints from CONNECTOR_COPY);
          Zapier is a REST surface with its own endpoints, scopes and
          trigger/action inventory, so it is not forced through it. */}
      {d.id === "zapier" && (
        <ZapierLivePanels origin={origin} status={entry.status} mode={data?.mode ?? "demo"} />
      )}

      {/* n8n live surface: REST API + webhooks + API keys — a SEPARATE panel.
          Same reason as Zapier: ConnectorLivePanels is MCP-specific;
          n8n is a REST surface with its own endpoints, scopes,
          trigger/action inventory and an API-key management section
          no other panel has. */}
      {d.id === "n8n" && (
        <N8nLivePanels origin={origin} status={entry.status} mode={data?.mode ?? "demo"} />
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
              : d.id === "claude"
              ? "Revoke individual grants from the “Your Claude grants” panel above — revoking removes Claude's access for that grant immediately (every token for that client + user is revoked). Removing the environment variables additionally prevents NEW grants. Past audit entries are kept."
              : d.id === "zapier"
              ? "Revoke individual grants from the “Your Zapier grants” panel above — revoking removes Zapier's access for that grant immediately (every token for that client + user is revoked), and any Zaps using it stop working. Setting ZAPIER_ENABLED=false additionally prevents NEW Zapier API calls (the OAuth routes stay available). Past audit entries and webhook delivery logs are kept; webhook subscriptions created by that grant stay in the outbox tables until they are unsubscribed from Zapier or cleaned up as stale (inactive > 30 days)."
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

interface ZapierSubscriptionEntry {
  id: string;
  event: string;
  target_url: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface ZapierDeliveryEntry {
  id: string;
  event: string;
  subscription_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  next_retry_at: string | null;
  created_at: string;
}

interface MuseActivityEntry {
  action: string;
  resource: string | null;
  details: string;
  created_at: string;
}

type ConnectorPlatform = "muse" | "chatgpt" | "claude";

/**
 * Per-platform copy for the live panels. The machinery (grants +
 * activity APIs, revoke, endpoints rendering) is shared; only the
 * words, the MCP path, the scope prefix and the connect steps
 * differ. The ChatGPT panel lists only grants whose scopes carry
 * the nxtsend.* prefix (or whose client_id is a chatgpt.com CIMD
 * URL); the Muse panel lists only muse.* grants; the Claude panel
 * lists only claude.* grants (or claude.ai / claude.com CIMD
 * clients). A grant holding two prefixes appears in both panels —
 * it genuinely is a grant for both.
 */
const CONNECTOR_COPY: Record<
  ConnectorPlatform,
  {
    label: string;
    mcpPath: string;
    mcpNote: string;
    scopePrefix: "muse" | "nxtsend" | "claude";
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
  claude: {
    label: "Claude",
    mcpPath: "/api/mcp/claude",
    mcpNote:
      "Streamable HTTP, JSON-RPC 2.0. Add this URL in Claude: Customize → Connectors → Add custom connector.",
    scopePrefix: "claude",
    endpoints: [
      {
        label: "MCP endpoint",
        path: "/api/mcp/claude",
        note: "Streamable HTTP, JSON-RPC 2.0. Add this URL in Claude: Customize → Connectors → Add custom connector.",
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
        note: "RFC 9728 root metadata for all MCP resources.",
      },
      {
        label: "Protected-resource metadata (Claude resource)",
        path: "/.well-known/oauth-protected-resource/api/mcp/claude",
        note: "RFC 9728 metadata for the Claude MCP resource.",
      },
    ],
    connectSteps: [
      "In Claude, open Customize → Connectors → Add custom connector, name it NxtSend, and paste the MCP endpoint URL above. Claude registers via Dynamic Client Registration or identifies itself with a CIMD client_id URL — there is no client secret to copy (clients are public by default). Claude's Advanced-settings client ID/secret fields are an optional fallback for pre-registered clients only, not required for this connection.",
      "Sign in on NxtSend's consent screen and choose the scopes. Pick claude.read only unless Claude genuinely needs to change or send things.",
      "Use NxtSend from inside Claude. Sensitive writes (sending email, deleting a lead or a campaign) need your approval in Claude every single time — they can never be set to “Always allow”.",
      "Directory listing is a separate step: submit to Anthropic for review. That submission has NOT been made and no approval is claimed — the custom-connector path above works without it.",
    ],
    grantsTitle: "Your Claude grants",
    grantsEmpty:
      "No Claude grants for your account. A grant appears here after you approve Claude on the consent screen — until then, nothing is connected.",
    activityEmpty:
      "No Claude activity recorded for this workspace yet — MCP tool calls and OAuth grant/revoke events appear here (newest first, up to 50).",
    securityNotes: [
      "Tokens and authorization codes are stored as SHA-256 hashes only — a database read can never yield a usable token, and no token value is ever logged or shown in the UI.",
      "Refresh tokens rotate on every use; presenting an already-rotated refresh token revokes the whole grant.",
      "The OAuth tables (migrations 023 + 024) have RLS enabled with zero policies — only the service role can read or write them; the browser cannot reach them at all.",
      "A grant is scoped to one user and one workspace and bound to one MCP resource (RFC 8707): a token issued for /api/mcp/claude does not validate for /api/mcp or /api/mcp/chatgpt, and vice versa. MCP tool calls are workspace-scoped and scope-enforced; a claude.read token cannot call a write tool.",
      "Sensitive writes (send_email, send_inbox_reply, delete_lead, delete_campaign) need approval in Claude every time. There is no LinkedIn-send tool: no authorized LinkedIn provider exists, and the official LinkedIn API exposes no connection-request/DM endpoints to standard developers.",
      "Every MCP tool call and OAuth grant/revoke event is written to the audit log for this workspace (see the activity history above).",
      "Demo Mode refuses the whole Claude surface (OAuth 503/400, MCP 503) — the demo persona is never served to Claude.",
    ],
  },
};

/** True when a grant belongs to this platform (scope prefix or CIMD client origin). */
function grantBelongsToPlatform(grant: MuseGrant, platform: ConnectorPlatform): boolean {
  const prefix = CONNECTOR_COPY[platform].scopePrefix;
  if (grant.scopes.some((s) => s.startsWith(`${prefix}.`))) return true;
  if (platform === "chatgpt" && grant.clientId.startsWith("https://chatgpt.com")) return true;
  if (platform === "muse" && grant.clientId.startsWith("https://agent.meta.ai")) return true;
  if (
    platform === "claude" &&
    (grant.clientId.startsWith("https://claude.ai") ||
      grant.clientId.startsWith("https://claude.com"))
  )
    return true;
  return false;
}

/**
 * Live connector panels (detail page only). Everything here comes from
 * the real implementation: endpoint URLs from this deployment's
 * origin, scopes from the OAuth module (SCOPE_DESCRIPTIONS — muse.*,
 * nxtsend.* and claude.*), grants + activity from the grants/activity
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

      {(platform === "chatgpt" || platform === "claude") && (
        <Section title={`Tool manifest — ${NXTSEND_TOOL_MANIFEST.length} tools`}>
          <p className="text-12 text-black-400 leading-relaxed">
            Classifications: Read (no state change), Write (creates/changes), Sensitive write
            (irreversible/consequential — approval required every time, never “Always allow”).
            MCP annotations (readOnlyHint / destructiveHint) for each tool are listed in
            docs/chatgpt-integration/MCP_TOOLS.md. There is no LinkedIn-send tool.
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
      )}

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
                    claude.* grants list with descriptions exactly
                    like muse.* / nxtsend.* grants — never a bare
                    scope string. */}
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
        {platform === "claude" && (
          <p className="text-12 text-black-400 leading-relaxed">
            The audit log is shared with the Muse and ChatGPT connectors — entries here cover MCP
            tool calls and OAuth events from all three platforms (actions are recorded as
            muse.tool.* for all of them).
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

function ClaudeLivePanels({
  origin,
  status,
  mode,
}: {
  origin: string;
  status: string;
  mode: string;
}) {
  return <ConnectorLivePanels platform="claude" origin={origin} status={status} mode={mode} />;
}

/** True when a grant belongs to Zapier. The grants API returns client
 * id + scopes only (no redirect URIs), so the scope prefix is the
 * classifier here — and it is sufficient: a Zapier grant is
 * resource-bound to /api/integrations/zapier and always carries
 * zapier.* scopes (there is no zapier.send tier). */
function grantBelongsToZapier(grant: MuseGrant): boolean {
  return grant.scopes.some((s) => s.startsWith("zapier."));
}

interface ZapierHealth {
  mode: string;
  zapierEnabled: boolean;
  version: string;
}

/** Polling triggers — Zapier polls the REST API on the plan's interval (minutes, not instant). */
const ZAPIER_POLLING_TRIGGERS: { name: string; key: string; endpoint: string; dedupe: string }[] = [
  { name: "New Lead", key: "new_lead", endpoint: "GET /v1/leads", dedupe: "Stable lead id" },
  { name: "Lead Updated", key: "updated_lead", endpoint: "GET /v1/leads?order=updated_at_desc", dedupe: "<leadId>__<updated_at> (original id in lead_id)" },
  { name: "New Campaign", key: "new_campaign", endpoint: "GET /v1/campaigns", dedupe: "Stable campaign id" },
  { name: "Campaign Status Changed", key: "campaign_status_changed", endpoint: "GET /v1/campaigns", dedupe: "<campaignId>__<status> (original id in campaign_id)" },
  { name: "New Conversation", key: "new_conversation", endpoint: "GET /v1/conversations", dedupe: "Stable conversation id" },
];

/** Instant (REST Hook) triggers — webhook delivery, best-effort immediate + cron retry, NOT instant-guaranteed. */
const ZAPIER_INSTANT_TRIGGERS: { name: string; key: string; event: string }[] = [
  { name: "New Lead (Instant)", key: "new_lead_instant", event: "lead.created" },
  { name: "Lead Updated (Instant)", key: "updated_lead_instant", event: "lead.updated" },
  { name: "Lead Added to Campaign (Instant)", key: "lead_added_to_campaign_instant", event: "lead.added_to_campaign" },
  { name: "Lead Removed From Campaign (Instant)", key: "lead_removed_from_campaign_instant", event: "lead.removed_from_campaign" },
  { name: "New Campaign (Instant)", key: "new_campaign_instant", event: "campaign.created" },
  { name: "Campaign Status Changed (Instant)", key: "campaign_status_changed_instant", event: "campaign.status_changed" },
  { name: "New Reply (Instant)", key: "new_reply_instant", event: "conversation.reply_created" },
  { name: "Subscription Changed (Instant)", key: "subscription_changed_instant", event: "subscription.changed" },
];

const ZAPIER_ACTIONS: { name: string; key: string; note: string }[] = [
  { name: "Create Lead", key: "create_lead", note: "Deduped by email — a duplicate returns the existing lead with duplicate: true." },
  { name: "Update Lead", key: "update_lead", note: "Includes status; emits lead.updated with changed_fields." },
  { name: "Import Leads", key: "import_leads", note: "Bulk, at most 100 rows per call; skipped covers invalid rows and duplicates." },
  { name: "Create Campaign", key: "create_campaign", note: "Draft only — Zapier cannot launch a campaign. At least one sequence step is required. A retried create can duplicate a draft (no natural dedup key)." },
  { name: "Update Campaign", key: "update_campaign", note: "Name / type / description only." },
  { name: "Pause Campaign", key: "pause_campaign", note: "Needs an active campaign." },
  { name: "Resume Campaign", key: "resume_campaign", note: "Needs a paused campaign." },
  { name: "Stop Campaign", key: "stop_campaign", note: "Moves the campaign to archived — there is no stopped status." },
  { name: "Archive Campaign", key: "archive_campaign", note: "Refuses an already-archived campaign." },
  { name: "Add Leads to Campaign", key: "add_leads_to_campaign", note: "Returns {enrolled, skipped, notFound}." },
  { name: "Remove Lead From Campaign", key: "remove_lead_from_campaign", note: "Removes the enrollment; the lead record is kept." },
  { name: "Send Reply", key: "send_reply", note: "Email only — LinkedIn replies are refused 422 by the server. IdempotencyKey replays a retried reply instead of sending twice." },
];

const ZAPIER_SEARCHES: { name: string; key: string; note: string }[] = [
  { name: "Find Lead", key: "find_lead", note: "By name, email, or ID. Paired with Create Lead as “Find or Create Lead”." },
  { name: "Find Campaign", key: "find_campaign", note: "By name, ID, or status. Paired with Create Campaign as “Find or Create Campaign”." },
  { name: "Find Conversation", key: "find_conversation", note: "By search text." },
  { name: "Find LinkedIn Account", key: "find_account", note: "By search text. Read-only — accounts cannot be created from Zapier." },
  { name: "Get Campaign Performance", key: "get_campaign_performance", note: "Real stats via loadCampaignStats; accepted is always null — no data source exists, never fabricated." },
];

const ZAPIER_DROPDOWNS: { name: string; key: string; note: string }[] = [
  { name: "Campaigns", key: "list_campaigns", note: "GET /v1/dropdowns/campaigns." },
  { name: "LinkedIn accounts", key: "list_accounts", note: "GET /v1/dropdowns/accounts." },
  { name: "Lead statuses", key: "list_lead_statuses", note: "GET /v1/dropdowns/lead-statuses." },
  { name: "Sequences", key: "list_sequences", note: "GET /v1/dropdowns/sequences?campaign_id= — campaign_id is required (steps belong to a campaign). No templates dropdown exists — there is no message-template store in the product." },
];

const ZAPIER_ENDPOINTS: { label: string; path: string; note: string }[] = [
  { label: "Zapier REST API (v1)", path: "/api/integrations/zapier/v1", note: "Bearer access token for the Zapier resource + zapier.read (GETs) / zapier.write (mutations). Rate limit 120 req/min per token (in-memory, per-process). Demo Mode → 503." },
  { label: "Health (public, no auth)", path: "/api/integrations/zapier/health", note: "Returns {mode, zapierEnabled, version}. Lets Zapier (and the owner) check the surface without a token." },
  { label: "Connection test", path: "/api/integrations/zapier/v1/auth/test", note: "Returns the user, workspace and scopes for the token — never token values. Zapier calls this when an account is connected." },
  { label: "Authorize (consent screen)", path: "/api/muse/oauth/authorize", note: "Shared OAuth server. GET shows the consent screen; POST approves or denies." },
  { label: "Token", path: "/api/muse/oauth/token", note: "authorization_code + refresh_token. PKCE optional for confidential clients only; public clients still require PKCE S256." },
  { label: "Revoke", path: "/api/muse/oauth/revoke", note: "RFC 7009 token revocation." },
  { label: "Register (Dynamic Client Registration)", path: "/api/muse/oauth/register", note: "RFC 7591 — one-time call that creates the Zapier client (see docs/zapier-integration/ZAPIER_SERVER.md for the exact curl). No pre-registered client secret exists." },
  { label: "Protected-resource metadata", path: "/.well-known/oauth-protected-resource/api/integrations/zapier", note: "RFC 9728 metadata for the Zapier resource (https://<origin>/api/integrations/zapier)." },
];

const ZAPIER_CONNECT_STEPS: string[] = [
  "In the Zapier developer dashboard, create the app and copy its exact OAuth Redirect URL (https://zapier.com/dashboard/auth/oauth/return/App<digits>CLIAPI/ — the App ID is assigned at registration and may change after publish/beta, in which case the client must be re-registered with the new URL).",
  "Register the Zapier OAuth client with the one-time Dynamic Client Registration call (exact curl in docs/zapier-integration/ZAPIER_SERVER.md). The response contains client_id + client_secret — shown once, store it in the Zapier dashboard immediately. There is no ZAPIER_OAUTH_CLIENT_SECRET env var.",
  "In the Zapier app settings, enter CLIENT_ID / CLIENT_SECRET (from the DCR response) and ZAPIER_APP_BASE_URL (https://nxtsend.com in production), with Authorization URL https://<your-domain>/api/muse/oauth/authorize, Token URL https://<your-domain>/api/muse/oauth/token, scopes zapier.read zapier.write, and resource https://<your-domain>/api/integrations/zapier.",
  "In the Zapier editor, add an NxtSend account: sign in on NxtSend's consent screen and choose the scopes. Pick zapier.read only unless the Zap genuinely needs to change things. A grant appears in the grants panel below only after that approval — until then, nothing is connected.",
  "Build Zaps from the triggers, actions and searches listed below. Instant triggers use REST Hooks (webhook subscriptions are created by Zapier against hooks.zapier.com); polling triggers check the REST API on the Zap's plan interval.",
  "Publication is a separate step: Zapier review (~1 week), then 90-day Beta, then Public. That submission has NOT been made and no approval is claimed — the developer-platform path above works without it.",
];

/**
 * Live Zapier panels (detail page only). Everything here comes from
 * the real implementation: endpoint URLs from this deployment's
 * origin, scopes from the OAuth module (SCOPE_DESCRIPTIONS —
 * zapier.*), the health endpoint, grants from the grants API, and
 * the trigger/action/search inventory from the Platform CLI app
 * (integrations/zapier/). No state is ever shown as "Connected"
 * unless a real grant exists — the header badge already reflects
 * that (derived from the Zapier grant count in GET
 * /api/integrations/status).
 *
 * Two honest gaps, stated here rather than faked:
 *   - Webhook subscriptions + delivery status: the subscriptions
 *     list endpoint (GET /v1/webhooks/subscriptions) is
 *     Zapier-token-authenticated, and the outbox tables are
 *     service-role-only, so there is no session-authenticated
 *     endpoint this page could call to list a workspace's Zapier
 *     subscriptions or deliveries. Subscriptions are created from
 *     Zapier; delivery failures are visible in Zapier's Task
 *     History and in the admin Zapier panel. A
 *     session-authenticated subscriptions/deliveries endpoint is a
 *     PENDING follow-up (deliberately not added here — the Zapier
 *     API tree is frozen for the server agent).
 *   - Activity history: GET /api/muse/activity returns only
 *     muse.% / MUSE_OAUTH% audit rows, so zapier.* entries never
 *     reach this page. The zapier.* audit entries DO exist in
 *     audit_logs (see the admin Zapier panel); a Zapier-aware
 *     activity source is PENDING.
 */
function ZapierLivePanels({
  origin,
  status,
  mode,
}: {
  origin: string;
  status: string;
  mode: string;
}) {
  const [health, setHealth] = React.useState<ZapierHealth | null>(null);
  const [healthError, setHealthError] = React.useState<string | null>(null);
  const [grants, setGrants] = React.useState<MuseGrant[] | null>(null);
  const [grantsError, setGrantsError] = React.useState<string | null>(null);
  const [revokeBusy, setRevokeBusy] = React.useState<string | null>(null);
  const [revokeError, setRevokeError] = React.useState<string | null>(null);
  const [revokeNotice, setRevokeNotice] = React.useState<string | null>(null);
  const [subs, setSubs] = React.useState<ZapierSubscriptionEntry[] | null>(null);
  const [deliveries, setDeliveries] = React.useState<ZapierDeliveryEntry[] | null>(null);
  const [subsError, setSubsError] = React.useState<string | null>(null);
  const [zapierActivity, setZapierActivity] = React.useState<MuseActivityEntry[] | null>(null);
  const [zapierActivityError, setZapierActivityError] = React.useState<string | null>(null);

  const loadHealth = React.useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/zapier/health");
      const body = (await res.json().catch(() => null)) as ZapierHealth | { error?: string } | null;
      if (!res.ok) throw new Error((body as { error?: string } | null)?.error ?? `Health request failed (HTTP ${res.status})`);
      setHealth(body as ZapierHealth);
      setHealthError(null);
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : "Failed to load Zapier health.");
    }
  }, []);

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
      setGrantsError(err instanceof Error ? err.message : "Failed to load Zapier grants.");
    }
  }, []);

  const loadWebhookStatus = React.useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/zapier/subscriptions");
      const body = (await res.json().catch(() => null)) as
        | {
            subscriptions?: ZapierSubscriptionEntry[];
            deliveries?: ZapierDeliveryEntry[];
            error?: string;
          }
        | null;
      if (!res.ok) throw new Error(body?.error ?? `Webhook status request failed (HTTP ${res.status})`);
      setSubs(body?.subscriptions ?? []);
      setDeliveries(body?.deliveries ?? []);
      setSubsError(null);
    } catch (err) {
      setSubsError(err instanceof Error ? err.message : "Failed to load Zapier webhook status.");
    }
  }, []);

  const loadZapierActivity = React.useCallback(async () => {
    try {
      const res = await fetch("/api/muse/activity?platform=zapier");
      const body = (await res.json().catch(() => null)) as
        | { entries?: MuseActivityEntry[]; error?: string }
        | null;
      if (!res.ok) throw new Error(body?.error ?? `Activity request failed (HTTP ${res.status})`);
      setZapierActivity(body?.entries ?? []);
      setZapierActivityError(null);
    } catch (err) {
      setZapierActivityError(err instanceof Error ? err.message : "Failed to load Zapier activity.");
    }
  }, []);

  React.useEffect(() => {
    void loadHealth();
    void loadGrants();
    void loadWebhookStatus();
    void loadZapierActivity();
  }, [loadHealth, loadGrants, loadWebhookStatus, loadZapierActivity]);

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
      setRevokeNotice(`Grant for “${clientId}” revoked — Zapier can no longer use it.`);
      await loadGrants();
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : "Revoke failed.");
    } finally {
      setRevokeBusy(null);
    }
  };

  const zapierGrants = grants === null ? null : grants.filter(grantBelongsToZapier);

  return (
    <>
      <Section title="Live connection status">
        <p className="text-13 text-black-300 leading-relaxed">
          Current status: <strong className="text-white">{status}</strong>.{" "}
          {status === "Connected and Verified"
            ? "At least one active Zapier OAuth grant exists for this workspace — Zapier can call the REST API on behalf of the granting user(s)."
            : status === "Connected but Not Verified"
              ? "The Zapier REST surface is configured, but no active Zapier grant exists yet — configuration alone is not a connection. Connect from Zapier (steps below) to create a grant."
              : status === "Demo Mode"
                ? "Demo Mode: the Zapier REST API + webhook surface refuses demo outright — no grant can be issued or used here."
                : "The Zapier surface is not fully configured on this deployment — see the environment variables above."}
        </p>
        {healthError ? (
          <p className="text-13 text-rose-200 leading-relaxed">{healthError}</p>
        ) : health ? (
          <p className="text-13 text-black-300 leading-relaxed">
            API health (GET /api/integrations/zapier/health): mode{" "}
            <code className="font-mono text-black-100">{health.mode}</code> · Zapier{" "}
            <code className="font-mono text-black-100">{health.zapierEnabled ? "enabled" : "disabled"}</code> · API
            version <code className="font-mono text-black-100">{health.version}</code>. The health
            endpoint proves the route answers — it does not prove Zapier is connected; only a grant
            does that.
          </p>
        ) : (
          <p className="text-13 text-black-400">Loading API health…</p>
        )}
        {mode === "demo" && (
          <p className="text-12 text-black-400 leading-relaxed">
            Grants are unavailable in Demo Mode by design; they appear here in live mode.
          </p>
        )}
        <p className="text-13 text-black-300 leading-relaxed">
          <strong className="text-white">Not published on Zapier.</strong> The OAuth + REST +
          webhook surface is implemented and testable in Zapier&apos;s developer platform, but no
          app has been submitted to Zapier and Zapier has not approved anything — it does not
          appear in Zapier&apos;s app directory.
        </p>
      </Section>

      <Section title="Endpoints — this deployment">
        <div className="divide-y divide-black-700/60">
          {ZAPIER_ENDPOINTS.map((e) => (
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

      <Section title="Scopes — what a Zapier grant can ask for">
        <p className="text-13 text-black-300 leading-relaxed">
          A <code className="font-mono text-black-100">zapier.read</code>-only grant is the
          recommended default — it lets Zapier look things up without changing anything. The consent
          screen offers it, and a requested scope outside these two is refused, never silently
          widened. There is no <code className="font-mono text-black-100">zapier.send</code> tier:
          Zapier never sends LinkedIn messages, and email inbox replies sent through the Zapier API
          are covered by the write tier.
        </p>
        <div className="divide-y divide-black-700/60">
          {(Object.entries(SCOPE_DESCRIPTIONS) as [OAuthScope, string][])
            .filter(([scope]) => scope.startsWith("zapier."))
            .map(([scope, description]) => (
              <div key={scope} className="py-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-13 text-white">{scope}</code>
                  {scope === "zapier.read" && (
                    <Badge variant="blue" size="sm">Recommended default</Badge>
                  )}
                </div>
                <p className="text-12 text-black-300 leading-relaxed">{description}</p>
              </div>
            ))}
        </div>
      </Section>

      <Section title="Triggers — polling (5)">
        <p className="text-12 text-black-400 leading-relaxed">
          Zapier checks the REST API on the Zap&apos;s plan interval — minutes, not instant. Each
          poll returns at most the 100 newest items; an update or status change on a record outside
          that window is not seen by polling — use the Instant version.
        </p>
        <div className="divide-y divide-black-700/60">
          {ZAPIER_POLLING_TRIGGERS.map((t) => (
            <div key={t.key} className="py-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-13 font-semibold text-white">{t.name}</span>
                <code className="font-mono text-11 text-black-400">{t.key}</code>
              </div>
              <p className="text-12 text-black-300"><code className="font-mono text-black-200">{t.endpoint}</code></p>
              <p className="text-12 text-black-400">Dedupe: {t.dedupe}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Triggers — instant / REST Hooks (8)">
        <p className="text-12 text-black-400 leading-relaxed">
          Webhook delivery: the mutation enqueues and a best-effort immediate attempt is made;
          failures retry on the daily 06:00 cron (5m → 30m backoff, max 3 attempts, then dead) — a
          failed delivery may wait up to ~24h for its next retry. Do not treat these as instant
          guaranteed delivery. A 410 from Zapier deactivates the subscription. Zapier does not
          document verifying the X-NxtSend-Signature / X-NxtSend-Timestamp signing headers.
        </p>
        <div className="divide-y divide-black-700/60">
          {ZAPIER_INSTANT_TRIGGERS.map((t) => (
            <div key={t.key} className="py-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-13 font-semibold text-white">{t.name}</span>
                <code className="font-mono text-11 text-black-400">{t.key}</code>
              </div>
              <p className="text-12 text-black-300">Event: <code className="font-mono text-black-200">{t.event}</code></p>
            </div>
          ))}
        </div>
        <p className="text-12 text-black-400 leading-relaxed">
          There is no polling version of Lead Added/Removed, New Reply, or Subscription Changed: no
          list endpoint surfaces those events.
        </p>
      </Section>

      <Section title="Actions (12)">
        <div className="divide-y divide-black-700/60">
          {ZAPIER_ACTIONS.map((a) => (
            <div key={a.key} className="py-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-13 font-semibold text-white">{a.name}</span>
                <code className="font-mono text-11 text-black-400">{a.key}</code>
              </div>
              <p className="text-12 text-black-300 leading-relaxed">{a.note}</p>
            </div>
          ))}
        </div>
        <p className="text-12 text-black-400 leading-relaxed">
          Not implemented (deliberately): any LinkedIn send/accept action (no provider; accepted is
          always null), a Create Draft action (no draft concept exists in the product), and
          date-range reporting (no date filter exists in the stats loaders).
        </p>
      </Section>

      <Section title="Searches (5) + dynamic dropdowns (4)">
        <div className="divide-y divide-black-700/60">
          {ZAPIER_SEARCHES.map((s) => (
            <div key={s.key} className="py-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-13 font-semibold text-white">{s.name}</span>
                <code className="font-mono text-11 text-black-400">{s.key}</code>
                <Badge variant="blue" size="sm">Search</Badge>
              </div>
              <p className="text-12 text-black-300 leading-relaxed">{s.note}</p>
            </div>
          ))}
          {ZAPIER_DROPDOWNS.map((s) => (
            <div key={s.key} className="py-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-13 font-semibold text-white">{s.name}</span>
                <code className="font-mono text-11 text-black-400">{s.key}</code>
                <Badge variant="gray" size="sm">Hidden dropdown</Badge>
              </div>
              <p className="text-12 text-black-300 leading-relaxed">{s.note}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Webhook subscriptions + delivery status">
        <p className="text-13 text-black-300 leading-relaxed">
          Subscriptions are created from Zapier (POST /v1/webhooks/subscribe): the target URL must
          be https on hooks.zapier.com or zapier.com, and the per-subscription HMAC secret is
          generated server-side and never returned. Delivery latency: best-effort immediate
          attempt, then the daily 06:00 cron retry (max 3 attempts, then dead) — a failed delivery
          may wait up to ~24h for its next retry. Cross-check per-Zap runs in Zapier&apos;s Task
          History, and platform-wide failures in the admin Zapier panel
          (/admin/integrations/zapier).
        </p>
        {subsError && (
          <p className="text-13 text-rose-200 leading-relaxed">{subsError}</p>
        )}
        {!subsError && subs === null && (
          <p className="text-13 text-black-400">Loading webhook subscriptions…</p>
        )}
        {!subsError && subs !== null && subs.length === 0 && (
          <p className="text-13 text-black-300 leading-relaxed">
            No webhook subscriptions for this workspace yet — one appears here when a Zap with an
            Instant trigger is turned on in Zapier.
          </p>
        )}
        {subs !== null && subs.length > 0 && (
          <div className="divide-y divide-black-700/60">
            {subs.map((s) => (
              <div key={s.id} className="py-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-13 text-white">{s.event}</code>
                  <Badge variant={s.active ? "success" : "gray"} size="sm">
                    {s.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <p className="text-12 text-black-300 break-all">{s.target_url}</p>
                <p className="text-11 text-black-400">
                  Created {new Date(s.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
        {!subsError && deliveries !== null && deliveries.length === 0 && (
          <p className="text-13 text-black-300 leading-relaxed">
            No deliveries recorded yet.
          </p>
        )}
        {deliveries !== null && deliveries.length > 0 && (
          <div className="divide-y divide-black-700/60">
            {deliveries.map((d) => (
              <div key={d.id} className="py-2.5 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-12 text-white">{d.event}</code>
                  <Badge
                    variant={
                      d.status === "delivered"
                        ? "success"
                        : d.status === "dead"
                          ? "error"
                          : "gray"
                    }
                    size="sm"
                  >
                    {d.status}
                  </Badge>
                  <span className="text-11 text-black-500">
                    {new Date(d.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-12 text-black-400">
                  Attempts: {d.attempts}/{d.max_attempts}
                  {d.last_error ? ` · ${d.last_error}` : ""}
                  {d.status !== "delivered" && d.next_retry_at
                    ? ` · next retry ${new Date(d.next_retry_at).toLocaleString()}`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Connect to Zapier">
        <ol className="space-y-2 list-none">
          {ZAPIER_CONNECT_STEPS.map((step, i) => (
            <li key={step} className="flex items-start gap-3 text-13 text-black-300">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-600/20 border border-purple-500/30 text-11 font-bold text-purple-300 mt-0.5">
                {i + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Your Zapier grants">
        {grantsError && (
          <p className="text-13 text-rose-200 leading-relaxed">{grantsError}</p>
        )}
        {!grantsError && zapierGrants === null && (
          <p className="text-13 text-black-400">Loading grants…</p>
        )}
        {!grantsError && zapierGrants !== null && zapierGrants.length === 0 && (
          <p className="text-13 text-black-300 leading-relaxed">
            No Zapier grants for your account. A grant appears here after you approve Zapier on the
            consent screen — until then, nothing is connected.
          </p>
        )}
        {zapierGrants !== null && zapierGrants.length > 0 && (
          <div className="divide-y divide-black-700/60">
            {zapierGrants.map((g) => (
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
          Revoking removes Zapier&apos;s access for that grant immediately. Token values are never
          shown here — grants are identified by client name and scopes only.
        </p>
      </Section>

      <Section title="Integration activity history">
        <p className="text-12 text-black-400 leading-relaxed">
          The Zapier API writes <code className="font-mono text-black-100">zapier.*</code> audit
          entries (lead created/updated, campaign created/status changed, reply sent, webhook
          subscribed/unsubscribed) to the workspace audit log; OAuth-server-level events keep
          their <code className="font-mono text-black-100">MUSE_OAUTH_*</code> names.
        </p>
        {zapierActivityError && (
          <p className="text-13 text-rose-200 leading-relaxed">{zapierActivityError}</p>
        )}
        {!zapierActivityError && zapierActivity === null && (
          <p className="text-13 text-black-400">Loading activity…</p>
        )}
        {!zapierActivityError && zapierActivity !== null && zapierActivity.length === 0 && (
          <p className="text-13 text-black-300 leading-relaxed">
            No Zapier activity recorded for this workspace yet — Zapier API calls and webhook
            events appear here (newest first, up to 50).
          </p>
        )}
        {zapierActivity !== null && zapierActivity.length > 0 && (
          <div className="divide-y divide-black-700/60">
            {zapierActivity.map((a, i) => (
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
          {[
            "Tokens and authorization codes are stored as SHA-256 hashes only — a database read can never yield a usable token, and no token value is ever logged or shown in the UI.",
            "Refresh tokens rotate on every use. For Zapier grants only, re-presenting an already-rotated refresh token within 10 minutes of the rotation rotates again from the live successor instead of revoking the grant (Zapier's auto-refresh can race a retry); outside the window, or for Muse/ChatGPT/Claude grants, reuse still revokes the grant.",
            "PKCE is optional for confidential clients only (Zapier's standard OAuth2 client sends no PKCE); public clients still require PKCE S256, and a stored challenge must still be satisfied by a matching verifier.",
            "The OAuth tables (migrations 023 + 024 + 026) have RLS enabled with zero policies — only the service role can read or write them; the browser cannot reach them at all. The Zapier webhook tables (migration 025) are the same: RLS enabled, zero policies, service-role only.",
            "A grant is scoped to one user and one workspace and bound to one resource (RFC 8707): a token issued for /api/integrations/zapier does not validate for /api/mcp*, and vice versa. API calls are workspace-scoped and scope-enforced; a zapier.read token cannot call a write endpoint.",
            "There is no LinkedIn-send action: no authorized LinkedIn provider exists, and the official LinkedIn API exposes no connection-request/DM endpoints to standard developers. Email inbox replies through Zapier are covered by the zapier.write tier and need no per-send approval in Zapier (unlike the MCP sensitive-write approvals).",
            "Every mutating Zapier API call is written to the audit log for this workspace as a zapier.* entry (see the admin Zapier panel). OAuth-server-level events keep their MUSE_OAUTH_* names — they describe the shared authorization server, not the calling platform.",
            "Demo Mode refuses the whole Zapier surface (OAuth 503/400, REST API 503) — the demo persona is never served to Zapier.",
          ].map((note) => (
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

function grantBelongsToN8n(grant: MuseGrant): boolean {
  return grant.scopes.some((s) => s.startsWith("n8n."));
}

interface N8nHealth {
  mode: string;
  n8nEnabled: boolean;
  version: string;
}

type N8nSubscriptionEntry = ZapierSubscriptionEntry;
type N8nDeliveryEntry = ZapierDeliveryEntry;

/** An n8n API key as listed by GET /api/integrations/n8n/api-keys — hashes are never returned. */
interface N8nApiKeyEntry {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

/**
 * n8n scopes come from SCOPE_DESCRIPTIONS (the OAuth module now
 * carries n8n.read / n8n.write — Worker B landed them), filtered
 * by the n8n.* prefix the way ZapierLivePanels does. The
 * descriptions are quoted verbatim from
 * src/lib/muse-connector/oauth/scopes.ts; do not paraphrase them
 * here.
 */

/** Polling triggers — the NxtSend Trigger polls the REST API on the workflow's interval (minutes, not instant). Design from the node package (nodes/shared/constants.ts POLL_ENDPOINTS): every webhook event is pollable — subscription.changed polls by comparing the live subscription list against ids seen on previous polls, since no list endpoint timestamps subscriptions. */
const N8N_POLLING_TRIGGERS: { name: string; key: string; endpoint: string; dedupe: string }[] = [
  { name: "New Lead", key: "new_lead", endpoint: "GET /v1/leads", dedupe: "Stable lead id" },
  { name: "Lead Updated", key: "updated_lead", endpoint: "GET /v1/leads?order=updated_at_desc", dedupe: "<leadId>__<updated_at> (original id in lead_id)" },
  { name: "Lead Added to Campaign", key: "lead_added_to_campaign", endpoint: "GET /v1/leads?order=updated_at_desc", dedupe: "Lead + campaign enrolment seen on a changed lead row" },
  { name: "Lead Removed From Campaign", key: "lead_removed_from_campaign", endpoint: "GET /v1/leads?order=updated_at_desc", dedupe: "Lead + campaign enrolment missing from a changed lead row" },
  { name: "New Campaign", key: "new_campaign", endpoint: "GET /v1/campaigns", dedupe: "Stable campaign id" },
  { name: "Campaign Status Changed", key: "campaign_status_changed", endpoint: "GET /v1/campaigns", dedupe: "<campaignId>__<status> (original id in campaign_id)" },
  { name: "New Reply", key: "new_reply", endpoint: "GET /v1/conversations", dedupe: "Reply id on a changed conversation" },
  { name: "Subscription Changed", key: "subscription_changed", endpoint: "GET /v1/webhooks/subscriptions", dedupe: "Subscription list compared against ids seen on previous polls (no timestamp field exists)" },
];

/** Webhook triggers — the NxtSend Trigger node subscribes to these events; delivery is best-effort immediate + cron retry, NOT instant-guaranteed. */
const N8N_WEBHOOK_TRIGGERS: { name: string; key: string; event: string }[] = [
  { name: "New Lead (Webhook)", key: "new_lead_webhook", event: "lead.created" },
  { name: "Lead Updated (Webhook)", key: "updated_lead_webhook", event: "lead.updated" },
  { name: "Lead Added to Campaign (Webhook)", key: "lead_added_to_campaign_webhook", event: "lead.added_to_campaign" },
  { name: "Lead Removed From Campaign (Webhook)", key: "lead_removed_from_campaign_webhook", event: "lead.removed_from_campaign" },
  { name: "New Campaign (Webhook)", key: "new_campaign_webhook", event: "campaign.created" },
  { name: "Campaign Status Changed (Webhook)", key: "campaign_status_changed_webhook", event: "campaign.status_changed" },
  { name: "New Reply (Webhook)", key: "new_reply_webhook", event: "conversation.reply_created" },
  { name: "Subscription Changed (Webhook)", key: "subscription_changed_webhook", event: "subscription.changed" },
];

const N8N_ACTIONS: { name: string; key: string; note: string }[] = [
  { name: "Create Lead", key: "create_lead", note: "Deduped by email — a duplicate returns the existing lead with duplicate: true." },
  { name: "Update Lead", key: "update_lead", note: "Includes status; emits lead.updated with changed_fields." },
  { name: "Import Leads", key: "import_leads", note: "Bulk, at most 100 rows per call; skipped covers invalid rows and duplicates." },
  { name: "Create Campaign", key: "create_campaign", note: "Draft only — n8n cannot launch a campaign. At least one sequence step is required. A retried create can duplicate a draft (no natural dedup key)." },
  { name: "Update Campaign", key: "update_campaign", note: "Name / type / description only." },
  { name: "Pause Campaign", key: "pause_campaign", note: "Needs an active campaign." },
  { name: "Resume Campaign", key: "resume_campaign", note: "Needs a paused campaign." },
  { name: "Stop Campaign", key: "stop_campaign", note: "Moves the campaign to archived — there is no stopped status." },
  { name: "Archive Campaign", key: "archive_campaign", note: "Refuses an already-archived campaign." },
  { name: "Add Leads to Campaign", key: "add_leads_to_campaign", note: "Returns {enrolled, skipped, notFound}." },
  { name: "Remove Lead From Campaign", key: "remove_lead_from_campaign", note: "Removes the enrollment; the lead record is kept." },
  { name: "Send Reply", key: "send_reply", note: "Email only — LinkedIn replies are refused 422 by the server. IdempotencyKey replays a retried reply instead of sending twice." },
];

const N8N_SEARCHES: { name: string; key: string; note: string }[] = [
  { name: "Find Lead", key: "find_lead", note: "By name, email, or ID. Paired with Create Lead as “Find or Create Lead”." },
  { name: "Find Campaign", key: "find_campaign", note: "By name, ID, or status. Paired with Create Campaign as “Find or Create Campaign”." },
  { name: "Find Conversation", key: "find_conversation", note: "By search text." },
  { name: "Find LinkedIn Account", key: "find_account", note: "By search text. Read-only — accounts cannot be created from n8n." },
  { name: "Get Campaign Performance", key: "get_campaign_performance", note: "Real stats via loadCampaignStats; accepted is always null — no data source exists, never fabricated." },
];

const N8N_DROPDOWNS: { name: string; key: string; note: string }[] = [
  { name: "Campaigns", key: "list_campaigns", note: "GET /v1/dropdowns/campaigns." },
  { name: "LinkedIn accounts", key: "list_accounts", note: "GET /v1/dropdowns/accounts." },
  { name: "Lead statuses", key: "list_lead_statuses", note: "GET /v1/dropdowns/lead-statuses." },
  { name: "Sequences", key: "list_sequences", note: "GET /v1/dropdowns/sequences?campaign_id= — campaign_id is required (steps belong to a campaign). No templates dropdown exists — there is no message-template store in the product." },
];

const N8N_ENDPOINTS: { label: string; path: string; note: string }[] = [
  { label: "n8n REST API (v1)", path: "/api/integrations/n8n/v1", note: "Authorization: Bearer <apiKey | OAuth2 access token> (per the node package — the key is a Bearer token, not an X-Api-Key header) + n8n.read (GETs) / n8n.write (mutations). Rate limit 120 req/min. Demo Mode → 503." },
  { label: "Health (public, no auth)", path: "/api/integrations/n8n/health", note: "Returns {mode, n8nEnabled, version}. Lets n8n (and the owner) check the surface without a token." },
  { label: "Connection test", path: "/api/integrations/n8n/v1/auth/test", note: "Returns the user, workspace and scopes for the token or key — never token/key values. The node calls this when a credential is tested." },
  { label: "API-key management", path: "/api/integrations/n8n/api-keys", note: "Session-authenticated (this page): GET lists keys, POST creates one (key shown once), DELETE revokes. List responses never contain hashes or key values." },
  { label: "Webhook subscribe", path: "/api/integrations/n8n/webhooks/subscribe", note: "The NxtSend Trigger node subscribes here; the per-subscription HMAC secret is generated server-side and never returned. Unsubscribe at /api/integrations/n8n/webhooks/unsubscribe." },
  { label: "Webhook subscriptions (session)", path: "/api/integrations/n8n/subscriptions", note: "Session-authenticated list of this workspace's n8n subscriptions plus the last 20 deliveries — what the panel below renders." },
  { label: "Authorize (consent screen)", path: "/api/muse/oauth/authorize", note: "Shared OAuth server. GET shows the consent screen; POST approves or denies." },
  { label: "Token", path: "/api/muse/oauth/token", note: "authorization_code + refresh_token. PKCE optional for confidential clients only; public clients still require PKCE S256." },
  { label: "Revoke", path: "/api/muse/oauth/revoke", note: "RFC 7009 token revocation." },
  { label: "Register (Dynamic Client Registration)", path: "/api/muse/oauth/register", note: "RFC 7591 — one-time call that creates the n8n client (see docs/n8n-integration/API_AUTHENTICATION.md for the exact curl). No pre-registered client secret exists." },
  { label: "Protected-resource metadata", path: "/.well-known/oauth-protected-resource/api/integrations/n8n", note: "RFC 9728 metadata for the n8n resource (https://<origin>/api/integrations/n8n)." },
];

const N8N_CONNECT_STEPS: string[] = [
  "Install the community node in n8n (Settings → Community Nodes → n8n-nodes-nxtsend). The package is NOT on npm yet, so until it is published install it from the repo path (integrations/n8n-nodes-nxtsend/) instead — see docs/n8n-integration/N8N_SETUP.md. Restart n8n after installing a community node.",
  "Create an API key in the API keys section below (name + scopes + optional expiry) OR connect via OAuth 2.0. For OAuth, register the n8n client with the one-time Dynamic Client Registration call (exact curl in docs/n8n-integration/API_AUTHENTICATION.md). The response contains client_id + client_secret — shown once, store it in n8n immediately. There is no N8N_OAUTH_CLIENT_SECRET env var.",
  "In n8n, create the NxtSend API credential: Base URL https://<your-domain> (e.g. https://nxtsend.com) plus the API key, or OAuth2 with Authorization URL https://<your-domain>/api/muse/oauth/authorize, Token URL https://<your-domain>/api/muse/oauth/token, scopes n8n.read n8n.write, and resource https://<your-domain>/api/integrations/n8n.",
  "Test the credential in n8n. A green test means the key or grant works — it does not mean a workflow is connected. A grant appears in the grants panel below only after OAuth approval; an API key appears in the API keys section below immediately after creation.",
  "Add the NxtSend node (actions/searches) or the NxtSend Trigger (webhooks + polling) to a workflow. Webhooks are a separate step: the Trigger node subscribes via POST /api/integrations/n8n/webhooks/subscribe.",
  "Publication and n8n verification are separate steps: publish the node on npm, then submit it for community-node verification. Neither submission has been made and no approval is claimed — the repo-path install above works without them.",
];

/**
 * Live n8n panels (detail page only). Mirrors ZapierLivePanels:
 * endpoint URLs from this deployment's origin, health endpoint,
 * grants from the grants API (filtered client-side by the n8n.*
 * scope prefix), webhook subscriptions + last 20 deliveries from
 * the session route, activity from /api/muse/activity, and the
 * trigger/action/search inventory as static lists from the
 * implemented REST surface. PLUS the API-key management section,
 * which has no Zapier equivalent (Zapier has no API keys).
 *
 * No state is ever shown as "Connected" unless a real OAuth grant
 * exists, a recently-used API key exists, or an active webhook
 * subscription exists — the header badge already reflects the
 * grant count (GET /api/integrations/status). An API key alone is
 * reported here, in the API-key panel, as a key signal — it does
 * not upgrade the header status, which only sees grants.
 *
 * Honest gaps, stated here rather than faked:
 *   - The node package (integrations/n8n-nodes-nxtsend/) is NOT
 *     published on npm and NOT verified by n8n; its build passes
 *     and its tests pass 126/126 (coordinator pass), but no
 *     live run in a real n8n instance has happened yet. The
 *     inventory below is the implemented/designed surface, not a
 *     claim that a directory-listed node exists.
 *   - The v1 REST API, health endpoint and API-key routes HAVE
 *     landed (Worker A + coordinator pass), as have the webhook
 *     subscribe/subscriptions routes (Worker B), the n8n.*
 *     scopes and the grants-by-origin n8n branch — the grants
 *     panel and the scopes section read the real data. If a
 *     fetch still fails (e.g. migrations 028/029 not applied),
 *     this panel reports those fetch errors honestly instead
 *     of showing empty states as if nothing were configured.
 *   - The exact create-key response field is read tolerantly
 *     (key / api_key.key / plaintext_key); the server route
 *     returns the key once as the top-level `key` field
 *     (`POST /api/integrations/n8n/api-keys`, 201 — confirmed
 *     in code). If the route returns none of them the panel
 *     reports the failure instead of inventing a key.
 *   - Activity history: GET /api/muse/activity?platform=n8n
 *     depends on the activity route carrying n8n.* entries; if
 *     it returns none, the panel says so rather than showing
 *     Zapier/Muse rows as n8n activity.
 */
function N8nLivePanels({
  origin,
  status,
  mode,
}: {
  origin: string;
  status: string;
  mode: string;
}) {
  const [health, setHealth] = React.useState<N8nHealth | null>(null);
  const [healthError, setHealthError] = React.useState<string | null>(null);
  const [grants, setGrants] = React.useState<MuseGrant[] | null>(null);
  const [grantsError, setGrantsError] = React.useState<string | null>(null);
  const [revokeBusy, setRevokeBusy] = React.useState<string | null>(null);
  const [revokeError, setRevokeError] = React.useState<string | null>(null);
  const [revokeNotice, setRevokeNotice] = React.useState<string | null>(null);
  const [subs, setSubs] = React.useState<N8nSubscriptionEntry[] | null>(null);
  const [deliveries, setDeliveries] = React.useState<N8nDeliveryEntry[] | null>(null);
  const [subsError, setSubsError] = React.useState<string | null>(null);
  const [n8nActivity, setN8nActivity] = React.useState<MuseActivityEntry[] | null>(null);
  const [n8nActivityError, setN8nActivityError] = React.useState<string | null>(null);
  const [apiKeys, setApiKeys] = React.useState<N8nApiKeyEntry[] | null>(null);
  const [apiKeysError, setApiKeysError] = React.useState<string | null>(null);
  const [newKeyName, setNewKeyName] = React.useState("");
  const [newKeyRead, setNewKeyRead] = React.useState(true);
  const [newKeyWrite, setNewKeyWrite] = React.useState(false);
  const [newKeyExpiry, setNewKeyExpiry] = React.useState("");
  const [createBusy, setCreateBusy] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [createdKey, setCreatedKey] = React.useState<string | null>(null);
  const [createdKeyName, setCreatedKeyName] = React.useState<string | null>(null);
  const [revokeKeyBusy, setRevokeKeyBusy] = React.useState<string | null>(null);
  const [revokeKeyError, setRevokeKeyError] = React.useState<string | null>(null);
  const [revokeKeyNotice, setRevokeKeyNotice] = React.useState<string | null>(null);

  const loadHealth = React.useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/n8n/health");
      const body = (await res.json().catch(() => null)) as N8nHealth | { error?: string } | null;
      if (!res.ok) throw new Error((body as { error?: string } | null)?.error ?? `Health request failed (HTTP ${res.status})`);
      setHealth(body as N8nHealth);
      setHealthError(null);
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : "Failed to load n8n health.");
    }
  }, []);

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
      setGrantsError(err instanceof Error ? err.message : "Failed to load n8n grants.");
    }
  }, []);

  const loadWebhookStatus = React.useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/n8n/subscriptions");
      const body = (await res.json().catch(() => null)) as
        | {
            subscriptions?: N8nSubscriptionEntry[];
            deliveries?: N8nDeliveryEntry[];
            error?: string;
          }
        | null;
      if (!res.ok) throw new Error(body?.error ?? `Webhook status request failed (HTTP ${res.status})`);
      setSubs(body?.subscriptions ?? []);
      setDeliveries(body?.deliveries ?? []);
      setSubsError(null);
    } catch (err) {
      setSubsError(err instanceof Error ? err.message : "Failed to load n8n webhook status.");
    }
  }, []);

  const loadN8nActivity = React.useCallback(async () => {
    try {
      const res = await fetch("/api/muse/activity?platform=n8n");
      const body = (await res.json().catch(() => null)) as
        | { entries?: MuseActivityEntry[]; error?: string }
        | null;
      if (!res.ok) throw new Error(body?.error ?? `Activity request failed (HTTP ${res.status})`);
      setN8nActivity(body?.entries ?? []);
      setN8nActivityError(null);
    } catch (err) {
      setN8nActivityError(err instanceof Error ? err.message : "Failed to load n8n activity.");
    }
  }, []);

  const loadApiKeys = React.useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/n8n/api-keys");
      const body = (await res.json().catch(() => null)) as
        | { keys?: N8nApiKeyEntry[]; api_keys?: N8nApiKeyEntry[]; error?: string }
        | null;
      if (!res.ok) throw new Error(body?.error ?? `API keys request failed (HTTP ${res.status})`);
      setApiKeys(body?.keys ?? body?.api_keys ?? []);
      setApiKeysError(null);
    } catch (err) {
      setApiKeysError(err instanceof Error ? err.message : "Failed to load n8n API keys.");
    }
  }, []);

  React.useEffect(() => {
    void loadHealth();
    void loadGrants();
    void loadWebhookStatus();
    void loadN8nActivity();
    void loadApiKeys();
  }, [loadHealth, loadGrants, loadWebhookStatus, loadN8nActivity, loadApiKeys]);

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
      setRevokeNotice(`Grant for “${clientId}” revoked — n8n can no longer use it.`);
      await loadGrants();
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : "Revoke failed.");
    } finally {
      setRevokeBusy(null);
    }
  };

  const createApiKey = async () => {
    setCreateBusy(true);
    setCreateError(null);
    setCreatedKey(null);
    setCreatedKeyName(null);
    try {
      const scopes = [
        ...(newKeyRead ? ["n8n.read"] : []),
        ...(newKeyWrite ? ["n8n.write"] : []),
      ];
      if (scopes.length === 0) throw new Error("Pick at least one scope (n8n.read is the recommended default).");
      if (!newKeyName.trim()) throw new Error("Give the key a name (e.g. “Production n8n”).");
      const res = await fetch("/api/integrations/n8n/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName.trim(),
          scopes,
          ...(newKeyExpiry ? { expires_at: newKeyExpiry } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { key?: string; api_key?: { key?: string }; plaintext_key?: string; error?: string }
        | null;
      if (!res.ok) throw new Error(body?.error ?? `Create key failed (HTTP ${res.status})`);
      const plain = body?.key ?? body?.api_key?.key ?? body?.plaintext_key ?? null;
      if (!plain) throw new Error("The server created the key but did not return its value — it cannot be recovered. Revoke it and create a new one.");
      setCreatedKey(plain);
      setCreatedKeyName(newKeyName.trim());
      setNewKeyName("");
      setNewKeyExpiry("");
      await loadApiKeys();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Create key failed.");
    } finally {
      setCreateBusy(false);
    }
  };

  const revokeApiKey = async (keyId: string, keyName: string) => {
    if (!window.confirm(`Revoke the API key “${keyName}”? n8n workflows using it will start failing with 401 immediately. This cannot be undone.`)) return;
    setRevokeKeyBusy(keyId);
    setRevokeKeyError(null);
    setRevokeKeyNotice(null);
    try {
      const res = await fetch(`/api/integrations/n8n/api-keys?id=${encodeURIComponent(keyId)}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? `Revoke failed (HTTP ${res.status})`);
      setRevokeKeyNotice(`API key “${keyName}” revoked.`);
      await loadApiKeys();
    } catch (err) {
      setRevokeKeyError(err instanceof Error ? err.message : "Revoke failed.");
    } finally {
      setRevokeKeyBusy(null);
    }
  };

  const n8nGrants = grants === null ? null : grants.filter(grantBelongsToN8n);
  const activeKeys = apiKeys === null ? null : apiKeys.filter((k) => !k.revoked_at);
  const recentlyUsedKey = activeKeys !== null && activeKeys.some((k) => k.last_used_at !== null);

  return (
    <>
      <Section title="Live connection status">
        <p className="text-13 text-black-300 leading-relaxed">
          Current status: <strong className="text-white">{status}</strong>.{" "}
          {status === "Connected and Verified"
            ? "At least one active n8n OAuth grant exists for this workspace — n8n can call the REST API on behalf of the granting user(s)."
            : status === "Connected but Not Verified"
              ? "The n8n REST surface is configured, but no active n8n grant exists yet — configuration alone is not a connection. Connect from n8n (steps below) to create a grant, or create an API key below."
              : status === "Demo Mode"
                ? "Demo Mode: the n8n REST API + webhook surface refuses demo outright — no grant can be issued or used here."
                : "The n8n surface is not fully configured on this deployment — see the environment variables above."}
        </p>
        {healthError ? (
          <p className="text-13 text-rose-200 leading-relaxed">{healthError}</p>
        ) : health ? (
          <p className="text-13 text-black-300 leading-relaxed">
            API health (GET /api/integrations/n8n/health): mode{" "}
            <code className="font-mono text-black-100">{health.mode}</code> · n8n{" "}
            <code className="font-mono text-black-100">{health.n8nEnabled ? "enabled" : "disabled"}</code> · API
            version <code className="font-mono text-black-100">{health.version}</code>. The health
            endpoint proves the route answers — it does not prove n8n is connected; only a grant, a
            recently-used API key, or an active webhook subscription does that.
          </p>
        ) : (
          <p className="text-13 text-black-400">Loading API health…</p>
        )}
        {mode === "demo" && (
          <p className="text-12 text-black-400 leading-relaxed">
            Grants and API keys are unavailable in Demo Mode by design; they appear here in live mode.
          </p>
        )}
        {recentlyUsedKey && (
          <p className="text-13 text-black-300 leading-relaxed">
            <strong className="text-white">API-key signal:</strong> at least one API key below has
            been used — n8n has called the API with a key. That is a real connection signal; the
            header status above only reflects OAuth grants.
          </p>
        )}
        <p className="text-13 text-black-300 leading-relaxed">
          <strong className="text-white">Not published on npm / not verified by n8n.</strong> The
          OAuth + API-key + REST + webhook surface is implemented, but the{" "}
          <code className="font-mono text-black-100">n8n-nodes-nxtsend</code> package has not been
          published on npm and n8n has not verified anything — it does not appear in n8n&apos;s
          community-node directory.
        </p>
      </Section>

      <Section title="Endpoints — this deployment">
        <div className="divide-y divide-black-700/60">
          {N8N_ENDPOINTS.map((e) => (
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

      <Section title="Scopes — what an n8n grant or key can ask for">
        <p className="text-13 text-black-300 leading-relaxed">
          An <code className="font-mono text-black-100">n8n.read</code>-only grant or key is the
          recommended default — it lets n8n look things up without changing anything. The consent
          screen offers it, and a requested scope outside these two is refused, never silently
          widened. There is no <code className="font-mono text-black-100">n8n.send</code> tier:
          n8n never sends LinkedIn messages, and email inbox replies sent through the n8n API are
          covered by the write tier.
        </p>
        <div className="divide-y divide-black-700/60">
          {(Object.entries(SCOPE_DESCRIPTIONS) as [OAuthScope, string][])
            .filter(([scope]) => scope.startsWith("n8n."))
            .map(([scope, description]) => (
              <div key={scope} className="py-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-13 text-white">{scope}</code>
                  {scope === "n8n.read" && (
                    <Badge variant="blue" size="sm">Recommended default</Badge>
                  )}
                </div>
                <p className="text-12 text-black-300 leading-relaxed">{description}</p>
              </div>
            ))}
        </div>
      </Section>

      <Section title="API keys — create, list, revoke">
        <p className="text-13 text-black-300 leading-relaxed">
          API keys are the second way n8n authenticates (the other is OAuth 2.0, above). A key is
          scoped, optionally expirable, and revocable. Keys are stored as hashes only and the key
          value is shown <strong className="text-white">exactly once</strong> at creation — copy it
          into n8n immediately; it can never be shown again. A lost key must be revoked and
          replaced. NxtSend API keys are not n8n instance credentials — your n8n login is
          unrelated and is never entered here.
        </p>
        {apiKeysError && (
          <p className="text-13 text-rose-200 leading-relaxed">{apiKeysError}</p>
        )}
        {!apiKeysError && apiKeys === null && (
          <p className="text-13 text-black-400">Loading API keys…</p>
        )}
        {!apiKeysError && apiKeys !== null && apiKeys.length === 0 && (
          <p className="text-13 text-black-300 leading-relaxed">
            No API keys yet — create one below. Until a key exists (or an OAuth grant, above),
            nothing is connected.
          </p>
        )}
        {apiKeys !== null && apiKeys.length > 0 && (
          <div className="divide-y divide-black-700/60">
            {apiKeys.map((k) => (
              <div key={k.id} className="py-3 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-13 font-semibold text-white">{k.name}</span>
                  <code className="font-mono text-11 text-black-400">{k.key_prefix}…</code>
                  <Badge variant={k.revoked_at ? "gray" : "success"} size="sm">
                    {k.revoked_at ? "Revoked" : "Active"}
                  </Badge>
                </div>
                <p className="text-12 text-black-300">
                  Scopes: {k.scopes.length > 0 ? k.scopes.join(", ") : "—"}
                </p>
                <p className="text-12 text-black-400">
                  Created {new Date(k.created_at).toLocaleString()}
                  {k.expires_at ? ` · expires ${new Date(k.expires_at).toLocaleString()}` : " · never expires"}
                  {" · "}Last used: {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "never"}
                  {k.revoked_at ? ` · revoked ${new Date(k.revoked_at).toLocaleString()}` : ""}
                </p>
                {!k.revoked_at && (
                  <button
                    type="button"
                    onClick={() => void revokeApiKey(k.id, k.name)}
                    disabled={revokeKeyBusy === k.id}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/30 hover:bg-rose-950/50 disabled:opacity-50 px-3 py-1.5 text-12 font-semibold text-rose-200 transition-colors"
                  >
                    {revokeKeyBusy === k.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    {revokeKeyBusy === k.id ? "Revoking…" : "Revoke key"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {revokeKeyNotice && <p className="text-13 text-green-300">{revokeKeyNotice}</p>}
        {revokeKeyError && <p className="text-13 text-rose-200">{revokeKeyError}</p>}
        <div className="space-y-3 pt-2">
          <h3 className="text-13 font-semibold text-white">Create a new API key</h3>
          <label className="block space-y-1">
            <span className="text-12 text-black-300">Name</span>
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Production n8n"
              className="w-full rounded-xl bg-black-800 border border-black-700 px-3 py-2 text-13 text-white placeholder:text-black-500"
            />
          </label>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-13 text-black-300">
              <input type="checkbox" checked={newKeyRead} onChange={(e) => setNewKeyRead(e.target.checked)} />
              <code className="font-mono text-black-100">n8n.read</code> (recommended)
            </label>
            <label className="flex items-center gap-2 text-13 text-black-300">
              <input type="checkbox" checked={newKeyWrite} onChange={(e) => setNewKeyWrite(e.target.checked)} />
              <code className="font-mono text-black-100">n8n.write</code>
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-12 text-black-300">Expiry (optional — leave blank for no expiry)</span>
            <input
              type="date"
              value={newKeyExpiry}
              onChange={(e) => setNewKeyExpiry(e.target.value)}
              className="w-full rounded-xl bg-black-800 border border-black-700 px-3 py-2 text-13 text-white"
            />
          </label>
          <button
            type="button"
            onClick={() => void createApiKey()}
            disabled={createBusy}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-4 py-2 text-13 font-semibold text-white transition-colors"
          >
            {createBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {createBusy ? "Creating…" : "Create API key"}
          </button>
          {createError && <p className="text-13 text-rose-200">{createError}</p>}
          {createdKey && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 space-y-2">
              <p className="text-13 font-semibold text-amber-200">
                Copy it now — this key will never be shown again.
              </p>
              <p className="text-12 text-black-300 leading-relaxed">
                Key “{createdKeyName}” was created. Store it in n8n&apos;s NxtSend API credential
                immediately; after you leave this box there is no way to recover it.
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 rounded-xl bg-black-800 border border-black-700 px-3 py-2 font-mono text-12 text-amber-100 break-all">
                  {createdKey}
                </code>
                <CopyButton text={createdKey} />
              </div>
              <button
                type="button"
                onClick={() => { setCreatedKey(null); setCreatedKeyName(null); }}
                className="inline-flex items-center gap-2 rounded-xl border border-black-600 px-3 py-1.5 text-12 font-semibold text-black-300 hover:text-white transition-colors"
              >
                I&apos;ve copied it — hide the key
              </button>
            </div>
          )}
        </div>
      </Section>

      <Section title="Triggers — polling (8)">
        <p className="text-12 text-black-400 leading-relaxed">
          The NxtSend Trigger polls the REST API on the workflow&apos;s interval — minutes,
          not instant. Each poll returns at most the 100 newest items; an update or status change on
          a record outside that window is not seen by polling — use the webhook version.
          Subscription Changed polls by comparing the live subscription list against ids seen on
          previous polls (no timestamp field exists for subscriptions). There is no separate New
          Conversation poll in the node — a brand-new conversation with no reply yet is only seen
          once it has a reply (New Reply poll); that gap is flagged in the integration report.
        </p>
        <div className="divide-y divide-black-700/60">
          {N8N_POLLING_TRIGGERS.map((t) => (
            <div key={t.key} className="py-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-13 font-semibold text-white">{t.name}</span>
                <code className="font-mono text-11 text-black-400">{t.key}</code>
              </div>
              <p className="text-12 text-black-300"><code className="font-mono text-black-200">{t.endpoint}</code></p>
              <p className="text-12 text-black-400">Dedupe: {t.dedupe}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Triggers — webhook (8)">
        <p className="text-12 text-black-400 leading-relaxed">
          Webhook delivery: the mutation enqueues and a best-effort immediate attempt is made;
          failures retry on the daily 06:00 cron (5m → 30m backoff, max 3 attempts, then dead) — a
          failed delivery may wait up to ~24h for its next retry. Do not treat these as instant
          guaranteed delivery. A 410 from n8n deactivates the subscription. Verify the
          X-NxtSend-Signature / X-NxtSend-Timestamp signing headers in the receiving workflow.
        </p>
        <div className="divide-y divide-black-700/60">
          {N8N_WEBHOOK_TRIGGERS.map((t) => (
            <div key={t.key} className="py-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-13 font-semibold text-white">{t.name}</span>
                <code className="font-mono text-11 text-black-400">{t.key}</code>
              </div>
              <p className="text-12 text-black-300">Event: <code className="font-mono text-black-200">{t.event}</code></p>
            </div>
          ))}
        </div>
        <p className="text-12 text-black-400 leading-relaxed">
          Every webhook event is pollable in the Trigger (the node&apos;s POLL_ENDPOINTS map covers
          all 8). LinkedIn connection-accepted / reply templates are skipped entirely — no event
          source exists for them (see docs/n8n-integration/WORKFLOW_TEMPLATES.md).
        </p>
      </Section>

      <Section title="Actions (12)">
        <div className="divide-y divide-black-700/60">
          {N8N_ACTIONS.map((a) => (
            <div key={a.key} className="py-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-13 font-semibold text-white">{a.name}</span>
                <code className="font-mono text-11 text-black-400">{a.key}</code>
              </div>
              <p className="text-12 text-black-300 leading-relaxed">{a.note}</p>
            </div>
          ))}
        </div>
        <p className="text-12 text-black-400 leading-relaxed">
          Not implemented (deliberately): any LinkedIn send/accept action (no provider; accepted is
          always null), a Create Draft action (no draft concept exists in the product), campaign
          launch (campaigns are draft-only — create, then launch from the NxtSend dashboard), and
          date-range reporting (no date filter exists in the stats loaders). The node also exposes
          operations beyond these 12 contract actions — Delete Lead, Lead Update Status, Sequence
          steps + follow-ups (get/replace/schedule/cancel/execution status), LinkedIn Account Get
          and Get Status, Conversation Get Replies, and Analytics (campaign/lead statistics, account
          activity, compare campaigns, usage report). Those node operations map to endpoints in the
          node&apos;s OPERATION_ENDPOINTS map, and every one of them has a server route.
        </p>
      </Section>

      <Section title="Searches (5) + dynamic dropdowns (4)">
        <div className="divide-y divide-black-700/60">
          {N8N_SEARCHES.map((s) => (
            <div key={s.key} className="py-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-13 font-semibold text-white">{s.name}</span>
                <code className="font-mono text-11 text-black-400">{s.key}</code>
                <Badge variant="blue" size="sm">Search</Badge>
              </div>
              <p className="text-12 text-black-300 leading-relaxed">{s.note}</p>
            </div>
          ))}
          {N8N_DROPDOWNS.map((s) => (
            <div key={s.key} className="py-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-13 font-semibold text-white">{s.name}</span>
                <code className="font-mono text-11 text-black-400">{s.key}</code>
                <Badge variant="gray" size="sm">Hidden dropdown</Badge>
              </div>
              <p className="text-12 text-black-300 leading-relaxed">{s.note}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Webhook subscriptions + delivery status">
        <p className="text-13 text-black-300 leading-relaxed">
          Subscriptions are created from n8n — the NxtSend Trigger node subscribes via POST
          /api/integrations/n8n/webhooks/subscribe — and the per-subscription HMAC secret is
          generated server-side and never returned. Delivery latency: best-effort immediate
          attempt, then the daily 06:00 cron retry (max 3 attempts, then dead) — a failed delivery
          may wait up to ~24h for its next retry. Cross-check per-workflow runs in n8n&apos;s
          Executions, and platform-wide failures in the admin n8n panel (/admin/integrations/n8n).
        </p>
        {subsError && (
          <p className="text-13 text-rose-200 leading-relaxed">{subsError}</p>
        )}
        {!subsError && subs === null && (
          <p className="text-13 text-black-400">Loading webhook subscriptions…</p>
        )}
        {!subsError && subs !== null && subs.length === 0 && (
          <p className="text-13 text-black-300 leading-relaxed">
            No webhook subscriptions for this workspace yet — one appears here when a workflow with
            a webhook-mode NxtSend Trigger is activated in n8n.
          </p>
        )}
        {subs !== null && subs.length > 0 && (
          <div className="divide-y divide-black-700/60">
            {subs.map((s) => (
              <div key={s.id} className="py-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-13 text-white">{s.event}</code>
                  <Badge variant={s.active ? "success" : "gray"} size="sm">
                    {s.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <p className="text-12 text-black-300 break-all">{s.target_url}</p>
                <p className="text-11 text-black-400">
                  Created {new Date(s.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
        {!subsError && deliveries !== null && deliveries.length === 0 && (
          <p className="text-13 text-black-300 leading-relaxed">
            No deliveries recorded yet.
          </p>
        )}
        {deliveries !== null && deliveries.length > 0 && (
          <div className="divide-y divide-black-700/60">
            {deliveries.map((d) => (
              <div key={d.id} className="py-2.5 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-12 text-white">{d.event}</code>
                  <Badge
                    variant={
                      d.status === "delivered"
                        ? "success"
                        : d.status === "dead"
                          ? "error"
                          : "gray"
                    }
                    size="sm"
                  >
                    {d.status}
                  </Badge>
                  <span className="text-11 text-black-500">
                    {new Date(d.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-12 text-black-400">
                  Attempts: {d.attempts}/{d.max_attempts}
                  {d.last_error ? ` · ${d.last_error}` : ""}
                  {d.status !== "delivered" && d.next_retry_at
                    ? ` · next retry ${new Date(d.next_retry_at).toLocaleString()}`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Connect to n8n">
        <ol className="space-y-2 list-none">
          {N8N_CONNECT_STEPS.map((step, i) => (
            <li key={step} className="flex items-start gap-3 text-13 text-black-300">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-600/20 border border-purple-500/30 text-11 font-bold text-purple-300 mt-0.5">
                {i + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Your n8n grants">
        {grantsError && (
          <p className="text-13 text-rose-200 leading-relaxed">{grantsError}</p>
        )}
        {!grantsError && n8nGrants === null && (
          <p className="text-13 text-black-400">Loading grants…</p>
        )}
        {!grantsError && n8nGrants !== null && n8nGrants.length === 0 && (
          <p className="text-13 text-black-300 leading-relaxed">
            No n8n grants for your account. A grant appears here after you approve n8n on the
            consent screen — until then, nothing is connected via OAuth (an API key above is the
            other path).
          </p>
        )}
        {n8nGrants !== null && n8nGrants.length > 0 && (
          <div className="divide-y divide-black-700/60">
            {n8nGrants.map((g) => (
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
          Revoking removes n8n&apos;s access for that grant immediately. Token values are never
          shown here — grants are identified by client name and scopes only.
        </p>
      </Section>

      <Section title="Integration activity history">
        <p className="text-12 text-black-400 leading-relaxed">
          The n8n API writes <code className="font-mono text-black-100">n8n.*</code> audit
          entries (lead created/updated, campaign created/status changed, reply sent, webhook
          subscribed/unsubscribed, API key created/revoked) to the workspace audit log;
          OAuth-server-level events keep their{" "}
          <code className="font-mono text-black-100">MUSE_OAUTH_*</code> names.
        </p>
        {n8nActivityError && (
          <p className="text-13 text-rose-200 leading-relaxed">{n8nActivityError}</p>
        )}
        {!n8nActivityError && n8nActivity === null && (
          <p className="text-13 text-black-400">Loading activity…</p>
        )}
        {!n8nActivityError && n8nActivity !== null && n8nActivity.length === 0 && (
          <p className="text-13 text-black-300 leading-relaxed">
            No n8n activity recorded for this workspace yet — n8n API calls and webhook
            events appear here (newest first, up to 50).
          </p>
        )}
        {n8nActivity !== null && n8nActivity.length > 0 && (
          <div className="divide-y divide-black-700/60">
            {n8nActivity.map((a, i) => (
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
          {[
            "API keys are stored as hashes only and shown exactly once at creation — a database read can never yield a usable key, no key value is ever logged or shown in the UI again, and a lost key must be revoked and replaced. NxtSend API keys are not n8n instance credentials.",
            "Tokens and authorization codes are stored as SHA-256 hashes only — a database read can never yield a usable token, and no token value is ever logged or shown in the UI.",
            "Refresh tokens rotate on every use. For n8n (and Zapier) grants only, re-presenting an already-rotated refresh token within 10 minutes of the rotation rotates again from the live successor instead of revoking the grant (n8n's auto-refresh can race a retry); outside the window, or for Muse/ChatGPT/Claude grants, reuse still revokes the grant. Inside the window a stolen refresh token could also be exchanged once more — the window is short, the token is single-use per rotation step, and the grant is revoked on any reuse outside the window.",
            "PKCE is optional for confidential clients only; public clients still require PKCE S256, and a stored challenge must still be satisfied by a matching verifier.",
            "The OAuth tables (migrations 023 + 024 + 026) have RLS enabled with zero policies — only the service role can read or write them; the browser cannot reach them at all. The shared webhook tables (migration 025, platform discriminator in 029) are the same: RLS enabled, zero policies, service-role only. The n8n API-key table (migration 028, `nxtsend_api_keys`) follows the same rule.",
            "A grant is scoped to one user and one workspace and bound to one resource (RFC 8707): a token issued for /api/integrations/n8n does not validate for /api/mcp* or /api/integrations/zapier, and vice versa. API calls are workspace-scoped and scope-enforced; an n8n.read token or key cannot call a write endpoint.",
            "Per-subscription webhook secrets are generated server-side at subscribe time and never returned — neither this page nor the admin panel can display one.",
            "There is no LinkedIn-send action: no authorized LinkedIn provider exists, and the official LinkedIn API exposes no connection-request/DM endpoints to standard developers. Email inbox replies through n8n are covered by the n8n.write tier.",
            "Every mutating n8n API call is written to the audit log for this workspace as an n8n.* entry (see the admin n8n panel). OAuth-server-level events keep their MUSE_OAUTH_* names — they describe the shared authorization server, not the calling platform.",
            "Demo Mode refuses the whole n8n surface (OAuth 503/400, REST API 503) — the demo persona is never served to n8n.",
          ].map((note) => (
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
