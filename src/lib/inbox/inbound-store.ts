/**
 * Supabase (service-role) implementation of InboundStore.
 *
 * Inbound email arrives tenant-less — the webhook knows only the
 * sender's address — so routing MUST run with the service role and the
 * matcher in ./inbound.ts decides the tenant. Every query here either
 * feeds that matcher or writes into the single workspace it chose; the
 * matcher refuses (unrouted) whenever the tenant is ambiguous, so this
 * store never guesses.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InboundCandidateConversation,
  InboundLeadRef,
  InboundStore,
} from "./inbound";

type Row = Record<string, unknown>;

export function createSupabaseInboundStore(admin: SupabaseClient): InboundStore {
  return {
    async findByProviderMessageId(provider, providerMessageId) {
      const { data } = await admin
        .from("messages")
        .select("conversation_id")
        .eq("provider", provider)
        .eq("provider_message_id", providerMessageId)
        .not("conversation_id", "is", null)
        .maybeSingle();
      return data
        ? { conversation_id: String((data as Row).conversation_id) }
        : null;
    },

    async findReferenceTarget(tokens) {
      // Stored provider IDs are the only IDs we can thread on (see the
      // heuristic notes in ./inbound.ts). Tokens are RFC message-ids
      // from the received mail's In-Reply-To / References headers.
      const cleaned = tokens.map((t) => t.replace(/[<>]/g, "").trim()).filter(Boolean);
      if (cleaned.length === 0) return null;
      const { data } = await admin
        .from("messages")
        .select("conversation_id, workspace_id")
        .in("provider_message_id", cleaned)
        .not("conversation_id", "is", null)
        .limit(1)
        .maybeSingle();
      if (!data) return null;
      const row = data as Row;
      return {
        conversationId: String(row.conversation_id),
        workspaceId: String(row.workspace_id),
      };
    },

    async listCandidateConversations(senderEmail) {
      const byContact = await admin
        .from("conversations")
        .select("id, workspace_id, lead_id, contact_email, subject, last_message_at")
        .eq("channel", "email")
        .ilike("contact_email", senderEmail)
        .order("last_message_at", { ascending: false });

      const { data: leadRows } = await admin
        .from("leads")
        .select("id")
        .ilike("email", senderEmail);
      const leadIds = ((leadRows ?? []) as Row[]).map((r) => String(r.id));

      let byLead: Row[] = [];
      if (leadIds.length > 0) {
        const res = await admin
          .from("conversations")
          .select("id, workspace_id, lead_id, contact_email, subject, last_message_at")
          .eq("channel", "email")
          .in("lead_id", leadIds)
          .order("last_message_at", { ascending: false });
        byLead = (res.data ?? []) as Row[];
      }

      const seen = new Map<string, InboundCandidateConversation>();
      for (const row of [...((byContact.data ?? []) as Row[]), ...byLead]) {
        const conv: InboundCandidateConversation = {
          id: String(row.id),
          workspace_id: String(row.workspace_id),
          lead_id: (row.lead_id as string | null) ?? null,
          contact_email: String(row.contact_email ?? ""),
          subject: (row.subject as string | null) ?? null,
          last_message_at: String(row.last_message_at),
        };
        if (!seen.has(conv.id)) seen.set(conv.id, conv);
      }
      return Array.from(seen.values()).sort((a, b) =>
        b.last_message_at.localeCompare(a.last_message_at)
      );
    },

    async listLeadsByEmail(email) {
      const { data } = await admin
        .from("leads")
        .select("id, workspace_id, first_name, last_name, company")
        .ilike("email", email);
      return ((data ?? []) as Row[]).map((r) => ({
        id: String(r.id),
        workspace_id: String(r.workspace_id),
        name:
          `${(r.first_name as string) ?? ""} ${(r.last_name as string) ?? ""}`.trim() ||
          email,
        company: (r.company as string | null) ?? null,
      })) as InboundLeadRef[];
    },

    async createConversation(input) {
      const { data, error } = await admin
        .from("conversations")
        .insert({
          workspace_id: input.workspaceId,
          lead_id: input.leadId,
          channel: "email",
          subject: input.subject,
          contact_email: input.contactEmail,
          contact_name: input.contactName,
          status: "open",
          is_demo: false,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Failed to create conversation: ${error.message}`);
      return { id: String((data as Row).id) };
    },

    async insertInboundMessage(input) {
      const { data, error } = await admin
        .from("messages")
        .insert({
          workspace_id: input.workspaceId,
          conversation_id: input.conversationId,
          lead_id: input.leadId,
          channel: "email",
          direction: "inbound",
          subject: input.subject,
          content: input.content,
          status: "received",
          is_demo: false,
          provider: "resend",
          provider_message_id: input.providerMessageId,
          sent_at: input.sentAt,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Failed to store inbound message: ${error.message}`);
      return { id: String((data as Row).id) };
    },

    async touchConversation(workspaceId, conversationId, at) {
      await admin
        .from("conversations")
        .update({ last_message_at: at, updated_at: new Date().toISOString() })
        .eq("workspace_id", workspaceId)
        .eq("id", conversationId);
    },
  };
}
