import { NextResponse } from "next/server";
import { resolveAdminGate } from "@/lib/admin/platform-server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  countActiveGrantsByOrigin,
  EMPTY_GRANTS_BY_ORIGIN,
  type GrantsByOrigin,
} from "@/lib/muse-connector/grants";
import { isZapierEnabled, getZapierBaseUrl } from "@/lib/integrations/zapier/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface AdminZapierSubscription {
  id: string;
  workspace_id: string;
  event: string;
  target_url: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminZapierDelivery {
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

export interface AdminZapierEvent {
  action: string;
  resource: string | null;
  details: string;
  created_at: string;
}

/**
 * GET /api/admin/zapier — platform-admin Zapier overview (behind
 * resolveAdminGate; demo mode returns labelled zeros).
 *
 * Live mode reads, through the service role only:
 *   - active Zapier grants platform-wide (distinct client + user
 *     pairs with a live refresh token, from the by-origin split of
 *     muse_oauth_tokens; null when the migration 023 tables cannot
 *     be read, reported as `grantCount: null` = unknown, never zero);
 *   - active webhook subscriptions from zapier_webhook_subscriptions
 *     (safe columns only — the per-subscription HMAC `secret` is
 *     NEVER selected, so it can never leak here);
 *   - delivery counts + recent failed/dead deliveries from
 *     zapier_webhook_deliveries (payloads are NOT selected — they
 *     can contain lead data);
 *   - Zapier API-call counts from audit_logs (`zapier.*` actions);
 *   - recent Zapier errors: Zapier audit entries whose detail
 *     mentions a failure/denial, plus failed/dead deliveries —
 *     labelled as what they are (a text match over audit details,
 *     not a structured error flag, because audit rows carry no
 *     error column);
 *   - the 10 most recent Zapier audit entries.
 *
 * No token, code, secret or message-body material is ever stored in
 * these rows, so none can leak here — only action names, resource
 * labels and plain-language details. When migration 025 has not been
 * applied the subscription/delivery reads fail and are reported as
 * unknown (null) instead of zero.
 */
export async function GET() {
  const gate = await resolveAdminGate();
  if ("response" in gate) return gate.response;

  if (gate.mode === "demo") {
    return NextResponse.json({
      mode: "demo",
      zapierEnabled: isZapierEnabled(),
      baseUrl: getZapierBaseUrl(),
      grantCount: 0,
      grantsByOrigin: { ...EMPTY_GRANTS_BY_ORIGIN } as GrantsByOrigin,
      subscriptions: [] as AdminZapierSubscription[],
      subscriptionCount: 0,
      subscriptionsByEvent: {} as Record<string, number>,
      deliveryCounts: { pending: 0, delivered: 0, failed: 0, dead: 0 },
      recentFailures: [] as AdminZapierDelivery[],
      apiCallCounts: [] as { action: string; calls: number }[],
      recentErrors: [] as AdminZapierEvent[],
      recentEvents: [] as AdminZapierEvent[],
      note: "Demo Mode: the Zapier REST API + webhook surface is unavailable — no grants, subscriptions or deliveries exist.",
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
  const grantCount = grantsByOrigin ? grantsByOrigin.zapier : null;

  let subscriptions: AdminZapierSubscription[] = [];
  let subscriptionsUnknown = false;
  try {
    const { data, error } = await admin
      .from("zapier_webhook_subscriptions")
      .select("id, workspace_id, user_id, event, target_url, active, created_at, updated_at")
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
        } satisfies AdminZapierSubscription;
      });
    }
  } catch (err) {
    console.error("[Admin] Zapier subscriptions read failed:", err);
    subscriptionsUnknown = true;
  }

  const subscriptionsByEvent: Record<string, number> = {};
  for (const s of subscriptions) {
    subscriptionsByEvent[s.event] = (subscriptionsByEvent[s.event] ?? 0) + 1;
  }

  const deliveryCounts = { pending: 0, delivered: 0, failed: 0, dead: 0 };
  const recentFailures: AdminZapierDelivery[] = [];
  let deliveriesUnknown = false;
  try {
    const { data, error } = await admin
      .from("zapier_webhook_deliveries")
      .select(
        "id, event, subscription_id, status, attempts, max_attempts, last_error, next_retry_at, created_at"
      )
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
    console.error("[Admin] Zapier deliveries read failed:", err);
    deliveriesUnknown = true;
  }

  let apiCallCounts: { action: string; calls: number }[] = [];
  let recentErrors: AdminZapierEvent[] = [];
  let recentEvents: AdminZapierEvent[] = [];
  try {
    const { data, error } = await admin
      .from("audit_logs")
      .select("action, resource, metadata, created_at")
      .or("action.ilike.zapier.%")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (!error) {
      const counts = new Map<string, number>();
      const errors: AdminZapierEvent[] = [];
      const events: AdminZapierEvent[] = [];
      for (const row of data ?? []) {
        const r = row as Record<string, unknown>;
        const metadata =
          r.metadata && typeof r.metadata === "object"
            ? (r.metadata as Record<string, unknown>)
            : {};
        const details =
          typeof metadata.details === "string" ? metadata.details : "";
        const entry: AdminZapierEvent = {
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
    console.error("[Admin] Zapier stats audit read failed:", err);
  }

  return NextResponse.json({
    mode: gate.mode,
    zapierEnabled: isZapierEnabled(),
    baseUrl: getZapierBaseUrl(),
    grantCount,
    grantsByOrigin,
    subscriptions: subscriptionsUnknown ? null : subscriptions,
    subscriptionCount: subscriptionsUnknown ? null : subscriptions.length,
    subscriptionsByEvent: subscriptionsUnknown ? null : subscriptionsByEvent,
    deliveryCounts: deliveriesUnknown ? null : deliveryCounts,
    recentFailures: deliveriesUnknown ? null : recentFailures,
    apiCallCounts,
    recentErrors,
    recentEvents,
    note:
      subscriptionsUnknown || deliveriesUnknown
        ? "Migration 025 tables could not be read — apply supabase/migrations/025_zapier_webhooks.sql to this project before the subscription/delivery counts mean anything."
        : "Zapier API + webhook surface (migrations 025–027). Publication on Zapier has NOT been claimed.",
  });
}
