/**
 * OAuth provider configuration — derived from env presence only.
 *
 * Connecting a mailbox needs, per provider: an OAuth client
 * (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET, or MICROSOFT_CLIENT_ID +
 * MICROSOFT_CLIENT_SECRET) created in the provider's console with the
 * callback URL below registered, PLUS the token-vault key
 * (TOKEN_ENCRYPTION_KEY, see ./crypto.ts) — without it tokens cannot
 * be stored, so the connect flow refuses BEFORE redirecting to the
 * provider instead of failing after the user consents.
 *
 * Redirect URIs are derived from NEXT_PUBLIC_APP_URL (never stored as
 * a separate env var): <app origin>/api/oauth/<provider>/callback.
 * The exact URLs to register are documented in SETUP.md §15 and
 * PRODUCTION.md §4, and shown on the Integration Center pages. The
 * production guard mirrors billing (src/lib/billing/app-url.ts): in
 * production the app URL must be a real public origin — a localhost
 * redirect URI would strand the OAuth flow.
 */

import { isConfiguredValue } from "@/lib/env";
import { isTokenEncryptionConfigured } from "./crypto";
import type { OAuthProvider } from "./types";

export interface OAuthEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  NEXT_PUBLIC_APP_URL?: string;
  NODE_ENV?: string;
}

function envFromProcess(): OAuthEnv {
  return {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
    MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
    TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NODE_ENV: process.env.NODE_ENV,
  };
}

/** The callback path per provider — register the full URL (below). */
export const OAUTH_CALLBACK_PATHS: Record<OAuthProvider, string> = {
  google: "/api/oauth/google/callback",
  microsoft: "/api/oauth/microsoft/callback",
};

export const OAUTH_PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: "Gmail",
  microsoft: "Outlook (Microsoft 365)",
};

/**
 * Scopes requested at consent. Gmail: send + read (read is what a
 * future inbound-sync would use; today sending is the wired path)
 * + OpenID identity for the profile. Microsoft: the Graph delegated
 * mail scopes + offline_access (issues the refresh token).
 */
export const GOOGLE_SCOPES: readonly string[] = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export const MICROSOFT_SCOPES: readonly string[] = [
  "offline_access",
  "User.Read",
  "Mail.Send",
  "Mail.Read",
];

const CLIENT_VARS: Record<OAuthProvider, { id: string; secret: string }> = {
  google: { id: "GOOGLE_CLIENT_ID", secret: "GOOGLE_CLIENT_SECRET" },
  microsoft: { id: "MICROSOFT_CLIENT_ID", secret: "MICROSOFT_CLIENT_SECRET" },
};

export type OAuthRedirectResolution =
  | { uri: string }
  | { uri: null; reason: string };

/**
 * Resolves the OAuth redirect URI for a provider from
 * NEXT_PUBLIC_APP_URL, with the billing-style production guard:
 * production + unset/localhost/invalid → no URI (the connect flow
 * refuses with the reason); development defaults to localhost:3000.
 */
export function resolveOAuthRedirectUri(
  provider: OAuthProvider,
  env: OAuthEnv = envFromProcess()
): OAuthRedirectResolution {
  const path = OAUTH_CALLBACK_PATHS[provider];
  const raw = env.NEXT_PUBLIC_APP_URL?.trim();
  const isProduction = env.NODE_ENV === "production";
  if (isConfiguredValue(raw)) {
    let hostname = "";
    try {
      hostname = new URL(raw as string).hostname;
    } catch {
      return {
        uri: null,
        reason: `NEXT_PUBLIC_APP_URL is not a valid URL ("${raw}").`,
      };
    }
    if (isProduction && (hostname === "localhost" || hostname === "127.0.0.1")) {
      return {
        uri: null,
        reason:
          "NEXT_PUBLIC_APP_URL points at localhost in a production build, so no OAuth redirect URI can be built (the provider would send the user back to localhost). Set NEXT_PUBLIC_APP_URL to the public origin.",
      };
    }
    return { uri: `${(raw as string).replace(/\/+$/, "")}${path}` };
  }
  if (isProduction) {
    return {
      uri: null,
      reason:
        "NEXT_PUBLIC_APP_URL is not configured, so no OAuth redirect URI can be built. Set it to the public origin (see SETUP.md §15).",
    };
  }
  return { uri: `http://localhost:3000${path}` };
}

export interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface OAuthConfigStatus {
  provider: OAuthProvider;
  /** Client id + secret both hold plausibly real values. */
  clientConfigured: boolean;
  /** TOKEN_ENCRYPTION_KEY decodes to a valid 32-byte key. */
  vaultConfigured: boolean;
  /** The redirect URI that must be registered at the provider. */
  redirectUri: string | null;
  redirectProblem: string | null;
  /**
   * Names of the env vars / conditions still missing before a
   * connect can succeed — NAMES ONLY, never values.
   */
  missing: string[];
  /** True when a connect attempt can actually run end to end. */
  ready: boolean;
}

export function getOAuthConfigStatus(
  provider: OAuthProvider,
  env: OAuthEnv = envFromProcess()
): OAuthConfigStatus {
  const vars = CLIENT_VARS[provider];
  const missing: string[] = [];
  const clientId = env[vars.id as keyof OAuthEnv];
  const clientSecret = env[vars.secret as keyof OAuthEnv];
  if (!isConfiguredValue(clientId)) missing.push(vars.id);
  if (!isConfiguredValue(clientSecret)) missing.push(vars.secret);
  const clientConfigured = missing.length === 0;

  const vaultConfigured = isTokenEncryptionConfigured(env);
  if (!vaultConfigured) missing.push("TOKEN_ENCRYPTION_KEY");

  const redirect = resolveOAuthRedirectUri(provider, env);
  if (!redirect.uri) missing.push("NEXT_PUBLIC_APP_URL (public origin)");

  return {
    provider,
    clientConfigured,
    vaultConfigured,
    redirectUri: redirect.uri,
    redirectProblem: "reason" in redirect ? redirect.reason : null,
    missing,
    ready: missing.length === 0,
  };
}

/**
 * The full client config, or null when anything required is missing
 * (callers use getOAuthConfigStatus for the itemized reason).
 */
export function getOAuthClientConfig(
  provider: OAuthProvider,
  env: OAuthEnv = envFromProcess()
): OAuthClientConfig | null {
  const status = getOAuthConfigStatus(provider, env);
  if (!status.ready || !status.redirectUri) return null;
  const vars = CLIENT_VARS[provider];
  return {
    clientId: (env[vars.id as keyof OAuthEnv] as string).trim(),
    clientSecret: (env[vars.secret as keyof OAuthEnv] as string).trim(),
    redirectUri: status.redirectUri,
  };
}
