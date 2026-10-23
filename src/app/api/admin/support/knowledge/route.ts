import { NextRequest } from "next/server";
import {
  createSupportKnowledge,
  listSupportKnowledge,
} from "@/lib/support/admin-service";
import { readJsonBody, withSupportAdmin } from "@/lib/support/route-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/support/knowledge — all KB entries + categories
 * (admin view: drafts and disabled entries included, with their
 * indexing state).
 *
 * POST — create an entry. The write path re-indexes in the same
 * operation (search_text / content_hash / indexed_at), so a
 * published + enabled entry is answerable immediately — there is no
 * separate indexing step to drift. An exact duplicate question
 * (normalised) is rejected 409; a near-duplicate returns a warning.
 */
export async function GET() {
  return withSupportAdmin(({ store, actor, permissions }) =>
    listSupportKnowledge(store, actor, permissions)
  );
}

export async function POST(request: NextRequest) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  return withSupportAdmin(({ store, actor, permissions }) =>
    createSupportKnowledge(store, actor, permissions, parsed.value)
  );
}
