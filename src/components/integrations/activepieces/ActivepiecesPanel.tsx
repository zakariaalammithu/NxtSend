"use client";

/**
 * Live Activepieces panels (detail page only — NOT wired in yet; the
 * coordinator wires this component into the integrations detail page).
 * Mirrors ZapierLivePanels / N8nLivePanels: endpoint URLs from this
 * deployment's origin, health endpoint, grants from the grants API
 * (filtered client-side by the activepieces.* scope prefix), webhook
 * subscriptions + last 20 deliveries from the session route, activity
 * from /api/muse/activity, and the trigger/action/search inventory as
 * static lists from the implemented REST surface.
 *
 * No state is ever shown as "Connected" unless a real OAuth grant
 * exists — the header badge already reflects the grant count (GET
 * /api/integrations/status). An active webhook subscription alone
 * does not upgrade the header status.
 *
 * Honest gaps, stated here rather than faked:
 *   - Not published on Activepieces. The OAuth + REST + webhook surface is implemented and the TypeScript piece in integrations/activepieces/ is build-verified (tsc clean + runtime construct against @activepieces/pieces-framework 0.32.0, 17 actions, 9 triggers), but it has NOT been installed in any Activepieces instance and NOT been submitted — it does not appear in the Activepieces piece catalog.
 *   - OAuth client registration for the activepieces platform is PENDING
 *     on the coordinator extending src/lib/muse-connector/oauth/clients.ts
 *     (OAuthClientPlatform / registrationPlatform / platformLabel /
 *     redirect-URI allowlist) — until then no activepieces.* token can be
 *     issued, so the grants panel stays empty and the connect steps
 *     below cannot be completed end to end.
 *   - If a fetch still fails (e.g. migrations 028–031 not applied),
 *     this panel reports those fetch errors honestly instead of
 *     showing empty states as if nothing were configured.
 *   - Activity history: GET /api/muse/activity?platform=activepieces
 *     depends on the activity route carrying activepieces.* entries; if
 *     it returns none, the panel says so rather than showing other
 *     platforms' rows as Activepieces activity.
 */

import * as React from "react";
import { SCOPE_DESCRIPTIONS, type OAuthScope } from "@/lib/muse-connector/oauth/scopes";

interface ActivepiecesHealth {
  mode: string;
  activepiecesEnabled: boolean;
  version: string;
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

interface ActivepiecesSubscriptionEntry {
  id: string;
  event: string;
  target_url: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface ActivepiecesDeliveryEntry {
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-black-700 bg-black-800/60 p-5 space-y-3">
      <h2 className="text-15 font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-blue-500/15 border border-blue-400/30 px-2 py-0.5 text-11 font-semibold text-blue-200">
      {children}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      className="shrink-0 rounded-lg border border-black-600 bg-black-700 px-2.5 py-1.5 text-12 font-medium text-black-100 hover:bg-black-600"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

const undefined_ENDPOINTS: { label: string; path: string; note: string }[] = [
  {
    "label": "Activepieces REST API (v1)",
    "path": "/api/integrations/activepieces/v1",
    "note": "Bearer <redacted> token for the Activepieces resource + activepieces.read (GETs) / activepieces.write (mutations). Rate limit 120 req/min per token (in-memory, per-process). Demo Mode → 503."
  },
  {
    "label": "Health (public, no auth)",
    "path": "/api/integrations/activepieces/health",
    "note": "Returns {mode, activepiecesEnabled, version}. Lets Activepieces (and the owner) check the surface without a token."
  },
  {
    "label": "Connection test",
    "path": "/api/integrations/activepieces/v1/auth/test",
    "note": "Returns the user, workspace and scopes for the token — never token values. Activepieces calls this when an account is connected."
  },
  {
    "label": "Authorize (consent screen)",
    "path": "/api/muse/oauth/authorize",
    "note": "Shared OAuth server. GET shows the consent screen; POST approves or denies."
  },
  {
    "label": "Token",
    "path": "/api/muse/oauth/token",
    "note": "authorization_code + refresh_token. PKCE optional for confidential clients only; public clients still require PKCE S256."
  },
  {
    "label": "Revoke",
    "path": "/api/muse/oauth/revoke",
    "note": "RFC 7009 token revocation."
  },
  {
    "label": "Register (Dynamic Client Registration)",
    "path": "/api/muse/oauth/register",
    "note": "RFC 7591 — one-time call that creates the Activepieces client. No pre-registered client secret exists."
  },
  {
    "label": "Protected-resource metadata",
    "path": "/.well-known/oauth-protected-resource/api/integrations/activepieces",
    "note": "RFC 9728 metadata for the Activepieces resource (https://<origin>/api/integrations/activepieces)."
  }
];

const undefined_CONNECT_STEPS: string[] = [
  "Register the Activepieces OAuth client with the one-time Dynamic Client Registration call (POST /api/muse/oauth/register with scopes activepieces.read activepieces.write and resource https://<your-domain>/api/integrations/activepieces). The response contains client_id + client_secret — shown once, store it immediately. NOTE: client registration for the activepieces platform is pending the coordinator extending the OAuth client platform registry (src/lib/muse-connector/oauth/clients.ts) — until then DCR refuses an activepieces.* registration and no token can be issued for this resource.",
  "Build the piece: cd integrations/activepieces && npm install && npm run build (see the piece README). Install the built piece in your Activepieces instance (self-hosted: drop it in pieces/; Cloud: upload the .tgz as a private piece).",
  "In Activepieces, add the NxtSend piece to a flow and connect it: sign in on NxtSend's consent screen and choose the scopes. Pick activepieces.read only unless the flow genuinely needs to change things. A grant appears in the grants panel below only after that approval — until then, nothing is connected.",
  "Build flows from the triggers, actions and searches listed below. Webhook triggers subscribe via POST /api/integrations/activepieces/v1/webhooks/subscribe with the flow's webhook URL as target_url; polling triggers check the REST API on the flow schedule.",
  "Publication is a separate step: contributing the piece to the Activepieces repository. That submission has NOT been made and no approval is claimed — the private-piece path above works without it."
];

const undefined_TRIGGERS: string[] = [
  "New lead (lead.created) — webhook",
  "Lead updated (lead.updated) — webhook",
  "Lead added to campaign (lead.added_to_campaign) — webhook",
  "Lead removed from campaign (lead.removed_from_campaign) — webhook",
  "Campaign created (campaign.created) — webhook",
  "Campaign status changed (campaign.status_changed) — webhook",
  "New inbox reply (conversation.reply_created) — webhook",
  "Subscription changed (subscription.changed) — webhook",
  "New conversation (conversation.created) — polling only (GET /v1/conversations)"
];

const undefined_ACTIONS: string[] = [
  "Create lead (POST /v1/leads — dedups by email)",
  "Update lead (PATCH /v1/leads/:id)",
  "Delete lead (DELETE /v1/leads/:id — write tier)",
  "Import leads (POST /v1/leads/import)",
  "Create campaign — DRAFT ONLY (POST /v1/campaigns; launch stays dashboard-only)",
  "Update campaign (PATCH /v1/campaigns/:id)",
  "Pause / resume / stop / archive campaign (POST /v1/campaigns/:id/:action)",
  "Add leads to campaign (POST /v1/campaigns/:id/leads)",
  "Remove lead from campaign (DELETE /v1/campaigns/:id/leads/:leadId)",
  "Replace campaign steps (PUT /v1/campaigns/:id/steps)",
  "Schedule follow-up reply (POST /v1/campaigns/:id/follow-ups)",
  "Cancel scheduled follow-up (DELETE /v1/campaigns/:id/follow-ups/:followUpId)",
  "Send inbox reply — email channel only (POST /v1/conversations/:id/replies; LinkedIn refused 422)",
  "Subscribe webhook (POST /v1/webhooks/subscribe)",
  "Unsubscribe webhook (POST /v1/webhooks/unsubscribe)"
];

const undefined_SEARCHES: string[] = [
  "Search leads (GET /v1/search/leads)",
  "Search campaigns (GET /v1/search/campaigns)",
  "Search conversations (GET /v1/search/conversations)",
  "Search accounts (GET /v1/search/accounts)",
  "Get lead / campaign / conversation / account by id",
  "Campaign performance (GET /v1/campaigns/:id/performance — accepted is always null)",
  "Campaign sequence execution status (GET /v1/campaigns/:id/execution-status)",
  "Usage (GET /v1/usage)",
  "Dropdowns: accounts, campaigns, lead statuses, sequences"
];

function grantBelongsToActivepieces(grant: MuseGrant): boolean {
  return grant.scopes.some((s) => s.startsWith("activepieces."));
}

export function ActivepiecesPanel({
  origin,
  status,
  mode,
}: {
  origin: string;
  status: string;
  mode: string;
}) {
  const [health, setHealth] = React.useState<ActivepiecesHealth | null>(null);
  const [healthError, setHealthError] = React.useState<string | null>(null);
  const [grants, setGrants] = React.useState<MuseGrant[] | null>(null);
  const [grantsError, setGrantsError] = React.useState<string | null>(null);
  const [revokeBusy, setRevokeBusy] = React.useState<string | null>(null);
  const [revokeError, setRevokeError] = React.useState<string | null>(null);
  const [revokeNotice, setRevokeNotice] = React.useState<string | null>(null);
  const [subs, setSubs] = React.useState<ActivepiecesSubscriptionEntry[] | null>(null);
  const [deliveries, setDeliveries] = React.useState<ActivepiecesDeliveryEntry[] | null>(null);
  const [subsError, setSubsError] = React.useState<string | null>(null);
  const [activity, setActivity] = React.useState<MuseActivityEntry[] | null>(null);
  const [activityError, setActivityError] = React.useState<string | null>(null);

  const loadHealth = React.useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/activepieces/health");
      const body = (await res.json().catch(() => null)) as ActivepiecesHealth | { error?: string } | null;
      if (!res.ok) throw new Error((body as { error?: string } | null)?.error ?? `Health request failed (HTTP ${res.status})`);
      setHealth(body as ActivepiecesHealth);
      setHealthError(null);
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : "Failed to load Activepieces health.");
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
      setGrantsError(err instanceof Error ? err.message : "Failed to load Activepieces grants.");
    }
  }, []);

  const loadWebhookStatus = React.useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/activepieces/subscriptions");
      const body = (await res.json().catch(() => null)) as
        | {
            subscriptions?: ActivepiecesSubscriptionEntry[];
            deliveries?: ActivepiecesDeliveryEntry[];
            error?: string;
          }
        | null;
      if (!res.ok) throw new Error(body?.error ?? `Webhook status request failed (HTTP ${res.status})`);
      setSubs(body?.subscriptions ?? []);
      setDeliveries(body?.deliveries ?? []);
      setSubsError(null);
    } catch (err) {
      setSubsError(err instanceof Error ? err.message : "Failed to load Activepieces webhook status.");
    }
  }, []);

  const loadActivity = React.useCallback(async () => {
    try {
      const res = await fetch("/api/muse/activity?platform=activepieces");
      const body = (await res.json().catch(() => null)) as
        | { entries?: MuseActivityEntry[]; error?: string }
        | null;
      if (!res.ok) throw new Error(body?.error ?? `Activity request failed (HTTP ${res.status})`);
      setActivity(body?.entries ?? []);
      setActivityError(null);
    } catch (err) {
      setActivityError(err instanceof Error ? err.message : "Failed to load Activepieces activity.");
    }
  }, []);

  React.useEffect(() => {
    void loadHealth();
    void loadGrants();
    void loadWebhookStatus();
    void loadActivity();
  }, [loadHealth, loadGrants, loadWebhookStatus, loadActivity]);

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
      setRevokeNotice(`Grant for “${clientId}” revoked — Activepieces can no longer use it.`);
      await loadGrants();
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : "Revoke failed.");
    } finally {
      setRevokeBusy(null);
    }
  };

  const platformGrants = grants === null ? null : grants.filter(grantBelongsToActivepieces);

  return (
    <div className="space-y-4">
      <Section title="Live connection status">
        <p className="text-13 text-black-300 leading-relaxed">
          Current status: <strong className="text-white">{status}</strong>.{" "}
          {status === "Connected and Verified"
            ? "At least one active Activepieces OAuth grant exists for this workspace — Activepieces can call the REST API on behalf of the granting user(s)."
            : status === "Connected but Not Verified"
              ? "The Activepieces REST surface is configured, but no active Activepieces grant exists yet — configuration alone is not a connection. Connect from Activepieces (steps below) to create a grant."
              : status === "Demo Mode"
                ? "Demo Mode: the Activepieces REST API + webhook surface refuses demo outright — no grant can be issued or used here."
                : "The Activepieces surface is not fully configured on this deployment — see the environment variables in the docs."}
        </p>
        {healthError ? (
          <p className="text-13 text-rose-200 leading-relaxed">{healthError}</p>
        ) : health ? (
          <p className="text-13 text-black-300 leading-relaxed">
            API health (GET /api/integrations/activepieces/health): mode{" "}
            <code className="font-mono text-black-100">{health.mode}</code> · Activepieces{" "}
            <code className="font-mono text-black-100">{health.activepiecesEnabled ? "enabled" : "disabled"}</code> · API
            version <code className="font-mono text-black-100">{health.version}</code>. The health
            endpoint proves the route answers — it does not prove Activepieces is connected; only a grant
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
          <strong className="text-white">Not published on Activepieces.</strong>{" "}
          The OAuth + REST + webhook surface is implemented and the TypeScript piece in integrations/activepieces/ is build-verified (tsc clean + runtime construct against @activepieces/pieces-framework 0.32.0, 17 actions, 9 triggers), but it has NOT been installed in any Activepieces instance and NOT been submitted — it does not appear in the Activepieces piece catalog.
        </p>
      </Section>

      <Section title="Endpoints — this deployment">
        <div className="divide-y divide-black-700/60">
          {undefined_ENDPOINTS.map((e) => (
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

      <Section title="Scopes — what a Activepieces grant can ask for">
        <p className="text-13 text-black-300 leading-relaxed">
          A <code className="font-mono text-black-100">activepieces.read</code>-only grant is the
          recommended default — it lets Activepieces look things up without changing anything. The consent
          screen offers it, and a requested scope outside these two is refused, never silently
          widened. There is no <code className="font-mono text-black-100">activepieces.send</code> tier:
          Activepieces never sends LinkedIn messages, and email inbox replies sent through the Activepieces API
          are covered by the write tier.
        </p>
        <div className="divide-y divide-black-700/60">
          {(Object.entries(SCOPE_DESCRIPTIONS) as [OAuthScope, string][])
            .filter(([scope]) => scope.startsWith("activepieces."))
            .map(([scope, description]) => (
              <div key={scope} className="py-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-13 text-white">{scope}</code>
                  {scope === "activepieces.read" && (
                    <Badge>Recommended default</Badge>
                  )}
                </div>
                <p className="text-12 text-black-300 leading-relaxed">{description}</p>
              </div>
            ))}
        </div>
      </Section>

      <Section title="OAuth grants">
        {grantsError ? (
          <p className="text-13 text-rose-200 leading-relaxed">{grantsError}</p>
        ) : platformGrants === null ? (
          <p className="text-13 text-black-400">Loading grants…</p>
        ) : platformGrants.length === 0 ? (
          <p className="text-13 text-black-300 leading-relaxed">
            No active Activepieces grant for this workspace yet. Complete the connect steps below — a grant appears here only after approval on the consent screen.
          </p>
        ) : (
          <div className="divide-y divide-black-700/60">
            {platformGrants.map((g) => (
              <div key={g.clientId} className="py-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-13 font-semibold text-white">{g.clientName || g.clientId}</span>
                  {g.active ? <Badge>Active</Badge> : <Badge>Revoked</Badge>}
                </div>
                <p className="text-12 text-black-400 leading-relaxed">
                  Scopes: <code className="font-mono text-black-100">{g.scopes.join(" ")}</code> · Granted{" "}
                  {g.createdAt} {g.lastUsedAt ? `· Last used ${g.lastUsedAt}` : "· Never used"}
                </p>
                {g.active && (
                  <button
                    type="button"
                    disabled={revokeBusy === g.clientId}
                    onClick={() => void revokeGrant(g.clientId)}
                    className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-2.5 py-1.5 text-12 font-medium text-rose-200 disabled:opacity-50"
                  >
                    {revokeBusy === g.clientId ? "Revoking…" : "Revoke grant"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {revokeError && <p className="text-13 text-rose-200 leading-relaxed">{revokeError}</p>}
        {revokeNotice && <p className="text-13 text-emerald-200 leading-relaxed">{revokeNotice}</p>}
      </Section>

      <Section title="Webhook subscriptions">
        {subsError ? (
          <p className="text-13 text-rose-200 leading-relaxed">{subsError}</p>
        ) : subs === null ? (
          <p className="text-13 text-black-400">Loading webhook status…</p>
        ) : subs.length === 0 ? (
          <p className="text-13 text-black-300 leading-relaxed">
            No active Activepieces webhook subscriptions for this workspace. Subscribe from Activepieces via POST /api/integrations/activepieces/v1/webhooks/subscribe.
          </p>
        ) : (
          <div className="divide-y divide-black-700/60">
            {subs.map((s) => (
              <div key={s.id} className="py-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-13 text-white">{s.event}</code>
                  {s.active ? <Badge>Active</Badge> : <Badge>Inactive</Badge>}
                </div>
                <p className="text-12 text-black-400 leading-relaxed break-all">{s.target_url}</p>
                <p className="text-12 text-black-400">Created {s.created_at}</p>
              </div>
            ))}
          </div>
        )}
        {deliveries !== null && deliveries.length > 0 && (
          <div className="pt-2">
            <h3 className="text-13 font-semibold text-white pb-2">Recent deliveries (last 20)</h3>
            <div className="divide-y divide-black-700/60">
              {deliveries.map((d) => (
                <div key={d.id} className="py-2">
                  <p className="text-12 text-black-300 leading-relaxed">
                    <code className="font-mono text-black-100">{d.event}</code> · {d.status} ·{" "}
                    {d.attempts}/{d.max_attempts} attempts
                    {d.last_error ? ` · ${d.last_error}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section title="Activity">
        {activityError ? (
          <p className="text-13 text-rose-200 leading-relaxed">{activityError}</p>
        ) : activity === null ? (
          <p className="text-13 text-black-400">Loading activity…</p>
        ) : activity.length === 0 ? (
          <p className="text-13 text-black-300 leading-relaxed">
            No Activepieces activity recorded yet.
          </p>
        ) : (
          <div className="divide-y divide-black-700/60">
            {activity.map((a, i) => (
              <div key={i} className="py-2">
                <p className="text-12 text-black-300 leading-relaxed">
                  <code className="font-mono text-black-100">{a.action}</code>{" "}
                  {a.resource ? `· ${a.resource} · ` : "· "}{a.details}
                </p>
                <p className="text-12 text-black-400">{a.created_at}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Connect Activepieces">
        <ol className="list-decimal pl-5 space-y-2">
          {undefined_CONNECT_STEPS.map((step, i) => (
            <li key={i} className="text-13 text-black-300 leading-relaxed">{step}</li>
          ))}
        </ol>
      </Section>

      <Section title="Triggers, actions & searches">
        <p className="text-13 text-black-300 leading-relaxed">
          TypeScript piece: integrations/activepieces/ (@activepieces/pieces-framework 0.32.0, OAuth 2.0 auth) — build-verified (tsc clean + runtime construct, 17 actions, 9 triggers), NOT installed, NOT submitted to Activepieces.
        </p>
        <h3 className="text-13 font-semibold text-white pt-2">Triggers (webhooks + polling)</h3>
        <ul className="list-disc pl-5 space-y-1">
          {undefined_TRIGGERS.map((t) => (
            <li key={t} className="text-12 text-black-300 leading-relaxed">{t}</li>
          ))}
        </ul>
        <h3 className="text-13 font-semibold text-white pt-2">Actions</h3>
        <ul className="list-disc pl-5 space-y-1">
          {undefined_ACTIONS.map((t) => (
            <li key={t} className="text-12 text-black-300 leading-relaxed">{t}</li>
          ))}
        </ul>
        <h3 className="text-13 font-semibold text-white pt-2">Searches</h3>
        <ul className="list-disc pl-5 space-y-1">
          {undefined_SEARCHES.map((t) => (
            <li key={t} className="text-12 text-black-300 leading-relaxed">{t}</li>
          ))}
        </ul>
        <p className="text-12 text-black-400 leading-relaxed">
          No LinkedIn-send action exists anywhere in this API, campaign launch stays dashboard-only, and there is no message-draft endpoint.
        </p>
      </Section>
    </div>
  );
}
