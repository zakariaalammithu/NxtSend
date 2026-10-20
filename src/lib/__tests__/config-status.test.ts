import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CONFIG_CATALOG,
  buildConfigStatus,
  classifyEnvValue,
} from "../config-status";

describe("classifyEnvValue", () => {
  it("classifies a real-looking value as present_valid", () => {
    expect(classifyEnvValue("RESEND_API_KEY", "re_AbC123xYz")).toBe(
      "present_valid"
    );
    expect(
      classifyEnvValue("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co")
    ).toBe("present_valid");
  });

  it("classifies unset and empty as missing", () => {
    expect(classifyEnvValue("RESEND_API_KEY", undefined)).toBe("missing");
    expect(classifyEnvValue("RESEND_API_KEY", "")).toBe("missing");
    expect(classifyEnvValue("RESEND_API_KEY", "   ")).toBe("missing");
  });

  it("classifies .env.example placeholders as present_placeholder", () => {
    expect(classifyEnvValue("RESEND_API_KEY", "your-resend-api-key")).toBe(
      "present_placeholder"
    );
    expect(
      classifyEnvValue("SUPABASE_SERVICE_ROLE_KEY", "your-service-role-key")
    ).toBe("present_placeholder");
    expect(classifyEnvValue("CRON_SECRET", "change-me-in-production")).toBe(
      "present_placeholder"
    );
    expect(classifyEnvValue("OPENAI_API_KEY", "sk-placeholder")).toBe(
      "present_placeholder"
    );
  });

  it("treats NODE_ENV as a mode switch, not a credential", () => {
    // "test" is a placeholder shape for secrets but a legitimate
    // NODE_ENV value — it must not be flagged as a placeholder.
    expect(classifyEnvValue("NODE_ENV", "test")).toBe("present_valid");
    expect(classifyEnvValue("NODE_ENV", "production")).toBe("present_valid");
    expect(classifyEnvValue("NODE_ENV", "")).toBe("missing");
  });
});

describe("buildConfigStatus", () => {
  it("reports every required-for-live variable when the env is empty", () => {
    const matrix = buildConfigStatus({});
    expect(matrix.liveReady).toBe(false);
    expect(matrix.missingRequiredForLive).toEqual(
      expect.arrayContaining([
        "NEXT_PUBLIC_APP_URL",
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "CRON_SECRET",
      ])
    );
    expect(matrix.totals.total).toBe(CONFIG_CATALOG.length);
    expect(matrix.totals.valid).toBe(0);
  });

  it("is live-ready when the required set is validly configured", () => {
    const matrix = buildConfigStatus({
      NEXT_PUBLIC_APP_URL: "https://nxtsend.example.com",
      NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon",
      SUPABASE_SERVICE_ROLE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.svc",
      CRON_SECRET: "a-long-random-string",
    });
    expect(matrix.liveReady).toBe(true);
    expect(matrix.missingRequiredForLive).toEqual([]);
    // Feature variables remain honestly missing, not lumped into failure.
    expect(matrix.totals.missing).toBeGreaterThan(0);
  });

  it("flags placeholder values separately from missing ones", () => {
    const matrix = buildConfigStatus({
      RESEND_API_KEY: "your-resend-api-key",
    });
    expect(matrix.placeholderVars).toContain("RESEND_API_KEY");
    const email = matrix.groups.find((g) => g.group === "email");
    expect(email?.placeholder).toBe(1);
    // Only RESEND_API_KEY is set here (as a placeholder); the other
    // five email vars (EMAIL_FROM, RESEND_WEBHOOK_SECRET,
    // EMAIL_REPLY_TO, UNSUBSCRIBE_SECRET, INSTANTLY_API_KEY) are missing.
    expect(email?.missing).toBe(5);
  });

  it("never includes values in its output", () => {
    const secret = "re_SUPER_SECRET_VALUE_123";
    const matrix = buildConfigStatus({ RESEND_API_KEY: secret });
    expect(JSON.stringify(matrix)).not.toContain(secret);
  });
});

describe("catalogue parity with .env.example", () => {
  it("catalogues exactly the variables shipped in .env.example", () => {
    const envExamplePath = fileURLToPath(
      new URL("../../../.env.example", import.meta.url)
    );
    const names = readFileSync(envExamplePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)=/)?.[1])
      .filter((n): n is string => Boolean(n));
    expect(new Set(names)).toEqual(
      new Set(CONFIG_CATALOG.map((v) => v.name))
    );
  });
});
