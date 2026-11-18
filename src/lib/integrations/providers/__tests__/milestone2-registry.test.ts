/**
 * Milestone 2 provider-registry tests (Wave 2, Phase 1).
 *
 * Covers: every category definition file is wired into
 * getProviderDefinition; ids are unique; the two providers defined
 * twice upstream (Snov.io, Monday.com) merge into one entry each
 * with both sides' capabilities; no definition claims a connection;
 * no LinkedIn-send capability is invented anywhere.
 * No network, no database.
 */

import { describe, it, expect } from "vitest";
import {
  PROVIDER_DEFINITIONS,
  getProviderDefinition,
  listProvidersByCategory,
} from "../registry";
import { CRM_PROVIDER_DEFINITIONS } from "../crm/definitions";
import { EMAIL_OUTREACH_PROVIDER_DEFINITIONS } from "../email-outreach/definitions";
import { ENRICHMENT_PROVIDER_DEFINITIONS } from "../enrichment/definitions";
import { VERIFICATION_PROVIDER_DEFINITIONS } from "../verification/definitions";
import { AUTOMATION_PROVIDER_DEFINITIONS } from "../automation/definitions";
import { COMMUNICATION_PROVIDER_DEFINITIONS } from "../communication/definitions";
import { PRODUCTIVITY_PROVIDER_DEFINITIONS } from "../productivity/definitions";
import { AI_MCP_CLIENT_DEFINITIONS } from "../ai/definitions";
import { CATEGORY_J_PROVIDER_DEFINITIONS } from "../category-j/definitions";

const EXPECTED_IDS = [
  "zapier", "n8n", "muse", "chatgpt", "claude",
  ...CRM_PROVIDER_DEFINITIONS.map((d) => d.id),
  ...EMAIL_OUTREACH_PROVIDER_DEFINITIONS.map((d) => d.id),
  ...ENRICHMENT_PROVIDER_DEFINITIONS.map((d) => d.id),
  ...VERIFICATION_PROVIDER_DEFINITIONS.map((d) => d.id),
  ...AUTOMATION_PROVIDER_DEFINITIONS.map((d) => d.id),
  ...COMMUNICATION_PROVIDER_DEFINITIONS.map((d) => d.id),
  ...PRODUCTIVITY_PROVIDER_DEFINITIONS.map((d) => d.id),
  ...AI_MCP_CLIENT_DEFINITIONS.map((d) => d.id),
  ...CATEGORY_J_PROVIDER_DEFINITIONS.map((d) => d.id),
];

describe("PROVIDER_DEFINITIONS (Milestone 2 wiring)", () => {
  it("contains every category definition exactly once per unique id", () => {
    const ids = PROVIDER_DEFINITIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids).size).toBe(new Set(EXPECTED_IDS).size);
    for (const id of Array.from(new Set(EXPECTED_IDS))) {
      expect(ids, `missing provider definition: ${id}`).toContain(id);
    }
  });

  it("has 69 definitions (5 live platforms + 61 Milestone 2 providers + 3 Category J providers)", () => {
    expect(PROVIDER_DEFINITIONS.length).toBe(69);
  });

  it("every definition resolves through getProviderDefinition", () => {
    for (const def of PROVIDER_DEFINITIONS) {
      expect(getProviderDefinition(def.id)).toBe(def);
    }
    expect(getProviderDefinition("does-not-exist")).toBeNull();
  });

  it("listProvidersByCategory covers every category", () => {
    for (const category of [
      "crm",
      "email_outreach",
      "automation",
      "enrichment",
      "email_verification",
      "ai",
      "communication",
      "productivity",
    ] as const) {
      const listed = listProvidersByCategory(category);
      expect(listed.length).toBeGreaterThan(0);
      expect(listed.every((d) => d.category === category)).toBe(true);
    }
    expect(listProvidersByCategory("crm").map((d) => d.id)).toContain("hubspot");
    expect(listProvidersByCategory("email_outreach").map((d) => d.id)).toContain("snov");
    expect(listProvidersByCategory("ai").map((d) => d.id)).toEqual(
      expect.arrayContaining(["muse", "chatgpt", "claude", "gemini", "cursor", "claude-code"])
    );
  });

  it("Snov.io merges outreach + enrichment capabilities into one entry", () => {
    const snov = getProviderDefinition("snov")!;
    expect(snov.category).toBe("email_outreach");
    expect(snov.authType).toBe("oauth2");
    const text = snov.capabilities.join("\n");
    expect(text).toContain("List campaigns (GET /v1/get-user-campaigns)");
    expect(text).toContain("Domain search (async task)");
    expect(text).toContain("Email finder by name + domain (async task)");
  });

  it("Monday.com merges CRM + productivity capabilities into one entry", () => {
    const monday = getProviderDefinition("monday")!;
    expect(monday.category).toBe("crm");
    expect(monday.authType).toBe("api_key");
    const text = monday.capabilities.join("\n");
    expect(text).toContain("Board items as leads");
    expect(text).toContain("Export leads to a monday.com board as items");
  });

  it("no definition claims a connection, and no LinkedIn send is offered", () => {
    for (const def of PROVIDER_DEFINITIONS) {
      for (const cap of def.capabilities) {
        expect(cap, `${def.id}: ${cap}`).not.toMatch(/\bconnected\b.*\bverified\b/i);
        if (/linkedin[- ]?(send|message|invite|dm)/i.test(cap)) {
          expect(cap).toMatch(/not supported/i);
        }
      }
    }
  });

  it("automation + AI definitions grant read/write only — no .send scope", () => {
    for (const def of PROVIDER_DEFINITIONS) {
      if (def.category !== "ai") continue;
      if (["muse", "chatgpt", "claude"].includes(def.id)) continue;
      expect(def.scopes?.some((s) => s.endsWith(".send"))).toBe(false);
    }
    for (const def of AUTOMATION_PROVIDER_DEFINITIONS) {
      expect(def.scopes).toEqual([`${def.id}.read`, `${def.id}.write`]);
    }
  });
});
