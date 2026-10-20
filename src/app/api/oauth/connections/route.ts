import { NextResponse } from "next/server";
import { resolveCenterContext } from "@/lib/integrations-center/server";
import { getOAuthConfigStatus } from "@/lib/oauth/config";
import { createSupabaseOAuthStore } from "@/lib/oauth/store";
import type { OAuthProvider } from "@/lib/oauth/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/oauth/connections
 *
 * The ONLY API surface for OAuth connection data — and it returns
 * METADATA ONLY: per connection, the provider, mailbox address,
 * grant status, token expiry (a timestamp), scopes and the linked
 * account's recorded auth health. Token material (plaintext or
 * ciphertext) is never selected into a response; the store's
 * metadata mapper (src/lib/oauth/store.ts) has no token fields to
 * leak. Guarded by the Integration Center context (session +
 * workspace in live mode).
 *
 * `providers` carries configuration BOOLEANS per provider (client
 * configured / vault configured / the redirect URI to register —
 * a public URL, not a secret) so the panel can explain exactly what
 * live setup is missing.
 */
export async function GET() {
  const ctx = await resolveCenterContext();
  if (!ctx.ok) return ctx.response;

  const providers = (["google", "microsoft"] as OAuthProvider[]).map(
    (provider) => {
      const status = getOAuthConfigStatus(provider);
      return {
        provider,
        clientConfigured: status.clientConfigured,
        vaultConfigured: status.vaultConfigured,
        redirectUri: status.redirectUri,
        missing: status.missing,
        ready: status.ready,
      };
    }
  );

  if (ctx.mode === "demo" || !ctx.admin) {
    return NextResponse.json({
      mode: ctx.mode,
      providers,
      connections: [],
    });
  }

  const store = createSupabaseOAuthStore(ctx.admin);
  const connections = await store.listConnectionViews(ctx.workspaceId);
  return NextResponse.json({ mode: ctx.mode, providers, connections });
}
