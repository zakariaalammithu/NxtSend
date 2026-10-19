import { describe, it, expect, vi, afterEach } from "vitest";
import { getAIState } from "../state";
import { handleDraftRequest, parseDraftRequest } from "../handler";
import { OpenAIAdapter } from "../openai";
import { AnthropicAdapter } from "../anthropic";
import { demoDraft } from "../demo";
import { renderTemplate } from "../prompt";
import type { DraftResult } from "../types";

// ── State derivation ────────────────────────────────────────────────────────

describe("getAIState", () => {
  it("is demo in demo data mode regardless of keys", () => {
    expect(getAIState({ OPENAI_API_KEY: "sk-x" }, "demo")).toEqual({
      state: "demo",
      provider: null,
    });
  });
  it("prefers OpenAI when both keys exist", () => {
    expect(
      getAIState({ OPENAI_API_KEY: "sk-real", ANTHROPIC_API_KEY: "sk-ant-real" }, "supabase")
    ).toEqual({ state: "connected", provider: "openai" });
  });
  it("selects Anthropic when only its key exists", () => {
    expect(getAIState({ ANTHROPIC_API_KEY: "sk-ant-real" }, "supabase")).toEqual({
      state: "connected",
      provider: "anthropic",
    });
  });
  it("is not_connected with no keys or only placeholders", () => {
    expect(getAIState({}, "supabase")).toEqual({ state: "not_connected", provider: null });
    expect(getAIState({ OPENAI_API_KEY: "sk_your_openai_api_key" }, "supabase")).toEqual({
      state: "not_connected",
      provider: null,
    });
  });
});

// ── Route guard behaviour ───────────────────────────────────────────────────

describe("handleDraftRequest guard", () => {
  it("returns 401 in live mode without a session", async () => {
    const result = await handleDraftRequest({
      mode: "supabase",
      user: null,
      body: { stepType: "email" },
    });
    expect(result.status).toBe(401);
  });

  it("returns 403 for a suspended account", async () => {
    const result = await handleDraftRequest({
      mode: "supabase",
      user: { id: "u1", status: "suspended" },
      body: { stepType: "email" },
    });
    expect(result.status).toBe(403);
  });

  it("returns 400 when stepType is missing", async () => {
    const result = await handleDraftRequest({
      mode: "demo",
      user: null,
      body: {},
    });
    expect(result.status).toBe(400);
  });

  it("in demo mode returns a clearly labelled simulated draft without a session", async () => {
    const result = await handleDraftRequest({
      mode: "demo",
      user: null,
      body: { stepType: "connection_request", lead: { firstName: "Sam" } },
    });
    expect(result.status).toBe(200);
    expect(result.body.state).toBe("demo");
    expect(result.body.aiGenerated).toBe(false);
    expect(result.body.reviewRequired).toBe(true);
    expect(String(result.body.draft)).toContain("Sam");
  });

  it("surfaces the honest not_configured state for a signed-in user without keys", async () => {
    const notConfigured: DraftResult = {
      status: "not_configured",
      provider: null,
      draft: null,
      aiGenerated: false,
      message: "AI not configured",
    };
    const result = await handleDraftRequest({
      mode: "supabase",
      user: { id: "u1", status: "active" },
      body: { stepType: "email" },
      draftFn: async () => notConfigured,
    });
    expect(result.status).toBe(200);
    expect(result.body.state).toBe("not_configured");
    expect(result.body.draft).toBeNull();
  });
});

describe("parseDraftRequest", () => {
  it("derives the channel from the step type", () => {
    expect(parseDraftRequest({ stepType: "email" })?.channel).toBe("email");
    expect(parseDraftRequest({ stepType: "linkedin_message" })?.channel).toBe("linkedin");
  });
  it("caps oversized fields", () => {
    const parsed = parseDraftRequest({
      stepType: "email",
      existingContent: "x".repeat(10_000),
    });
    expect(parsed?.existingContent?.length).toBe(4000);
  });
});

// ── Provider adapters (fetch injected — no real network) ────────────────────

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("OpenAIAdapter", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns not_configured without a key and never calls fetch", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchFn = vi.fn();
    const adapter = new OpenAIAdapter(fetchFn as never);
    const result = await adapter.draftOutreach({ channel: "email", stepType: "email" });
    expect(result.status).toBe("not_configured");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns the completion as a review-required draft", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-real-test-key");
    const fetchFn = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: "Hi {{first_name}}, quick note…" } }] })
    );
    const adapter = new OpenAIAdapter(fetchFn as never);
    const result = await adapter.draftOutreach({ channel: "linkedin", stepType: "linkedin_message" });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.aiGenerated).toBe(true);
      expect(result.draft).toContain("{{first_name}}");
    }
    // Key travels in the Authorization header, server-side only.
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-real-test-key"
    );
  });

  it("maps an HTTP error to an honest error state", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-real-test-key");
    const fetchFn = vi.fn(async () => jsonResponse({ error: "nope" }, false, 401));
    const adapter = new OpenAIAdapter(fetchFn as never);
    const result = await adapter.draftOutreach({ channel: "email", stepType: "email" });
    expect(result.status).toBe("error");
  });
});

describe("AnthropicAdapter", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("parses text blocks from the Messages API shape", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-real-test");
    const fetchFn = vi.fn(async () =>
      jsonResponse({ content: [{ type: "text", text: "Hello {{first_name}}!" }] })
    );
    const adapter = new AnthropicAdapter(fetchFn as never);
    const result = await adapter.draftOutreach({ channel: "email", stepType: "email" });
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.draft).toBe("Hello {{first_name}}!");
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk-ant-real-test");
  });
});

// ── Demo drafter + template rendering ───────────────────────────────────────

describe("demoDraft / renderTemplate", () => {
  it("labels the demo draft as simulated, never as AI output", () => {
    const result = demoDraft({ channel: "email", stepType: "email" });
    expect(result.status).toBe("simulated");
    expect(result.aiGenerated).toBe(false);
    expect(result.message).toContain("NOT AI-generated");
  });

  it("renders placeholders with sample lead values", () => {
    expect(
      renderTemplate("Hi {{first_name}} at {{company}}", {
        firstName: "Jo",
        company: "Acme",
      })
    ).toBe("Hi Jo at Acme");
  });
});
