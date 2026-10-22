import {
  hubErrorResponse,
  hubJson,
  readJsonBody,
  resolveHubGate,
} from "@/lib/integration-hub/route-helpers";
import {
  createHubTestAccount,
  listHubTestAccounts,
} from "@/lib/integration-hub/hub-server";

export const dynamic = "force-dynamic";

interface Params {
  params: { slug: string };
}

/** GET …/integrations/[slug]/test-accounts — accounts (passwords are vault references only). */
export async function GET(_req: Request, { params }: Params) {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    return hubJson({
      test_accounts: await listHubTestAccounts(gate.mode, params.slug),
    });
  } catch (err) {
    return hubErrorResponse(err);
  }
}

/** POST …/integrations/[slug]/test-accounts — a password FIELD is rejected; use password_credential_id. */
export async function POST(req: Request, { params }: Params) {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    const test_account = await createHubTestAccount(
      gate.mode,
      gate.actor,
      params.slug,
      await readJsonBody(req)
    );
    return hubJson({ test_account }, { status: 201 });
  } catch (err) {
    return hubErrorResponse(err);
  }
}
