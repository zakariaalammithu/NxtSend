// @vitest-environment jsdom

/**
 * Support widget — interactive behaviour (P10 Stage F), with the
 * Stage E public API mocked at fetch: open/close, lazy conversation
 * creation on first message, optimistic send + idempotent retry,
 * bot-answer rendering, escalation visibility + offline honesty, and
 * the unread badge. Plain-text rendering is asserted by checking the
 * answer lands as text content.
 */

import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupportWidget } from "../SupportWidget";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONFIG = {
  mode: "demo",
  display_name: "NxtSend Support",
  greeting: "Hi there — ask anything about NxtSend.",
  welcome_message: "Welcome to NxtSend Support.",
  offline_message: "Our support team isn't available right now, but your message is saved.",
  closing_message: "Thanks for chatting.",
  support_email: "hello@nxtsend.com",
  ai_kb_enabled: true,
  live_support_enabled: true,
  allow_user_escalation: true,
  live_available: false,
  ai_enhancement: "not_configured",
};

const CONVERSATION = {
  id: "conv-1",
  status: "open",
  handling_mode: "bot",
  visitor_unread_count: 0,
  created_at: "2026-10-23T10:00:00.000Z",
  last_message_at: "2026-10-23T10:00:00.000Z",
};

function message(id: string, sequence_no: number, sender_type: string, body: string) {
  return {
    id,
    sequence_no,
    sender_type,
    sender_display_name: sender_type === "ai" ? "NxtSend Support" : null,
    kind: "message",
    body,
    created_at: "2026-10-23T10:00:00.000Z",
  };
}

interface MockOptions {
  config?: Record<string, unknown>;
  currentStatus?: number;
  currentBody?: Record<string, unknown>;
  createStatus?: number;
  messageStatuses?: number[];
}

function installFetch(options: MockOptions = {}) {
  const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
  let messageAttempts = 0;
  const config = { ...CONFIG, ...(options.config ?? {}) };

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ url, method, body });
    const respond = (status: number, json: unknown) =>
      ({ ok: status >= 200 && status < 300, status, json: async () => json }) as Response;

    if (url === "/api/support/config") return respond(200, config);
    if (url.startsWith("/api/support/conversations/current")) {
      if (options.currentBody) return respond(options.currentStatus ?? 200, options.currentBody);
      return respond(404, { error: "No current conversation" });
    }
    if (url === "/api/support/conversations" && method === "POST") {
      if (options.createStatus && options.createStatus >= 400) {
        return respond(options.createStatus, { error: "Create failed" });
      }
      return respond(201, {
        mode: "demo",
        conversation: CONVERSATION,
        messages: [
          message("m-welcome", 1, "ai", "Welcome to NxtSend Support."),
          message("m-user", 2, "visitor", String(body.first_message ?? "")),
          message("m-bot", 3, "ai", "Seat plans are $49 per month."),
        ],
      });
    }
    if (url === "/api/support/conversations/conv-1/messages" && method === "POST") {
      messageAttempts += 1;
      const statuses = options.messageStatuses ?? [201];
      const status = statuses[Math.min(messageAttempts - 1, statuses.length - 1)];
      if (status >= 400) return respond(status, { error: "Send failed" });
      return respond(201, {
        mode: "demo",
        conversation: CONVERSATION,
        messages: [
          message(`m-u${messageAttempts}`, 10 + messageAttempts, "visitor", String(body.body ?? "")),
          message(`m-b${messageAttempts}`, 20 + messageAttempts, "ai", "Here is the answer."),
        ],
      });
    }
    if (url === "/api/support/conversations/conv-1/escalate") {
      return respond(200, {
        mode: "demo",
        agent_available: false,
        conversation: { ...CONVERSATION, handling_mode: "human" },
      });
    }
    if (url === "/api/support/conversations/conv-1/read") {
      return respond(200, { mode: "demo", conversation: { ...CONVERSATION, visitor_unread_count: 0 } });
    }
    if (url === "/api/support/conversations/conv-1/reopen") {
      return respond(200, { mode: "demo", conversation: CONVERSATION });
    }
    return respond(404, { error: "not found" });
  });

  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

async function openWidget() {
  const button = await screen.findByRole("button", { name: /Open NxtSend Support chat/ });
  fireEvent.click(button);
  return screen.findByRole("dialog", { name: /NxtSend Support chat/ });
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SupportWidget", () => {
  it("opens and closes, showing the greeting and the optional guest identity row", async () => {
    installFetch();
    render(<SupportWidget />);
    await openWidget();
    expect(screen.getByText("Hi there — ask anything about NxtSend.")).toBeTruthy();
    expect(screen.getByLabelText("Your name (optional)")).toBeTruthy();
    expect(screen.getByLabelText("Email for replies (optional)")).toBeTruthy();
    expect(screen.getByText("Demo")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close chat" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("creates the conversation lazily on the first message and renders the bot answer as text", async () => {
    const { calls } = installFetch();
    render(<SupportWidget />);
    await openWidget();
    const composer = screen.getByLabelText("Type your message");
    fireEvent.change(composer, { target: { value: "How much does NxtSend cost?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Seat plans are $49 per month.")).toBeTruthy();
    expect(screen.getByText("Welcome to NxtSend Support.")).toBeTruthy();
    const create = calls.find((c) => c.url === "/api/support/conversations" && c.method === "POST");
    expect(create?.body.first_message).toBe("How much does NxtSend cost?");
    // The bot fallback prompt offers a person right under the answer.
    expect(screen.getByText(/Not the answer you needed/)).toBeTruthy();
  });

  it("shows the optimistic bubble, marks a failed send, and retries with the same client_message_id", async () => {
    const { calls } = installFetch({
      currentBody: { mode: "demo", conversation: CONVERSATION, messages: [] },
      messageStatuses: [500, 201],
    });
    render(<SupportWidget />);
    await openWidget();
    const composer = screen.getByLabelText("Type your message");
    fireEvent.change(composer, { target: { value: "Do you support Sales Navigator?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Not sent")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Here is the answer.")).toBeTruthy();

    const posts = calls.filter(
      (c) => c.url === "/api/support/conversations/conv-1/messages" && c.method === "POST"
    );
    expect(posts).toHaveLength(2);
    expect(posts[0].body.client_message_id).toBeTruthy();
    expect(posts[1].body.client_message_id).toBe(posts[0].body.client_message_id);
  });

  it("sends on Enter and keeps Shift+Enter as a newline", async () => {
    installFetch({
      currentBody: { mode: "demo", conversation: CONVERSATION, messages: [] },
    });
    render(<SupportWidget />);
    await openWidget();
    const composer = screen.getByLabelText("Type your message") as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: "First line" } });
    fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
    expect(screen.queryByText("Here is the answer.")).toBeNull();
    fireEvent.keyDown(composer, { key: "Enter", shiftKey: false });
    expect(await screen.findByText("Here is the answer.")).toBeTruthy();
  });

  it("shows the unread badge from the current conversation", async () => {
    installFetch({
      currentBody: {
        mode: "demo",
        conversation: { ...CONVERSATION, visitor_unread_count: 2 },
        messages: [message("m-agent", 5, "agent", "Following up here.")],
      },
    });
    render(<SupportWidget />);
    const button = await screen.findByRole("button", { name: /2 unread/ });
    expect(button.textContent).toContain("2");
  });

  it("escalates to a person and shows the honest offline message when no agent is available", async () => {
    const { calls } = installFetch({
      currentBody: { mode: "demo", conversation: CONVERSATION, messages: [] },
    });
    render(<SupportWidget />);
    await openWidget();
    const escalateButton = await screen.findByRole("button", { name: /Talk to a person instead/ });
    fireEvent.click(escalateButton);
    expect(
      await screen.findByText(/Our support team isn't available right now, but your message is saved/)
    ).toBeTruthy();
    expect(
      calls.some((c) => c.url === "/api/support/conversations/conv-1/escalate" && c.method === "POST")
    ).toBe(true);
  });

  it("hides escalation entirely when the settings disallow it", async () => {
    installFetch({
      config: { allow_user_escalation: false },
      currentBody: { mode: "demo", conversation: CONVERSATION, messages: [] },
    });
    render(<SupportWidget />);
    await openWidget();
    await screen.findByLabelText("Type your message");
    expect(screen.queryByRole("button", { name: /Talk to a person/ })).toBeNull();
  });
});
