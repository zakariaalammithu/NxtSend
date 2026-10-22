/**
 * Shared helpers for the /api/admin/integration-hub/* routes (P7 Stage B).
 *
 * Every Hub route resolves the SAME gate (`resolveAdminGate`): demo →
 * labelled demo fixtures; live → the requireAdminApi ladder
 * (401 no session / 403 non-admin / 403 suspended / 503 no Supabase).
 * Errors from the service layer map to responses here — HubError keeps
 * its status; validation failures return 400 { error, fields }. Error
 * bodies NEVER contain credential values (service-layer messages are
 * value-free by construction).
 */
import { NextResponse } from "next/server";
import type { DataMode } from "@/lib/data/mode";
import { resolveAdminGate } from "@/lib/admin/platform-server";
import {
  HubError,
  HubValidationError,
  type HubActor,
} from "./hub-server";

export type HubGateResult =
  | { ok: true; mode: DataMode; actor: HubActor }
  | { ok: false; response: NextResponse };

export async function resolveHubGate(): Promise<HubGateResult> {
  const gate = await resolveAdminGate();
  if ("response" in gate) return { ok: false, response: gate.response };
  return {
    ok: true,
    mode: gate.mode,
    actor: {
      id: gate.caller?.id ?? null,
      email: gate.caller?.email ?? "demo-admin",
    },
  };
}

/** Parse a JSON request body; returns undefined when absent/invalid. */
export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export function hubJson(
  body: unknown,
  opts: { status?: number; noStore?: boolean } = {}
): NextResponse {
  const res = NextResponse.json(body, { status: opts.status ?? 200 });
  if (opts.noStore) res.headers.set("Cache-Control", "no-store");
  return res;
}

export function hubErrorResponse(err: unknown): NextResponse {
  if (err instanceof HubValidationError) {
    return hubJson(
      { error: "Validation failed", fields: err.fields },
      { status: 400, noStore: true }
    );
  }
  if (err instanceof HubError) {
    return hubJson({ error: err.message }, { status: err.status, noStore: true });
  }
  console.error("[IntegrationHub] Unexpected error:", err);
  return hubJson({ error: "Internal server error" }, { status: 500 });
}
