import { NextResponse } from "next/server";
import { resolveCenterContext } from "@/lib/integrations-center/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/data/mode";
import {
  buildOAuthErrorRedirect,
  buildOAuthSuccessRedirect,
  issueAuthorizationCode,
  validateAuthorizeRequest,
} from "@/lib/muse-connector/oauth/authorize";
import {
  createSupabaseMuseOAuthStore,
  getOAuthIssuer,
  isCimdClientId,
  platformLabel,
  recordMuseOAuthEvent,
  resolveCimdClient,
  SCOPE_DESCRIPTIONS,
  signMuseAuthorizeState,
  verifyMuseAuthorizeState,
  type MuseOAuthClientRow,
  type OAuthClientPlatform,
  type OAuthScope,
} from "@/lib/muse-connector/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/muse/oauth/authorize — OAuth 2.1 authorization endpoint.
 *
 * Requires a signed-in NxtSend user (Supabase cookie session, via
 * resolveCenterContext — the same guard the Integration Center
 * uses). Demo Mode is REFUSED with a plain error page: no grant may
 * ever be issued for the demo persona. On success the route renders
 * the consent screen (NxtSend dark design, inline-styled HTML);
 * approval is a POST back to this route.
 *
 * Invalid requests redirect with OAuth error params when a valid
 * redirect_uri exists, else a plain error page — never leak
 * internals.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function errorPage(title: string, message: string, status = 400): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} — NxtSend</title></head>` +
      `<body style="margin:0;background:#070614;color:#f2f1fb;font-family:Manrope,ui-sans-serif,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;">` +
      `<main style="max-width:480px;width:100%;background:#191825;border:1px solid #2a2942;border-radius:16px;padding:32px;">` +
      `<h1 style="margin:0 0 8px;font-size:20px;">${escapeHtml(title)}</h1>` +
      `<p style="margin:0;color:#bdbdd1;line-height:1.6;">${escapeHtml(message)}</p>` +
      `</main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

function consentPage(input: {
  clientName: string;
  clientOrigin: string | null;
  platform: OAuthClientPlatform;
  redirectUri: string;
  scopes: OAuthScope[];
  workspaceLabel: string;
  userLabel: string;
  signedState: string;
}): NextResponse {
  const scopeItems = input.scopes
    .map(
      (scope) =>
        `<li style="margin:0 0 10px;line-height:1.5;"><strong style="color:#f2f1fb;">${escapeHtml(scope)}</strong><br><span style="color:#bdbdd1;">${escapeHtml(SCOPE_DESCRIPTIONS[scope])}</span></li>`
    )
    .join("");
  const platformName = platformLabel(input.platform);
  // The MCP authorization spec requires the consent screen to show
  // the redirect URI's hostname clearly, so the user can see where
  // they will be sent back to after approving.
  let redirectHost: string | null = null;
  try {
    redirectHost = new URL(input.redirectUri).hostname;
  } catch {
    redirectHost = null;
  }
  const originLine = input.clientOrigin
    ? `<p style="margin:0 0 20px;color:#bdbdd1;line-height:1.6;">Connecting from <strong style="color:#f2f1fb;">${escapeHtml(input.clientOrigin)}</strong> (${escapeHtml(platformName)}).</p>`
    : "";
  const redirectLine = redirectHost
    ? `<p style="margin:0 0 20px;color:#bdbdd1;line-height:1.6;">After you approve, you will be sent back to <strong style="color:#f2f1fb;">${escapeHtml(redirectHost)}</strong>.</p>`
    : "";
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Connect to NxtSend</title></head>` +
    `<body style="margin:0;background:#070614;color:#f2f1fb;font-family:Manrope,ui-sans-serif,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;">` +
    `<main style="max-width:520px;width:100%;background:#191825;border:1px solid #2a2942;border-radius:16px;padding:32px;">` +
    `<p style="margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8a7aff;">NxtSend</p>` +
    `<h1 style="margin:0 0 8px;font-size:22px;">Connect <span style="color:#8a7aff;">${escapeHtml(input.clientName)}</span> to NxtSend?</h1>` +
    `<p style="margin:0 0 8px;color:#bdbdd1;line-height:1.6;">${escapeHtml(platformName)} is asking to access your NxtSend account <strong style="color:#f2f1fb;">${escapeHtml(input.userLabel)}</strong> in workspace <strong style="color:#f2f1fb;">${escapeHtml(input.workspaceLabel)}</strong>. It will be able to:</p>` +
    originLine +
    redirectLine +
    `<ul style="margin:0 0 20px;padding-left:20px;">${scopeItems}</ul>` +
    `<p style="margin:0 0 24px;color:#898ca2;font-size:13px;line-height:1.6;">${input.platform === "zapier" ? "Zapier will act with the permissions above on your behalf until you revoke this connection. It never sends LinkedIn messages." : input.platform === "n8n" ? "n8n will act with the permissions above on your behalf until you revoke this connection. It never sends LinkedIn messages." : `You can revoke this access at any time. Sending email and deleting leads always need your approval in ${escapeHtml(platformName)}, every time.`}</p>` +
    `<form method="post" action="/api/muse/oauth/authorize" style="display:flex;gap:12px;">` +
    `<input type="hidden" name="muse_state" value="${escapeHtml(input.signedState)}">` +
    `<button type="submit" name="decision" value="approve" style="flex:1;background:#642cff;color:#fff;border:0;border-radius:10px;padding:12px 16px;font-size:15px;font-weight:600;cursor:pointer;">Allow access</button>` +
    `<button type="submit" name="decision" value="deny" style="flex:1;background:transparent;color:#f2f1fb;border:1px solid #3a3956;border-radius:10px;padding:12px 16px;font-size:15px;font-weight:600;cursor:pointer;">Deny</button>` +
    `</form></main></body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function GET(req: Request) {
  const ctx = await resolveCenterContext();
  if (!ctx.ok) return ctx.response;
  if (ctx.mode === "demo" || getDataMode() === "demo") {
    return errorPage(
      "Muse connection unavailable",
      "NxtSend is running in Demo Mode, so no Muse connection can be created. Connect a real Supabase project first — demo data is never shared with Muse.",
      503
    );
  }
  if (!ctx.userId) {
    return errorPage("Sign in required", "Sign in to NxtSend before connecting Muse.", 401);
  }
  const admin = createAdminClient();
  if (!admin) {
    return errorPage(
      "Muse connection unavailable",
      "The server is not configured for Muse connections right now. Please try again later.",
      503
    );
  }
  const store = createSupabaseMuseOAuthStore(admin);
  const url = new URL(req.url);
  const origin = getOAuthIssuer(url.origin);
  const params = {
    client_id: url.searchParams.get("client_id"),
    redirect_uri: url.searchParams.get("redirect_uri"),
    response_type: url.searchParams.get("response_type"),
    scope: url.searchParams.get("scope"),
    state: url.searchParams.get("state"),
    code_challenge: url.searchParams.get("code_challenge"),
    code_challenge_method: url.searchParams.get("code_challenge_method"),
    resource: url.searchParams.get("resource"),
  };
  // Client lookup: a registered (DCR) client first; a `client_id`
  // that is an https URL is resolved as a CIMD client (ephemeral —
  // validated per request, never stored). A CIMD fetch/validation
  // failure has no verified redirect URI, so it is a plain error
  // page, never a redirect.
  let client: MuseOAuthClientRow | null = params.client_id
    ? await store.getClient(params.client_id)
    : null;
  if (!client && params.client_id && isCimdClientId(params.client_id)) {
    const resolved = await resolveCimdClient(params.client_id);
    if (!resolved.ok) {
      return errorPage("Invalid authorization request", resolved.detail);
    }
    client = resolved.client;
  }
  const validation = validateAuthorizeRequest(params, client, { origin });
  if (!validation.ok) {
    if (validation.redirectUri) {
      return NextResponse.redirect(
        buildOAuthErrorRedirect(
          validation.redirectUri,
          validation.error,
          validation.errorDescription,
          validation.clientState,
          origin
        )
      );
    }
    return errorPage("Invalid authorization request", validation.errorDescription);
  }
  const { request } = validation;
  const signedState = signMuseAuthorizeState({
    clientId: request.client.client_id,
    redirectUri: request.redirectUri,
    scopes: request.scopes,
    codeChallenge: request.codeChallenge,
    clientState: request.clientState,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    resource: request.resource,
    platform: request.platform,
    clientOrigin: request.clientOrigin,
  });
  if (!signedState) {
    return errorPage(
      "Muse connection unavailable",
      "The server could not start the authorization flow (signing key not configured). Please try again later.",
      503
    );
  }
  return consentPage({
    clientName: request.client.name,
    clientOrigin: request.clientOrigin,
    platform: request.platform,
    redirectUri: request.redirectUri,
    scopes: request.scopes,
    workspaceLabel: ctx.workspaceId,
    userLabel: ctx.userId,
    signedState,
  });
}

export async function POST(req: Request) {
  const ctx = await resolveCenterContext();
  if (!ctx.ok) return ctx.response;
  if (ctx.mode === "demo" || getDataMode() === "demo" || !ctx.userId) {
    return errorPage(
      "Muse connection unavailable",
      "This authorization request cannot be completed in Demo Mode or without a signed-in NxtSend user.",
      401
    );
  }
  const form = await req.formData().catch(() => null);
  if (!form) return errorPage("Invalid request", "The consent form could not be read.", 400);
  const signedState = String(form.get("muse_state") ?? "");
  const decision = String(form.get("decision") ?? "");
  const claims = verifyMuseAuthorizeState(signedState, {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });
  if (!claims) {
    return errorPage(
      "Authorization expired",
      "This consent request has expired or is no longer valid. Please start the connection again.",
      400
    );
  }
  const platformName = platformLabel(claims.platform ?? "muse");
  const issuer = getOAuthIssuer(new URL(req.url).origin);
  const admin = createAdminClient();
  if (!admin) {
    return errorPage(
      "Muse connection unavailable",
      "The server is not configured for Muse connections right now. Please try again later.",
      503
    );
  }
  const store = createSupabaseMuseOAuthStore(admin);
  if (decision === "deny") {
    await recordMuseOAuthEvent({
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      action: "MUSE_OAUTH_DENY",
      resource: `muse_oauth_client:${claims.clientId}`,
      details: `User denied the ${platformName} authorization request.`,
    });
    return NextResponse.redirect(
      buildOAuthErrorRedirect(
        claims.redirectUri,
        "access_denied",
        "The user denied the authorization request.",
        claims.clientState,
        issuer
      )
    );
  }
  if (decision !== "approve") {
    return errorPage("Invalid request", "Unknown consent decision.", 400);
  }
  // CIMD clients are ephemeral (never stored): re-resolve the
  // document; registered clients are looked up in the store.
  let client: MuseOAuthClientRow | null = null;
  if (isCimdClientId(claims.clientId)) {
    const resolved = await resolveCimdClient(claims.clientId);
    client = resolved.ok ? resolved.client : null;
  } else {
    client = await store.getClient(claims.clientId);
  }
  if (!client) {
    return errorPage("Invalid authorization request", "The client is no longer registered.", 400);
  }
  const code = await issueAuthorizationCode(store, {
    clientId: claims.clientId,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    scopes: claims.scopes,
    codeChallenge: claims.codeChallenge,
    redirectUri: claims.redirectUri,
    resource: claims.resource ?? null,
  });
  await recordMuseOAuthEvent({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: "MUSE_OAUTH_GRANT",
    resource: `muse_oauth_client:${claims.clientId}`,
    details: `User approved ${platformName} access (scopes: ${claims.scopes.join(" ")}).`,
  });
  return NextResponse.redirect(
    buildOAuthSuccessRedirect(claims.redirectUri, code, claims.clientState, issuer)
  );
}
