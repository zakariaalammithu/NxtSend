import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/data/mode";
import { handleTranslateRequest } from "@/lib/ai/translate";

/**
 * POST /api/voice/translate
 *
 * Translates composer / transcript text between voice-catalogue
 * languages through the configured AI provider (same stack + state
 * honesty as /api/ai/draft): Demo Mode returns the labelled
 * "simulated" state with NO translation performed; no key returns
 * not_configured; live mode requires a session.
 */
export async function POST(req: Request) {
  const mode = getDataMode();
  let user: { id: string; status?: string } | null = null;

  if (mode !== "demo") {
    const supabase = await createServerClient();
    if (supabase) {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (authUser) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("status")
          .eq("id", authUser.id)
          .maybeSingle();
        user = {
          id: authUser.id,
          status: (profile?.status as string | undefined) ?? "active",
        };
      }
    }
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const result = await handleTranslateRequest({ mode, user, body });
  return NextResponse.json(result.body, { status: result.httpStatus });
}
