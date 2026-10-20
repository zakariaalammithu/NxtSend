import { describe, it, expect, beforeEach } from "vitest";
import { GET } from "../route";
import { setDemoStorage, createMemoryStorage } from "@/lib/data/demo-store";

/**
 * /api/admin/deliverability (P5 Stage D) — demo gate path
 * (resolveAdminGate serves the labelled demo stores in demo mode).
 * The payload must carry the full monitoring surface: funnel +
 * rates, the inbound webhook log (with routing), sending errors and
 * the reply-sync status — all classified "simulated", and the sync
 * status must never claim "Healthy".
 */

function req(url: string): Request {
  return new Request(url, { method: "GET" });
}

beforeEach(() => {
  setDemoStorage(createMemoryStorage());
});

describe("/api/admin/deliverability (demo gate path)", () => {
  it("returns funnel, webhook log, errors and sync status over a wide window", async () => {
    const res = await GET(
      req("http://localhost/api/admin/deliverability?days=3650")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("demo");
    expect(body.classification).toBe("simulated");

    // Funnel from the seed's simulated events (msg_demo_003 opened,
    // msg_demo_006 delivered, msg_demo_004 received).
    expect(body.totals.counts.sent).toBe(2);
    expect(body.totals.counts.delivered).toBe(2);
    expect(body.totals.counts.opened).toBe(1);
    expect(body.totals.counts.received).toBe(1);
    expect(body.totals.rates.deliveryRate).toBe(1);

    // Webhook log: the received seed reply is routed; entries carry
    // their workspace label.
    const received = (body.webhookLog as Array<{ event_type: string; routing: string; workspace_name: string | null }>).find(
      (e) => e.event_type === "email.received"
    );
    expect(received).toBeDefined();
    expect(received?.routing).toBe("routed");
    expect(received?.workspace_name).toContain("Demo");

    // Sending errors: the seed has none — an honest empty list.
    expect(body.sendingErrors).toEqual([]);

    // Reply sync: the newest inbound event is old → "quiet", and the
    // payload never claims the pipeline is "Healthy".
    expect(body.replySync.status).toBe("quiet");
    expect(body.replySync.lastInboundAt).not.toBeNull();
    expect(JSON.stringify(body).toLowerCase()).not.toContain("healthy");
    expect(typeof body.replySync.webhookSecretConfigured).toBe("boolean");
  });

  it("default window: no recent events → no_events sync status, zeroed funnel", async () => {
    const res = await GET(req("http://localhost/api/admin/deliverability"));
    const body = await res.json();
    expect(body.totals.counts.sent).toBe(0);
    expect(body.replySync.status).toBe("no_events");
    expect(body.replySync.message).toContain("No inbound events recorded yet");
  });
});
