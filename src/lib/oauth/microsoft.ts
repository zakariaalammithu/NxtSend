/**
 * Microsoft identity platform OAuth + Graph profile client
 * (server-side only).
 *
 * Plain documented endpoints, called with an injectable fetch:
 *   authorize  https://login.microsoftonline.com/common/oauth2/v2.0/authorize
 *   token      https://login.microsoftonline.com/common/oauth2/v2.0/token
 *   profile    https://graph.microsoft.com/v1.0/me
 *
 * Tenant "common": work/school AND personal Microsoft accounts can
 * connect (the app registration must allow both — SETUP.md §15).
 *
 * The mailbox address comes from Graph /me for the granted token
 * itself (`mail`, falling back to `userPrincipalName`) — never from
 * anything the browser claimed. NOTE: Microsoft offers no simple
 * token-revocation endpoint for this flow; disconnect therefore
 * means deleting the stored grant locally (the user can also remove
 * the app's consent in their Microsoft account) — the disconnect
 * service says exactly that rather than pretending a revocation
 * happened. Provider error text comes from Microsoft's documented
 * error fields; client secrets never appear in errors.
 */

import { MICROSOFT_SCOPES, type OAuthClientConfig } from "./config";
import type { OAuthProfile, OAuthTokenSet } from "./types";
import { OAuthProviderError } from "./google";

const TENANT = "common";

export function buildMicrosoftAuthUrl(
  config: OAuthClientConfig,
  state: string
): string {
  const url = new URL(
    `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`
  );
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

interface MicrosoftTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function microsoftTokenRequest(
  config: Pick<OAuthClientConfig, "clientId" | "clientSecret">,
  params: Record<string, string>,
  fetchFn: typeof fetch
): Promise<OAuthTokenSet> {
  let res: Response;
  try {
    res = await fetchFn(
      `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          ...params,
        }).toString(),
      }
    );
  } catch (err) {
    throw new OAuthProviderError(
      `Microsoft token request failed: ${err instanceof Error ? err.message : "network error"}.`
    );
  }
  const body = (await res.json().catch(() => ({}))) as MicrosoftTokenResponse;
  if (!res.ok || !body.access_token) {
    throw new OAuthProviderError(
      `Microsoft rejected the token request (${body.error ?? `HTTP ${res.status}`}${body.error_description ? `: ${body.error_description}` : ""}).`,
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

export function exchangeMicrosoftCode(
  config: OAuthClientConfig,
  code: string,
  fetchFn: typeof fetch = fetch
): Promise<OAuthTokenSet> {
  return microsoftTokenRequest(
    config,
    {
      code,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      scope: MICROSOFT_SCOPES.join(" "),
    },
    fetchFn
  );
}

export function refreshMicrosoftToken(
  config: Pick<OAuthClientConfig, "clientId" | "clientSecret">,
  refreshToken: string,
  fetchFn: typeof fetch = fetch
): Promise<OAuthTokenSet> {
  return microsoftTokenRequest(
    config,
    {
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: MICROSOFT_SCOPES.join(" "),
    },
    fetchFn
  );
}

/** Fetches the mailbox identity for a granted token (Graph /me). */
export async function fetchMicrosoftProfile(
  accessToken: string,
  fetchFn: typeof fetch = fetch
): Promise<OAuthProfile> {
  let res: Response;
  try {
    res = await fetchFn("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    throw new OAuthProviderError(
      `Microsoft profile fetch failed: ${err instanceof Error ? err.message : "network error"}.`
    );
  }
  if (!res.ok) {
    throw new OAuthProviderError(
      `Microsoft profile fetch failed (HTTP ${res.status}).`
    );
  }
  const body = (await res.json().catch(() => ({}))) as {
    id?: string;
    mail?: string | null;
    userPrincipalName?: string;
    displayName?: string;
  };
  const email = (body.mail ?? body.userPrincipalName ?? "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) {
    throw new OAuthProviderError(
      "Microsoft did not return a mailbox address for this grant, so the connection cannot be recorded."
    );
  }
  return {
    providerAccountId: body.id ?? email,
    email,
    displayName: body.displayName?.trim() ? body.displayName.trim() : null,
  };
}
