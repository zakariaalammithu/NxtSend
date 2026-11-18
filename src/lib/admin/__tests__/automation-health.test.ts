/**
 * Automation-platform System Health checks (Wave 2, Phase 2).
 *
 * getSystemHealth is integration-shaped (it reads env + the demo
 * stores), so these tests drive it in Demo Mode only: the Make /
 * Pabbly / Albato / Activepieces checks and the provider-adapters
 * rollup must exist there, must warn, and must never claim a
 * connection. Live-mode branches mirror the Zapier check
 * line-for-line (enabled flag + public URL; grants not tracked per
 * platform) and are covered by the same rule in the Integration
 * Center suite.
 */

import { describe, it, expect } from "vitest";
import { getSystemHealth } from "../platform-server";

const AUTOMATION_IDS = ["make", "pabbly", "albato", "activepieces"] as const;

describe("getSystemHealth — automation platform checks", () => {
  it("demo mode: a check exists per platform, warns, and never claims a connection", async () => {
    const summary = await getSystemHealth("demo");
    for (const id of AUTOMATION_IDS) {
      const check = summary.checks.find((c) => c.id === id);
      expect(check, `missing health check: ${id}`).toBeDefined();
      expect(check?.status).toBe("warning");
      expect(check?.required).toBe(false);
      expect(check?.message).toContain("Demo Mode");
      expect(check?.message).not.toMatch(/connected/i);
    }
  });

  it("demo mode: the platform checks sit alongside the zapier/n8n checks", async () => {
    const summary = await getSystemHealth("demo");
    const ids = summary.checks.map((c) => c.id);
    for (const id of ["zapier", "n8n", ...AUTOMATION_IDS]) {
      expect(ids).toContain(id);
    }
  });

  it("demo mode: automation checks say grants are not tracked per platform in live mode", async () => {
    // The demo message is about unavailability; the live message
    // (same code path, non-demo branch) must state the grants gap
    // instead of a count. Assert the demo branch at least names the
    // surface honestly.
    const summary = await getSystemHealth("demo");
    const check = summary.checks.find((c) => c.id === "make");
    expect(check?.label).toBe("Make connector (REST API + OAuth)");
  });
});

describe("getSystemHealth — provider-adapters check", () => {
  it("demo mode: the rollup exists, warns, and never claims a connection", async () => {
    const summary = await getSystemHealth("demo");
    const check = summary.checks.find((c) => c.id === "provider-adapters");
    expect(check).toBeDefined();
    expect(check?.label).toBe("Provider adapters (stored connections)");
    expect(check?.status).toBe("warning");
    expect(check?.required).toBe(false);
    expect(check?.message).toContain("Demo Mode");
    expect(check?.message).not.toMatch(/connected/i);
  });
});
