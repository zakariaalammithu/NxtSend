import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { runBotPipeline } from "../pipeline";
import { DEFAULT_SUPPORT_SETTINGS } from "../seeds";
import type { SupportStore } from "../store";
import type {
  SupportConversation,
  SupportKnowledgeCategory,
  SupportKnowledgeEntry,
  SupportMessage,
  SupportSettings,
} from "../types";

/**
 * The AI enhancement only runs in live mode, so these tests use a
 * minimal in-memory stub store with mode "supabase" and two synthetic
 * entries whose scores land in the fallback band WITH candidates —
 * exactly the situation the grounded layer exists for.
 */

const entry: SupportKnowledgeEntry = {
  id: "kb-invoices",
  category_id: "cat-billing",
  slug: "when-invoices-issued",
  title: "Billing cycles explained",
  question: "When are invoices issued?",
  answer: "Invoices are issued by Stripe after checkout.",
  keywords: ["invoices"],
  related_url: null,
  priority: 50,
  enabled: true,
  status: "published",
  search_text: "billing cycles explained when are invoices issued invoices billing invoices are issued by stripe after checkout",
  content_hash: "test",
  indexed_at: new Date().toISOString(),
  created_by: null,
  updated_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
const category: SupportKnowledgeCategory = {
  id: "cat-billing",
  name: "Billing",
  slug: "billing",
  description: "",
  enabled: true,
  sort_order: 1,
  created_by: null,
  updated_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const conversation: SupportConversation = {
  id: "conv-ai-test",
  workspace_id: null,
  user_id: null,
  guest_name: "AI Tester",
  guest_email: null,
  guest_access_token_hash: "hash",
  guest_token_expires_at: null,
  status: "open",
  handling_mode: "bot",
  source: "marketing_widget",
  subject: null,
  first_message_preview: null,
  last_message_preview: null,
  last_message_at: new Date().toISOString(),
  last_visitor_message_at: null,
  last_agent_message_at: null,
  visitor_unread_count: 0,
  agent_unread_count: 0,
  assignee_id: null,
  assigned_at: null,
  escalated_at: null,
  resolved_at: null,
  resolved_by: null,
  pii_redacted_at: null,
  metadata: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function stubStore(posted: SupportMessage[]): SupportStore {
  const stub: Partial<SupportStore> = {
    mode: "supabase",
    listAnswerable: async () => [{ entry, category }],
    postMessage: async (input) => {
      const message: SupportMessage = {
        id: `msg-${posted.length + 1}`,
        conversation_id: conversation.id,
        sequence_no: posted.length + 1,
        sender_type: input.sender_type,
        sender_profile_id: input.sender_profile_id,
        sender_display_name: input.sender_display_name,
        kind: input.kind,
        body: input.body,
        saved_reply_id: input.saved_reply_id ?? null,
        source_knowledge_id: input.source_knowledge_id ?? null,
        visitor_read_at: null,
        agent_read_at: null,
        client_message_id: input.client_message_id ?? null,
        metadata: input.metadata ?? {},
        created_at: new Date().toISOString(),
      };
      posted.push(message);
      return { message, conversation, duplicate: false };
    },
    updateConversation: async () => conversation,
  };
  return stub as SupportStore;
}

const settings: SupportSettings = {
  ...DEFAULT_SUPPORT_SETTINGS,
  ai_enhancement_enabled: true,
  updated_by: null,
  updated_at: new Date().toISOString(),
};

const QUESTION = "invoices for zorblax widgets";

function fakeFetch(content: string): typeof fetch {
  return (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content } }] }),
      text: async () => "",
    }) as unknown as Response) as typeof fetch;
}

describe("bot pipeline — grounded AI layer", () => {
  const previousKey = process.env.OPENAI_API_KEY;
  beforeAll(() => {
    process.env.OPENAI_API_KEY = "sk-unit-test-key";
  });
  afterAll(() => {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  });

  it("posts the grounded answer (engine ai_grounded) when the completion is faithful", async () => {
    const posted: SupportMessage[] = [];
    const replies = await runBotPipeline(stubStore(posted), settings, conversation, QUESTION, {
      providerOverride: "openai",
      fetchFn: fakeFetch("SOURCES: kb-invoices\nInvoices are issued by Stripe after checkout."),
    });
    expect(replies.length).toBe(1);
    expect(replies[0].metadata.engine).toBe("ai_grounded");
    expect(replies[0].source_knowledge_id).toBe("kb-invoices");
    expect(replies[0].body).toContain("Stripe");
  });

  it("a hallucinating completion is rejected and the deterministic fallback answers instead", async () => {
    const posted: SupportMessage[] = [];
    const replies = await runBotPipeline(
      stubStore(posted),
      settings,
      { ...conversation, id: "conv-ai-test-2" },
      QUESTION,
      {
        providerOverride: "openai",
        fetchFn: fakeFetch("SOURCES: kb-invoices\nInvoices cost $999 each, issued by Stripe."),
      }
    );
    expect(replies.length).toBe(1);
    expect(replies[0].metadata.engine).toBe("fallback");
    expect(replies[0].body).toContain("couldn't find a reliable answer");
    expect(replies[0].body).not.toContain("$999");
  });

  it("with the enhancement switch OFF, the AI layer is never consulted", async () => {
    const posted: SupportMessage[] = [];
    let fetchCalled = false;
    const spyFetch = (async () => {
      fetchCalled = true;
      throw new Error("must not be called");
    }) as unknown as typeof fetch;
    const replies = await runBotPipeline(
      stubStore(posted),
      { ...settings, ai_enhancement_enabled: false },
      { ...conversation, id: "conv-ai-test-3" },
      QUESTION,
      { providerOverride: "openai", fetchFn: spyFetch }
    );
    expect(fetchCalled).toBe(false);
    expect(replies[0].metadata.engine).toBe("fallback");
  });

  it("in human mode the pipeline never replies", async () => {
    const posted: SupportMessage[] = [];
    const replies = await runBotPipeline(
      stubStore(posted),
      settings,
      { ...conversation, id: "conv-ai-test-4", handling_mode: "human" },
      QUESTION,
      { providerOverride: "openai", fetchFn: fakeFetch("SOURCES: kb-invoices\nx") }
    );
    expect(replies).toEqual([]);
    expect(posted).toEqual([]);
  });

  it("with KB answers disabled, the fallback copy is served (no matching at all)", async () => {
    const posted: SupportMessage[] = [];
    const replies = await runBotPipeline(
      stubStore(posted),
      { ...settings, ai_kb_enabled: false },
      { ...conversation, id: "conv-ai-test-5" },
      "How much does NxtSend cost?",
      {}
    );
    expect(replies.length).toBe(1);
    expect(replies[0].metadata.engine).toBe("fallback");
    expect(replies[0].metadata.reason).toBe("kb_disabled");
  });
});
