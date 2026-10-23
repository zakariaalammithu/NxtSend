import { NextRequest } from "next/server";
import {
  deleteSupportCategory,
  updateSupportCategory,
} from "@/lib/support/admin-service";
import { readJsonBody, withSupportAdmin } from "@/lib/support/route-helpers";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/support/knowledge/categories/[id] — rename,
 * enable/disable or reorder a category.
 * DELETE — remove a category (409 while entries still reference it).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  return withSupportAdmin(({ store, actor, permissions }) =>
    updateSupportCategory(store, actor, permissions, params.id, parsed.value)
  );
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withSupportAdmin(({ store, actor, permissions }) =>
    deleteSupportCategory(store, actor, permissions, params.id)
  );
}
