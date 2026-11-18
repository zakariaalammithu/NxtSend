"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, KeyRound, Webhook, BookOpen, Shield } from "lucide-react";
import { DemoBanner, Badge } from "@/components/ui";
import { INTEGRATION_REGISTRY } from "@/lib/integrations-center/registry";
import {
  ALL_OAUTH_SCOPES,
  SCOPE_DESCRIPTIONS,
} from "@/lib/muse-connector/oauth/scopes";
import { WEBHOOK_EVENT_DESCRIPTIONS } from "@/lib/integrations/rest/events";
import {
  REST_PLATFORMS,
  REST_ENDPOINTS,
  REST_HEALTH_ENDPOINTS,
  OAUTH_ENDPOINTS,
  MCP_SERVERS,
  REST_ERRORS,
  OAUTH_ERRORS,
  RATE_LIMITS,
  WEBHOOK_DELIVERY,
  API_EXAMPLES,
  type RestPlatformId,
} from "./reference";

/**
 * Dashboard → Developers — the API reference for the integration
 * surface that actually exists: the six platform REST APIs
 * (Zapier, n8n, Make, Pabbly, Albato, Activepieces), the shared
 * OAuth 2.1 server, n8n API keys, platform webhook subscriptions
 * and the three hosted MCP servers.
 *
 * Everything on this page is derived from the implementation:
 * the endpoint table is pinned to the route files by
 * __tests__/reference.test.ts, scopes and webhook events are
 * imported from their source modules, and the credential checklist
 * is rendered from the Integration Center registry. Nothing is
 * documented from a roadmap.
 *
 * The public marketing Developers page (/developers) documents the
 * outbound-webhook surface — events, payload envelope and signature
 * verification — and this page links to it rather than duplicating
 * that content. The REST API documented here is the
 * platform-integration surface (the platforms call INTO NxtSend);
 * it is not a general public API for workspaces beyond those
 * platforms and the MCP servers.
 */

const CHECKLIST_CATEGORIES = [
  "CRM",
  "Email Outreach",
  "Lead Enrichment",
  "Email Verification",
  "Communication",
  "Productivity",
] as const;

const CHECKLIST_AUTOMATION_IDS = ["make", "pabbly", "albato", "activepieces"] as const;

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <figure className="overflow-hidden rounded-xl border border-black-700 bg-black-800">
      <figcaption className="border-b border-black-700 px-4 py-2 text-11 font-semibold uppercase tracking-wider text-black-400">
        {label}
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-12 leading-relaxed text-purple-100/90">
        {code}
      </pre>
    </figure>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="glass-card p-6 space-y-4">
      <h2 className="text-16 font-bold text-white">{title}</h2>
      {children}
    </section>
  );
}

export default function DevelopersPage() {
  const [platformId, setPlatformId] = React.useState<RestPlatformId>("n8n");
  const platform = REST_PLATFORMS.find((p) => p.id === platformId) ?? REST_PLATFORMS[1];
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const visibleEndpoints = REST_ENDPOINTS.filter(
    (e) => e.platforms === "all" || (e.platforms === "n8n-family" && platform.extendedRoutes)
  );
  const health = REST_HEALTH_ENDPOINTS.find((h) => h.platform === platform.id);

  const checklistEntries = INTEGRATION_REGISTRY.filter(
    (d) =>
      (CHECKLIST_CATEGORIES as readonly string[]).includes(d.category) ||
      (CHECKLIST_AUTOMATION_IDS as readonly string[]).includes(d.id)
  );

  const automationScopes = (ALL_OAUTH_SCOPES as readonly string[]).filter((s) =>
    /^(zapier|n8n|make|pabbly|albato|activepieces)\./.test(s)
  );

  return (
    <div className="space-y-6 pb-14">
      <DemoBanner feature="Developer API" />

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">Developers</h1>
          <Badge variant="blue" size="sm">REST API v1</Badge>
        </div>
        <p className="mt-1 text-14 text-black-300 leading-relaxed max-w-3xl">
          The integration surface that exists today: six platform REST APIs, one shared OAuth 2.1
          server, scoped API keys for n8n, webhook subscriptions and three hosted MCP servers.
          Every endpoint below is verified against the route files — if it is not listed, it does
          not exist.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/dashboard/developers/api-keys"
            className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2 text-13 font-semibold text-white transition-colors"
          >
            <KeyRound className="h-4 w-4" /> API keys
          </Link>
          <Link
            href="/dashboard/developers/webhooks"
            className="inline-flex items-center gap-1.5 rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-4 py-2 text-13 font-semibold text-black-100 transition-colors"
          >
            <Webhook className="h-4 w-4" /> Webhook subscriptions
          </Link>
          <Link
            href="/dashboard/integrations"
            className="inline-flex items-center gap-1.5 rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-4 py-2 text-13 font-semibold text-black-100 transition-colors"
          >
            Integration Center <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/developers"
            className="inline-flex items-center gap-1.5 rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-4 py-2 text-13 font-semibold text-black-100 transition-colors"
          >
            <BookOpen className="h-4 w-4" /> Public webhook docs
          </Link>
        </div>
      </div>

      {/* Authentication */}
      <Section id="authentication" title="Authentication — OAuth 2.1 + API keys">
        <p className="text-13 text-black-300 leading-relaxed">
          Every platform call is authenticated one of two ways. <strong className="text-white">OAuth 2.0</strong>{" "}
          (all six platforms): the platform holds an access token issued by NxtSend&apos;s shared
          authorization server, bound to one user, one workspace and one platform resource (RFC
          8707) — a token issued for <code className="font-mono text-black-100">/api/integrations/n8n</code>{" "}
          does not validate for Zapier, and vice versa. <strong className="text-white">API keys</strong>{" "}
          (n8n only): a <code className="font-mono text-black-100">nxt_live_…</code> key created on
          the{" "}
          <Link href="/dashboard/developers/api-keys" className="font-semibold text-purple-300 hover:text-white transition-colors">
            API keys page
          </Link>{" "}
          authorizes the n8n v1 API only — a key presented to another platform&apos;s API is refused.
          Demo Mode refuses both paths with 503: demo data is never served to a platform.
        </p>
        <div className="divide-y divide-black-700/60">
          {OAUTH_ENDPOINTS.map((e) => (
            <div key={e.path} className="py-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={e.method === "GET" ? "blue" : "purple"} size="sm">{e.method}</Badge>
                <code className="font-mono text-13 text-white">{origin ? `${origin}${e.path}` : e.path}</code>
              </div>
              <p className="text-12 text-black-300 leading-relaxed">{e.description}</p>
              <p className="text-12 text-black-400 leading-relaxed">{e.response}</p>
            </div>
          ))}
        </div>
        <CodeBlock label="Token exchange — authorization_code" code={API_EXAMPLES.tokenExchange} />
        <CodeBlock label="Token response" code={API_EXAMPLES.tokenResponse} />
        <p className="text-12 text-black-400 leading-relaxed">
          Scopes are per-platform and tiered — read, write, and (Muse/ChatGPT/Claude only) send.
          The automation platforms have read + write only: there is no{" "}
          <code className="font-mono text-black-200">zapier.send</code>,{" "}
          <code className="font-mono text-black-200">n8n.send</code>,{" "}
          <code className="font-mono text-black-200">make.send</code>,{" "}
          <code className="font-mono text-black-200">pabbly.send</code>,{" "}
          <code className="font-mono text-black-200">albato.send</code> or{" "}
          <code className="font-mono text-black-200">activepieces.send</code> tier, because no
          platform sends LinkedIn messages and email inbox replies are covered by the write tier.
          Tiers are independent: write does not imply read — a grant or key must hold each tier it
          needs. An unknown scope is refused with{" "}
          <code className="font-mono text-black-200">invalid_scope</code>, never silently dropped
          or widened.
        </p>
        <div className="divide-y divide-black-700/60">
          {automationScopes.map((scope) => (
            <div key={scope} className="py-2.5 space-y-0.5">
              <code className="font-mono text-13 text-white">{scope}</code>
              <p className="text-12 text-black-400 leading-relaxed">{SCOPE_DESCRIPTIONS[scope as keyof typeof SCOPE_DESCRIPTIONS]}</p>
            </div>
          ))}
        </div>
        <p className="text-12 text-black-400 leading-relaxed">
          The MCP servers use the same authorization server with their own prefixes —{" "}
          <code className="font-mono text-black-200">muse.read / muse.write / muse.send</code>,{" "}
          <code className="font-mono text-black-200">nxtsend.read / nxtsend.write / nxtsend.send</code>{" "}
          and{" "}
          <code className="font-mono text-black-200">claude.read / claude.write / claude.send</code>{" "}
          — and the same tier rules.
        </p>
      </Section>

      {/* REST API reference */}
      <Section id="api-reference" title="REST API reference — v1">
        <p className="text-13 text-black-300 leading-relaxed">
          One implementation, six prefixes: response shapes, validation and error codes are
          identical across platforms — only audit actions, the emit source and platform-aware
          messages differ. Base URL is{" "}
          <code className="font-mono text-black-100">{origin ? `${origin}/api/integrations/<platform>/v1` : "/api/integrations/<platform>/v1"}</code>
          . Every call is workspace-scoped from the token: a call can only see or change the
          workspace its token or key belongs to. Pick a platform to filter the table.
        </p>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Platform">
          {REST_PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={platformId === p.id}
              onClick={() => setPlatformId(p.id)}
              className={`rounded-xl border px-3 py-1.5 text-12 font-semibold transition-colors ${
                platformId === p.id
                  ? "border-purple-500/50 bg-purple-600/20 text-white"
                  : "border-black-600 bg-black-800 text-black-300 hover:text-white"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
        <p className="text-13 text-black-300 leading-relaxed">
          <strong className="text-white">{platform.name}</strong> —{" "}
          <code className="font-mono text-black-100">{platform.basePath}</code> · scopes{" "}
          <code className="font-mono text-black-100">{platform.scopePrefix}.read / {platform.scopePrefix}.write</code>
          {platform.apiKeys ? " · API keys accepted" : " · OAuth only, no API keys"} ·{" "}
          {visibleEndpoints.length} endpoints. {platform.note}
        </p>
        {health && (
          <p className="text-12 text-black-400 leading-relaxed">
            Health (public, no auth):{" "}
            <code className="font-mono text-black-200">{origin ? `${origin}${health.path}` : health.path}</code>{" "}
            — {health.response}
          </p>
        )}
        <div className="divide-y divide-black-700/60">
          {visibleEndpoints.map((e) => (
            <div key={`${e.method} ${e.path}`} className="py-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={e.method === "GET" ? "blue" : e.method === "DELETE" ? "error" : "purple"} size="sm">
                  {e.method}
                </Badge>
                <code className="font-mono text-13 text-white">
                  {platform.basePath}
                  {e.path}
                </code>
                <Badge variant="gray" size="sm">{e.tier} tier</Badge>
                {e.platforms === "n8n-family" && (
                  <Badge variant="blue" size="sm">n8n-family only</Badge>
                )}
              </div>
              <p className="text-12 text-black-300 leading-relaxed">{e.description}</p>
              <p className="text-12 text-black-400 leading-relaxed">{e.response}</p>
            </div>
          ))}
        </div>
        <p className="text-12 text-black-400 leading-relaxed">
          Versioning: there is only v1, and only one API version string exists ({" "}
          <code className="font-mono text-black-200">1.0.0</code>, returned by the health
          endpoints). No v2 is planned or documented, and no endpoint is deprecated. Breaking
          changes, if any ever ship, would arrive as a new versioned prefix — never as a silent
          change to a v1 shape.
        </p>
      </Section>

      {/* Examples */}
      <Section id="examples" title="Request & response examples">
        <p className="text-13 text-black-300 leading-relaxed">
          Real shapes from the route code. Replace{" "}
          <code className="font-mono text-black-100">&lt;your-domain&gt;</code> with the
          deployment origin and{" "}
          <code className="font-mono text-black-100">&lt;api-key-or-access-token&gt;</code> with
          a Bearer token or an n8n API key. The examples use the n8n prefix; every other platform
          works the same way under its own prefix.
        </p>
        <CodeBlock label="List leads" code={API_EXAMPLES.listLeads} />
        <CodeBlock label="List leads — response" code={API_EXAMPLES.listLeadsResponse} />
        <CodeBlock label="Create a lead" code={API_EXAMPLES.createLead} />
        <CodeBlock label="Create a lead — response" code={API_EXAMPLES.createLeadResponse} />
        <CodeBlock label="Connection test" code={API_EXAMPLES.authTest} />
        <CodeBlock label="Connection test — response" code={API_EXAMPLES.authTestResponse} />
        <CodeBlock label="Subscribe a webhook" code={API_EXAMPLES.subscribe} />
        <CodeBlock label="Subscribe — response (no secret is ever returned)" code={API_EXAMPLES.subscribeResponse} />
      </Section>

      {/* Errors */}
      <Section id="errors" title="Error codes">
        <p className="text-13 text-black-300 leading-relaxed">
          REST errors follow the convention <code className="font-mono text-black-100">{"{ error, code }"}</code>{" "}
          (the <code className="font-mono text-black-100">code</code> is present where it helps
          tell failures apart). An unexpected server error is always a generic 500 — internals
          are never leaked to the caller.
        </p>
        <div className="divide-y divide-black-700/60">
          {REST_ERRORS.map((e) => (
            <div key={`${e.status}-${e.code}`} className="py-2.5 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={e.status >= 500 ? "error" : e.status >= 400 ? "warning" : "blue"} size="sm">
                  {e.status}
                </Badge>
                <code className="font-mono text-13 text-white">{e.code}</code>
              </div>
              <p className="text-12 text-black-400 leading-relaxed">{e.meaning}</p>
            </div>
          ))}
        </div>
        <h3 className="text-13 font-semibold text-white pt-2">OAuth token errors</h3>
        <div className="divide-y divide-black-700/60">
          {OAUTH_ERRORS.map((e) => (
            <div key={e.code} className="py-2.5 space-y-0.5">
              <code className="font-mono text-13 text-white">{e.code}</code>
              <p className="text-12 text-black-400 leading-relaxed">{e.meaning}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Rate limits */}
      <Section id="rate-limits" title="Rate limits">
        <p className="text-13 text-black-300 leading-relaxed">
          REST API: <strong className="text-white">{RATE_LIMITS.restPerMinutePerToken} requests per minute, per token</strong>{" "}
          (OAuth access token or API key — the limiter keys on the SHA-256 of the token, so the raw
          token never becomes a map key). MCP servers:{" "}
          <strong className="text-white">{RATE_LIMITS.mcpPerMinutePerGrant} requests per minute, per grant</strong>.
          Both answer 429 with code <code className="font-mono text-black-100">rate_limited</code>{" "}
          when exceeded. {RATE_LIMITS.inMemoryNote} The public health endpoints are not rate
          limited. There are no published per-workspace or per-plan quotas beyond these limits.
        </p>
      </Section>

      {/* Webhooks */}
      <Section id="webhooks" title="Webhooks — the 8 events">
        <p className="text-13 text-black-300 leading-relaxed">
          One event fans out to every platform&apos;s active subscriptions, and the outbox dedups
          on (event id, subscription id). The envelope is the same for every event:{" "}
          <code className="font-mono text-black-100">{"{ id, type, created_at, workspace_id, data }"}</code>{" "}
          — the <code className="font-mono text-black-100">id</code> is the stable dedup id, so
          receivers can safely ignore duplicates. Manage subscriptions per platform on the{" "}
          <Link href="/dashboard/developers/webhooks" className="font-semibold text-purple-300 hover:text-white transition-colors">
            webhook subscriptions page
          </Link>
          . Payload examples, the HMAC-SHA256 verification snippet and endpoint requirements live
          on the{" "}
          <Link href="/developers" className="font-semibold text-purple-300 hover:text-white transition-colors">
            public Developers page
          </Link>{" "}
          — this page does not duplicate them.
        </p>
        <div className="divide-y divide-black-700/60">
          {Object.entries(WEBHOOK_EVENT_DESCRIPTIONS).map(([type, description]) => (
            <div key={type} className="py-2.5 space-y-0.5">
              <code className="font-mono text-13 text-white">{type}</code>
              <p className="text-12 text-black-400 leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
        <ul className="space-y-1.5">
          <li className="flex items-start gap-2 text-13 text-black-300">
            <Shield className="h-4 w-4 shrink-0 text-purple-400 mt-0.5" />
            <span className="leading-relaxed">{WEBHOOK_DELIVERY.immediateAttempt}</span>
          </li>
          <li className="flex items-start gap-2 text-13 text-black-300">
            <Shield className="h-4 w-4 shrink-0 text-purple-400 mt-0.5" />
            <span className="leading-relaxed">
              {WEBHOOK_DELIVERY.retrySchedule} {WEBHOOK_DELIVERY.cronRetry}
            </span>
          </li>
          <li className="flex items-start gap-2 text-13 text-black-300">
            <Shield className="h-4 w-4 shrink-0 text-purple-400 mt-0.5" />
            <span className="leading-relaxed">{WEBHOOK_DELIVERY.deactivate410}</span>
          </li>
          <li className="flex items-start gap-2 text-13 text-black-300">
            <Shield className="h-4 w-4 shrink-0 text-purple-400 mt-0.5" />
            <span className="leading-relaxed">{WEBHOOK_DELIVERY.secretNote}</span>
          </li>
        </ul>
        <p className="text-12 text-black-400 leading-relaxed">
          Not emitted: anything LinkedIn-send or connection-accept related —{" "}
          <code className="font-mono text-black-200">accepted</code> is always null and no
          LinkedIn send exists in the product. Target-URL rules: Zapier subscriptions accept only
          hooks.zapier.com / zapier.com hosts; every other platform accepts any public https host
          (never a Zapier host), with http loopback allowed only on a local deployment.
        </p>
      </Section>

      {/* MCP servers */}
      <Section id="mcp" title="MCP servers — Muse, ChatGPT, Claude">
        <p className="text-13 text-black-300 leading-relaxed">
          The same OAuth 2.1 server fronts three hosted MCP servers (Streamable HTTP, JSON-RPC
          2.0). The MCP connection itself needs no provider API key — the AI providers are reused
          only for message drafting. LinkedIn-send tools are not supported on any of them, and the
          date-range report tool returns 501 (all-time stats only).
        </p>
        <div className="divide-y divide-black-700/60">
          {MCP_SERVERS.map((s) => (
            <div key={s.path} className="py-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-13 text-white">{origin ? `${origin}${s.path}` : s.path}</code>
                <Badge variant="blue" size="sm">{s.tools} tools</Badge>
              </div>
              <p className="text-12 text-black-300 leading-relaxed">
                {s.platform} · scopes{" "}
                <code className="font-mono text-black-200">{s.scopes}</code>
              </p>
              <p className="text-12 text-black-400 leading-relaxed">{s.note}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Credential checklist */}
      <Section id="credentials" title="Credential checklist — which provider needs what">
        <p className="text-13 text-black-300 leading-relaxed">
          Rendered from the Integration Center registry, so it cannot drift from the entries. The
          rule everywhere: the credential is stored <strong className="text-white">encrypted per
          workspace</strong> in <code className="font-mono text-black-100">integration_connections</code> —{" "}
          that stored connection is tried first. A listed environment variable is only the
          server-side fallback the adapter config names (see .env.example for where each one is
          obtained). &ldquo;Stored connection only&rdquo; means the adapter declares no env
          fallback at all. Key presence alone never yields Connected — a connection exists only
          after a credential is stored (and, where offered, verified).
        </p>
        {CHECKLIST_CATEGORIES.map((category) => {
          const entries = checklistEntries.filter((d) => d.category === category);
          if (entries.length === 0) return null;
          return (
            <div key={category} className="space-y-2 pt-2">
              <h3 className="text-13 font-semibold text-white">{category}</h3>
              <div className="divide-y divide-black-700/60">
                {entries.map((d) => (
                  <div key={d.id} className="py-2.5 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-13 font-semibold text-white">{d.name}</span>
                      {d.kind === "info" && <Badge variant="gray" size="sm">Not available</Badge>}
                      {d.docsUrl && (
                        <a
                          href={d.docsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-11 font-semibold text-purple-300 hover:text-white"
                        >
                          Docs <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {d.kind === "info" ? (
                      <p className="text-12 text-black-400 leading-relaxed">
                        {d.notImplementedNote ?? "Not available — no adapter exists."} Do not enter
                        credentials for this provider.
                      </p>
                    ) : d.envVars.length > 0 ? (
                      <p className="text-12 text-black-400 leading-relaxed">
                        Env fallback:{" "}
                        {d.envVars.map((v) => (
                          <code key={v.name} className="font-mono text-black-200">{v.name}</code>
                        )).reduce<React.ReactNode[]>((acc, el, i) => (i === 0 ? [el] : [...acc, ", ", el]), [])}
                        {" "}— stored encrypted connection first, fallback second.
                      </p>
                    ) : (
                      <p className="text-12 text-black-400 leading-relaxed">
                        Stored encrypted connection only — no environment-variable fallback.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <div className="space-y-2 pt-2">
          <h3 className="text-13 font-semibold text-white">Automation (REST platforms)</h3>
          <div className="divide-y divide-black-700/60">
            {CHECKLIST_AUTOMATION_IDS.map((id) => {
              const d = INTEGRATION_REGISTRY.find((e) => e.id === id);
              if (!d) return null;
              return (
                <div key={d.id} className="py-2.5 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-13 font-semibold text-white">{d.name}</span>
                  </div>
                  <p className="text-12 text-black-400 leading-relaxed">
                    No provider credential: the platform authenticates with the shared OAuth server
                    (TOKEN_ENCRYPTION_KEY) — env fallback for the surface itself:{" "}
                    {d.envVars.map((v) => (
                      <code key={v.name} className="font-mono text-black-200">{v.name}</code>
                    )).reduce<React.ReactNode[]>((acc, el, i) => (i === 0 ? [el] : [...acc, ", ", el]), [])}
                    . There is no platform client secret to set — clients register via Dynamic
                    Client Registration.
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      {/* What is not available */}
      <Section id="not-available" title="What is not available">
        <ul className="space-y-1.5">
          {[
            "No LinkedIn send or accept anywhere: no authorized LinkedIn provider exists, and the official LinkedIn API exposes no connection-request/DM endpoints to standard developers. Email inbox replies are the only replies the API sends.",
            "No campaign launch from any API: campaigns are created draft-only and launched from the NxtSend dashboard. No draft concept exists, so there is no drafts endpoint either.",
            "No date-range reporting: the date-range report tool returns 501 — all-time stats only.",
            "Clearbit, Trigify and Weezly are blocked / not implemented: Clearbit's standalone API was deprecated after the HubSpot acquisition, Trigify shut down on 22 October 2026, and Weezly has no public developer API. Their adapters refuse every operation — do not enter credentials for them.",
            "The platform apps are not published or approved: the Zapier app, the n8n community node (not on npm, not verified by n8n), the Make custom app, the Pabbly workflow guide, the Albato builder spec and the Activepieces piece are implemented and testable in each platform's developer tooling, but none appears in that platform's directory. The Muse/ChatGPT/Claude connectors are likewise not submitted or approved.",
            "No SDKs or client libraries exist for any language. The REST API needs nothing but HTTPS + a Bearer token; webhooks need nothing but an HTTPS endpoint and the verification snippet on the public Developers page.",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-13 text-black-300">
              <Shield className="h-4 w-4 shrink-0 text-purple-400 mt-0.5" />
              <span className="leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
        <p className="text-12 text-black-400 leading-relaxed">
          Developer support: write to{" "}
          <a href="mailto:hello@nxtsend.com" className="font-semibold text-purple-300 hover:underline">
            hello@nxtsend.com
          </a>{" "}
          with the endpoint, the request id (if any) and the error code — or browse the{" "}
          <Link href="/support" className="font-semibold text-purple-300 hover:underline">
            Help &amp; Support
          </Link>{" "}
          page. The public Developers page carries the webhook payload and signature-verification
          reference this page links to rather than duplicating.
        </p>
      </Section>
    </div>
  );
}
