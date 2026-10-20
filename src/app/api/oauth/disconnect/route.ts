import { NextResponse } from "next/server";
import {
  resolveCenterContext,
  isWorkspaceAdminRole,
} from "@/lib/integrations-center/server";
import { disconnectOAuthConnection, OAuthFlowError } from "@/lib/oauth/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/oauth/disconnect  { connectionId }
 *
 * Disconnects one OAuth mailbox in the caller's workspace: the
 * stored (encrypted) grant is deleted and the connected_accounts
 * record is marked disconnected. Google grants are also revoked at
 * Google (best effort — the response reports whether revocation was
 * confirmed); Microsoft has no revocation endpoint for this flow,
 * so the local deletion is the disconnect and the response says so.
 *
 * Guards mirror Test Connection (a mutation-class action):
 * session + workspace in live mode, owner/admin role required.
 * Demo Mode has no connections — the route refuses honestly.
 */
export async function POST(req: Request) {
  const ctx = await resolveCenterContext();
  if (!ctx.ok) return ctx.response;

  if (ctx.mode === "demo") {
    return NextResponse.json(
      {
        error:
          "Demo Mode: no mailboxes are connected, so there is nothing to disconnect. Mailbox connections exist only in live mode (see SETUP.md §15).",
      },
      { status: 400 }
    );
  }
  if (!isWorkspaceAdminRole(ctx.workspaceRole)) {
    return NextResponse.json(
      {
        error:
          "Forbidden: disconnecting a mailbox requires a workspace owner or admin role.",
      },
      { status: 403 }
    );
  }
  if (!ctx.admin) {
    return NextResponse.json(
      { error: "The service-role client is not configured, so the stored grant cannot be deleted." },
      { status: 503 }
    );
  }

  let body: { connectionId?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const connectionId =
    typeof body.connectionId === "string" ? body.connectionId : "";
  if (!connectionId) {
    return NextResponse.json(
      { error: "A connectionId is required." },
      { status: 400 }
    );
  }

  try {
    const result = await disconnectOAuthConnection(
      { connectionId, workspaceId: ctx.workspaceId, userId: ctx.userId },
      { admin: ctx.admin }
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof OAuthFlowError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    console.error("[OAuth] disconnect failed:", err);
    return NextResponse.json(
      { error: "The disconnect failed on the server; the grant may still be stored. Try again." },
      { status: 500 }
    );
  }
}
