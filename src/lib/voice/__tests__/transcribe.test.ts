/**
 * Transcribe route honesty tests (P6 Stage C): the Whisper path must
 * never fake a transcript — demo → 503, no session → 401, no
 * OPENAI_API_KEY → 503 (other providers' keys do NOT enable Whisper),
 * and a configured key + provider success → a real transcript.
 */

import { describe, it, expect, vi } from "vitest";
import { handleTranscribeRequest } from "../transcribe";

const audioBlob = (type = "audio/webm", size = 2048) =>
  new Blob([new Uint8Array(size)], { type });

const USER = { id: "user_1" };

describe("handleTranscribeRequest", () => {
  it("demo mode → 503 demo state, nothing uploaded", async () => {
    const fetchFn = vi.fn();
    const out = await handleTranscribeRequest(
      { mode: "demo", user: null, fetchFn: fetchFn as never },
      { audio: audioBlob() }
    );
    expect(out.httpStatus).toBe(503);
    expect(out.body.status).toBe("demo");
    expect(out.body.transcript).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("live mode without a session → 401", async () => {
    const out = await handleTranscribeRequest(
      { mode: "supabase", user: null, env: { OPENAI_API_KEY: "sk-test" } },
      { audio: audioBlob() }
    );
    expect(out.httpStatus).toBe(401);
    expect(out.body.status).toBe("unauthenticated");
  });

  it("live mode without OPENAI_API_KEY → 503 not_configured (Anthropic key does not count)", async () => {
    const fetchFn = vi.fn();
    const out = await handleTranscribeRequest(
      {
        mode: "supabase",
        user: USER,
        env: { ANTHROPIC_API_KEY: "sk-ant-test" },
        fetchFn: fetchFn as never,
      },
      { audio: audioBlob() }
    );
    expect(out.httpStatus).toBe(503);
    expect(out.body.status).toBe("not_configured");
    expect(String(out.body.message)).toMatch(/OPENAI_API_KEY/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("configured key + Whisper success → transcript labelled with the engine", async () => {
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        "Bearer sk-test"
      );
      const fd = init?.body as FormData;
      expect(fd.get("model")).toBe("whisper-1");
      expect(fd.get("language")).toBe("bn"); // bn-BD → primary subtag
      return {
        ok: true,
        status: 200,
        json: async () => ({ text: "  হ্যালো, কেমন আছেন?  " }),
        text: async () => "",
      } as Response;
    });
    const out = await handleTranscribeRequest(
      {
        mode: "supabase",
        user: USER,
        env: { OPENAI_API_KEY: "sk-test" },
        fetchFn: fetchFn as never,
      },
      { audio: audioBlob(), filename: "note.webm", language: "bn-BD" }
    );
    expect(out.httpStatus).toBe(200);
    expect(out.body.status).toBe("ok");
    expect(out.body.engine).toBe("whisper");
    expect(out.body.transcript).toBe("হ্যালো, কেমন আছেন?");
  });

  it("rejects missing / non-audio / oversized input before any provider call", async () => {
    const fetchFn = vi.fn();
    const deps = {
      mode: "supabase" as const,
      user: USER,
      env: { OPENAI_API_KEY: "sk-test" },
      fetchFn: fetchFn as never,
    };
    const missing = await handleTranscribeRequest(deps, { audio: null });
    expect(missing.httpStatus).toBe(400);
    const wrongType = await handleTranscribeRequest(deps, {
      audio: audioBlob("image/png"),
    });
    expect(wrongType.httpStatus).toBe(400);
    const tooBig = await handleTranscribeRequest(deps, {
      audio: audioBlob("audio/webm", 11 * 1024 * 1024),
    });
    expect(tooBig.httpStatus).toBe(413);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("provider failure → 502 with no transcript", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({}),
      text: async () => "rate limited",
    }) as unknown as Response);
    const out = await handleTranscribeRequest(
      {
        mode: "supabase",
        user: USER,
        env: { OPENAI_API_KEY: "sk-test" },
        fetchFn: fetchFn as never,
      },
      { audio: audioBlob() }
    );
    expect(out.httpStatus).toBe(502);
    expect(out.body.status).toBe("error");
    expect(out.body.transcript).toBeNull();
  });
});
