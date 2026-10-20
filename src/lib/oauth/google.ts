/**
 * Google OAuth + Gmail profile client (server-side only).
 *
 * Plain documented endpoints, called with an injectable fetch so the
 * whole flow is unit-testable without network access:
 *   authorize  https://accounts.google.com/o/oauth2/v2/auth
 *   token      https://oauth2.googleapis.com/token
 *   revoke     https://oauth2.googleapis.com/revoke
 *   userinfo   https://openidconnect.googleapis.com/v1/userinfo
 *   profile    https://gmail.googleapis.com/gmail/v1/users/me/profile
 *
 * The profile step is what makes a connection real: the mailbox
 * address comes from the Gmail profile of the granted token itself
 * (falling back to the OpenID userinfo email) — never from anything
 * the browser claimed. Provider error text is surfaced from Google's
 * documented error fields; client secrets never appear in errors.
 */

import { GOOGLE_SCOPES, type OAuthClientConfig } from "./config";
import type { OAuthProfile, OAuthTokenSet } from "./types";

export class OAuthProviderError extends Error {
  /** The provider's machine-readable error code, when it sent one. */
  readonly providerCode: string | null;
  constructor(message: string, providerCode: string | null = null) {
    super(message);
    this.name = "OAuthProviderError";
    this.providerCode = providerCode;
  }
}

export function buildGoogleAuthUrl(
  config: OAuthClientConfig,
  state: string
): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  // offline + consent: the only combination that reliably issues a
  // refresh token on every connect (including reconnects).
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function googleTokenRequest(
  config: Pick<OAuthClientConfig, "clientId" | "clientSecret">,
  params: Record<string, string>,
  fetchFn: typeof fetch
): Promise<OAuthTokenSet> {
  let res: Response;
  try {
    res = await fetchFn("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        ...params,
      }).toString(),
    });
  } catch (err) {
    throw new OAuthProviderError(
      `Google token request failed: ${err instanceof Error ? err.message : "network error"}.`
    );
  }
  const body = (await res.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!res.ok || !body.access_token) {
    throw new OAuthProviderError(
      `Google rejected the token request (${body.error ?? `HTTP ${res.status}`}${body.error_description ? `: ${body.error_description}` : ""}).`,
      body.error ?? null
    );
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresInSec: typeof body.expires_in === "number" ? body.expires_in : null,
    scope: body.scope ?? null,
  };
}

export function exchangeGoogleCode(
  config: OAuthClientConfig,
  code: string,
  fetchFn: typeof fetch = fetch
): Promise<OAuthTokenSet> {
  return googleTokenRequest(
    config,
    { code, redirect_uri: config.redirectUri, grant_type: "authorization_code" },
    fetchFn
  );
}

export function refreshGoogleToken(
  config: Pick<OAuthClientConfig, "clientId" | "clientSecret">,
  refreshToken: string,
  fetchFn: typeof fetch = fetch
): Promise<OAuthTokenSet> {
  return googleTokenRequest(
    config,
    { refresh_token: refreshToken, grant_type: "refresh_token" },
    fetchFn
  );
}

/**
 * Fetches the mailbox identity for a granted access token: the OpenID
 * userinfo (sub + email + name) and the Gmail profile (the actual
 * mailbox address). The Gmail profile address wins when present.
 */
export async function fetchGoogleProfile(
  accessToken: string,
  fetchFn: typeof fetch = fetch
): Promise<OAuthProfile> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  let userinfo: { sub?: string; email?: string; name?: string } = {};
  let gmailProfile: { emailAddress?: string } = {};
  try {
    const [uiRes, gpRes] = await Promise.all([
      fetchFn("https://openidconnect.googleapis.com/v1/userinfo", { headers }),
      fetchFn("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers,
      }),
    ]);
    if (uiRes.ok) userinfo = (await uiRes.json().catch(() => ({}))) as typeof userinfo;
    if (gpRes.ok) gmailProfile = (await gpRes.json().catch(() => ({}))) as typeof gmailProfile;
    if (!uiRes.ok && !gpRes.ok) {
      throw new OAuthProviderError(
        `Google profile fetch failed (userinfo HTTP ${uiRes.status}, Gmail profile HTTP ${gpRes.status}).`
      );
    }
  } catch (err) {
    if (err instanceof OAuthProviderError) throw err;
    throw new OAuthProviderError(
      `Google profile fetch failed: ${err instanceof Error ? err.message : "network error"}.`
    );
  }
  const email = (gmailProfile.emailAddress ?? userinfo.email ?? "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) {
    throw new OAuthProviderError(
      "Google did not return a mailbox address for this grant, so the connection cannot be recorded."
    );
  }
  return {
    providerAccountId: userinfo.sub ?? email,
    email,
    displayName: userinfo.name?.trim() ? userinfo.name.trim() : null,
  };
}

/**
 * Best-effort token revocation (disconnect). Returns whether Google
 * accepted the revocation; callers delete the local grant either way
 * and report the outcome honestly.
 */
export async function revokeGoogleToken(
  token: string,
  fetchFn: typeof fetch = fetch
): Promise<boolean> {
  try {
    const res = await fetchFn("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });
    return res.ok;
  } catch {
    return false;
  }
}
