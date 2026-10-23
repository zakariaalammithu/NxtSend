import { describe, it, expect } from "vitest";
import {
  generateGuestToken,
  hashGuestToken,
  isGuestTokenExpired,
} from "../guest-auth";
import { authoriseConversationAccess, type VisitorIdentity } from "../request-auth";
import type { SupportConversation } from "../types";

function conversation(partial: Partial<SupportConversation>): SupportConversation {
  return {
    id: "conv-1",
    workspace_id: null,
    user_id: null,
    guest_name: "Guest",
    guest_email: null,
    guest_access_token_hash: null,
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
    ...partial,
  };
}

const noIdentity: VisitorIdentity = { user: null, guestTokenHash: null };

describe("guest tokens", () => {
  it("are high-entropy and stored only as SHA-256 hashes", () => {
    const a = generateGuestToken();
    const b = generateGuestToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    const hash = hashGuestToken(a);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(a);
    expect(hashGuestToken(a)).toBe(hash);
  });

  it("expiry is honoured", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isGuestTokenExpired(past)).toBe(true);
    expect(isGuestTokenExpired(future)).toBe(false);
    expect(isGuestTokenExpired(null)).toBe(false);
  });
});

describe("conversation access authorisation", () => {
  const raw = generateGuestToken();
  const guestConv = conversation({ guest_access_token_hash: hashGuestToken(raw) });

  it("valid guest token authorises", () => {
    expect(
      authoriseConversationAccess(guestConv, { user: null, guestTokenHash: hashGuestToken(raw) })
    ).toBe(true);
  });

  it("wrong token does not authorise", () => {
    expect(
      authoriseConversationAccess(guestConv, {
        user: null,
        guestTokenHash: hashGuestToken(generateGuestToken()),
      })
    ).toBe(false);
  });

  it("a conversation ID alone NEVER authorises (no proof presented)", () => {
    expect(authoriseConversationAccess(guestConv, noIdentity)).toBe(false);
  });

  it("an expired guest token does not authorise", () => {
    const expired = conversation({
      guest_access_token_hash: hashGuestToken(raw),
      guest_token_expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    expect(
      authoriseConversationAccess(expired, { user: null, guestTokenHash: hashGuestToken(raw) })
    ).toBe(false);
  });

  it("session owner authorises; another user does not", () => {
    const userConv = conversation({ user_id: "user-1" });
    const owner: VisitorIdentity = {
      user: { userId: "user-1", displayName: "Owner", status: "active" },
      guestTokenHash: null,
    };
    const stranger: VisitorIdentity = {
      user: { userId: "user-2", displayName: "Stranger", status: "active" },
      guestTokenHash: null,
    };
    expect(authoriseConversationAccess(userConv, owner)).toBe(true);
    expect(authoriseConversationAccess(userConv, stranger)).toBe(false);
  });

  it("NO silent guest->user merge by email: a session does not unlock a guest thread", () => {
    const identity: VisitorIdentity = {
      user: { userId: "user-9", displayName: "Same Email Person", status: "active" },
      guestTokenHash: null,
    };
    // guestConv has guest_email semantics only — user_id is null, so a
    // signed-in user with any email gets nothing without the token.
    expect(authoriseConversationAccess(guestConv, identity)).toBe(false);
  });
});
