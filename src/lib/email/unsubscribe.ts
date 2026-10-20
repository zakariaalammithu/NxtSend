/**
 * Unsubscribe — signed one-click links, List-Unsubscribe headers and
 * the send-time footer.
 *
 * Design (P5 Stage C):
 *  - Tokens are STATELESS: base64url(JSON {v, w, e}) + "." +
 *    base64url(HMAC-SHA256(payload, key)). No database row is needed
 *    to mint or verify one, so a link minted today verifies forever
 *    (unsubscribe links must not expire — a recipient may click months
 *    later). Verification recomputes the HMAC and compares in
 *    constant time; ANY tampering (workspace, email, signature)
 *    fails closed.
 *  - Signing key resolution, in order:
 *      1. UNSUBSCRIBE_SECRET (dedicated secret — recommended), then
 *      2. a key DERIVED from SUPABASE_SERVICE_ROLE_KEY
 *         (HMAC with a fixed domain-separation label, so the service
 *         role key itself is never used as an HMAC key directly and
 *         rotating either secret behaves predictably), then
 *      3. DEMO MODE ONLY: a fixed, publicly-known demo key. Demo mode
 *         has no real mail and no real secrets; the key only ever
 *         signs tokens for the demo suppression store. It is never
 *         used when the data mode is "supabase".
 *    In live mode with neither secret available the status is
 *    "unconfigured" and NO unsubscribe URL is produced — the send
 *    path must never emit a link that cannot verify.
 *  - The URL base follows the same production rule as billing
 *    (src/lib/billing/app-url.ts): in production NEXT_PUBLIC_APP_URL
 *    must be a real public origin; unset/localhost/invalid means NO
 *    URL is produced (and the caller is told why), never a localhost
 *    link in a production email.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { isConfiguredValue } from "@/lib/env";
import { getDataMode, type DataMode } from "@/lib/data/mode";
import { normalizeEmail } from "./suppression";

export interface UnsubscribeEnv {
  UNSUBSCRIBE_SECRET?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  NEXT_PUBLIC_APP_URL?: string;
  NODE_ENV?: string;
  EMAIL_REPLY_TO?: string;
}

function envFromProcess(): UnsubscribeEnv {
  return {
    UNSUBSCRIBE_SECRET: process.env.UNSUBSCRIBE_SECRET,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NODE_ENV: process.env.NODE_ENV,
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
  };
}

export type UnsubscribeSigningStatus =
  | "configured" // UNSUBSCRIBE_SECRET set
  | "derived" // derived from SUPABASE_SERVICE_ROLE_KEY
  | "demo" // demo data mode — fixed demo key
  | "unconfigured"; // live mode, no key material available

/** Fixed demo-only key. Public by design: it signs demo tokens only. */
export const DEMO_UNSUBSCRIBE_SIGNING_KEY = "nxtsend-demo-unsubscribe-key";

const DERIVATION_LABEL = "nxtsend:unsubscribe-signing:v1";

export function getUnsubscribeSigningStatus(
  env: UnsubscribeEnv = envFromProcess(),
  mode: DataMode = getDataMode()
): UnsubscribeSigningStatus {
  if (isConfiguredValue(env.UNSUBSCRIBE_SECRET)) return "configured";
  if (isConfiguredValue(env.SUPABASE_SERVICE_ROLE_KEY)) return "derived";
  if (mode === "demo") return "demo";
  return "unconfigured";
}

/** The HMAC key material, or null when signing is unavailable. */
export function resolveUnsubscribeSigningKey(
  env: UnsubscribeEnv = envFromProcess(),
  mode: DataMode = getDataMode()
): string | null {
  if (isConfiguredValue(env.UNSUBSCRIBE_SECRET)) {
    return env.UNSUBSCRIBE_SECRET as string;
  }
  if (isConfiguredValue(env.SUPABASE_SERVICE_ROLE_KEY)) {
    return createHmac("sha256", env.SUPABASE_SERVICE_ROLE_KEY as string)
      .update(DERIVATION_LABEL)
      .digest("hex");
  }
  if (mode === "demo") return DEMO_UNSUBSCRIBE_SIGNING_KEY;
  return null;
}

// ── Token mint / verify ─────────────────────────────────────────────────────

export interface UnsubscribeClaims {
  workspaceId: string;
  email: string;
}

function b64urlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function signPayload(payloadB64: string, key: string): string {
  return createHmac("sha256", key).update(payloadB64).digest("base64url");
}

/** Mints a signed unsubscribe token, or null when no key is available. */
export function createUnsubscribeToken(
  claims: UnsubscribeClaims,
  env: UnsubscribeEnv = envFromProcess(),
  mode: DataMode = getDataMode()
): string | null {
  const key = resolveUnsubscribeSigningKey(env, mode);
  if (!key) return null;
  const email = normalizeEmail(claims.email);
  if (!claims.workspaceId || !email || !email.includes("@")) return null;
  const payload = b64urlEncode(
    JSON.stringify({ v: 1, w: claims.workspaceId, e: email })
  );
  return `${payload}.${signPayload(payload, key)}`;
}

/**
 * Verifies a token and returns its claims, or null for ANY problem
 * (bad shape, bad signature, unknown version, no key). Never throws —
 * the public endpoint treats null as "invalid link", full stop.
 */
export function verifyUnsubscribeToken(
  token: string,
  env: UnsubscribeEnv = envFromProcess(),
  mode: DataMode = getDataMode()
): UnsubscribeClaims | null {
  const key = resolveUnsubscribeSigningKey(env, mode);
  if (!key) return null;
  if (typeof token !== "string" || token.length > 2048) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = signPayload(payload, key);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { v?: unknown; w?: unknown; e?: unknown };
    if (parsed.v !== 1) return null;
    if (typeof parsed.w !== "string" || !parsed.w) return null;
    if (typeof parsed.e !== "string" || !parsed.e.includes("@")) return null;
    return { workspaceId: parsed.w, email: normalizeEmail(parsed.e) };
  } catch {
    return null;
  }
}

// ── URL ─────────────────────────────────────────────────────────────────────

export type UnsubscribeUrlResolution =
  | { url: string }
  | { url: null; reason: string };

/**
 * Resolves the public base URL for unsubscribe links, mirroring the
 * billing guard (src/lib/billing/app-url.ts): production requires a
 * real public NEXT_PUBLIC_APP_URL — never localhost.
 */
export function resolveUnsubscribeBaseUrl(
  env: UnsubscribeEnv = envFromProcess()
): UnsubscribeUrlResolution {
  const raw = env.NEXT_PUBLIC_APP_URL?.trim();
  const isProduction = env.NODE_ENV === "production";
  if (isConfiguredValue(raw)) {
    let hostname = "";
    try {
      hostname = new URL(raw as string).hostname;
    } catch {
      return {
        url: null,
        reason: `NEXT_PUBLIC_APP_URL is not a valid URL ("${raw}").`,
      };
    }
    if (isProduction && (hostname === "localhost" || hostname === "127.0.0.1")) {
      return {
        url: null,
        reason:
          "NEXT_PUBLIC_APP_URL points at localhost in a production build, so no unsubscribe link was included (a localhost link in a real email would be broken). Set NEXT_PUBLIC_APP_URL to the public origin.",
      };
    }
    return { url: (raw as string).replace(/\/+$/, "") };
  }
  if (isProduction) {
    return {
      url: null,
      reason:
        "NEXT_PUBLIC_APP_URL is not configured, so no unsubscribe link was included. Set it to the public origin so outgoing email carries a working one-click unsubscribe.",
    };
  }
  return { url: "http://localhost:3000" };
}

/** Full one-click unsubscribe URL for a recipient, or why there is none. */
export function buildUnsubscribeUrl(
  claims: UnsubscribeClaims,
  env: UnsubscribeEnv = envFromProcess(),
  mode: DataMode = getDataMode()
): UnsubscribeUrlResolution {
  const status = getUnsubscribeSigningStatus(env, mode);
  if (status === "unconfigured") {
    return {
      url: null,
      reason:
        "Unsubscribe signing is not configured (set UNSUBSCRIBE_SECRET, or SUPABASE_SERVICE_ROLE_KEY from which a signing key is derived), so no unsubscribe link was included.",
    };
  }
  const token = createUnsubscribeToken(claims, env, mode);
  if (!token) return { url: null, reason: "Could not mint an unsubscribe token." };
  const base = resolveUnsubscribeBaseUrl(env);
  if (!base.url) return base;
  return { url: `${base.url}/api/unsubscribe/${token}` };
}

// ── Headers + footer ────────────────────────────────────────────────────────

export interface OutboundUnsubscribePrep {
  /** Headers to merge into the provider payload (may be empty). */
  headers: Record<string, string>;
  /** The one-click URL when one could be built. */
  url: string | null;
  /**
   * A configuration warning worth surfacing in the send result when
   * a link SHOULD have been included but could not be (production
   * only — in development the omission is silent by design).
   */
  warning: string | null;
}

/**
 * Builds the List-Unsubscribe headers for one outbound email.
 *
 *  - List-Unsubscribe carries the HTTPS one-click URL (when one could
 *    be built) and/or a mailto to EMAIL_REPLY_TO (when set — the
 *    address replies already route to, per RFC 2369).
 *  - List-Unsubscribe-Post: List-Unsubscribe=One-Click is sent ONLY
 *    when the HTTPS URL is present (RFC 8058 one-click requires it).
 *  - When neither exists, no List-Unsubscribe header is fabricated.
 */
export function buildUnsubscribeHeaders(
  claims: UnsubscribeClaims,
  env: UnsubscribeEnv = envFromProcess(),
  mode: DataMode = getDataMode()
): OutboundUnsubscribePrep {
  const resolved = buildUnsubscribeUrl(claims, env, mode);
  const headers: Record<string, string> = {};
  const parts: string[] = [];
  const replyTo = isConfiguredValue(env.EMAIL_REPLY_TO)
    ? (env.EMAIL_REPLY_TO as string).trim()
    : null;
  if (replyTo) parts.push(`<mailto:${replyTo}>`);
  if (resolved.url) {
    parts.push(`<${resolved.url}>`);
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  if (parts.length > 0) headers["List-Unsubscribe"] = parts.join(", ");

  let warning: string | null = null;
  if (!resolved.url && env.NODE_ENV === "production" && "reason" in resolved) {
    warning = `Unsubscribe link omitted: ${resolved.reason}`;
  }
  return { headers, url: resolved.url, warning };
}

const FOOTER_TEXT = (url: string) =>
  `\n\n—\nDon't want to receive these emails? Unsubscribe: ${url}`;

const FOOTER_HTML = (url: string) =>
  `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">Don&rsquo;t want to receive these emails? <a href="${url}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a></div>`;

/**
 * Appends the visible unsubscribe line at SEND time. Pure: returns new
 * strings; the stored template/draft is never mutated. When there is
 * no URL, the bodies pass through unchanged (no link, no fake line).
 */
export function appendUnsubscribeFooter(
  bodies: { text?: string; html?: string },
  url: string | null
): { text?: string; html?: string } {
  if (!url) return bodies;
  return {
    text: bodies.text !== undefined ? bodies.text + FOOTER_TEXT(url) : undefined,
    html: bodies.html !== undefined ? bodies.html + FOOTER_HTML(url) : undefined,
  };
}

/** Masks an email for display on a public page: j***@example.com. */
export function maskEmail(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.indexOf("@");
  if (at <= 0) return "***";
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  const head = local.slice(0, 1);
  return `${head}***@${domain}`;
}
