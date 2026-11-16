import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveCenterContext } from "@/lib/integrations-center/server";
import {
  createSupabaseMuseGrantsSource,
  listMuseGrants,
  revokeMuseGrant,
} from "@/lib/muse-connector/grants";
import {
  createSupabaseMuseOAuthStore,
  recordMuseOAuthEvent,
} from "@/lib/muse-connector/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/muse/grants — lists the signed-in user's Muse OAuth
 * grants (client name, scopes, created/last-used, refresh expiry).
 * Never returns token values or hashes (the source selects no
 * token_hash column at all). Live Supabase session required (401
 * without one); Demo Mode refuses (503) — there are no real grants
 * in demo mode and the demo persona must never be served to Muse.
 *
 * DELETE /api/muse/grants — revokes one grant. Accepts
 * `?client_id=…` or a JSON body `{ "client_id": "…" }`.
 * POST with the same body is accepted as an alias (some clients
 * cannot send a DELETE body).
 */
export async function GET() {
  const ctx = await resolveCenterContext();
  if (!ctx.ok) return ctx.response;
  if (ctx.mode === "demo") {
    return NextResponse.json(
      { error: "Muse OAuth grants are unavailable in Demo Mode." },
      { status: 503 }
    );
  }
  if (!ctx.userId || !ctx.admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const grants = await listMuseGrants(ctx.userId, {
      source: createSupabaseMuseGrantsSource(ctx.admin),
    });
    return NextResponse.json({ mode: ctx.mode, grants });
  } catch (err) {
    console.error("[Muse] Grants list failed:", err);
    return NextResponse.json(
      { error: "Failed to list Muse OAuth grants." },
      { status: 500 }
    );
  }
}

async function revoke(req: Request) {
  const ctx = await resolveCenterContext();
  if (!ctx.ok) return ctx.response;
  if (ctx.mode === "demo") {
    return NextResponse.json(
      { error: "Muse OAuth grants are unavailable in Demo Mode." },
      { status: 503 }
    );
  }
  if (!ctx.userId || !ctx.admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  let clientId = url.searchParams.get("client_id") ?? "";
  if (!clientId) {
    const body = (await req.json().catch(() => null)) as { client_id?: unknown } | null;
    if (typeof body?.client_id === "string") clientId = body.client_id;
  }
  if (!clientId.trim()) {
    return NextResponse.json(
      { error: "client_id is required." },
      { status: 400 }
    );
  }
  try {
    const result = await revokeMuseGrant(clientId.trim(), ctx.userId, {
      source: createSupabaseMuseGrantsSource(ctx.admin),
      store: createSupabaseMuseOAuthStore(ctx.admin),
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: "No active Muse grant found for that client." },
        { status: 404 }
      );
    }
    const admin = createAdminClient();
    await recordMuseOAuthEvent({
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      action: "MUSE_OAUTH_GRANT_REVOKED",
      resource: `muse_oauth_client:${clientId.trim()}`,
      details: "Muse OAuth grant revoked by the user from the Integration Center.",
      admin: admin ?? undefined,
    }).catch(() => undefined);
    return NextResponse.json({ revoked: true, client_id: clientId.trim() });
  } catch (err) {
    console.error("[Muse] Grant revoke failed:", err);
    return NextResponse.json(
      { error: "Failed to revoke the Muse OAuth grant." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  return revoke(req);
}

export async function POST(req: Request) {
  return revoke(req);
}
