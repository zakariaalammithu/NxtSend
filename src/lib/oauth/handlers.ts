/**
 * OAuth route handlers — the HTTP shell around ./service.ts, shared
 * by the Google and Microsoft route files.
 *
 * Connect: a top-level browser navigation (the Connect button), so
 * EVERY outcome is a redirect back into the app with an honest
 * `oauth_error` code in the query string — Demo Mode and missing
 * configuration explain themselves on the integration page instead
 * of dead-ending. Only with full configuration does the redirect go
 * to the provider's consent screen (with the signed state).
 *
 * Callback: the provider's redirect target. Failures land on the
 * Connected Accounts page with a generic error code (the detail is
 * logged server-side); success lands there with the connected
 * mailbox address. Nothing is stored on any failure path — the
 * service enforces that.
 */

import { NextResponse } from "next/server";
import { resolveCenterContext } from "@/lib/integrations-center/server";
import { getOAuthClientConfig, getOAuthConfigStatus } from "./config";
import { signOAuthState } from "./state";
import { handleOAuthCallback, OAuthFlowError } from "./service";
import { buildGoogleAuthUrl } from "./google";
import { buildMicrosoftAuthUrl } from "./microsoft";
import type { OAuthProvider } from "./types";

export function oauthIntegrationPath(provider: OAuthProvider): string {
  return `/dashboard/integrations/${provider === "google" ? "gmail" : "microsoft"}`;
}

export async function handleOAuthConnect(
  provider: OAuthProvider,
  req: Request
): Promise<NextResponse> {
  const ctx = await resolveCenterContext();
  if (!ctx.ok) return ctx.response;

  const detail = (qs: string) =>
    NextResponse.redirect(new URL(`${oauthIntegrationPath(provider)}?${qs}`, req.url));

  if (ctx.mode === "demo") {
    // Demo Mode must NOT fake a connection: explain instead.
    return detail("oauth_error=demo_mode");
  }
  if (!ctx.userId) {
    return detail("oauth_error=unauthorized");
  }

  const status = getOAuthConfigStatus(provider);
  if (!status.ready) {
    return detail(
      `oauth_error=not_configured&missing=${encodeURIComponent(status.missing.join(","))}`
    );
  }
  const config = getOAuthClientConfig(provider);
  if (!config) {
    return detail("oauth_error=not_configured");
  }
  const state = signOAuthState({
    provider,
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
  });
  if (!state) {
    return detail("oauth_error=not_configured&missing=TOKEN_ENCRYPTION_KEY");
  }

  return NextResponse.redirect(
    provider === "google"
      ? buildGoogleAuthUrl(config, state)
      : buildMicrosoftAuthUrl(config, state)
  );
}

export async function handleOAuthCallbackRoute(
  provider: OAuthProvider,
  req: Request
): Promise<NextResponse> {
  const url = new URL(req.url);
  const accounts = (qs: string) =>
    NextResponse.redirect(new URL(`/dashboard/accounts?${qs}`, req.url));

  if (url.searchParams.get("error")) {
    // The user (or the provider) declined/errored at consent.
    return accounts(`oauth_error=provider_denied&provider=${provider}`);
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return accounts("oauth_error=invalid_callback");
  }

  const ctx = await resolveCenterContext();
  if (!ctx.ok) return ctx.response;
  if (ctx.mode === "demo") {
    return accounts("oauth_error=demo_mode");
  }
  if (!ctx.userId || !ctx.admin) {
    return accounts("oauth_error=not_configured");
  }

  try {
    const result = await handleOAuthCallback(
      provider,
      {
        code,
        stateToken: state,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      },
      { admin: ctx.admin }
    );
    return accounts(
      `oauth_connected=${provider}&mailbox=${encodeURIComponent(result.email)}`
    );
  } catch (err) {
    const code2 = err instanceof OAuthFlowError ? err.code : "exchange_failed";
    console.error(
      `[OAuth] ${provider} callback failed (${code2}):`,
      err instanceof Error ? err.message : err
    );
    return accounts(`oauth_error=${code2}&provider=${provider}`);
  }
}
