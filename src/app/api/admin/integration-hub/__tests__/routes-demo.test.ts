/**
 * Hub route tests in DEMO mode (the vitest env has no Supabase
 * configured, so resolveAdminGate resolves to the demo branch — the
 * same path production Demo Mode takes).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { GET as overviewGET } from "../route";
import {
  GET as integrationsGET,
  POST as integrationsPOST,
} from "../integrations/route";
import {
  GET as detailGET,
  PUT as detailPUT,
} from "../integrations/[slug]/route";
import {
  GET as credentialsGET,
  POST as credentialsPOST,
} from "../integrations/[slug]/credentials/route";
import { POST as revealPOST } from "../credentials/[id]/reveal/route";
import { POST as copyPOST } from "../credentials/[id]/copy/route";
import { POST as packagePOST } from "../integrations/[slug]/copy-package/route";
import { POST as refreshPOST } from "../integrations/[slug]/status/refresh/route";
import { PUT as checklistStatePUT } from "../integrations/[slug]/checklist-state/[itemId]/route";
import { __resetHubDemoStore } from "@/lib/integration-hub/demo-store";

function jsonReq(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/admin/integration-hub", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const slugParams = { params: { slug: "brr-muse-connector" } };

beforeEach(() => {
  __resetHubDemoStore();
});

describe("Hub routes — demo mode", () => {
  it("overview returns the labelled demo fixtures", async () => {
    const res = await overviewGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overview.mode).toBe("demo");
    expect(body.overview.vault_configured).toBe(false);
    expect(body.overview.integrations[0].integration.slug).toBe("brr-muse-connector");
  });

  it("detail returns credential SHELLS only (no value fields at all)", async () => {
    const res = await detailGET(new Request("http://localhost/x"), slugParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.credentials.length).toBeGreaterThan(0);
    for (const c of body.credentials) {
      expect(c.has_value).toBe(false);
      expect(c.value_last4).toBeNull();
      expect(c.value).toBeUndefined();
      expect(c.value_enc).toBeUndefined();
    }
  });

  it("credential create is refused in demo (503) and nothing is stored", async () => {
    const res = await credentialsPOST(
      jsonReq({ label: "Demo", kind: "api_key", environment: "test", value: "typed-in-demo" }),
      slugParams
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/Demo Mode/);
    const list = await credentialsGET(new Request("http://localhost/x"), slugParams);
    const listBody = await list.json();
    expect(JSON.stringify(listBody)).not.toContain("typed-in-demo");
  });

  it("reveal and copy on a demo shell disclose NOTHING (503, no value)", async () => {
    const detail = await (await detailGET(new Request("http://localhost/x"), slugParams)).json();
    const shellId = detail.credentials[0].id;
    for (const handler of [revealPOST, copyPOST]) {
      const res = await handler(jsonReq({}), { params: { id: shellId } });
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.value).toBeUndefined();
      expect(body.error).toMatch(/nothing to reveal or copy/);
    }
  });

  it("demo copy package carries the DEMO banner", async () => {
    const res = await packagePOST(jsonReq({ format: "md" }), slugParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toContain("DEMO — NOT REAL CREDENTIALS");
    expect(body.includes_secrets).toBe(false);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("creating an integration as live is refused (400) even in demo", async () => {
    const res = await integrationsPOST(
      jsonReq({ name: "Sneaky", status: "live", confirm_status_change: true })
    );
    expect(res.status).toBe(400);
    const ok = await integrationsPOST(jsonReq({ name: "New Integration" }));
    expect(ok.status).toBe(201);
    const list = await (await integrationsGET()).json();
    expect(list.integrations.some((i: { slug?: string }) => i.slug === "new-integration")).toBe(true);
  });

  it("status change to live without the confirm field is refused (400)", async () => {
    const res = await detailPUT(jsonReq({ status: "live" }, "PUT"), slugParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fields.status).toMatch(/confirm_status_change/);
  });

  it("checklist state updates work in demo", async () => {
    const detail = await (await detailGET(new Request("http://localhost/x"), slugParams)).json();
    const itemId = detail.checklists[0].item.id;
    const res = await checklistStatePUT(jsonReq({ state: "done" }, "PUT"), {
      params: { slug: "brr-muse-connector", itemId },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state.state).toBe("done");
    expect(body.state.completed_at).toBeTruthy();
  });

  it("status refresh is a local recomputation (200, explanatory note)", async () => {
    const res = await refreshPOST(new Request("http://localhost/x"), slugParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.note).toMatch(/Local recomputation only/);
    expect(body.status).toBe("in_review");
  });

  it("unknown slug → 404", async () => {
    const res = await detailGET(new Request("http://localhost/x"), {
      params: { slug: "does-not-exist" },
    });
    expect(res.status).toBe(404);
  });
});
