/**
 * Mocked tests only — no real network, no credentials.
 * global fetch is stubbed per test; ProviderHttpClient drives it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TEAMS_CONFIG } from "../config";
import { createTeamsAdapter } from "../adapter";
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Microsoft Teams adapter", () => {
  it("sends via the Workflows webhook URL", async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createTeamsAdapter({
      credential: { extra: { webhookUrl: "https://example.webhook.office.com/webhookb2/abc" } },
      settings: {},
    });
    const result = await adapter.sendNotification({ type: "lead.created", leadName: "Ada Lovelace", leadCompany: "Analytical Engines Ltd" });
    expect(result.provider).toBe("teams");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.webhook.office.com/webhookb2/abc");
    expect(String(init.body)).toContain("New lead");
    expect(result.ok).toBe(true);
  });

  it("returns a failed delivery (not a throw) on a provider HTTP error", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ ok: false, error: "invalid_auth" }, 401));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createTeamsAdapter({
      credential: { extra: { webhookUrl: "https://example.webhook.office.com/webhookb2/abc" } },
      settings: {},
    });
    const result = await adapter.sendNotification({ type: "lead.created", leadName: "Ada" });
    expect(result.ok).toBe(false);
    expect(result.error ?? "").toContain("401");
  });

  it("reports configuration_required when no webhook URL is stored", async () => {
    const adapter = createTeamsAdapter({ credential: null, settings: {} });
    expect(adapter.checkConfiguration().configured).toBe(false);
    const result = await adapter.sendNotification({ type: "lead.created", leadName: "Ada" });
    expect(result.ok).toBe(false);
    expect(result.error ?? "").toContain("configuration_required");
  });

  it("config declares honest metadata", () => {
    expect(TEAMS_CONFIG.id).toBe("teams");
    expect(TEAMS_CONFIG.authType).toBe("webhook");
    expect(TEAMS_CONFIG.capabilities.length).toBeGreaterThan(0);
    expect(TEAMS_CONFIG.setupSteps.length).toBeGreaterThan(0);
  });
});
