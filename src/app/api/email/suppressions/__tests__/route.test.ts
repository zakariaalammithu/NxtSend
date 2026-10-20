import { describe, it, expect, beforeEach } from "vitest";
import { GET, POST, DELETE } from "../route";
import { setDemoStorage, createMemoryStorage } from "@/lib/data/demo-store";

/**
 * Suppression management API (P5 Stage C). The test environment has no
 * Supabase env, so resolveCenterContext takes the demo branch — these
 * tests prove the demo guard path end-to-end (demo workspace + demo
 * store) plus request validation. The live branch is the same
 * resolveCenterContext guard every other workspace API uses (401
 * without a session, RLS-scoped session client), exercised by the
 * Integration Center's own tests.
 */

const BASE = "http://localhost/api/email/suppressions";

function req(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  setDemoStorage(createMemoryStorage());
});

describe("/api/email/suppressions (demo guard path)", () => {
  it("GET starts empty and reports demo mode", async () => {
    const res = await GET(req("GET", BASE));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("demo");
    expect(body.entries).toEqual([]);
  });

  it("POST adds an address (201), and re-adding is idempotent (200, created=false)", async () => {
    const first = await POST(
      req("POST", BASE, { email: "Person@Example.com", reason: "unsubscribed (manual)" })
    );
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    expect(firstBody.created).toBe(true);
    expect(firstBody.entry.email).toBe("person@example.com");
    expect(firstBody.entry.reason).toBe("unsubscribed (manual)");

    const second = await POST(
      req("POST", BASE, { email: "person@example.com", reason: "manual block" })
    );
    expect(second.status).toBe(200);
    expect((await second.json()).created).toBe(false);

    const list = await (await GET(req("GET", BASE))).json();
    expect(list.entries).toHaveLength(1);
  });

  it("POST rejects an invalid email with 400 and stores nothing", async () => {
    const res = await POST(req("POST", BASE, { email: "not-an-email", reason: "manual block" }));
    expect(res.status).toBe(400);
    const list = await (await GET(req("GET", BASE))).json();
    expect(list.entries).toEqual([]);
  });

  it("POST with an unknown reason falls back to `manual block` (closed vocabulary)", async () => {
    const res = await POST(
      req("POST", BASE, { email: "a@example.com", reason: "because I said so" })
    );
    expect(res.status).toBe(201);
    expect((await res.json()).entry.reason).toBe("manual block");
  });

  it("GET ?q= filters server-side", async () => {
    await POST(req("POST", BASE, { email: "alpha@example.com", reason: "manual block" }));
    await POST(req("POST", BASE, { email: "beta@example.org", reason: "manual block" }));
    const filtered = await (await GET(req("GET", `${BASE}?q=example.org`))).json();
    expect(filtered.entries).toHaveLength(1);
    expect(filtered.entries[0].email).toBe("beta@example.org");
  });

  it("DELETE removes the address (re-enables sending) and reports truthfully", async () => {
    await POST(req("POST", BASE, { email: "gone@example.com", reason: "manual block" }));
    const res = await DELETE(req("DELETE", BASE, { email: "gone@example.com" }));
    expect(res.status).toBe(200);
    expect((await res.json()).removed).toBe(true);
    const list = await (await GET(req("GET", BASE))).json();
    expect(list.entries).toEqual([]);
    const again = await DELETE(req("DELETE", BASE, { email: "gone@example.com" }));
    expect((await again.json()).removed).toBe(false);
  });
});
