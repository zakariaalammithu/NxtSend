import { NextRequest } from "next/server";
import {
  deleteSupportSavedReply,
  updateSupportSavedReply,
} from "@/lib/support/admin-service";
import { readJsonBody, withSupportAdmin } from "@/lib/support/route-helpers";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/support/saved-replies/[id] — edit a template
 * (affects only FUTURE sends; sent messages keep their snapshot).
 * DELETE — remove a template.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  return withSupportAdmin(({ store, actor, permissions }) =>
    updateSupportSavedReply(store, actor, permissions, params.id, parsed.value)
  );
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withSupportAdmin(({ store, actor, permissions }) =>
    deleteSupportSavedReply(store, actor, permissions, params.id)
  );
}
