import { NextRequest } from "next/server";
import { createSupportCategory } from "@/lib/support/admin-service";
import { readJsonBody, withSupportAdmin } from "@/lib/support/route-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/support/knowledge/categories — the category list
 * (also included in GET /knowledge; this is the focused read).
 * POST — create a custom category. Categories are rows, not strings:
 * disabling a category removes all its entries from the answer
 * pipeline.
 */
export async function GET() {
  return withSupportAdmin(async ({ store, permissions }) => {
    if (!permissions.canAccessSupport) {
      return { status: 403, body: { error: "Forbidden: support permission required" } };
    }
    const categories = await store.listCategories();
    return { status: 200, body: { mode: store.mode, categories } };
  });
}

export async function POST(request: NextRequest) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  return withSupportAdmin(({ store, actor, permissions }) =>
    createSupportCategory(store, actor, permissions, parsed.value)
  );
}
