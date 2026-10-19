/**
 * Muse.ai readiness-pack tests.
 *
 * What is being protected: the manifest must stay a truthful,
 * pre-classified draft (every tool classified; sends classified
 * Sensitive write), the checklist must keep its sourcing, and the
 * adapter must keep REFUSING — an accidental "ok" here would mean the
 * codebase started claiming a Muse integration that does not exist.
 */

import { describe, it, expect } from "vitest";
import {
  NXTSEND_TOOL_MANIFEST,
  MUSE_READINESS_CHECKLIST,
  UnimplementedMuseConnectorAdapter,
  type MuseConnectorAdapter,
} from "../index";

describe("tool manifest", () => {
  it("is non-empty with unique tool names", () => {
    expect(NXTSEND_TOOL_MANIFEST.length).toBeGreaterThanOrEqual(10);
    const names = NXTSEND_TOOL_MANIFEST.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("classifies every tool with Meta's vocabulary", () => {
    for (const tool of NXTSEND_TOOL_MANIFEST) {
      expect(["Read", "Write", "Sensitive write"]).toContain(tool.classification);
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.sideEffects.length).toBeGreaterThan(0);
    }
  });

  it("contains at least one tool of each class", () => {
    const classes = new Set(NXTSEND_TOOL_MANIFEST.map((t) => t.classification));
    expect(classes).toEqual(new Set(["Read", "Write", "Sensitive write"]));
  });

  it("classifies sends as Sensitive write and lookups as Read (nothing hides a send in a read)", () => {
    const byName = new Map(NXTSEND_TOOL_MANIFEST.map((t) => [t.name, t.classification]));
    expect(byName.get("send_email")).toBe("Sensitive write");
    expect(byName.get("send_inbox_reply")).toBe("Sensitive write");
    expect(byName.get("delete_lead")).toBe("Sensitive write");
    expect(byName.get("list_leads")).toBe("Read");
    expect(byName.get("get_usage_summary")).toBe("Read");
    // The AI draft tool produces text only — a Write, never a send.
    expect(byName.get("draft_outreach_message")).toBe("Write");
  });
});

describe("readiness checklist", () => {
  it("covers the submission path end to end, each item sourced", () => {
    expect(MUSE_READINESS_CHECKLIST.length).toBeGreaterThanOrEqual(8);
    const ids = MUSE_READINESS_CHECKLIST.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of MUSE_READINESS_CHECKLIST) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.detail.length).toBeGreaterThan(20);
      expect(item.source.length).toBeGreaterThan(0);
    }
    expect(ids).toContain("live-surface");
    expect(ids).toContain("review");
    expect(ids).toContain("test-account");
  });
});

describe("adapter — deliberately unimplemented", () => {
  it("serves the manifest but refuses tool calls and health checks", async () => {
    const adapter: MuseConnectorAdapter = new UnimplementedMuseConnectorAdapter();
    expect(adapter.listTools()).toBe(NXTSEND_TOOL_MANIFEST);

    const call = await adapter.handleToolCall(
      "list_leads",
      {},
      { subject: "user-1", scopes: ["read"] }
    );
    expect(call.status).toBe("not_implemented");
    if (call.status === "not_implemented") {
      expect(call.reason).toContain("No Muse agent API exists");
    }

    const health = await adapter.healthCheck();
    expect(health.status).toBe("not_implemented");
  });
});
