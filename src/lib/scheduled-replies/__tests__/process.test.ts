import { describe, it, expect, vi } from "vitest";
import { processDueScheduledReplies } from "@/lib/scheduled-replies/process";
import type { ScheduledReply } from "@/lib/data/scheduled-replies";

function row(
  overrides: Partial<ScheduledReply> = {}
): ScheduledReply {
  return {
    id: "sched_1",
    workspace_id: "ws_1",
    conversation_id: "conv_1",
    body: "Hello",
    scheduled_at: "2026-11-14T11:00:00.000Z",
    status: "scheduled",
    created_at: "2026-11-14T10:00:00.000Z",
    ...overrides,
  };
}

describe("processDueScheduledReplies", () => {
  it("sends due rows through the sender with a stable idempotency key", async () => {
    const due = [row(), row({ id: "sched_2", body: "Second" })];
    const sender = {
      send: vi.fn(async () => ({ ok: true, simulated: false })),
    };
    const mark = vi.fn(async () => undefined);
    const summary = await processDueScheduledReplies({
      listDue: async () => due,
      mark,
      sender,
      now: new Date("2026-11-14T12:00:00.000Z"),
    });
    expect(summary).toEqual({ checked: 2, sent: 2, simulated: 0, failed: 0 });
    expect(sender.send).toHaveBeenCalledWith({
      workspaceId: "ws_1",
      conversationId: "conv_1",
      body: "Hello",
      idempotencyKey: "scheduled_sched_1",
    });
    expect(sender.send).toHaveBeenCalledWith({
      workspaceId: "ws_1",
      conversationId: "conv_1",
      body: "Second",
      idempotencyKey: "scheduled_sched_2",
    });
    expect(mark).toHaveBeenCalledWith("sched_1", "sent");
    expect(mark).toHaveBeenCalledWith("sched_2", "sent");
  });

  it("marks simulated rows simulated, never sent", async () => {
    const sender = {
      send: vi.fn(async () => ({ ok: true, simulated: true })),
    };
    const mark = vi.fn(async () => undefined);
    const summary = await processDueScheduledReplies({
      listDue: async () => [row()],
      mark,
      sender,
    });
    expect(summary).toEqual({ checked: 1, sent: 0, simulated: 1, failed: 0 });
    expect(mark).toHaveBeenCalledWith("sched_1", "simulated");
  });

  it("marks refused sends failed and keeps processing the rest", async () => {
    const due = [row(), row({ id: "sched_2" }), row({ id: "sched_3" })];
    const sender = {
      send: vi.fn(async (args: { idempotencyKey: string }) => {
        if (args.idempotencyKey === "scheduled_sched_1") {
          return { ok: false, simulated: false, error: "refused" };
        }
        if (args.idempotencyKey === "scheduled_sched_2") {
          throw new Error("adapter exploded");
        }
        return { ok: true, simulated: false };
      }),
    };
    const mark = vi.fn(async () => undefined);
    const summary = await processDueScheduledReplies({
      listDue: async () => due,
      mark,
      sender,
    });
    expect(summary).toEqual({ checked: 3, sent: 1, simulated: 0, failed: 2 });
    expect(mark).toHaveBeenCalledWith("sched_1", "failed");
    expect(mark).toHaveBeenCalledWith("sched_2", "failed");
    expect(mark).toHaveBeenCalledWith("sched_3", "sent");
  });

  it("does nothing when nothing is due", async () => {
    const sender = { send: vi.fn(async () => ({ ok: true, simulated: false })) };
    const mark = vi.fn(async () => undefined);
    const summary = await processDueScheduledReplies({
      listDue: async () => [],
      mark,
      sender,
    });
    expect(summary).toEqual({ checked: 0, sent: 0, simulated: 0, failed: 0 });
    expect(sender.send).not.toHaveBeenCalled();
  });
});
