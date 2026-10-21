/**
 * Translation honesty tests (P6 Stage C): demo → simulated with the
 * text UNCHANGED (never an invented translation); no key →
 * not_configured; a configured provider returns a real translation
 * via the same provider stack as drafts; the route handler enforces
 * session + input guards like /api/ai/draft.
 */

import { describe, it, expect, vi } from "vitest";
import { handleTranslateRequest, translateText } from "../translate";

describe("translateText", () => {
  it("demo → simulated, no provider call, no translated text", async () => {
    const fetchFn = vi.fn();
    const result = await translateText(
      { text: "Hello Sarah", targetLanguage: "bn-BD" },
      { mode: "demo", fetchFn: fetchFn as never }
    );
    expect(result.status).toBe("simulated");
    expect(result.translatedText).toBeNull();
    expect(result.aiGenerated).toBe(false);
    expect(result.message).toMatch(/simulated/i);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("live with no AI key → not_configured", async () => {
    const result = await translateText(
      { text: "Hello", targetLanguage: "fr-FR" },
      { mode: "supabase", env: {} }
    );
    expect(result.status).toBe("not_configured");
    expect(result.translatedText).toBeNull();
  });

  it("live with OpenAI → real translation through chat completions", async () => {
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
      const body = JSON.parse(String(init?.body));
      expect(body.messages[1].content).toContain("Bengali (Bangladesh)");
      expect(body.messages[1].content).toContain("Hello {first_name}");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "হ্যালো {first_name}" } }],
        }),
        text: async () => "",
      } as Response;
    });
    const result = await translateText(
      { text: "Hello {first_name}", targetLanguage: "bn-BD", sourceLanguage: "en-US" },
      { mode: "supabase", env: { OPENAI_API_KEY: "sk-test" }, fetchFn: fetchFn as never }
    );
    expect(result.status).toBe("ok");
    expect(result.provider).toBe("openai");
    expect(result.translatedText).toBe("হ্যালো {first_name}");
    expect(result.aiGenerated).toBe(true);
  });

  it("provider HTTP failure → error, nothing translated", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => "boom",
    }) as unknown as Response);
    const result = await translateText(
      { text: "Hello", targetLanguage: "de-DE" },
      { mode: "supabase", env: { OPENAI_API_KEY: "sk-test" }, fetchFn: fetchFn as never }
    );
    expect(result.status).toBe("error");
    expect(result.translatedText).toBeNull();
  });
});

describe("handleTranslateRequest", () => {
  it("live without a session → 401; suspended → 403", async () => {
    const noUser = await handleTranslateRequest({
      mode: "supabase",
      user: null,
      body: { text: "Hi", targetLanguage: "fr-FR" },
    });
    expect(noUser.httpStatus).toBe(401);
    const suspended = await handleTranslateRequest({
      mode: "supabase",
      user: { id: "u1", status: "suspended" },
      body: { text: "Hi", targetLanguage: "fr-FR" },
    });
    expect(suspended.httpStatus).toBe(403);
  });

  it("empty text / missing target → 400", async () => {
    const empty = await handleTranslateRequest({
      mode: "demo",
      user: null,
      body: { text: "  ", targetLanguage: "fr-FR" },
    });
    expect(empty.httpStatus).toBe(400);
    const noTarget = await handleTranslateRequest({
      mode: "demo",
      user: null,
      body: { text: "Hi" },
    });
    expect(noTarget.httpStatus).toBe(400);
  });

  it("demo request → 200 with simulated status in the body", async () => {
    const out = await handleTranslateRequest({
      mode: "demo",
      user: null,
      body: { text: "Hello", targetLanguage: "es-ES" },
    });
    expect(out.httpStatus).toBe(200);
    expect(out.body.status).toBe("simulated");
    expect(out.body.translatedText).toBeNull();
  });
});
