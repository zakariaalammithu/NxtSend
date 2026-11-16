import { NextResponse } from "next/server";
import { ALL_OAUTH_SCOPES, getMusePublicUrl } from "@/lib/muse-connector/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /.well-known/oauth-authorization-server — RFC 8414 OAuth 2.0
 * Authorization Server Metadata.
 *
 * One authorization server serves both platforms (Muse and
 * ChatGPT): the same authorize / token / revoke / register
 * endpoints, PKCE S256 only, authorization_code + refresh_token
 * grants, and both scope sets. `private_key_jwt` is deliberately
 * NOT listed under token_endpoint_auth_methods_supported — it is
 * not implemented (see src/lib/muse-connector/oauth/cimd.ts):
 * clients authenticate as public clients ("none") or as
 * confidential clients registered via DCR ("client_secret_post").
 */
export async function GET(req: Request) {
  const origin = getMusePublicUrl(new URL(req.url).origin);
  if (!origin) {
    return NextResponse.json(
      { error: "The public URL of this deployment is not configured." },
      { status: 503 }
    );
  }
  return NextResponse.json({
    issuer: origin,
    authorization_endpoint: `${origin}/api/muse/oauth/authorize`,
    token_endpoint: `${origin}/api/muse/oauth/token`,
    revocation_endpoint: `${origin}/api/muse/oauth/revoke`,
    registration_endpoint: `${origin}/api/muse/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [...ALL_OAUTH_SCOPES],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_post"],
  });
}
