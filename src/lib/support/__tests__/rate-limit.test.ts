import { describe, it, expect } from "vitest";
import { createRateLimiter } from "@/lib/admin/submissions-core";

/**
 * The support routes rate-limit with the shared createRateLimiter
 * factory (per-process, best-effort on serverless — the documented
 * house caveat). These tests pin the trip behaviour at the exact
 * limits the support routes configure.
 */
describe("support rate limits (shared factory, route limits)", () => {
  it("conversation creation: 5 per IP per 10 minutes, then trips", () => {
    const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 10 * 60 * 1000 });
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      expect(limiter.check("203.0.113.7", now)).toBe(true);
    }
    expect(limiter.check("203.0.113.7", now)).toBe(false);
    // A different IP is unaffected; the window resets after it passes.
    expect(limiter.check("203.0.113.8", now)).toBe(true);
    expect(limiter.check("203.0.113.7", now + 10 * 60 * 1000)).toBe(true);
  });

  it("message posting: 30 per conversation per 10 minutes, then trips", () => {
    const limiter = createRateLimiter({ maxAttempts: 30, windowMs: 10 * 60 * 1000 });
    const now = Date.now();
    for (let i = 0; i < 30; i++) {
      expect(limiter.check("conv-1", now)).toBe(true);
    }
    expect(limiter.check("conv-1", now)).toBe(false);
    expect(limiter.check("conv-2", now)).toBe(true);
  });

  it("escalation: 5 per conversation per hour, then trips", () => {
    const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 60 * 60 * 1000 });
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      expect(limiter.check("conv-1", now)).toBe(true);
    }
    expect(limiter.check("conv-1", now)).toBe(false);
  });
});
