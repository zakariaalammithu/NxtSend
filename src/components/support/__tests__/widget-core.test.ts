/**
 * Support widget — pure logic pins (P10 Stage F): polling merge,
 * cursor, escalation visibility rules and bubble labelling. The
 * interactive behaviour is covered in support-widget.test.tsx.
 */

import { describe, expect, it } from "vitest";
import type { VisitorSupportMessage } from "@/lib/support/types";
import {
  canOfferEscalation,
  lastSequence,
  mergeMessages,
  messageSide,
  senderLabel,
  type SupportWidgetConfig,
  type WidgetConversation,
} from "../widget-core";

const config: SupportWidgetConfig = {
  mode: "demo",
  display_name: "NxtSend Support",
  greeting: "Hi there",
  welcome_message: "Welcome",
  offline_message: "Team is offline",
  closing_message: "Bye",
  support_email: "hello@nxtsend.com",
  ai_kb_enabled: true,
  live_support_enabled: true,
  allow_user_escalation: true,
  live_available: false,
  ai_enhancement: "not_configured",
};

const conversation: WidgetConversation = {
  id: "c1",
  status: "open",
  handling_mode: "bot",
  visitor_unread_count: 0,
  created_at: "2026-10-23T00:00:00.000Z",
  last_message_at: "2026-10-23T00:00:00.000Z",
};

function msg(partial: Partial<VisitorSupportMessage>): VisitorSupportMessage {
  return {
    id: "m1",
    sequence_no: 1,
    sender_type: "ai",
    sender_display_name: "NxtSend Support",
    kind: "message",
    body: "hello",
    created_at: "2026-10-23T00:00:00.000Z",
    ...partial,
  };
}

describe("mergeMessages", () => {
  it("dedupes by id and orders by sequence", () => {
    const merged = mergeMessages(
      [msg({ id: "a", sequence_no: 2 })],
      [msg({ id: "b", sequence_no: 1 }), msg({ id: "a", sequence_no: 2, body: "updated" })]
    );
    expect(merged.map((m) => m.id)).toEqual(["b", "a"]);
    expect(merged[1].body).toBe("updated");
  });

  it("computes the polling cursor from confirmed messages only", () => {
    const merged = mergeMessages(
      [msg({ id: "a", sequence_no: 7 })],
      [msg({ id: "b", sequence_no: 3 })]
    );
    expect(lastSequence(merged)).toBe(7);
    expect(lastSequence([])).toBe(0);
  });
});

describe("canOfferEscalation", () => {
  it("offers escalation only when settings allow and the bot still handles", () => {
    expect(canOfferEscalation(config, conversation)).toBe(true);
    expect(canOfferEscalation({ ...config, allow_user_escalation: false }, conversation)).toBe(false);
    expect(canOfferEscalation({ ...config, live_support_enabled: false }, conversation)).toBe(false);
    expect(canOfferEscalation(config, { ...conversation, handling_mode: "human" })).toBe(false);
    expect(canOfferEscalation(config, { ...conversation, status: "resolved" })).toBe(false);
    expect(canOfferEscalation(config, null)).toBe(false);
    expect(canOfferEscalation(null, conversation)).toBe(false);
  });
});

describe("message sides and labels", () => {
  it("aligns own messages, labels the assistant and the human team distinctly", () => {
    expect(messageSide(msg({ sender_type: "visitor" }))).toBe("own");
    expect(messageSide(msg({ sender_type: "user" }))).toBe("own");
    expect(messageSide(msg({ sender_type: "ai" }))).toBe("other");
    expect(messageSide(msg({ sender_type: "agent" }))).toBe("other");
    expect(messageSide(msg({ kind: "system" }))).toBe("system");
    expect(senderLabel(msg({ sender_type: "visitor" }), config)).toBe("You");
    expect(senderLabel(msg({ sender_type: "ai" }), config)).toBe("NxtSend Support");
    expect(
      senderLabel(msg({ sender_type: "agent", sender_display_name: "Demo Super Admin" }), config)
    ).toBe("Demo Super Admin");
    expect(senderLabel(msg({ sender_type: "admin", sender_display_name: null }), config)).toBe(
      "NxtSend Support"
    );
  });
});
