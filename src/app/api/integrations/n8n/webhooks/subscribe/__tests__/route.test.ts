/**
 * n8n webhook subscribe route wrapper test — in this test
 * environment no Supabase is configured, so the app is in Demo
 * Mode and the route must refuse with 503 before any store
 * access (fail closed).
 */
import { describe, it, expect } from "vitest";
import { POST } from "../route";

function postRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/integrations/n8n/webhooks/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/integrations/n8n/webhooks/subscribe (wrapper)", () => {
  it("refuses in Demo Mode", async () => {
    const res = await POST(
      postRequest({ event: "lead.created", target_url: "https://n8n.example.com/webhook/x" })
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toContain("Demo Mode");
  });
});
