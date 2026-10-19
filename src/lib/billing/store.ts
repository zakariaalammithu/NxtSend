/**
 * Supabase implementation of BillingStore (service role).
 *
 * `billing_events` has no client policies (migration 004) and
 * `subscriptions` writes are webhook-driven, so everything here runs
 * through the admin client from server routes only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillingStore, SubscriptionUpsert } from "./webhook";

export function createSupabaseBillingStore(admin: SupabaseClient): BillingStore {
  return {
    async hasEvent(eventId) {
      const { data } = await admin
        .from("billing_events")
        .select("id")
        .eq("event_id", eventId)
        .maybeSingle();
      return Boolean(data);
    },
    async recordEvent(eventId, eventType, payload) {
      const { error } = await admin.from("billing_events").insert({
        provider: "stripe",
        event_id: eventId,
        event_type: eventType,
        payload: payload as Record<string, unknown>,
      });
      if (error && !error.message.toLowerCase().includes("duplicate")) {
        throw new Error(`Failed to record billing event: ${error.message}`);
      }
    },
    async deleteEvent(eventId) {
      await admin.from("billing_events").delete().eq("event_id", eventId);
    },
    async getWorkspaceIdByCustomerId(customerId) {
      const { data } = await admin
        .from("subscriptions")
        .select("workspace_id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();
      return data ? String((data as { workspace_id: string }).workspace_id) : null;
    },
    async upsertSubscription(row: SubscriptionUpsert) {
      const { error } = await admin.from("subscriptions").upsert(
        {
          workspace_id: row.workspaceId,
          plan: row.plan,
          status: row.status,
          stripe_customer_id: row.stripeCustomerId ?? undefined,
          stripe_subscription_id: row.stripeSubscriptionId ?? undefined,
          stripe_price_id: row.stripePriceId ?? undefined,
          current_period_end: row.currentPeriodEnd ?? undefined,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id" }
      );
      if (error) {
        throw new Error(`Failed to upsert subscription: ${error.message}`);
      }
    },
    async setSubscriptionStatusByCustomer(customerId, status) {
      const { error } = await admin
        .from("subscriptions")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("stripe_customer_id", customerId);
      if (error) {
        throw new Error(`Failed to update subscription status: ${error.message}`);
      }
    },
  };
}
