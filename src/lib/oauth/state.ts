/**
 * OAuth `state` parameter — signed, bound, expiring.
 *
 * The connect route mints a state token; the provider echoes it back
 * to the callback, which verifies it BEFORE exchanging the code.
 * Following the repo's token pattern (src/lib/email/unsubscribe.ts):
 * stateless `base64url(JSON) + "." + base64url(HMAC-SHA256)`,
 * verified in constant time, failing closed on ANY problem.
 *
 * Binding: the claims carry the provider, the workspace id, the
 * signed-in user's id, a random nonce, and the issue/expiry times.
 * The callback requires the claims to match the CURRENT session's
 * user + workspace, so a state token minted for one account cannot
 * attach a mailbox to another account/workspace (login-CSRF /
 * account-fixation defence), and the 10-minute TTL bounds replay.
 *
 * Signing key: derived from the TOKEN_ENCRYPTION_KEY bytes via HMAC
 * with a domain-separation label (the raw key is never the HMAC key,
 * and rotating the vault key invalidates outstanding states — an
 * acceptable 10-minute inconvenience). When the vault key is not
 * configured, no state can be minted (null) — the connect flow has
 * already refused by then, because tokens could not be stored anyway.
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getTokenEncryptionKey, type TokenVaultEnv } from "./crypto";
import type { OAuthProvider } from "./types";

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const STATE_LABEL = "nxtsend:oauth-state:v1";

export interface OAuthStateClaims {
  provider: OAuthProvider;
  workspaceId: string;
  userId: string;
}

interface StatePayload {
  v: 1;
  p: OAuthProvider;
  w: string;
  u: string;
  n: string;
  iat: number;
  exp: number;
}

function stateKey(env: TokenVaultEnv): Buffer | null {
  try {
    const key = getTokenEncryptionKey(env);
    return createHmac("sha256", key).update(STATE_LABEL).digest();
  } catch {
    return null;
  }
}

function sign(payloadB64: string, key: Buffer): string {
  return createHmac("sha256", key).update(payloadB64).digest("base64url");
}

/**
 * Mints a signed state token, or null when the vault key is
 * unavailable (connect cannot proceed — see ./config.ts).
 */
export function signOAuthState(
  claims: OAuthStateClaims,
  env: TokenVaultEnv = { TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY },
  now: Date = new Date()
): string | null {
  const key = stateKey(env);
  if (!key) return null;
  if (!claims.workspaceId || !claims.userId) return null;
  const payload: StatePayload = {
    v: 1,
    p: claims.provider,
    w: claims.workspaceId,
    u: claims.userId,
    n: randomBytes(16).toString("base64url"),
    iat: now.getTime(),
    exp: now.getTime() + OAUTH_STATE_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  return `${payloadB64}.${sign(payloadB64, key)}`;
}

/**
 * Verifies a state token for the expected provider + session binding.
 * Returns the claims, or null for ANY problem (bad signature, wrong
 * provider/workspace/user, expired, malformed, no key). Never throws.
 */
export function verifyOAuthState(
  token: string,
  expected: OAuthStateClaims,
  env: TokenVaultEnv = { TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY },
  now: Date = new Date()
): OAuthStateClaims | null {
  const key = stateKey(env);
  if (!key) return null;
  if (typeof token !== "string" || token.length > 4096) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const payloadB64 = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expectedSig = sign(payloadB64, key);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  let parsed: StatePayload;
  try {
    parsed = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as StatePayload;
  } catch {
    return null;
  }
  if (parsed.v !== 1) return null;
  if (parsed.p !== expected.provider) return null;
  if (parsed.w !== expected.workspaceId) return null;
  if (parsed.u !== expected.userId) return null;
  if (typeof parsed.exp !== "number" || parsed.exp <= now.getTime()) {
    return null;
  }
  if (
    typeof parsed.iat !== "number" ||
    parsed.iat > now.getTime() + 60_000 // 60s future-skew allowance
  ) {
    return null;
  }
  return {
    provider: parsed.p,
    workspaceId: parsed.w,
    userId: parsed.u,
  };
}
