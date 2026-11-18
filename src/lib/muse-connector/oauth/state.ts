/**
 * Muse authorize-request state — signed, bound, expiring.
 *
 * The authorize GET renders a consent screen; the approval POST must
 * prove it is answering the SAME request the signed-in user just saw.
 * This state carries the whole authorize request (client, redirect,
 * scopes, PKCE challenge, the client's opaque `state`) bound to the
 * session's user + workspace, signed with the same pattern as
 * src/lib/oauth/state.ts: stateless
 * `base64url(JSON) + "." + base64url(HMAC-SHA256)`, verified in
 * constant time, 10-minute TTL.
 *
 * Signing key: derived from the TOKEN_ENCRYPTION_KEY bytes via HMAC
 * with a Muse-specific domain-separation label (the raw key is never
 * the HMAC key). The existing mailbox state helper cannot be reused:
 * its provider type is "google" | "microsoft" only.
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getTokenEncryptionKey, type TokenVaultEnv } from "@/lib/oauth/crypto";
import { DEFAULT_OAUTH_ORIGIN, getMcpResourceUrl } from "./config";
import type { OAuthClientPlatform } from "./clients";
import type { OAuthScope } from "./scopes";

export const MUSE_AUTHORIZE_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const MUSE_STATE_LABEL = "nxtsend:muse-oauth-state:v1";

export interface MuseAuthorizeStateClaims {
  clientId: string;
  redirectUri: string;
  scopes: OAuthScope[];
  /** PKCE S256 challenge, or null for a confidential client without PKCE (Zapier). */
  codeChallenge: string | null;
  /** The OAuth client's own opaque `state` value, echoed back on redirect. */
  clientState: string | null;
  userId: string;
  workspaceId: string;
  /** RFC 8707 resource the grant is bound to (full MCP resource URL). */
  resource?: string;
  /** Which platform the client is (consent-screen wording). */
  platform?: OAuthClientPlatform;
  /** Origin of a CIMD client_id URL, else null. */
  clientOrigin?: string | null;
}

interface MuseStatePayload extends MuseAuthorizeStateClaims {
  v: 1;
  n: string;
  iat: number;
  exp: number;
}

function museStateKey(env: TokenVaultEnv): Buffer | null {
  try {
    const key = getTokenEncryptionKey(env);
    return createHmac("sha256", key).update(MUSE_STATE_LABEL).digest();
  } catch {
    return null;
  }
}

function signState(payloadB64: string, key: Buffer): string {
  return createHmac("sha256", key).update(payloadB64).digest("base64url");
}

/** Mints a signed authorize state, or null when the vault key is unavailable. */
export function signMuseAuthorizeState(
  claims: MuseAuthorizeStateClaims,
  env: TokenVaultEnv = { TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY },
  now: Date = new Date()
): string | null {
  const key = museStateKey(env);
  if (!key) return null;
  if (!claims.userId || !claims.workspaceId || !claims.clientId) return null;
  const payload: MuseStatePayload = {
    v: 1,
    ...claims,
    n: randomBytes(16).toString("base64url"),
    iat: now.getTime(),
    exp: now.getTime() + MUSE_AUTHORIZE_STATE_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${payloadB64}.${signState(payloadB64, key)}`;
}

/**
 * Verifies a signed authorize state for the CURRENT session's user +
 * workspace. Returns the claims, or null for ANY problem (bad
 * signature, wrong user/workspace, expired, malformed, no key).
 * Never throws.
 */
export function verifyMuseAuthorizeState(
  token: string,
  expected: { userId: string; workspaceId: string },
  env: TokenVaultEnv = { TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY },
  now: Date = new Date()
): MuseAuthorizeStateClaims | null {
  const key = museStateKey(env);
  if (!key) return null;
  if (typeof token !== "string" || token.length > 8192) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const payloadB64 = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expectedSig = signState(payloadB64, key);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  let parsed: MuseStatePayload;
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as MuseStatePayload;
  } catch {
    return null;
  }
  if (parsed.v !== 1) return null;
  if (parsed.userId !== expected.userId) return null;
  if (parsed.workspaceId !== expected.workspaceId) return null;
  if (typeof parsed.exp !== "number" || parsed.exp <= now.getTime()) return null;
  if (typeof parsed.iat !== "number" || parsed.iat > now.getTime() + 60_000) return null;
  if (!parsed.clientId || !parsed.redirectUri) return null;
  if (parsed.codeChallenge !== null && typeof parsed.codeChallenge !== "string") return null;
  if (!Array.isArray(parsed.scopes)) return null;
  return {
    clientId: parsed.clientId,
    redirectUri: parsed.redirectUri,
    scopes: parsed.scopes,
    codeChallenge: parsed.codeChallenge ?? null,
    clientState: parsed.clientState ?? null,
    userId: parsed.userId,
    workspaceId: parsed.workspaceId,
    // States minted before resource binding carry no resource: they
    // default to the canonical Muse resource, exactly like a
    // legacy (resource-less) token.
    resource:
      typeof parsed.resource === "string" && parsed.resource.length > 0
        ? parsed.resource
        : getMcpResourceUrl(DEFAULT_OAUTH_ORIGIN, "muse"),
    platform:
      parsed.platform === "chatgpt"
        ? "chatgpt"
        : parsed.platform === "claude"
          ? "claude"
          : parsed.platform === "zapier"
            ? "zapier"
            : parsed.platform === "n8n"
              ? "n8n"
              : parsed.platform === "make"
                ? "make"
                : parsed.platform === "pabbly"
                  ? "pabbly"
                  : parsed.platform === "albato"
                    ? "albato"
                    : parsed.platform === "activepieces"
                      ? "activepieces"
                      : "muse",
    clientOrigin: parsed.clientOrigin ?? null,
  };
}
