/**
 * Integration Center tests.
 *
 * The properties that matter most (brief honesty rules):
 *  - key presence NEVER yields "Connected and Verified";
 *  - every vocabulary status is reachable;
 *  - verify guards run BEFORE any outbound call (spies prove a
 *    missing key means zero provider contact);
 *  - the registry's env var names all exist in .env.example.
 * No test makes a real network call — every provider surface is a fake.
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getIntegrationStatuses,
  mapProviderState,
  applyVerification,
} from "../status";
import { verifyIntegration } from "../verify";
import { INTEGRATION_REGISTRY } from "../registry";
import type { CenterStatus } from "../types";

const FAKE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "fake-anon-key-123",
  SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-456",
  RESEND_API_KEY: "fake-resend-key-123",
  EMAIL_FROM: "NxtSend <hello@example.com>",
  RESEND_WEBHOOK_SECRET: "fake-whsec-value-789",
  STRIPE_SECRET_KEY: "fake-stripe-key-123",
  STRIPE_WEBHOOK_SECRET: "fake-stripe-whsec-456",
  OPENAI_API_KEY: "fake-openai-key-123",
  ANTHROPIC_API_KEY: "fake-anthropic-key-123",
  MODEL_API_KEY: "fake-meta-model-key-123",
  NEXT_PUBLIC_META_PIXEL_ID: "123456789012345",
  CRON_SECRET: "fake-cron-value-123",
};

function statusOf(
  entries: ReturnType<typeof getIntegrationStatuses>,
  id: string
): CenterStatus {
  const entry = entries.find((e) => e.descriptor.id === id);
  if (!entry) throw new Error(`missing entry ${id}`);
  return entry.status;
}

function fakeFetch(status: number, body: unknown = {}) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
}

// ── Status mapping ─────────────────────────────────────────────────────────

describe("mapProviderState", () => {
  it("maps the raw provider vocabulary onto the Center vocabulary", () => {
    expect(mapProviderState("connected")).toBe("Connected but Not Verified");
    expect(mapProviderState("not_connected")).toBe("Not Connected");
    expect(mapProviderState("configuration_required")).toBe("Configuration Required");
    expect(mapProviderState("demo")).toBe("Demo Mode");
    expect(mapProviderState("error")).toBe("Error");
  });

  it("never maps key presence to Verified", () => {
    expect(mapProviderState("connected")).not.toBe("Connected and Verified");
  });
});

describe("applyVerification", () => {
  const okRecord = { ok: true, checkedAt: "2026-10-19T00:00:00.000Z", message: "fine" };
  const failRecord = { ok: false, checkedAt: "2026-10-19T00:00:00.000Z", message: "bad key" };

  it("upgrades to Verified only when configured AND the record succeeded", () => {
    expect(applyVerification("Connected but Not Verified", true, okRecord)).toBe(
      "Connected and Verified"
    );
  });

  it("ignores a stale record when the configuration is gone", () => {
    expect(applyVerification("Not Connected", false, okRecord)).toBe("Not Connected");
  });

  it("surfaces a failed verification as Error while configured", () => {
    expect(applyVerification("Connected but Not Verified", true, failRecord)).toBe("Error");
  });

  it("leaves the derived status alone without a record", () => {
    expect(applyVerification("Demo Mode", false, null)).toBe("Demo Mode");
  });
});

describe("getIntegrationStatuses", () => {
  it("demo mode: adapter-backed integrations are Demo Mode; static entries stay honest", () => {
    const entries = getIntegrationStatuses({ env: {}, mode: "demo" });
    for (const id of ["supabase", "resend", "stripe", "openai", "anthropic", "meta-model", "webhooks", "jobs", "linkedin"]) {
      expect(statusOf(entries, id), id).toBe("Demo Mode");
    }
    expect(statusOf(entries, "muse-ai")).toBe("Unsupported / No Documented API");
    expect(statusOf(entries, "google-sheets")).toBe("Not Connected");
    expect(statusOf(entries, "crm")).toBe("Not Connected");
    expect(statusOf(entries, "email-verification")).toBe("Not Connected");
    expect(statusOf(entries, "meta-pixel")).toBe("Not Connected");
  });

  it("live mode with no configuration: honest Not Connected / Configuration Required", () => {
    const entries = getIntegrationStatuses({ env: {}, mode: "supabase" });
    expect(statusOf(entries, "supabase")).toBe("Not Connected");
    expect(statusOf(entries, "resend")).toBe("Not Connected");
    expect(statusOf(entries, "stripe")).toBe("Not Connected");
    expect(statusOf(entries, "openai")).toBe("Not Connected");
    expect(statusOf(entries, "anthropic")).toBe("Not Connected");
    expect(statusOf(entries, "meta-model")).toBe("Not Connected");
    expect(statusOf(entries, "jobs")).toBe("Configuration Required");
    expect(statusOf(entries, "linkedin")).toBe("Configuration Required");
    expect(statusOf(entries, "webhooks")).toBe("Not Connected");
  });

  it("live mode with full configuration: Connected but Not Verified — never Verified from keys alone", () => {
    const entries = getIntegrationStatuses({
      env: FAKE_ENV,
      mode: "supabase",
      webhookConfigured: true,
    });
    for (const id of ["supabase", "resend", "stripe", "openai", "anthropic", "meta-model", "meta-pixel", "webhooks", "jobs"]) {
      expect(statusOf(entries, id), id).toBe("Connected but Not Verified");
    }
  });

  it("partial configuration maps to Configuration Required", () => {
    const entries = getIntegrationStatuses({
      env: { RESEND_API_KEY: FAKE_ENV.RESEND_API_KEY, STRIPE_SECRET_KEY: FAKE_ENV.STRIPE_SECRET_KEY },
      mode: "supabase",
    });
    expect(statusOf(entries, "resend")).toBe("Configuration Required");
    expect(statusOf(entries, "stripe")).toBe("Configuration Required");
  });

  it("a stored successful verification upgrades to Connected and Verified", () => {
    const entries = getIntegrationStatuses({
      env: FAKE_ENV,
      mode: "supabase",
      verifications: {
        resend: { ok: true, checkedAt: "2026-10-19T00:00:00.000Z", message: "domains ok" },
      },
    });
    expect(statusOf(entries, "resend")).toBe("Connected and Verified");
    expect(statusOf(entries, "stripe")).toBe("Connected but Not Verified");
  });

  it("a stored failed verification surfaces as Error", () => {
    const entries = getIntegrationStatuses({
      env: FAKE_ENV,
      mode: "supabase",
      verifications: {
        stripe: { ok: false, checkedAt: "2026-10-19T00:00:00.000Z", message: "bad key" },
      },
    });
    expect(statusOf(entries, "stripe")).toBe("Error");
  });

  it("env presence reports booleans only and matches the fake env", () => {
    const entries = getIntegrationStatuses({ env: FAKE_ENV, mode: "supabase" });
    const resend = entries.find((e) => e.descriptor.id === "resend");
    expect(resend?.envPresence).toEqual([
      { name: "RESEND_API_KEY", present: true },
      { name: "EMAIL_FROM", present: true },
      { name: "RESEND_WEBHOOK_SECRET", present: true },
    ]);
    // No secret value leaks anywhere in the payload.
    expect(JSON.stringify(entries)).not.toContain("fake-resend-key-123");
    expect(JSON.stringify(entries)).not.toContain("fake-stripe-key-123");
  });

  it("placeholder values count as not configured", () => {
    const entries = getIntegrationStatuses({
      env: { OPENAI_API_KEY: "sk_your_openai_api_key" },
      mode: "supabase",
    });
    expect(statusOf(entries, "openai")).toBe("Not Connected");
  });
});

// ── Verify guards + provider checks (all fakes) ────────────────────────────

describe("verifyIntegration — demo mode", () => {
  it("returns the honest demo result and attempts nothing", async () => {
    const fetchSpy = fakeFetch(200);
    const out = await verifyIntegration("resend", {
      env: {},
      mode: "demo",
      fetchFn: fetchSpy as unknown as typeof fetch,
    });
    expect(out?.status).toBe("Demo Mode");
    expect(out?.attempted).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("webhooks: dispatches the test event through the (simulated) pipeline", async () => {
    const dispatch = vi.fn(async () => ({ status: "simulated" }));
    const out = await verifyIntegration("webhooks", {
      env: {},
      mode: "demo",
      dispatchTestEvent: dispatch,
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(out?.status).toBe("Demo Mode");
    expect(out?.attempted).toBe(true);
    expect(out?.message).toContain("NOT actually called");
  });
});

describe("verifyIntegration — configuration guards (no outbound call without config)", () => {
  it("resend without full config: Configuration Required, domains never listed", async () => {
    const listDomains = vi.fn(async () => ({ error: null }));
    const out = await verifyIntegration("resend", {
      env: { RESEND_API_KEY: FAKE_ENV.RESEND_API_KEY }, // EMAIL_FROM missing
      mode: "supabase",
      resendListDomains: listDomains,
    });
    expect(out?.status).toBe("Configuration Required");
    expect(out?.attempted).toBe(false);
    expect(listDomains).not.toHaveBeenCalled();
  });

  it("openai without a key: Not Connected, fetch never called", async () => {
    const fetchSpy = fakeFetch(200);
    const out = await verifyIntegration("openai", {
      env: {},
      mode: "supabase",
      fetchFn: fetchSpy as unknown as typeof fetch,
    });
    expect(out?.status).toBe("Not Connected");
    expect(out?.attempted).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("stripe without full config: no account retrieve attempted", async () => {
    const retrieve = vi.fn(async () => ({ id: "acct_fake" }));
    const out = await verifyIntegration("stripe", {
      env: { STRIPE_SECRET_KEY: FAKE_ENV.STRIPE_SECRET_KEY },
      mode: "supabase",
      stripeRetrieveAccount: retrieve,
    });
    expect(out?.status).toBe("Configuration Required");
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("meta-model without a key: Not Connected with the secondary-sources note, fetch never called", async () => {
    const fetchSpy = fakeFetch(200);
    const out = await verifyIntegration("meta-model", {
      env: {},
      mode: "supabase",
      fetchFn: fetchSpy as unknown as typeof fetch,
    });
    expect(out?.status).toBe("Not Connected");
    expect(out?.notes).toContain("secondary");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("webhooks without a subscription: Not Connected, nothing dispatched", async () => {
    const dispatch = vi.fn(async () => ({ status: "delivered" }));
    const out = await verifyIntegration("webhooks", {
      env: FAKE_ENV,
      mode: "supabase",
      webhookConfigured: false,
      dispatchTestEvent: dispatch,
    });
    expect(out?.status).toBe("Not Connected");
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("verifyIntegration — live provider checks (fakes)", () => {
  it("openai: 200 from /v1/models verifies; the key travels in the Authorization header", async () => {
    const fetchSpy = fakeFetch(200, { data: [] });
    const out = await verifyIntegration("openai", {
      env: FAKE_ENV,
      mode: "supabase",
      fetchFn: fetchSpy as unknown as typeof fetch,
    });
    expect(out?.status).toBe("Connected and Verified");
    expect(out?.ok).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://api.openai.com/v1/models");
    expect(init.headers.Authorization).toBe(`Bearer ${FAKE_ENV.OPENAI_API_KEY}`);
    expect(out?.message).not.toContain(FAKE_ENV.OPENAI_API_KEY);
  });

  it("openai: 401 surfaces as Error", async () => {
    const out = await verifyIntegration("openai", {
      env: FAKE_ENV,
      mode: "supabase",
      fetchFn: fakeFetch(401) as unknown as typeof fetch,
    });
    expect(out?.status).toBe("Error");
    expect(out?.ok).toBe(false);
    expect(out?.attempted).toBe(true);
  });

  it("anthropic: sends x-api-key + anthropic-version headers", async () => {
    const fetchSpy = fakeFetch(200, { data: [] });
    const out = await verifyIntegration("anthropic", {
      env: FAKE_ENV,
      mode: "supabase",
      fetchFn: fetchSpy as unknown as typeof fetch,
    });
    expect(out?.status).toBe("Connected and Verified");
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://api.anthropic.com/v1/models");
    expect(init.headers["x-api-key"]).toBe(FAKE_ENV.ANTHROPIC_API_KEY);
    expect(init.headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("meta-model: verifies against api.meta.ai/v1/models and labels the docs provenance", async () => {
    const fetchSpy = fakeFetch(200, { data: [] });
    const out = await verifyIntegration("meta-model", {
      env: FAKE_ENV,
      mode: "supabase",
      fetchFn: fetchSpy as unknown as typeof fetch,
    });
    expect(out?.status).toBe("Connected and Verified");
    expect(out?.notes).toContain("secondary sources");
    const [url] = fetchSpy.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://api.meta.ai/v1/models");
  });

  it("resend: domains list success verifies; SDK error surfaces as Error", async () => {
    const ok = await verifyIntegration("resend", {
      env: FAKE_ENV,
      mode: "supabase",
      resendListDomains: async () => ({ error: null }),
    });
    expect(ok?.status).toBe("Connected and Verified");

    const bad = await verifyIntegration("resend", {
      env: FAKE_ENV,
      mode: "supabase",
      resendListDomains: async () => ({ error: "api_key_invalid: nope" }),
    });
    expect(bad?.status).toBe("Error");
    expect(bad?.attempted).toBe(true);
  });

  it("stripe: account retrieve verifies; a throw surfaces as Error", async () => {
    const ok = await verifyIntegration("stripe", {
      env: FAKE_ENV,
      mode: "supabase",
      stripeRetrieveAccount: async () => ({ id: "acct_fake123" }),
    });
    expect(ok?.status).toBe("Connected and Verified");
    expect(ok?.message).toContain("acct_fake123");

    const bad = await verifyIntegration("stripe", {
      env: FAKE_ENV,
      mode: "supabase",
      stripeRetrieveAccount: async () => {
        throw new Error("Invalid API Key provided");
      },
    });
    expect(bad?.status).toBe("Error");
  });

  it("supabase: health endpoint 200 verifies; 500 is an Error", async () => {
    const fetchSpy = fakeFetch(200);
    const ok = await verifyIntegration("supabase", {
      env: FAKE_ENV,
      mode: "supabase",
      fetchFn: fetchSpy as unknown as typeof fetch,
    });
    expect(ok?.status).toBe("Connected and Verified");
    const [url] = fetchSpy.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://abcdefgh.supabase.co/auth/v1/health");

    const bad = await verifyIntegration("supabase", {
      env: FAKE_ENV,
      mode: "supabase",
      fetchFn: fakeFetch(500) as unknown as typeof fetch,
    });
    expect(bad?.status).toBe("Error");
  });

  it("webhooks live: delivered test event verifies; failed delivery is an Error", async () => {
    const ok = await verifyIntegration("webhooks", {
      env: FAKE_ENV,
      mode: "supabase",
      webhookConfigured: true,
      dispatchTestEvent: async () => ({ status: "delivered" }),
    });
    expect(ok?.status).toBe("Connected and Verified");

    const bad = await verifyIntegration("webhooks", {
      env: FAKE_ENV,
      mode: "supabase",
      webhookConfigured: true,
      dispatchTestEvent: async () => ({ status: "failed" }),
    });
    expect(bad?.status).toBe("Error");
  });

  it("meta-pixel: instruction result only — no fetch, no fake verification", async () => {
    const fetchSpy = fakeFetch(200);
    const out = await verifyIntegration("meta-pixel", {
      env: FAKE_ENV,
      mode: "supabase",
      fetchFn: fetchSpy as unknown as typeof fetch,
    });
    expect(out?.status).toBe("Connected but Not Verified");
    expect(out?.attempted).toBe(false);
    expect(out?.message).toContain("Events Manager");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("static entries never pretend: linkedin / muse-ai / not-implemented", async () => {
    expect((await verifyIntegration("linkedin", { env: FAKE_ENV, mode: "supabase" }))?.status).toBe(
      "Configuration Required"
    );
    expect((await verifyIntegration("muse-ai", { env: FAKE_ENV, mode: "supabase" }))?.status).toBe(
      "Unsupported / No Documented API"
    );
    expect((await verifyIntegration("google-sheets", { env: FAKE_ENV, mode: "supabase" }))?.status).toBe(
      "Not Connected"
    );
  });

  it("unknown id returns null", async () => {
    expect(await verifyIntegration("nope", { env: FAKE_ENV, mode: "supabase" })).toBeNull();
  });
});

// ── Registry ↔ .env.example consistency ────────────────────────────────────

describe("registry consistency", () => {
  it("every env var named in the registry exists in .env.example", () => {
    const raw = readFileSync(path.resolve(process.cwd(), ".env.example"), "utf8");
    const defined = new Set<string>();
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z][A-Z0-9_]*)=/);
      if (m) defined.add(m[1]);
    }
    const missing: string[] = [];
    for (const descriptor of INTEGRATION_REGISTRY) {
      for (const v of descriptor.envVars) {
        if (!defined.has(v.name)) missing.push(`${descriptor.id}:${v.name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("registry ids are unique and cover the expected integrations", () => {
    const ids = INTEGRATION_REGISTRY.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [
      "supabase", "resend", "stripe", "openai", "anthropic", "meta-model",
      "muse-ai", "meta-pixel", "webhooks", "jobs", "linkedin",
      "google-sheets", "crm", "email-verification",
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("no descriptor marks a server-only secret as public", () => {
    for (const descriptor of INTEGRATION_REGISTRY) {
      for (const v of descriptor.envVars) {
        if (!v.name.startsWith("NEXT_PUBLIC_")) {
          // Non-public names may be either; but anything key/secret-ish
          // must be server-only.
          if (/KEY|SECRET|TOKEN/.test(v.name)) {
            expect(v.visibility, `${descriptor.id}:${v.name}`).toBe("server-only");
          }
        }
      }
    }
  });
});
