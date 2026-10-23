/**
 * Support route helpers (P10 Stage E) — shared by /api/support/* and
 * /api/admin/support/* route files: body parsing with a size cap,
 * store acquisition with honest failure mapping, and admin audit
 * mirroring. Logs record IDs/statuses only — never message bodies,
 * guest tokens or emails.
 */

import { NextRequest, NextResponse } from "next/server";
import { recordAdminAudit, resolveAdminGate } from "@/lib/admin/platform-server";
import {
  resolveSupportActor,
  type AdminServiceResult,
} from "./admin-service";
import type { SupportPermissions, SupportActor } from "./permissions";
import { getSupportStore, SupportStoreUnavailableError, type SupportStore } from "./store";

export const SUPPORT_BODY_LIMIT_BYTES = 64 * 1024;

export function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function readJsonBody(
  request: NextRequest
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  const text = await request.text();
  if (text.length > SUPPORT_BODY_LIMIT_BYTES) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Request body too large" }, { status: 413 }),
    };
  }
  if (!text.trim()) return { ok: true, value: {} };
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
      };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }
}

export function rateLimited(): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    { status: 429 }
  );
}

/** Run a public-route handler with the store, mapping store failures honestly. */
export async function withSupportStore(
  handler: (store: SupportStore) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const store = await getSupportStore();
    return await handler(store);
  } catch (err) {
    if (err instanceof SupportStoreUnavailableError) {
      return NextResponse.json(
        { error: "Support is not available right now." },
        { status: 503 }
      );
    }
    console.error("[Support] request failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export interface SupportAdminContext {
  store: SupportStore;
  actor: SupportActor;
  permissions: SupportPermissions;
  mode: "demo" | "supabase";
}

/** Run an admin-route handler behind the admin gate + actor resolution. */
export async function withSupportAdmin(
  handler: (ctx: SupportAdminContext) => Promise<AdminServiceResult>
): Promise<NextResponse> {
  const gate = await resolveAdminGate();
  if ("response" in gate) return gate.response;
  try {
    const store = await getSupportStore();
    const { actor, permissions } = await resolveSupportActor(gate, store);
    const result = await handler({ store, actor, permissions, mode: gate.mode });

    const audits = result.audits ?? (result.audit ? [result.audit] : []);
    for (const audit of audits) {
      await recordAdminAudit({
        mode: gate.mode,
        actorId: gate.mode === "demo" ? null : actor.profileId,
        actorEmail: actor.email,
        action: audit.action,
        resource: audit.resource,
        details: audit.details,
      });
    }
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    if (err instanceof SupportStoreUnavailableError) {
      return NextResponse.json(
        { error: "Support is not available right now." },
        { status: 503 }
      );
    }
    console.error("[Support Admin] request failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
