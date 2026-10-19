/**
 * Supabase implementation of EmailEventStore (service role).
 *
 * Webhook deliveries are system writes — migration 004 gives
 * `email_events` no client policies, so these run through the admin
 * client only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailEventStore } from "./webhook";
import { addSuppression } from "./suppression";
import { ingestReceivedEmail } from "@/lib/inbox/inbound";
import { createSupabaseInboundStore } from "@/lib/inbox/inbound-store";

export function createSupabaseEmailEventStore(
  admin: SupabaseClient
): EmailEventStore {
  return {
    async hasEvent(providerEventId) {
      const { data } = await admin
        .from("email_events")
        .select("id")
        .eq("provider_event_id", providerEventId)
        .maybeSingle();
      return Boolean(data);
    },
    async recordEvent(evt) {
      const { error } = await admin.from("email_events").insert({
        provider_event_id: evt.providerEventId,
        event_type: evt.eventType,
        provider_message_id: evt.providerMessageId,
        payload: evt.payload as Record<string, unknown>,
      });
      // Unique-violation = a concurrent redelivery won the race; the
      // handler treats that exactly like a pre-checked duplicate.
      if (error && !error.message.toLowerCase().includes("duplicate")) {
        throw new Error(`Failed to record email event: ${error.message}`);
      }
    },
    async updateMessageStatus(providerMessageId, status) {
      const { error } = await admin
        .from("messages")
        .update({ status })
        .eq("provider", "resend")
        .eq("provider_message_id", providerMessageId);
      if (error) {
        throw new Error(`Failed to update message status: ${error.message}`);
      }
    },
    async getMessageWorkspace(providerMessageId) {
      const { data } = await admin
        .from("messages")
        .select("workspace_id")
        .eq("provider", "resend")
        .eq("provider_message_id", providerMessageId)
        .maybeSingle();
      return data ? String((data as { workspace_id: string }).workspace_id) : null;
    },
    async addSuppression(workspaceId, email, reason) {
      await addSuppression(admin, workspaceId, email, reason);
    },
    async ingestReceivedEmail(email) {
      // Tenant routing + conversation matching live in
      // src/lib/inbox/inbound.ts; the matcher refuses ambiguous
      // tenants instead of guessing.
      return ingestReceivedEmail(createSupabaseInboundStore(admin), email);
    },
  };
}
