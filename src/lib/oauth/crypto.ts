/**
 * OAuth token vault — AES-256-GCM encryption at rest (server-side only).
 *
 * Gmail / Microsoft OAuth grants are credentials. They are stored in
 * `oauth_connections` (migration 014) ONLY as ciphertext produced
 * here, keyed by TOKEN_ENCRYPTION_KEY — a base64-encoded 32-byte key
 * that lives in the server environment (Vercel), never in the
 * database, never in the browser.
 *
 * Format: `v1.<iv>.<tag>.<ciphertext>` — each part base64url. The
 * version prefix lets the scheme rotate later without ambiguity.
 * GCM's auth tag makes any tampering (or a wrong key) a hard
 * decryption failure — there is no silent garbage-plaintext path.
 *
 * Fail closed: a missing/malformed key throws TokenVaultError with an
 * operator-actionable message. Callers surface that as a
 * configuration error; nothing falls back to plaintext storage or to
 * a derived/guessable key.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "crypto";

export class TokenVaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenVaultError";
  }
}

export interface TokenVaultEnv {
  TOKEN_ENCRYPTION_KEY?: string;
}

function envFromProcess(): TokenVaultEnv {
  return { TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY };
}

export const TOKEN_KEY_GENERATION_HINT =
  "Generate one with: openssl rand -base64 32 — then set TOKEN_ENCRYPTION_KEY in the server environment (Vercel → Project → Settings → Environment Variables).";

/**
 * Loads and validates the vault key. Throws TokenVaultError when the
 * variable is unset/placeholder or does not decode to exactly 32
 * bytes — callers must treat that as "OAuth cannot operate".
 */
export function getTokenEncryptionKey(
  env: TokenVaultEnv = envFromProcess()
): Buffer {
  const raw = env.TOKEN_ENCRYPTION_KEY;
  if (!raw || !raw.trim()) {
    throw new TokenVaultError(
      `TOKEN_ENCRYPTION_KEY is not set, so OAuth tokens cannot be stored or read. ${TOKEN_KEY_GENERATION_HINT}`
    );
  }
  const value = raw.trim();
  // Placeholder shapes from .env.example count as unset.
  const lower = value.toLowerCase();
  if (
    lower.includes("placeholder") ||
    lower.includes("your-") ||
    lower.includes("your_") ||
    lower.startsWith("change-me")
  ) {
    throw new TokenVaultError(
      `TOKEN_ENCRYPTION_KEY still holds a placeholder value, so OAuth tokens cannot be stored or read. ${TOKEN_KEY_GENERATION_HINT}`
    );
  }
  let key: Buffer;
  try {
    key = Buffer.from(value, "base64");
  } catch {
    throw new TokenVaultError(
      `TOKEN_ENCRYPTION_KEY is not valid base64. ${TOKEN_KEY_GENERATION_HINT}`
    );
  }
  if (key.length !== 32) {
    throw new TokenVaultError(
      `TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}). ${TOKEN_KEY_GENERATION_HINT}`
    );
  }
  return key;
}

/** True when a valid vault key is configured — never throws. */
export function isTokenEncryptionConfigured(
  env: TokenVaultEnv = envFromProcess()
): boolean {
  try {
    getTokenEncryptionKey(env);
    return true;
  } catch {
    return false;
  }
}

/** Encrypts one token for storage. Output is the `v1.` format above. */
export function encryptToken(
  plaintext: string,
  env: TokenVaultEnv = envFromProcess()
): string {
  if (!plaintext) throw new TokenVaultError("Cannot encrypt an empty token.");
  const key = getTokenEncryptionKey(env);
  const iv = randomBytes(12); // 96-bit IV — the GCM standard.
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/**
 * Decrypts a stored token. Throws TokenVaultError on ANY problem
 * (bad format, wrong key, tampered ciphertext) — never returns
 * partial or unauthenticated plaintext.
 */
export function decryptToken(
  payload: string,
  env: TokenVaultEnv = envFromProcess()
): string {
  const key = getTokenEncryptionKey(env);
  const parts = typeof payload === "string" ? payload.split(".") : [];
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new TokenVaultError(
      "Stored OAuth token has an unrecognized format — it cannot be decrypted. The mailbox must be reconnected."
    );
  }
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const ciphertext = Buffer.from(parts[3], "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new TokenVaultError(
      "Stored OAuth token could not be decrypted (wrong TOKEN_ENCRYPTION_KEY or corrupted data). The mailbox must be reconnected."
    );
  }
}
