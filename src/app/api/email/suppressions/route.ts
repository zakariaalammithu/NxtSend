/**
 * Workspace suppression management — /api/email/suppressions
 *
 *  GET    → the workspace's suppression entries (newest first)
 *  POST   → add an address { email, reason } (idempotent)
 *  DELETE → remove an address { email } — re-enables sending
 *
 * Guards mirror the other workspace APIs (resolveCenterContext):
 * demo mode runs on the labelled demo workspace + demo store; live
 * mode requires a session, and every query runs through the SESSION
 * client so RLS ("suppression: members can manage") scopes rows to
 * the caller's own workspaces on top of the explicit workspace
 * filter. The send path (adapter + executor) reads the same table
 * and enforces it fail-closed — this route is only the management
 * surface, never the enforcement point.
 */

import { NextResponse } from "next/server";
import { resolveCenterContext } from "@/lib/integrations-center/server";
import { isValidEmailAddress } from "@/lib/data/inbox";
import { normalizeEmail } from "@/lib/email/suppression";
import {
  createDemoSuppressionStore,
  createSupabaseSuppressionStore,
  MANUAL_SUPPRESSION_REASONS,
  type SuppressionStore,
} from "@/lib/email/suppression-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveStore(): Promise<
  | { ok: true; store: SuppressionStore; workspaceId: string; mode: string }
  | { ok: false; response: NextResponse }
> {
  const ctx = await resolveCenterContext();
  if (!ctx.ok) return { ok: false, response: ctx.response };
  if (ctx.mode === "demo") {
    return {
      ok: true,
      store: createDemoSuppressionStore(),
      workspaceId: ctx.workspaceId,
      mode: ctx.mode,
    };
  }
  if (!ctx.supabase) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Database is not configured, so the suppression list is unavailable." },
        { status: 503 }
      ),
    };
  }
  return {
    ok: true,
    store: createSupabaseSuppressionStore(ctx.supabase),
    workspaceId: ctx.workspaceId,
    mode: ctx.mode,
  };
}

export async function GET(req: Request) {
  const resolved = await resolveStore();
  if (!resolved.ok) return resolved.response;
  const q = new URL(req.url).searchParams.get("q")?.trim().toLowerCase();
  try {
    let entries = await resolved.store.list(resolved.workspaceId);
    if (q) entries = entries.filter((e) => e.email.includes(q));
    return NextResponse.json({ entries, mode: resolved.mode });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load the suppression list." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const resolved = await resolveStore();
  if (!resolved.ok) return resolved.response;
  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown;
    reason?: unknown;
  };
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  if (!email || !isValidEmailAddress(email)) {
    return NextResponse.json(
      { error: "A valid email address is required." },
      { status: 400 }
    );
  }
  const reason =
    typeof body.reason === "string" &&
    (MANUAL_SUPPRESSION_REASONS as readonly string[]).includes(body.reason)
      ? body.reason
      : "manual block";
  try {
    const { entry, created } = await resolved.store.add(
      resolved.workspaceId,
      email,
      reason
    );
    return NextResponse.json({ entry, created }, { status: created ? 201 : 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add the suppression." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const resolved = await resolveStore();
  if (!resolved.ok) return resolved.response;
  const fromQuery = new URL(req.url).searchParams.get("email");
  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const raw =
    typeof body.email === "string" ? body.email : (fromQuery ?? "");
  const email = normalizeEmail(raw);
  if (!email || !isValidEmailAddress(email)) {
    return NextResponse.json(
      { error: "A valid email address is required." },
      { status: 400 }
    );
  }
  try {
    const removed = await resolved.store.remove(resolved.workspaceId, email);
    return NextResponse.json({ removed, email });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove the suppression." },
      { status: 500 }
    );
  }
}
