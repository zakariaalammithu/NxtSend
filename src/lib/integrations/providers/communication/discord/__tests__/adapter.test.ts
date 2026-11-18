/**
 * Mocked tests only — no real network, no credentials.
 * global fetch is stubbed per test; ProviderHttpClient drives it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DISCORD_CONFIG } from "../config";
import { createDiscordAdapter, parseDiscordWebhook } from "../adapter";
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

describe("Discord adapter", () => {
  it("sends via the webhook URL with wait=true", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ id: "111222333444555666" }));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createDiscordAdapter({
      credential: { extra: { webhookUrl: "https://discord.com/api/webhooks/123456789012345678/AbCdEfGhIjKlMnOpQrStUvWx" } },
      settings: {},
    });
    const result = await adapter.sendNotification({ type: "lead.created", leadName: "Ada Lovelace", leadCompany: "Analytical Engines Ltd" });
    expect(result.provider).toBe("discord");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://discord.com/api/v10/webhooks/123456789012345678/AbCdEfGhIjKlMnOpQrStUvWx?wait=true");
    expect(String(init.body)).toContain("New lead");
    expect(result.ok).toBe(true);
    expect(result.messageId).toBe("111222333444555666");
  });

  it("returns a failed delivery (not a throw) on a provider HTTP error", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ ok: false, error: "invalid_auth" }, 401));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createDiscordAdapter({
      credential: { extra: { webhookUrl: "https://discord.com/api/webhooks/123456789012345678/AbCdEfGhIjKlMnOpQrStUvWx" } },
      settings: {},
    });
    const result = await adapter.sendNotification({ type: "lead.created", leadName: "Ada" });
    expect(result.ok).toBe(false);
    expect(result.error ?? "").toContain("401");
  });

  it("parses webhook URLs and rejects non-Discord URLs", async () => {
    expect(parseDiscordWebhook("https://discord.com/api/webhooks/123/abc")).toEqual({ id: "123", token: "abc" });
    expect(parseDiscordWebhook("https://example.com/hook")).toBeNull();
    const adapter = createDiscordAdapter({ credential: { extra: { webhookUrl: "https://example.com/hook" } }, settings: {} });
    expect(adapter.checkConfiguration().configured).toBe(false);
  });

  it("reports configuration_required when no webhook URL is stored", async () => {
    const adapter = createDiscordAdapter({ credential: null, settings: {} });
    const result = await adapter.sendNotification({ type: "lead.created", leadName: "Ada" });
    expect(result.ok).toBe(false);
    expect(result.error ?? "").toContain("configuration_required");
  });

  it("config declares honest metadata", () => {
    expect(DISCORD_CONFIG.id).toBe("discord");
    expect(DISCORD_CONFIG.authType).toBe("webhook");
    expect(DISCORD_CONFIG.capabilities.length).toBeGreaterThan(0);
    expect(DISCORD_CONFIG.setupSteps.length).toBeGreaterThan(0);
  });
});
