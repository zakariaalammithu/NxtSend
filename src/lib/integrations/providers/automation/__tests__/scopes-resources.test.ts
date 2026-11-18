/**
 * Automation-platform OAuth scope / resource tests (Make, Pabbly
 * Connect, Albato, Activepieces).
 *
 * Covers: the eight new scopes resolve through normalizeScopes
 * (and `*.send` is rejected for all four — there is no send tier
 * on these platforms, mirroring Zapier/n8n), SCOPE_DESCRIPTIONS
 * and the tier map cover them, defaultScopeForPlatform returns
 * the read scope per platform, resourcePlatform resolves each
 * platform's resource URL and rejects cross-platform resources,
 * and the resource URL helpers build the right URLs.
 * No database, no network.
 */
import { describe, it, expect } from "vitest";
import {
  ALL_OAUTH_SCOPES,
  ACTIVEPIECES_SCOPES,
  ALBATO_SCOPES,
  MAKE_SCOPES,
  PABBLY_SCOPES,
  SCOPE_DESCRIPTIONS,
  SCOPE_TIER_MAP,
  defaultScopeForPlatform,
  grantHasTier,
  normalizeScopes,
} from "@/lib/muse-connector/oauth/scopes";
import {
  getActivepiecesResourceUrl,
  getAlbatoResourceUrl,
  getMakeResourceUrl,
  getPabblyResourceUrl,
  resourcePlatform,
} from "@/lib/muse-connector/oauth/config";

const ORIGIN = "https://nxtsend.com";

const PLATFORMS = [
  { id: "make", scopes: MAKE_SCOPES, resource: getMakeResourceUrl(ORIGIN) },
  { id: "pabbly", scopes: PABBLY_SCOPES, resource: getPabblyResourceUrl(ORIGIN) },
  { id: "albato", scopes: ALBATO_SCOPES, resource: getAlbatoResourceUrl(ORIGIN) },
  {
    id: "activepieces",
    scopes: ACTIVEPIECES_SCOPES,
    resource: getActivepiecesResourceUrl(ORIGIN),
  },
] as const;

describe("automation platform scopes", () => {
  it("each platform has exactly read + write, no send tier", () => {
    for (const p of PLATFORMS) {
      expect([...p.scopes]).toEqual([`${p.id}.read`, `${p.id}.write`]);
      expect(ALL_OAUTH_SCOPES).toContain(`${p.id}.read`);
      expect(ALL_OAUTH_SCOPES).toContain(`${p.id}.write`);
      expect(ALL_OAUTH_SCOPES).not.toContain(`${p.id}.send`);
    }
  });

  it("normalizeScopes accepts the new scopes and rejects *.send", () => {
    for (const p of PLATFORMS) {
      expect(normalizeScopes(`${p.id}.read ${p.id}.write`)).toEqual([
        `${p.id}.read`,
        `${p.id}.write`,
      ]);
      expect(normalizeScopes(`${p.id}.send`)).toBeNull();
      expect(normalizeScopes(`${p.id}.read bogus.scope`)).toBeNull();
    }
  });

  it("SCOPE_DESCRIPTIONS and SCOPE_TIER_MAP cover the new scopes", () => {
    for (const p of PLATFORMS) {
      expect(SCOPE_DESCRIPTIONS[`${p.id}.read`]).toBeTruthy();
      expect(SCOPE_DESCRIPTIONS[`${p.id}.write`]).toBeTruthy();
      expect(SCOPE_TIER_MAP[`${p.id}.read`]).toBe("read");
      expect(SCOPE_TIER_MAP[`${p.id}.write`]).toBe("write");
    }
  });

  it("grantHasTier honours read vs write for the new scopes", () => {
    expect(grantHasTier(["make.read"], "read")).toBe(true);
    expect(grantHasTier(["make.read"], "write")).toBe(false);
    expect(grantHasTier(["pabbly.write"], "write")).toBe(true);
    expect(grantHasTier(["albato.read", "activepieces.write"], "write")).toBe(true);
    expect(grantHasTier([], "read")).toBe(false);
  });

  it("defaultScopeForPlatform returns the read scope per platform", () => {
    expect(defaultScopeForPlatform("make")).toBe("make.read");
    expect(defaultScopeForPlatform("pabbly")).toBe("pabbly.read");
    expect(defaultScopeForPlatform("albato")).toBe("albato.read");
    expect(defaultScopeForPlatform("activepieces")).toBe("activepieces.read");
  });
});

describe("automation platform resource URLs", () => {
  it("resource helpers build the platform resource URL", () => {
    expect(getMakeResourceUrl(ORIGIN)).toBe(`${ORIGIN}/api/integrations/make`);
    expect(getPabblyResourceUrl(ORIGIN)).toBe(`${ORIGIN}/api/integrations/pabbly`);
    expect(getAlbatoResourceUrl(ORIGIN)).toBe(`${ORIGIN}/api/integrations/albato`);
    expect(getActivepiecesResourceUrl(ORIGIN)).toBe(
      `${ORIGIN}/api/integrations/activepieces`
    );
  });

  it("resourcePlatform resolves each platform's own resource", () => {
    for (const p of PLATFORMS) {
      expect(resourcePlatform(p.resource)).toBe(p.id);
    }
    expect(resourcePlatform(`${ORIGIN}/api/integrations/n8n`)).toBe("n8n");
    expect(resourcePlatform(`${ORIGIN}/api/integrations/zapier`)).toBe("zapier");
  });

  it("resourcePlatform rejects cross-platform and unknown resources", () => {
    // A Make resource must never resolve as another platform.
    expect(resourcePlatform(getMakeResourceUrl(ORIGIN))).not.toBe("n8n");
    expect(resourcePlatform(getPabblyResourceUrl(ORIGIN))).not.toBe("make");
    expect(resourcePlatform(getAlbatoResourceUrl(ORIGIN))).not.toBe("activepieces");
    expect(resourcePlatform(getActivepiecesResourceUrl(ORIGIN))).not.toBe("albato");
    expect(resourcePlatform(`${ORIGIN}/api/integrations/unknown`)).toBeNull();
    expect(resourcePlatform(null)).toBeNull();
    expect(resourcePlatform(undefined)).toBeNull();
    // Bare origin / wrong path is not a platform resource.
    expect(resourcePlatform(ORIGIN)).toBeNull();
  });
});
