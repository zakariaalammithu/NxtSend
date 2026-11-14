import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryStorage, setDemoStorage } from "@/lib/data/demo-store";
import {
  createScheduledRepliesRepository,
  type ScheduledReply,
} from "@/lib/data/scheduled-replies";
import { DEMO_WORKSPACE_ID } from "@/lib/data/workspace";

beforeEach(() => {
  setDemoStorage(createMemoryStorage());
});

const NOW = "2026-11-14T12:00:00.000Z";
const PAST = "2026-11-14T11:00:00.000Z";
const FUTURE = "2026-11-14T13:00:00.000Z";
const LATER = "2026-11-14T14:00:00.000Z";

describe("DemoScheduledRepliesRepository", () => {
  it("scheduling stores a row and sends nothing (status stays scheduled)", async () => {
    const repo = createScheduledRepliesRepository("demo");
    const row = await repo.schedule(DEMO_WORKSPACE_ID, {
      conversation_id: "conv_demo_001",
      body: "Hello — following up as promised.",
      scheduled_at: FUTURE,
    });
    expect(row.status).toBe("scheduled");
    expect(row.body).toBe("Hello — following up as promised.");
    expect(row.scheduled_at).toBe(FUTURE);
    expect(await repo.listUpcoming(DEMO_WORKSPACE_ID)).toEqual([row]);
  });

  it("lists upcoming earliest-due first, scoped to the workspace", async () => {
    const repo = createScheduledRepliesRepository("demo");
    const later = await repo.schedule(DEMO_WORKSPACE_ID, {
      conversation_id: "conv_demo_001",
      body: "later",
      scheduled_at: LATER,
    });
    const sooner = await repo.schedule(DEMO_WORKSPACE_ID, {
      conversation_id: "conv_demo_001",
      body: "sooner",
      scheduled_at: FUTURE,
    });
    await repo.schedule("ws_someone_else", {
      conversation_id: "conv_demo_001",
      body: "not mine",
      scheduled_at: FUTURE,
    });
    const upcoming = await repo.listUpcoming(DEMO_WORKSPACE_ID);
    expect(upcoming.map((r) => r.id)).toEqual([sooner.id, later.id]);
  });

  it("lists due rows (scheduled_at <= now) and excludes future/cancelled ones", async () => {
    const repo = createScheduledRepliesRepository("demo");
    const due = await repo.schedule(DEMO_WORKSPACE_ID, {
      conversation_id: "conv_demo_001",
      body: "due",
      scheduled_at: PAST,
    });
    await repo.schedule(DEMO_WORKSPACE_ID, {
      conversation_id: "conv_demo_001",
      body: "future",
      scheduled_at: FUTURE,
    });
    const cancelled = await repo.schedule(DEMO_WORKSPACE_ID, {
      conversation_id: "conv_demo_001",
      body: "cancelled",
      scheduled_at: PAST,
    });
    await repo.cancel(cancelled.id);
    const listed: ScheduledReply[] = await repo.listDue(NOW);
    expect(listed.map((r) => r.id)).toEqual([due.id]);
  });

  it("cancel moves a row to cancelled and it leaves the upcoming list", async () => {
    const repo = createScheduledRepliesRepository("demo");
    const row = await repo.schedule(DEMO_WORKSPACE_ID, {
      conversation_id: "conv_demo_001",
      body: "never mind",
      scheduled_at: FUTURE,
    });
    const cancelled = await repo.cancel(row.id);
    expect(cancelled.status).toBe("cancelled");
    expect(await repo.listUpcoming(DEMO_WORKSPACE_ID)).toEqual([]);
    expect(await repo.listDue(LATER)).toEqual([]);
  });

  it("marks sent / simulated / failed", async () => {
    const repo = createScheduledRepliesRepository("demo");
    const mk = (body: string) =>
      repo.schedule(DEMO_WORKSPACE_ID, {
        conversation_id: "conv_demo_001",
        body,
        scheduled_at: FUTURE,
      });
    const sent = await mk("a");
    const simulated = await mk("b");
    const failed = await mk("c");
    expect((await repo.markSent(sent.id)).status).toBe("sent");
    expect((await repo.markSimulated(simulated.id)).status).toBe("simulated");
    expect((await repo.markFailed(failed.id)).status).toBe("failed");
    expect(await repo.listUpcoming(DEMO_WORKSPACE_ID)).toEqual([]);
  });

  it("rejects an empty body, a missing conversation, or an invalid time", async () => {
    const repo = createScheduledRepliesRepository("demo");
    await expect(
      repo.schedule(DEMO_WORKSPACE_ID, {
        conversation_id: "conv_demo_001",
        body: "   ",
        scheduled_at: FUTURE,
      })
    ).rejects.toThrow(/message body/);
    await expect(
      repo.schedule(DEMO_WORKSPACE_ID, {
        conversation_id: "",
        body: "hi",
        scheduled_at: FUTURE,
      })
    ).rejects.toThrow(/conversation/);
    await expect(
      repo.schedule(DEMO_WORKSPACE_ID, {
        conversation_id: "conv_demo_001",
        body: "hi",
        scheduled_at: "not a date",
      })
    ).rejects.toThrow(/valid date/);
    expect(await repo.listUpcoming(DEMO_WORKSPACE_ID)).toEqual([]);
  });

  it("throws when marking an unknown row", async () => {
    const repo = createScheduledRepliesRepository("demo");
    await expect(repo.markSent("sched_demo_missing")).rejects.toThrow(/not found/);
  });
});
