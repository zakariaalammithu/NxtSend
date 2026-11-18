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

export const campaignCreated = createTrigger({
  auth: nxtsendAuth,
  name: "campaignCreated",
  displayName: "Campaign Created",
  description: "Triggers when a campaign is created in NxtSend.",
  type: TriggerStrategy.WEBHOOK,
  props: {},
  sampleData: {
    id: "evt_sample",
    type: "campaign.created",
    created_at: "2026-11-18T00:00:00.000Z",
    workspace_id: "ws_sample",
    data: {
      id: "lead_sample",
      email: "ada@example.com",
      first_name: "Ada",
      last_name: "Lovelace",
      company: "Example Ltd",
      status: "new",
      created_at: "2026-11-18T00:00:00.000Z",
    },
  },
  async onEnable(context) {
    const { auth } = context;
    const sub = await nxtsendRequest<{ id: string }>({
      accessToken: auth.access_token,
      method: HttpMethod.POST,
      path: "/webhooks/subscribe",
      body: { event: "campaign.created", target_url: context.webhookUrl },
    });
    await context.store.put("subscriptionId", sub.id);
  },
  async onDisable(context) {
    const { auth } = context;
    const id = await context.store.get<string>("subscriptionId");
    if (!id) return;
    await nxtsendRequest({
      accessToken: auth.access_token,
      method: HttpMethod.POST,
      path: "/webhooks/unsubscribe",
      body: { id },
    });
  },
  async run(context) {
    return [context.payload.body];
  },
});
