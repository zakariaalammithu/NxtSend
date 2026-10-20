import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  encryptToken,
  decryptToken,
  getTokenEncryptionKey,
  isTokenEncryptionConfigured,
  TokenVaultError,
} from "../crypto";
import { signOAuthState, verifyOAuthState, OAUTH_STATE_TTL_MS } from "../state";
import {
  getOAuthConfigStatus,
  getOAuthClientConfig,
  resolveOAuthRedirectUri,
} from "../config";

// A real 32-byte key, base64 — the shape `openssl rand -base64 32` emits.
const KEY_A = Buffer.alloc(32, 0x11).toString("base64");
const KEY_B = Buffer.alloc(32, 0x22).toString("base64");
const ENV_A = { TOKEN_ENCRYPTION_KEY: KEY_A };

describe("token vault (AES-256-GCM)", () => {
  it("round-trips a token; ciphertext differs from plaintext", () => {
    const plaintext = "ya29.super-secret-access-token";
    const encrypted = encryptToken(plaintext, ENV_A);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(encrypted.startsWith("v1.")).toBe(true);
    expect(decryptToken(encrypted, ENV_A)).toBe(plaintext);
  });

  it("produces different ciphertext for the same plaintext (random IV)", () => {
    expect(encryptToken("tok", ENV_A)).not.toBe(encryptToken("tok", ENV_A));
  });

  it("fails closed on tampered ciphertext", () => {
    const encrypted = encryptToken("refresh-token-value", ENV_A);
    const parts = encrypted.split(".");
    const tamperedBody = Buffer.from("forged-token-value").toString("base64url");
    const tampered = [parts[0], parts[1], parts[2], tamperedBody].join(".");
    expect(() => decryptToken(tampered, ENV_A)).toThrow(TokenVaultError);
  });

  it("fails closed on a tampered auth tag", () => {
    const encrypted = encryptToken("refresh-token-value", ENV_A);
    const parts = encrypted.split(".");
    const tampered = [parts[0], parts[1], Buffer.from("0".repeat(16)).toString("base64url"), parts[3]].join(".");
    expect(() => decryptToken(tampered, ENV_A)).toThrow(TokenVaultError);
  });

  it("fails with the wrong key", () => {
    const encrypted = encryptToken("tok", ENV_A);
    expect(() => decryptToken(encrypted, { TOKEN_ENCRYPTION_KEY: KEY_B })).toThrow(
      TokenVaultError
    );
  });

  it("rejects malformed payloads", () => {
    expect(() => decryptToken("not-a-token", ENV_A)).toThrow(TokenVaultError);
    expect(() => decryptToken("", ENV_A)).toThrow(TokenVaultError);
    expect(() => decryptToken("v2.a.b.c", ENV_A)).toThrow(TokenVaultError);
  });

  it("rejects a missing key with a configuration error naming the variable", () => {
    expect(() => getTokenEncryptionKey({})).toThrow(/TOKEN_ENCRYPTION_KEY is not set/);
    expect(() => encryptToken("tok", {})).toThrow(TokenVaultError);
    expect(isTokenEncryptionConfigured({})).toBe(false);
    expect(isTokenEncryptionConfigured(ENV_A)).toBe(true);
  });

  it("rejects placeholder and wrong-length keys", () => {
    expect(() =>
      getTokenEncryptionKey({ TOKEN_ENCRYPTION_KEY: "change-me-in-production" })
    ).toThrow(TokenVaultError);
    expect(() =>
      getTokenEncryptionKey({
        TOKEN_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString("base64"),
      })
    ).toThrow(/exactly 32 bytes/);
    expect(isTokenEncryptionConfigured({ TOKEN_ENCRYPTION_KEY: "your-key" })).toBe(false);
  });
});

describe("OAuth state tokens", () => {
  const CLAIMS = { provider: "google" as const, workspaceId: "ws_1", userId: "user_1" };
  const NOW = new Date("2026-10-20T00:00:00.000Z");

  it("signs and verifies a state bound to provider + workspace + user", () => {
    const token = signOAuthState(CLAIMS, ENV_A, NOW);
    expect(token).toBeTruthy();
    expect(verifyOAuthState(token as string, CLAIMS, ENV_A, NOW)).toEqual(CLAIMS);
  });

  it("rejects a state minted for a different workspace or user", () => {
    const token = signOAuthState(CLAIMS, ENV_A, NOW) as string;
    expect(
      verifyOAuthState(token, { ...CLAIMS, workspaceId: "ws_2" }, ENV_A, NOW)
    ).toBeNull();
    expect(
      verifyOAuthState(token, { ...CLAIMS, userId: "user_2" }, ENV_A, NOW)
    ).toBeNull();
    expect(
      verifyOAuthState(token, { ...CLAIMS, provider: "microsoft" }, ENV_A, NOW)
    ).toBeNull();
  });

  it("rejects expired states", () => {
    const token = signOAuthState(CLAIMS, ENV_A, NOW) as string;
    const later = new Date(NOW.getTime() + OAUTH_STATE_TTL_MS + 1000);
    expect(verifyOAuthState(token, CLAIMS, ENV_A, later)).toBeNull();
  });

  it("rejects tampered states", () => {
    const token = signOAuthState(CLAIMS, ENV_A, NOW) as string;
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ v: 1, p: "google", w: "ws_evil", u: "user_1", n: "x", iat: NOW.getTime(), exp: NOW.getTime() + 600_000 })
    ).toString("base64url");
    expect(verifyOAuthState(`${forged}.${sig}`, CLAIMS, ENV_A, NOW)).toBeNull();
    expect(verifyOAuthState(`${payload}.AAAA`, CLAIMS, ENV_A, NOW)).toBeNull();
    expect(verifyOAuthState("garbage", CLAIMS, ENV_A, NOW)).toBeNull();
  });

  it("cannot mint or verify without a vault key", () => {
    expect(signOAuthState(CLAIMS, {}, NOW)).toBeNull();
    const token = signOAuthState(CLAIMS, ENV_A, NOW) as string;
    expect(verifyOAuthState(token, CLAIMS, {}, NOW)).toBeNull();
  });
});

describe("OAuth config derivation", () => {
  const FULL = {
    GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "GOCSPX-real-looking-secret",
    MICROSOFT_CLIENT_ID: "11111111-2222-3333-4444-555555555555",
    MICROSOFT_CLIENT_SECRET: "real-looking-ms-secret",
    TOKEN_ENCRYPTION_KEY: KEY_A,
    NEXT_PUBLIC_APP_URL: "https://app.nxtsend.example",
    NODE_ENV: "production",
  };

  it("derives the callback URLs from NEXT_PUBLIC_APP_URL", () => {
    expect(resolveOAuthRedirectUri("google", FULL)).toEqual({
      uri: "https://app.nxtsend.example/api/oauth/google/callback",
    });
    expect(resolveOAuthRedirectUri("microsoft", FULL)).toEqual({
      uri: "https://app.nxtsend.example/api/oauth/microsoft/callback",
    });
  });

  it("reports ready with a complete config and exposes the client config", () => {
    const status = getOAuthConfigStatus("google", FULL);
    expect(status.ready).toBe(true);
    expect(status.missing).toEqual([]);
    expect(getOAuthClientConfig("microsoft", FULL)).toEqual({
      clientId: FULL.MICROSOFT_CLIENT_ID,
      clientSecret: FULL.MICROSOFT_CLIENT_SECRET,
      redirectUri: "https://app.nxtsend.example/api/oauth/microsoft/callback",
    });
  });

  it("lists missing variables by NAME (never values)", () => {
    const status = getOAuthConfigStatus("google", {
      NEXT_PUBLIC_APP_URL: "https://app.nxtsend.example",
      NODE_ENV: "production",
    });
    expect(status.ready).toBe(false);
    expect(status.missing).toEqual([
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "TOKEN_ENCRYPTION_KEY",
    ]);
    expect(JSON.stringify(status)).not.toContain("GOCSPX");
  });

  it("treats placeholders as missing", () => {
    const status = getOAuthConfigStatus("microsoft", {
      ...FULL,
      MICROSOFT_CLIENT_SECRET: "your_microsoft_client_secret",
    });
    expect(status.clientConfigured).toBe(false);
    expect(status.missing).toContain("MICROSOFT_CLIENT_SECRET");
  });

  it("refuses a localhost redirect URI in production", () => {
    const res = resolveOAuthRedirectUri("google", {
      ...FULL,
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });
    expect(res.uri).toBeNull();
    const status = getOAuthConfigStatus("google", {
      ...FULL,
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });
    expect(status.ready).toBe(false);
    expect(status.missing).toContain("NEXT_PUBLIC_APP_URL (public origin)");
  });

  it("defaults to localhost:3000 outside production", () => {
    expect(
      resolveOAuthRedirectUri("microsoft", { NODE_ENV: "development" })
    ).toEqual({
      uri: "http://localhost:3000/api/oauth/microsoft/callback",
    });
  });
});

describe("migration 014 shape", () => {
  const sql = readFileSync(
    fileURLToPath(
      new URL("../../../../supabase/migrations/014_oauth_connections.sql", import.meta.url)
    ),
    "utf8"
  );

  it("creates oauth_connections with encrypted-token columns and constraints", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS oauth_connections");
    for (const col of [
      "workspace_id",
      "account_id",
      "provider",
      "provider_account_email",
      "scopes",
      "access_token_enc",
      "refresh_token_enc",
      "token_expires_at",
      "status",
      "created_at",
      "updated_at",
    ]) {
      expect(sql).toContain(col);
    }
    expect(sql).toContain("CHECK (provider IN ('google', 'microsoft'))");
    expect(sql).toContain("REFERENCES connected_accounts(id) ON DELETE CASCADE");
    expect(sql).toContain("REFERENCES workspaces(id) ON DELETE CASCADE");
    expect(sql).toContain("UNIQUE (account_id)");
  });

  it("enables RLS with NO client policies (service-role only)", () => {
    expect(sql).toContain("ALTER TABLE oauth_connections ENABLE ROW LEVEL SECURITY");
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });
});
