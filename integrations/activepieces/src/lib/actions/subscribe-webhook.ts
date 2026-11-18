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
import { createAction, Property } from "@activepieces/pieces-framework";
import { HttpMethod } from "@activepieces/pieces-common";
import { nxtsendAuth } from "../../auth";
import { nxtsendRequest } from "../common";

export const subscribeWebhook = createAction({
  auth: nxtsendAuth,
  name: "subscribeWebhook",
  displayName: "Subscribe Webhook",
  description: "Subscribe a URL to one of the 8 NxtSend events. Returns {id, event, target_url}; the HMAC secret is server-side only.",
  props: {
    event: Property.StaticDropdown({ displayName: "Event", required: true, options: { options: [
      { label: "Lead created", value: "lead.created" },
      { label: "Lead updated", value: "lead.updated" },
      { label: "Lead added to campaign", value: "lead.added_to_campaign" },
      { label: "Lead removed from campaign", value: "lead.removed_from_campaign" },
      { label: "Campaign created", value: "campaign.created" },
      { label: "Campaign status changed", value: "campaign.status_changed" },
      { label: "New inbox reply", value: "conversation.reply_created" },
      { label: "Subscription changed", value: "subscription.changed" },
    ] } }),
    target_url: Property.ShortText({ displayName: "Target URL (webhook URL)", required: true }),
  },
  async run(context) {
    const { auth, propsValue: props } = context;
    return nxtsendRequest({
      accessToken: auth.access_token,
      method: HttpMethod.POST,
      path: "/webhooks/subscribe",
      
      body: { event: props.event, target_url: props.target_url },
    });
  },
});
