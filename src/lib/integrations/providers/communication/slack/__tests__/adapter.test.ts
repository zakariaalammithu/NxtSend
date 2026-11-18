/**
 * Mocked tests only — no real network, no credentials.
 * global fetch is stubbed per test; ProviderHttpClient drives it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SLACK_CONFIG } from "../config";
import { createSlackAdapter } from "../adapter";
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain" } });
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Slack adapter", () => {
  it("sends via chat.postMessage with the bot token", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ ok: true, ts: "1234567890.123456" }));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createSlackAdapter({
      credential: { accessToken: "xoxb-test-token" },
      settings: { channelId: "C12345678" },
    });
    const result = await adapter.sendNotification({ type: "lead.created", leadName: "Ada Lovelace", leadCompany: "Analytical Engines Ltd" });
    expect(result.provider).toBe("slack");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer xoxb-test-token");
    expect(String(init.body)).toContain("New lead");
    expect(result.ok).toBe(true);
    expect(result.messageId).toBe("1234567890.123456");
  });

  it("returns a failed delivery (not a throw) on a provider HTTP error", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ ok: false, error: "invalid_auth" }, 401));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createSlackAdapter({
      credential: { accessToken: "xoxb-test-token" },
      settings: { channelId: "C12345678" },
    });
    const result = await adapter.sendNotification({ type: "lead.created", leadName: "Ada" });
    expect(result.ok).toBe(false);
    expect(result.error ?? "").toContain("401");
  });

  it("sends via the incoming webhook when a webhook URL is stored", async () => {
    const fetchSpy = vi.fn(async () => textResponse("ok"));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createSlackAdapter({
      credential: { extra: { webhookUrl: "https://hooks.slack.com/services/T000/B000/XXXX" } },
      settings: {},
    });
    const result = await adapter.sendNotification({ type: "lead.created", leadName: "Ada Lovelace" });
    expect(result.ok).toBe(true);
    const [url] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hooks.slack.com/services/T000/B000/XXXX");
  });

  it("reports configuration_required when neither webhook nor token is stored", async () => {
    const adapter = createSlackAdapter({ credential: null, settings: {} });
    expect(adapter.checkConfiguration().configured).toBe(false);
    const result = await adapter.sendNotification({ type: "lead.created", leadName: "Ada" });
    expect(result.ok).toBe(false);
    expect(result.error ?? "").toContain("configuration_required");
  });

  it("config declares honest metadata", () => {
    expect(SLACK_CONFIG.id).toBe("slack");
    expect(SLACK_CONFIG.authType).toBe("oauth2");
    expect(SLACK_CONFIG.capabilities.length).toBeGreaterThan(0);
    expect(SLACK_CONFIG.setupSteps.length).toBeGreaterThan(0);
  });
});
