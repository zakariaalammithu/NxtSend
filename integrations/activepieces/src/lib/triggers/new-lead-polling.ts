/**
 * NxtSend piece.
 *
 * Build-verified 2026-11-19: tsc clean + runtime construct against
 * @activepieces/pieces-framework 0.32.0 (17 actions, 9 triggers,
 * OAuth2 auth). NOT installed in any Activepieces instance, NOT
 * submitted to Activepieces. Build with
 * `npm install && npm run build` (see README.md).
 *
 * No secrets in this file. Auth is OAuth 2.0 (src/auth.ts) against
 * NxtSend's shared authorization server; the client comes from the
 * one-time Dynamic Client Registration call.
 */
import { createTrigger, TriggerStrategy } from "@activepieces/pieces-framework";
import { HttpMethod } from "@activepieces/pieces-common";
import { nxtsendAuth } from "../../auth";
import { nxtsendRequest } from "../common";

export const newLeadPolling = createTrigger({
  auth: nxtsendAuth,
  name: "newLeadPolling",
  displayName: "New Lead (Polling)",
  description: "Polls GET /v1/leads on the flow schedule and emits leads newer than the last poll. Use when a webhook trigger is not wanted.",
  type: TriggerStrategy.POLLING,
  props: {},
  sampleData: {
    id: "lead_sample",
    email: "ada@example.com",
    first_name: "Ada",
    last_name: "Lovelace",
    company: "Example Ltd",
    status: "new",
    created_at: "2026-11-18T00:00:00.000Z",
  },
  async onEnable(context) {
    await context.store.put("lastCreatedAt", new Date().toISOString());
  },
  async onDisable(context) {
    await context.store.delete("lastCreatedAt");
  },
  async test(context) {
    const { auth } = context;
    const res = await nxtsendRequest<{ leads: Record<string, unknown>[] }>({
      accessToken: auth.access_token,
      method: HttpMethod.GET,
      path: "/leads",
      query: { limit: 5 },
    });
    return res.leads;
  },
  async run(context) {
    const { auth } = context;
    const after = await context.store.get<string>("lastCreatedAt");
    const res = await nxtsendRequest<{ leads: Record<string, unknown>[] }>({
      accessToken: auth.access_token,
      method: HttpMethod.GET,
      path: "/leads",
      query: { limit: 100, ...(after ? { after } : {}) },
    });
    if (res.leads.length > 0) {
      const latest = res.leads
        .map((l) => String(l.created_at ?? ""))
        .sort()
        .at(-1);
      if (latest) await context.store.put("lastCreatedAt", latest);
    }
    return res.leads;
  },
});
