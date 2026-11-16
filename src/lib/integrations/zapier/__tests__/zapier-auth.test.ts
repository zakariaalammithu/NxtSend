/**
 * Zapier route-auth tests (resolveZapierContext).
 *
 * Covers: demo refusal (503, platform-aware message), unknown /
 * wrong-resource token (401), insufficient scope (403 with a
 * structured error), rate limiting (429 after 120/min per token),
 * and the happy path (Zapier token + tier → context). Tokens are
 * issued through the real OAuth handlers against the in-memory
 * store — no database, no network.
 */

import { describe, it, expect } from "vitest";
import { createMemoryMuseOAuthStore, registerMuseClient, issueAuthorizationCode, handleMuseTokenRequest } from "@/lib/muse-connector/oauth";
import { resolveZapierContext, ZAPIER_RATE_LIMIT_PER_MINUTE } from "../auth";
import { getZapierResourceUrl } from "../config";
import { createRateLimiter } from "@/lib/admin/submissions-core";

const ORIGIN = "https://nxtsend.com";
const ZAPIER_RESOURCE = getZapierResourceUrl(ORIGIN);
const ZAPIER_REDIRECT = "https://zapier.com/dashboard/auth/oauth/return/App1234567CLIAPI/";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-11-17T00:00:00Z");

function formRequest(url: string, params: Record<string, string>): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
}

async function zapierToken(
  scopes: string[] = ["zapier.read", "zapier.write"],
  resource: string = ZAPIER_RESOURCE
): Promise<{ store: ReturnType<typeof createMemoryMuseOAuthStore>; access: string }> {
  const store = createMemoryMuseOAuthStore();
  const reg = await registerMuseClient(
    store,
    { name: "Zapier", redirectUris: [ZAPIER_REDIRECT], confidential: true },
    NOW
  );
  if (!reg.ok) throw new Error("registration failed");
  const code = await issueAuthorizationCode(
    store,
    {
      clientId: reg.client.client_id,
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      scopes: scopes as ("zapier.read" | "zapier.write")[],
      codeChallenge: null,
      redirectUri: ZAPIER_REDIRECT,
      resource,
    },
    NOW
  );
  const res = await handleMuseTokenRequest(
    formRequest("http://localhost:3000/api/muse/oauth/token", {
      grant_type: "authorization_code",
      client_id: reg.client.client_id,
      client_secret: reg.clientSecret ?? "",
      code,
      redirect_uri: ZAPIER_REDIRECT,
      resource,
    }),
    { store, now: NOW }
  );
  if (res.status !== 200) throw new Error(`exchange failed: ${JSON.stringify(res.body)}`);
  return { store, access: (res.body as { access_token: string }).access_token };
}

function apiRequest(access: string | null): Request {
  const headers: Record<string, string> = {};
  if (access) headers.authorization = `Bearer ${access}`;
  return new Request(`${ORIGIN}/api/integrations/zapier/v1/leads`, { headers });
}

describe("resolveZapierContext", () => {
  it("resolves a Zapier token with the read tier", async () => {
    const { store, access } = await zapierToken();
    const res = await resolveZapierContext(apiRequest(access), "read", {
      store,
      mode: "supabase",
      now: NOW,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.ctx.workspaceId).toBe(WORKSPACE_ID);
      expect(res.ctx.userId).toBe(USER_ID);
      expect(res.ctx.resource).toBe(ZAPIER_RESOURCE);
    }
  });

  it("refuses Demo Mode with a platform-aware 503", async () => {
    const { store, access } = await zapierToken();
    const res = await resolveZapierContext(apiRequest(access), "read", {
      store,
      mode: "demo",
      now: NOW,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.status).toBe(503);
      expect(res.error.body.error).toContain("Demo Mode");
      expect(res.error.body.code).toBe("demo_mode");
    }
  });

  it("answers 401 for a missing token, a garbage token, and a Muse-resource token", async () => {
    const { store, access } = await zapierToken();
    const missing = await resolveZapierContext(apiRequest(null), "read", { store, mode: "supabase", now: NOW });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.status).toBe(401);
    const garbage = await resolveZapierContext(apiRequest("garbage"), "read", { store, mode: "supabase", now: NOW });
    expect(garbage.ok).toBe(false);
    if (!garbage.ok) expect(garbage.error.status).toBe(401);
    const muse = await zapierToken(["zapier.read"], `${ORIGIN}/api/mcp`);
    const wrongResource = await resolveZapierContext(apiRequest(muse.access), "read", {
      store: muse.store,
      mode: "supabase",
      now: NOW,
    });
    expect(wrongResource.ok).toBe(false);
    if (!wrongResource.ok) expect(wrongResource.error.status).toBe(401);
    void access;
  });

  it("answers 403 with a structured error when the tier is missing", async () => {
    const { store, access } = await zapierToken(["zapier.read"]);
    const res = await resolveZapierContext(apiRequest(access), "write", {
      store,
      mode: "supabase",
      now: NOW,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.status).toBe(403);
      expect(res.error.body.code).toBe("insufficient_scope");
      expect(res.error.body.error).toContain("zapier.write");
    }
  });

  it("rate-limits at 120 requests/minute per token", async () => {
    const { store, access } = await zapierToken();
    const limiter = createRateLimiter({ maxAttempts: ZAPIER_RATE_LIMIT_PER_MINUTE, windowMs: 60_000 });
    const nowMs = NOW.getTime();
    let last: Awaited<ReturnType<typeof resolveZapierContext>> | null = null;
    for (let i = 0; i < ZAPIER_RATE_LIMIT_PER_MINUTE + 1; i++) {
      last = await resolveZapierContext(apiRequest(access), "read", {
        store,
        mode: "supabase",
        now: new Date(nowMs + i),
        rateLimiter: limiter,
      });
    }
    expect(last?.ok).toBe(false);
    if (last && !last.ok) {
      expect(last.error.status).toBe(429);
      expect(last.error.body.code).toBe("rate_limited");
    }
  });
});
