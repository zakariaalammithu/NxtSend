import { describe, it, expect, beforeEach } from "vitest";
import { GET } from "../route";
import { POST } from "../read/route";
import { setDemoStorage, createMemoryStorage } from "@/lib/data/demo-store";
import { DEMO_WORKSPACE_ID } from "@/lib/data/workspace";
import { buildReplyNotification } from "@/lib/notifications/core";
import { createDemoNotificationStore } from "@/lib/notifications/store";

/**
 * /api/notifications + /api/notifications/read (P5 Stage D). The test
 * environment has no Supabase env, so resolveCenterContext takes the
 * demo branch — these tests prove the demo guard path end-to-end
 * (demo workspace + demo store). The live branch is the same
 * resolveCenterContext guard every workspace API uses, with the
 * session client + RLS scoping rows (the store's own workspace
 * filter is unit-tested in lib/notifications).
 */

function req(body?: unknown): Request {
  return new Request("http://localhost/api/notifications/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function seedNotification(): Promise<string> {
  const store = createDemoNotificationStore();
  const created = await store.insert(
    buildReplyNotification({
      workspaceId: DEMO_WORKSPACE_ID,
      conversationId: "conv_demo_002",
      senderName: "Elena Rostova",
      senderEmail: "elena@scalewave.io",
      subject: "Re: Scaling",
      preview: "Thursday works.",
    })
  );
  return created.id;
}

beforeEach(() => {
  setDemoStorage(createMemoryStorage());
});

describe("/api/notifications (demo guard path)", () => {
  it("GET starts empty — no fabricated sample notifications", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("demo");
    expect(body.notifications).toEqual([]);
    expect(body.unreadCount).toBe(0);
  });

  it("GET returns stored notifications with the unread count", async () => {
    await seedNotification();
    const res = await GET();
    const body = await res.json();
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].title).toBe("New reply from Elena Rostova");
    expect(body.notifications[0].link).toContain("conv_demo_002");
    expect(body.unreadCount).toBe(1);
  });

  it("POST read marks one notification, then all", async () => {
    const id = await seedNotification();
    await seedNotification();

    const one = await POST(req({ id }));
    expect(one.status).toBe(200);
    expect((await one.json()).marked).toBe(true);

    let body = await (await GET()).json();
    expect(body.unreadCount).toBe(1);

    const all = await POST(req({ all: true }));
    expect((await all.json()).marked).toBe(1);
    body = await (await GET()).json();
    expect(body.unreadCount).toBe(0);
  });

  it("POST read rejects an empty body shape", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("POST read for an unknown id reports marked:false, not an error", async () => {
    const res = await POST(req({ id: "notif_does_not_exist" }));
    expect(res.status).toBe(200);
    expect((await res.json()).marked).toBe(false);
  });
});
