/**
 * Resolves the Muse grant context for an incoming MCP request —
 * re-export shim over Worker A's real implementation
 * (src/lib/muse-connector/oauth/context.ts).
 *
 * Contract (exact — A's oauth/context.ts is the source of truth):
 *   resolveMuseContext(req: Request, deps?) ->
 *     Promise<MuseAccessContext | null>
 *   (null when unauthenticated, expired, revoked, or demo mode.)
 *
 * Worker B originally stubbed this file; A has since landed the real
 * server (Supabase-backed token store, hash-only lookup), so this
 * file re-exports it. The MCP route imports through here, so the
 * contract path (`@/lib/muse-connector/context`) stays as specified.
 */

export { resolveMuseContext } from "./oauth/context";
export type { ResolveMuseContextDeps } from "./oauth/context";
export type { MuseAccessContext as MuseGrantContext } from "./oauth/tokens";
