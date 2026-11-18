/**
 * Automation-platform REST config tests (Make, Pabbly Connect,
 * Albato, Activepieces).
 *
 * Covers: the four PLATFORM_CONFIGS entries (resource path,
 * scope prefix, enabled env, base URL env, audit prefix),
 * isRestPlatform / isPlatformEnabled defaults, getPlatformBaseUrl
 * precedence (platform env > NEXT_PUBLIC_APP_URL > request origin),
 * getPlatformResourceUrl and platformDisplayName. No database,
 * no network.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  ACTIVEPIECES_PLATFORM,
  ALBATO_PLATFORM,
  MAKE_PLATFORM,
  PABBLY_PLATFORM,
  PLATFORM_CONFIGS,
  getPlatformBaseUrl,
  getPlatformResourceUrl,
  isPlatformEnabled,
  isRestPlatform,
  platformDisplayName,
} from "@/lib/integrations/rest/config";

const ORIGIN = "https://nxtsend.com";

const savedEnv = { ...process.env };

function restoreEnv(key: string, saved: string | undefined) {
  if (saved === undefined) delete process.env[key];
  else process.env[key] = saved;
}

afterEach(() => {
  for (const key of [
    "MAKE_ENABLED",
    "PABBLY_ENABLED",
    "ALBATO_ENABLED",
    "ACTIVEPIECES_ENABLED",
    "MAKE_API_BASE_URL",
    "PABBLY_API_BASE_URL",
    "ALBATO_API_BASE_URL",
    "ACTIVEPIECES_API_BASE_URL",
    "NEXT_PUBLIC_APP_URL",
  ]) {
    restoreEnv(key, savedEnv[key]);
  }
});

describe("automation platform configs", () => {
  it("the four platforms are registered with the right shape", () => {
    const byId = new Map(Object.values(PLATFORM_CONFIGS).map((c) => [c.platform, c]));
    const cases = [
      { id: "make", config: MAKE_PLATFORM, enabledEnv: "MAKE_ENABLED", baseUrlEnv: "MAKE_API_BASE_URL" },
      { id: "pabbly", config: PABBLY_PLATFORM, enabledEnv: "PABBLY_ENABLED", baseUrlEnv: "PABBLY_API_BASE_URL" },
      { id: "albato", config: ALBATO_PLATFORM, enabledEnv: "ALBATO_ENABLED", baseUrlEnv: "ALBATO_API_BASE_URL" },
      { id: "activepieces", config: ACTIVEPIECES_PLATFORM, enabledEnv: "ACTIVEPIECES_ENABLED", baseUrlEnv: "ACTIVEPIECES_API_BASE_URL" },
    ] as const;
    for (const c of cases) {
      expect(byId.get(c.id)).toBe(c.config);
      expect(c.config.resourcePath).toBe(`/api/integrations/${c.id}`);
      expect(c.config.scopePrefix).toBe(c.id);
      expect(c.config.enabledEnv).toBe(c.enabledEnv);
      expect(c.config.baseUrlEnv).toBe(c.baseUrlEnv);
      expect(c.config.auditPrefix).toBe(c.id);
    }
    expect(isRestPlatform("make")).toBe(true);
    expect(isRestPlatform("pabbly")).toBe(true);
    expect(isRestPlatform("albato")).toBe(true);
    expect(isRestPlatform("activepieces")).toBe(true);
    expect(isRestPlatform("unknown")).toBe(false);
  });

  it("platforms are enabled by default and respect their env flag", () => {
    for (const p of ["make", "pabbly", "albato", "activepieces"] as const) {
      expect(isPlatformEnabled(p)).toBe(true);
    }
    process.env.MAKE_ENABLED = "false";
    expect(isPlatformEnabled("make")).toBe(false);
    expect(isPlatformEnabled("pabbly")).toBe(true);
    process.env.ACTIVEPIECES_ENABLED = "0";
    expect(isPlatformEnabled("activepieces")).toBe(false);
  });

  it("getPlatformBaseUrl: platform env wins, then NEXT_PUBLIC_APP_URL, then origin", () => {
    expect(getPlatformBaseUrl("make", ORIGIN)).toBe(ORIGIN);
    process.env.NEXT_PUBLIC_APP_URL = "https://app.nxtsend.com";
    expect(getPlatformBaseUrl("pabbly", ORIGIN)).toBe("https://app.nxtsend.com");
    process.env.ALBATO_API_BASE_URL = "https://albato.nxtsend.com/";
    expect(getPlatformBaseUrl("albato", ORIGIN)).toBe("https://albato.nxtsend.com");
    process.env.ACTIVEPIECES_API_BASE_URL = "https://ap.nxtsend.com";
    expect(getPlatformBaseUrl("activepieces", ORIGIN)).toBe("https://ap.nxtsend.com");
  });

  it("getPlatformResourceUrl builds the resource URL from the base", () => {
    expect(getPlatformResourceUrl("make", ORIGIN)).toBe(
      `${ORIGIN}/api/integrations/make`
    );
    expect(getPlatformResourceUrl("activepieces", ORIGIN)).toBe(
      `${ORIGIN}/api/integrations/activepieces`
    );
  });

  it("platformDisplayName names the four platforms", () => {
    expect(platformDisplayName("make")).toBe("Make");
    expect(platformDisplayName("pabbly")).toBe("Pabbly Connect");
    expect(platformDisplayName("albato")).toBe("Albato");
    expect(platformDisplayName("activepieces")).toBe("Activepieces");
  });
});
