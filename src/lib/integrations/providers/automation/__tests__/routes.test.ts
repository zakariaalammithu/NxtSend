/**
 * Automation-platform v1 route tests (route level, no database).
 *
 * Covers, for each of Make / Pabbly / Albato / Activepieces:
 * the public health endpoint, demo refusal (503) on the auth-test
 * / lead / campaign routes, and unauthorized (401) without a
 * token once the deployment is out of Demo Mode (dummy Supabase
 * env makes getDataMode() report "supabase").
 *
 * NOTE on the demo message: resolveRestContext labels any
 * non-n8n platform "Zapier" (src/lib/integrations/rest/auth.ts
 * line ~99 — a known cosmetic bug, coordinator follow-up), so
 * the demo error for these platforms says "Zapier is not
 * available in Demo Mode". These tests assert the code and the
 * "Demo Mode" wording, not the platform name.
 */
import { describe, it, expect, afterEach } from "vitest";
import { GET as makeHealth } from "@/app/api/integrations/make/health/route";
import { GET as makeAuthTest } from "@/app/api/integrations/make/v1/auth/test/route";
import { GET as makeLeads } from "@/app/api/integrations/make/v1/leads/route";
import { GET as makeCampaigns } from "@/app/api/integrations/make/v1/campaigns/route";
import { DELETE as makeLeadDelete } from "@/app/api/integrations/make/v1/leads/[id]/route";
import { GET as pabblyHealth } from "@/app/api/integrations/pabbly/health/route";
import { GET as pabblyAuthTest } from "@/app/api/integrations/pabbly/v1/auth/test/route";
import { GET as pabblyLeads } from "@/app/api/integrations/pabbly/v1/leads/route";
import { GET as pabblyCampaigns } from "@/app/api/integrations/pabbly/v1/campaigns/route";
import { DELETE as pabblyLeadDelete } from "@/app/api/integrations/pabbly/v1/leads/[id]/route";
import { GET as albatoHealth } from "@/app/api/integrations/albato/health/route";
import { GET as albatoAuthTest } from "@/app/api/integrations/albato/v1/auth/test/route";
import { GET as albatoLeads } from "@/app/api/integrations/albato/v1/leads/route";
import { GET as albatoCampaigns } from "@/app/api/integrations/albato/v1/campaigns/route";
import { DELETE as albatoLeadDelete } from "@/app/api/integrations/albato/v1/leads/[id]/route";
import { GET as activepiecesHealth } from "@/app/api/integrations/activepieces/health/route";
import { GET as activepiecesAuthTest } from "@/app/api/integrations/activepieces/v1/auth/test/route";
import { GET as activepiecesLeads } from "@/app/api/integrations/activepieces/v1/leads/route";
import { GET as activepiecesCampaigns } from "@/app/api/integrations/activepieces/v1/campaigns/route";
import { DELETE as activepiecesLeadDelete } from "@/app/api/integrations/activepieces/v1/leads/[id]/route";

const ORIGIN = "https://nxtsend.com";

const PLATFORMS = [
  {
    id: "make",
    enabledField: "makeEnabled",
    health: makeHealth,
    authTest: makeAuthTest,
    leads: makeLeads,
    campaigns: makeCampaigns,
    leadDelete: makeLeadDelete,
  },
  {
    id: "pabbly",
    enabledField: "pabblyEnabled",
    health: pabblyHealth,
    authTest: pabblyAuthTest,
    leads: pabblyLeads,
    campaigns: pabblyCampaigns,
    leadDelete: pabblyLeadDelete,
  },
  {
    id: "albato",
    enabledField: "albatoEnabled",
    health: albatoHealth,
    authTest: albatoAuthTest,
    leads: albatoLeads,
    campaigns: albatoCampaigns,
    leadDelete: albatoLeadDelete,
  },
  {
    id: "activepieces",
    enabledField: "activepiecesEnabled",
    health: activepiecesHealth,
    authTest: activepiecesAuthTest,
    leads: activepiecesLeads,
    campaigns: activepiecesCampaigns,
    leadDelete: activepiecesLeadDelete,
  },
] as const;

function req(path: string, token: string | null = null): Request {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(`${ORIGIN}${path}`, { headers });
}

const savedEnv = { ...process.env };

function restoreEnv(key: string, saved: string | undefined) {
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

describe("automation platform health", () => {
  for (const p of PLATFORMS) {
    it(`${p.id} health is public and reports demo mode + enabled`, async () => {
      const res = await p.health();
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.mode).toBe("demo");
      expect(body[p.enabledField]).toBe(true);
      expect(body.version).toBeTruthy();
    });
  }
});

describe("automation platform v1 routes — demo refusal", () => {
  for (const p of PLATFORMS) {
    it(`${p.id}: auth/test, leads and campaigns all 503 in Demo Mode`, async () => {
      for (const [name, res] of [
        ["auth/test", await p.authTest(req(`/api/integrations/${p.id}/v1/auth/test`))],
        ["leads", await p.leads(req(`/api/integrations/${p.id}/v1/leads`))],
        ["campaigns", await p.campaigns(req(`/api/integrations/${p.id}/v1/campaigns`))],
      ] as const) {
        expect(res.status, name).toBe(503);
        const body = (await res.json()) as Record<string, unknown>;
        expect(body.code).toBe("demo_mode");
        expect(String(body.error)).toContain("is not available in Demo Mode");
      }
    });

    it(`${p.id}: lead DELETE 503s in Demo Mode too`, async () => {
      const res = await p.leadDelete(req(`/api/integrations/${p.id}/v1/leads/lead_1`), {
        params: { id: "lead_1" },
      });
      expect(res.status).toBe(503);
    });
  }
});

describe("automation platform v1 routes — unauthorized", () => {
  for (const p of PLATFORMS) {
    it(`${p.id}: auth/test 401s without a token once out of Demo Mode`, async () => {
      useSupabaseMode();
      const res = await p.authTest(req(`/api/integrations/${p.id}/v1/auth/test`));
      expect(res.status).toBe(401);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.code).toBe("unauthorized");
    });

    it(`${p.id}: leads GET 401s without a token once out of Demo Mode`, async () => {
      useSupabaseMode();
      const res = await p.leads(req(`/api/integrations/${p.id}/v1/leads`));
      expect(res.status).toBe(401);
    });

    it(`${p.id}: a garbage Bearer <redacted> 401s`, async () => {
      useSupabaseMode();
      const res = await p.authTest(
        req(`/api/integrations/${p.id}/v1/auth/test`, "garbage")
      );
      expect(res.status).toBe(401);
    });
  }
});
