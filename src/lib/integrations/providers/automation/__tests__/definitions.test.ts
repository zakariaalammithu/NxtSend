/**
 * Automation provider definitions tests (Make, Pabbly Connect,
 * Albato, Activepieces).
 *
 * Covers: exactly four definitions, ids/category/authType,
 * honest docs URLs, scopes are read + write only (no .send),
 * twoWaySync is true, and the lookup helper. No database,
 * no network.
 */
import { describe, it, expect } from "vitest";
import {
  AUTOMATION_PROVIDER_DEFINITIONS,
  getAutomationProviderDefinition,
} from "../definitions";

describe("AUTOMATION_PROVIDER_DEFINITIONS", () => {
  it("has exactly the four automation platforms", () => {
    expect(AUTOMATION_PROVIDER_DEFINITIONS.map((d) => d.id)).toEqual([
      "make",
      "pabbly",
      "albato",
      "activepieces",
    ]);
  });

  it("each definition is an automation provider with OAuth 2.0", () => {
    for (const d of AUTOMATION_PROVIDER_DEFINITIONS) {
      expect(d.category).toBe("automation");
      expect(d.authType).toBe("oauth2");
      expect(d.name).toBeTruthy();
      expect(d.twoWaySync).toBe(true);
      expect(d.capabilities.length).toBeGreaterThan(0);
    }
  });

  it("scopes are read + write only — no .send scope is granted", () => {
    for (const d of AUTOMATION_PROVIDER_DEFINITIONS) {
      expect(d.scopes).toEqual([`${d.id}.read`, `${d.id}.write`]);
      expect(d.scopes?.some((s) => s.endsWith(".send"))).toBe(false);
    }
  });

  it("docsUrl is a real https URL or null, never invented", () => {
    for (const d of AUTOMATION_PROVIDER_DEFINITIONS) {
      if (d.docsUrl !== null) {
        expect(d.docsUrl.startsWith("https://")).toBe(true);
      }
    }
    expect(getAutomationProviderDefinition("make")?.docsUrl).toBe(
      "https://developers.make.com"
    );
    expect(getAutomationProviderDefinition("activepieces")?.docsUrl).toBe(
      "https://www.activepieces.com/docs"
    );
  });

  it("capabilities state the not-published position honestly", () => {
    const text = AUTOMATION_PROVIDER_DEFINITIONS.map((d) =>
      d.capabilities.join(" ")
    ).join(" ");
    expect(text).toMatch(/NOT (submitted|published|built)/);
  });

  it("getAutomationProviderDefinition looks up by id", () => {
    expect(getAutomationProviderDefinition("pabbly")?.name).toBe("Pabbly Connect");
    expect(getAutomationProviderDefinition("albato")?.name).toBe("Albato");
    expect(getAutomationProviderDefinition("unknown")).toBeNull();
  });
});
