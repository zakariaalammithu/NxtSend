/**
 * Muse request context — THE contract the MCP worker imports.
 *
 * resolveMuseContext(req) parses `Authorization: Bearer <token>`
 * and verifies it as a Muse access token. It REFUSES demo mode
 * (getDataMode() === "demo" → null, fail closed): the demo persona
 * has userId null and must never be served to Muse.
 *
 * RFC 8707 audience: the expected resource is derived from the
 * request URL — /api/mcp/chatgpt expects a token bound to the
 * ChatGPT MCP resource, /api/mcp expects one bound to the Muse
 * resource. A token issued for one resource NEVER verifies for the
 * other. Legacy tokens (stored with no resource) verify against
 * the Muse resource only.
 *
 * Return shape (stable — do not change without telling the MCP
 * worker): `{ userId, workspaceId, scopes, clientId, grantId,
 * resource } | null`. `grantId` is the `client_id:user_id` pair
 * (there is no separate grant row; see tokens.ts).
 */

import { getDataMode, type DataMode } from "@/lib/data/mode";
import { createAdminClient } from "@/lib/supabase/server";
import type { MuseOAuthStore } from "./store";
import { createSupabaseMuseOAuthStore } from "./store";
import { verifyMuseAccessToken, type MuseAccessContext } from "./tokens";
import { getMcpResourceUrl, resourcePlatform } from "./config";

export interface ResolveMuseContextDeps {
  store?: MuseOAuthStore;
  mode?: DataMode;
  now?: Date;
  /**
   * Override the expected resource (audience). When omitted it is
   * derived from the request URL (see below).
   */
  resource?: string | null;
}

export async function resolveMuseContext(
  req: Request,
  deps: ResolveMuseContextDeps = {}
): Promise<MuseAccessContext | null> {
  const mode = deps.mode ?? getDataMode();
  if (mode === "demo") return null;
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice("Bearer ".length).trim();
  if (!token) return null;
  const store = deps.store ?? (await getMuseOAuthStore());
  if (!store) return null;
  const url = new URL(req.url);
  const origin = url.origin;
  // Expected audience from the resource being called. A request
  // outside the two MCP resources carries no audience expectation
  // (no enforcement, context still reports the token's audience).
  let expectedResource: string | null = deps.resource ?? null;
  if (deps.resource === undefined) {
    const platform = resourcePlatform(url.href);
    expectedResource = platform ? getMcpResourceUrl(origin, platform) : null;
  }
  return verifyMuseAccessToken(token, {
    store,
    mode,
    now: deps.now,
    resource: expectedResource,
    origin,
  });
}

async function getMuseOAuthStore(): Promise<MuseOAuthStore | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  return createSupabaseMuseOAuthStore(admin);
}
