import { describe, it, expect } from "vitest";
import {
  authErrorMessage,
  buildOAuthCallbackUrl,
  mapProviderOAuthError,
  sanitizeRedirectTarget,
} from "../oauth";

/**
 * P10 Stage C — Google Sign-In shared helpers.
 *
 * The sanitiser is the security boundary for the post-login target:
 * middleware emits ?redirect=<pathname>, and that value flows through
 * the login/signup pages, the Google OAuth start, and the callback.
 * Anything that is not a same-origin relative path must collapse to
 * /dashboard (open-redirect prevention), and auth pages themselves
 * are never a valid landing target (loop prevention).
 */
describe("sanitizeRedirectTarget", () => {
  it("defaults for absent and non-string values", () => {
    expect(sanitizeRedirectTarget(undefined)).toBe("/dashboard");
    expect(sanitizeRedirectTarget(null)).toBe("/dashboard");
    expect(sanitizeRedirectTarget("")).toBe("/dashboard");
    expect(sanitizeRedirectTarget("   ")).toBe("/dashboard");
    expect(sanitizeRedirectTarget(42)).toBe("/dashboard");
    expect(sanitizeRedirectTarget({})).toBe("/dashboard");
  });

  it("keeps same-origin relative paths, including query and hash", () => {
    expect(sanitizeRedirectTarget("/dashboard")).toBe("/dashboard");
    expect(sanitizeRedirectTarget("/dashboard/billing")).toBe(
      "/dashboard/billing"
    );
    expect(sanitizeRedirectTarget("/dashboard?tab=usage#top")).toBe(
      "/dashboard?tab=usage#top"
    );
    expect(sanitizeRedirectTarget("/")).toBe("/");
    expect(sanitizeRedirectTarget("  /admin/users  ")).toBe("/admin/users");
  });

  it("rejects absolute and protocol-relative URLs (open redirect)", () => {
    expect(sanitizeRedirectTarget("https://evil.example.com")).toBe(
      "/dashboard"
    );
    expect(sanitizeRedirectTarget("http://evil.example.com/x")).toBe(
      "/dashboard"
    );
    expect(sanitizeRedirectTarget("//evil.example.com")).toBe("/dashboard");
    expect(sanitizeRedirectTarget("///evil.example.com")).toBe("/dashboard");
    expect(sanitizeRedirectTarget("dashboard")).toBe("/dashboard");
    expect(sanitizeRedirectTarget("javascript:alert(1)")).toBe("/dashboard");
  });

  it("rejects backslashes and whitespace/control characters", () => {
    expect(sanitizeRedirectTarget("/\\evil.example.com")).toBe("/dashboard");
    expect(sanitizeRedirectTarget("/dash\\board")).toBe("/dashboard");
    expect(sanitizeRedirectTarget("/dash board")).toBe("/dashboard");
    expect(sanitizeRedirectTarget("/dash\tboard")).toBe("/dashboard");
    expect(sanitizeRedirectTarget("/dash\nboard")).toBe("/dashboard");
  });

  it("rejects loops back into the auth pages and the callback", () => {
    expect(sanitizeRedirectTarget("/login")).toBe("/dashboard");
    expect(sanitizeRedirectTarget("/login?error=oauth_failed")).toBe(
      "/dashboard"
    );
    expect(sanitizeRedirectTarget("/signup")).toBe("/dashboard");
    expect(sanitizeRedirectTarget("/forgot-password")).toBe("/dashboard");
    expect(sanitizeRedirectTarget("/reset-password")).toBe("/dashboard");
    expect(sanitizeRedirectTarget("/auth/callback?code=x")).toBe("/dashboard");
  });
});

describe("mapProviderOAuthError", () => {
  it("maps access_denied to oauth_cancelled", () => {
    expect(mapProviderOAuthError("access_denied")).toBe("oauth_cancelled");
  });

  it("maps everything else to oauth_failed without reflecting raw text", () => {
    expect(mapProviderOAuthError("server_error")).toBe("oauth_failed");
    expect(mapProviderOAuthError("temporarily_unavailable")).toBe(
      "oauth_failed"
    );
    expect(mapProviderOAuthError(null)).toBe("oauth_failed");
    expect(mapProviderOAuthError(undefined)).toBe("oauth_failed");
    expect(mapProviderOAuthError("")).toBe("oauth_failed");
  });
});

describe("authErrorMessage", () => {
  it("returns friendly copy for the known codes", () => {
    expect(authErrorMessage("oauth_cancelled")).toMatch(/cancelled/i);
    expect(authErrorMessage("oauth_failed")).toMatch(/didn't complete/i);
    expect(authErrorMessage("account_suspended")).toMatch(/suspended/i);
  });

  it("returns null for absent or unknown codes", () => {
    expect(authErrorMessage(null)).toBeNull();
    expect(authErrorMessage(undefined)).toBeNull();
    expect(authErrorMessage("")).toBeNull();
    expect(authErrorMessage("raw provider text")).toBeNull();
  });
});

describe("buildOAuthCallbackUrl", () => {
  it("builds the callback URL with the sanitised target encoded", () => {
    expect(buildOAuthCallbackUrl("http://localhost:3000", "/dashboard/billing")).toBe(
      "http://localhost:3000/auth/callback?redirect=%2Fdashboard%2Fbilling"
    );
  });

  it("never carries a malicious target into the callback URL", () => {
    const url = buildOAuthCallbackUrl("https://app.example.com", "//evil.com");
    expect(url).toBe(
      "https://app.example.com/auth/callback?redirect=%2Fdashboard"
    );
    expect(url).not.toContain("evil.com");
  });
});
