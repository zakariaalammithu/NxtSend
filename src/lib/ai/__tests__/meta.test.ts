/**
 * Meta Model API adapter + AI provider-selection tests.
 *
 * All provider traffic is a fake fetch — no real call is possible.
 * The adapter contract mirrors OpenAI/Anthropic: no key -> no fetch,
 * key travels server-side in the Bearer header, drafts require review.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MetaModelAdapter, META_MODEL_API_BASE } from "../meta";
import { getAIState } from "../state";
import { draftOutreachMessage } from "../index";
import type { DraftRequest } from "../types";

const FAKE_KEY = "fake-meta-model-key-123";
const INPUT: DraftRequest = {
  channel: "linkedin",
  stepType: "connection_request",
  campaignName: "Q4 Outreach",
  lead: { firstName: "Sarah", company: "Acme", jobTitle: "VP Sales" },
};

const MANAGED_KEYS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "MODEL_API_KEY", "META_MODEL"];
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const k of MANAGED_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of MANAGED_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllGlobals();
});

function completionFetch(content: string) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => "",
  }));
}

describe("getAIState — Meta joins provider selection honestly", () => {
  it("selects meta when only MODEL_API_KEY is configured", () => {
    const state = getAIState({ MODEL_API_KEY: FAKE_KEY }, "supabase");
    expect(state).toEqual({ state: "connected", provider: "meta" });
  });

  it("keeps the documented order: OpenAI, then Anthropic, then Meta", () => {
    expect(
      getAIState({ OPENAI_API_KEY: "k1", ANTHROPIC_API_KEY: "k2", MODEL_API_KEY: "k3" }, "supabase").provider
    ).toBe("openai");
    expect(
      getAIState({ ANTHROPIC_API_KEY: "k2", MODEL_API_KEY: "k3" }, "supabase").provider
    ).toBe("anthropic");
  });

  it("a placeholder MODEL_API_KEY does not activate the provider", () => {
    const state = getAIState({ MODEL_API_KEY: "your_meta_model_api_key" }, "supabase");
    expect(state).toEqual({ state: "not_connected", provider: null });
  });

  it("demo mode still wins over any key", () => {
    expect(getAIState({ MODEL_API_KEY: FAKE_KEY }, "demo")).toEqual({
      state: "demo",
      provider: null,
    });
  });
});

describe("MetaModelAdapter", () => {
  it("reports not_connected without a key and never calls fetch", async () => {
    const fetchSpy = completionFetch("draft");
    const adapter = new MetaModelAdapter(fetchSpy as unknown as typeof fetch);
    expect(adapter.getState()).toBe("not_connected");
    const result = await adapter.draftOutreach(INPUT);
    expect(result.status).toBe("not_configured");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("drafts via the OpenAI-compatible chat completions shape at api.meta.ai/v1", async () => {
    process.env.MODEL_API_KEY = FAKE_KEY;
    const fetchSpy = completionFetch("Hi Sarah — noticed Acme is hiring AEs.");
    const adapter = new MetaModelAdapter(fetchSpy as unknown as typeof fetch);
    expect(adapter.getState()).toBe("connected");

    const result = await adapter.draftOutreach(INPUT);
    expect(result.status).toBe("ok");
    expect(result.provider).toBe("meta");
    expect(result.aiGenerated).toBe(true);
    if (result.status === "ok") {
      expect(result.draft).toContain("Hi Sarah");
      expect(result.message).toContain("Review and edit");
    }

    const [url, init] = fetchSpy.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe(`${META_MODEL_API_BASE}/chat/completions`);
    expect(init.headers.Authorization).toBe(`Bearer ${FAKE_KEY}`);
    const body = JSON.parse(init.body) as { model: string };
    expect(body.model).toBe("muse-spark-1.3");
  });

  it("maps an HTTP error to an honest error result (no draft)", async () => {
    process.env.MODEL_API_KEY = FAKE_KEY;
    const fetchSpy = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => "unauthorized",
    }));
    const adapter = new MetaModelAdapter(fetchSpy as unknown as typeof fetch);
    const result = await adapter.draftOutreach(INPUT);
    expect(result.status).toBe("error");
    expect(result.provider).toBe("meta");
    expect(result.draft).toBeNull();
  });

  it("draftOutreachMessage routes to Meta when it is the only configured provider", async () => {
    process.env.MODEL_API_KEY = FAKE_KEY;
    // Live mode requires Supabase env for getDataMode; set plausible values.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefgh.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fake-anon-key-123";
    const fetchSpy = completionFetch("Meta-generated draft text");
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const result = await draftOutreachMessage(INPUT);
      expect(result.status).toBe("ok");
      expect(result.provider).toBe("meta");
    } finally {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    }
  });
});
