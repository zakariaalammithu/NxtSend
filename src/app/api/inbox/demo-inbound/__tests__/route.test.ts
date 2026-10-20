import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "../route";
import { setDemoStorage, createMemoryStorage } from "@/lib/data/demo-store";
import { DEMO_WORKSPACE_ID } from "@/lib/data/workspace";
import { createDemoNotificationStore } from "@/lib/notifications/store";
import { listDemoEmailEvents } from "@/lib/email/demo-events";

/**
 * /api/inbox/demo-inbound (P5 Stage D demo seam). Runs the REAL
 * ingestion matcher against the demo repositories: a reply from a
 * seeded contact files into their conversation AND creates a reply
 * notification; a stranger's mail is unrouted — no notification, but
 * the simulated webhook event is recorded with routing "unrouted"
 * so the admin deliverability log can show it.
 */

function req(body: unknown): Request {
  return new Request("http://localhost/api/inbox/demo-inbound", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  setDemoStorage(createMemoryStorage());
});

describe("/api/inbox/demo-inbound (demo seam)", () => {
  it("files a matched reply and creates exactly one notification", async () => {
    const res = await POST(
      req({
        from: "Elena Rostova <elena@scalewave.io>",
        subject: "Re: Scaling founder-led outbound for ScaleWave",
        text: "Thursday works — sending a calendar invite now.",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("demo");
    expect(body.outcome.status).toBe("ingested");
    expect(body.outcome.conversationId).toBe("conv_demo_002");

    const notifications = await createDemoNotificationStore().list(
      DEMO_WORKSPACE_ID
    );
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("reply_received");
    expect(notifications[0].title).toBe("New reply from Elena Rostova");
    expect(notifications[0].link).toContain("conv_demo_002");

    const log = listDemoEmailEvents();
    expect(log).toHaveLength(1);
    expect(log[0].event_type).toBe("email.received");
    expect(log[0].routing).toBe("routed");
  });

  it("unrouted mail creates no notification but is recorded as unrouted", async () => {
    const res = await POST(
      req({ from: "stranger@nowhere.example", text: "Who are you?" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcome.status).toBe("unrouted");

    expect(
      await createDemoNotificationStore().list(DEMO_WORKSPACE_ID)
    ).toHaveLength(0);

    const log = listDemoEmailEvents();
    expect(log).toHaveLength(1);
    expect(log[0].routing).toBe("unrouted");
  });

  it("rejects an unparseable sender", async () => {
    const res = await POST(req({ from: "not an address" }));
    expect(res.status).toBe(400);
  });
});
