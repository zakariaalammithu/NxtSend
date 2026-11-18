/**
 * Milestone 2 marketplace registry tests (Wave 2, Phase 1).
 *
 * Covers: every Milestone 2 provider definition has a Center
 * registry entry (one per provider, plus the updated Google Sheets
 * entry); provider-blocked entries are kind "info" with the reason;
 * no new entry claims a connection or a verification call; the
 * displayStatusMessage rewrite only rewrites the exact
 * "Unknown integration." string; new ids derive "Not Connected"
 * from the status service (their credentials live in the encrypted
 * per-workspace connection store, not env vars).
 * No network, no database.
 */

import { describe, it, expect } from "vitest";
import {
  INTEGRATION_REGISTRY,
  displayStatusMessage,
  getIntegrationDescriptor,
} from "../registry";
import { getIntegrationStatuses } from "../status";
import { PROVIDER_DEFINITIONS } from "@/lib/integrations/providers/registry";
import type { IntegrationStatusEntry } from "../types";

const MILESTONE_2_IDS = [
  // CRM
  "hubspot", "salesforce", "pipedrive", "close", "gohighlevel", "zoho",
  "attio", "breakcold", "monday",
  // Email outreach
  "instantly", "smartlead", "emailbison", "masterinbox", "smartreach",
  "reply", "lemlist", "snov", "mailshake", "woodpecker",
  // Automation
  "make", "pabbly", "albato", "activepieces",
  // AI MCP clients
  "gemini", "cursor", "claude-code",
  // Lead enrichment
  "apollo", "hunter", "zoominfo", "contactout", "salesql", "dropcontact",
  "persana", "clearbit", "clay", "apify", "rb2b", "factors", "trigify",
  "weezly",
  // Email verification
  "millionverifier", "zerobounce", "neverbounce", "bouncer",
  "hunter-verifier",
  // Communication
  "slack", "teams", "discord", "telegram", "whatsapp",
  // Productivity
  "google-sheets", "google-drive", "airtable", "notion", "asana", "trello",
  "clickup", "jira", "linear", "calendly", "google-calendar",
  // Category J
  "getleads", "cornersight", "hothawk",
] as const;

function fakeEntry(
  overrides: Partial<IntegrationStatusEntry> = {}
): IntegrationStatusEntry {
  const descriptor = getIntegrationDescriptor("hubspot")!;
  return {
    descriptor,
    status: "Not Connected",
    statusMessage: "Unknown integration.",
    envPresence: [],
    lastVerification: null,
    ...overrides,
  };
}

describe("Milestone 2 Center registry coverage", () => {
  it("has one entry per Milestone 2 provider (83 entries total)", () => {
    const ids = INTEGRATION_REGISTRY.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(INTEGRATION_REGISTRY.length).toBe(83);
    for (const id of MILESTONE_2_IDS) {
      expect(ids, `missing Center entry: ${id}`).toContain(id);
    }
  });

  it("covers every provider definition (except muse, whose Center id is muse-ai)", () => {
    const centerIds = new Set(INTEGRATION_REGISTRY.map((d) => d.id));
    for (const def of PROVIDER_DEFINITIONS) {
      if (def.id === "muse") {
        expect(centerIds.has("muse-ai")).toBe(true);
      } else {
        expect(centerIds.has(def.id), `no Center entry for ${def.id}`).toBe(true);
      }
    }
  });

  it("no new entry claims a verification call or a connection", () => {
    for (const id of MILESTONE_2_IDS) {
      const entry = getIntegrationDescriptor(id)!;
      expect(entry.verifySupported, id).toBe(false);
      expect(entry.tagline, id).not.toMatch(/connected and verified/i);
      expect(entry.description, id).not.toMatch(/connected and verified/i);
    }
  });

  it("provider-blocked entries are kind info with the reason visible", () => {
    for (const id of ["clearbit", "trigify", "weezly"] as const) {
      const entry = getIntegrationDescriptor(id)!;
      expect(entry.kind).toBe("info");
      expect(entry.notImplementedNote).toBeTruthy();
      expect(entry.capabilities.join(" ")).toMatch(/blocked|not implemented/i);
    }
  });

  it("Google Sheets is now a real adapter entry, not the old placeholder", () => {
    const entry = getIntegrationDescriptor("google-sheets")!;
    expect(entry.kind).toBe("adapter");
    expect(entry.category).toBe("Productivity");
    expect(entry.notImplementedNote).toBeUndefined();
    expect(entry.envVars.map((v) => v.name)).toEqual([
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
    ]);
  });

  it("AI entries share one category name", () => {
    for (const id of ["muse-ai", "chatgpt", "claude", "gemini", "cursor", "claude-code"]) {
      expect(getIntegrationDescriptor(id)?.category).toBe("AI Assistants");
    }
  });

  it("new entries use only the marketplace categories", () => {
    const allowed = new Set([
      "CRM",
      "Email Outreach",
      "Automation",
      "AI Assistants",
      "Lead Enrichment",
      "Email Verification",
      "Communication",
      "Productivity",
    ]);
    for (const id of MILESTONE_2_IDS) {
      expect(allowed.has(getIntegrationDescriptor(id)!.category), id).toBe(true);
    }
  });

  it("every new entry has a real docs URL or null, and a real guide path in its setup steps", () => {
    for (const id of MILESTONE_2_IDS) {
      const entry = getIntegrationDescriptor(id)!;
      if (entry.docsUrl !== null) {
        expect(entry.docsUrl).toMatch(/^https:\/\//);
      }
      expect(entry.setupSteps.length).toBeGreaterThan(0);
      expect(entry.capabilities.length).toBeGreaterThan(0);
      expect(entry.troubleshooting.length).toBeGreaterThan(0);
    }
    expect(getIntegrationDescriptor("cursor")!.docsUrl).toBeNull();
    expect(getIntegrationDescriptor("clearbit")!.docsUrl).toBeNull();
  });
});

describe("displayStatusMessage", () => {
  it("rewrites exactly 'Unknown integration.' for an adapter entry", () => {
    const message = displayStatusMessage(fakeEntry());
    expect(message).toContain("No HubSpot credential is stored");
    expect(message).not.toBe("Unknown integration.");
  });

  it("rewrites it with the blocked reason for an info entry", () => {
    const entry = fakeEntry({
      descriptor: getIntegrationDescriptor("trigify")!,
    });
    expect(displayStatusMessage(entry)).toContain("not available yet");
    expect(displayStatusMessage(entry)).toContain("shut down");
  });

  it("passes every other status message through verbatim", () => {
    const message = "Supabase URL and anon key are configured.";
    expect(
      displayStatusMessage(fakeEntry({ statusMessage: message }))
    ).toBe(message);
  });
});

describe("new provider statuses", () => {
  it("every Milestone 2 id derives Not Connected (never Connected) with no config", () => {
    const entries = getIntegrationStatuses({ env: {}, mode: "supabase" });
    const byId = new Map(entries.map((e) => [e.descriptor.id, e]));
    for (const id of MILESTONE_2_IDS) {
      const entry = byId.get(id)!;
      expect(entry.status, id).toBe("Not Connected");
      expect(entry.status).not.toMatch(/^Connected/);
    }
  });
});
