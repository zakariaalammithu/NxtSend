/**
 * ProviderHttpClient tests — mocked fetch only, no real network.
 *
 * Covers: timeout (AbortController), retry on 429 then success,
 * no retry on 400, retry exhaustion on 503, and secret redaction
 * in error messages.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ProviderHttpClient,
  isProviderError,
  toProviderError,
} from "../client";

const BASE = "https://api.example.com/v1";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeClient(
  fetchSpy: ReturnType<typeof vi.fn>,
  opts: { timeoutMs?: number; retryDelayMs?: number } = {}
): ProviderHttpClient {
  vi.stubGlobal("fetch", fetchSpy);
  return new ProviderHttpClient({
    baseUrl: BASE,
    getAuthHeaders: () => ({ Authorization: "Bearer SECRET_VALUE_123" }),
    timeoutMs: opts.timeoutMs,
    retryDelayMs: opts.retryDelayMs ?? 0,
  });
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ProviderHttpClient — success", () => {
  it("parses a JSON response and sends auth headers", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ ok: true }));
    const client = makeClient(fetchSpy);
    const result = await client.request<{ ok: boolean }>({ method: "GET", path: "/leads" });
    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calls = fetchSpy.mock.calls as unknown as Array<[string, RequestInit]>;
    const [, init] = calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer SECRET_VALUE_123"
    );
    expect(calls[0][0]).toBe("https://api.example.com/v1/leads");
  });

  it("returns undefined for a 204 with no body", async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    const client = makeClient(fetchSpy);
    await expect(
      client.request<void>({ method: "DELETE", path: "/leads/1" })
    ).resolves.toBeUndefined();
  });
});

describe("ProviderHttpClient — timeout", () => {
  it("aborts after timeoutMs and throws provider_timeout (no retry)", async () => {
    const fetchSpy = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<never>((_resolve, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          if (signal) {
            signal.addEventListener("abort", () => {
              const err = new Error("The operation was aborted.");
              err.name = "AbortError";
              reject(err);
            });
          }
        })
    );
    const client = makeClient(fetchSpy, { timeoutMs: 10 });
    await expect(
      client.request({ method: "GET", path: "/slow" })
    ).rejects.toMatchObject({ code: "provider_timeout", status: 408, retryable: false });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("ProviderHttpClient — retries", () => {
  it("retries on 429, then succeeds", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = makeClient(fetchSpy);
    const result = await client.request<{ ok: boolean }>({ method: "GET", path: "/leads" });
    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 400", async () => {
    const fetchSpy = vi.fn(async () => new Response("bad request", { status: 400 }));
    const client = makeClient(fetchSpy);
    await expect(
      client.request({ method: "GET", path: "/leads" })
    ).rejects.toMatchObject({ code: "provider_http_400", status: 400, retryable: false });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("gives up after 3 attempts on 503", async () => {
    const fetchSpy = vi.fn(async () => new Response("unavailable", { status: 503 }));
    const client = makeClient(fetchSpy);
    await expect(
      client.request({ method: "GET", path: "/leads" })
    ).rejects.toMatchObject({ code: "provider_http_503", status: 503, retryable: true });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});

describe("ProviderHttpClient — secret redaction", () => {
  it("never includes an auth-header value in an error message", async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          `{"error":"bad token Bearer SECRET_VALUE_123 rejected"}`,
          { status: 400, headers: { "content-type": "application/json" } }
        )
    );
    const client = makeClient(fetchSpy);
    let caught: unknown;
    try {
      await client.request({ method: "GET", path: "/leads" });
    } catch (err) {
      caught = err;
    }
    expect(isProviderError(caught)).toBe(true);
    expect((caught as Error).message).not.toContain("SECRET_VALUE_123");
    expect((caught as Error).message).toContain("[redacted]");
  });

  it("redacts generic Bearer tokens in provider error bodies", async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response("upstream said: Bearer abcDEF123456", { status: 502 })
    );
    const client = makeClient(fetchSpy);
    await expect(client.request({ method: "GET", path: "/x" })).rejects.toThrow(
      /Bearer \[redacted\]/
    );
  });
});

describe("isProviderError / toProviderError", () => {
  it("recognises a ProviderError and passes it through unchanged", () => {
    const err = toProviderError(new Error("network down"));
    expect(isProviderError(err)).toBe(true);
    expect(err.code).toBe("provider_network");
    expect(toProviderError(err)).toBe(err);
    expect(isProviderError(new Error("plain"))).toBe(false);
    expect(isProviderError(null)).toBe(false);
  });
});
