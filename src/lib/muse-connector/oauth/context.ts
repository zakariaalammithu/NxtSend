/**
 * Muse request context — THE contract the MCP worker imports.
 *
 * resolveMuseContext(req) parses `Authorization: Bearer <token>`
 * and verifies it as a Muse access token. It REFUSES demo mode
 * (getDataMode() === "demo" → null, fail closed): the demo persona
 * has userId null and must never be served to Muse.
 *
 * Return shape (stable — do not change without telling the MCP
 * worker): `{ userId, workspaceId, scopes, clientId, grantId } | null`.
 * `grantId` is the `client_id:user_id` pair (there is no separate
 * grant row; see tokens.ts).
 */

import { getDataMode, type DataMode } from "@/lib/data/mode";
import { createAdminClient } from "@/lib/supabase/server";
import type { MuseOAuthStore } from "./store";
import { createSupabaseMuseOAuthStore } from "./store";
import { verifyMuseAccessToken, type MuseAccessContext } from "./tokens";

export interface ResolveMuseContextDeps {
  store?: MuseOAuthStore;
  mode?: DataMode;
  now?: Date;
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
  return verifyMuseAccessToken(token, { store, mode, now: deps.now });
}

async function getMuseOAuthStore(): Promise<MuseOAuthStore | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  return createSupabaseMuseOAuthStore(admin);
}
