/**
 * Zapier System Health check tests.
 *
 * getSystemHealth is integration-shaped (it reads env + the demo
 * stores), so these tests drive it in Demo Mode only: the Zapier
 * check must exist there, must be a warning (the surface is
 * unavailable in demo), and must never claim a connection. Live-mode
 * branches (enabled/disabled/no-URL/grant counts) mirror the
 * Muse/ChatGPT/Claude checks line-for-line and are covered by the
 * status-derivation tests in the Integration Center suite, which
 * exercise the same rule (grant-only "Connected") without a live
 * database.
 */

import { describe, it, expect } from "vitest";
import { getSystemHealth } from "../platform-server";
import { ADMIN_NAV_GROUPS } from "../nav";

describe("admin nav — zapier page is reachable", () => {
  it("lists the Zapier Integration admin page under Integrations", () => {
    const integrations = ADMIN_NAV_GROUPS.find((g) => g.label === "Integrations");
    expect(integrations).toBeDefined();
    expect(
      integrations?.items.some(
        (i) => i.label === "Zapier Integration" && i.href === "/admin/integrations/zapier"
      )
    ).toBe(true);
  });
});

describe("getSystemHealth — zapier check", () => {
  it("demo mode: a zapier check exists, warns, and never claims a connection", async () => {
    const summary = await getSystemHealth("demo");
    const check = summary.checks.find((c) => c.id === "zapier");
    expect(check).toBeDefined();
    expect(check?.label).toBe("Zapier connector (REST API + OAuth)");
    expect(check?.status).toBe("warning");
    expect(check?.required).toBe(false);
    expect(check?.message).toContain("Demo Mode");
    expect(check?.message).not.toMatch(/connected/i);
  });

  it("demo mode: the zapier check sits alongside the muse/chatgpt/claude checks", async () => {
    const summary = await getSystemHealth("demo");
    const ids = summary.checks.map((c) => c.id);
    for (const id of ["muse-mcp", "chatgpt-mcp", "claude-mcp", "zapier"]) {
      expect(ids).toContain(id);
    }
  });
});
