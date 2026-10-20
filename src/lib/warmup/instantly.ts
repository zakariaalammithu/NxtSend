/**
 * Instantly warm-up adapter — the one approved warm-up provider
 * (P5 Stage E). Read-only by design.
 *
 * Documented API surface used here (Instantly API v2, from the
 * provider's own developer documentation + published OpenAPI spec at
 * developer.instantly.ai — researched 2026-10-20):
 *
 *   Base URL   https://api.instantly.ai
 *   Auth       Authorization: Bearer <API key> — a self-serve key the
 *              operator creates in Instantly (Settings → Integrations
 *              → API) with scopes; the calls below need `accounts:read`
 *              (or accounts:all / all:read / all:all).
 *   Verify     GET  /api/v2/accounts?limit=1
 *              ("List account" — proves the key + scope are accepted)
 *   Status     GET  /api/v2/accounts?limit=100  → { items: Account[] }
 *              Account fields mapped below: email, status,
 *              warmup_status, warmup.limit, warmup.increment,
 *              daily_limit, stat_warmup_score,
 *              timestamp_warmup_start, provider_code, enable_slow_ramp
 *   Analytics  POST /api/v2/accounts/warmup-analytics { emails[] }
 *              → aggregate_data[email] = { sent, received,
 *                landed_inbox, landed_spam, health_score,
 *                health_score_label }  (provider-computed, verbatim)
 *
 * Enum labels are the provider's own (OpenAPI x-enumDescriptions):
 *   account status:  1 Active · 2 Paused · 3 Temporarily paused
 *                    (maintenance) · -1 Connection Error ·
 *                    -2 Soft Bounce Error · -3 Sending Error
 *   warmup_status:   0 Paused · 1 Active · -1 Banned ·
 *                    -2 Spam Folder Unknown · -3 Permanent Suspension
 *   provider_code:   1 Custom IMAP/SMTP · 2 Google · 3 Microsoft ·
 *                    4 AWS · 8 AirMail · 11 Airmail Instant
 *
 * NOT used, deliberately: POST /api/v2/accounts/warmup/enable and
 * /disable also exist in the provider's API. NxtSend never calls them
 * — starting/stopping warm-up engagement is the operator's action in
 * Instantly's own dashboard, so this app can never initiate warm-up
 * activity itself.
 *
 * Everything returned is provider data mapped field-by-field. Unknown
 * or missing fields become null / "unknown" — never estimates.
 */

import type { ProviderState } from "@/lib/env";
import { getDataMode, type DataMode } from "@/lib/data/mode";
import { getWarmupState, type WarmupEnv } from "./state";
import type {
  WarmupMailbox,
  WarmupMailboxAnalytics,
  WarmupProviderAdapter,
  WarmupStatusResult,
  WarmupVerifyResult,
} from "./types";

export const INSTANTLY_API_BASE = "https://api.instantly.ai";

const ACCOUNT_STATUS_LABELS: Record<number, string> = {
  1: "Active",
  2: "Paused",
  3: "Temporarily paused (maintenance)",
  [-1]: "Connection Error",
  [-2]: "Soft Bounce Error",
  [-3]: "Sending Error",
};

const WARMUP_STATUS_MAP: Record<
  number,
  { status: WarmupMailbox["warmupStatus"]; label: string }
> = {
  0: { status: "paused", label: "Paused" },
  1: { status: "active", label: "Active" },
  [-1]: { status: "banned", label: "Banned" },
  [-2]: { status: "spam_folder_unknown", label: "Spam Folder Unknown" },
  [-3]: { status: "permanent_suspension", label: "Permanent Suspension" },
};

const PROVIDER_CODE_LABELS: Record<number, string> = {
  1: "Custom IMAP/SMTP",
  2: "Google",
  3: "Microsoft",
  4: "AWS",
  8: "AirMail",
  11: "Airmail Instant",
};

// ── Tolerant field coercion (provider payloads are external data) ──────────

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// ── Mapping: provider Account object → WarmupMailbox ───────────────────────

export function mapInstantlyAccount(raw: unknown): WarmupMailbox | null {
  const account = record(raw);
  const email = str(account.email);
  if (!email) return null;

  const warmup = record(account.warmup);
  const warmupStatusCode = num(account.warmup_status);
  const warmupMapped =
    warmupStatusCode !== null ? WARMUP_STATUS_MAP[warmupStatusCode] : undefined;
  const accountStatusCode = num(account.status);
  const providerCode = num(account.provider_code);

  return {
    email,
    accountStatusCode,
    accountStatusLabel:
      accountStatusCode !== null
        ? (ACCOUNT_STATUS_LABELS[accountStatusCode] ??
          `Unknown (code ${accountStatusCode})`)
        : "Not reported",
    warmupStatus: warmupMapped?.status ?? "unknown",
    warmupStatusCode,
    warmupStatusLabel: warmupMapped?.label ?? "Not reported by provider",
    warmupDailyLimit: num(warmup.limit),
    warmupIncrement:
      typeof warmup.increment === "string" || typeof warmup.increment === "number"
        ? String(warmup.increment)
        : null,
    slowRamp: bool(account.enable_slow_ramp),
    dailyLimit: num(account.daily_limit),
    warmupScore: num(account.stat_warmup_score),
    warmupStartedAt: str(account.timestamp_warmup_start),
    mailboxProvider:
      providerCode !== null
        ? (PROVIDER_CODE_LABELS[providerCode] ?? `Provider code ${providerCode}`)
        : null,
    analytics: null,
  };
}

export function mapInstantlyAnalytics(raw: unknown): WarmupMailboxAnalytics {
  const agg = record(raw);
  return {
    sent: num(agg.sent),
    received: num(agg.received),
    landedInbox: num(agg.landed_inbox),
    landedSpam: num(agg.landed_spam),
    healthScore: num(agg.health_score),
    healthScoreLabel: str(agg.health_score_label),
  };
}

// ── Adapter ────────────────────────────────────────────────────────────────

export interface InstantlyAdapterDeps {
  env?: WarmupEnv;
  mode?: DataMode;
  /** Injectable fetch (tests). Defaults to the global fetch. */
  fetchFn?: typeof fetch;
  apiBase?: string;
}

interface ProviderCallResult {
  ok: boolean;
  status: number;
  body: unknown;
  /** Provider error message (its own error payload), when present. */
  providerMessage: string | null;
}

export class InstantlyWarmupAdapter implements WarmupProviderAdapter {
  readonly provider = "instantly";
  readonly providerLabel = "Instantly";
  private readonly deps: InstantlyAdapterDeps;

  constructor(deps: InstantlyAdapterDeps = {}) {
    this.deps = deps;
  }

  private env(): WarmupEnv {
    return (
      this.deps.env ?? { INSTANTLY_API_KEY: process.env.INSTANTLY_API_KEY }
    );
  }

  private mode(): DataMode {
    return this.deps.mode ?? getDataMode();
  }

  getState(): ProviderState {
    return getWarmupState(this.env(), this.mode());
  }

  private async call(
    path: string,
    init: { method: "GET" | "POST"; body?: unknown }
  ): Promise<ProviderCallResult> {
    const fetchFn = this.deps.fetchFn ?? fetch;
    const base = (this.deps.apiBase ?? INSTANTLY_API_BASE).replace(/\/$/, "");
    const res = await fetchFn(`${base}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${this.env().INSTANTLY_API_KEY as string}`,
        ...(init.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      },
      ...(init.body !== undefined
        ? { body: JSON.stringify(init.body) }
        : {}),
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const providerMessage = str(record(body).message);
    return { ok: res.ok, status: res.status, body, providerMessage };
  }

  /** Explains a failed provider call using the provider's own words. */
  private failureMessage(result: ProviderCallResult, action: string): string {
    if (result.status === 401) {
      return `Instantly rejected the API key (HTTP 401${result.providerMessage ? `: ${result.providerMessage}` : ""}). The key may be invalid, revoked, or missing the accounts:read scope. No warm-up data was returned.`;
    }
    if (result.status === 402) {
      return `Instantly reports the workspace has no active paid plan (HTTP 402${result.providerMessage ? `: ${result.providerMessage}` : ""}). API access requires an active Instantly plan. No warm-up data was returned.`;
    }
    if (result.status === 429) {
      return `Instantly rate-limited the ${action} request (HTTP 429). Try again later.`;
    }
    return `Instantly ${action} failed (HTTP ${result.status}${result.providerMessage ? `: ${result.providerMessage}` : ""}).`;
  }

  private notReady(state: ProviderState): WarmupVerifyResult {
    return {
      ok: false,
      attempted: false,
      state,
      message:
        state === "demo"
          ? "Demo Mode: no verification call was made. Warm-up stays Unavailable until the app runs live with an Instantly API key."
          : state === "configuration_required"
            ? "INSTANTLY_API_KEY is present but still a placeholder value — no verification call was made. Paste the real key from Instantly (Settings → Integrations → API)."
            : "INSTANTLY_API_KEY is not set — no verification call was made. Warm-up is Unavailable until an Instantly API key is configured.",
    };
  }

  async verifyConnection(): Promise<WarmupVerifyResult> {
    const state = this.getState();
    if (state !== "connected") return this.notReady(state);
    let result: ProviderCallResult;
    try {
      result = await this.call("/api/v2/accounts?limit=1", { method: "GET" });
    } catch (err) {
      return {
        ok: false,
        attempted: true,
        state: "error",
        message: `Instantly verification request failed: ${err instanceof Error ? err.message : "network error"}.`,
      };
    }
    if (!result.ok) {
      return {
        ok: false,
        attempted: true,
        state: "error",
        message: this.failureMessage(result, "verification"),
      };
    }
    const items = record(result.body).items;
    const count = Array.isArray(items) ? items.length : 0;
    return {
      ok: true,
      attempted: true,
      state: "connected",
      message: `Instantly accepted the API key (accounts list succeeded${count > 0 ? `; ${count} mailbox${count === 1 ? "" : "es"} visible in the first page` : ""}). Warm-up status below is read from Instantly's own data.`,
    };
  }

  async getWarmupStatus(): Promise<WarmupStatusResult> {
    const state = this.getState();
    if (state !== "connected") {
      const notReady = this.notReady(state);
      return { ok: false, state: notReady.state, message: notReady.message };
    }

    let listResult: ProviderCallResult;
    try {
      listResult = await this.call("/api/v2/accounts?limit=100", {
        method: "GET",
      });
    } catch (err) {
      return {
        ok: false,
        state: "error",
        message: `Instantly accounts request failed: ${err instanceof Error ? err.message : "network error"}.`,
      };
    }
    if (!listResult.ok) {
      return {
        ok: false,
        state: "error",
        message: this.failureMessage(listResult, "accounts list"),
      };
    }

    const items = record(listResult.body).items;
    const mailboxes: WarmupMailbox[] = (Array.isArray(items) ? items : [])
      .map(mapInstantlyAccount)
      .filter((m): m is WarmupMailbox => m !== null);

    // Provider-reported aggregate analytics per mailbox. A failure here
    // degrades to "mailboxes without analytics + the reason" — never to
    // invented numbers.
    let analyticsError: string | null = null;
    if (mailboxes.length > 0) {
      try {
        const analyticsResult = await this.call(
          "/api/v2/accounts/warmup-analytics",
          {
            method: "POST",
            body: { emails: mailboxes.map((m) => m.email).slice(0, 100) },
          }
        );
        if (analyticsResult.ok) {
          const aggregate = record(record(analyticsResult.body).aggregate_data);
          for (const mailbox of mailboxes) {
            const entry = aggregate[mailbox.email];
            if (entry !== undefined) {
              mailbox.analytics = mapInstantlyAnalytics(entry);
            }
          }
        } else {
          analyticsError = this.failureMessage(
            analyticsResult,
            "warm-up analytics"
          );
        }
      } catch (err) {
        analyticsError = `Instantly warm-up analytics request failed: ${err instanceof Error ? err.message : "network error"}.`;
      }
    }

    return {
      ok: true,
      report: {
        provider: this.provider,
        providerLabel: this.providerLabel,
        fetchedAt: new Date().toISOString(),
        mailboxes,
        analyticsError,
      },
    };
  }
}
