/**
 * n8n v1 route tests (route level, no database).
 *
 * Covers: the public health endpoint, demo refusal (503) on the
 * auth-test / lead / campaign routes, and unauthorized (401)
 * without a token once the deployment is out of Demo Mode
 * (dummy Supabase env makes getDataMode() report "supabase").
 * Business behaviour lives in the rest-api tests; these tests
 * prove the routes are wired to the n8n platform.
 */

import { describe, it, expect, afterEach } from "vitest";
import { GET as healthGet } from "../../../../app/api/integrations/n8n/health/route";
import { GET as authTestGet } from "../../../../app/api/integrations/n8n/v1/auth/test/route";
import { GET as leadsGet } from "../../../../app/api/integrations/n8n/v1/leads/route";
import { GET as campaignsGet } from "../../../../app/api/integrations/n8n/v1/campaigns/route";
import { DELETE as leadDelete } from "../../../../app/api/integrations/n8n/v1/leads/[id]/route";

const ORIGIN = "https://nxtsend.com";

function req(path: string, token: string | null = null): Request {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(`${ORIGIN}${path}`, { headers });
}

const savedEnv = { ...process.env };

function restoreEnv(key: string, saved: string | undefined) {
  // Assigning `undefined` to process.env coerces to the string
  // "undefined" — delete the key instead.
  if (saved === undefined) delete process.env[key];
  else process.env[key] = saved;
}

afterEach(() => {
  restoreEnv("NEXT_PUBLIC_SUPABASE_URL", savedEnv.NEXT_PUBLIC_SUPABASE_URL);
  restoreEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", savedEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
});

function useSupabaseMode() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
}

describe("n8n health", () => {
  it("is public and reports demo mode + n8n enabled", async () => {
    const res = await healthGet();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.mode).toBe("demo");
    expect(body.n8nEnabled).toBe(true);
    expect(body.version).toBeTruthy();
  });
});

describe("n8n v1 routes — demo refusal", () => {
  it("auth/test, leads and campaigns all 503 in Demo Mode", async () => {
    for (const [name, res] of [
      ["auth/test", await authTestGet(req("/api/integrations/n8n/v1/auth/test"))],
      ["leads", await leadsGet(req("/api/integrations/n8n/v1/leads"))],
      ["campaigns", await campaignsGet(req("/api/integrations/n8n/v1/campaigns"))],
    ] as const) {
      expect(res.status, name).toBe(503);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.code).toBe("demo_mode");
      expect(String(body.error)).toContain("n8n is not available in Demo Mode");
    }
  });

  it("lead DELETE 503s in Demo Mode too", async () => {
    const res = await leadDelete(req("/api/integrations/n8n/v1/leads/lead_1"), {
      params: { id: "lead_1" },
    });
    expect(res.status).toBe(503);
  });
});

describe("n8n v1 routes — unauthorized", () => {
  it("auth/test 401s without a token once out of Demo Mode", async () => {
    useSupabaseMode();
    const res = await authTestGet(req("/api/integrations/n8n/v1/auth/test"));
    expect(res.status).toBe(401);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.code).toBe("unauthorized");
    expect(String(body.error)).toContain("API key");
  });

  it("leads GET 401s without a token once out of Demo Mode", async () => {
    useSupabaseMode();
    const res = await leadsGet(req("/api/integrations/n8n/v1/leads"));
    expect(res.status).toBe(401);
  });

  it("a garbage Bearer token 401s", async () => {
    useSupabaseMode();
    const res = await authTestGet(req("/api/integrations/n8n/v1/auth/test", "garbage"));
    expect(res.status).toBe(401);
  });
});
