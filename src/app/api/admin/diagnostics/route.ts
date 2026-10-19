import { NextResponse } from "next/server";
import {
  getEnvPresence,
  resolveAdminGate,
} from "@/lib/admin/platform-server";
import { getDataMode } from "@/lib/data/mode";
import pkg from "../../../../../package.json";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/diagnostics — Admin → System → Development
 * Diagnostics. Build/runtime facts only: app version (package.json),
 * Node version, environment, data mode, process uptime, and the env
 * presence matrix (names + booleans — never values).
 */
export async function GET() {
  const gate = await resolveAdminGate();
  if ("response" in gate) return gate.response;

  return NextResponse.json({
    mode: gate.mode,
    app: {
      name: pkg.name,
      version: pkg.version,
    },
    runtime: {
      node: process.version,
      env: process.env.NODE_ENV ?? "development",
      uptime_seconds: Math.round(process.uptime()),
      platform: process.platform,
    },
    dataMode: getDataMode(),
    env: getEnvPresence(),
    generatedAt: new Date().toISOString(),
    notes: [
      "Route inventory lives in the build output (npm run build lists every route); it is not recomputed at runtime.",
      "Demo Mode is determined by Supabase env presence — see src/lib/data/mode.ts; this page reports the same value the data layer uses.",
    ],
  });
}
