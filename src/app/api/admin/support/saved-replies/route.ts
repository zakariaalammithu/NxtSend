import { NextRequest } from "next/server";
import {
  createSupportSavedReply,
  listSupportSavedReplies,
} from "@/lib/support/admin-service";
import { readJsonBody, withSupportAdmin } from "@/lib/support/route-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/support/saved-replies — the reply template list.
 * POST — create a template. Templates are agent writing aids: when
 * one is used, its text is snapshotted into the sent message, so
 * editing a template never rewrites conversation history.
 */
export async function GET() {
  return withSupportAdmin(({ store, actor, permissions }) =>
    listSupportSavedReplies(store, actor, permissions)
  );
}

export async function POST(request: NextRequest) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  return withSupportAdmin(({ store, actor, permissions }) =>
    createSupportSavedReply(store, actor, permissions, parsed.value)
  );
}
