/**
 * Supabase-backed JobsContext (service role).
 *
 * Usage counts are real row counts (head-only selects). The
 * emailsPerMonth metric counts outbound email-channel messages in the
 * current period — messages recorded by the email adapter carry
 * provider IDs; simulated/demo rows are excluded via is_demo = false.
 * Webhook retries reuse the signed dispatch path (never a raw fetch).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobsContext } from "./types";
import {
  createSupabaseWebhookStore,
  getWorkspaceWebhookConfig,
} from "@/lib/webhooks/store";
import { runDeliveryAttempt } from "@/lib/webhooks/dispatch";
import { SupabaseExecutorStore } from "@/lib/executor/supabase-store";
import { createCampaignRoutingAdapter } from "@/lib/email";
import { downloadVoiceNoteAsAttachment } from "@/lib/voice/storage";

export function createSupabaseJobsContext(admin: SupabaseClient): JobsContext {
  const webhookStore = createSupabaseWebhookStore(admin);
  return {
    async listWorkspaces() {
      const { data, error } = await admin.from("workspaces").select("id");
      if (error) throw new Error(`Failed to list workspaces: ${error.message}`);
      return (data ?? []).map((r) => String((r as { id: string }).id));
    },
    async getWorkspacePlan(workspaceId) {
      const { data } = await admin
        .from("subscriptions")
        .select("plan")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (data?.plan) return String(data.plan);
      const { data: ws } = await admin
        .from("workspaces")
        .select("plan")
        .eq("id", workspaceId)
        .maybeSingle();
      return ws?.plan ? String(ws.plan) : "free";
    },
    async countWorkspaceMetric(workspaceId, metric, periodStartIso) {
      if (metric === "leads") {
        const { count } = await admin
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId);
        return count ?? 0;
      }
      if (metric === "campaigns") {
        const { count } = await admin
          .from("campaigns")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .neq("status", "archived");
        return count ?? 0;
      }
      const { count } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("channel", "email")
        .eq("direction", "outbound")
        .eq("is_demo", false)
        .gte("sent_at", periodStartIso);
      return count ?? 0;
    },
    async upsertUsageRecord(workspaceId, metric, periodStart, quantity) {
      const { error } = await admin.from("usage_records").upsert(
        {
          workspace_id: workspaceId,
          metric,
          period_start: periodStart,
          quantity,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,metric,period_start" }
      );
      if (error) throw new Error(`Failed to upsert usage record: ${error.message}`);
    },
    async listDueWebhookRetries(nowIso) {
      const due = await webhookStore.listDueRetries(nowIso);
      return due.map((d) => ({
        id: d.id,
        workspace_id: d.workspace_id,
        status: d.status,
        attempts: d.attempts,
        max_attempts: d.max_attempts,
      }));
    },
    async retryWebhookDelivery(deliveryId) {
      const delivery = await webhookStore.getDelivery(deliveryId);
      if (!delivery) return { status: "missing" };
      const config = await getWorkspaceWebhookConfig(admin, delivery.workspace_id);
      if (!config || !config.enabled) return { status: "no_config" };
      // Re-point the attempt at the CURRENT subscription URL.
      const updated = await runDeliveryAttempt(
        { store: webhookStore },
        config,
        { ...delivery, target_url: config.url }
      );
      return { status: updated.status };
    },
    getSequenceExecutor() {
      // Live worker: the executor runs against the same service-role
      // client, sending through the mailbox-routing adapter
      // (P5 Stage G): a campaign whose selected email account
      // (campaigns.email_account_id) is an OAuth-connected Gmail /
      // Outlook mailbox sends through that mailbox (From = the
      // mailbox address); every other campaign sends through Resend.
      // A selected mailbox whose grant is missing/inactive REFUSES
      // (never a silent Resend fallback — the From identity would
      // change). All adapters fail closed on suppression.
      // skipMessageRecord: the executor records the message itself
      // (via the store's insertMessage, with the campaign link) — an
      // adapter recording its own row would double-record every send.
      return {
        store: new SupabaseExecutorStore(admin),
        adapter: createCampaignRoutingAdapter(admin),
        // Step voice notes stored in the private bucket resolve to
        // real attachments at send time (P6 Stage C).
        resolveVoiceAttachment: (path: string) =>
          downloadVoiceNoteAsAttachment(admin, path),
      };
    },
  };
}
