import { NextRequest } from "next/server";
import {
  deleteSupportKnowledge,
  updateSupportKnowledge,
} from "@/lib/support/admin-service";
import { readJsonBody, withSupportAdmin } from "@/lib/support/route-helpers";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/support/knowledge/[id] — edit an entry (partial).
 * Every save re-indexes in the same operation; disabling or
 * unpublishing removes the entry from the answer pipeline
 * immediately.
 * DELETE — remove the entry.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  return withSupportAdmin(({ store, actor, permissions }) =>
    updateSupportKnowledge(store, actor, permissions, params.id, parsed.value)
  );
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withSupportAdmin(({ store, actor, permissions }) =>
    deleteSupportKnowledge(store, actor, permissions, params.id)
  );
}
