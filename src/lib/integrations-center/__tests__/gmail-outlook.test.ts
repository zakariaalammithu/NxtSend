import { describe, it, expect } from "vitest";
import { getIntegrationStatuses } from "../status";
import { verifyIntegration } from "../verify";
import { INTEGRATION_REGISTRY } from "../registry";
import type { OAuthMailboxSummary } from "@/lib/oauth/store";

/**
 * Gmail / Outlook (Microsoft 365) Integration Center behavior
 * (P5 Stage G). The honesty invariant under test: "Connected" can
 * ONLY come from a stored OAuth connection summary (which exists
 * only after a completed exchange + profile fetch) — full env
 * configuration alone yields "Not Connected", never a claim.
 */

const KEY = Buffer.alloc(32, 0x66).toString("base64");
const FULL_ENV = {
  GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "GOCSPX-real",
  MICROSOFT_CLIENT_ID: "ms-client-id",
  MICROSOFT_CLIENT_SECRET: "ms-secret-real",
  TOKEN_ENCRYPTION_KEY: KEY,
  NEXT_PUBLIC_APP_URL: "https://app.nxtsend.example",
  NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-real",
};

function entry(id: string, options: Parameters<typeof getIntegrationStatuses>[0]) {
  const found = getIntegrationStatuses(options).find((e) => e.descriptor.id === id);
  if (!found) throw new Error(`no status entry for ${id}`);
  return found;
}

const ACTIVE_OK: OAuthMailboxSummary = {
  email: "owner@gmail.com",
  authStatus: "ok",
  connectionStatus: "active",
};

describe("registry entries", () => {
  it("registers Gmail and Outlook (Microsoft 365) as real adapters", () => {
    const gmail = INTEGRATION_REGISTRY.find((d) => d.id === "gmail");
    const microsoft = INTEGRATION_REGISTRY.find((d) => d.id === "microsoft");
    expect(gmail?.name).toBe("Gmail");
    expect(microsoft?.name).toBe("Outlook (Microsoft 365)");
    expect(gmail?.kind).toBe("adapter");
    expect(microsoft?.kind).toBe("adapter");
    expect(gmail?.verifySupported).toBe(true);
    expect(microsoft?.verifySupported).toBe(true);
    const envNames = (id: string) =>
      INTEGRATION_REGISTRY.find((d) => d.id === id)?.envVars.map((v) => v.name);
    expect(envNames("gmail")).toEqual([
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "TOKEN_ENCRYPTION_KEY",
    ]);
    expect(envNames("microsoft")).toEqual([
      "MICROSOFT_CLIENT_ID",
      "MICROSOFT_CLIENT_SECRET",
      "TOKEN_ENCRYPTION_KEY",
    ]);
  });
});

describe("status derivation", () => {
  it("Demo Mode explains live-only OAuth; nothing is connected or simulated", () => {
    for (const id of ["gmail", "microsoft"]) {
      const e = entry(id, { env: {}, mode: "demo" });
      expect(e.status).toBe("Demo Mode");
      expect(e.statusMessage).toContain("live mode only");
    }
  });

  it("live + no configuration → Not Connected (gmail) / Not Connected (microsoft)", () => {
    const gmail = entry("gmail", { env: { NODE_ENV: "production" }, mode: "supabase" });
    expect(gmail.status).toBe("Not Connected");
    const ms = entry("microsoft", { env: { NODE_ENV: "production" }, mode: "supabase" });
    expect(ms.status).toBe("Not Connected");
  });

  it("live + partial configuration → Configuration Required naming the missing vars", () => {
    const gmail = entry("gmail", {
      env: { ...FULL_ENV, GOOGLE_CLIENT_SECRET: undefined, TOKEN_ENCRYPTION_KEY: undefined },
      mode: "supabase",
    });
    expect(gmail.status).toBe("Configuration Required");
    expect(gmail.statusMessage).toContain("GOOGLE_CLIENT_SECRET");
    expect(gmail.statusMessage).toContain("TOKEN_ENCRYPTION_KEY");
  });

  it("live + FULL configuration but NO connected mailbox → still Not Connected", () => {
    // The core honesty rule: env presence never claims a connection.
    const gmail = entry("gmail", { env: FULL_ENV, mode: "supabase" });
    expect(gmail.status).toBe("Not Connected");
    expect(gmail.statusMessage).toContain("no mailbox has been connected yet");
  });

  it("a stored active grant with ok health → Connected and Verified", () => {
    const gmail = entry("gmail", {
      env: FULL_ENV,
      mode: "supabase",
      oauthMailboxes: { google: ACTIVE_OK },
    });
    expect(gmail.status).toBe("Connected and Verified");
    expect(gmail.statusMessage).toContain("owner@gmail.com");
  });

  it("a stored grant with needs_reconnect health → Error (never Connected)", () => {
    const gmail = entry("gmail", {
      env: FULL_ENV,
      mode: "supabase",
      oauthMailboxes: {
        google: { ...ACTIVE_OK, authStatus: "needs_reconnect" },
      },
    });
    expect(gmail.status).toBe("Error");
    expect(gmail.statusMessage).toContain("reconnect");
  });

  it("a stored grant in a non-active state → Error naming the state", () => {
    const ms = entry("microsoft", {
      env: FULL_ENV,
      mode: "supabase",
      oauthMailboxes: {
        microsoft: {
          email: "owner@contoso.com",
          authStatus: "ok",
          connectionStatus: "needs_reconnect",
        },
      },
    });
    expect(ms.status).toBe("Error");
    expect(ms.statusMessage).toContain("needs_reconnect");
  });
});

describe("Test Connection (verify)", () => {
  it("Demo Mode makes no call", async () => {
    const outcome = await verifyIntegration("gmail", { mode: "demo", env: {} });
    expect(outcome?.attempted).toBe(false);
    expect(outcome?.status).toBe("Demo Mode");
  });

  it("live without a mailboxVerify seam → attempted false", async () => {
    const outcome = await verifyIntegration("microsoft", {
      mode: "supabase",
      env: FULL_ENV,
    });
    expect(outcome?.attempted).toBe(false);
  });

  it("live with no connection → attempted false; with a verified grant → Connected and Verified", async () => {
    const none = await verifyIntegration("gmail", {
      mode: "supabase",
      env: FULL_ENV,
      mailboxVerify: async () => ({
        attempted: false,
        ok: false,
        message: "No Gmail mailbox is connected in this workspace yet.",
      }),
    });
    expect(none?.attempted).toBe(false);
    expect(none?.status).toBe("Not Connected");

    const ok = await verifyIntegration("gmail", {
      mode: "supabase",
      env: FULL_ENV,
      mailboxVerify: async () => ({
        attempted: true,
        ok: true,
        message: "Gmail verified: profile confirms owner@gmail.com.",
      }),
    });
    expect(ok?.attempted).toBe(true);
    expect(ok?.ok).toBe(true);
    expect(ok?.status).toBe("Connected and Verified");
  });
});
