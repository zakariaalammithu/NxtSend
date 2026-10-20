/**
 * Demo implementation of InboundStore (P5 Stage D).
 *
 * The live ingestion pipeline (webhook → content fetch → matcher →
 * conversation) cannot run in Demo Mode: the webhook route refuses
 * without a database, by design. This store lets the SAME matcher
 * (src/lib/inbox/inbound.ts) run against the demo repositories, so
 * the demo seam (POST /api/inbox/demo-inbound, demo mode only) files
 * simulated replies through the real routing rules — including the
 * refusal to guess a tenant — and creates the same reply
 * notifications the live path creates, in the demo notification
 * store. Every record it writes is demo data (`is_demo`).
 *
 * Demo has exactly one workspace, so cross-workspace ambiguity can
 * only be exercised in unit tests of the pure matcher; the routing
 * rules themselves are identical.
 */

import { getInboxRepository, getLeadsRepository } from "@/lib/data";
import { DEMO_WORKSPACE_ID } from "@/lib/data/workspace";
import { listMessageHistory } from "@/lib/data/message-history";
import type { InboundStore } from "./inbound";
import { buildReplyNotification } from "@/lib/notifications/core";
import { createDemoNotificationStore } from "@/lib/notifications/store";

export function createDemoInboundStore(): InboundStore {
  const inbox = getInboxRepository();
  const leads = getLeadsRepository();

  return {
    async findByProviderMessageId(_provider, providerMessageId) {
      const history = await listMessageHistory(inbox, DEMO_WORKSPACE_ID, 1000);
      const found = history.find(
        (m) => m.provider_message_id === providerMessageId
      );
      return found ? { conversation_id: found.conversation_id } : null;
    },

    async findReferenceTarget(tokens) {
      const cleaned = tokens
        .map((t) => t.replace(/[<>]/g, "").trim())
        .filter(Boolean);
      if (cleaned.length === 0) return null;
      const history = await listMessageHistory(inbox, DEMO_WORKSPACE_ID, 1000);
      const found = history.find(
        (m) =>
          m.provider_message_id !== null &&
          m.provider_message_id !== undefined &&
          cleaned.includes(m.provider_message_id)
      );
      return found
        ? { conversationId: found.conversation_id, workspaceId: found.workspace_id }
        : null;
    },

    async listCandidateConversations(senderEmail) {
      const { conversations } = await inbox.listConversations(
        DEMO_WORKSPACE_ID,
        { limit: 500 }
      );
      return conversations
        .filter(
          (c) =>
            c.channel === "email" &&
            c.contact_email.toLowerCase() === senderEmail.toLowerCase()
        )
        .map((c) => ({
          id: c.id,
          workspace_id: c.workspace_id,
          lead_id: c.lead_id,
          contact_email: c.contact_email,
          subject: c.subject,
          last_message_at: c.last_message_at,
        }));
    },

    async listLeadsByEmail(email) {
      const all = await leads.listLeads(DEMO_WORKSPACE_ID);
      return all
        .filter((l) => (l.email ?? "").toLowerCase() === email.toLowerCase())
        .map((l) => ({
          id: l.id,
          workspace_id: DEMO_WORKSPACE_ID,
          name:
            `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim() || email,
          company: l.company ?? null,
        }));
    },

    async createConversation(input) {
      const id = await inbox.findOrCreateConversation(input.workspaceId, {
        lead_id: input.leadId,
        channel: "email",
        contact_name: input.contactName,
        contact_email: input.contactEmail,
        subject: input.subject,
        is_demo: true,
      });
      return { id };
    },

    async insertInboundMessage(input) {
      const message = await inbox.insertMessage({
        workspace_id: input.workspaceId,
        conversation_id: input.conversationId,
        lead_id: input.leadId,
        channel: "email",
        direction: "inbound",
        subject: input.subject,
        content: input.content,
        status: "received",
        is_demo: true,
        provider: "resend",
        provider_message_id: input.providerMessageId,
        sent_at: input.sentAt,
      });
      return { id: message.id };
    },

    async touchConversation(workspaceId, conversationId, at) {
      await inbox.touchConversation(workspaceId, conversationId, at);
    },

    async notifyReplyReceived(input) {
      const store = createDemoNotificationStore();
      await store.insert(
        buildReplyNotification({
          workspaceId: input.workspaceId,
          conversationId: input.conversationId,
          senderName: input.senderName,
          senderEmail: input.senderEmail,
          subject: input.subject,
          preview: input.preview,
        })
      );
    },
  };
}
