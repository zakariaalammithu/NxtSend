import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import {
  decryptHubSecret,
  encryptHubSecret,
  getHubEncryptionKey,
  hubSecretLast4,
  isHubVaultConfigured,
  HubVaultError,
} from "../crypto";

const KEY_A = randomBytes(32).toString("base64");
const KEY_B = randomBytes(32).toString("base64");
const envA = { INTEGRATION_HUB_ENCRYPTION_KEY: KEY_A };
const envB = { INTEGRATION_HUB_ENCRYPTION_KEY: KEY_B };

describe("Hub vault crypto", () => {
  it("round-trips a secret", () => {
    const envelope = encryptHubSecret("super-secret-value-123", envA);
    expect(envelope.startsWith("v1.")).toBe(true);
    expect(envelope.split(".")).toHaveLength(4);
    expect(decryptHubSecret(envelope, envA)).toBe("super-secret-value-123");
  });

  it("produces a different envelope each time (random IV)", () => {
    const a = encryptHubSecret("same-value", envA);
    const b = encryptHubSecret("same-value", envA);
    expect(a).not.toBe(b);
    expect(decryptHubSecret(a, envA)).toBe("same-value");
    expect(decryptHubSecret(b, envA)).toBe("same-value");
  });

  it("never embeds the plaintext in the envelope", () => {
    const envelope = encryptHubSecret("canary-plaintext-999", envA);
    expect(envelope).not.toContain("canary");
    expect(envelope).not.toContain("999");
  });

  it("fails closed on a tampered ciphertext", () => {
    const envelope = encryptHubSecret("tamper-target", envA);
    const parts = envelope.split(".");
    const ct = Buffer.from(parts[3], "base64url");
    ct[0] = ct[0] ^ 0xff;
    parts[3] = ct.toString("base64url");
    expect(() => decryptHubSecret(parts.join("."), envA)).toThrow(HubVaultError);
  });

  it("fails closed on a tampered auth tag", () => {
    const envelope = encryptHubSecret("tamper-target", envA);
    const parts = envelope.split(".");
    const tag = Buffer.from(parts[2], "base64url");
    tag[0] = tag[0] ^ 0xff;
    parts[2] = tag.toString("base64url");
    expect(() => decryptHubSecret(parts.join("."), envA)).toThrow(HubVaultError);
  });

  it("fails closed with the wrong key", () => {
    const envelope = encryptHubSecret("wrong-key-target", envA);
    expect(() => decryptHubSecret(envelope, envB)).toThrow(HubVaultError);
    expect(() => decryptHubSecret(envelope, envB)).toThrow(/could not be decrypted/);
  });

  it("fails closed on malformed envelopes", () => {
    expect(() => decryptHubSecret("", envA)).toThrow(HubVaultError);
    expect(() => decryptHubSecret("not-an-envelope", envA)).toThrow(HubVaultError);
    expect(() => decryptHubSecret("v2.aaaa.bbbb.cccc", envA)).toThrow(/unsupported format/);
    expect(() => decryptHubSecret("v1.only.two", envA)).toThrow(HubVaultError);
  });

  it("rejects a missing key", () => {
    expect(() => encryptHubSecret("x", {})).toThrow(HubVaultError);
    expect(() => encryptHubSecret("x", {})).toThrow(/is not set/);
    expect(isHubVaultConfigured({})).toBe(false);
  });

  it("rejects placeholder keys", () => {
    const placeholder = {
      INTEGRATION_HUB_ENCRYPTION_KEY: "change-me-generate-with-openssl-rand-base64-32",
    };
    expect(() => getHubEncryptionKey(placeholder)).toThrow(/placeholder/);
    expect(isHubVaultConfigured(placeholder)).toBe(false);
    expect(
      isHubVaultConfigured({ INTEGRATION_HUB_ENCRYPTION_KEY: "your-key-here" })
    ).toBe(false);
  });

  it("rejects keys that are not exactly 32 bytes", () => {
    const short = { INTEGRATION_HUB_ENCRYPTION_KEY: randomBytes(16).toString("base64") };
    expect(() => getHubEncryptionKey(short)).toThrow(/exactly 32 bytes/);
    expect(isHubVaultConfigured(short)).toBe(false);
    const long = { INTEGRATION_HUB_ENCRYPTION_KEY: randomBytes(64).toString("base64") };
    expect(() => getHubEncryptionKey(long)).toThrow(/exactly 32 bytes/);
  });

  it("rejects an empty plaintext", () => {
    expect(() => encryptHubSecret("", envA)).toThrow(/empty credential value/);
  });

  it("accepts a valid key", () => {
    expect(isHubVaultConfigured(envA)).toBe(true);
    expect(getHubEncryptionKey(envA)).toHaveLength(32);
  });

  it("computes last4 fragments", () => {
    expect(hubSecretLast4("abcdefgh")).toBe("efgh");
    expect(hubSecretLast4("ab")).toBe("ab");
  });
});
