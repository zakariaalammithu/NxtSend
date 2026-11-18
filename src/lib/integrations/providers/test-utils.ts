/**
 * Shared test helpers for provider adapters — mocked fetch only,
 * never real network. Every mock payload in provider tests is
 * labelled as a mock and must never be presented as real provider
 * data.
 */

import { vi } from "vitest";
import type { UsageRecorder } from "./usage";

/** Builds a JSON Response the way the providers return one. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Stubs global fetch with a queue of responses. Each entry is
 * either a Response (returned in call order) or an Error (thrown).
 * Returns the spy so tests can assert on the requests made.
 */
export function mockFetchQueue(
  responses: Array<Response | Error>
): ReturnType<typeof vi.fn> {
  const queue = [...responses];
  const spy = vi.fn(async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error("mock fetch queue exhausted");
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** The [url, init] pairs a fetch spy was called with. */
export function fetchCalls(
  spy: ReturnType<typeof vi.fn>
): Array<[string, RequestInit]> {
  return spy.mock.calls as unknown as Array<[string, RequestInit]>;
}

/** First request URL the spy saw, or null. */
export function firstRequestUrl(spy: ReturnType<typeof vi.fn>): string | null {
  const calls = fetchCalls(spy);
  return calls.length > 0 ? calls[0][0] : null;
}

/** Usage recorder that collects every (event, credits) call for assertions. */
export function createUsageSpy(): {
  calls: Array<{ event: string; creditsUsed: number }>;
  recorder: UsageRecorder;
} {
  const calls: Array<{ event: string; creditsUsed: number }> = [];
  const recorder: UsageRecorder = async (event, creditsUsed) => {
    calls.push({ event, creditsUsed });
  };
  return { calls, recorder };
}

/** A sleep that resolves immediately — keeps polling adapters fast in tests. */
export function instantSleep(): Promise<void> {
  return Promise.resolve();
}
