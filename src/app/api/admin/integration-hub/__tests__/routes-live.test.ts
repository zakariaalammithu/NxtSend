/**
 * Hub route tests in LIVE mode: the admin gate and the Supabase admin
 * client are mocked so the full route → service → (fake) DB path runs,
 * including the gate matrix (401 / 403 passthrough) and the canary
 * sweep at the HTTP boundary.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import {
  createFakeAdmin,
  type FakeSupabase,
} from "@/lib/integration-hub/__tests__/fake-admin";

type GateLike =
  | { mode: string; caller: { id: string; email: string } }
  | { response: NextResponse };

interface HubHarness {
  gate: GateLike;
  fake: FakeSupabase;
}

const harness = vi.hoisted((): HubHarness => ({
  gate: null as unknown as GateLike,
  fake: null as unknown as FakeSupabase,
}));

vi.mock("@/lib/admin/platform-server", () => ({
  resolveAdminGate: async () => harness.gate,
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => harness.fake,
  createServerClient: () => null,
}));

import { GET as overviewGET } from "../route";
import {
  GET as credentialsGET,
  POST as credentialsPOST,
} from "../integrations/[slug]/credentials/route";
import { POST as revealPOST } from "../credentials/[id]/reveal/route";
import { POST as copyPOST } from "../credentials/[id]/copy/route";
import { POST as packagePOST } from "../integrations/[slug]/copy-package/route";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const CANARY = "ROUTE-CANARY-VALUE-abcdef123456";
const slugParams = { params: { slug: "bizreviewradar" } };

const BRR_ROW = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "bizreviewradar",
  name: "BizReviewRadar (BRR)",
  vendor: "BizReviewRadar",
  category: "connector",
  status: "configuring",
  external_status_note: null,
  website_url: "https://bizreviewradar.com",
  docs_url: null,
  review_portal_url: null,
  support_email: null,
  summary: "",
  metadata: {},
  sort_order: 0,
  created_by: null,
  updated_by: null,
  created_at: "2026-10-22T00:00:00.000Z",
  updated_at: "2026-10-22T00:00:00.000Z",
};

function jsonReq(body: unknown): Request {
  return new Request("http://localhost/api/admin/integration-hub", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.INTEGRATION_HUB_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  harness.fake = createFakeAdmin({
    hub_integrations: [BRR_ROW],
    hub_credentials: [],
    hub_test_accounts: [],
    hub_checklist_items: [],
    hub_checklist_state: [],
    hub_documents: [],
    audit_logs: [],
  });
  harness.gate = {
    mode: "supabase",
    caller: { id: ACTOR_ID, email: "admin@example.com" },
  };
});

describe("Hub routes — gate matrix", () => {
  it("unauthenticated → the gate's 401 is passed through untouched", async () => {
    harness.gate = {
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
    const res = await overviewGET();
    expect(res.status).toBe(401);
  });

  it("non-admin → the gate's 403 is passed through untouched", async () => {
    harness.gate = {
      response: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
    };
    const res = await overviewGET();
    expect(res.status).toBe(403);
    const credRes = await credentialsGET(new Request("http://localhost/x"), slugParams);
    expect(credRes.status).toBe(403);
  });

  it("unauthorized callers cannot REVEAL or COPY a secret (401/403 at the disclosure routes)", async () => {
    const idParams = { params: { id: "33333333-3333-4333-8333-333333333333" } };

    harness.gate = {
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
    const reveal401 = await revealPOST(jsonReq({}), idParams);
    expect(reveal401.status).toBe(401);
    expect(JSON.stringify(await reveal401.json())).not.toContain("value");
    const copy401 = await copyPOST(jsonReq({}), idParams);
    expect(copy401.status).toBe(401);

    harness.gate = {
      response: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
    };
    const reveal403 = await revealPOST(jsonReq({}), idParams);
    expect(reveal403.status).toBe(403);
    const copy403 = await copyPOST(jsonReq({}), idParams);
    expect(copy403.status).toBe(403);
    const pkg403 = await packagePOST(
      jsonReq({ format: "json", includeCredentialIds: [idParams.params.id] }),
      slugParams
    );
    expect(pkg403.status).toBe(403);
  });
});

describe("Hub routes — live credential lifecycle + canary", () => {
  it("create → list → reveal, with the canary confined to the reveal response", async () => {
    const createRes = await credentialsPOST(
      jsonReq({
        label: "Muse OAuth client secret",
        kind: "client_secret",
        environment: "production",
        value: CANARY,
      }),
      slugParams
    );
    expect(createRes.status).toBe(201);
    expect(createRes.headers.get("cache-control")).toBe("no-store");
    const createBody = await createRes.json();
    expect(JSON.stringify(createBody)).not.toContain(CANARY);
    expect(createBody.credential.value_last4).toBe(CANARY.slice(-4));
    const credId = createBody.credential.id;

    const listRes = await credentialsGET(new Request("http://localhost/x"), slugParams);
    expect(listRes.status).toBe(200);
    expect(listRes.headers.get("cache-control")).toBe("no-store");
    const listBody = await listRes.json();
    expect(JSON.stringify(listBody)).not.toContain(CANARY);

    const revealRes = await revealPOST(jsonReq({}), { params: { id: credId } });
    expect(revealRes.status).toBe(200);
    expect(revealRes.headers.get("cache-control")).toBe("no-store");
    const revealBody = await revealRes.json();
    expect(revealBody.value).toBe(CANARY);

    // Audit rows (fake DB) contain metadata only.
    expect(JSON.stringify(harness.fake.tables.audit_logs)).not.toContain(CANARY);
    const revealAudit = harness.fake.tables.audit_logs.find(
      (r: { action?: string }) => r.action === "HUB_CREDENTIAL_REVEAL"
    );
    expect(revealAudit).toBeDefined();
    expect(revealAudit!.resource).toBe(`hub:credential:${credId}`);
  });

  it("audit failure at the route boundary → 500 and NO value in the body", async () => {
    const createRes = await credentialsPOST(
      jsonReq({
        label: "Secret",
        kind: "client_secret",
        environment: "production",
        value: CANARY,
      }),
      slugParams
    );
    const credId = (await createRes.json()).credential.id;
    harness.fake.failInsertTables.add("audit_logs");
    const res = await revealPOST(jsonReq({}), { params: { id: credId } });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain(CANARY);
    expect(body.value).toBeUndefined();
  });

  it("copy package: default excludes the canary; explicit include carries it (audited)", async () => {
    const createRes = await credentialsPOST(
      jsonReq({
        label: "Secret",
        kind: "client_secret",
        environment: "production",
        value: CANARY,
      }),
      slugParams
    );
    const credId = (await createRes.json()).credential.id;

    const defRes = await packagePOST(jsonReq({ format: "json" }), slugParams);
    expect(defRes.status).toBe(200);
    const defBody = await defRes.json();
    expect(defBody.content).not.toContain(CANARY);
    expect(defBody.includes_secrets).toBe(false);

    const incRes = await packagePOST(
      jsonReq({ format: "json", includeCredentialIds: [credId] }),
      slugParams
    );
    expect(incRes.status).toBe(200);
    const incBody = await incRes.json();
    expect(incBody.includes_secrets).toBe(true);
    expect(incBody.content).toContain(CANARY);
  });

  it("including a credential from another integration → 400", async () => {
    const res = await packagePOST(
      jsonReq({ format: "md", includeCredentialIds: ["00000000-0000-4000-8000-000000000000"] }),
      slugParams
    );
    expect(res.status).toBe(400);
  });
});
