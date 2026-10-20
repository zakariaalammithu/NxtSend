"use client";

/**
 * Connected Accounts — the workspace's sending identities
 * (migration 011 `connected_accounts`).
 *
 * One card per account: avatar, name, handle/email, status, the
 * warm-up toggle, the sender identity that fills the {my_*}
 * template variables, and (for LinkedIn accounts) the daily-limits
 * editor. Everything persists through the accounts repository.
 *
 * "Add account" is deliberately NOT a connect form: LinkedIn
 * accounts connect through an approved LinkedIn integration and
 * email accounts through the email integration, so both actions
 * route to the Integration Center. In Demo Mode the two seeded
 * accounts are simulated records and are labelled as such.
 */

import * as React from "react";
import Link from "next/link";
import {
  Linkedin,
  Mail,
  Plus,
  Trash2,
  ChevronDown,
  Info,
  User,
  HeartPulse,
  RefreshCcw,
} from "lucide-react";
import type { ConnectedAccount, WarmupLimits } from "@/types";
import {
  accountHealthActionHref,
  accountHealthView,
} from "@/lib/linkedin";
import {
  getAccountsRepository,
  getCampaignsRepository,
  resolveWorkspaceId,
  accountLimits,
} from "@/lib/data";
import { WARMUP_LIMIT_ROWS } from "@/lib/data/audience-source";
import { Avatar } from "@/components/ui/Avatar";

function StatusChip({ account }: { account: ConnectedAccount }) {
  if (account.status === "demo") {
    return <span className="demo-badge">Demo account</span>;
  }
  if (account.status === "connected") {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-11 font-medium text-emerald-300">
        Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-black-600 bg-black-800 px-2 py-0.5 text-11 font-medium text-black-300 capitalize">
      {account.status}
    </span>
  );
}

const HEALTH_TONE_CLS: Record<string, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  error: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  muted: "border-black-600 bg-black-800 text-black-300",
};

/**
 * Authorization health (migration 013): the account RECORD's last
 * known state at its provider — deliberately separate from whether
 * a provider integration is configured at all (for LinkedIn it is
 * not; see the provider note in the LinkedIn section below). A
 * Reconnect/Review action routes to the channel's integration page:
 * reconnecting happens through the provider there — this page never
 * renders a password or cookie form.
 */
function HealthBlock({ account }: { account: ConnectedAccount }) {
  const health = accountHealthView(account);
  return (
    <div className="rounded-xl border border-black-700/80 bg-black-800/40 px-4 py-3 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <h4 className="flex items-center gap-2 text-13 font-semibold text-white">
          <HeartPulse className="h-4 w-4 text-black-400" />
          Connection health
        </h4>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-11 font-medium ${HEALTH_TONE_CLS[health.tone]}`}
          data-testid={`account-health-${account.id}`}
        >
          {health.label}
        </span>
        {health.action !== "none" && (
          <Link
            href={accountHealthActionHref(account.channel, account.provider)}
            className="inline-flex items-center gap-1 text-12 font-medium text-purple-300 hover:text-purple-200"
            data-testid={`account-health-action-${account.id}`}
          >
            <RefreshCcw className="h-3 w-3" />
            {health.actionLabel}
          </Link>
        )}
      </div>
      <p className="text-12 text-black-400">{health.description}</p>
      {account.last_error && account.auth_status !== "error" && (
        <p className="text-12 text-rose-300/80">
          Last provider error: {account.last_error}
        </p>
      )}
      <p className="text-12 text-black-500">
        {account.last_sync_at
          ? `Last synced ${new Date(account.last_sync_at).toLocaleString()}`
          : "Never synced with a provider"}
        {account.provider_account_id
          ? ` · Provider account ${account.provider_account_id}`
          : ""}
      </p>
    </div>
  );
}

function AccountCard({
  account,
  onUpdate,
  onDelete,
}: {
  account: ConnectedAccount;
  onUpdate: (id: string, patch: Partial<ConnectedAccount>) => Promise<void>;
  onDelete: (account: ConnectedAccount) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [limitsOpen, setLimitsOpen] = React.useState(false);
  const [limits, setLimits] = React.useState<WarmupLimits>(() =>
    accountLimits(account)
  );
  const [identity, setIdentity] = React.useState({
    sender_first_name: account.sender_first_name,
    sender_last_name: account.sender_last_name,
    sender_job_title: account.sender_job_title,
    sender_company: account.sender_company,
  });
  const [savedNote, setSavedNote] = React.useState<string | null>(null);

  const flash = (note: string) => {
    setSavedNote(note);
    window.setTimeout(() => setSavedNote(null), 2500);
  };

  const toggleWarmup = async () => {
    setBusy(true);
    try {
      await onUpdate(account.id, { warmup_enabled: !account.warmup_enabled });
    } finally {
      setBusy(false);
    }
  };

  const saveLimits = async () => {
    setBusy(true);
    try {
      await onUpdate(account.id, { daily_limits: limits });
      flash("Daily limits saved.");
    } finally {
      setBusy(false);
    }
  };

  const saveIdentity = async () => {
    setBusy(true);
    try {
      await onUpdate(account.id, { ...identity });
      flash("Sender identity saved.");
    } finally {
      setBusy(false);
    }
  };

  const isLinkedin = account.channel === "linkedin";

  return (
    <div
      className="glass-card p-5 space-y-5"
      data-testid={`account-card-${account.id}`}
    >
      {/* Header */}
      <div className="flex items-start gap-3.5">
        <Avatar
          src={account.avatar_url}
          name={account.display_name}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-16 font-semibold text-white">
              {account.display_name}
            </h3>
            <StatusChip account={account} />
          </div>
          <p className="text-13 text-black-400 truncate">
            {account.handle_or_email || "—"}
          </p>
          <p className="text-12 text-black-500">
            {isLinkedin ? "LinkedIn account" : "Email account"} · via{" "}
            {account.provider}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDelete(account)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-black-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
          aria-label={`Delete account ${account.display_name}`}
          title="Delete account"
          data-testid={`account-delete-${account.id}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Connection health (migration 013) */}
      <HealthBlock account={account} />

      {/* Warm-up toggle */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-black-700/80 bg-black-800/40 px-4 py-3">
        <div>
          <p className="text-13 font-medium text-white">Warm-up mode</p>
          <p className="text-12 text-black-400">
            {account.warmup_enabled
              ? "On — daily actions ramp up gradually within the limits below."
              : "Off — the account is not treated as warming up."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={account.warmup_enabled}
          aria-label={`Toggle warm-up for ${account.display_name}`}
          disabled={busy}
          onClick={() => void toggleWarmup()}
          data-testid={`account-warmup-toggle-${account.id}`}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            account.warmup_enabled ? "bg-emerald-500" : "bg-black-600"
          } ${busy ? "opacity-50" : "cursor-pointer"}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              account.warmup_enabled ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      {/* Sender identity — feeds {my_first_name} etc. */}
      <div className="space-y-3">
        <h4 className="flex items-center gap-2 text-13 font-semibold text-white">
          <User className="h-4 w-4 text-black-400" />
          Sender identity
        </h4>
        <p className="text-12 text-black-400 leading-relaxed">
          Used by the {"{my_first_name}"}, {"{my_last_name}"},{" "}
          {"{my_job_title}"} and {"{my_company_name}"} variables in this
          account&apos;s campaign messages.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(
            [
              ["sender_first_name", "First name"],
              ["sender_last_name", "Last name"],
              ["sender_job_title", "Job title"],
              ["sender_company", "Company"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="block text-12 font-medium text-black-300 mb-1">
                {label}
              </span>
              <input
                type="text"
                value={identity[key]}
                onChange={(e) =>
                  setIdentity((prev) => ({ ...prev, [key]: e.target.value }))
                }
                className="input-field"
                data-testid={`account-identity-${key}-${account.id}`}
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void saveIdentity()}
          disabled={busy}
          className="rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-4 py-2 text-13 font-medium text-white transition-colors disabled:opacity-50"
          data-testid={`account-identity-save-${account.id}`}
        >
          Save identity
        </button>
      </div>

      {/* Daily limits (LinkedIn actions) */}
      {isLinkedin ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setLimitsOpen((v) => !v)}
            className="flex items-center gap-2 text-13 font-semibold text-white"
            aria-expanded={limitsOpen}
            data-testid={`account-limits-toggle-${account.id}`}
          >
            Manage limits
            <ChevronDown
              className={`h-4 w-4 text-black-400 transition-transform ${
                limitsOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          {limitsOpen && (
            <div className="space-y-3">
              <p className="text-12 text-black-400">
                Maximum number of LinkedIn actions per day for this account:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {WARMUP_LIMIT_ROWS.map((row) => (
                  <label key={row.key} className="block">
                    <span className="block text-12 font-medium text-black-300 mb-1">
                      {row.label}
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={limits[row.key]}
                      onChange={(e) =>
                        setLimits((prev) => ({
                          ...prev,
                          [row.key]: Math.max(
                            0,
                            Math.floor(Number(e.target.value) || 0)
                          ),
                        }))
                      }
                      className="input-field"
                      data-testid={`account-limit-${row.key}-${account.id}`}
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void saveLimits()}
                disabled={busy}
                className="rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-4 py-2 text-13 font-medium text-white transition-colors disabled:opacity-50"
                data-testid={`account-limits-save-${account.id}`}
              >
                Save limits
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="flex items-start gap-1.5 text-12 text-black-500">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          Daily action limits apply to LinkedIn accounts.
        </p>
      )}

      {savedNote && (
        <p className="text-12 text-emerald-300" role="status">
          {savedNote}
        </p>
      )}
    </div>
  );
}

function AddAccountCard({
  channel,
  isDemo,
}: {
  channel: "linkedin" | "email";
  isDemo?: boolean;
}) {
  const isLinkedin = channel === "linkedin";
  return (
    <div className="rounded-2xl border border-dashed border-black-600 bg-black-800/30 p-5 space-y-3">
      <h3 className="flex items-center gap-2 text-14 font-semibold text-white">
        <Plus className="h-4 w-4 text-purple-300" />
        Add a {isLinkedin ? "LinkedIn" : "email"} account
      </h3>
      {isLinkedin ? (
        <>
          <p className="text-13 text-black-300 leading-relaxed">
            LinkedIn accounts are connected through an approved LinkedIn
            integration — NxtSend never asks for your LinkedIn password
            or session cookies. When a provider is connected, its
            accounts appear here automatically.
          </p>
          <Link
            href="/dashboard/integrations/linkedin"
            className="inline-flex items-center gap-1.5 text-13 font-medium text-purple-300 hover:text-purple-200"
            data-testid="account-add-linkedin"
          >
            Open the LinkedIn integration →
          </Link>
        </>
      ) : (
        <>
          <p className="text-13 text-black-300 leading-relaxed">
            Connect a real mailbox with OAuth — you consent on the
            provider&apos;s own screen; NxtSend never asks for a mailbox
            password. Once connected, the mailbox appears here, campaigns
            can select it as their email account, and their steps send
            From that address. Resend domain sending stays available on
            the Resend integration.
          </p>
          {isDemo && (
            <p
              className="text-12.5 text-amber-200/90 leading-relaxed"
              data-testid="account-add-email-demo-note"
            >
              Demo Mode: mailbox connection is disabled here — it needs
              live mode with the OAuth client configured (SETUP.md §15).
              Nothing can be connected (or faked) in Demo Mode; the
              options below open the live setup pages.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <Link
              href="/dashboard/integrations/gmail"
              className="inline-flex items-center gap-1.5 text-13 font-medium text-purple-300 hover:text-purple-200"
              data-testid="account-add-gmail"
            >
              Connect a Gmail / Google Workspace mailbox →
            </Link>
            <Link
              href="/dashboard/integrations/microsoft"
              className="inline-flex items-center gap-1.5 text-13 font-medium text-purple-300 hover:text-purple-200"
              data-testid="account-add-microsoft"
            >
              Connect an Outlook / Microsoft 365 mailbox →
            </Link>
            <Link
              href="/dashboard/integrations/resend"
              className="inline-flex items-center gap-1.5 text-13 font-medium text-purple-300 hover:text-purple-200"
              data-testid="account-add-email"
            >
              Open the Resend email integration →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function ConnectedAccountsPage() {
  const accountsRepo = React.useMemo(() => getAccountsRepository(), []);
  const campaignsRepo = React.useMemo(() => getCampaignsRepository(), []);
  const isDemo = accountsRepo.mode === "demo";

  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);
  const [accounts, setAccounts] = React.useState<ConnectedAccount[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] =
    React.useState<ConnectedAccount | null>(null);
  // OAuth round-trip notice: the connect/callback routes redirect
  // here with ?oauth_connected=<provider>&mailbox=<addr> or
  // ?oauth_error=<code> — rendered once, dismissible, honest text.
  const [oauthNotice, setOauthNotice] = React.useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("oauth_connected");
    const oauthError = params.get("oauth_error");
    if (connected === "google" || connected === "microsoft") {
      const mailbox = params.get("mailbox");
      setOauthNotice({
        kind: "success",
        text: `${connected === "google" ? "Gmail" : "Outlook"} mailbox ${mailbox ?? ""} is now connected. Campaigns that select it as their email account send from that address.`,
      });
    } else if (oauthError) {
      const texts: Record<string, string> = {
        demo_mode:
          "Demo Mode: mailboxes can't be connected here. Connecting runs in live mode with the OAuth client configured (SETUP.md §15). Nothing was connected.",
        not_configured:
          "The mailbox connection stopped: the OAuth configuration is incomplete on the server. Nothing was connected — see the Gmail / Outlook integration page for the missing items.",
        state_invalid:
          "The mailbox connection could not be verified (the OAuth state expired or didn't match your session). Nothing was stored — start the connection again from the integration page.",
        exchange_failed:
          "The provider rejected the authorization code exchange. Nothing was stored — try again, and check the OAuth client configuration if it repeats.",
        profile_failed:
          "The mailbox profile could not be fetched after consent, so no connection was recorded. Nothing was stored.",
        storage_failed:
          "The mailbox connection could not be stored on the server. Nothing was connected.",
        provider_denied:
          "The provider sign-in was cancelled or denied. Nothing was connected.",
        invalid_callback:
          "The provider returned without the expected parameters. Nothing was connected.",
      };
      setOauthNotice({
        kind: "error",
        text: texts[oauthError] ?? `The mailbox connection did not complete (${oauthError}). Nothing was connected.`,
      });
    }
  }, []);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [linkedinProvider, setLinkedinProvider] = React.useState<{
    status: string;
    statusMessage: string;
  } | null>(null);

  // The LinkedIn PROVIDER state (Integration Center status API) is a
  // separate fact from each account's recorded health — the LinkedIn
  // section shows both, side by side, so a healthy account record is
  // never mistaken for a working LinkedIn connection.
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        const entry = (json.integrations ?? []).find(
          (i: { id?: string; descriptor?: { id?: string } }) =>
            (i.descriptor?.id ?? i.id) === "linkedin"
        );
        if (entry) {
          setLinkedinProvider({
            status: entry.status,
            statusMessage: entry.statusMessage,
          });
        }
      })
      .catch(() => {
        /* the section renders without the provider note */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = React.useCallback(
    async (ws: string) => {
      setAccounts(await accountsRepo.listAccounts(ws));
    },
    [accountsRepo]
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ws = await resolveWorkspaceId();
        if (cancelled) return;
        setWorkspaceId(ws);
        if (ws) await refresh(ws);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load connected accounts."
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const handleUpdate = async (
    id: string,
    patch: Partial<ConnectedAccount>
  ) => {
    setError(null);
    try {
      const updated = await accountsRepo.updateAccount(id, patch);
      setAccounts((prev) => prev.map((a) => (a.id === id ? updated : a)));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save the account."
      );
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !workspaceId) return;
    setDeleteBusy(true);
    setError(null);
    try {
      await accountsRepo.deleteAccount(workspaceId, deleteTarget.id);
      // Mirror ON DELETE SET NULL in the demo store: campaigns keep
      // working, their account reference is cleared.
      const campaigns = await campaignsRepo.listCampaigns(workspaceId);
      for (const c of campaigns) {
        const patch: {
          sender_account_id?: null;
          email_account_id?: null;
        } = {};
        if (c.sender_account_id === deleteTarget.id)
          patch.sender_account_id = null;
        if (c.email_account_id === deleteTarget.id)
          patch.email_account_id = null;
        if (Object.keys(patch).length > 0) {
          await campaignsRepo.updateCampaign(c.id, patch);
        }
      }
      setDeleteTarget(null);
      await refresh(workspaceId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete the account."
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  const linkedinAccounts = accounts.filter((a) => a.channel === "linkedin");
  const emailAccounts = accounts.filter((a) => a.channel === "email");

  return (
    <div className="space-y-7 pb-14">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
            Connected Accounts
          </h1>
          {isDemo && <span className="demo-badge">Demo Mode</span>}
        </div>
        <p className="mt-1 text-14 text-black-300 max-w-2xl">
          The accounts your campaigns send from. Each account carries its
          warm-up state, its daily limits and the sender identity behind
          the {"{my_*}"} message variables.
        </p>
        {isDemo && (
          <p className="mt-2 flex items-start gap-1.5 text-12 text-black-400 max-w-2xl">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Demo Mode: the accounts below are simulated records stored in
            this browser. Nothing here connects to LinkedIn or an email
            provider.
          </p>
        )}
      </div>

      {oauthNotice && (
        <div
          className={`rounded-2xl border px-5 py-3 text-13 flex items-start justify-between gap-3 ${
            oauthNotice.kind === "success"
              ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-200"
              : "border-rose-500/40 bg-rose-950/20 text-rose-200"
          }`}
          role="status"
          data-testid="oauth-notice"
        >
          <span>{oauthNotice.text}</span>
          <button
            type="button"
            onClick={() => setOauthNotice(null)}
            className="shrink-0 text-12 font-medium opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 px-5 py-3 text-13 text-rose-200">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="glass-card p-12 text-center text-13 text-black-400">
          Loading accounts…
        </div>
      ) : (
        <>
          {/* LinkedIn accounts */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-16 font-semibold text-white">
              <Linkedin className="h-5 w-5 text-[#4b9be0]" />
              LinkedIn accounts
            </h2>
            {linkedinProvider && (
              <p
                className="flex items-start gap-1.5 text-12 text-black-400 max-w-2xl"
                data-testid="linkedin-provider-note"
              >
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  LinkedIn provider: {linkedinProvider.status}.{" "}
                  {linkedinProvider.statusMessage} An account&apos;s
                  health below is its own recorded state — it does not
                  change this provider status.
                </span>
              </p>
            )}
            {linkedinAccounts.length === 0 && (
              <p className="text-13 text-black-400">
                No LinkedIn account is connected yet.
              </p>
            )}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4.5 items-start">
              {linkedinAccounts.map((a) => (
                <AccountCard
                  key={a.id}
                  account={a}
                  onUpdate={handleUpdate}
                  onDelete={setDeleteTarget}
                />
              ))}
              <AddAccountCard channel="linkedin" isDemo={isDemo} />
            </div>
          </section>

          {/* Email accounts */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-16 font-semibold text-white">
              <Mail className="h-5 w-5 text-emerald-400" />
              Email accounts
            </h2>
            {emailAccounts.length === 0 && (
              <p className="text-13 text-black-400">
                No email account is connected yet.
              </p>
            )}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4.5 items-start">
              {emailAccounts.map((a) => (
                <AccountCard
                  key={a.id}
                  account={a}
                  onUpdate={handleUpdate}
                  onDelete={setDeleteTarget}
                />
              ))}
              <AddAccountCard channel="email" isDemo={isDemo} />
            </div>
          </section>
        </>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="glass-card w-full max-w-md p-6 space-y-4">
            <h3 className="text-16 font-semibold text-white">
              Delete this account?
            </h3>
            <p className="text-13 text-black-300 leading-relaxed">
              “{deleteTarget.display_name}” will be removed. Campaigns
              that send from this account are <strong>not</strong>{" "}
              deleted — their account reference is cleared and they fall
              back to the workspace sending state.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteBusy}
                className="rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-4 py-2 text-13 font-medium text-white transition-colors disabled:opacity-50"
              >
                Keep account
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleteBusy}
                className="rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2 text-13 font-semibold text-white transition-colors disabled:opacity-50"
                data-testid="account-delete-confirm"
              >
                {deleteBusy ? "Deleting…" : "Delete account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
