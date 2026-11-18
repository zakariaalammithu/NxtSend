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

export const createCampaign = createAction({
  auth: nxtsendAuth,
  name: "createCampaign",
  displayName: "Create Campaign (Draft)",
  description: "Create a campaign — DRAFT ONLY. There is no launch action; launch stays dashboard-only.",
  props: {
    name: Property.ShortText({ displayName: "Campaign name", required: true }),
    type: Property.ShortText({ displayName: "Campaign type", required: false }),
  },
  async run(context) {
    const { auth, propsValue: props } = context;
    return nxtsendRequest({
      accessToken: auth.access_token,
      method: HttpMethod.POST,
      path: "/campaigns",
      
      body: { name: props.name, type: props.type },
    });
  },
});
