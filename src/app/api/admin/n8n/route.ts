import { NextResponse } from "next/server";
import { resolveAdminGate } from "@/lib/admin/platform-server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  countActiveGrantsByOrigin,
  EMPTY_GRANTS_BY_ORIGIN,
  type GrantsByOrigin,
} from "@/lib/muse-connector/grants";
import { isN8nEnabled, getN8nBaseUrl } from "@/lib/integrations-center/status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface AdminN8nSubscription {
  id: string;
  workspace_id: string;
  event: string;
  target_url: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminN8nDelivery {
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

export interface AdminN8nEvent {
  action: string;
  resource: string | null;
  details: string;
  created_at: string;
}

export interface AdminN8nApiKeyCounts {
  total: number;
  active: number;
  revoked: number;
}

/**
 * GET /api/admin/n8n — platform-admin n8n overview (behind
 * resolveAdminGate; demo mode returns labelled zeros).
 *
 * Live mode reads, through the service role only:
 *   - active n8n grants platform-wide (distinct client + user
 *     pairs with a live refresh token, from the by-origin split of
 *     muse_oauth_tokens; null when the migration 023 tables cannot
 *     be read, reported as `grantCount: null` = unknown, never zero);
 *   - API-key counts from n8n_api_keys (total / active / revoked —
 *     the key HASH is NEVER selected, so it can never leak here;
 *     only counts are returned, never key rows);
 *   - active webhook subscriptions from
 *     zapier_webhook_subscriptions filtered to platform='n8n'
 *     (safe columns only — the per-subscription HMAC `secret` is
 *     NEVER selected, so it can never leak here);
 *   - delivery counts + recent failed/dead deliveries from
 *     zapier_webhook_deliveries filtered to platform='n8n'
 *     (payloads are NOT selected — they can contain lead data);
 *   - n8n API-call counts from audit_logs (`n8n.*` actions);
 *   - recent n8n errors: n8n audit entries whose detail
 *     mentions a failure/denial, plus failed/dead deliveries —
 *     labelled as what they are (a text match over audit details,
 *     not a structured error flag, because audit rows carry no
 *     error column);
 *   - the 10 most recent n8n audit entries.
 *
 * Table contract (verified against the landed migrations):
 * migration 029 adds a `platform` discriminator column to the
 * SHARED zapier_webhook_subscriptions / zapier_webhook_deliveries
 * tables (they keep their `zapier_` names on purpose) — there are
 * NO separate n8n_webhook_* tables. Migration 028 (n8n API keys
 * / v1 API, Worker A) had NOT landed when this route was written,
 * so the n8n_api_keys read below reports unknown (null) until
 * 028 exists. When migration 029 has not been applied the
 * subscription/delivery reads fail and are reported as unknown
 * (null) instead of zero. The grants-by-origin `n8n` branch HAS
 * landed (src/lib/muse-connector/grants.ts), so grantCount reads
 * byOrigin.n8n directly; the `other` fallback below is kept only
 * as a defensive path and its note says so if it is ever used.
 *
 * No token, code, secret, key-hash or message-body material is
 * ever stored in these rows, so none can leak here — only action
 * names, resource labels and plain-language details.
 */
export async function GET() {
  const gate = await resolveAdminGate();
  if ("response" in gate) return gate.response;

  if (gate.mode === "demo") {
    return NextResponse.json({
      mode: "demo",
      n8nEnabled: isN8nEnabled(),
      baseUrl: getN8nBaseUrl(),
      grantCount: 0,
      grantCountNote:
        "Demo Mode: the n8n REST API + webhook surface is unavailable — no grants, keys, subscriptions or deliveries exist.",
      grantsByOrigin: { ...EMPTY_GRANTS_BY_ORIGIN } as GrantsByOrigin,
      apiKeyCounts: { total: 0, active: 0, revoked: 0 } as AdminN8nApiKeyCounts,
      subscriptions: [] as AdminN8nSubscription[],
      subscriptionCount: 0,
      subscriptionsByEvent: {} as Record<string, number>,
      deliveryCounts: { pending: 0, delivered: 0, failed: 0, dead: 0 },
      recentFailures: [] as AdminN8nDelivery[],
      apiCallCounts: [] as { action: string; calls: number }[],
      recentErrors: [] as AdminN8nEvent[],
      recentEvents: [] as AdminN8nEvent[],
      note: "Demo Mode: the n8n REST API + webhook surface is unavailable — no grants, keys, subscriptions or deliveries exist.",
    });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Service role is not configured on the server." },
      { status: 503 }
    );
  }

  const grantsByOrigin = await countActiveGrantsByOrigin(admin).catch(() => null);
  // The `n8n` branch of countActiveGrantsByOrigin HAS landed, so
  // this reads byOrigin.n8n directly. The `other` fallback is kept
  // only as a defensive path (e.g. an older deployment); if it is
  // ever used the note says the number is an upper bound.
  const n8nBranch = (grantsByOrigin as (GrantsByOrigin & { n8n?: number }) | null)?.n8n;
  const grantCount =
    grantsByOrigin == null ? null : (n8nBranch ?? grantsByOrigin.other);
  const grantCountNote =
    grantsByOrigin == null
      ? "Grant tables could not be read — the count is unknown, not zero."
      : n8nBranch != null
        ? "Active n8n OAuth grants platform-wide (by-origin count)."
        : "The grants-by-origin n8n branch was not found, so this falls back to the `other` count — an upper bound that may include non-n8n grants. Treat it as approximate.";

  let apiKeyCounts: AdminN8nApiKeyCounts | null = null;
  // Migration 028 (n8n_api_keys, Worker A) had NOT landed when this
  // route was written: this read fails until it exists, and the
  // counts stay null (unknown, never zero) by design.
  try {
    const { data, error } = await admin
      .from("n8n_api_keys")
      .select("revoked_at")
      .limit(5000);
    if (!error) {
      const rows = (data ?? []) as { revoked_at: string | null }[];
      apiKeyCounts = {
        total: rows.length,
        active: rows.filter((r) => !r.revoked_at).length,
        revoked: rows.filter((r) => r.revoked_at).length,
      };
    }
  } catch (err) {
    console.error("[Admin] n8n API-key counts read failed:", err);
    apiKeyCounts = null;
  }

  let subscriptions: AdminN8nSubscription[] = [];
  let subscriptionsUnknown = false;
  try {
    const { data, error } = await admin
      .from("zapier_webhook_subscriptions")
      .select("id, workspace_id, user_id, event, target_url, active, created_at, updated_at")
      .eq("platform", "n8n")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      subscriptionsUnknown = true;
    } else {
      subscriptions = (data ?? []).map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: String(row.id),
          workspace_id: String(row.workspace_id),
          event: String(row.event),
          target_url: String(row.target_url),
          active: Boolean(row.active),
          created_at: String(row.created_at),
          updated_at: String(row.updated_at),
        } satisfies AdminN8nSubscription;
      });
    }
  } catch (err) {
    console.error("[Admin] n8n subscriptions read failed:", err);
    subscriptionsUnknown = true;
  }

  const subscriptionsByEvent: Record<string, number> = {};
  for (const s of subscriptions) {
    subscriptionsByEvent[s.event] = (subscriptionsByEvent[s.event] ?? 0) + 1;
  }

  const deliveryCounts = { pending: 0, delivered: 0, failed: 0, dead: 0 };
  const recentFailures: AdminN8nDelivery[] = [];
  let deliveriesUnknown = false;
  try {
    const { data, error } = await admin
      .from("zapier_webhook_deliveries")
      .select(
        "id, event, subscription_id, status, attempts, max_attempts, last_error, next_retry_at, created_at"
      )
      .eq("platform", "n8n")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) {
      deliveriesUnknown = true;
    } else {
      for (const r of data ?? []) {
        const row = r as Record<string, unknown>;
        const status = String(row.status ?? "unknown");
        if (status === "pending") deliveryCounts.pending += 1;
        else if (status === "delivered") deliveryCounts.delivered += 1;
        else if (status === "failed") deliveryCounts.failed += 1;
        else if (status === "dead") deliveryCounts.dead += 1;
        if (status === "failed" || status === "dead") {
          if (recentFailures.length < 10) {
            recentFailures.push({
              id: String(row.id),
              event: String(row.event),
              subscription_id: String(row.subscription_id),
              status,
              attempts: Number(row.attempts ?? 0),
              max_attempts: Number(row.max_attempts ?? 0),
              last_error: (row.last_error as string | null) ?? null,
              next_retry_at: (row.next_retry_at as string | null) ?? null,
              created_at: String(row.created_at),
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("[Admin] n8n deliveries read failed:", err);
    deliveriesUnknown = true;
  }

  let apiCallCounts: { action: string; calls: number }[] = [];
  let recentErrors: AdminN8nEvent[] = [];
  let recentEvents: AdminN8nEvent[] = [];
  try {
    const { data, error } = await admin
      .from("audit_logs")
      .select("action, resource, metadata, created_at")
      .or("action.ilike.n8n.%")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (!error) {
      const counts = new Map<string, number>();
      const errors: AdminN8nEvent[] = [];
      const events: AdminN8nEvent[] = [];
      for (const row of data ?? []) {
        const r = row as Record<string, unknown>;
        const metadata =
          r.metadata && typeof r.metadata === "object"
            ? (r.metadata as Record<string, unknown>)
            : {};
        const details =
          typeof metadata.details === "string" ? metadata.details : "";
        const entry: AdminN8nEvent = {
          action: String(r.action ?? "UNKNOWN"),
          resource: (r.resource as string | null) ?? null,
          details,
          created_at: String(r.created_at ?? new Date().toISOString()),
        };
        counts.set(entry.action, (counts.get(entry.action) ?? 0) + 1);
        const detailLower = details.toLowerCase();
        if (
          detailLower.includes("fail") ||
          detailLower.includes("error") ||
          detailLower.includes("denied") ||
          detailLower.includes("refused")
        ) {
          errors.push(entry);
        }
        events.push(entry);
      }
      apiCallCounts = Array.from(counts, ([action, calls]) => ({ action, calls })).sort(
        (a, b) => b.calls - a.calls
      );
      recentErrors = errors.slice(0, 10);
      recentEvents = events.slice(0, 10);
    }
  } catch (err) {
    console.error("[Admin] n8n stats audit read failed:", err);
  }

  return NextResponse.json({
    mode: gate.mode,
    n8nEnabled: isN8nEnabled(),
    baseUrl: getN8nBaseUrl(),
    grantCount,
    grantCountNote,
    grantsByOrigin,
    apiKeyCounts,
    subscriptions: subscriptionsUnknown ? null : subscriptions,
    subscriptionCount: subscriptionsUnknown ? null : subscriptions.length,
    subscriptionsByEvent: subscriptionsUnknown ? null : subscriptionsByEvent,
    deliveryCounts: deliveriesUnknown ? null : deliveryCounts,
    recentFailures: deliveriesUnknown ? null : recentFailures,
    apiCallCounts,
    recentErrors,
    recentEvents,
    note:
      subscriptionsUnknown || deliveriesUnknown || apiKeyCounts === null
        ? "Migration 029 (platform discriminator on the shared webhook tables) and/or migration 028 (n8n API keys) could not be read — apply supabase/migrations/029_n8n_webhook_platform.sql and Worker A's 028 to this project before the API-key / subscription / delivery counts mean anything."
        : "n8n API + webhook surface (migrations 028–029; webhook tables shared with Zapier, platform='n8n'). The n8n-nodes-nxtsend package has NOT been published on npm and is NOT verified by n8n.",
  });
}
