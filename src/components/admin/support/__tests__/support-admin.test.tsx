// @vitest-environment jsdom

/**
 * Admin Support UI — behaviour pins (P10 Stage F) against the Stage E
 * admin API mocked at fetch:
 *  - inbox: filter tabs + counts render, thread (incl. internal note)
 *    renders, a reply POSTs to the conversation messages route;
 *  - knowledge: client-side required-field validation blocks the
 *    POST, a duplicate 409 surfaces as a form error, the preview
 *    panel shows answer + band + matched entry;
 *  - settings: a 403 on the settings GET renders the "managed by the
 *    super admin" state (and the agents list still loads); with
 *    access, a toggle PUTs the change.
 */

import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupportInbox } from "../SupportInbox";
import { SupportKnowledge } from "../SupportKnowledge";
import { SupportSettings } from "../SupportSettings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const AGENTS = [
  {
    profile_id: "demo-profile-super",
    enabled: true,
    availability: "available",
    availability_updated_at: "2026-10-23T10:00:00.000Z",
    last_assigned_at: null,
    created_at: "2026-10-23T10:00:00.000Z",
    updated_at: "2026-10-23T10:00:00.000Z",
    email: "demo-super-admin@nxtsend.example",
    full_name: "Demo Super Admin",
    role: "super_admin",
    profile_status: "active",
    eligible: true,
  },
];

const CONVERSATION = {
  id: "conv-9",
  workspace_id: null,
  user_id: null,
  guest_name: "Demo Guest",
  guest_email: "guest@example.com",
  guest_access_token_hash: "hash",
  guest_token_expires_at: null,
  status: "open",
  handling_mode: "human",
  source: "marketing_widget",
  subject: null,
  first_message_preview: "I need help with billing",
  last_message_preview: "I need help with billing",
  last_message_at: "2026-10-23T10:05:00.000Z",
  last_visitor_message_at: "2026-10-23T10:05:00.000Z",
  last_agent_message_at: null,
  visitor_unread_count: 0,
  agent_unread_count: 1,
  assignee_id: null,
  assigned_at: null,
  escalated_at: "2026-10-23T10:04:00.000Z",
  resolved_at: null,
  resolved_by: null,
  pii_redacted_at: null,
  metadata: {},
  created_at: "2026-10-23T10:00:00.000Z",
  updated_at: "2026-10-23T10:05:00.000Z",
};

const THREAD_MESSAGES = [
  {
    id: "tm-1",
    conversation_id: "conv-9",
    sequence_no: 1,
    sender_type: "visitor",
    sender_profile_id: null,
    sender_display_name: "Demo Guest",
    kind: "message",
    body: "I need help with billing",
    saved_reply_id: null,
    source_knowledge_id: null,
    visitor_read_at: null,
    agent_read_at: null,
    client_message_id: null,
    metadata: {},
    created_at: "2026-10-23T10:05:00.000Z",
  },
  {
    id: "tm-2",
    conversation_id: "conv-9",
    sequence_no: 2,
    sender_type: "admin",
    sender_profile_id: "demo-profile-super",
    sender_display_name: "Demo Super Admin",
    kind: "internal_note",
    body: "Check the Stripe dashboard before replying.",
    saved_reply_id: null,
    source_knowledge_id: null,
    visitor_read_at: null,
    agent_read_at: null,
    client_message_id: null,
    metadata: {},
    created_at: "2026-10-23T10:06:00.000Z",
  },
];

const CATEGORY = {
  id: "cat-billing",
  name: "Billing",
  slug: "billing",
  description: "",
  enabled: true,
  sort_order: 6,
  created_by: null,
  updated_by: null,
  created_at: "2026-10-23T10:00:00.000Z",
  updated_at: "2026-10-23T10:00:00.000Z",
};

const ENTRY = {
  id: "kb-pricing",
  category_id: "cat-billing",
  slug: "how-much-does-nxtsend-cost",
  title: "How much does NxtSend cost?",
  question: "How much does NxtSend cost?",
  answer: "Seat plans are $49 per month.",
  keywords: ["price"],
  related_url: "/pricing",
  priority: 50,
  enabled: true,
  status: "published",
  search_text: "",
  content_hash: "x",
  indexed_at: "2026-10-23T10:00:00.000Z",
  created_by: null,
  updated_by: null,
  created_at: "2026-10-23T10:00:00.000Z",
  updated_at: "2026-10-23T10:00:00.000Z",
};

const SETTINGS = {
  id: "global",
  ai_kb_enabled: true,
  ai_enhancement_enabled: false,
  live_support_enabled: true,
  allow_user_escalation: true,
  display_name: "NxtSend Support",
  greeting: "Hi",
  welcome_message: "Welcome",
  offline_message: "Offline",
  closing_message: "Bye",
  support_email: "hello@nxtsend.com",
  updated_by: null,
  updated_at: "2026-10-23T10:00:00.000Z",
};

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown>;
}

function installFetch(overrides: {
  settingsStatus?: number;
  knowledgeCreateStatus?: number;
} = {}) {
  const calls: Call[] = [];
  const respond = (status: number, json: unknown) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => json }) as Response;

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ url, method, body });

    if (url.startsWith("/api/admin/support/agents")) {
      if (method === "PUT") return respond(200, { mode: "demo", agents: AGENTS });
      return respond(200, { mode: "demo", agents: AGENTS });
    }
    if (url.startsWith("/api/admin/support/saved-replies")) {
      return respond(200, { mode: "demo", replies: [] });
    }
    if (url.startsWith("/api/admin/support/conversations") && method === "GET" && !url.includes("conv-9")) {
      return respond(200, {
        mode: "demo",
        conversations: [CONVERSATION],
        counts: { all: 1, open: 1, waiting_for_reply: 1, assigned: 0, unassigned: 1, resolved: 0 },
      });
    }
    if (url === "/api/admin/support/conversations/conv-9" && method === "GET") {
      return respond(200, {
        mode: "demo",
        conversation: CONVERSATION,
        messages: THREAD_MESSAGES,
        events: [],
      });
    }
    if (url === "/api/admin/support/conversations/conv-9/read") return respond(200, { mode: "demo", conversation: CONVERSATION });
    if (url === "/api/admin/support/conversations/conv-9/messages" && method === "POST") {
      return respond(201, { mode: "demo", message: THREAD_MESSAGES[0], conversation: CONVERSATION });
    }
    if (url === "/api/admin/support/conversations/conv-9" && method === "PATCH") {
      return respond(200, { mode: "demo", conversation: { ...CONVERSATION, ...body } });
    }
    if (url === "/api/admin/support/knowledge" && method === "GET") {
      return respond(200, { mode: "demo", entries: [ENTRY], categories: [CATEGORY] });
    }
    if (url === "/api/admin/support/knowledge" && method === "POST") {
      if (overrides.knowledgeCreateStatus === 409) {
        return respond(409, {
          error: "An entry with the same question already exists",
          code: "duplicate_question",
          duplicate_of: { id: ENTRY.id, title: ENTRY.title },
        });
      }
      return respond(201, { mode: "demo", entry: ENTRY, warnings: [] });
    }
    if (url === "/api/admin/support/knowledge/preview" && method === "POST") {
      return respond(200, {
        mode: "demo",
        preview: {
          band: "direct",
          score: 100,
          margin: 60,
          engine: "kb_match",
          answer: "Seat plans are $49 per month.",
          source_knowledge_ids: [ENTRY.id],
          candidates: [{ id: ENTRY.id, slug: ENTRY.slug, title: ENTRY.title, score: 100 }],
        },
      });
    }
    if (url === "/api/admin/support/settings") {
      if (overrides.settingsStatus === 403) {
        return respond(403, { error: "Settings are super admin only." });
      }
      if (method === "PUT") return respond(200, { mode: "demo", settings: { ...SETTINGS, ...body } });
      return respond(200, {
        mode: "demo",
        settings: SETTINGS,
        ai_enhancement_provider: null,
        ai_enhancement_configured: false,
      });
    }
    return respond(404, { error: "not found" });
  });

  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SupportInbox", () => {
  it("renders the filter tabs with queue counts and the conversation rows", async () => {
    installFetch();
    render(<SupportInbox />);
    expect(await screen.findByRole("tab", { name: /Waiting/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Unassigned/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Resolved/ })).toBeTruthy();
    expect(await screen.findByText("Demo Guest")).toBeTruthy();
    expect(screen.getByText("I need help with billing")).toBeTruthy();
  });

  it("opens a thread with the internal note labelled, and sends a reply through the API", async () => {
    const { calls } = installFetch();
    render(<SupportInbox />);
    fireEvent.click(await screen.findByText("Demo Guest"));

    expect(await screen.findByText(/Internal note/)).toBeTruthy();
    expect(screen.getByText("Check the Stripe dashboard before replying.")).toBeTruthy();

    const composer = screen.getByLabelText("Reply to the visitor");
    fireEvent.change(composer, { target: { value: "Happy to help — your invoice is in the billing page." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      const post = calls.find(
        (c) => c.url === "/api/admin/support/conversations/conv-9/messages" && c.method === "POST"
      );
      expect(post?.body.body).toBe("Happy to help — your invoice is in the billing page.");
      expect(post?.body.kind).toBe("message");
    });
  });
});

describe("SupportKnowledge", () => {
  it("blocks an empty entry client-side and surfaces a duplicate 409 as a form error", async () => {
    const { calls } = installFetch({ knowledgeCreateStatus: 409 });
    render(<SupportKnowledge />);
    expect((await screen.findAllByText("How much does NxtSend cost?")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /New entry/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create entry" }));
    expect(await screen.findByText("Title is required.")).toBeTruthy();
    expect(calls.some((c) => c.url === "/api/admin/support/knowledge" && c.method === "POST")).toBe(false);

    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "cat-billing" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Pricing duplicate" } });
    fireEvent.change(screen.getByLabelText(/Question \/ topic/), { target: { value: "How much does NxtSend cost?" } });
    fireEvent.change(screen.getByLabelText(/Answer/), { target: { value: "Some answer" } });
    fireEvent.click(screen.getByRole("button", { name: "Create entry" }));
    expect(await screen.findByText(/duplicates the existing entry/)).toBeTruthy();
  });

  it("previews the would-be answer with band, score and matched entry", async () => {
    installFetch();
    render(<SupportKnowledge />);
    await screen.findAllByText("How much does NxtSend cost?");
    fireEvent.change(screen.getByLabelText("Preview question"), {
      target: { value: "How much does NxtSend cost?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Preview answer/ }));
    expect(await screen.findByText("Band: direct")).toBeTruthy();
    expect(screen.getByText("Score 100")).toBeTruthy();
    expect(screen.getByText(/Matched: How much does NxtSend cost/)).toBeTruthy();
  });
});

describe("SupportSettings", () => {
  it("renders the super-admin-managed state on a settings 403 while agents still load", async () => {
    installFetch({ settingsStatus: 403 });
    render(<SupportSettings />);
    expect(await screen.findByText("Settings are managed by the super admin.")).toBeTruthy();
    expect(await screen.findByText("Demo Super Admin")).toBeTruthy();
  });

  it("persists a behaviour toggle through the settings API and reports the honest AI state", async () => {
    const { calls } = installFetch();
    render(<SupportSettings />);
    expect(await screen.findByText("Not configured")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Live human support" }));
    await waitFor(() => {
      const put = calls.find(
        (c) => c.url === "/api/admin/support/settings" && c.method === "PUT"
      );
      expect(put?.body.live_support_enabled).toBe(false);
    });
    expect(await screen.findByText(/Saved — the widget picks this up/)).toBeTruthy();
  });
});
