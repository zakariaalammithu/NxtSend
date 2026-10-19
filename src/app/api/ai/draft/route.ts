import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/data/mode";
import { handleDraftRequest } from "@/lib/ai/handler";

/**
 * POST /api/ai/draft
 *
 * "Draft outreach message" — the one wired AI feature. Returns a draft
 * for mandatory human review in the sequence editor; it never sends
 * anything. In Demo Mode it returns a clearly labelled local sample;
 * with a live session but no AI key it returns the honest
 * not_configured state for the UI to display.
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

  const result = await handleDraftRequest({ mode, user, body });
  return NextResponse.json(result.body, { status: result.status });
}
