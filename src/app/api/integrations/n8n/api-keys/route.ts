/**
 * n8n API-key management — session-authenticated (the signed-in
 * user manages keys for their own workspace).
 *
 *  GET    /api/integrations/n8n/api-keys — list keys (public fields only)
 *  POST   /api/integrations/n8n/api-keys — create a key; body
 *         {name, scopes, expires_at?}; the key value is returned
 *         ONCE in this response and never again.
 *  DELETE /api/integrations/n8n/api-keys?id=… — revoke a key.
 *
 * Demo Mode refuses (503): demo data is never exposed to an
 * external integration, and demo has no session system. The key
 * value is never logged and `key_hash` is never returned.
 */

import { NextResponse } from "next/server";
import { resolveCenterContext } from "@/lib/integrations-center/server";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  type ApiKeyScope,
} from "@/lib/integrations/n8n/api-keys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const ctx = await resolveCenterContext();
  if (!ctx.ok) return ctx.response;
  if (ctx.mode === "demo") {
    return NextResponse.json(
      { error: "n8n API keys are unavailable in Demo Mode." },
      { status: 503 }
    );
  }
  if (!ctx.admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const keys = await listApiKeys(ctx.admin, ctx.workspaceId);
    return NextResponse.json({ keys, count: keys.length });
  } catch (err) {
    console.error("[NxtSend] n8n API-key list failed:", err);
    return NextResponse.json(
      { error: "Could not list API keys.", code: "internal_error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const ctx = await resolveCenterContext();
  if (!ctx.ok) return ctx.response;
  if (ctx.mode === "demo") {
    return NextResponse.json(
      { error: "n8n API keys are unavailable in Demo Mode." },
      { status: 503 }
    );
  }
  if (!ctx.admin || !ctx.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    const parsed = (await req.json()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const scopes = Array.isArray(body.scopes)
    ? (body.scopes as unknown[]).filter(
        (s): s is ApiKeyScope => s === "n8n.read" || s === "n8n.write"
      )
    : [];
  try {
    const created = await createApiKey(ctx.admin, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      name: typeof body.name === "string" ? body.name : "",
      scopes,
      expiresAt: typeof body.expires_at === "string" ? body.expires_at : null,
    });
    if (!created.ok) {
      return NextResponse.json(
        { error: created.error, code: created.code },
        { status: 400 }
      );
    }
    // The key value is returned exactly ONCE, here. Never log it.
    return NextResponse.json(
      {
        id: created.id,
        name: created.name,
        scopes: created.scopes,
        expires_at: created.expires_at,
        created_at: created.created_at,
        key: created.key,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[NxtSend] n8n API-key create failed:", err);
    return NextResponse.json(
      { error: "Could not create an API key.", code: "internal_error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const ctx = await resolveCenterContext();
  if (!ctx.ok) return ctx.response;
  if (ctx.mode === "demo") {
    return NextResponse.json(
      { error: "n8n API keys are unavailable in Demo Mode." },
      { status: 503 }
    );
  }
  if (!ctx.admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }
  try {
    const revoked = await revokeApiKey(ctx.admin, ctx.workspaceId, id);
    if (!revoked.ok) {
      return NextResponse.json(
        { error: "API key not found in this workspace.", code: "not_found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ id, revoked: true });
  } catch (err) {
    console.error("[NxtSend] n8n API-key revoke failed:", err);
    return NextResponse.json(
      { error: "Could not revoke the API key.", code: "internal_error" },
      { status: 500 }
    );
  }
}
