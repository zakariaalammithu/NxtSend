import { describe, it, expect, beforeEach } from "vitest";
import { GET, POST } from "../route";
import { setDemoStorage, createMemoryStorage } from "@/lib/data/demo-store";
import { createDemoSuppressionStore } from "@/lib/email/suppression-store";
import { createUnsubscribeToken } from "@/lib/email/unsubscribe";
import { DEMO_WORKSPACE_ID } from "@/lib/data/workspace";

/**
 * Public unsubscribe endpoint (P5 Stage C). The test environment is
 * Demo Mode, so tokens are demo-key tokens and the endpoint writes to
 * the demo suppression store — the full public flow (confirmation
 * page → one-click POST → suppression visible) runs for real here.
 * The live path differs only in deps (service-role store + enrollment
 * stopper), covered by the unsubscribe-service unit tests.
 */

const EMAIL = "lead.person@example.com";

function demoToken(email = EMAIL): string {
  const token = createUnsubscribeToken(
    { workspaceId: DEMO_WORKSPACE_ID, email },
    {},
    "demo"
  );
  if (!token) throw new Error("demo token must mint");
  return token;
}

function call(
  handler: (req: Request, ctx: { params: { token: string } }) => Promise<Response>,
  token: string,
  method: "GET" | "POST"
): Promise<Response> {
  const req = new Request(`http://localhost/api/unsubscribe/${token}`, {
    method,
    headers:
      method === "POST"
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {},
    body: method === "POST" ? "List-Unsubscribe=One-Click" : undefined,
  });
  return handler(req, { params: { token } });
}

beforeEach(() => {
  setDemoStorage(createMemoryStorage());
});

describe("/api/unsubscribe/[token]", () => {
  it("GET renders the confirmation page with the address MASKED — and changes nothing", async () => {
    const res = await call(GET, demoToken(), "GET");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("l***@example.com");
    expect(html).not.toContain(EMAIL); // full address never rendered
    expect(html).toContain('method="POST"');
    const suppressed = await createDemoSuppressionStore().check(
      DEMO_WORKSPACE_ID,
      EMAIL
    );
    expect(suppressed).toBe(false); // GET must not perform
  });

  it("POST performs the unsubscribe; the address lands on the suppression list", async () => {
    const res = await call(POST, demoToken(), "POST");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("You have been unsubscribed");
    const store = createDemoSuppressionStore();
    expect(await store.check(DEMO_WORKSPACE_ID, EMAIL)).toBe(true);
    const entries = await store.list(DEMO_WORKSPACE_ID);
    expect(entries.find((e) => e.email === EMAIL)?.reason).toBe("unsubscribed");
  });

  it("POST is idempotent — a second one-click succeeds as already-unsubscribed, one row", async () => {
    await call(POST, demoToken(), "POST");
    const second = await call(POST, demoToken(), "POST");
    expect(second.status).toBe(200);
    expect(await second.text()).toContain("already unsubscribed");
    const entries = await createDemoSuppressionStore().list(DEMO_WORKSPACE_ID);
    expect(entries.filter((e) => e.email === EMAIL)).toHaveLength(1);
  });

  it("a tampered token gets the safe generic 400 page on GET and POST, with zero side effects", async () => {
    const good = demoToken();
    const tampered = `${good.slice(0, -4)}AAAA`;
    const getRes = await call(GET, tampered, "GET");
    expect(getRes.status).toBe(400);
    expect(await getRes.text()).toContain("invalid");
    const postRes = await call(POST, tampered, "POST");
    expect(postRes.status).toBe(400);
    const suppressed = await createDemoSuppressionStore().check(
      DEMO_WORKSPACE_ID,
      EMAIL
    );
    expect(suppressed).toBe(false);
  });

  it("a token minted for another workspace records only under its own workspace", async () => {
    const other = createUnsubscribeToken(
      { workspaceId: "ws_someone_else", email: EMAIL },
      {},
      "demo"
    ) as string;
    const res = await call(POST, other, "POST");
    expect(res.status).toBe(200);
    const store = createDemoSuppressionStore();
    expect(await store.check(DEMO_WORKSPACE_ID, EMAIL)).toBe(false);
    expect(await store.check("ws_someone_else", EMAIL)).toBe(true);
  });
});
