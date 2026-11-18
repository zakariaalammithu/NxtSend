/**
 * Mocked tests only — no real network, no credentials.
 * global fetch is stubbed per test; ProviderHttpClient drives it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WHATSAPP_CONFIG } from "../config";
import { createWhatsappAdapter } from "../adapter";
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

describe("WhatsApp Business Platform adapter", () => {
  it("sends the default hello_world template via the Cloud API", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ messages: [{ id: "wamid.test123" }], contacts: [{ wa_id: "14155551234" }] }));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createWhatsappAdapter({
      credential: { accessToken: "EAATestToken" },
      settings: { phoneNumberId: "123456789012345", recipient: "14155551234" },
    });
    const result = await adapter.sendNotification({ type: "lead.created", leadName: "Ada Lovelace", leadCompany: "Analytical Engines Ltd" });
    expect(result.provider).toBe("whatsapp");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v21.0/123456789012345/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer EAATestToken");
    expect(String(init.body)).toContain("hello_world");
    expect(result.ok).toBe(true);
    expect(result.messageId).toBe("wamid.test123");
  });

  it("returns a failed delivery (not a throw) on a provider HTTP error", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ ok: false, error: "invalid_auth" }, 401));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createWhatsappAdapter({
      credential: { accessToken: "EAATestToken" },
      settings: { phoneNumberId: "123456789012345", recipient: "14155551234" },
    });
    const result = await adapter.sendNotification({ type: "lead.created", leadName: "Ada" });
    expect(result.ok).toBe(false);
    expect(result.error ?? "").toContain("401");
  });

  it("sends free-form text when mode is text (open 24h window only)", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ messages: [{ id: "wamid.text1" }] }));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createWhatsappAdapter({
      credential: { accessToken: "tok" },
      settings: { phoneNumberId: "1", recipient: "14155551234", mode: "text" },
    });
    const result = await adapter.sendNotification({ type: "lead.created", leadName: "Ada" });
    expect(result.ok).toBe(true);
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(init.body)).toContain('"type":"text"');
  });

  it("reports configuration_required when token, number id or recipient is missing", async () => {
    const adapter = createWhatsappAdapter({ credential: null, settings: {} });
    expect(adapter.checkConfiguration().configured).toBe(false);
    const result = await adapter.sendNotification({ type: "lead.created", leadName: "Ada" });
    expect(result.ok).toBe(false);
    expect(result.error ?? "").toContain("configuration_required");
  });

  it("config declares honest metadata", () => {
    expect(WHATSAPP_CONFIG.id).toBe("whatsapp");
    expect(WHATSAPP_CONFIG.authType).toBe("bearer_token");
    expect(WHATSAPP_CONFIG.capabilities.length).toBeGreaterThan(0);
    expect(WHATSAPP_CONFIG.setupSteps.length).toBeGreaterThan(0);
  });
});
