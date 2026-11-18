/**
 * Mocked tests only — no real network, no credentials.
 * global fetch is stubbed per test; ProviderHttpClient drives it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TELEGRAM_CONFIG } from "../config";
import { createTelegramAdapter } from "../adapter";
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

describe("Telegram Bot adapter", () => {
  it("sends via sendMessage with the bot token in the path", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ ok: true, result: { message_id: 42 } }));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createTelegramAdapter({
      credential: { accessToken: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" },
      settings: { chatId: "987654321" },
    });
    const result = await adapter.sendNotification({ type: "lead.created", leadName: "Ada Lovelace", leadCompany: "Analytical Engines Ltd" });
    expect(result.provider).toBe("telegram");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11/sendMessage");
    expect(String(init.body)).toContain("987654321");
    expect(String(init.body)).toContain("New lead");
    expect(result.ok).toBe(true);
    expect(result.messageId).toBe("42");
  });

  it("returns a failed delivery (not a throw) on a provider HTTP error", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ ok: false, error: "invalid_auth" }, 401));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createTelegramAdapter({
      credential: { accessToken: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" },
      settings: { chatId: "987654321" },
    });
    const result = await adapter.sendNotification({ type: "lead.created", leadName: "Ada" });
    expect(result.ok).toBe(false);
    expect(result.error ?? "").toContain("401");
  });

  it("returns a failed delivery when Telegram reports ok:false", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ ok: false, description: "Forbidden: bot was blocked by the user" }));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createTelegramAdapter({ credential: { accessToken: "tok" }, settings: { chatId: "1" } });
    const result = await adapter.sendNotification({ type: "lead.created", leadName: "Ada" });
    expect(result.ok).toBe(false);
    expect(result.error ?? "").toContain("bot was blocked");
  });

  it("reports configuration_required when the token or chat id is missing", async () => {
    const adapter = createTelegramAdapter({ credential: null, settings: {} });
    expect(adapter.checkConfiguration().configured).toBe(false);
    const result = await adapter.sendNotification({ type: "lead.created", leadName: "Ada" });
    expect(result.ok).toBe(false);
    expect(result.error ?? "").toContain("configuration_required");
  });

  it("config declares honest metadata", () => {
    expect(TELEGRAM_CONFIG.id).toBe("telegram");
    expect(TELEGRAM_CONFIG.authType).toBe("bearer_token");
    expect(TELEGRAM_CONFIG.capabilities.length).toBeGreaterThan(0);
    expect(TELEGRAM_CONFIG.setupSteps.length).toBeGreaterThan(0);
  });
});
